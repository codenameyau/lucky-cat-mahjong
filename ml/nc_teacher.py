#!/usr/bin/env python3
"""A bigger Neural Cat teacher (Python only, it never plays): a residual MLP with
pre-LayerNorm blocks, x + W2 relu(W1 LN(x)), trained on the same rows and the same
held-out deals as ml/train.py, with AdamW, gradient clipping, warm-up and cosine decay.

  ml/.venv/Scripts/python.exe ml/nc_teacher.py --data ml/data/a ml/data/b --width 768 --blocks 4 --out work/teacher

Prints its held-out loss (ml/train.py's: outcome + half of each faan head) each epoch,
and writes <out>.f16: its 28 outputs for every row of the data, in load order, for
ml/nc_multi.py's "teacher" arms (distillation into the shipped 568-512-256-28 shape).
The hidden tiles are never inputs: the teacher reads the same 568 features.
"""

import argparse
import json
import math
import os
import sys
import time

import numpy as np
import torch
import torch.nn as nn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402


class Block(nn.Module):
    def __init__(self, w, dropout):
        super().__init__()
        self.ln = nn.LayerNorm(w)
        self.a = nn.Linear(w, 2 * w)
        self.b = nn.Linear(2 * w, w)
        self.drop = nn.Dropout(dropout)
        nn.init.kaiming_normal_(self.a.weight, nonlinearity='relu')
        nn.init.zeros_(self.b.weight)

    def forward(self, x):
        return x + self.b(self.drop(torch.relu(self.a(self.ln(x)))))


class Teacher(nn.Module):
    def __init__(self, size, w, blocks, dropout):
        super().__init__()
        self.inp = nn.Linear(size, w)
        self.blocks = nn.Sequential(*[Block(w, dropout) for _ in range(blocks)])
        self.ln = nn.LayerNorm(w)
        self.out = nn.Linear(w, T.OUTPUTS)

    def forward(self, x):
        return self.out(self.ln(self.blocks(self.inp(x))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', nargs='+', required=True)
    ap.add_argument('--width', type=int, default=768)
    ap.add_argument('--blocks', type=int, default=4)
    ap.add_argument('--epochs', type=int, default=8)
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--batch', type=int, default=4096)
    ap.add_argument('--dropout', type=float, default=0.1)
    ap.add_argument('--clip', type=float, default=1.0)
    ap.add_argument('--warmup', type=float, default=0.05)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    dev = 'cuda'
    t0 = time.time()
    x, y, manifests, _, _, _ = T.load(args.data)
    size = manifests[0]['featureSize']
    val = (y['dealSeed'].astype(np.uint64) * 2654435761 % 2**32) % 20 == 0
    tr, va = np.nonzero(~val)[0], np.nonzero(val)[0]
    cl = lambda a: torch.from_numpy(np.clip(a.astype(np.int64) - 3, 0, T.N_FAAN - 1)).to(dev)
    yo = torch.from_numpy(y['outcome'].astype(np.int64)).to(dev)
    yw, yp = cl(y['winFaan']), cl(y['payFaan'])
    fetch = lambda rows: torch.from_numpy(x[rows]).to(dev).float()
    net = Teacher(size, args.width, args.blocks, args.dropout).to(dev)
    print('Teacher: %d parameters, %d rows (%d held out), loaded in %.0fs' % (sum(p.numel() for p in net.parameters()), len(x), len(va), time.time() - t0), flush=True)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-2)
    steps = args.epochs * ((len(tr) + args.batch - 1) // args.batch)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, args.warmup * steps)) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / steps))))
    best, best_state = math.inf, None
    for ep in range(args.epochs):
        t1 = time.time()
        perm = np.random.default_rng(100 + ep).permutation(len(tr))
        norms = []
        net.train()
        for i in range(0, len(tr), args.batch):
            rows = np.sort(tr[perm[i:i + args.batch]])
            ri = torch.from_numpy(rows).to(dev)
            out = net(fetch(rows))
            lo, lw, lp = T.losses(out, yo[ri], yw[ri], yp[ri])
            loss = lo + 0.5 * lw + 0.5 * lp
            opt.zero_grad(set_to_none=True)
            loss.backward()
            norms.append(torch.nn.utils.clip_grad_norm_(net.parameters(), args.clip).detach())
            opt.step()
            sched.step()
        nm = torch.stack(norms).cpu().numpy()
        vl, _, acc = T.evaluate(net, lambda pos: fetch(va[pos]), len(va), yo[torch.from_numpy(va).to(dev)], yw[torch.from_numpy(va).to(dev)], yp[torch.from_numpy(va).to(dev)], 16384)
        total = vl[0] + 0.5 * vl[1] + 0.5 * vl[2]
        print('teacher epoch %d val %.5f (outcome %.5f, win faan %.5f, pay faan %.5f) acc %.4f grad norm median %.3f p99 %.3f max %.3f, clip %g bites %.1f%%, %.0fs' % (
            ep + 1, total, vl[0], vl[1], vl[2], acc, np.median(nm), np.percentile(nm, 99), nm.max(), args.clip, 100 * (nm > args.clip).mean(), time.time() - t1), flush=True)
        if total < best:
            best, best_state = total, {k: v.detach().clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)
    net.eval()
    out = np.empty((len(x), T.OUTPUTS), dtype=np.float16)
    with torch.no_grad():
        for i in range(0, len(x), 65536):
            out[i:i + 65536] = net(fetch(np.arange(i, min(len(x), i + 65536)))).cpu().numpy().astype(np.float16)
    out.tofile(args.out + '.f16')
    with open(args.out + '.json', 'w') as f:
        json.dump({'valLoss': best, 'width': args.width, 'blocks': args.blocks, 'data': args.data, 'rows': len(x)}, f)
    print('TEACHER ' + json.dumps({'valLoss': round(best, 5), 'file': args.out + '.f16'}), flush=True)


if __name__ == '__main__':
    main()
