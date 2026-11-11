#!/usr/bin/env python3
"""Train several Neural Cat arms in one GPU pass (the overnight loop, scripts/ml/nc-overnight.js).

  ml/.venv/Scripts/python.exe ml/nc_multi.py --data ml/data/a ml/data/b --arms arms.json

Loads the data once, puts it on the device once (float16), and feeds every
batch to every arm: each arm is its own network, optimiser and schedule
(learning rate, epochs, patience, dropout, weight decay, seed, init), with
its own best epoch by validation loss. The losses, the held-out deals, the
export and the JS parity check are ml/train.py's, so an arm trained here is
the model train.py would make with the same settings (up to the batch order,
which is shared).

arms.json: a list of {"name", "lr", "epochs", "patience", "dropout",
"weightDecay", "seed", "init" (a .json model), "hidden" ("512,256"),
"batch" (2048), "winWeight" (0.5), "payWeight" (0.5), "sampleWeight"
(optional: "learner" weights the learner's rows by 2),
structural options: "clip" (global gradient-norm clipping; the pre-clip norm's
median, 99th percentile and max are logged every epoch for every arm), "ema"
(decay per step: the averaged weights are validated and exported), "warmup"
(linear warm-up over this share of the steps), "faanSmooth" (label smoothing on
the faan heads), "gradNoise" (Gaussian noise of this times the gradient's RMS,
annealed to 0), "teacher" (a .f16 file of a teacher's 28 outputs for every row,
ml/nc_teacher.py) with "distill" (the share of the loss on the teacher's softmaxes),
"adv" {"weight", "huber" (points), "tau" (0: Huber on advantages; else a listwise
loss toward softmax(replayed points / tau)), "groups" (a step)}: learn the options'
differences from common-random-number option replays (--adv-data, generate.js
--native --option-replays K --crn): the network's expected points of each option
less the group's mean against the replays' mean points less theirs}.
Writes ml/models/<name>.json for each arm and prints one JSON line per arm
(name, best epoch, validation loss, seconds).
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
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402

ROOT = T.ROOT


def init_from(model, file, device):
    with open(file) as f:
        init = json.load(f)
    dt = '<f2' if init.get('dtype') == 'f16' else '<f4'
    for lin, l in zip(model.linears(), init['layers']):
        w = np.frombuffer(base64.b64decode(l['w']), dtype=dt).astype(np.float32).reshape(l['rows'], l['cols'])
        b = np.frombuffer(base64.b64decode(l['b']), dtype=dt).astype(np.float32)
        lin.weight.data[:] = torch.from_numpy(w.copy()).to(device)
        lin.bias.data[:] = torch.from_numpy(b.copy()).to(device)
    return init


def soft_ce(logits, target_logits):
    return -(torch.softmax(target_logits, 1) * F.log_softmax(logits, 1)).sum(1).mean()


def losses(out, yo, yw, yp, smooth):
    if not smooth:
        return T.losses(out, yo, yw, yp)
    lo = F.cross_entropy(out[:, :T.N_OUTCOMES], yo)
    win, pay = yo <= 1, (yo == 2) | (yo == 3)
    z = out.new_zeros(())
    lw = F.cross_entropy(out[win, T.N_OUTCOMES:T.N_OUTCOMES + T.N_FAAN], yw[win], label_smoothing=smooth) if win.any() else z
    lp = F.cross_entropy(out[pay, T.N_OUTCOMES + T.N_FAAN:T.OUTPUTS], yp[pay], label_smoothing=smooth) if pay.any() else z
    return lo, lw, lp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', nargs='+', required=True)
    ap.add_argument('--arms', required=True)
    ap.add_argument('--device', default='cuda')
    ap.add_argument('--device-bytes', type=float, default=5e9)
    ap.add_argument('--batch', type=int, default=2048)
    ap.add_argument('--adv-data', nargs='*', default=[], help='option-replay data sets (with --crn) for "adv" arms')
    args = ap.parse_args()
    with open(args.arms) as f:
        arms = json.load(f)
    device = args.device
    t0 = time.time()
    x, y, manifests, _, _, _ = T.load(args.data)
    size = manifests[0]['featureSize']
    print('Loaded %d samples from %d sets (%.1fs)' % (len(x), len(args.data), time.time() - t0), flush=True)
    val = (y['dealSeed'].astype(np.uint64) * 2654435761 % 2**32) % 20 == 0
    to = lambda a, dt: torch.from_numpy(np.ascontiguousarray(a)).to(device=device, dtype=dt)
    tr_rows, va_rows = np.nonzero(~val)[0], np.nonzero(val)[0]
    n_train, n_val = len(tr_rows), len(va_rows)
    if x.nbytes <= args.device_bytes:
        xt, xv = to(x[tr_rows], torch.float16), to(x[va_rows], torch.float16)
        fetch_t = lambda idx: xt[idx].float()
        fetch_v_np = lambda pos: xv[torch.from_numpy(pos).to(device)].float()
        del x
    else:
        fetch_t = lambda idx: torch.from_numpy(x[tr_rows[idx.cpu().numpy()]]).to(device).float()
        fetch_v_np = lambda pos: torch.from_numpy(x[va_rows[pos]]).to(device).float()
        print('Data is %.1f GB: a batch at a time on the device' % (x.nbytes / 1e9), flush=True)
    out_t, out_v = to(y['outcome'][~val], torch.long), to(y['outcome'][val], torch.long)
    cl = lambda a: np.clip(a.astype(np.int64) - 3, 0, T.N_FAAN - 1)
    win_t, win_v = to(cl(y['winFaan'][~val]), torch.long), to(cl(y['winFaan'][val]), torch.long)
    pay_t, pay_v = to(cl(y['payFaan'][~val]), torch.long), to(cl(y['payFaan'][val]), torch.long)
    learner_idx = manifests[0]['strategies'].index('neural-cat') if 'neural-cat' in manifests[0]['strategies'] else -1
    strat_t = to(y['strategy'][~val], torch.long)
    adv = None
    if args.adv_data:
        ams = []
        for d in args.adv_data:
            with open(os.path.join(d, 'manifest.json')) as f:
                m = json.load(f)
            m['dir'] = d
            ams.append(m)
        o = T.load_options(ams, size)
        gm = o['groups']
        gval = (o['seed'].astype(np.uint64) * 2654435761 % 2**32) % 20 == 0
        omean = o['labels'][:, 16:20].copy().view('<f4').ravel()
        adv = {'x': to(o['x'], torch.float16), 'mean': to(omean, torch.float32), 'tr': gm[~gval], 'va': gm[gval]}
        print('Advantage groups: %d to train on, %d held out' % (len(adv['tr']), len(adv['va'])), flush=True)

    def adv_loss(model, mat, spec):
        m = torch.from_numpy(mat).to(device)
        mask = m >= 0
        flat = m.clamp(min=0)
        ev = T.expected_points(model(adv['x'][flat.view(-1)].float())).view(flat.shape)
        t = adv['mean'][flat.view(-1)].view(flat.shape)
        cnt = mask.sum(1, keepdim=True).clamp(min=1)
        evc = ev - (ev * mask).sum(1, keepdim=True) / cnt
        tc = t - (t * mask).sum(1, keepdim=True) / cnt
        if spec.get('tau'):
            return T.rank_loss(ev, t, mask, spec['tau'])
        h = spec.get('huber', 200.0)
        e = (evc - tc).abs()
        l = torch.where(e < h, 0.5 * e * e / h, e - 0.5 * h)
        return (l * mask).sum() / mask.sum() / 100.0

    def adv_report(model):
        if adv is None or not len(adv['va']):
            return None
        model.eval()
        reg, top = [], []
        with torch.no_grad():
            for i in range(0, len(adv['va']), 4096):
                m = torch.from_numpy(adv['va'][i:i + 4096]).to(device)
                mask = m >= 0
                flat = m.clamp(min=0)
                ev = T.expected_points(model(adv['x'][flat.view(-1)].float())).view(flat.shape)
                t = adv['mean'][flat.view(-1)].view(flat.shape)
                ev = torch.where(mask, ev, torch.full_like(ev, -1e30))
                tm = torch.where(mask, t, torch.full_like(t, -1e30))
                pick = ev.argmax(1)
                reg.append((tm.max(1).values - t.gather(1, pick.unsqueeze(1)).squeeze(1)).cpu())
                top.append((pick == tm.argmax(1)).cpu())
        model.train()
        return float(torch.cat(reg).mean()), float(torch.cat(top).float().mean())

    teachers = {}
    for a in arms:
        if a.get('teacher') and a['teacher'] not in teachers:
            tl = np.fromfile(a['teacher'], dtype=np.float16).reshape(-1, T.OUTPUTS)
            assert len(tl) == len(y), 'teacher rows %d, data rows %d' % (len(tl), len(y))
            teachers[a['teacher']] = to(tl[~val], torch.float16)
    delta_v = y['delta'][val]

    runs = []
    for a in arms:
        torch.manual_seed(a.get('seed', 0))
        hidden = [int(h) for h in str(a.get('hidden', '512,256')).split(',') if h]
        model = T.Net(size, hidden, a.get('dropout', 0.2)).to(device)
        if a.get('init'):
            init_from(model, a['init'], device)
        opt = torch.optim.AdamW(model.parameters(), lr=a['lr'], weight_decay=a.get('weightDecay', 1e-3))
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a['epochs'])
        ema = None
        if a.get('ema'):
            ema = T.Net(size, hidden, a.get('dropout', 0.2)).to(device)
            ema.load_state_dict(model.state_dict())
            ema.eval()
        runs.append({'a': a, 'hidden': hidden, 'model': model, 'opt': opt, 'sched': sched, 'best': math.inf, 'ema': ema,
                     'state': None, 'info': None, 'stale': 0, 'done': False, 't': 0.0, 'epochs': 0, 'norms': [], 'step': 0})
    steps_per_epoch = (n_train + args.batch - 1) // args.batch
    max_epochs = max(a['epochs'] for a in arms)
    print('Training %d arms on %d rows, validating on %d' % (len(arms), n_train, n_val), flush=True)
    for epoch in range(max_epochs):
        live = [r for r in runs if not r['done'] and epoch < r['a']['epochs']]
        if not live:
            break
        t1 = time.time()
        perm = torch.from_numpy(np.random.default_rng(epoch).permutation(n_train)).to(device)
        for i in range(0, n_train, args.batch):
            idx = perm[i:i + args.batch].sort().values
            xb = fetch_t(idx)
            yo, yw, yp = out_t[idx], win_t[idx], pay_t[idx]
            for r in live:
                a = r['a']
                out = r['model'](xb)
                if a.get('sampleWeight') == 'learner':
                    wgt = 1.0 + (strat_t[idx] == learner_idx).float()
                    lo = (F.cross_entropy(out[:, :T.N_OUTCOMES], yo, reduction='none') * wgt).sum() / wgt.sum()
                    _, lw, lp = losses(out, yo, yw, yp, a.get('faanSmooth', 0))
                else:
                    lo, lw, lp = losses(out, yo, yw, yp, a.get('faanSmooth', 0))
                loss = lo + a.get('winWeight', 0.5) * lw + a.get('payWeight', 0.5) * lp
                if a.get('teacher'):
                    tl = teachers[a['teacher']][idx].float()
                    O, W_ = T.N_OUTCOMES, T.N_OUTCOMES + T.N_FAAN
                    ld = soft_ce(out[:, :O], tl[:, :O]) + 0.5 * soft_ce(out[:, O:W_], tl[:, O:W_]) + 0.5 * soft_ce(out[:, W_:], tl[:, W_:])
                    loss = (1 - a.get('distill', 0.5)) * loss + a.get('distill', 0.5) * ld
                if a.get('adv') and adv is not None:
                    sp = a['adv']
                    sel = adv['tr'][np.random.default_rng(r['step'] * 7919 + a.get('seed', 0)).integers(0, len(adv['tr']), sp.get('groups', 256))]
                    loss = loss + sp.get('weight', 1.0) * adv_loss(r['model'], sel, sp)
                total_steps = steps_per_epoch * a['epochs']
                if a.get('warmup'):
                    base_lr = a['lr'] * 0.5 * (1 + math.cos(math.pi * r['epochs'] / a['epochs']))
                    for gp in r['opt'].param_groups:
                        gp['lr'] = base_lr * min(1.0, (r['step'] + 1) / max(1, a['warmup'] * total_steps))
                r['opt'].zero_grad(set_to_none=True)
                loss.backward()
                gn = torch.nn.utils.clip_grad_norm_(r['model'].parameters(), a['clip'] if a.get('clip') else float('inf'))
                r['norms'].append(gn.detach())
                if a.get('gradNoise'):
                    frac = max(0.0, 1 - r['step'] / total_steps)
                    for prm in r['model'].parameters():
                        if prm.grad is not None:
                            rms = prm.grad.pow(2).mean().sqrt()
                            prm.grad.add_(torch.randn_like(prm.grad) * a['gradNoise'] * frac * rms)
                r['opt'].step()
                r['step'] += 1
                if r['ema'] is not None:
                    with torch.no_grad():
                        for pe, pm in zip(r['ema'].parameters(), r['model'].parameters()):
                            pe.mul_(a['ema']).add_(pm.detach(), alpha=1 - a['ema'])
        for r in live:
            if not r['a'].get('warmup'):
                r['sched'].step()
            r['epochs'] += 1
            nm = torch.stack(r['norms']).float().cpu().numpy()
            r['norms'] = []
            clip = r['a'].get('clip')
            print('%s epoch %d grad norm median %.3f p99 %.3f max %.3f%s' % (r['a']['name'], epoch + 1, np.median(nm), np.percentile(nm, 99), nm.max(),
                  (' (clip %g bites on %.1f%% of steps)' % (clip, 100 * (nm > clip).mean())) if clip else ''), flush=True)
            evm = r['ema'] if r['ema'] is not None else r['model']
            vl, evs, acc = T.evaluate(evm, fetch_v_np, n_val, out_v, win_v, pay_v, args.batch * 4)
            total = vl[0] + 0.5 * vl[1] + 0.5 * vl[2]
            with np.errstate(invalid='ignore', divide='ignore'):
                corr = float(np.corrcoef(evs, delta_v)[0, 1]) if len(evs) > 1 else 0.0
            if not math.isfinite(corr):
                corr = 0.0
            ar = adv_report(evm)
            print('%s epoch %d val %.5f acc %.4f r %.3f%s' % (r['a']['name'], epoch + 1, total, acc, corr,
                  ('  options: regret %.2f, picks the replays\' best %.1f%%' % (ar[0], 100 * ar[1])) if ar else ''), flush=True)
            if total < r['best'] - 1e-5:
                r['best'], r['stale'] = total, 0
                r['state'] = {k: v.detach().clone() for k, v in evm.state_dict().items()}
                r['info'] = {'valLoss': round(float(total), 5), 'valOutcomeLoss': round(float(vl[0]), 5),
                             'valOutcomeAcc': round(acc, 4), 'evPointsCorr': round(corr, 4), 'epoch': epoch + 1}
            else:
                r['stale'] += 1
                if r['stale'] >= r['a'].get('patience', 3):
                    r['done'] = True
        print('epoch %d: %d arms, %.1fs' % (epoch + 1, len(live), time.time() - t1), flush=True)

    os.makedirs(os.path.join(ROOT, 'ml', 'models'), exist_ok=True)
    sample = fetch_v_np(np.arange(min(16, n_val))).cpu()
    for r in runs:
        a = r['a']
        r['model'].load_state_dict(r['state'])
        r['model'].eval()
        meta = dict(r['info'])
        meta.update({'name': a['name'], 'trainedAt': time.strftime('%Y-%m-%d %H:%M'), 'samples': int(n_train + n_val),
                     'data': [os.path.relpath(os.path.abspath(d), ROOT) for d in args.data], 'hidden': r['hidden'],
                     'gameVersion': manifests[0].get('gameVersion'), 'arm': a})
        weights = T.export(r['model'], meta, manifests[0]['featureVersion'], size)
        out_path = os.path.join(ROOT, 'ml', 'models', a['name'] + '.json')
        with open(out_path, 'w') as f:
            json.dump(weights, f)
        cpu = T.Net(size, r['hidden'], 0)
        for lin, l in zip(cpu.linears(), weights['layers']):
            lin.weight.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['w']), '<f2').astype(np.float32).reshape(l['rows'], l['cols']).copy())
            lin.bias.data = torch.from_numpy(np.frombuffer(base64.b64decode(l['b']), '<f2').astype(np.float32).copy())
        with torch.no_grad():
            expected = cpu(sample).numpy()
        check = os.path.join(ROOT, 'ml', 'models', a['name'] + '.check.json')
        with open(check, 'w') as f:
            json.dump({'inputs': sample.numpy().tolist(), 'outputs': expected.tolist()}, f)
        res = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'ml', 'parity.js'), out_path, check], capture_output=True, text=True)
        if res.returncode:
            sys.exit('The JS model disagrees with %s: %s' % (a['name'], res.stdout + res.stderr))
        print('ARM ' + json.dumps({'name': a['name'], 'file': os.path.relpath(out_path, ROOT), 'epoch': meta['epoch'],
                                   'valLoss': meta['valLoss'], 'epochs': r['epochs']}), flush=True)
    print('Total %.1fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
