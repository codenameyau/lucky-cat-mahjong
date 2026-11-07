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
    x, a, legal, w, size, version = load(args.data)
    neg = w < 0
    if args.neg_weight <= 0 and neg.any():
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
            'init': None if hidden else args.init, 'validationLoss': best, 'negWeight': args.neg_weight,
            'hidden': hidden or init_hidden or HIDDEN}
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
