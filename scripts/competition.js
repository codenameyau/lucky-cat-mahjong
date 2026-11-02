#!/usr/bin/env node
/* Bot competition from the command line. Plays every deal once per seat
   rotation, split across worker threads, and prints each strategy's
   points, wins, self-draws, deal-ins and more (js/mahjong-competition.js).

   npm run compete -- --deals 1000
   npm run compete -- --lineup lucky-cat,jorge-yau,lucky-cat,jorge-yau --deals 500 --seed 7
   npm run compete -- --deals 2000 --json results.json

   Options:
     --lineup a,b,c,d  strategy per seat (default: lucky-cat vs jorge-yau, alternating)
     --deals N         deals to play; each is played 4 times, once per rotation (default 250)
     --seed N          first deal's seed (default 1)
     --workers N       worker threads (default: CPU cores - 1)
     --json FILE       also write the full report as JSON
     --list            list the strategies and exit */

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const C = require('../js/mahjong-competition.js');
const S = require('../js/mahjong-strategies.js');

if (!isMainThread) {
  C.runMatch(workerData).then((report) => parentPort.postMessage(report));
  return;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    S.list().forEach((s) => console.log(s.id.padEnd(14) + s.summary));
    return;
  }
  const lineup = args.lineup ? String(args.lineup).split(',') : ['lucky-cat', 'jorge-yau', 'lucky-cat', 'jorge-yau'];
  if (lineup.length !== 4) throw new Error('--lineup needs four strategy ids, one per seat');
  lineup.forEach((id) => { if (!S.has(id)) throw new Error('unknown strategy ' + id + ' (have: ' + S.ids().join(', ') + ')'); });
  const deals = Math.max(1, parseInt(args.deals || 250, 10));
  const seed = parseInt(args.seed || 1, 10);
  const workers = Math.max(1, Math.min(deals, parseInt(args.workers || Math.max(1, os.cpus().length - 1), 10)));

  console.log('Playing ' + deals + ' deals x 4 seat rotations on ' + workers + ' worker' + (workers > 1 ? 's' : '') + '...');
  const t0 = Date.now();
  const per = Math.ceil(deals / workers);
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const first = w * per;
    const count = Math.min(per, deals - first);
    if (count <= 0) break;
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: { lineup, deals: count, seed: seed + first } });
      worker.once('message', resolve);
      worker.once('error', reject);
    }));
  }
  const reports = await Promise.all(jobs);
  const report = reports.reduce((a, b) => C.mergeReports(a, b));
  report.ms = Date.now() - t0;
  console.log('');
  console.log(C.formatReport(report));
  if (args.json) {
    const file = path.resolve(String(args.json));
    const summary = {};
    Object.keys(report.strategies).forEach((id) => { summary[id] = C.summarize(report.strategies[id]); });
    fs.writeFileSync(file, JSON.stringify({ seed, report, summary }, null, 2) + '\n');
    console.log('\nWrote ' + file);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
