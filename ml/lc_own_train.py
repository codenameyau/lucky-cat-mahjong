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
import copy
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
        return np.frombuffer(base64.b64decode(v), dtype="<f2" if dtype == "f16" else "<f4").astype(np.float32)
    return np.asarray(v, dtype=np.float32)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr, dtype="<f2").tobytes()).decode("ascii")


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


class ResNet(nn.Module):
    """A teacher (Python only): pre-norm residual blocks x + W2 relu(W1 LN(x)), Kaiming init."""
    def __init__(self, size, width, blocks):
        super().__init__()
        self.inp = nn.Linear(size, width)
        self.norms = nn.ModuleList([nn.LayerNorm(width) for _ in range(blocks)])
        self.w1 = nn.ModuleList([nn.Linear(width, width) for _ in range(blocks)])
        self.w2 = nn.ModuleList([nn.Linear(width, width) for _ in range(blocks)])
        self.out_norm = nn.LayerNorm(width)
        self.out = nn.Linear(width, OUTPUTS)
        for l in [self.inp] + list(self.w1):
            nn.init.kaiming_normal_(l.weight, nonlinearity="relu"); nn.init.zeros_(l.bias)
        for l in self.w2:
            nn.init.zeros_(l.weight); nn.init.zeros_(l.bias)

    def forward(self, x):
        h = self.inp(x)
        for n_, a, b in zip(self.norms, self.w1, self.w2):
            h = h + b(torch.relu(a(n_(h))))
        return self.out(torch.relu(self.out_norm(h)))


def load_model(path):
    w = json.load(open(os.path.join(ROOT, path)))
    sizes = [w["layers"][0]["cols"]] + [l["rows"] for l in w["layers"]]
    net = Net(sizes)
    with torch.no_grad():
        for l, src in zip(net.layers, w["layers"]):
            l.weight.copy_(torch.from_numpy(floats(src["w"], w.get("dtype")).reshape(src["rows"], src["cols"])))
            l.bias.copy_(torch.from_numpy(floats(src["b"], w.get("dtype"))))
    return net, w


def save_model(net, base, name, extra):
    layers = [{"rows": l.out_features, "cols": l.in_features, "w": b64(l.weight.detach().cpu().numpy()), "b": b64(l.bias.detach().cpu().numpy())} for l in net.layers]
    meta = dict(base.get("meta", {}))
    meta.update({"name": name, "trainedAt": time.strftime("%Y-%m-%d %H:%M"), "hidden": [l.out_features for l in net.layers[:-1]]})
    meta.update(extra)
    out = {"featureVersion": base["featureVersion"], "featureSize": base["featureSize"], "dtype": "f16", "meta": meta, "layers": layers}
    path = os.path.join(ROOT, "ml", "models", name + ".json")
    json.dump(out, open(path, "w"))
    return path


def js_check(net, path, x):
    probe = x[:4].astype(np.float32)
    with torch.no_grad():
        want = net.cpu()(torch.from_numpy(probe)).numpy()
    js = ("const N=require(process.argv[1]+'/js/mahjong-lucky-cat-net.js');const m=N.createModel(require(process.argv[2]));"
          "const xs=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(xs.map(x=>m.forward(Float32Array.from(x)))));")
    got = np.array(json.loads(subprocess.run(["node", "-e", js, ROOT, path], input=json.dumps(probe.tolist()), capture_output=True, text=True, check=True).stdout))
    err = float(np.abs(got - want).max())
    if err > 0.05 * max(1.0, float(np.abs(want).max())):
        raise SystemExit(f"{path}: the JS model disagrees ({err})")
    return err


def load(dirs):
    xs, legal, qa, qp, qw, hs, qs = [], [], [], [], [], [], []
    for di, d in enumerate(dirs):
        full = os.path.join(ROOT, d)
        for f in sorted(os.listdir(full)):
            if not f.endswith(".qa.u1"):
                continue
            base = os.path.join(full, f[:-6])
            t = np.fromfile(base + ".qa.u1", dtype=np.uint8).reshape(-1, SLOTS)
            if not len(t):
                continue
            qa.append(t)
            qp.append(np.fromfile(base + ".qp.f4", dtype="<f4").reshape(-1, SLOTS))
            qw.append(np.fromfile(base + ".q.f4", dtype="<f4").reshape(-1, SLOTS))
            # the SE of each slot's gap to the move played (new data); NaN where not recorded
            qs.append(np.fromfile(base + ".qs.f4", dtype="<f4").reshape(-1, SLOTS) if os.path.exists(base + ".qs.f4") else np.full((len(t), SLOTS), np.nan, np.float32))
            xs.append(np.fromfile(base + ".x.f16", dtype="<f2").reshape(-1, 376))
            m = np.unpackbits(np.fromfile(base + ".m.u1", dtype=np.uint8).reshape(-1, 10), axis=1, bitorder="little")[:, :OUTPUTS]
            legal.append(m.astype(bool))
            shard = int(f.split("-")[1].split(".")[0])
            hs.append(np.fromfile(base + ".h.u4", dtype="<u4").astype(np.int64) + (di * 100000 + shard) * (1 << 32))
    return np.concatenate(xs), np.concatenate(legal), np.concatenate(qa), np.concatenate(qp), np.concatenate(qw), np.concatenate(hs), np.concatenate(qs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--arms", required=True)
    ap.add_argument("--report")
    args = ap.parse_args()
    arms = json.load(open(args.arms))
    t0 = time.time()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    x, legal, qa, qp, qw, h, qs = load(args.data)
    n = len(x)
    valid = qa != 255
    print(f"{n} choices from {len(args.data)} sets, {int(valid.sum()) - n} alternatives, loaded in {time.time() - t0:.0f}s on {dev}", flush=True)
    X = torch.from_numpy(x.astype(np.float32)).to(dev)
    Lg = torch.from_numpy(legal).to(dev)
    QA = torch.from_numpy(np.where(valid, qa, 0).astype(np.int64)).to(dev)
    V = torch.from_numpy(valid).to(dev)
    QP = torch.from_numpy(qp).to(dev)
    QW = torch.from_numpy(qw).to(dev)
    QS = torch.from_numpy(qs).to(dev)
    hands, inv = np.unique(h, return_inverse=True)
    report = []
    for arm in arms:
        ta = time.time()
        name = arm["name"]
        net, base = load_model(arm["init"])
        if arm.get("mode") == "soup":
            # the weight average of models trained from the same init (seeds), a model soup
            nets = [load_model("ml/models/" + m + ".json")[0] for m in arm["members"]]
            with torch.no_grad():
                for k, l in enumerate(net.layers):
                    l.weight.copy_(sum(n_.layers[k].weight for n_ in nets) / len(nets))
                    l.bias.copy_(sum(n_.layers[k].bias for n_ in nets) / len(nets))
            path = save_model(net, base, name, {"mode": "soup", "members": arm["members"], "init": arm["init"]})
            js_check(net, path, x)
            report.append({"name": name, "seconds": time.time() - ta})
            members = ", ".join(arm["members"])
            print(f"{name}: soup of {members}", flush=True)
            continue
        if arm.get("mode") == "noise":
            g = torch.Generator().manual_seed(int(arm.get("seed", 1)))
            with torch.no_grad():
                for l in net.layers:
                    l.weight.add_(torch.randn(l.weight.shape, generator=g) * float(arm["sigma"]) * l.weight.std())
                    l.bias.add_(torch.randn(l.bias.shape, generator=g) * float(arm["sigma"]) * l.weight.std())
            path = save_model(net, base, name, {"mode": "noise", "sigma": arm["sigma"], "seed": arm.get("seed", 1), "init": arm["init"]})
            js_check(net, path, x)
            report.append({"name": name, "seconds": time.time() - ta})
            sigma, seed = arm["sigma"], arm.get("seed", 1)
            print(f"{name}: noise sigma {sigma} seed {seed}", flush=True)
            continue
        if arm.get("noiseFirst"):
            # noise, then the q step: an escape from init's basin before training
            g = torch.Generator().manual_seed(int(arm.get("seed", 1)) + 1000)
            with torch.no_grad():
                for l in net.layers:
                    sd = l.weight.std()
                    l.weight.add_(torch.randn(l.weight.shape, generator=g) * float(arm["noiseFirst"]) * sd)
                    l.bias.add_(torch.randn(l.bias.shape, generator=g) * float(arm["noiseFirst"]) * sd)
        tau, bonus = float(arm.get("tau", 100)), float(arm.get("bonus", 300))
        lr, epochs, batch = float(arm.get("lr", 3e-4)), int(arm.get("epochs", 4)), int(arm.get("batch", 1024))
        anchor, klw = arm.get("anchor", "ref"), float(arm.get("kl", 0))
        clip = float(arm.get("clip", 4000))
        q = QP + bonus * QW
        adv = torch.clamp(q - q[:, :1], -clip, clip) * V
        rng = np.random.default_rng(int(arm.get("seed", 1)))
        torch.manual_seed(int(arm.get("seed", 1)))
        held = rng.random(len(hands)) < float(arm.get("valid", 0.1))
        va, tr = np.nonzero(held[inv])[0], np.nonzero(~held[inv])[0]
        net.to(dev)
        init_net, _ = load_model(arm["init"])
        init_net.to(dev).eval()
        floor = torch.where(V, adv, torch.full_like(adv, 1e9)).min(1).values.clamp(max=0)
        A = floor[:, None].expand(-1, OUTPUTS).clone()
        A.scatter_(1, QA, torch.where(V, adv, floor[:, None].expand_as(adv)))
        A = A / tau
        if arm.get("vnorm"):
            # variance-aware: each tried move's advantage over its own SE (with a floor s0 and a
            # default where the data has none), clipped at +-zclip, times vnorm (logit units).
            se = torch.nan_to_num(QS, nan=float(arm.get("seDefault", 150)))
            z = torch.clamp(adv / torch.sqrt(se ** 2 + float(arm.get("s0", 50)) ** 2), -float(arm.get("zclip", 3)), float(arm.get("zclip", 3))) * V
            zf = torch.where(V, z, torch.full_like(z, 1e9)).min(1).values.clamp(max=0)
            A = zf[:, None].expand(-1, OUTPUTS).clone()
            A.scatter_(1, QA, torch.where(V, z, zf[:, None].expand_as(z)))
            A = A * float(arm["vnorm"])

        def stats_for(model, idx):
            xb, lb = X[idx], Lg[idx]
            with torch.no_grad():
                l0 = torch.log_softmax(init_net(xb).masked_fill(~lb, -1e9), 1)
                lp = torch.log_softmax(model(xb).masked_fill(~lb, -1e9), 1)
                kl = (l0.exp() * (l0 - lp).masked_fill(~lb, 0)).sum(1).mean()
                pt = torch.where(V[idx], lp.gather(1, QA[idx]).exp(), torch.zeros_like(adv[idx]))
                pr = torch.where(V[idx], l0.gather(1, QA[idx]).exp(), torch.zeros_like(adv[idx]))
                gain = ((pt - pr) * adv[idx]).sum(1).mean()
                top = lp.argmax(1, keepdim=True); top0 = l0.argmax(1, keepdim=True)
                Ab = A[idx] * tau
                g2 = (Ab.gather(1, top) - Ab.gather(1, top0)).mean()
            return float(kl), float(gain), float(g2)

        trT = torch.from_numpy(tr).to(dev)
        vaT = torch.from_numpy(va).to(dev)

        def target(idx, ref_net):
            xb, lb = X[idx], Lg[idx]
            with torch.no_grad():
                rlog = torch.log_softmax(ref_net(xb).masked_fill(~lb, -1e9), 1)
                return torch.softmax((rlog + A[idx]).masked_fill(~lb, -1e9), 1)

        def heldout_ce(model):
            # cross-entropy on held-out choices against the fixed target (init's shares, tilted): comparable across arms
            tot = 0.0
            with torch.no_grad():
                for s0 in range(0, len(vaT), 8192):
                    idx = vaT[s0:s0 + 8192]
                    lb = Lg[idx]
                    lp = torch.log_softmax(model(X[idx]).masked_fill(~lb, -1e9), 1)
                    tot += float(-(target(idx, init_net) * lp.masked_fill(~lb, 0)).sum(1).sum())
            return tot / len(vaT)

        def fit(model, epochs, lr, teacher=None, alpha=0.0, label=name):
            """The q step, with the structural options: clip (global grad norm), warmup (share of steps),
            cosine, ema (decay), gradNoise (sigma x grad RMS, annealed to 0). Returns the model to export."""
            opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=float(arm.get("wd", 1e-4)))
            steps = epochs * ((len(trT) + batch - 1) // batch)
            warm = float(arm.get("warmup", 0)) * steps
            cosine = bool(arm.get("cosine", False))
            gclip = float(arm["gradClip"]) if arm.get("gradClip") else None
            gnoise = float(arm.get("gradNoise", 0))
            ema = None
            if arm.get("ema"):
                ema = copy.deepcopy(model).eval()
                for p_ in ema.parameters():
                    p_.requires_grad_(False)
            decay = float(arm.get("ema", 0))
            ref_net, step = init_net, 0
            gen = torch.Generator(device=dev).manual_seed(int(arm.get("seed", 1)) + 77)
            for ep in range(epochs):
                if anchor == "self":
                    ref_net = copy.deepcopy(model).eval()
                model.train()
                norms = []
                perm = trT[torch.randperm(len(trT), device=dev)]
                for s0 in range(0, len(perm), batch):
                    idx = perm[s0:s0 + batch]
                    xb, lb = X[idx], Lg[idx]
                    tgt = target(idx, ref_net)
                    if teacher is not None:
                        with torch.no_grad():
                            tp = torch.softmax(teacher(xb).masked_fill(~lb, -1e9), 1)
                        tgt = alpha * tp + (1 - alpha) * tgt
                    logp = torch.log_softmax(model(xb).masked_fill(~lb, -1e9), 1)
                    loss = -(tgt * logp.masked_fill(~lb, 0)).sum(1).mean()
                    if klw:
                        with torch.no_grad():
                            l0 = torch.log_softmax(init_net(xb).masked_fill(~lb, -1e9), 1)
                        loss = loss + klw * (l0.exp() * (l0 - logp).masked_fill(~lb, 0)).sum(1).mean()
                    f = 1.0
                    if warm and step < warm:
                        f = (step + 1) / warm
                    if cosine:
                        f *= 0.5 * (1 + np.cos(np.pi * step / steps))
                    for g_ in opt.param_groups:
                        g_["lr"] = lr * f
                    opt.zero_grad()
                    loss.backward()
                    if gnoise:
                        sig = gnoise * (1 - step / steps)
                        for p_ in model.parameters():
                            if p_.grad is not None:
                                rms = p_.grad.pow(2).mean().sqrt()
                                p_.grad.add_(torch.randn(p_.grad.shape, device=dev, generator=gen) * sig * rms)
                    gn = torch.nn.utils.clip_grad_norm_(model.parameters(), gclip if gclip else float("inf"))
                    norms.append(float(gn))
                    opt.step()
                    if ema is not None:
                        with torch.no_grad():
                            for pe, pm in zip(ema.parameters(), model.parameters()):
                                pe.mul_(decay).add_(pm.detach(), alpha=1 - decay)
                    step += 1
                model.eval()
                nm = np.array(norms)
                out = ema if ema is not None else model
                print(f"{label} epoch {ep + 1}: grad norm median {np.median(nm):.3f}, p99 {np.percentile(nm, 99):.3f}, max {nm.max():.3f}"
                      + (f" (clip {gclip}, {100 * float((nm > gclip).mean()):.1f}% of steps clipped)" if gclip else "")
                      + f", held-out CE {heldout_ce(out):.5f}", flush=True)
            return ema if ema is not None else model

        ce0 = heldout_ce(init_net)
        teacher = None
        if arm.get("teacher"):
            # B6: a residual + LayerNorm teacher on the same targets (Python only), then distilled
            # into the champion's shape: the student fits alpha x the teacher's shares + (1 - alpha) x the target.
            tw, tb = int(arm.get("teacherWidth", 768)), int(arm.get("teacherBlocks", 4))
            teacher = ResNet(376, tw, tb).to(dev)
            teacher = fit(teacher, int(arm.get("teacherEpochs", 12)), float(arm.get("teacherLr", 1e-3)), label=name + " teacher")
            tce = heldout_ce(teacher)
            print(f"{name} teacher ({tw} x {tb} blocks): held-out CE {tce:.5f} against init {ce0:.5f}", flush=True)
        net = fit(net, epochs, lr, teacher=teacher, alpha=float(arm.get("alpha", 0.5)))
        ce = heldout_ce(net)
        kl, gain, g2 = (lambda r: r)(stats_for(net, vaT))
        print(f"{name}: held-out CE {ce:.5f} (init {ce0:.5f}), KL from init {kl:.4f}, held-out points gained (shares) {gain:+.2f}, (greedy) {g2:+.2f}", flush=True)
        extra = {"mode": "q", "arm": arm, "data": args.data, "choices": int(n), "kl": kl, "heldOutGain": gain, "heldOutGreedyGain": g2, "heldOutCE": ce, "initCE": ce0}
        if teacher is not None:
            extra["teacherCE"] = tce
        path = save_model(net.cpu(), base, name, extra)
        js_check(net, path, x)
        report.append({"name": name, "kl": kl, "gain": gain, "greedyGain": g2, "heldOutCE": ce, "initCE": ce0, "teacherCE": tce if teacher is not None else None, "seconds": time.time() - ta})
    if args.report:
        json.dump(report, open(args.report, "w"), indent=1)
    print(f"all arms in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
