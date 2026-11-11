#!/usr/bin/env python3
"""Lucky Cat against its own lineage (scripts/ml/lc-own.js): many arms in one process.

  ml/.venv/Scripts/python.exe ml/lc_own_train.py --data ml/data/own-1 ml/data/own-2 --arms arms.json

The data (lcm-sim generate-lcv --crn --policy-only) holds, at a share of the
champion's choices, the policy's features, the legal moves, and up to 8 moves
tried (the one played first), each played on from the position on the same
reshuffled walls: its mean points (.qp.f4) and share of wins (.q.f4).

The data is loaded once (to the GPU) and every arm of --arms trains on it in
turn, so a round's arms cost one load. An arm is a JSON object:

  name     the model written to ml/models/<name>.json
  init     the model it starts from (its network shape too)
  mode     q (default): the target is the reference's shares times
           exp(advantage / tau) over the legal moves, where a move's advantage
           is its replays' mean points plus bonus x its share of wins, less the
           played move's; moves not tried get the worst tried advantage (and
           no more than 0). noise: init's weights plus Gaussian noise, sigma
           times each layer's weight spread (no training).
  tau, bonus, lr, epochs, batch, wd   the q step (defaults 100, 300, 3e-4, 4, 1024, 1e-4)
  anchor   ref (default): the reference is init, fixed; the step stays within
           tau of it. self: the reference is the network itself as it trains
           (refreshed each epoch), so each epoch moves a further tau: a bigger
           step away from init.
  kl       extra weight on KL(init || net), a leash (default 0)
  sigma, seed  for mode noise
  valid    share of hands held out (default 0.1)
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
SLOTS = 8


def floats(v, dtype):
    if isinstance(v, str):
        return np.frombuffer(base64.b64decode(v), dtype='<f2' if dtype == 'f16' else '<f4').astype(np.float32)
    return np.asarray(v, dtype=np.float32)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr, dtype='<f2').tobytes()).decode('ascii')


class Net(nn.Module):
    def __init__(self, sizes):
        super().__init__()
        self.layers = nn.ModuleList([nn.Linear(sizes[i], sizes[i + 1]) for i in range(len(sizes) - 1)])

    def forward(self, x):
        for i, l in enumerate(self.layers):
            x = l(x)
            if i < len(self.layers) - 1:
                x = torch.relu(x)
        return x


def load_model(path):
    w = json.load(open(os.path.join(ROOT, path)))
    sizes = [w['layers'][0]['cols']] + [l['rows'] for l in w['layers']]
    net = Net(sizes)
    with torch.no_grad():
        for l, src in zip(net.layers, w['layers']):
            l.weight.copy_(torch.from_numpy(floats(src['w'], w.get('dtype')).reshape(src['rows'], src['cols'])))
            l.bias.copy_(torch.from_numpy(floats(src['b'], w.get('dtype'))))
    return net, w


def save_model(net, base, name, extra):
    layers = [{'rows': l.out_features, 'cols': l.in_features, 'w': b64(l.weight.detach().cpu().numpy()), 'b': b64(l.bias.detach().cpu().numpy())} for l in net.layers]
    meta = dict(base.get('meta', {}))
    meta.update({'name': name, 'trainedAt': time.strftime('%Y-%m-%d %H:%M'), 'hidden': [l.out_features for l in net.layers[:-1]]})
    meta.update(extra)
    out = {'featureVersion': base['featureVersion'], 'featureSize': base['featureSize'], 'dtype': 'f16', 'meta': meta, 'layers': layers}
    path = os.path.join(ROOT, 'ml', 'models', name + '.json')
    json.dump(out, open(path, 'w'))
    return path


def js_check(net, path, x):
    probe = x[:4].astype(np.float32)
    with torch.no_grad():
        want = net.cpu()(torch.from_numpy(probe)).numpy()
    js = ("const N=require(process.argv[1]+'/js/mahjong-lucky-cat-net.js');const m=N.createModel(require(process.argv[2]));"
          "const xs=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(xs.map(x=>m.forward(Float32Array.from(x)))));")
    got = np.array(json.loads(subprocess.run(['node', '-e', js, ROOT, path], input=json.dumps(probe.tolist()), capture_output=True, text=True, check=True).stdout))
    err = float(np.abs(got - want).max())
    if err > 0.05 * max(1.0, float(np.abs(want).max())):
        raise SystemExit(f'{path}: the JS model disagrees ({err})')
    return err


def load(dirs):
    xs, legal, qa, qp, qw, hs = [], [], [], [], [], []
    for di, d in enumerate(dirs):
        full = os.path.join(ROOT, d)
        for f in sorted(os.listdir(full)):
            if not f.endswith('.qa.u1'):
                continue
            base = os.path.join(full, f[:-6])
            t = np.fromfile(base + '.qa.u1', dtype=np.uint8).reshape(-1, SLOTS)
            if not len(t):
                continue
            qa.append(t)
            qp.append(np.fromfile(base + '.qp.f4', dtype='<f4').reshape(-1, SLOTS))
            qw.append(np.fromfile(base + '.q.f4', dtype='<f4').reshape(-1, SLOTS))
            xs.append(np.fromfile(base + '.x.f16', dtype='<f2').reshape(-1, 376))
            m = np.unpackbits(np.fromfile(base + '.m.u1', dtype=np.uint8).reshape(-1, 10), axis=1, bitorder='little')[:, :OUTPUTS]
            legal.append(m.astype(bool))
            shard = int(f.split('-')[1].split('.')[0])
            hs.append(np.fromfile(base + '.h.u4', dtype='<u4').astype(np.int64) + (di * 100000 + shard) * (1 << 32))
    return np.concatenate(xs), np.concatenate(legal), np.concatenate(qa), np.concatenate(qp), np.concatenate(qw), np.concatenate(hs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', nargs='+', required=True)
    ap.add_argument('--arms', required=True)
    ap.add_argument('--report')
    args = ap.parse_args()
    arms = json.load(open(args.arms))
    t0 = time.time()
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    x, legal, qa, qp, qw, h = load(args.data)
    n = len(x)
    valid = qa != 255
    print(f'{n} choices from {len(args.data)} sets, {int(valid.sum()) - n} alternatives, loaded in {time.time() - t0:.0f}s on {dev}', flush=True)
    X = torch.from_numpy(x.astype(np.float32)).to(dev)
    Lg = torch.from_numpy(legal).to(dev)
    QA = torch.from_numpy(np.where(valid, qa, 0).astype(np.int64)).to(dev)
    V = torch.from_numpy(valid).to(dev)
    QP = torch.from_numpy(qp).to(dev)
    QW = torch.from_numpy(qw).to(dev)
    hands, inv = np.unique(h, return_inverse=True)
    report = []
    for arm in arms:
        ta = time.time()
        name = arm['name']
        net, base = load_model(arm['init'])
        if arm.get('mode') == 'noise':
            g = torch.Generator().manual_seed(int(arm.get('seed', 1)))
            with torch.no_grad():
                for l in net.layers:
                    l.weight.add_(torch.randn(l.weight.shape, generator=g) * float(arm['sigma']) * l.weight.std())
                    l.bias.add_(torch.randn(l.bias.shape, generator=g) * float(arm['sigma']) * l.weight.std())
            path = save_model(net, base, name, {'mode': 'noise', 'sigma': arm['sigma'], 'seed': arm.get('seed', 1), 'init': arm['init']})
            js_check(net, path, x)
            report.append({'name': name, 'seconds': time.time() - ta})
            print(f'{name}: noise sigma {arm["sigma"]} seed {arm.get("seed", 1)}', flush=True)
            continue
        tau, bonus = float(arm.get('tau', 100)), float(arm.get('bonus', 300))
        lr, epochs, batch = float(arm.get('lr', 3e-4)), int(arm.get('epochs', 4)), int(arm.get('batch', 1024))
        anchor, klw = arm.get('anchor', 'ref'), float(arm.get('kl', 0))
        clip = float(arm.get('clip', 4000))
        q = QP + bonus * QW
        adv = torch.clamp(q - q[:, :1], -clip, clip) * V
        rng = np.random.default_rng(int(arm.get('seed', 1)))
        torch.manual_seed(int(arm.get('seed', 1)))
        held = rng.random(len(hands)) < float(arm.get('valid', 0.1))
        va, tr = np.nonzero(held[inv])[0], np.nonzero(~held[inv])[0]
        net.to(dev)
        init_net, _ = load_model(arm['init'])
        init_net.to(dev).eval()
        ref = init_net
        floor = torch.where(V, adv, torch.full_like(adv, 1e9)).min(1).values.clamp(max=0)
        A = floor[:, None].expand(-1, OUTPUTS).clone()
        A.scatter_(1, QA, torch.where(V, adv, floor[:, None].expand_as(adv)))
        A = A / tau

        def stats(idx, ref_net):
            xb, lb = X[idx], Lg[idx]
            with torch.no_grad():
                l0 = torch.log_softmax(init_net(xb).masked_fill(~lb, -1e9), 1)
                lp = torch.log_softmax(net(xb).masked_fill(~lb, -1e9), 1)
                kl = (l0.exp() * (l0 - lp).masked_fill(~lb, 0)).sum(1).mean()
                pt = torch.where(V[idx], lp.gather(1, QA[idx]).exp(), torch.zeros_like(adv[idx]))
                pr = torch.where(V[idx], l0.gather(1, QA[idx]).exp(), torch.zeros_like(adv[idx]))
                gain = ((pt - pr) * adv[idx]).sum(1).mean()
                # the greedy move's advantage (argmax over tried moves) against init's greedy
                top = lp.argmax(1, keepdim=True); top0 = l0.argmax(1, keepdim=True)
                Ab = A[idx] * tau
                g2 = (Ab.gather(1, top) - Ab.gather(1, top0)).mean()
            return float(kl), float(gain), float(g2)

        opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=float(arm.get('wd', 1e-4)))
        trT = torch.from_numpy(tr).to(dev)
        vaT = torch.from_numpy(va).to(dev)
        for ep in range(epochs):
            if anchor == 'self':
                ref = Net([l.in_features for l in net.layers[:1]] + [l.out_features for l in net.layers]).to(dev)
                ref.load_state_dict(net.state_dict())
                ref.eval()
            net.train()
            perm = trT[torch.randperm(len(trT), device=dev)]
            for s in range(0, len(perm), batch):
                idx = perm[s:s + batch]
                xb, lb = X[idx], Lg[idx]
                with torch.no_grad():
                    rlog = torch.log_softmax(ref(xb).masked_fill(~lb, -1e9), 1)
                    tgt = torch.softmax((rlog + A[idx]).masked_fill(~lb, -1e9), 1)
                logp = torch.log_softmax(net(xb).masked_fill(~lb, -1e9), 1)
                loss = -(tgt * logp.masked_fill(~lb, 0)).sum(1).mean()
                if klw:
                    with torch.no_grad():
                        l0 = torch.log_softmax(init_net(xb).masked_fill(~lb, -1e9), 1)
                    loss = loss + klw * (l0.exp() * (l0 - logp).masked_fill(~lb, 0)).sum(1).mean()
                opt.zero_grad()
                loss.backward()
                opt.step()
            net.eval()
            kl, gain, g2 = stats(vaT, ref)
            print(f'{name} epoch {ep + 1}: KL from init {kl:.4f}, held-out points gained (shares) {gain:+.2f}, (greedy) {g2:+.2f}', flush=True)
        extra = {'mode': 'q', 'arm': arm, 'data': args.data, 'choices': int(n), 'kl': kl, 'heldOutGain': gain, 'heldOutGreedyGain': g2}
        path = save_model(net.cpu(), base, name, extra)
        js_check(net, path, x)
        report.append({'name': name, 'kl': kl, 'gain': gain, 'greedyGain': g2, 'seconds': time.time() - ta})
    if args.report:
        json.dump(report, open(args.report, 'w'), indent=1)
    print(f'all arms in {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
