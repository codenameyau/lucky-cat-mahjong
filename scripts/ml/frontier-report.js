#!/usr/bin/env node
/* The frontier report's head to heads (docs/machine-learning/frontier-report.md):
   pairs of models on fresh deals at the game's table, on the native
   simulator, each written to ml/fm/report/<a>-vs-<b>.json (kept: a pair already
   played is read, not played again).

   node scripts/ml/frontier-report.js --pairs nc:ml/models/A.json~nc:ml/models/B.json,... --deals 100000

   Options: --deals N (default 100000), --seed S (default 960000000, fresh deals
   for every pair: never the benchmark deck), --workers N (default: CPU cores). */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { headToHead } = require('./h2h.js');

const ROOT = path.join(__dirname, '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[argv[i].slice(2)] = true;
    else { out[argv[i].slice(2)] = next; i++; }
  }
  return out;
}

const short = (id) => path.basename(id.replace(/^(nc|lc):/, '')).replace(/\.(json|js)$/, '').replace('mahjong-', '');
const fmt = (v, se) => (v >= 0 ? '+' : '') + v.toFixed(1) + ' ± ' + se.toFixed(1);

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const deals = parseInt(a.deals || 100000, 10);
  const seed = parseInt(a.seed || 960000000, 10);
  const workers = parseInt(a.workers || os.cpus().length, 10);
  const dir = path.join(ROOT, 'ml', 'fm', 'report');
  fs.mkdirSync(dir, { recursive: true });
  for (const pair of String(a.pairs).split(',')) {
    const [x, y] = pair.split('~');
    const file = path.join(dir, short(x) + '-vs-' + short(y) + '-' + deals + '.json');
    let r = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (!r) {
      const t0 = Date.now();
      r = await headToHead(x, y, null, seed, deals, workers);
      r.a = x; r.b = y; r.ms = Date.now() - t0;
      fs.writeFileSync(file, JSON.stringify(r, null, 1) + '\n');
    }
    const m = r.models;
    console.log(short(x) + ' less ' + short(y) + ': ' + fmt(r.gap.points, r.gap.standardError) + ' points a hand over ' + r.deals + ' deals' +
      ' | hands won ' + (100 * m[0].wins).toFixed(1) + '% / ' + (100 * m[1].wins).toFixed(1) + '%, deal-ins ' + (100 * m[0].dealIns).toFixed(1) + '% / ' +
      (100 * m[1].dealIns).toFixed(1) + '%, average win ' + Math.round(m[0].averageWin) + ' / ' + Math.round(m[1].averageWin) + ' points, ' +
      m[0].averageFaan.toFixed(2) + ' / ' + m[1].averageFaan.toFixed(2) + ' faan');
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
