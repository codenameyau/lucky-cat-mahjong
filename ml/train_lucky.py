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

Move by move (--mode q): data from lucky.js generate --rollouts, where
some of the champion's choices were played again with its next-best moves
forced, on the same deal. Each row has the moves tried and the points each
scored. A move's advantage is its points less the points of the move the
champion played (clipped at --reward-clip); moves not tried count as the
worst one tried, and no better than the champion's. The target for each
choice is the champion's shares times exp(advantage / --tau), and training
fits the network to it (cross-entropy): moves that scored more on the same
wall get more of the share, by an amount --tau sets, so the new model stays
close to the champion where the replays say little.

Suphx (Li et al. 2020, arXiv:2003.13590), with data from lucky.js generate
--oracle, whose rows also hold the hidden tiles (scripts/ml/oracle.js):

  --oracle-critic    the critic also reads the hidden tiles (training only),
                     so it explains far more of a hand's points and each
                     move's advantage is far less luck. The policy still
                     reads only the seat's view.
  --oracle-delta D   oracle guiding: the policy reads the hidden tiles too,
                     each input kept with chance D. --oracle-anneal A,B
                     lowers it from A to B over the epochs (Suphx drops the
                     oracle inputs gradually, until the agent plays on its
                     own view). Its model keeps the extra columns, marked
                     meta.oracle, for lucky.js to play while training; it
                     can't ship.
  --public           writes the model without the hidden tiles' columns:
                     the normal agent, after the oracle is gone (delta 0).
                     An oracle --init is sliced the same way, and a public
                     --init starts an oracle model with those columns at 0,
                     so it starts by playing exactly as the public model.
  --reject-ratio R   Suphx's normal-agent stage: drops the moves whose share
                     now is more than R times (or less than 1/R of) the
                     share they were played with, since the data was played
                     by the oracle.
  --target-entropy H adjusts the entropy bonus as it trains to keep the
                     policy's entropy near H (Suphx's adaptive entropy).
  --mode oracle      an oracle teacher, distilled: at every recorded choice
                     the data knows what each discard would pay right now
                     (a player who can win on it). The teacher is the
                     champion's shares times exp(-points paid / --danger-tau),
                     so a discard that deals in loses its share by what it
                     would cost, and the network (reading only the seat's
                     view, unless --oracle-delta) is fitted to it. The best
                     it can do from its own view is to read how likely each
                     tile is to deal in, choice by choice, with none of the
                     hand's luck. Choices with a discard that would deal in
                     count --danger-weight times.

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
# The seat's own features per row (the rest, with --oracle data, are the hidden tiles).
PUBLIC = [None]
# Where the danger row (each discard's points paid now) starts in an --oracle row.
DANGER_AT = [None]
CRITIC_LOSS = ['mse']
# Where the hidden tiles start in an --oracle row, and each opponent's block (scripts/ml/oracle.js).
ORACLE_AT = [None]
PER = [69]
# The auxiliary heads (frontier plan, phase 1): the hidden tiles as targets, never inputs.
#   waits 3 x 34, ready 3, steps 3, wall 34, deal-in 34 (each held tile would deal in now)
AUX = 3 * 34 + 3 + 3 + 34 + 34


def load_q(dirs):
    xs, legal, qa, q, hs = [], [], [], [], []
    size = version = None
    for di, d in enumerate(dirs):
        meta = json.load(open(os.path.join(ROOT, d, 'meta.json')))
        size, version = meta['featureSize'], meta['featureVersion']
        if not meta.get('rollouts'):
            raise SystemExit(d + ' has no rollouts (generate it with --rollouts)')
        slots = meta['rollouts']['slots']
        for f in sorted(os.listdir(os.path.join(ROOT, d))):
            if not f.endswith('.qa.u1'):
                continue
            base = os.path.join(ROOT, d, f[:-6])
            t = np.fromfile(base + '.qa.u1', dtype=np.uint8).reshape(-1, slots)
            if not len(t):
                continue
            # Four slots whatever the data had: the move played and up to three tried.
            qa.append(np.concatenate([t, np.full((len(t), 4), 255, dtype=np.uint8)], axis=1)[:, :4])
            qv = np.fromfile(base + '.q.f4', dtype='<f4').reshape(-1, slots)
            q.append(np.concatenate([qv, np.zeros((len(t), 4), np.float32)], axis=1)[:, :4])
            xs.append(np.fromfile(base + '.x.f16', dtype='<f2').reshape(-1, size))
            m = np.unpackbits(np.fromfile(base + '.m.u1', dtype=np.uint8).reshape(-1, 10), axis=1, bitorder='little')[:, :OUTPUTS]
            legal.append(m.astype(bool))
            shard = int(f.split('-')[1].split('.')[0])
            hs.append(np.fromfile(base + '.h.u4', dtype='<u4').astype(np.int64) + (di * 1000 + shard) * (1 << 32))
    return np.concatenate(xs), np.concatenate(legal), np.concatenate(qa), np.concatenate(q), np.concatenate(hs), size, version


def train_q(args, hidden, init_hidden):
    """--mode q: fit the champion's shares, tilted toward the moves that scored more on replays."""
    x, legal, qa, q, h, size, version = load_q(args.data)
    n = len(x)
    valid = qa != 255
    adv = np.clip(q - q[:, :1], -args.reward_clip, args.reward_clip) * valid
    reps = max(1, int(valid.sum()) - n)
    print(f'{n} choices from {len(args.data)} rounds ({x.shape[1]} features), {reps} replays; '
          f'{100 * float((np.abs(adv[:, 1:]) > 0).sum()) / reps:.1f}% changed the points, '
          f'{100 * float((adv[:, 1:] > 0).sum()) / reps:.1f}% for the better')
    torch.manual_seed(1)
    dev = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'training on {dev}' + (f' ({torch.cuda.get_device_name(0)})' if dev == 'cuda' else ''))
    shape = hidden or init_hidden
    net = Net(size, args.dropout, shape)
    init = json.load(open(os.path.join(ROOT, args.init)))
    with torch.no_grad():
        for l, src in zip(net.layers, init['layers']):
            l.weight.copy_(torch.from_numpy(floats(src['w'], init.get('dtype')).reshape(src['rows'], src['cols'])))
            l.bias.copy_(torch.from_numpy(floats(src['b'], init.get('dtype'))))
    print('from ' + args.init)
    net.to(dev)
    ref = Net(size, 0.0, shape).to(dev)
    ref.load_state_dict(net.state_dict(), strict=False)
    ref.eval()
    rng = np.random.default_rng(1)
    hands, inv = np.unique(h, return_inverse=True)
    held = rng.random(len(hands)) < 0.1
    va, tr = np.nonzero(held[inv])[0], np.nonzero(~held[inv])[0]
    X = torch.from_numpy(x.astype(np.float32))
    Lg = torch.from_numpy(legal)
    QA = torch.from_numpy(np.where(valid, qa, 0).astype(np.int64))
    V = torch.from_numpy(valid)
    ADV = torch.from_numpy(adv.astype(np.float32))

    def q_loss(idx):
        xb, lb, qab, vb, advb = X[idx].to(dev), Lg[idx].to(dev), QA[idx].to(dev), V[idx].to(dev), ADV[idx].to(dev)
        # Untried moves: the worst tried move's advantage, and no better than the champion's.
        floor = torch.where(vb, advb, torch.full_like(advb, 1e9)).min(1).values.clamp(max=0)
        a_all = floor[:, None].expand(-1, OUTPUTS).clone()
        a_all.scatter_(1, qab, torch.where(vb, advb, floor[:, None].expand_as(advb)))
        with torch.no_grad():
            rlog = torch.log_softmax(ref(xb).masked_fill(~lb, -1e9), dim=1)
            tgt = torch.softmax((rlog + a_all / args.tau).masked_fill(~lb, -1e9), dim=1)
        logp = torch.log_softmax(net(xb).masked_fill(~lb, -1e9), dim=1)
        ce = -(tgt * logp.masked_fill(~lb, 0)).sum(1).mean()
        with torch.no_grad():
            kl = (rlog.exp() * (rlog - logp).masked_fill(~lb, 0)).sum(1).mean()
            # The points the new shares expect over the moves tried, less the champion's shares'.
            pt = torch.where(vb, logp.gather(1, qab).exp(), torch.zeros_like(advb))
            pr = torch.where(vb, rlog.gather(1, qab).exp(), torch.zeros_like(advb))
            gain = ((pt - pr) * advb).sum(1).mean()
        return ce, kl, gain

    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    best, best_state, stats = float('inf'), None, {}
    for ep in range(args.epochs):
        net.train()
        perm = torch.from_numpy(rng.permutation(tr))
        for s_ in range(0, len(perm), args.batch):
            loss = q_loss(perm[s_:s_ + args.batch])[0]
            opt.zero_grad()
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            tot = np.zeros(3)
            for s_ in range(0, len(va), 8192):
                idx = torch.from_numpy(va[s_:s_ + 8192])
                tot += np.array([v.item() for v in q_loss(idx)]) * len(idx)
            ce, kl, gain = tot / len(va)
        print(f'epoch {ep + 1}: held-out cross-entropy {ce:.4f}, KL from the champion {kl:.4f}, points gained on the moves tried {gain:+.2f}')
        if ce < best:
            best = ce
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
            stats = {'epochs': ep + 1, 'kl': float(kl), 'heldOutGain': float(gain)}
    net.load_state_dict(best_state)
    net.cpu().eval()
    meta_train = dict({'mode': 'q', 'tau': args.tau, 'rewardClip': args.reward_clip, 'lr': args.lr, 'choices': int(n)}, **stats)
    return net, x, va, n, size, version, best, meta_train


def load(dirs, returns=False):
    xs, acts, legal, ws = [], [], [], []
    rs, ps, os_, hs, ts = [], [], [], [], []
    size = version = None
    for di, d in enumerate(dirs):
        meta = json.load(open(os.path.join(ROOT, d, 'meta.json')))
        if size is not None and meta['featureSize'] != size:
            raise SystemExit(d + ' has ' + str(meta['featureSize']) + ' features a row, the others ' + str(size) + ' (mix --oracle data only with --oracle data)')
        size, version = meta['featureSize'], meta['featureVersion']
        PUBLIC[0] = ((meta.get('oracle') or {}).get('publicSize')) or size
        DANGER_AT[0] = (meta.get('oracle') or {}).get('dangerAt')
        ORACLE_AT[0] = (meta.get('oracle') or {}).get('oracleAt') or PUBLIC[0]
        PER[0] = (meta.get('oracle') or {}).get('per') or 69
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
    def __init__(self, size, dropout, hidden=None, aux=False):
        super().__init__()
        sizes = [size] + (hidden or HIDDEN) + [OUTPUTS]
        self.layers = nn.ModuleList([nn.Linear(sizes[i], sizes[i + 1]) for i in range(len(sizes) - 1)])
        self.drop = nn.Dropout(dropout)
        # Training only: predictions of the hidden tiles from the last hidden layer. Never exported.
        self.aux = nn.Linear(sizes[-2], AUX) if aux else None

    def both(self, x):
        for i, l in enumerate(self.layers):
            if i == len(self.layers) - 1:
                return l(x), (self.aux(x) if self.aux is not None else None)
            x = self.drop(torch.relu(l(x)))

    def forward(self, x):
        return self.both(x)[0]


def aux_targets(xb, P):
    """The auxiliary heads' targets from an --oracle row: (waits, ready, steps, wall, deal-in, held)."""
    o, per = ORACLE_AT[0], PER[0]
    waits = torch.cat([xb[:, o + k * per + 34:o + k * per + 68] for k in range(3)], 1)
    steps = torch.stack([xb[:, o + k * per + 68] for k in range(3)], 1)
    ready = (steps == 0).float()
    wall = xb[:, o + 3 * per:o + 3 * per + 34]
    at = DANGER_AT[0]
    dealin = (xb[:, at:at + 34] > 0).float()
    held = (xb[:, :34] > 0).float()
    return waits, ready, steps, wall, dealin, held


def aux_loss(out, xb, P):
    waits, ready, steps, wall, dealin, held = aux_targets(xb, P)
    bce = nn.functional.binary_cross_entropy_with_logits
    a, b = 0, 102
    l_w = bce(out[:, a:b], waits)
    l_r = bce(out[:, b:b + 3], ready)
    l_s = nn.functional.mse_loss(torch.sigmoid(out[:, b + 3:b + 6]), steps)
    l_wall = nn.functional.mse_loss(torch.sigmoid(out[:, b + 6:b + 40]), wall)
    d = bce(out[:, b + 40:b + 74], dealin, reduction='none')
    l_d = (d * held).sum() / held.sum().clamp(min=1)
    return l_w + l_r + l_s + 4 * l_wall + 2 * l_d


def auc(score, label):
    """Area under the ROC curve (the chance a positive outranks a negative)."""
    score, label = np.asarray(score, np.float64), np.asarray(label, bool)
    pos, neg = int(label.sum()), int((~label).sum())
    if not pos or not neg:
        return float('nan')
    ranks = np.empty(len(score))
    order = np.argsort(score, kind='mergesort')
    ranks[order] = np.arange(1, len(score) + 1)
    return float((ranks[label].sum() - pos * (pos + 1) / 2) / (pos * neg))


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
            # Squared error: the critic must learn the mean points (a baseline); a
            # Huber loss on these heavy-tailed rewards learns closer to the median.
            pred, tgt = c(X[idx].to(dev).float()), R[idx].to(dev)
            loss = nn.functional.mse_loss(pred, tgt) if CRITIC_LOSS[0] == 'mse' else nn.functional.smooth_l1_loss(pred, tgt)
            opt.zero_grad()
            loss.backward()
            opt.step()
    c.eval()
    out = np.zeros(len(score_idx), dtype=np.float32)
    with torch.no_grad():
        for s in range(0, len(score_idx), 16384):
            idx = torch.from_numpy(score_idx[s:s + 16384])
            out[s:s + len(idx)] = c(X[idx].to(dev).float()).cpu().numpy()
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
    ap.add_argument('--mode', choices=['imitate', 'pg', 'awr', 'q', 'oracle'], default='imitate')
    ap.add_argument('--danger-tau', type=float, default=100.0, help='--mode oracle: the points paid that divide a discard\'s share by e')
    ap.add_argument('--danger-weight', type=float, default=4.0, help='--mode oracle: weight of a choice with a discard that deals in')
    ap.add_argument('--tau', type=float, default=100.0, help='--mode q: the points of advantage that multiply a share by e')
    ap.add_argument('--reward', choices=['points', 'sqrt'], default='points', help='the hand\'s points, or their signed square root')
    ap.add_argument('--reward-clip', type=float, default=4000)
    ap.add_argument('--win-bonus', type=float, default=0, help='points added to the reward of a hand won')
    ap.add_argument('--critic-epochs', type=int, default=3)
    ap.add_argument('--critic-loss', choices=['mse', 'huber'], default='mse', help='the critic\'s loss (huber was the default before Suphx)')
    ap.add_argument('--clip', type=float, default=0.2)
    ap.add_argument('--entropy', type=float, default=0.003)
    ap.add_argument('--kl-max', type=float, default=0.03)
    ap.add_argument('--beta', type=float, default=1.0)
    ap.add_argument('--neg-weight', type=float, default=0.0)
    ap.add_argument('--hidden', help='hidden layer sizes, e.g. 512,256 (a new network: --init is ignored)')
    # Suphx (data from lucky.js generate --oracle).
    ap.add_argument('--oracle-critic', action='store_true', help='the critic also reads the hidden tiles')
    ap.add_argument('--oracle-delta', type=float, help='the policy reads the hidden tiles, each kept with this chance')
    ap.add_argument('--oracle-anneal', help='A,B: lower the oracle delta from A to B over the epochs')
    ap.add_argument('--public', action='store_true', help='write the model without the hidden tiles\' columns')
    ap.add_argument('--reject-ratio', type=float, default=0, help='drop moves whose share moved more than this factor from the one played')
    ap.add_argument('--target-entropy', type=float, default=0, help='adapt the entropy bonus to keep the entropy near this')
    # Frontier plan, phase 1 (data from lucky.js generate --oracle, usually --features v2).
    ap.add_argument('--aux', type=float, default=0, help='weight of the auxiliary heads that predict the hidden tiles (targets, never inputs)')
    ap.add_argument('--imitate-wins', type=float, default=0, help='--mode oracle with --returns data: also imitate the moves of hands won, at this weight')
    ap.add_argument('--teach', type=float, default=0, help='--mode pg or awr: also train toward the per-move deal-in teacher of --mode oracle, at this weight')
    ap.add_argument('--progress', type=float, default=0, help='teacher (features v2): points a discard costs for each step it sets the hand back from its best, scaled by the hand\'s prospects')
    ap.add_argument('--fold', type=float, default=0, help='teacher (features v2): deal-in costs grow by up to this factor as the hand\'s prospects fall (far from ready, late in the wall)')
    args = ap.parse_args()
    CRITIC_LOSS[0] = args.critic_loss
    if args.oracle_anneal:
        a0, a1 = [float(v) for v in args.oracle_anneal.split(',')]
        args.oracle_delta = a0 if args.oracle_delta is None else args.oracle_delta
        args.anneal = (a0, a1)
    else:
        args.anneal = None if args.oracle_delta is None else (args.oracle_delta, args.oracle_delta)
    hidden = [int(v) for v in args.hidden.split(',')] if args.hidden else None
    # A fine-tune keeps the shape of the model it starts from (lc30 and on
    # can be wider than the original 256, 128).
    init_hidden = None
    if args.init and not hidden:
        src = json.load(open(os.path.join(ROOT, args.init)))
        if not (src.get('meta') or {}).get('random'):
            init_hidden = [l['rows'] for l in src['layers'][:-1]]

    t0 = time.time()
    if args.mode == 'q':
        net, x, va, n, size, version, best, meta_train = train_q(args, hidden, init_hidden)
        export(args, net, x, va, n, size, version, best, hidden, init_hidden, {'objective': 'points', 'train': meta_train}, t0)
        return
    teacher = args.mode == 'oracle'
    rl = args.mode not in ('imitate', 'oracle')
    loaded = load(args.data, rl or args.imitate_wins > 0)
    x, a, legal, w, size, version = loaded[:6]
    neg = w < 0
    if (rl or args.neg_weight <= 0) and neg.any():
        # Points first has no separate deal-in rows (every move carries its hand's points).
        keep = ~neg
        x, a, legal, w = x[keep], a[keep], legal[keep], w[keep]
        neg = w < 0
    n = len(a)
    print(f'{n} samples from {len(args.data)} rounds ({x.shape[1]} features), {int(neg.sum())} of them deal-ins')
    P = PUBLIC[0] or size
    if args.aux and P == size:
        raise SystemExit('--aux needs data from lucky.js generate --oracle (its targets are the hidden tiles)')
    if args.teach and args.mode not in ('pg', 'awr'):
        raise SystemExit('--teach trains with --mode pg or awr (--mode oracle is the teacher alone)')
    if (args.oracle_critic or args.anneal) and P == size:
        raise SystemExit('--oracle-critic and --oracle-delta need data from lucky.js generate --oracle')
    # The policy's inputs: the seat's view, plus the hidden tiles for an oracle policy.
    IN = size if args.anneal else P
    if args.anneal:
        print(f'oracle guiding: the policy reads {size - P} hidden-tile inputs, kept with chance {args.anneal[0]} to {args.anneal[1]}')
    torch.manual_seed(1)
    dev = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'training on {dev}' + (f' ({torch.cuda.get_device_name(0)})' if dev == 'cuda' else ''))
    net = Net(IN, args.dropout, hidden or init_hidden, aux=args.aux > 0)
    if args.init and hidden:
        print('a new ' + args.hidden + ' network: --init ' + args.init + ' ignored')
        with torch.no_grad():
            net.layers[-1].weight.mul_(0.1)
            net.layers[-1].bias.zero_()
    elif args.init:
        init = json.load(open(os.path.join(ROOT, args.init)))
        if not (init.get('meta') or {}).get('random'):
            load_init(net, init)
            print('from ' + args.init + ('' if init['layers'][0]['cols'] == IN else
                  f' ({init["layers"][0]["cols"]} inputs to {IN}: the hidden tiles\' columns ' + ('start at 0' if IN > init['layers'][0]['cols'] else 'dropped') + ')'))
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
    # Kept as float16 (as the shards store it) and widened a batch at a time: half the memory, the same numbers.
    X = torch.from_numpy(np.ascontiguousarray(x.astype(np.float16, copy=False)))
    A = torch.from_numpy(a)
    Lg = torch.from_numpy(legal)
    W = torch.from_numpy(w.astype(np.float32))
    Neg = W < 0
    # Wins keep their mean weight of 1; each deal-in counts --neg-weight.
    W = torch.where(Neg, torch.full_like(W, args.neg_weight), W / W[~Neg].mean())
    rl_stats = {}
    teacher_stats = {}
    WON = None
    if args.imitate_wins > 0:
        WON = torch.from_numpy((loaded[6]['o'] == 0).astype(np.float32))
        print(f'imitating the moves of hands won: {int(WON.sum())} of {n} choices ({100 * float(WON.mean()):.1f}%), weight {args.imitate_wins}')
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
        # Suphx: a critic that sees the hidden tiles (training only) explains far more of the luck.
        XC = X if args.oracle_critic else X[:, :P]
        v[two] = fit_critic(XC, R, one, two, dev, args.critic_epochs, rng)
        v[one] = fit_critic(XC, R, two, one, dev, args.critic_epochs, rng)
        adv = R.numpy() - v
        explained = 1 - float(np.var(adv)) / max(1e-9, float(np.var(R.numpy())))
        adv = np.clip((adv - adv.mean()) / (adv.std() + 1e-8), -5, 5)
        ADV = torch.from_numpy(adv.astype(np.float32))
        LOGB = torch.from_numpy(np.log(np.clip(ret['p'], 1e-6, 1)).astype(np.float32))
        TEMP = torch.from_numpy(ret['t'])
        rl_stats = {'hands': int(len(hands)), 'rewardScale': scale, 'criticExplained': explained,
                    'meanPoints': float(ret['r'].mean())}
        print(f'{len(hands)} hands, reward scale {scale:.1f}, the critic' + (' (with the hidden tiles)' if args.oracle_critic else '') +
              f' explains {100 * explained:.1f}% of the reward\'s variance')
        rl_stats['oracleCritic'] = bool(args.oracle_critic)
        ref = Net(IN, 0.0, hidden or init_hidden).to(dev)
        ref.load_state_dict(net.state_dict(), strict=False)
        ref.eval()

    # The policy's inputs: the seat's view, then (oracle guiding) the hidden
    # tiles, each kept with chance delta[0] (Suphx's dropout of the oracle).
    delta = [args.anneal[0] if args.anneal else 0.0]
    gen = torch.Generator().manual_seed(7)

    def pin(xb):
        if IN == P:
            return xb[:, :P]
        keep = (torch.rand(xb.shape[0], IN - P, generator=gen) < delta[0]).to(xb.device, xb.dtype)
        return torch.cat([xb[:, :P], xb[:, P:IN] * keep], dim=1)

    if teacher or args.teach > 0:
        if DANGER_AT[0] is None:
            raise SystemExit('--mode oracle and --teach need data from lucky.js generate --oracle')
        at = DANGER_AT[0]
        COST = torch.zeros(n, OUTPUTS)
        COST[:, :34] = X[:, at:at + 34].float() * 1024
        COST = COST.masked_fill(~Lg, 0)
        # What the teacher steers by: the deal-in cost, and (features v2) the
        # hand's own progress. A hand with poor prospects (far from ready, the
        # wall running out) should fold harder (--fold); a discard that sets
        # the hand back when a tile that keeps its progress is there is a
        # mistake, the more so the better its prospects (--progress). Both are
        # read from public inputs: shantenAfter per tile, and the wall.
        TCOST = COST
        BACK = None
        if args.progress or args.fold:
            if P < 854:
                raise SystemExit('--progress and --fold need features v2 data (shanten after each discard)')
            v = X[:, 784:818].float()
            held = Lg[:, :34]
            sh = torch.where(v > 0, torch.round(8 * (1 - v) - 1), torch.full_like(v, 7.0))
            sh = torch.where(held, sh, torch.full_like(sh, 99.0))
            best = sh.min(1).values
            turn = held.any(1)
            back = torch.where(held, (sh - best[:, None]).clamp(min=0), torch.zeros_like(sh))
            base = torch.where(best <= 0, torch.tensor(1.0), torch.where(best == 1, torch.tensor(0.8), torch.where(best == 2, torch.tensor(0.5), torch.tensor(0.25))))
            wall = (X[:, 334].float() * 91 / 40).clamp(0.25, 1.0)
            prospects = torch.where(turn, base * wall, torch.ones_like(base))
            TCOST = COST.clone()
            TCOST[:, :34] = COST[:, :34] * (1 + args.fold * (1 - prospects))[:, None] + args.progress * back * prospects[:, None]
            TCOST = TCOST.masked_fill(~Lg, 0)
            BACK = torch.zeros(n, OUTPUTS, dtype=torch.bool)
            BACK[:, :34] = back > 0
            print(f'progress and fold: {100 * float((back > 0).any(1).float().mean()):.1f}% of choices have a discard that sets the hand back; '
                  f'the champion played one {int(BACK.gather(1, A[:, None])[:, 0].sum())} times; mean prospects {float(prospects[turn].mean()):.2f}')
        risky = (COST > 0).any(1)
        TW = torch.where(risky, torch.full((n,), args.danger_weight), torch.ones(n))
        TW = TW / TW.mean()
        print(f'{int(risky.sum())} choices ({100 * float(risky.float().mean()):.1f}%) had a discard that would deal in now; '
              f'the champion played one {int(((COST.gather(1, A[:, None])[:, 0]) > 0).sum())} times')
        ref = Net(IN, 0.0, hidden or init_hidden).to(dev)
        ref.load_state_dict(net.state_dict(), strict=False)
        ref.eval()

    back_share = [0.0, 0.0, 0]  # share on discards that set the hand back: the network's, the champion's, choices

    def teacher_loss(idx, out=None):
        """The per-move deal-in teacher. With out (the policy's logits and aux
        outputs, from pg or awr), only the teacher's own term."""
        xb, lb, cb, wb = X[idx].to(dev).float(), Lg[idx].to(dev), COST[idx].to(dev), TW[idx].to(dev)
        tc = TCOST[idx].to(dev)
        xin = pin(xb)
        logits, aux_out = net.both(xin) if out is None else (out[0], None)
        logp = torch.log_softmax(logits.masked_fill(~lb, -1e9), dim=1)
        with torch.no_grad():
            rlog = torch.log_softmax(ref(xin).masked_fill(~lb, -1e9), dim=1)
            tgt = torch.softmax((rlog - tc / args.danger_tau).masked_fill(~lb, -1e9), dim=1)
        ce = (-(tgt * logp.masked_fill(~lb, 0)).sum(1) * wb).mean()
        if out is not None:
            return ce
        if WON is not None:
            ab, won = A[idx].to(dev), WON[idx].to(dev)
            ce = ce + args.imitate_wins * (-(logp.gather(1, ab[:, None])[:, 0]) * won).sum() / won.sum().clamp(min=1)
        if aux_out is not None:
            ce = ce + args.aux * aux_loss(aux_out, xb, P)
        with torch.no_grad():
            kl = (rlog.exp() * (rlog - logp).masked_fill(~lb, 0)).sum(1).mean()
            # The points the shares would pay now: the new network's, and the champion's.
            pay = (logp.exp() * cb).sum(1).mean()
            pay0 = (rlog.exp() * cb).sum(1).mean()
            if BACK is not None:
                bk = BACK[idx].to(dev)
                back_share[0] += float((logp.exp() * bk).sum()); back_share[1] += float((rlog.exp() * bk).sum()); back_share[2] += len(idx)
        return ce, kl, pay, pay0

    def loss_of(idx, train):
        if teacher:
            return teacher_loss(idx)[0], torch.zeros(())
        xb, ab, lb, wb, nb = X[idx].to(dev).float(), A[idx].to(dev), Lg[idx].to(dev), W[idx].to(dev), Neg[idx].to(dev)
        logits, aux_out = net.both(pin(xb))
        logits = logits.masked_fill(~lb, -1e9)
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
        if aux_out is not None:
            return (per * wb).mean() + args.aux * aux_loss(aux_out, xb, P), acc
        return (per * wb).mean(), acc

    def rl_loss(idx):
        xb, ab, lb = X[idx].to(dev).float(), A[idx].to(dev), Lg[idx].to(dev)
        advb, logb, tb = ADV[idx].to(dev), LOGB[idx].to(dev), TEMP[idx].to(dev)
        xin = pin(xb)
        raw, aux_out = net.both(xin)
        logits = raw.masked_fill(~lb, -1e9)
        logp = torch.log_softmax(logits / tb[:, None], dim=1)
        lpa = logp.gather(1, ab[:, None])[:, 0]
        ent = -(logp.exp() * logp.masked_fill(~lb, 0)).sum(1)
        if args.mode == 'pg':
            ratio = torch.exp(lpa - logb)
            surr = torch.min(ratio * advb, torch.clamp(ratio, 1 - args.clip, 1 + args.clip) * advb)
        else:
            surr = torch.clamp(torch.exp(advb / args.beta), max=20.0) * lpa
        loss = -surr.mean() - alpha[0] * ent.mean()
        # Frontier phase 1: the returns move the policy, while the heads learn
        # to read the table in the same trunk and the teacher steers off deal-ins.
        if aux_out is not None:
            loss = loss + args.aux * aux_loss(aux_out, xb, P)
        if args.teach > 0:
            loss = loss + args.teach * teacher_loss(idx, (raw, aux_out))
        with torch.no_grad():
            rlog = torch.log_softmax(ref(xin).masked_fill(~lb, -1e9) / tb[:, None], dim=1)
            kl = (rlog.exp() * (rlog - logp).masked_fill(~lb, 0)).sum(1).mean()
        return loss, surr.mean(), kl, ent.mean()

    alpha = [args.entropy]
    if rl and args.reject_ratio > 1:
        # Suphx's normal agent, after oracle data: drop the moves whose share
        # now is far from the share they were played with.
        with torch.no_grad():
            lr_ = np.zeros(n, dtype=np.float32)
            for s_ in range(0, n, 16384):
                idx = torch.arange(s_, min(n, s_ + 16384))
                xb, ab, lb, tb = X[idx].to(dev).float(), A[idx].to(dev), Lg[idx].to(dev), TEMP[idx].to(dev)
                lp_ = torch.log_softmax(ref(pin(xb)).masked_fill(~lb, -1e9) / tb[:, None], dim=1).gather(1, ab[:, None])[:, 0]
                lr_[s_:s_ + len(idx)] = (lp_.cpu() - LOGB[idx]).numpy()
        ok = np.abs(lr_) <= np.log(args.reject_ratio)
        print(f'rejecting {100 * (1 - ok.mean()):.1f}% of the moves: their share moved more than {args.reject_ratio}x from the one played')
        tr, va = tr[ok[tr]], va[ok[va]]
        nv = len(va)
        rl_stats['rejected'] = float(1 - ok.mean())

    def delta_at(ep):
        if not args.anneal:
            return 0.0
        a0, a1 = args.anneal
        return a0 + (a1 - a0) * (ep / max(1, args.epochs - 1))

    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    best, best_state = float('inf'), None
    if rl:
        # Fixed epochs, stopping once the policy has moved too far from the champion's.
        best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
        best = 0.0
        for ep in range(args.epochs):
            delta[0] = delta_at(ep)
            net.train()
            perm = torch.from_numpy(rng.permutation(tr))
            for s in range(0, len(perm), args.batch):
                loss, _, _, ent_b = rl_loss(perm[s:s + args.batch])
                opt.zero_grad()
                loss.backward()
                opt.step()
                if args.target_entropy > 0:
                    # Suphx's adaptive entropy: more bonus when the policy is too sure, less when too spread.
                    alpha[0] = max(0.0, alpha[0] + 1e-4 * (args.target_entropy - float(ent_b)))
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
            print(f'epoch {ep + 1}: held-out surrogate {sv:.4f}, KL from the champion {kv:.4f}, entropy {ev:.3f}' +
                  (f', oracle kept {delta[0]:.2f}' if args.anneal else '') + (f', entropy bonus {alpha[0]:.4f}' if args.target_entropy > 0 else ''))
            if kv > 2 * args.kl_max and ep > 0:
                print(f'stopping: the policy moved more than {2 * args.kl_max} from the champion, keeping epoch {ep}')
                break
            best = sv
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
            rl_stats.update({'epochs': ep + 1, 'kl': kv, 'heldOutEntropy': ev, 'surrogate': sv})
            if args.anneal:
                rl_stats['oracleDelta'] = delta[0]
            if kv > args.kl_max:
                print(f'stopping: the policy moved {kv:.4f} from the champion')
                break
    for ep in range(0 if rl else args.epochs):
        delta[0] = delta_at(ep)
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
        if teacher:
            with torch.no_grad():
                tot = np.zeros(4)
                back_share[:] = [0.0, 0.0, 0]
                for s in range(0, nv, 8192):
                    idx = torch.from_numpy(va[s:s + 8192])
                    tot += np.array([v.item() for v in teacher_loss(idx)]) * len(idx)
                _, kl_, pay_, pay0_ = tot / max(1, nv)
            sb = f', set-back discards {100 * back_share[0] / max(1, back_share[2]):.2f}% of its shares (the champion\'s {100 * back_share[1] / max(1, back_share[2]):.2f}%)' if BACK is not None else ''
            print(f'epoch {ep + 1}: held-out loss {vl:.4f}, KL from the champion {kl_:.4f}, points its shares would pay now '
                  f'{pay_:.2f} a choice (the champion\'s {pay0_:.2f})' + sb + (f', oracle kept {delta[0]:.2f}' if args.anneal else ''))
            if vl < best:
                teacher_stats = {'epochs': ep + 1, 'kl': float(kl_), 'heldOutPay': float(pay_), 'championPay': float(pay0_)}
                if BACK is not None:
                    teacher_stats.update({'setBackShare': back_share[0] / max(1, back_share[2]), 'championSetBackShare': back_share[1] / max(1, back_share[2])})
        else:
            print(f'epoch {ep + 1}: validation loss {vl:.4f}, picks the move it won with {100 * vacc:.1f}%')
        if vl < best:
            best = vl
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)
    net.cpu().eval()
    extra = {}
    if args.aux > 0:
        extra['aux'] = dict({'weight': args.aux}, **aux_report(net, X, va, P, pin))
    if teacher:
        extra['objective'] = 'points'
        extra['train'] = dict({'mode': 'oracle', 'dangerTau': args.danger_tau, 'dangerWeight': args.danger_weight, 'progress': args.progress, 'fold': args.fold, 'lr': args.lr}, **teacher_stats)
        rl_stats['oracleDelta'] = delta[0]
    if rl:
        extra['objective'] = 'points'
        extra['train'] = dict({'mode': args.mode, 'reward': args.reward, 'rewardClip': args.reward_clip, 'winBonus': args.win_bonus,
                               'lr': args.lr, 'clip': args.clip, 'entropy': args.entropy, 'klMax': args.kl_max, 'beta': args.beta}, **rl_stats)
        if args.teach > 0:
            extra['train'].update({'teach': args.teach, 'dangerTau': args.danger_tau, 'dangerWeight': args.danger_weight})
    if IN > P:
        final = float(rl_stats.get('oracleDelta', delta[0]))
        if args.public:
            if final > 0:
                print(f'note: --public drops the hidden tiles while the oracle was still kept {final:.2f} of the time')
            net = public_net(net, P)
        else:
            extra['oracle'] = {'delta': final, 'size': IN - P, 'publicSize': P}
    extra['suphx'] = {k: v for k, v in {'oracleCritic': bool(args.oracle_critic), 'anneal': args.anneal, 'public': bool(args.public),
                                        'rejectRatio': args.reject_ratio or None, 'targetEntropy': args.target_entropy or None}.items() if v}
    export(args, net, x, va, n, P, version, best, hidden, init_hidden, extra, t0)


def aux_report(net, X, va, P, pin):
    """Held-out AUCs of the auxiliary heads: does the network read the table?"""
    outs, tg = [], []
    with torch.no_grad():
        for s in range(0, min(len(va), 200000), 8192):
            idx = torch.from_numpy(va[s:s + 8192])
            xb = X[idx].float()
            outs.append(net.both(pin(xb))[1].numpy())
            tg.append([t.numpy() for t in aux_targets(xb, P)])
    out = np.concatenate(outs)
    waits, ready, steps, wall, dealin, held = [np.concatenate([t[k] for t in tg]) for k in range(6)]
    h = held > 0
    r = {'dealInAuc': auc(out[:, 142:176][h], dealin[h] > 0),
         'readyAuc': auc(out[:, 102:105].ravel(), ready.ravel() > 0),
         'waitsAuc': auc(out[:, :102][np.repeat(ready > 0, 34, axis=1)], waits[np.repeat(ready > 0, 34, axis=1)] > 0),
         'wallMae': float(np.abs(1 / (1 + np.exp(-out[:, 108:142])) - wall).mean() * 4)}
    print(f"auxiliary heads, held out: deal-in AUC {r['dealInAuc']:.3f}, ready AUC {r['readyAuc']:.3f}, "
          f"waits AUC (when ready) {r['waitsAuc']:.3f}, wall count error {r['wallMae']:.3f} copies")
    return r


def load_init(net, init):
    """Copies --init's weights into net; the first layer's columns may differ
    (an oracle model has the hidden tiles' columns after the seat's own):
    columns net has and init doesn't start at 0, and init's extra are dropped."""
    with torch.no_grad():
        for k, (l, src) in enumerate(zip(net.layers, init['layers'])):
            w = torch.from_numpy(floats(src['w'], init.get('dtype')).reshape(src['rows'], src['cols']))
            if k == 0 and src['cols'] != l.in_features:
                l.weight.zero_()
                c = min(src['cols'], l.in_features)
                l.weight[:, :c] = w[:, :c]
            else:
                l.weight.copy_(w)
            l.bias.copy_(torch.from_numpy(floats(src['b'], init.get('dtype'))))


def public_net(net, P):
    """The same network reading only the seat's own P features."""
    hid = [l.out_features for l in net.layers[:-1]]
    out = Net(P, 0.0, hid)
    with torch.no_grad():
        for k, (a, b) in enumerate(zip(out.layers, net.layers)):
            a.weight.copy_(b.weight[:, :P] if k == 0 else b.weight)
            a.bias.copy_(b.bias)
    return out.eval()


def export(args, net, x, va, n, size, version, best, hidden, init_hidden, extra, t0):
    layers = []
    for l in net.layers:
        layers.append({'rows': l.out_features, 'cols': l.in_features, 'w': b64(l.weight.detach().numpy()), 'b': b64(l.bias.detach().numpy())})
    meta = {'name': args.name, 'trainedAt': time.strftime('%Y-%m-%d %H:%M'), 'samples': int(n), 'data': args.data,
            'init': None if hidden else args.init, 'validationLoss': best, 'negWeight': args.neg_weight,
            'hidden': hidden or init_hidden or HIDDEN}
    meta.update(extra)
    out = {'featureVersion': version, 'featureSize': size, 'dtype': 'f16', 'meta': meta, 'layers': layers}
    os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
    path = os.path.join(ROOT, 'ml', 'models', args.name + '.json')
    json.dump(out, open(path, 'w'))

    # The JS model must give the same logits (to float16 rounding).
    probe = x[va[:8]][:, :net.layers[0].in_features].astype(np.float32)
    with torch.no_grad():
        want = net(torch.from_numpy(probe)).numpy()
    mod = '/js/mahjong-frontier-net.js' if version == 2 else '/js/mahjong-lucky-cat-net.js'
    js = ("const N=require(process.argv[1]+'" + mod + "');const m=N.createModel(require(process.argv[2]));"
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
