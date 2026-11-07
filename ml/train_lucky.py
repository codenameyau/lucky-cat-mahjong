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

The network is the one the JS runs: fully connected layers with ReLU, and 74
raw outputs (34 discards, 34 kongs, then pass, three chows, pung, kong).
A model from --init whose meta says random (the first, all-zero model)
starts from fresh random weights instead: zero weights can't learn.

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


def load(dirs):
    xs, acts, legal, ws = [], [], [], []
    size = version = None
    for d in dirs:
        meta = json.load(open(os.path.join(ROOT, d, 'meta.json')))
        size, version = meta['featureSize'], meta['featureVersion']
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
    return np.concatenate(xs), np.concatenate(acts).astype(np.int64), np.concatenate(legal), np.concatenate(ws), size, version


class Net(nn.Module):
    def __init__(self, size, dropout):
        super().__init__()
        sizes = [size] + HIDDEN + [OUTPUTS]
        self.layers = nn.ModuleList([nn.Linear(sizes[i], sizes[i + 1]) for i in range(len(sizes) - 1)])
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        for i, l in enumerate(self.layers):
            x = l(x)
            if i < len(self.layers) - 1:
                x = self.drop(torch.relu(x))
        return x


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
    args = ap.parse_args()

    t0 = time.time()
    x, a, legal, w, size, version = load(args.data)
    n = len(a)
    print(f'{n} samples from {len(args.data)} rounds ({x.shape[1]} features)')
    torch.manual_seed(1)
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    net = Net(size, args.dropout)
    if args.init:
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
    order = rng.permutation(n)
    nv = max(1, n // 10)
    va, tr = order[:nv], order[nv:]
    X = torch.from_numpy(x.astype(np.float32))
    A = torch.from_numpy(a)
    Lg = torch.from_numpy(legal)
    W = torch.from_numpy(w.astype(np.float32))
    W = W / W.mean()

    def loss_of(idx, train):
        xb, ab, lb, wb = X[idx].to(dev), A[idx].to(dev), Lg[idx].to(dev), W[idx].to(dev)
        logits = net(xb).masked_fill(~lb, -1e9)
        logp = torch.log_softmax(logits, dim=1)
        nll = -logp.gather(1, ab[:, None])[:, 0]
        # Smoothing: a share of the target spread over every legal move.
        k = lb.sum(1).clamp(min=1)
        uniform = -(logp.masked_fill(~lb, 0).sum(1)) / k
        per = (1 - args.smoothing) * nll + args.smoothing * uniform
        acc = (logits.argmax(1) == ab).float()
        return (per * wb).mean(), acc.mean()

    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    best, best_state = float('inf'), None
    for ep in range(args.epochs):
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
            'init': args.init, 'validationLoss': best}
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
