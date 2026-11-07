#!/usr/bin/env python3
"""Train Lucky Cat's network (js/mahjong-lucky-cat-net.js) on the moves of
the hands it won (node scripts/ml/lucky.js generate), and export it.

  ml/.venv/bin/python ml/train_lucky.py --data ml/data/lc1 --name lc1 --init ml/models/lc0.json

Each sample is one move from a hand the learner won: the features, the move
it made, the moves that were legal, and a weight (more for a quicker win).
Training makes those moves more likely, among the legal ones: a weighted
cross-entropy over a softmax of the legal moves' logits, with a little label
smoothing so every legal move keeps some chance and the next round still
explores.

Since lc29, data also holds the move that dealt in from each hand the learner
lost that way, with weight -1. With --neg-weight above 0, training pushes
those moves down (an unlikelihood term, -log(1 - p), times that weight);
otherwise it leaves them out, so older arms train as before.

The network is the one the JS runs: fully connected layers with ReLU, and 74
raw outputs (34 discards, 34 kongs, then pass, three chows, pung, kong).
A model from --init whose meta says random (the first, all-zero model)
starts from fresh random weights instead: zero weights can't learn.

Points first (--mode pg or awr): the lab's Lucky Cat learns from every hand
it played, won or lost (node scripts/ml/lucky.js generate --returns), to
score more points. Each sample also has the points its seat scored in the
hand, how the hand ended for it, the share the move was played with, and
the hand it came from. Then:

  1. The reward is the hand's points (clipped at --reward-clip, so one limit
     hand can't swamp a round), plus --win-bonus points for a win: points
     first, a win counts for a little.
  2. A critic (a value network, trained here and not shipped) learns the
     points a position is worth on average. It is fitted on half the hands
     and scores the other half, and the other way round, so it never scores
     a hand it learned from. A move's advantage is the hand's reward less
     the critic's value of the position: whether the move did better than
     usual from there, not whether the hand happened to be good.
  3. pg: a clipped policy-gradient step (PPO): moves with a positive
     advantage get more likely and moves with a negative one less, with the
     change in each move's share against the share it was played with
     clipped at 1 +/- --clip, and a bonus for keeping some spread over the
     legal moves (--entropy). Training stops early once the policy has moved
     --kl-max (KL divergence) from the champion's.
     awr: advantage-weighted imitation: every move is imitated with weight
     exp(advantage / --beta), at most 20, so better-than-usual moves teach
     the most and the worst teach almost nothing.

The shares are read at the temperature the data was played at, so the
champion's own data starts at a ratio of 1.

Writes ml/models/<name>.json (float16 base64) and checks the JS model gives
the same outputs.
"""

import argparse
import base64
import json
import os
import subprocess
import time

import numpy as np
import torch
import torch.nn as nn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUTS = 74
HIDDEN = [256, 128]


def load(dirs, returns=False):
    xs, acts, legal, ws = [], [], [], []
    rs, ps, os_, hs, ts = [], [], [], [], []
    size = version = None
    for di, d in enumerate(dirs):
        meta = json.load(open(os.path.join(ROOT, d, 'meta.json')))
        size, version = meta['featureSize'], meta['featureVersion']
        if returns and not meta.get('returns'):
            raise SystemExit(d + ' has no returns (generate it with --returns)')
        temp = float((meta.get('job') or {}).get('temperature') or 1)
        for f in sorted(os.listdir(os.path.join(ROOT, d))):
            if not f.endswith('.a.u1'):
                continue
            base = os.path.join(ROOT, d, f[:-5])
            a = np.fromfile(base + '.a.u1', dtype=np.uint8)
            if not len(a):
                continue
            acts.append(a)
            xs.append(np.fromfile(base + '.x.f16', dtype='<f2').reshape(-1, size))
            m = np.unpackbits(np.fromfile(base + '.m.u1', dtype=np.uint8).reshape(-1, 10), axis=1, bitorder='little')[:, :OUTPUTS]
            legal.append(m.astype(bool))
            ws.append(np.fromfile(base + '.w.f4', dtype='<f4'))
            if returns:
                rs.append(np.fromfile(base + '.r.f4', dtype='<f4'))
                ps.append(np.fromfile(base + '.p.f4', dtype='<f4'))
                os_.append(np.fromfile(base + '.o.u1', dtype=np.uint8))
                # A hand id unique across shards and data sets.
                shard = int(f.split('-')[1].split('.')[0])
                hs.append(np.fromfile(base + '.h.u4', dtype='<u4').astype(np.int64) + (di * 1000 + shard) * (1 << 32))
                ts.append(np.full(len(a), temp, dtype=np.float32))
    out = [np.concatenate(xs), np.concatenate(acts).astype(np.int64), np.concatenate(legal), np.concatenate(ws), size, version]
    if returns:
        out.append({'r': np.concatenate(rs), 'p': np.concatenate(ps), 'o': np.concatenate(os_), 'h': np.concatenate(hs), 't': np.concatenate(ts)})
    return out


class Net(nn.Module):
    def __init__(self, size, dropout, hidden=None):
        super().__init__()
        sizes = [size] + (hidden or HIDDEN) + [OUTPUTS]
        self.layers = nn.ModuleList([nn.Linear(sizes[i], sizes[i + 1]) for i in range(len(sizes) - 1)])
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        for i, l in enumerate(self.layers):
            x = l(x)
            if i < len(self.layers) - 1:
                x = self.drop(torch.relu(x))
        return x


class Critic(nn.Module):
    def __init__(self, size):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(size, 256), nn.ReLU(), nn.Linear(256, 128), nn.ReLU(), nn.Linear(128, 1))

    def forward(self, x):
        return self.net(x)[:, 0]


def fit_critic(X, R, train_idx, score_idx, dev, epochs, rng):
    """A value network fitted on train_idx; returns its values on score_idx."""
    torch.manual_seed(int(rng.integers(1 << 30)))
    c = Critic(X.shape[1]).to(dev)
    opt = torch.optim.AdamW(c.parameters(), lr=1e-3, weight_decay=1e-4)
    for _ in range(epochs):
        perm = rng.permutation(train_idx)
        for s in range(0, len(perm), 2048):
            idx = torch.from_numpy(perm[s:s + 2048])
            loss = nn.functional.smooth_l1_loss(c(X[idx].to(dev)), R[idx].to(dev))
            opt.zero_grad()
            loss.backward()
            opt.step()
    c.eval()
    out = np.zeros(len(score_idx), dtype=np.float32)
    with torch.no_grad():
        for s in range(0, len(score_idx), 16384):
            idx = torch.from_numpy(score_idx[s:s + 16384])
            out[s:s + len(idx)] = c(X[idx].to(dev)).cpu().numpy()
    return out


def floats(v, dtype):
    if isinstance(v, str):
        return np.frombuffer(base64.b64decode(v), dtype='<f2' if dtype == 'f16' else '<f4').astype(np.float32)
    return np.asarray(v, dtype=np.float32)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr, dtype='<f2').tobytes()).decode('ascii')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', nargs='+', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--init')
    ap.add_argument('--epochs', type=int, default=6)
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--batch', type=int, default=1024)
    ap.add_argument('--dropout', type=float, default=0.1)
    ap.add_argument('--weight-decay', type=float, default=1e-4)
    ap.add_argument('--smoothing', type=float, default=0.05)
    # Points first (data from lucky.js generate --returns).
    ap.add_argument('--mode', choices=['imitate', 'pg', 'awr'], default='imitate')
    ap.add_argument('--reward', choices=['points', 'sqrt'], default='points', help='the hand\'s points, or their signed square root')
    ap.add_argument('--reward-clip', type=float, default=4000)
    ap.add_argument('--win-bonus', type=float, default=0, help='points added to the reward of a hand won')
    ap.add_argument('--critic-epochs', type=int, default=3)
    ap.add_argument('--clip', type=float, default=0.2)
    ap.add_argument('--entropy', type=float, default=0.003)
    ap.add_argument('--kl-max', type=float, default=0.03)
    ap.add_argument('--beta', type=float, default=1.0)
    ap.add_argument('--neg-weight', type=float, default=0.0)
    ap.add_argument('--hidden', help='hidden layer sizes, e.g. 512,256 (a new network: --init is ignored)')
    args = ap.parse_args()
    hidden = [int(v) for v in args.hidden.split(',')] if args.hidden else None
    # A fine-tune keeps the shape of the model it starts from (lc30 and on
    # can be wider than the original 256, 128).
    init_hidden = None
    if args.init and not hidden:
        src = json.load(open(os.path.join(ROOT, args.init)))
        if not (src.get('meta') or {}).get('random'):
            init_hidden = [l['rows'] for l in src['layers'][:-1]]

    t0 = time.time()
    rl = args.mode != 'imitate'
    loaded = load(args.data, rl)
    x, a, legal, w, size, version = loaded[:6]
    neg = w < 0
    if (rl or args.neg_weight <= 0) and neg.any():
        # Points first has no separate deal-in rows (every move carries its hand's points).
        keep = ~neg
        x, a, legal, w = x[keep], a[keep], legal[keep], w[keep]
        neg = w < 0
    n = len(a)
    print(f'{n} samples from {len(args.data)} rounds ({x.shape[1]} features), {int(neg.sum())} of them deal-ins')
    torch.manual_seed(1)
    dev = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'training on {dev}' + (f' ({torch.cuda.get_device_name(0)})' if dev == 'cuda' else ''))
    net = Net(size, args.dropout, hidden or init_hidden)
    if args.init and hidden:
        print('a new ' + args.hidden + ' network: --init ' + args.init + ' ignored')
        with torch.no_grad():
            net.layers[-1].weight.mul_(0.1)
            net.layers[-1].bias.zero_()
    elif args.init:
        init = json.load(open(os.path.join(ROOT, args.init)))
        if not (init.get('meta') or {}).get('random'):
            with torch.no_grad():
                for l, src in zip(net.layers, init['layers']):
                    l.weight.copy_(torch.from_numpy(floats(src['w'], init.get('dtype')).reshape(src['rows'], src['cols'])))
                    l.bias.copy_(torch.from_numpy(floats(src['b'], init.get('dtype'))))
            print('from ' + args.init)
        else:
            # Small last layer: the new model starts close to random moves.
            with torch.no_grad():
                net.layers[-1].weight.mul_(0.1)
                net.layers[-1].bias.zero_()
            print('from fresh weights (the start model plays at random)')
    net.to(dev)

    rng = np.random.default_rng(1)
    if rl:
        # Hold out whole hands: a tenth of them.
        ret = loaded[6]
        hands, inv = np.unique(ret['h'], return_inverse=True)
        held = rng.random(len(hands)) < 0.1
        va, tr = np.nonzero(held[inv])[0], np.nonzero(~held[inv])[0]
        nv = len(va)
    else:
        order = rng.permutation(n)
        nv = max(1, n // 10)
        va, tr = order[:nv], order[nv:]
    X = torch.from_numpy(x.astype(np.float32))
    A = torch.from_numpy(a)
    Lg = torch.from_numpy(legal)
    W = torch.from_numpy(w.astype(np.float32))
    Neg = W < 0
    # Wins keep their mean weight of 1; each deal-in counts --neg-weight.
    W = torch.where(Neg, torch.full_like(W, args.neg_weight), W / W[~Neg].mean())
    rl_stats = {}
    if rl:
        r = np.clip(ret['r'], -args.reward_clip, args.reward_clip) + args.win_bonus * (ret['o'] == 0)
        if args.reward == 'sqrt':
            r = np.sign(r) * np.sqrt(np.abs(r))
        scale = float(r.std()) or 1.0
        R = torch.from_numpy((r / scale).astype(np.float32))
        # The critic, cross-fitted: each half of the hands is scored by a critic that never saw it.
        fold = rng.random(len(hands)) < 0.5
        f = fold[inv]
        one, two = np.nonzero(f)[0], np.nonzero(~f)[0]
        v = np.zeros(n, dtype=np.float32)
        v[two] = fit_critic(X, R, one, two, dev, args.critic_epochs, rng)
        v[one] = fit_critic(X, R, two, one, dev, args.critic_epochs, rng)
        adv = R.numpy() - v
        explained = 1 - float(np.var(adv)) / max(1e-9, float(np.var(R.numpy())))
        adv = np.clip((adv - adv.mean()) / (adv.std() + 1e-8), -5, 5)
        ADV = torch.from_numpy(adv.astype(np.float32))
        LOGB = torch.from_numpy(np.log(np.clip(ret['p'], 1e-6, 1)).astype(np.float32))
        TEMP = torch.from_numpy(ret['t'])
        rl_stats = {'hands': int(len(hands)), 'rewardScale': scale, 'criticExplained': explained,
                    'meanPoints': float(ret['r'].mean())}
        print(f'{len(hands)} hands, reward scale {scale:.1f}, the critic explains {100 * explained:.1f}% of the reward\'s variance')
        ref = Net(size, 0.0, hidden or init_hidden).to(dev)
        ref.load_state_dict(net.state_dict())
        ref.eval()

    def loss_of(idx, train):
        xb, ab, lb, wb, nb = X[idx].to(dev), A[idx].to(dev), Lg[idx].to(dev), W[idx].to(dev), Neg[idx].to(dev)
        logits = net(xb).masked_fill(~lb, -1e9)
        logp = torch.log_softmax(logits, dim=1)
        lp = logp.gather(1, ab[:, None])[:, 0]
        nll = -lp
        # Smoothing: a share of the target spread over every legal move.
        k = lb.sum(1).clamp(min=1)
        uniform = -(logp.masked_fill(~lb, 0).sum(1)) / k
        per = (1 - args.smoothing) * nll + args.smoothing * uniform
        # A deal-in: make that move less likely, -log(1 - p).
        unlikely = -torch.log1p(-lp.exp().clamp(max=1 - 1e-6))
        per = torch.where(nb, unlikely, per)
        pos = (~nb).float()
        acc = ((logits.argmax(1) == ab).float() * pos).sum() / pos.sum().clamp(min=1)
        return (per * wb).mean(), acc

    def rl_loss(idx):
        xb, ab, lb = X[idx].to(dev), A[idx].to(dev), Lg[idx].to(dev)
        advb, logb, tb = ADV[idx].to(dev), LOGB[idx].to(dev), TEMP[idx].to(dev)
        logits = net(xb).masked_fill(~lb, -1e9)
        logp = torch.log_softmax(logits / tb[:, None], dim=1)
        lpa = logp.gather(1, ab[:, None])[:, 0]
        ent = -(logp.exp() * logp.masked_fill(~lb, 0)).sum(1)
        if args.mode == 'pg':
            ratio = torch.exp(lpa - logb)
            surr = torch.min(ratio * advb, torch.clamp(ratio, 1 - args.clip, 1 + args.clip) * advb)
        else:
            surr = torch.clamp(torch.exp(advb / args.beta), max=20.0) * lpa
        loss = -surr.mean() - args.entropy * ent.mean()
        with torch.no_grad():
            rlog = torch.log_softmax(ref(xb).masked_fill(~lb, -1e9) / tb[:, None], dim=1)
            kl = (rlog.exp() * (rlog - logp).masked_fill(~lb, 0)).sum(1).mean()
        return loss, surr.mean(), kl, ent.mean()

    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    best, best_state = float('inf'), None
    if rl:
        # Fixed epochs, stopping once the policy has moved too far from the champion's.
        best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
        best = 0.0
        for ep in range(args.epochs):
            net.train()
            perm = torch.from_numpy(rng.permutation(tr))
            for s in range(0, len(perm), args.batch):
                loss = rl_loss(perm[s:s + args.batch])[0]
                opt.zero_grad()
                loss.backward()
                opt.step()
            net.eval()
            with torch.no_grad():
                sv = kv = ev = 0.0
                cnt = 0
                for s in range(0, nv, 8192):
                    idx = torch.from_numpy(va[s:s + 8192])
                    _, su, kl, en = rl_loss(idx)
                    sv += su.item() * len(idx)
                    kv += kl.item() * len(idx)
                    ev += en.item() * len(idx)
                    cnt += len(idx)
            sv /= cnt
            kv /= cnt
            ev /= cnt
            print(f'epoch {ep + 1}: held-out surrogate {sv:.4f}, KL from the champion {kv:.4f}, entropy {ev:.3f}')
            if kv > 2 * args.kl_max and ep > 0:
                print(f'stopping: the policy moved more than {2 * args.kl_max} from the champion, keeping epoch {ep}')
                break
            best = sv
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
            rl_stats.update({'epochs': ep + 1, 'kl': kv, 'heldOutEntropy': ev, 'surrogate': sv})
            if kv > args.kl_max:
                print(f'stopping: the policy moved {kv:.4f} from the champion')
                break
    for ep in range(0 if rl else args.epochs):
        net.train()
        perm = torch.from_numpy(rng.permutation(tr))
        for s in range(0, len(perm), args.batch):
            loss, _ = loss_of(perm[s:s + args.batch], True)
            opt.zero_grad()
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            vl, vacc, cnt = 0.0, 0.0, 0
            for s in range(0, nv, 8192):
                idx = torch.from_numpy(va[s:s + 8192])
                l_, ac = loss_of(idx, False)
                vl += l_.item() * len(idx); vacc += ac.item() * len(idx); cnt += len(idx)
        vl /= cnt; vacc /= cnt
        print(f'epoch {ep + 1}: validation loss {vl:.4f}, picks the move it won with {100 * vacc:.1f}%')
        if vl < best:
            best = vl
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)
    net.cpu().eval()

    layers = []
    for l in net.layers:
        layers.append({'rows': l.out_features, 'cols': l.in_features, 'w': b64(l.weight.detach().numpy()), 'b': b64(l.bias.detach().numpy())})
    meta = {'name': args.name, 'trainedAt': time.strftime('%Y-%m-%d %H:%M'), 'samples': int(n), 'data': args.data,
            'init': None if hidden else args.init, 'validationLoss': best, 'negWeight': args.neg_weight,
            'hidden': hidden or init_hidden or HIDDEN}
    if rl:
        meta['objective'] = 'points'
        meta['train'] = dict({'mode': args.mode, 'reward': args.reward, 'rewardClip': args.reward_clip, 'winBonus': args.win_bonus,
                              'lr': args.lr, 'clip': args.clip, 'entropy': args.entropy, 'klMax': args.kl_max, 'beta': args.beta}, **rl_stats)
    out = {'featureVersion': version, 'featureSize': size, 'dtype': 'f16', 'meta': meta, 'layers': layers}
    os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
    path = os.path.join(ROOT, 'ml', 'models', args.name + '.json')
    json.dump(out, open(path, 'w'))

    # The JS model must give the same logits (to float16 rounding).
    probe = x[va[:8]].astype(np.float32)
    with torch.no_grad():
        want = net(torch.from_numpy(probe)).numpy()
    js = ("const N=require(process.argv[1]+'/js/mahjong-lucky-cat-net.js');const m=N.createModel(require(process.argv[2]));"
          "const xs=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(xs.map(x=>m.forward(Float32Array.from(x)))));")
    got = np.array(json.loads(subprocess.run(['node', '-e', js, ROOT, path], input=json.dumps(probe.tolist()),
                                             capture_output=True, text=True, check=True).stdout))
    err = float(np.abs(got - want).max())
    print(f'JS check: largest difference {err:.4f}')
    if err > 0.05 * max(1.0, float(np.abs(want).max())):
        raise SystemExit('the JS model disagrees with the trained one')
    print(f'wrote {path} in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
