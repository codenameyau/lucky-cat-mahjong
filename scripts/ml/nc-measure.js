#!/usr/bin/env node
/* Neural Cat overnight, phase 3: measure what option replays could gain before training on them.

   node scripts/ml/nc-measure.js --kind claims --deals 20000 --replays 32 [--unseen] --out ml/data/ncm-claims-1
   node scripts/ml/nc-measure.js --kind near-tie --near-tie 20 --options 2 --deals 20000 --replays 64 --out ...

   The champion (state.champion, playing its best: no exploring) sits at the evaluation
   table's mix (each seat drawn from the champion, NC9, NC8, NC5); at every decision of the
   champion's own seats of the kind asked for (every claim with a choice; or every discard
   whose best two values are within --near-tie), each option is forced and the hand played
   on --replays times on common shuffles of the tiles (lcm-sim generate-nc --crn), the wall
   alone or, with --unseen, every tile the seat hasn't seen. The shards' .optlabels and
   .optrep files are what ml/nc_oracle.py reads; the data rows (.features) are deleted.
   Seeds come from the loop's data counter (never reused). */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const N = require('./native.js');

const ROOT = path.join(__dirname, '..', '..');
const STATE = path.join(ROOT, 'ml', 'overnight', 'neural-cat', 'work', 'state.json');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

async function main() {
  const a = args(process.argv.slice(2));
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const deals = +a.deals || 20000, shardDeals = +a.shard || 250, workers = +a.workers || 10;
  const champ = a.champion || state.champion;
  const table = (a.table ? String(a.table).split(',') : state.table);
  const out = path.resolve(ROOT, a.out);
  fs.mkdirSync(out, { recursive: true });
  const id = (f) => { const x = N.nativeId('nc:' + path.resolve(ROOT, f)); if (!x) throw new Error(f + ": can't play natively"); return x; };
  const pool = ['learner'].concat(table.map(id));
  const seed = a.seed ? +a.seed : state.seeds.data;
  if (!a.seed) { state.seeds.data += deals; fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); }
  const sim = path.join(ROOT, 'native', 'build', 'lcm-sim.exe');
  const extra = ['--option-replays', String(+a.replays || 32), '--options', String(+a.options || 6), '--option-share', '1', '--crn', '--option-learner-only']
    .concat(a.kind === 'claims' ? ['--option-claims-only'] : ['--option-near-tie', String(+a['near-tie'] || 20)])
    .concat(a.unseen ? ['--option-unseen'] : []);
  const shards = [];
  for (let k = 0; k * shardDeals < deals; k++) shards.push(k);
  const t0 = Date.now();
  const results = [];
  let done = 0;
  await N.pool(shards.map((k) => () => new Promise((resolve, reject) => {
    const doneFile = path.join(out, 'shard-' + k + '.done.json');
    if (fs.existsSync(doneFile)) { results[k] = JSON.parse(fs.readFileSync(doneFile, 'utf8')); return resolve(); }
    const n = Math.min(shardDeals, deals - k * shardDeals);
    execFile(sim, ['generate-nc', '--weights', id(champ).slice(3), '--temperature', '0', '--epsilon', '0', '--sample', '1',
      '--seed', String(seed + k * shardDeals), '--deals', String(n), '--shard', String(k), '--strategy', '0',
      '--pool', pool.join(','), '--record-all', pool.map((_, j) => j).join(','), '--out', out].concat(extra), { maxBuffer: 1 << 24 },
    (err, stdout, stderr) => {
      if (err) return reject(new Error('lcm-sim generate-nc: ' + (stderr || err.message)));
      const r = JSON.parse(stdout);
      for (const ext of ['features', 'labels', 'aux']) fs.rmSync(path.join(out, 'shard-' + k + '.' + ext), { force: true });
      fs.writeFileSync(doneFile, JSON.stringify(r));
      results[k] = r;
      done++;
      if (done % 10 === 0) console.log(new Date().toISOString().slice(11, 19) + ' ' + done + ' shards, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
      resolve();
    });
  })), workers);
  const sum = (f) => results.reduce((s, r) => s + (r[f] || 0), 0);
  const manifest = { kind: a.kind, champion: champ, table, seed, deals, replays: +a.replays || 32, unseen: !!a.unseen, nearTie: a.kind === 'claims' ? null : +a['near-tie'] || 20,
    options: +a.options || 6, shards: shards.length, learnerSeats: sum('learnerSeats'), optionGroups: sum('optionGroups'), optionRows: sum('optionRows'), seconds: (Date.now() - t0) / 1000 };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify(manifest));
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
