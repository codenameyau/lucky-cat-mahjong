#!/usr/bin/env node
/* The ship check for an Only Orphans model against the shipped one, on fresh exact deals in
   blocks of --block deals (default 40,000), each a new deck from the seed counter in
   ml/oo-night/state.json, pooled with --prior runs (earlier fresh confirmations, never
   screen deals). It stops when the pooled points gap is past 3 standard errors, or its upper
   bound (gap + 2 SE) falls under +1, or the pooled deals reach --max (default 400,000).

   node scripts/ml/oo-ship.js --arm ml/models/ON2.json --prior "C3:-2.8:3.1:0.79:0.05:0.03:0.04,..." [--max 400000]
   Each run's numbers and the pooled ones go to ml/oo-night/ship-<arm>.json. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const O = require('./oo-night.js');

const ROOT = path.join(__dirname, '..', '..');
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) out[argv[i].slice(2)] = true; else { out[argv[i].slice(2)] = n; i++; } }
  return out;
}

// Inverse-variance pooling of independent runs.
function pool(runs, k, se) {
  let w = 0, s = 0;
  runs.forEach((r) => { const v = 1 / (r[se] * r[se]); w += v; s += v * r[k]; });
  return { mean: s / w, se: Math.sqrt(1 / w) };
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  const arm = path.resolve(ROOT, a.arm), champ = path.resolve(ROOT, a.champion || 'ml/models/OS2c1.json');
  const name = path.basename(arm, '.json');
  const out = path.join(ROOT, 'ml', 'oo-night', 'ship-' + name + '.json');
  const block = parseInt(a.block || 40000, 10), max = parseInt(a.max || 400000, 10);
  const runs = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).runs : String(a.prior || '').split(',').filter(Boolean).map((x) => {
    const [id, p, se, w, wse, d, dse] = x.split(':');
    return { id, deals: 40000, points: +p, se: +se, wins: +w / 100, winsSE: +wse / 100, dealIns: +d / 100, dealInsSE: +dse / 100, prior: true };
  });
  const report = () => {
    const P = pool(runs, 'points', 'se'), W = pool(runs, 'wins', 'winsSE'), D = pool(runs, 'dealIns', 'dealInsSE');
    const halfRuns = runs.filter((r) => r.halfSE), H = halfRuns.length ? pool(halfRuns, 'half', 'halfSE') : null;
    const deals = runs.reduce((t, r) => t + r.deals, 0);
    const res = { arm: name, deals, points: P, wins: W, dealIns: D, half: H, runs };
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    console.log(new Date().toISOString().slice(11, 19) + ' ' + name + ' pooled over ' + deals + ' fresh deals (' + runs.length + ' runs): points ' + P.mean.toFixed(2) + ' ± ' + P.se.toFixed(2) +
      ' (z ' + (P.mean / P.se).toFixed(2) + '), wins ' + (100 * W.mean).toFixed(3) + ' ± ' + (100 * W.se).toFixed(3) + ' pp, deal-ins ' + (100 * D.mean).toFixed(3) + ' ± ' + (100 * D.se).toFixed(3) + ' pp' +
      (H ? ', half spicy ' + H.mean.toFixed(2) + ' ± ' + H.se.toFixed(2) + ' (' + halfRuns.length + ' runs)' : ''));
    return { P, deals };
  };
  let st = report();
  while (st.deals + block <= max && Math.abs(st.P.mean / st.P.se) <= 3 && st.P.mean + 2 * st.P.se >= 1) {
    const s = O.loadState();
    const seed = O.SEEDS.confirm + s.next.confirm * 1000000;
    s.next.confirm++;
    O.saveState(s);
    O.stats.played = 0; O.stats.cached = 0;
    const c = await O.screen([arm], champ, seed, [block], { workers: 10, build: 'exact', drop: 1e9, top: 1 });
    const g = c.arms[0].gap, sm = c.arms[0].summary;
    runs.push({ id: 'seed ' + seed, seed, deals: block, points: g.points, se: g.se, wins: g.wins, winsSE: g.winsSE, dealIns: g.dealIns, dealInsSE: g.dealInsSE,
      half: g.half, halfSE: g.halfSE, limits: g.limits, limitsSE: g.limitsSE, champion: c.champion, summary: sm, seconds: c.seconds });
    st = report();
  }
  console.log('Stopped: ' + (Math.abs(st.P.mean / st.P.se) > 3 ? 'past 3 SE' : st.P.mean + 2 * st.P.se < 1 ? 'upper bound under +1' : 'the deal limit'));
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
