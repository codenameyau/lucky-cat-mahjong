#!/usr/bin/env node
/* The target oracle out of sample: the same deals replayed on two independent sets of walls
   (ml/oo-night/targets/ and targets-b/, lcm-sim targets --salt). The best option chosen on one
   set is scored on the other, so the selection's luck cancels: what remains is the gain a
   perfect per-deal target chooser could really have. */
'use strict';
const fs = require('fs');
const W = 26;
const read = (f) => { const b = fs.readFileSync(f); const r = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); return r.subarray(0, Math.floor(r.length / W) * W); };
const cat = (fs_) => { const parts = fs_.map(read); const out = new Float64Array(parts.reduce((t, p) => t + p.length, 0)); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; };
const A = cat(['ml/oo-night/targets/t-0.bin', 'ml/oo-night/targets/t-1.bin']);
const B = cat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => 'ml/oo-night/targets-b/t-' + i + '.bin'));
const n = Math.min(A.length, B.length) / W;
const best = (r, d) => { let b = 0; for (let k = 1; k < 6; k++) if (r[d * W + 4 * k + 3] > 0 && r[d * W + 4 * k] > r[d * W + 4 * b]) b = k; return b; };
const g = [], gl = [], ins = [];
for (let d = 0; d < n; d++) {
  if (A[d * W + 25] !== B[d * W + 25]) throw new Error('deal ' + d + ': the two runs disagree on the seat');
  for (const [X, Y] of [[A, B], [B, A]]) {
    const k = best(X, d);
    g.push(Y[d * W + 4 * k] - Y[d * W]);
    gl.push(Y[d * W + 4 * k + 2] - Y[d * W + 2]);
    ins.push(X[d * W + 4 * k] - X[d * W]);
  }
}
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / (a.length - 1) / a.length); };
console.log(n + ' deals, each way: the oracle in sample +' + mean(ins).toFixed(1) + ' ± ' + se(ins).toFixed(1) + ' a hand; out of sample ' + (mean(g) >= 0 ? '+' : '') + mean(g).toFixed(1) + ' ± ' + se(g).toFixed(1) +
  ' a hand, limit wins ' + (100 * mean(gl)).toFixed(3) + ' pp');
