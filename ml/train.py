#!/usr/bin/env python3
"""Train Neural Cat's model (js/mahjong-ml-model.js) on data from
npm run ml:generate, and export it for the page.

  ml/.venv/bin/python ml/train.py --data ml/data/r0 --name r0
  ml/.venv/bin/python ml/train.py --data ml/data/r0 ml/data/r1 --name r1 --ship

The network is the one the JS runs: fully connected layers with ReLU, and
OUTPUTS raw values: 6 outcome logits (win by self-draw, win off a discard,
deal in, someone else self-draws, someone else wins, draw), then 11 logits
for the faan of our win and 11 for the faan we pay (3 to 13). The faan
heads learn only from hands that had that kind of ending.

Writes ml/models/<name>.json (weights, float16 base64) and checks the JS
model gives the same outputs. --ship also writes js/mahjong-ml-weights.js,
the copy the page and npm run compete load.
"""

import argparse
import base64
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N_OUTCOMES = 6
N_FAAN = 11
OUTPUTS = N_OUTCOMES + 2 * N_FAAN
LABEL_DTYPE = np.dtype([
    ('outcome', 'u1'), ('winFaan', 'u1'), ('payFaan', 'u1'), ('turn', 'u1'),
    ('seat', 'u1'), ('strategy', 'u1'), ('wallLeft', 'u1'), ('explored', 'u1'),
    ('delta', '<f4'), ('dealSeed', '<u4'),
])


def load(dirs, limit=None):
    # Read straight into one array: the data can be most of the memory.
    labels, manifests = [], []
    for d in dirs:
        with open(os.path.join(d, 'manifest.json')) as f:
            m = json.load(f)
        if manifests and m['featureSize'] != manifests[0]['featureSize']:
            sys.exit('%s has %d features, %s has %d' % (d, m['featureSize'], dirs[0], manifests[0]['featureSize']))
        m['dir'] = d
        manifests.append(m)
    size = manifests[0]['featureSize']
    total = sum(s['samples'] for m in manifests for s in m['shards'])
    x = np.empty((total, size), dtype=np.float16)
    at = 0
    for m in manifests:
        for s in m['shards']:
            n = s['samples']
            x[at:at + n] = np.fromfile(os.path.join(m['dir'], s['features']), dtype=np.float16).reshape(-1, size)
            y = np.fromfile(os.path.join(m['dir'], s['labels']), dtype=LABEL_DTYPE)
            assert len(y) == n, 'shard size mismatch in ' + m['dir']
            labels.append(y)
            at += n
    y = np.concatenate(labels)
    if limit and len(x) > limit:
        idx = np.random.default_rng(0).choice(len(x), limit, replace=False)
        x, y = x[idx], y[idx]
    return x, y, manifests


class Net(nn.Module):
    def __init__(self, size, hidden, dropout):
        super().__init__()
        layers, prev = [], size
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, OUTPUTS))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)

    def linears(self):
        return [m for m in self.net if isinstance(m, nn.Linear)]


def losses(out, y_outcome, y_win, y_pay):
    lo = F.cross_entropy(out[:, :N_OUTCOMES], y_outcome)
    win = y_outcome <= 1
    pay = (y_outcome == 2) | (y_outcome == 3)
    zero = out.new_zeros(())
    lw = F.cross_entropy(out[win, N_OUTCOMES:N_OUTCOMES + N_FAAN], y_win[win]) if win.any() else zero
    lp = F.cross_entropy(out[pay, N_OUTCOMES + N_FAAN:], y_pay[pay]) if pay.any() else zero
    return lo, lw, lp


def expected_points(out):
    """The same expected points as summarize() in js/mahjong-ml-model.js."""
    o = torch.softmax(out[:, :N_OUTCOMES], 1)
    pts = 8 * torch.pow(2.0, torch.arange(N_FAAN, device=out.device, dtype=out.dtype))
    win_pts = (torch.softmax(out[:, N_OUTCOMES:N_OUTCOMES + N_FAAN], 1) * pts).sum(1)
    pay_pts = (torch.softmax(out[:, N_OUTCOMES + N_FAAN:], 1) * pts).sum(1)
    return o[:, 0] * 3 * win_pts + o[:, 1] * win_pts - (o[:, 2] + o[:, 3]) * pay_pts


def evaluate(model, fetch, count, yo, yw, yp, batch):
    model.eval()
    tot = np.zeros(3)
    n = 0
    evs = []
    correct = 0
    with torch.no_grad():
        for i in range(0, count, batch):
            out = model(fetch(np.arange(i, min(count, i + batch))))
            lo, lw, lp = losses(out, yo[i:i + batch], yw[i:i + batch], yp[i:i + batch])
            k = len(out)
            tot += np.array([lo.item(), lw.item(), lp.item()]) * k
            n += k
            evs.append(expected_points(out).cpu())
            correct += (out[:, :N_OUTCOMES].argmax(1) == yo[i:i + batch]).sum().item()
    model.train()
    return tot / max(1, n), torch.cat(evs).numpy(), correct / max(1, n)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr, dtype='<f2').tobytes()).decode('ascii')


def export(model, meta, feature_version, size):
    layers = []
    for lin in model.linears():
        w = lin.weight.detach().cpu().numpy()
        b = lin.bias.detach().cpu().numpy()
        layers.append({'rows': int(w.shape[0]), 'cols': int(w.shape[1]), 'w': b64(w), 'b': b64(b)})
    return {'featureVersion': feature_version, 'featureSize': size, 'dtype': 'f16', 'meta': meta, 'layers': layers}


def write_js(weights, path):
    body = json.dumps(weights, separators=(',', ':'))
    m = weights['meta']
    with open(path, 'w') as f:
        f.write('/* Neural Cat\'s trained weights. Generated by ml/train.py: do not edit.\n')
        f.write('   Model %s, trained %s on %s samples. */\n' % (m.get('name'), m.get('trainedAt'), m.get('samples')))
        f.write('(function (root) {\n  var W = ' + body + ';\n')
        f.write("  if (typeof module !== 'undefined' && module.exports) module.exports = W;\n")
        f.write('  else root.MahjongMLWeights = W;\n')
        f.write("})(typeof globalThis !== 'undefined' ? globalThis : this);\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', nargs='+', required=True, help='data directories from npm run ml:generate')
    ap.add_argument('--name', required=True, help='model name: writes ml/models/<name>.json')
    ap.add_argument('--hidden', default='256,128')
    ap.add_argument('--epochs', type=int, default=30)
    ap.add_argument('--batch', type=int, default=2048)
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--weight-decay', type=float, default=1e-4)
    ap.add_argument('--dropout', type=float, default=0.1)
    ap.add_argument('--patience', type=int, default=4, help='epochs without a better validation loss before stopping')
    ap.add_argument('--limit', type=int, default=0, help='use at most this many samples')
    ap.add_argument('--init', help='start from these weights (ml/models/<name>.json)')
    ap.add_argument('--device', default='auto')
    ap.add_argument('--device-bytes', type=float, default=3e9, help='data bigger than this stays in memory, off the device')
    ap.add_argument('--ship', action='store_true', help='also write js/mahjong-ml-weights.js')
    args = ap.parse_args()

    torch.manual_seed(0)
    device = args.device
    if device == 'auto':
        device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    t0 = time.time()
    x, y, manifests = load(args.data, args.limit or None)
    size = manifests[0]['featureSize']
    print('Loaded %d samples of %d features from %s (%.1fs)' % (len(x), size, ', '.join(args.data), time.time() - t0))
    counts = np.bincount(y['outcome'], minlength=N_OUTCOMES) / len(y)
    print('Outcomes: ' + ', '.join('%s %.1f%%' % (k, 100 * v) for k, v in zip(manifests[0]['outcomes'], counts)))

    # Hold out whole deals, so the same hand never sits on both sides.
    val = (y['dealSeed'].astype(np.uint64) * 2654435761 % 2**32) % 20 == 0
    to = lambda a, dt: torch.from_numpy(np.ascontiguousarray(a)).to(device=device, dtype=dt)
    tr_rows, va_rows = np.nonzero(~val)[0], np.nonzero(val)[0]
    n_train, n_val = len(tr_rows), len(va_rows)
    # Small data goes to the device whole; big data stays in memory and goes
    # over a batch at a time.
    if x.nbytes <= args.device_bytes:
        xt, xv = to(x[tr_rows], torch.float16), to(x[va_rows], torch.float16)
        fetch_t = lambda pos: xt[torch.from_numpy(pos).to(device)].float()
        fetch_v = lambda pos: xv[torch.from_numpy(pos).to(device)].float()
    else:
        fetch_t = lambda pos: torch.from_numpy(x[tr_rows[pos]]).to(device).float()
        fetch_v = lambda pos: torch.from_numpy(x[va_rows[pos]]).to(device).float()
        print('Data is %.1f GB: keeping it in memory, a batch at a time on the device' % (x.nbytes / 1e9))
    out_t, out_v = to(y['outcome'][~val], torch.long), to(y['outcome'][val], torch.long)
    win_t = to(np.clip(y['winFaan'][~val].astype(np.int64) - 3, 0, N_FAAN - 1), torch.long)
    win_v = to(np.clip(y['winFaan'][val].astype(np.int64) - 3, 0, N_FAAN - 1), torch.long)
    pay_t = to(np.clip(y['payFaan'][~val].astype(np.int64) - 3, 0, N_FAAN - 1), torch.long)
    pay_v = to(np.clip(y['payFaan'][val].astype(np.int64) - 3, 0, N_FAAN - 1), torch.long)
    delta_v = y['delta'][val]
    print('Training on %d, validating on %d, on %s' % (n_train, n_val, device))

    hidden = [int(h) for h in args.hidden.split(',') if h]
    model = Net(size, hidden, args.dropout).to(device)
    if args.init:
        with open(args.init) as f:
            init = json.load(f)
        for lin, l in zip(model.linears(), init['layers']):
            dt = '<f2' if init.get('dtype') == 'f16' else '<f4'
            w = np.frombuffer(base64.b64decode(l['w']), dtype=dt).astype(np.float32).reshape(l['rows'], l['cols'])
            b = np.frombuffer(base64.b64decode(l['b']), dtype=dt).astype(np.float32)
            lin.weight.data = torch.from_numpy(w.copy()).to(device)
            lin.bias.data = torch.from_numpy(b.copy()).to(device)
        print('Starting from ' + args.init)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best, best_state, stale = math.inf, None, 0
    for epoch in range(args.epochs):
        t1 = time.time()
        perm = np.random.default_rng(epoch).permutation(n_train)
        run = np.zeros(3)
        steps = 0
        for i in range(0, n_train, args.batch):
            pos = np.sort(perm[i:i + args.batch])
            idx = torch.from_numpy(pos).to(device)
            out = model(fetch_t(pos))
            lo, lw, lp = losses(out, out_t[idx], win_t[idx], pay_t[idx])
            loss = lo + 0.5 * lw + 0.5 * lp
            opt.zero_grad()
            loss.backward()
            opt.step()
            run += [lo.item(), lw.item(), lp.item()]
            steps += 1
        sched.step()
        vl, evs, acc = evaluate(model, fetch_v, n_val, out_v, win_v, pay_v, args.batch * 4)
        total = vl[0] + 0.5 * vl[1] + 0.5 * vl[2]
        with np.errstate(invalid='ignore', divide='ignore'):
            corr = float(np.corrcoef(evs, delta_v)[0, 1]) if len(evs) > 1 else 0.0
        if not math.isfinite(corr):
            corr = 0.0
        run /= max(1, steps)
        print('epoch %2d  train %.4f %.4f %.4f  val %.4f %.4f %.4f  outcome acc %.3f  ev~points r=%.3f  %.0fs' % (
            epoch + 1, run[0], run[1], run[2], vl[0], vl[1], vl[2], acc, corr, time.time() - t1))
        if total < best - 1e-4:
            best, stale = total, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            best_info = {'valLoss': round(float(total), 5), 'valOutcomeLoss': round(float(vl[0]), 5),
                         'valOutcomeAcc': round(acc, 4), 'evPointsCorr': round(corr, 4), 'epoch': epoch + 1}
        else:
            stale += 1
            if stale >= args.patience:
                print('No better for %d epochs: stopping.' % stale)
                break
    model.load_state_dict(best_state)
    model.eval()

    meta = dict(best_info)
    meta.update({
        'name': args.name,
        'trainedAt': time.strftime('%Y-%m-%d %H:%M'),
        'samples': int(len(x)),
        'data': [os.path.relpath(os.path.abspath(d), ROOT) for d in args.data],
        'hidden': hidden,
        'gameVersion': manifests[0].get('gameVersion'),
    })
    weights = export(model, meta, manifests[0]['featureVersion'], size)
    os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
    out_path = os.path.join(ROOT, 'ml', 'models', args.name + '.json')
    with open(out_path, 'w') as f:
        json.dump(weights, f)
    print('Wrote %s (%.0f KB), best epoch %d, val loss %.4f' % (out_path, os.path.getsize(out_path) / 1024, meta['epoch'], meta['valLoss']))

    # The JS model must give the same outputs as this one (float16 weights).
    sample = fetch_v(np.arange(min(16, n_val)))
    cpu = Net(size, hidden, 0)
    for lin, l in zip(cpu.linears(), weights['layers']):
        lin.weight.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['w']), '<f2').astype(np.float32).reshape(l['rows'], l['cols']).copy())
        lin.bias.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['b']), '<f2').astype(np.float32).copy())
    with torch.no_grad():
        expected = cpu(sample.cpu()).numpy()
    check = os.path.join(ROOT, 'ml', 'models', args.name + '.check.json')
    with open(check, 'w') as f:
        json.dump({'inputs': sample.cpu().numpy().tolist(), 'outputs': expected.tolist()}, f)
    res = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'ml', 'parity.js'), out_path, check], capture_output=True, text=True)
    print(res.stdout.strip() or res.stderr.strip()[-400:])
    if res.returncode:
        sys.exit('The JS model disagrees with the trained one.')

    if args.ship:
        js = os.path.join(ROOT, 'js', 'mahjong-ml-weights.js')
        write_js(weights, js)
        print('Shipped %s (%.0f KB)' % (js, os.path.getsize(js) / 1024))


if __name__ == '__main__':
    main()
