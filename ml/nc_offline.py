#!/usr/bin/env python3
"""Score Neural Cat candidates offline on option replays (generate.js --native --option-replays K).

  ml/.venv/Scripts/python.exe ml/nc_offline.py --data ml/data/ncopt-1 --ref ml/models/pool/NC9.json --models a.json b.json

At each recorded turn, every discard the foundation ranks first (up to --options) was
played on K times from the position, the wall shuffled each time; each option row
has its replays' mean points (in the model's units). A model with play settings
{topK, winBonus} picks the option with the most expected points plus winBonus times
its chance to win among the first topK discards; its score at the position is that
option's replay mean. Paired against --ref position by position, so only positions
where the picks differ count. Claims and kongs are left out (their choice also
depends on the base strategy's call). Prints one JSON line per model: mean gain
in replay points per position, its standard error, and how often the pick differs.
"""

import argparse
import base64
import json
import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402


def net_of(file, device):
    with open(file) as f:
        w = json.load(f)
    layers = T.read_layers(w)
    net = T.Net(layers[0][0].shape[1], [a.shape[0] for a, _ in layers[:-1]], 0).to(device)
    for lin, (a, b) in zip(net.linears(), layers):
        lin.weight.data = torch.from_numpy(a.copy()).to(device)
        lin.bias.data = torch.from_numpy(b.copy()).to(device)
    play = (w.get('meta') or {}).get('play') or {}
    bias = (w.get('meta') or {}).get('bias')
    return net.eval(), {'topK': int(play.get('topK', 3)), 'winBonus': float(play.get('winBonus', 0))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', nargs='+', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--models', nargs='+', required=True)
    ap.add_argument('--device', default='cuda')
    ap.add_argument('--override', default=None, help='JSON {topK, winBonus} applied to every model (to sweep settings)')
    args = ap.parse_args()
    manifests = []
    for d in args.data:
        with open(os.path.join(d, 'manifest.json')) as f:
            m = json.load(f)
        m['dir'] = d
        manifests.append(m)
    o = T.load_options(manifests, manifests[0]['featureSize'])
    lab = o['labels']
    kind = lab[:, 5]
    mean = lab[:, 16:20].copy().view('<f4').ravel()
    groups = o['groups']
    # turn groups whose options are all discards (a kong among them: left out)
    gk = np.where(groups >= 0, kind[np.maximum(groups, 0)], 0)
    turn = (gk[:, 0] == 0) & np.all((groups < 0) | (gk == 0), 1) & ((groups >= 0).sum(1) >= 2)
    g = groups[turn]
    mask = g >= 0
    vals = np.where(mask, mean[np.maximum(g, 0)], -np.inf)
    x = torch.from_numpy(o['x'].astype(np.float32)).to(args.device)
    print('Turn positions: %d (of %d groups), up to %d options' % (len(g), len(groups), g.shape[1]), file=sys.stderr)

    def picks(file):
        net, play = net_of(file, args.device)
        if args.override:
            play.update(json.loads(args.override))
        with torch.no_grad():
            v = []
            for i in range(0, len(x), 65536):
                out = net(x[i:i + 65536])
                v.append(T.option_value(out, play['winBonus']).cpu().numpy())
            v = np.concatenate(v)
        gv = np.where(mask, v[np.maximum(g, 0)], -np.inf)
        gv[:, play['topK']:] = -np.inf
        return gv.argmax(1), play

    ref, _ = picks(args.ref)
    rv = vals[np.arange(len(g)), ref]
    for f in args.models:
        p, play = picks(f)
        d = vals[np.arange(len(g)), p] - rv
        n = len(d)
        print(json.dumps({'model': os.path.basename(f), 'play': play, 'gain': float(d.mean()), 'se': float(d.std() / np.sqrt(n)),
                          'differs': float((p != ref).mean()), 'positions': n}), flush=True)


if __name__ == '__main__':
    main()
