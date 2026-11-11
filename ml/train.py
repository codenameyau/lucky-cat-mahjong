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

--heads adds the frontier model's extra heads (docs/machine-learning/frontier-plan.md)
as more outputs on the same body: the hand a seat wins with, the hand the
rules read, which opponents are ready and on which tiles, and whether the
tile thrown deals in now. They learn from shard-N.aux (scripts/ml/heads.js);
data without it trains the first 28 outputs only. The model the game plays
is still the first 28 outputs; <name>.heads.json keeps all of them, and
<name>.heads-report.json says how well each head reads.

--reader FILE (a <name>.heads.json) trains a stacked model (frontier plan,
step 3): the reader's read of each position (READ_SIZE values, as
js/mahjong-ml-model.js readFeatures makes them) goes after the features, and
the move network reads both. The read is computed once per data set and
reader and cached beside the data (read-<reader hash>.f4). --init starts the
move network from a plain model with zero weights on the read, so it starts
out playing exactly as that model.

--replay learns from replayed labels (frontier plan, step 5; generate.js
--native --replays K): on a replayed row the target is the real ending and
the K replays' endings together, a distribution in place of one draw, for
how the hand ends and for the faan won and paid. Validation still scores
the one real ending, so models with and without it compare.

--options learns from option replays (frontier plan, steps 5 and 6; generate.js
--native --option-replays K): groups of rows, one for each option a seat weighed
at a position (the discards, the kong, passing, each call), each played on K
times from it. Each option row learns from its replays' endings (--option-weight),
and --rank-weight adds a listwise loss on each group: the model's values of the
options (expected points and the win bonus, as the game ranks them) against the
replays' mean values, both through a softmax at --rank-temp points. Validation
reports, on held-out groups, the points the model's pick gives up against the
replays' best (regret) and how often it is the replays' best.

Structural options (each off by default; the control is the plain run):
  --clip X        global-norm gradient clipping at X; every epoch logs the pre-clip
                  gradient norm (median, 99th percentile, max)
  --ema D         an exponential moving average of the weights (decay D a step); the
                  average is what is validated and exported
  --warmup F      linear warm-up over the first F of the steps, then the cosine decay
  --faan-cap K    the faan heads' targets clipped at K faan (a robust target: the
                  points a win is worth double with each faan, so limit hands are
                  the heavy tail of what the value reads)
  --grad-noise S  Gaussian noise on the gradients, sigma S x the gradient's RMS,
                  annealed to 0 over the run
  --arch res      a residual teacher (pre-LayerNorm blocks x + W2 relu(W1 LN(x)),
                  --width, --blocks), Python only: writes ml/models/<name>.teacher.pt
                  and its held-out loss, never a game model
  --teacher FILE  distil: the loss adds --distill-weight x the cross-entropy to the
                  teacher's soft outputs (outcome and both faan heads)

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
# scripts/ml/heads.js
N_HANDS = 12
AUX_BYTES = 6 + 102
H_WIN = OUTPUTS                    # the hand this seat wins with (12)
H_RULE = H_WIN + N_HANDS           # the hand the rules read for the tiles kept (12)
H_READY = H_RULE + N_HANDS         # each opponent ready (3)
H_DEAL = H_READY + 3               # the tile thrown deals in now (1)
H_WAITS = H_DEAL + 1               # each ready opponent's winning tiles (3 x 34)
HEAD_OUTPUTS = H_WAITS + 102
READ_SIZE = 16  # js/mahjong-ml-model.js readFeatures, read version 1


def read_layers(weights):
    """A JSON model's layers as float32 numpy arrays."""
    dt = '<f2' if weights.get('dtype') == 'f16' else '<f4'
    out = []
    for l in weights['layers']:
        w = np.frombuffer(base64.b64decode(l['w']), dtype=dt).astype(np.float32).reshape(l['rows'], l['cols'])
        b = np.frombuffer(base64.b64decode(l['b']), dtype=dt).astype(np.float32)
        out.append((w, b))
    return out


def reader_net(layers, device):
    net = Net(layers[0][0].shape[1], [w.shape[0] for w, _ in layers[:-1]], 0, layers[-1][0].shape[0])
    for lin, (w, b) in zip(net.linears(), layers):
        lin.weight.data = torch.from_numpy(w.copy())
        lin.bias.data = torch.from_numpy(b.copy())
    return net.to(device).eval()


def read_of(raw):
    """readFeatures in js/mahjong-ml-model.js: each opponent ready, the tile thrown deals in now, the hand it wins with."""
    return torch.cat([torch.sigmoid(raw[:, H_READY:H_READY + 3]), torch.sigmoid(raw[:, H_DEAL:H_DEAL + 1]),
                      torch.softmax(raw[:, H_WIN:H_WIN + N_HANDS], 1)], 1)


def cached_read(dirs, manifests, x, reader_file, device, batch=16384):
    """The reader's read of every row, cached per data set beside its shards."""
    import hashlib
    with open(reader_file, 'rb') as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:16]
    with open(reader_file) as f:
        net = reader_net(read_layers(json.load(f)), device)
    out = np.empty((len(x), READ_SIZE), dtype=np.float32)
    at = 0
    for d, m in zip(dirs, manifests):
        n = sum(s['samples'] for s in m['shards'])
        cache = os.path.join(d, 'read-%s.f4' % tag)
        if os.path.exists(cache) and os.path.getsize(cache) == n * READ_SIZE * 4:
            out[at:at + n] = np.fromfile(cache, dtype=np.float32).reshape(n, READ_SIZE)
            print('Read of %s: cached (%s)' % (d, os.path.basename(cache)))
        else:
            t0 = time.time()
            with torch.no_grad():
                for i in range(at, at + n, batch):
                    j = min(at + n, i + batch)
                    out[i:j] = read_of(net(torch.from_numpy(x[i:j].astype(np.float32)).to(device))).cpu().numpy()
            out[at:at + n].tofile(cache)
            print('Read of %s: %d rows in %.1fs, cached as %s' % (d, n, time.time() - t0, os.path.basename(cache)))
        at += n
    return out


REPLAY_BYTES = 30  # native/src/generate_nc.cpp: replays, outcome counts (6), win faan (11), pay faan (11), unused


def load(dirs, limit=None, heads=False, replay=False):
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
    # 255 in the first byte of a row: no aux for it (older data).
    aux = np.full((total, AUX_BYTES), 255, dtype=np.uint8) if heads else None
    has_aux = np.zeros(total, dtype=bool)
    rep = np.zeros((total, REPLAY_BYTES), dtype=np.uint8) if replay else None
    at = 0
    for m in manifests:
        for s in m['shards']:
            n = s['samples']
            x[at:at + n] = np.fromfile(os.path.join(m['dir'], s['features']), dtype=np.float16).reshape(-1, size)
            y = np.fromfile(os.path.join(m['dir'], s['labels']), dtype=LABEL_DTYPE)
            assert len(y) == n, 'shard size mismatch in ' + m['dir']
            labels.append(y)
            if heads and m.get('auxBytes') == AUX_BYTES and s.get('aux'):
                aux[at:at + n] = np.fromfile(os.path.join(m['dir'], s['aux']), dtype=np.uint8).reshape(-1, AUX_BYTES)
                has_aux[at:at + n] = True
            if replay and s.get('replay'):
                rep[at:at + n] = np.fromfile(os.path.join(m['dir'], s['replay']), dtype=np.uint8).reshape(-1, REPLAY_BYTES)
            at += n
    y = np.concatenate(labels)
    if limit and len(x) > limit:
        idx = np.random.default_rng(0).choice(len(x), limit, replace=False)
        x, y = x[idx], y[idx]
        has_aux = has_aux[idx]
        if heads:
            aux = aux[idx]
        if replay:
            rep = rep[idx]
    if replay:
        print('Replayed labels: %d of %d rows' % (int((rep[:, 0] > 0).sum()), total))
    return x, y, manifests, aux, has_aux, rep


OPT_BYTES = 56  # native/src/generate_nc.cpp: one option row's labels


def load_options(manifests, size):
    """The option groups of every shard that has them: features, labels, and a padded group matrix."""
    xs, ls, gid, at = [], [], [], 0
    for m in manifests:
        for s in m['shards']:
            if not s.get('options'):
                continue
            x = np.fromfile(os.path.join(m['dir'], s['options']), dtype=np.float16).reshape(-1, size)
            l = np.fromfile(os.path.join(m['dir'], s['optlabels']), dtype=np.uint8).reshape(-1, OPT_BYTES)
            assert len(x) == len(l), 'option rows mismatch in ' + m['dir']
            g = l[:, 0:4].copy().view('<u4').ravel().astype(np.int64)
            xs.append(x); ls.append(l); gid.append(g + at)
            at += int(g.max()) + 1 if len(g) else 0
    if not xs:
        return None
    x, l, g = np.concatenate(xs), np.concatenate(ls), np.concatenate(gid)
    _, g = np.unique(g, return_inverse=True)
    n_groups = int(g.max()) + 1
    order = np.argsort(g, kind='stable')
    width = int(np.bincount(g).max())
    mat = np.full((n_groups, width), -1, dtype=np.int64)
    starts = np.searchsorted(g[order], np.arange(n_groups))
    for k in range(width):
        pos = starts + k
        ok = (pos < len(order)) & (g[order][np.minimum(pos, len(order) - 1)] == np.arange(n_groups))
        mat[ok, k] = order[pos[ok]]
    seed = l[mat[:, 0], 20:24].copy().view('<u4').ravel()
    print('Option groups: %d positions, %d option rows (up to %d a position)' % (n_groups, len(x), width))
    return {'x': x, 'labels': l, 'groups': mat, 'seed': seed}


def option_value(out, bonus):
    """The value the game ranks options by: expected points plus the win bonus times the chance to win."""
    p = torch.softmax(out[:, :N_OUTCOMES], 1)
    return expected_points(out) + bonus * (p[:, 0] + p[:, 1])


def option_losses(out, lab):
    """Each option row's value heads against its replays' endings (counts only)."""
    cnt = lab[:, 9:15]
    lo = -(cnt / cnt.sum(1, keepdim=True).clamp(min=1) * F.log_softmax(out[:, :N_OUTCOMES], 1)).sum(1).mean()
    def faan(lo_, hi, c):
        m = c.sum(1) > 0
        if not m.any():
            return out.new_zeros(())
        t = c[m] / c[m].sum(1, keepdim=True)
        return -(t * F.log_softmax(out[m, lo_:hi], 1)).sum(1).mean()
    return lo + 0.5 * faan(N_OUTCOMES, N_OUTCOMES + N_FAAN, lab[:, 32:43]) + 0.5 * faan(N_OUTCOMES + N_FAAN, OUTPUTS, lab[:, 43:54])


def rank_loss(v, t, mask, temp):
    """Listwise: the replays' softmax over a group's options against the model's (padded with mask)."""
    neg = torch.finfo(v.dtype).min / 4
    tv = torch.where(mask, t / temp, torch.full_like(t, neg))
    mv = torch.where(mask, v / temp, torch.full_like(v, neg))
    p = torch.softmax(tv, 1)
    return -(p * torch.where(mask, F.log_softmax(mv, 1), torch.zeros_like(mv))).sum(1).mean()


class Net(nn.Module):
    def __init__(self, size, hidden, dropout, outputs=OUTPUTS):
        super().__init__()
        layers, prev = [], size
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, outputs))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)

    def linears(self):
        return [m for m in self.net if isinstance(m, nn.Linear)]


class ResNet(nn.Module):
    """The residual teacher (structural arm B6): pre-LayerNorm residual blocks."""
    def __init__(self, size, width, blocks, dropout, outputs=OUTPUTS):
        super().__init__()
        self.inp = nn.Linear(size, width)
        self.blocks = nn.ModuleList()
        for _ in range(blocks):
            self.blocks.append(nn.ModuleDict({'ln': nn.LayerNorm(width), 'a': nn.Linear(width, width), 'b': nn.Linear(width, width)}))
        self.drop = nn.Dropout(dropout)
        self.ln = nn.LayerNorm(width)
        self.out = nn.Linear(width, outputs)
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
                nn.init.zeros_(m.bias)
        for b in self.blocks:
            nn.init.zeros_(b['b'].weight)

    def forward(self, x):
        h = self.inp(x)
        for b in self.blocks:
            h = h + b['b'](self.drop(F.relu(b['a'](b['ln'](h)))))
        return self.out(F.relu(self.ln(h)))


def distill_loss(out, t):
    """Cross-entropy of the student's three softmax heads to the teacher's."""
    def ce(lo, hi):
        return -(F.softmax(t[:, lo:hi], 1) * F.log_softmax(out[:, lo:hi], 1)).sum(1).mean()
    return ce(0, N_OUTCOMES) + 0.5 * ce(N_OUTCOMES, N_OUTCOMES + N_FAAN) + 0.5 * ce(N_OUTCOMES + N_FAAN, OUTPUTS)


def losses(out, y_outcome, y_win, y_pay, w=None):
    # w: per-row weights of the outcome loss (--other-share: the rows of hands the seat
    # didn't win were kept with chance q, so they weigh 1/q against a won hand's 1).
    if w is None:
        lo = F.cross_entropy(out[:, :N_OUTCOMES], y_outcome)
    else:
        lo = (F.cross_entropy(out[:, :N_OUTCOMES], y_outcome, reduction='none') * w).sum() / w.sum()
    win = y_outcome <= 1
    pay = (y_outcome == 2) | (y_outcome == 3)
    zero = out.new_zeros(())
    lw = F.cross_entropy(out[win, N_OUTCOMES:N_OUTCOMES + N_FAAN], y_win[win]) if win.any() else zero
    lp = F.cross_entropy(out[pay, N_OUTCOMES + N_FAAN:OUTPUTS], y_pay[pay]) if pay.any() else zero
    return lo, lw, lp


def soft_losses(out, y_outcome, y_win, y_pay, rep):
    """losses() with replayed endings: each row's target is its real ending plus its replays'
    (rep: float, B x 30). A row with no replays is exactly losses()."""
    one = lambda y, n: F.one_hot(y, n).float()
    t_o = one(y_outcome, N_OUTCOMES) + rep[:, 1:7]
    lo = -(t_o / t_o.sum(1, keepdim=True) * F.log_softmax(out[:, :N_OUTCOMES], 1)).sum(1).mean()
    def faan(lo_, hi, y, real, counts):
        t = one(y, N_FAAN) * real.float().unsqueeze(1) + counts
        m = t.sum(1) > 0
        if not m.any():
            return out.new_zeros(())
        t = t[m] / t[m].sum(1, keepdim=True)
        return -(t * F.log_softmax(out[m, lo_:hi], 1)).sum(1).mean()
    lw = faan(N_OUTCOMES, N_OUTCOMES + N_FAAN, y_win, y_outcome <= 1, rep[:, 7:18])
    lp = faan(N_OUTCOMES + N_FAAN, OUTPUTS, y_pay, (y_outcome == 2) | (y_outcome == 3), rep[:, 18:29])
    return lo, lw, lp


def head_losses(out, a, has):
    """The extra heads' losses on the rows that carry aux labels."""
    zero = out.new_zeros(())
    if not has.any():
        return zero, zero, zero, zero, zero
    o, a = out[has], a[has]
    won = a[:, 1] < N_HANDS
    ruled = a[:, 0] < N_HANDS
    l_win = F.cross_entropy(o[won, H_WIN:H_RULE], a[won, 1].long()) if won.any() else zero
    l_rule = F.cross_entropy(o[ruled, H_RULE:H_READY], a[ruled, 0].long()) if ruled.any() else zero
    ready = (a[:, 3:6] == 0)
    l_ready = F.binary_cross_entropy_with_logits(o[:, H_READY:H_DEAL], ready.float())
    l_deal = F.binary_cross_entropy_with_logits(o[:, H_DEAL], (a[:, 2] > 0).float())
    # Waits count only for an opponent that is ready.
    waits = a[:, 6:].float().view(-1, 3, 34)
    lw = F.binary_cross_entropy_with_logits(o[:, H_WAITS:].view(-1, 3, 34), waits, reduction='none').mean(2)
    l_waits = (lw * ready.float()).sum() / ready.float().sum().clamp(min=1)
    return l_win, l_rule, l_ready, l_deal, l_waits


def auc(score, label):
    """Area under the ROC curve, by ranks."""
    label = label.astype(bool)
    pos, neg = int(label.sum()), int((~label).sum())
    if not pos or not neg:
        return float('nan')
    order = np.argsort(score, kind='mergesort')
    ranks = np.empty(len(score), dtype=np.float64)
    ranks[order] = np.arange(1, len(score) + 1)
    return float((ranks[label].sum() - pos * (pos + 1) / 2) / (pos * neg))


def heads_report(out, aux, outcome, hands):
    """How well each extra head reads, on held-out rows (numpy arrays)."""
    def softmax(z):
        z = z - z.max(1, keepdims=True)
        e = np.exp(z)
        return e / e.sum(1, keepdims=True)
    sig = lambda z: 1 / (1 + np.exp(-z))
    rep = {'rows': int(len(out))}
    p_out = softmax(out[:, :N_OUTCOMES])
    p_win = p_out[:, 0] + p_out[:, 1]
    p_hand = softmax(out[:, H_WIN:H_RULE])
    p_rule = softmax(out[:, H_RULE:H_READY])
    won = aux[:, 1] < N_HANDS
    ruled = aux[:, 0] < N_HANDS
    both = won & ruled
    # Naming the hand a seat wins with: the hand head, against the rules' read.
    rep['wins'] = int(both.sum())
    rep['handHeadNamesWin'] = float((p_hand[both].argmax(1) == aux[both, 1]).mean()) if both.any() else None
    rep['rulesNameWin'] = float((aux[both, 0] == aux[both, 1]).mean()) if both.any() else None
    rep['ruleHeadNamesWin'] = float((p_rule[both].argmax(1) == aux[both, 1]).mean()) if both.any() else None
    rep['ruleHeadMatchesRules'] = float((p_rule[ruled].argmax(1) == aux[ruled, 0]).mean()) if ruled.any() else None
    # Calibration by family: the chance to win as that hand, against how often it did.
    fam = []
    for f in range(N_HANDS):
        p = p_win * p_hand[:, f]
        y = (won & (aux[:, 1] == f) & (outcome <= 1)).astype(np.float64)
        bins = []
        edges = [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0001]
        err = 0.0
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (p >= lo) & (p < hi)
            if m.sum():
                bins.append({'from': lo, 'to': min(hi, 1.0), 'rows': int(m.sum()), 'said': float(p[m].mean()), 'happened': float(y[m].mean())})
                err += m.sum() * abs(p[m].mean() - y[m].mean())
        fam.append({'hand': hands[f], 'wins': int(y.sum()), 'said': float(p.mean()), 'happened': float(y.mean()),
                    'calibrationError': float(err / max(1, len(p))), 'auc': auc(p, y), 'bins': bins})
    rep['families'] = fam
    ready = aux[:, 3:6] == 0
    rep['readyAuc'] = auc(sig(out[:, H_READY:H_DEAL]).ravel(), ready.ravel())
    rep['readyRate'] = float(ready.mean())
    rep['dealNowAuc'] = auc(sig(out[:, H_DEAL]), aux[:, 2] > 0)
    rep['dealNowRate'] = float((aux[:, 2] > 0).mean())
    w = sig(out[:, H_WAITS:]).reshape(-1, 3, 34)
    t = aux[:, 6:].reshape(-1, 3, 34)
    rep['waitsAuc'] = auc(w[ready].ravel(), t[ready].ravel()) if ready.any() else None
    return rep


def expected_points(out):
    """The same expected points as summarize() in js/mahjong-ml-model.js."""
    o = torch.softmax(out[:, :N_OUTCOMES], 1)
    pts = 8 * torch.pow(2.0, torch.arange(N_FAAN, device=out.device, dtype=out.dtype))
    win_pts = (torch.softmax(out[:, N_OUTCOMES:N_OUTCOMES + N_FAAN], 1) * pts).sum(1)
    pay_pts = (torch.softmax(out[:, N_OUTCOMES + N_FAAN:OUTPUTS], 1) * pts).sum(1)
    return o[:, 0] * 3 * win_pts + o[:, 1] * win_pts - (o[:, 2] + o[:, 3]) * pay_pts


def evaluate(model, fetch, count, yo, yw, yp, batch, other_share=None):
    model.eval()
    tot = np.zeros(3)
    n = 0
    evs = []
    correct = 0
    with torch.no_grad():
        for i in range(0, count, batch):
            out = model(fetch(np.arange(i, min(count, i + batch))))
            wv = None
            if other_share:
                wv = torch.where(yo[i:i + batch] <= 1, torch.ones_like(out[:, 0]), torch.full_like(out[:, 0], 1.0 / other_share))
            lo, lw, lp = losses(out, yo[i:i + batch], yw[i:i + batch], yp[i:i + batch], wv)
            k = len(out) if wv is None else float(wv.sum())
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
    ap.add_argument('--heads', action='store_true', help="train the frontier model's extra heads from shard-N.aux")
    ap.add_argument('--head-weight', type=float, default=0.5, help='weight of the extra heads in the loss')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--reader', help='a <name>.heads.json: train a stacked model that reads its read')
    ap.add_argument('--replay', action='store_true', help='learn from replayed labels (shard-N.replay)')
    ap.add_argument('--options', action='store_true', help='learn from option replays (shard-N.options)')
    ap.add_argument('--option-weight', type=float, default=0.5, help="weight of the option rows' value loss")
    ap.add_argument('--rank-weight', type=float, default=0.0, help='weight of the listwise loss on each group of options')
    ap.add_argument('--rank-temp', type=float, default=100.0, help='the softmax temperature of the ranking loss, in points')
    ap.add_argument('--win-bonus', type=float, default=None, help="the win bonus options are ranked with (default: --init's, else 300)")
    ap.add_argument('--group-batch', type=int, default=256, help='option groups a step')
    ap.add_argument('--other-share', type=float, default=0.0, help='data made with generate.js --other-share q: reweight the outcome loss')
    ap.add_argument('--calib', help='an unsampled data directory: report the outcome head calibration on it')
    ap.add_argument('--clip', type=float, default=0.0)
    ap.add_argument('--ema', type=float, default=0.0)
    ap.add_argument('--warmup', type=float, default=0.0)
    ap.add_argument('--faan-cap', type=int, default=0)
    ap.add_argument('--grad-noise', type=float, default=0.0)
    ap.add_argument('--arch', default='mlp')
    ap.add_argument('--width', type=int, default=768)
    ap.add_argument('--blocks', type=int, default=4)
    ap.add_argument('--teacher')
    ap.add_argument('--distill-weight', type=float, default=1.0)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = args.device
    if device == 'auto':
        device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    if device.startswith('cuda'):
        print('GPU: %s (%.0f GB)' % (torch.cuda.get_device_name(device), torch.cuda.get_device_properties(device).total_memory / 1e9))
    t0 = time.time()
    x, y, manifests, aux, has_aux, rep = load(args.data, args.limit or None, args.heads, args.replay)
    outputs = HEAD_OUTPUTS if args.heads else OUTPUTS
    size = manifests[0]['featureSize']
    if args.reader and args.limit:
        sys.exit('--reader caches the read for whole data sets: leave out --limit')
    rd = cached_read(args.data, manifests, x, args.reader, device) if args.reader else None
    inputs = size + (READ_SIZE if args.reader else 0)
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
    raw_v = fetch_v
    if rd is not None:
        rt, rv = to(rd[tr_rows], torch.float32), to(rd[va_rows], torch.float32)
        base_t, base_v = fetch_t, fetch_v
        fetch_t = lambda pos: torch.cat([base_t(pos), rt[torch.from_numpy(pos).to(device)]], 1)
        fetch_v = lambda pos: torch.cat([base_v(pos), rv[torch.from_numpy(pos).to(device)]], 1)
    out_t, out_v = to(y['outcome'][~val], torch.long), to(y['outcome'][val], torch.long)
    cap = (args.faan_cap - 3) if args.faan_cap else N_FAAN - 1
    win_t = to(np.clip(y['winFaan'][~val].astype(np.int64) - 3, 0, cap), torch.long)
    win_v = to(np.clip(y['winFaan'][val].astype(np.int64) - 3, 0, cap), torch.long)  # --faan-cap: validated on the same capped targets
    pay_t = to(np.clip(y['payFaan'][~val].astype(np.int64) - 3, 0, cap), torch.long)
    pay_v = to(np.clip(y['payFaan'][val].astype(np.int64) - 3, 0, cap), torch.long)
    delta_v = y['delta'][val]
    if args.replay:
        rep_t = to(rep[~val], torch.float32)
    if args.heads:
        aux_t = to(aux[~val], torch.uint8)
        has_t = to(has_aux[~val], torch.bool)
        print('Extra heads: %d of %d rows carry their labels' % (int(has_aux.sum()), len(has_aux)))
    opt_data = load_options(manifests, size) if args.options else None
    if args.options and opt_data is None:
        sys.exit('--options: no shard has option rows (generate.js --native --option-replays K)')
    bonus = args.win_bonus
    if bonus is None:
        bonus = 300.0
        if args.init:
            with open(args.init) as f:
                bonus = float(((json.load(f).get('meta') or {}).get('play') or {}).get('winBonus', 300))
    if opt_data is not None:
        ox = opt_data['x']
        if args.reader:
            with open(args.reader) as f:
                rnet = reader_net(read_layers(json.load(f)), device)
            with torch.no_grad():
                ord_ = np.concatenate([read_of(rnet(torch.from_numpy(ox[i:i + 16384].astype(np.float32)).to(device))).cpu().numpy()
                                       for i in range(0, len(ox), 16384)])
            ox_in = np.concatenate([ox.astype(np.float32), ord_], 1)
        else:
            ox_in = ox.astype(np.float32)
        oxt = to(ox_in, torch.float32)
        olab = to(opt_data['labels'].astype(np.float32), torch.float32)
        omean = to(opt_data['labels'][:, 16:20].copy().view('<f4').ravel(), torch.float32)
        ocnt = opt_data['labels'][:, 9:15].astype(np.float32)
        owin = to((ocnt[:, 0] + ocnt[:, 1]) / np.maximum(1, ocnt.sum(1)), torch.float32)
        otarget = omean + bonus * owin
        gval = (opt_data['seed'].astype(np.uint64) * 2654435761 % 2**32) % 20 == 0
        gmat = opt_data['groups']
        g_tr, g_va = gmat[~gval], gmat[gval]
        print('Option groups: %d to train on, %d held out; ranked with a win bonus of %g, at %g points' % (len(g_tr), len(g_va), bonus, args.rank_temp))

    def group_batch(mat):
        m = torch.from_numpy(mat).to(device)
        mask = m >= 0
        flat = m.clamp(min=0)
        return flat, mask

    def rank_report(model):
        model.eval()
        regret, top, played = [], [], []
        with torch.no_grad():
            for i in range(0, len(g_va), 4096):
                flat, mask = group_batch(g_va[i:i + 4096])
                v = option_value(model(oxt[flat.view(-1)]), bonus).view(flat.shape)
                t = otarget[flat.view(-1)].view(flat.shape)
                v = torch.where(mask, v, torch.full_like(v, -1e30))
                tm = torch.where(mask, t, torch.full_like(t, -1e30))
                best = tm.max(1).values
                pick = v.argmax(1)
                got = t.gather(1, pick.unsqueeze(1)).squeeze(1)
                regret.append((best - got).cpu()); top.append((pick == tm.argmax(1)).cpu())
                ch = (olab[flat.view(-1), 4].view(flat.shape) > 0) & mask
                played.append((best - (t * ch).sum(1)).cpu())
        model.train()
        return float(torch.cat(regret).mean()), float(torch.cat(top).float().mean()), float(torch.cat(played).mean())

    print('Training on %d, validating on %d, on %s' % (n_train, n_val, device))

    hidden = [int(h) for h in args.hidden.split(',') if h]
    if args.arch == 'res':
        model = ResNet(inputs, args.width, args.blocks, args.dropout, outputs).to(device)
        print('Residual teacher: width %d, %d blocks, %d parameters' % (args.width, args.blocks, sum(p.numel() for p in model.parameters())))
    else:
        model = Net(inputs, hidden, args.dropout, outputs).to(device)
    teacher = None
    if args.teacher:
        tt = torch.load(args.teacher, map_location=device)
        teacher = ResNet(inputs, tt['width'], tt['blocks'], 0.0, outputs).to(device)
        teacher.load_state_dict(tt['state'])
        teacher.eval()
        print('Distilling from %s (weight %g)' % (args.teacher, args.distill_weight))
    if args.init and args.arch != 'res':
        with open(args.init) as f:
            init = json.load(f)
        for lin, l in zip(model.linears(), init['layers']):
            dt = '<f2' if init.get('dtype') == 'f16' else '<f4'
            w = np.frombuffer(base64.b64decode(l['w']), dtype=dt).astype(np.float32).reshape(l['rows'], l['cols'])
            b = np.frombuffer(base64.b64decode(l['b']), dtype=dt).astype(np.float32)
            # More rows than the start (the extra heads, or a wider layer): the new rows keep
            # their own random start. More columns (a stacked model's read, or the units
            # a wider layer below added): zeros, so the model starts out as the one it came
            # from, and the new units learn from there.
            rows = min(l['rows'], lin.weight.shape[0])
            if lin.weight.shape[1] != w.shape[1]:
                lin.weight.data[:, w.shape[1]:] = 0
                lin.weight.data[:rows, :w.shape[1]] = torch.from_numpy(w[:rows].copy()).to(device)
                lin.bias.data[:rows] = torch.from_numpy(b[:rows].copy()).to(device)
                continue
            lin.weight.data[:rows] = torch.from_numpy(w[:rows].copy()).to(device)
            lin.bias.data[:rows] = torch.from_numpy(b[:rows].copy()).to(device)
        print('Starting from ' + args.init)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    steps_per_epoch = (n_train + args.batch - 1) // args.batch
    total_steps = steps_per_epoch * args.epochs
    warm = int(args.warmup * total_steps)
    if warm:
        # Linear warm-up, then the cosine decay, by step.
        sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda st: (st + 1) / warm if st < warm else 0.5 * (1 + math.cos(math.pi * (st - warm) / max(1, total_steps - warm))))
    else:
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    ema = None
    if args.ema:
        ema = {k: v.detach().clone() for k, v in model.state_dict().items()}
    gstep = 0

    best, best_state, stale = math.inf, None, 0
    for epoch in range(args.epochs):
        t1 = time.time()
        perm = np.random.default_rng(epoch).permutation(n_train)
        norms = []
        run = np.zeros(3)
        steps = 0
        for i in range(0, n_train, args.batch):
            pos = np.sort(perm[i:i + args.batch])
            idx = torch.from_numpy(pos).to(device)
            out = model(fetch_t(pos))
            if args.replay:
                lo, lw, lp = soft_losses(out, out_t[idx], win_t[idx], pay_t[idx], rep_t[idx])
            else:
                bw = None
                if args.other_share:
                    yb = out_t[idx]
                    bw = torch.where(yb <= 1, torch.ones_like(out[:, 0]), torch.full_like(out[:, 0], 1.0 / args.other_share))
                lo, lw, lp = losses(out, out_t[idx], win_t[idx], pay_t[idx], bw)
            loss = lo + 0.5 * lw + 0.5 * lp
            if args.heads:
                loss = loss + args.head_weight * sum(head_losses(out, aux_t[idx], has_t[idx]))
            if opt_data is not None and len(g_tr):
                gsel = g_tr[np.random.default_rng(epoch * 100003 + steps).integers(0, len(g_tr), args.group_batch)]
                flat, mask = group_batch(gsel)
                rows = flat[mask]
                o_out = model(oxt[rows])
                loss = loss + args.option_weight * option_losses(o_out, olab[rows])
                if args.rank_weight:
                    full = torch.zeros(flat.numel(), o_out.shape[1], device=device, dtype=o_out.dtype)
                    full[mask.view(-1)] = o_out
                    v = option_value(full, bonus).view(flat.shape)
                    t = otarget[flat.view(-1)].view(flat.shape)
                    loss = loss + args.rank_weight * rank_loss(v, t, mask, args.rank_temp)
            if teacher is not None:
                with torch.no_grad():
                    tout = teacher(fetch_t(pos))
                loss = loss + args.distill_weight * distill_loss(out, tout)
            opt.zero_grad()
            loss.backward()
            if args.grad_noise:
                frac = 1 - gstep / max(1, total_steps)
                for p in model.parameters():
                    if p.grad is not None:
                        rms = p.grad.pow(2).mean().sqrt()
                        p.grad.add_(torch.randn_like(p.grad) * args.grad_noise * rms * frac)
            if args.clip:
                gn = torch.nn.utils.clip_grad_norm_(model.parameters(), args.clip)
                norms.append(float(gn))
            else:
                norms.append(float(torch.nn.utils.clip_grad_norm_(model.parameters(), float('inf'))))
            opt.step()
            if warm:
                sched.step()
            gstep += 1
            if ema is not None:
                with torch.no_grad():
                    for k, v in model.state_dict().items():
                        if v.dtype.is_floating_point:
                            ema[k].mul_(args.ema).add_(v, alpha=1 - args.ema)
                        else:
                            ema[k].copy_(v)
            run += [lo.item(), lw.item(), lp.item()]
            steps += 1
        if not warm:
            sched.step()
        if norms:
            q = np.percentile(np.array(norms), [50, 99, 100])
            print('  grad norm before clipping: median %.3f, 99th %.3f, max %.3f (cap %g, over it on %.1f%% of steps)' % (q[0], q[1], q[2], args.clip, 100 * np.mean(np.array(norms) > args.clip) if args.clip else 0.0))
        if ema is not None:
            live = {k: v.detach().clone() for k, v in model.state_dict().items()}
            model.load_state_dict(ema)
        vl, evs, acc = evaluate(model, fetch_v, n_val, out_v, win_v, pay_v, args.batch * 4, args.other_share or None)
        total = vl[0] + 0.5 * vl[1] + 0.5 * vl[2]
        with np.errstate(invalid='ignore', divide='ignore'):
            corr = float(np.corrcoef(evs, delta_v)[0, 1]) if len(evs) > 1 else 0.0
        if not math.isfinite(corr):
            corr = 0.0
        run /= max(1, steps)
        rr = rank_report(model) if opt_data is not None and len(g_va) else None
        print('epoch %2d  train %.4f %.4f %.4f  val %.4f %.4f %.4f  outcome acc %.3f  ev~points r=%.3f%s  %.0fs' % (
            epoch + 1, run[0], run[1], run[2], vl[0], vl[1], vl[2], acc, corr,
            ('  options: regret %.1f points, picks the best %.1f%% (as played: regret %.1f)' % (rr[0], 100 * rr[1], rr[2])) if rr else '',
            time.time() - t1))
        if total < best - 1e-4:
            best, stale = total, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            if ema is not None:
                pass  # model holds the EMA weights here: they are what is kept
            best_info = {'valLoss': round(float(total), 5), 'valOutcomeLoss': round(float(vl[0]), 5),
                         'valOutcomeAcc': round(acc, 4), 'evPointsCorr': round(corr, 4), 'epoch': epoch + 1}
            if rr:
                best_info.update({'optionRegret': round(rr[0], 2), 'optionPicksBest': round(rr[1], 4), 'optionRegretAsPlayed': round(rr[2], 2)})
        else:
            stale += 1
            if stale >= args.patience:
                print('No better for %d epochs: stopping.' % stale)
                break
        if ema is not None:
            model.load_state_dict(live)
    model.load_state_dict(best_state)
    model.eval()
    if args.calib:
        cx, cy, _, _, _, _ = load([args.calib], 400000)
        with torch.no_grad():
            ps = []
            for i in range(0, len(cx), 16384):
                o = model(torch.from_numpy(cx[i:i + 16384].astype(np.float32)).to(device))
                ps.append(F.softmax(o[:, :N_OUTCOMES], 1).cpu().numpy())
            p = np.concatenate(ps)
        freq = np.bincount(cy['outcome'], minlength=N_OUTCOMES) / len(cy)
        print('Calibration on %s (%d rows, unsampled): predicted %s, happened %s' % (args.calib, len(cy),
              ' '.join('%.4f' % v for v in p.mean(0)), ' '.join('%.4f' % v for v in freq)))
    if args.arch == 'res':
        os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
        tp = os.path.join(ROOT, 'ml', 'models', args.name + '.teacher.pt')
        torch.save({'state': best_state, 'width': args.width, 'blocks': args.blocks, 'info': best_info}, tp)
        print('Wrote teacher %s: best epoch %d, val loss %.4f (outcome %.4f)' % (tp, best_info['epoch'], best_info['valLoss'], best_info['valOutcomeLoss']))
        return

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
    if args.reader:
        with open(args.reader) as f:
            rw = json.load(f)
        weights['readerVersion'] = 1
        weights['reader'] = {'dtype': rw.get('dtype', 'f16'), 'layers': rw['layers']}
        weights['meta']['reader'] = (rw.get('meta') or {}).get('name') or os.path.basename(args.reader)
    full = None
    if args.heads:
        # The game plays the first 28 outputs; the rest are kept beside it.
        full = json.loads(json.dumps(weights))
        last = model.linears()[-1]
        w = last.weight.detach().cpu().numpy()[:OUTPUTS]
        b = last.bias.detach().cpu().numpy()[:OUTPUTS]
        weights['layers'][-1] = {'rows': OUTPUTS, 'cols': int(w.shape[1]), 'w': b64(w), 'b': b64(b)}
    os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
    out_path = os.path.join(ROOT, 'ml', 'models', args.name + '.json')
    with open(out_path, 'w') as f:
        json.dump(weights, f)
    print('Wrote %s (%.0f KB), best epoch %d, val loss %.4f' % (out_path, os.path.getsize(out_path) / 1024, meta['epoch'], meta['valLoss']))
    if args.heads:
        with open(os.path.join(ROOT, 'ml', 'models', args.name + '.heads.json'), 'w') as f:
            json.dump(full, f)
        va = np.nonzero(val)[0][has_aux[val]]
        outs = []
        with torch.no_grad():
            for i in range(0, len(va), args.batch * 4):
                rows = va[i:i + args.batch * 4]
                xin = torch.from_numpy(x[rows].astype(np.float32)).to(device)
                if rd is not None:
                    xin = torch.cat([xin, torch.from_numpy(rd[rows]).to(device)], 1)
                outs.append(model(xin).cpu().numpy())
        if outs:
            rep = heads_report(np.concatenate(outs).astype(np.float64), aux[va], y['outcome'][va], manifests[-1].get('hands') or [str(i) for i in range(N_HANDS)])
            rep['name'] = args.name
            with open(os.path.join(ROOT, 'ml', 'models', args.name + '.heads-report.json'), 'w') as f:
                json.dump(rep, f, indent=1)
            print('Hand head names the winning hand %.1f%% of the time; the rules\' read %.1f%% (%d wins held out)' % (
                100 * (rep['handHeadNamesWin'] or 0), 100 * (rep['rulesNameWin'] or 0), rep['wins']))
            print('Ready AUC %.3f, deals in now AUC %.3f, waits AUC %.3f' % (rep['readyAuc'], rep['dealNowAuc'], rep['waitsAuc'] or float('nan')))
            for fm in rep['families']:
                print('  %-20s said %.3f%%  happened %.3f%%  wins %5d  AUC %.3f' % (fm['hand'], 100 * fm['said'], 100 * fm['happened'], fm['wins'], fm['auc']))

    # The JS model must give the same outputs as this one (float16 weights).
    # The check's inputs are the features alone: a stacked model's JS runs its reader itself.
    sample = raw_v(np.arange(min(16, n_val))).cpu()
    cpu = Net(inputs, hidden, 0)
    for lin, l in zip(cpu.linears(), weights['layers']):
        lin.weight.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['w']), '<f2').astype(np.float32).reshape(l['rows'], l['cols']).copy())
        lin.bias.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['b']), '<f2').astype(np.float32).copy())
    with torch.no_grad():
        if args.reader:
            rnet = reader_net(read_layers(weights['reader']), 'cpu')
            expected = cpu(torch.cat([sample, read_of(rnet(sample))], 1)).numpy()
        else:
            expected = cpu(sample).numpy()
    check = os.path.join(ROOT, 'ml', 'models', args.name + '.check.json')
    with open(check, 'w') as f:
        json.dump({'inputs': sample.cpu().numpy().tolist(), 'outputs': expected.tolist()}, f)
    res = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'ml', 'parity.js'), out_path, check], capture_output=True, text=True)
    print(res.stdout.strip() or res.stderr.strip()[-400:])
    if res.returncode:
        sys.exit('The JS model disagrees with the trained one.')

    if args.ship:
        # scripts/ml/ship.js names the release (NC1, NC2, ...) and writes the file.
        js = os.path.join(ROOT, 'js', 'mahjong-ml-weights.js')
        res = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'ml', 'ship.js'), out_path], cwd=ROOT, capture_output=True, text=True)
        if res.returncode:
            sys.exit(res.stderr.strip()[-400:])
        print('Shipped %s (%.0f KB)' % (js, os.path.getsize(js) / 1024))


if __name__ == '__main__':
    main()
