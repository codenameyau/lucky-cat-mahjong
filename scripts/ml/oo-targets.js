#!/usr/bin/env node
/* Reads lcm-sim targets rows (ml/oo-night/targets/t-*.bin) and reports how the rules' target
   choice compares with the best fixed target by replayed full-spicy points.

   Per deal (float64): for each of 6 options (0 = the rules as played, 1..5 = target t pinned)
   [mean points, mean wins, mean limit wins, feasible], then the rules' first pick and the seat.

   The oracle's gain is biased upward (the best of several noisy means). Split-half: choose the
   best target on half the replays, score it on the other half. Here each deal's K replays are
   averaged in C++, so the split is across deals instead: an honest estimate of a learnable gain
   is the gain of a rule fitted on half the deals and applied to the other half (by the opening's
   rules' pick: "when the rules pick X, play Y"). */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || 'ml/oo-night/targets';
const NAMES = ['rules', 'orphans', 'major sets', 'major pairs', 'seven pairs', 'concealed triplets'];
const W = 6 * 4 + 2;
const deals = [];
for (const f of fs.readdirSync(dir).filter((x) => /^t-\d+\.bin$/.test(x))) {
  const b = fs.readFileSync(path.join(dir, f));
  const r = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  for (let d = 0; d < Math.floor(r.length / W); d++) {
    const o = d * W;
    const opt = [];
    for (let k = 0; k < 6; k++) opt.push({ pts: r[o + 4 * k], wins: r[o + 4 * k + 1], lim: r[o + 4 * k + 2], ok: r[o + 4 * k + 3] > 0 });
    deals.push({ opt, first: r[o + 24], seat: r[o + 25] });
  }
}
const n = deals.length;
const valid = deals.filter((d) => d.opt[0].ok);
const mean = (a) => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / Math.max(1, a.length - 1) / Math.max(1, a.length)); };
const per = valid.map((d) => {
  let best = 0;
  for (let k = 1; k < 6; k++) if (d.opt[k].ok && d.opt[k].pts > d.opt[best].pts) best = k;
  return { d, best, gain: d.opt[best].pts - d.opt[0].pts, pinFirst: d.opt[1 + d.first].ok ? d.opt[1 + d.first].pts - d.opt[0].pts : 0 };
});
console.log('Deals ' + n + ', with a first turn ' + valid.length);
console.log('Rules as played: ' + mean(valid.map((x) => x.opt[0].pts)).toFixed(1) + ' points a hand, wins ' + (100 * mean(valid.map((x) => x.opt[0].wins))).toFixed(2) + '%, limit wins ' + (100 * mean(valid.map((x) => x.opt[0].lim))).toFixed(3) + '%');
console.log('Pinning the rules\' first pick for the hand: ' + mean(per.map((x) => x.pinFirst)).toFixed(1) + ' ± ' + se(per.map((x) => x.pinFirst)).toFixed(1) + ' a hand against the rules');
const differ = per.filter((x) => x.best !== 0 && x.best - 1 !== x.d.first).length;
console.log('Oracle (best of the options by replayed mean, in-sample, biased up): +' + mean(per.map((x) => x.gain)).toFixed(1) + ' ± ' + se(per.map((x) => x.gain)).toFixed(1) + ' a hand; its pick differs from the rules\' first pick in ' + (100 * differ / per.length).toFixed(1) + '% of deals');
// Feasible counts and per-target means where feasible.
for (let k = 1; k < 6; k++) {
  const f = valid.filter((d) => d.opt[k].ok);
  const g = f.map((d) => d.opt[k].pts - d.opt[0].pts);
  console.log('  ' + NAMES[k].padEnd(20) + ' possible in ' + (100 * f.length / valid.length).toFixed(1) + '%, the rules\' first pick in ' + (100 * valid.filter((d) => d.first === k - 1).length / valid.length).toFixed(1) +
    '%; pinned, against the rules: ' + mean(g).toFixed(1) + ' ± ' + se(g).toFixed(1) + ', limit wins ' + (100 * mean(f.map((d) => d.opt[k].lim - d.opt[0].lim))).toFixed(3) + ' pp');
}
// A learnable rule, cross-validated: map (rules' first pick, feasible set) -> option, fitted on even deals, applied to odd.
const key = (d) => d.first + ':' + d.opt.slice(1).map((o) => (o.ok ? 1 : 0)).join('');
const fit = (set) => { const m = {}; set.forEach((d) => { const k = key(d); m[k] = m[k] || [0, 0, 0, 0, 0, 0].map(() => ({ s: 0, n: 0 })); d.opt.forEach((o, i) => { if (o.ok) { m[k][i].s += o.pts; m[k][i].n++; } }); });
  const choice = {}; Object.keys(m).forEach((k) => { let b = 0, bv = -Infinity; m[k].forEach((c, i) => { if (c.n >= 30) { const v = c.s / c.n; if (v > bv) { bv = v; b = i; } } }); choice[k] = b; }); return choice; };
const even = valid.filter((_, i) => i % 2 === 0), odd = valid.filter((_, i) => i % 2 === 1);
const cv = [];
[[even, odd], [odd, even]].forEach(([tr, te]) => { const c = fit(tr); te.forEach((d) => { const o = c[key(d)] || 0; cv.push(d.opt[o].ok ? d.opt[o].pts - d.opt[0].pts : 0); }); });
console.log('A rule by (rules\' pick, possible targets), fitted on half the deals and scored on the other half: ' + (mean(cv) >= 0 ? '+' : '') + mean(cv).toFixed(1) + ' ± ' + se(cv).toFixed(1) + ' a hand');
