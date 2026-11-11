"""Neural Cat overnight, phase 3: what would an oracle that follows the option replays gain?

    ml/.venv/Scripts/python.exe ml/nc_oracle.py ml/data/ncm-claims-1 [--json out.json]

Reads scripts/ml/nc-measure.js's shards (.optlabels, 56 bytes an option row; .optrep, 3
float32s a replay: the seat's points, the points as the model counts them, the learner's
expected points at the seat's next decision or NaN). For every group (one decision of the
champion's), the options' replays share their shuffles (CRN), so each option's gap to the
champion's choice is a paired mean over the replays.

Reported, per learner seat-hand (the table's "points a hand"):
- how often the replays' best option is not the champion's and beats it by 2 SE of the gap;
- the oracle's gain, cross-fitted: the best option chosen on half the replays (even or odd),
  its gap to the champion's choice measured on the other half, the two halves averaged
  (unbiased for an oracle that sees half the replays; the in-sample maximum is shown too,
  an upper bound inflated by selection);
- the same oracle only among the options the champion weighs, and a cautious oracle that
  switches only when its half says 2 SE;
- for claims: a bias b added to passing's value (b > 0: call less), each b's gain measured
  on all replays (no selection inside a group), and the best b cross-fitted on deal halves;
- for near ties: the same with a control variate (the learner's expected points at the
  seat's next decision, centred on the option's own value at the decision).
"""
import argparse
import glob
import json
import math
import os
import sys

import numpy as np

KINDS = ['discard', 'kong', 'pass', 'pung', 'chow', 'call-kong']


def load(d):
    man = json.load(open(os.path.join(d, 'manifest.json')))
    R = man['replays']
    groups = []
    for f in sorted(glob.glob(os.path.join(d, 'shard-*.optlabels')), key=lambda x: int(x.split('-')[-1].split('.')[0])):
        shard = int(f.split('-')[-1].split('.')[0])
        L = np.fromfile(f, dtype=np.uint8).reshape(-1, 56)
        Y = np.fromfile(f[:-len('optlabels')] + 'optrep', dtype=np.float32).reshape(-1, R, 3)
        assert len(L) == len(Y), f
        gid = L[:, 0:4].copy().view(np.uint32)[:, 0]
        starts = np.flatnonzero(np.r_[True, gid[1:] != gid[:-1]])
        ends = np.r_[starts[1:], len(L)]
        for s, e in zip(starts, ends):
            l = L[s:e]
            groups.append(dict(
                shard=shard, deal=int(l[0, 20:24].copy().view(np.uint32)[0]), seat=int(l[0, 15]),
                chosen=int(np.flatnonzero(l[:, 4])[0]) if l[:, 4].any() else -1,
                kind=l[:, 5].astype(int), value=l[:, 24:28].copy().view(np.float32)[:, 0].astype(float),
                ev=l[:, 28:32].copy().view(np.float32)[:, 0].astype(float), flags=l[:, 54].astype(int),
                y=Y[s:e, :, 0].astype(float), ym=Y[s:e, :, 1].astype(float), cv=Y[s:e, :, 2].astype(float)))
    return man, groups


def per_hand(man, groups, gain):
    """gain: one number a group. Mean and SE per learner seat-hand (seat-hands without a group count 0)."""
    acc = {}
    for g, x in zip(groups, gain):
        k = (g['deal'], g['seat'])
        acc[k] = acc.get(k, 0.0) + x
    v = np.array(list(acc.values()))
    n = man['learnerSeats']
    m = v.sum() / n
    var = (np.sum(v * v) / n - m * m)
    return m, math.sqrt(max(var, 0) / (n - 1))


def oracle(groups, allowed=None, cautious=False, ykey='y'):
    """Cross-fitted gain of following the best option on one half of the replays, measured on the other."""
    out = np.zeros(len(groups))
    for i, g in enumerate(groups):
        c = g['chosen']
        if c < 0:
            continue
        y = g[ykey]
        ok = np.ones(len(y), bool) if allowed is None else allowed(g)
        ok[c] = True
        tot = 0.0
        for a, b in ((0, 1), (1, 0)):
            ya, yb = y[:, a::2], y[:, b::2]
            d = ya - ya[c]
            m = np.where(ok, d.mean(1), -np.inf)
            k = int(np.argmax(m))
            if cautious and k != c:
                se = d[k].std(ddof=1) / math.sqrt(d.shape[1])
                if not (m[k] > 2 * se):
                    k = c
            tot += (yb[k] - yb[c]).mean()
        out[i] = tot / 2
    return out


def describe(man, groups, label, ykey='y'):
    rows = {}
    n = len(groups)
    # The in-sample maximum (inflated) and "best differs beyond 2 SE".
    insample = np.zeros(n)
    differs = 0
    for i, g in enumerate(groups):
        c = g['chosen']
        d = g[ykey] - g[ykey][c]
        m = d.mean(1)
        k = int(np.argmax(m))
        insample[i] = max(m[k], 0)
        if k != c:
            se = d[k].std(ddof=1) / math.sqrt(d.shape[1])
            if m[k] > 2 * se:
                differs += 1
    rows['groups'] = n
    rows['groupsPerHand'] = n / man['learnerSeats']
    rows['bestDiffers2SE'] = differs / n
    rows['inSampleMax'] = per_hand(man, groups, insample)
    rows['oracle'] = per_hand(man, groups, oracle(groups, ykey=ykey))
    rows['oracleWeighed'] = per_hand(man, groups, oracle(groups, allowed=lambda g: (g['flags'] & 1) > 0, ykey=ykey))
    rows['oracleCautious'] = per_hand(man, groups, oracle(groups, cautious=True, ykey=ykey))
    print('== ' + label)
    print('  groups %d (%.2f a learner seat-hand, %d seat-hands); best option beats the champion\'s by 2 SE in %.1f%%' % (
        n, rows['groupsPerHand'], man['learnerSeats'], 100 * rows['bestDiffers2SE']))
    for k in ('inSampleMax', 'oracle', 'oracleWeighed', 'oracleCautious'):
        print('  %-15s %+.2f +- %.2f points a hand' % (k, rows[k][0], rows[k][1]))
    return rows


def pass_bias(man, groups):
    """Claims: passing's value moved by b; the gain of each b on all replays, and the best b cross-fitted by deal."""
    bs = [-200, -100, -50, -25, -10, 0, 10, 25, 50, 100, 200]
    res = {}
    gains = {b: np.zeros(len(groups)) for b in bs}
    for i, g in enumerate(groups):
        c = g['chosen']
        w = (g['flags'] & 1) > 0
        if c < 0 or not w[c] or w.sum() < 2:
            continue
        v = np.where(w, g['value'], -np.inf)
        isPass = g['kind'] == 2
        at = int(np.flatnonzero(g['flags'] & 2)[0]) if (g['flags'] & 2).any() else c
        for b in bs:
            vb = v + b * isPass
            top = int(np.argmax(vb))
            k = top if vb[top] > vb[at] else at
            gains[b][i] = (g['y'][k] - g['y'][c]).mean()
    for b in bs:
        res[b] = per_hand(man, groups, gains[b])
    # Cross-fit the choice of b on deal parity.
    par = np.array([g['deal'] % 2 for g in groups])
    cf = 0.0
    for h in (0, 1):
        best = max(bs, key=lambda b: gains[b][par == h].sum())
        cf += gains[best][par == 1 - h].sum()
    print('  pass bias b: ' + ', '.join('%+d: %+.2f +- %.2f' % (b, res[b][0], res[b][1]) for b in bs))
    print('  best b cross-fitted on deal halves: %+.2f points a hand' % (cf / man['learnerSeats']))
    return {str(b): res[b] for b in bs}, cf / man['learnerSeats']


def agreement(groups):
    """How often the champion's choice is the top value among what it weighs (margin 0): a check of the reconstruction."""
    a = n = 0
    for g in groups:
        w = (g['flags'] & 1) > 0
        c = g['chosen']
        if c < 0 or w.sum() < 2:
            continue
        n += 1
        a += int(np.argmax(np.where(w, g['value'], -np.inf)) == c)
    return a / max(n, 1), n


def cv_rows(man, groups):
    """Near ties: the gap with a control variate. Each replay's c = the learner's expected points at the seat's next
    decision (the replay's own points as the model counts them when the hand ended first), centred on the option's
    value at the decision (its expected points); y_cv = y - beta (c - ev), beta fitted on the pooled replays."""
    ys, cs = [], []
    for g in groups:
        c = np.where(np.isnan(g['cv']), g['ym'], g['cv'])
        g['cvFull'] = c
        ok = ~np.isnan(g['ev'])
        ys.append(g['y'][ok].ravel()); cs.append((c - g['ev'][:, None])[ok].ravel())
    y = np.concatenate(ys); c = np.concatenate(cs)
    beta = float(np.cov(y, c)[0, 1] / np.var(c))
    for g in groups:
        ev = np.nan_to_num(g['ev'])
        g['ycv'] = g['y'] - beta * (g['cvFull'] - ev[:, None])
    # Variance of the paired gap with and without.
    v0 = v1 = 0.0; m = 0
    for g in groups:
        c = g['chosen']
        for k in range(len(g['y'])):
            if k == c:
                continue
            v0 += np.var(g['y'][k] - g['y'][c], ddof=1); v1 += np.var(g['ycv'][k] - g['ycv'][c], ddof=1); m += 1
    print('  control variate: beta %.3f, paired-gap variance %.0f -> %.0f (%.0f%% left)' % (beta, v0 / m, v1 / m, 100 * v1 / v0))
    return beta, v0 / m, v1 / m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--json')
    a = ap.parse_args()
    man = None
    groups = []
    for d in a.dirs:
        m, g = load(d)
        if man is None:
            man = dict(m)
        else:
            man['learnerSeats'] += m['learnerSeats']; man['deals'] += m['deals']
        groups += g
    out = {'manifest': man}
    print('%s: %d deals, %d learner seat-hands, %d groups, %d replays an option (%s)' % (
        ','.join(a.dirs), man['deals'], man['learnerSeats'], len(groups), man['replays'], 'unseen tiles' if man.get('unseen') else 'wall only'))
    ag, n = agreement(groups)
    print('  the champion\'s pick is the top value of what it weighs in %.1f%% of %d groups' % (100 * ag, n))
    out['agreement'] = ag
    out['all'] = describe(man, groups, 'all groups')
    kinds = sorted(set(int(k) for g in groups for k in g['kind']))
    if man['kind'] == 'claims':
        for name, test in (('pung offered', lambda g: (g['kind'] == 3).any()), ('chow offered (no pung)', lambda g: (g['kind'] == 4).any() and not (g['kind'] == 3).any()),
                           ('kong offered', lambda g: (g['kind'] == 5).any())):
            sub = [g for g in groups if test(g)]
            if sub:
                out[name] = describe(man, sub, name)
        out['passBias'], out['passBiasCrossFit'] = pass_bias(man, groups)
        chosenKinds = {}
        for g in groups:
            if g['chosen'] >= 0:
                chosenKinds[KINDS[g['kind'][g['chosen']]]] = chosenKinds.get(KINDS[g['kind'][g['chosen']]], 0) + 1
        print('  the champion chose: ' + ', '.join('%s %d' % kv for kv in sorted(chosenKinds.items())))
        out['chosenKinds'] = chosenKinds
    else:
        out['cv'] = cv_rows(man, groups)
        out['allCV'] = describe(man, groups, 'all groups, with the control variate', ykey='ycv')
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1, default=float)


if __name__ == '__main__':
    main()
