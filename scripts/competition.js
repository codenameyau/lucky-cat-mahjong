#!/usr/bin/env node
/* Bot competition from the command line. Plays every deal once per seat
   rotation, split across worker threads, and prints each strategy's
   points, wins, self-draws, deal-ins and more (js/mahjong-competition.js).

   npm run compete -- --deals 1000
   npm run compete -- --lineup jorge-yau,lucky-cat,jorge-yau,lucky-cat --deals 500 --seed 7
   npm run compete -- --deals 2000 --json results.json

   Options:
     --lineup a,b,c,d  strategy per seat (default: jorge-yau vs lucky-cat, alternating);
                       ml:<file> is Neural Cat with those weights, oo:<file> Only
                       Orphans with those, only-orphans-rules the rule-based
                       Only Orphans (the baseline)
     --deals N         deals to play; each is played 4 times, once per rotation (default 250)
     --seed N          first deal's seed (default 1)
     --workers N       worker threads (default: CPU cores - 1)
     --json FILE       also write the full report as JSON
     --ml-weights FILE neural-cat plays these weights (ml/models/<name>.json)
     --ml-options JSON other options for neural-cat, e.g. '{"claims":false}'
     --variant N=B:JSON a player N: strategy B with other tuning, e.g.
                       'jy-old=jorge-yau:{"keepPairs":0}'; separate several with ;
     --list            list the strategies and exit */

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const C = require('../js/mahjong-competition.js');
const S = require('../js/mahjong-strategies.js');

// neural-cat with other weights than the shipped ones (--ml-weights).
// --ml-options JSON: other options for it, e.g. '{"claims":false}'.
// Simulations play it in fast mode: the same choices, less to explain.
function useMl(file, options) {
  const ML = require('../js/mahjong-ml.js');
  const o = Object.assign({ fast: true }, options || {});
  if (file) o.weights = JSON.parse(fs.readFileSync(file, 'utf8'));
  S.get('neural-cat').bot = ML.create(o);
}

// --variant NAME=BASE:{json}: BASE with other tuning, as its own player NAME,
// e.g. 'jy-old=jorge-yau:{"keepPairs":0}'. A neural-cat variant changes the
// tuning of the strategy it builds on (Jorge Yau's).
function addVariants(list) {
  const B = require('../js/mahjong-bot.js');
  (list || []).forEach((spec) => {
    const m = /^([^=]+)=([^:]+):(.*)$/.exec(spec);
    if (!m) throw new Error('--variant needs NAME=BASE:{json}, got ' + spec);
    const [, name, base, json] = m;
    if (S.has(name)) return;
    const over = JSON.parse(json);
    let bot;
    if (base === 'neural-cat') {
      const ML = require('../js/mahjong-ml.js');
      const J = S.get('jorge-yau').bot;
      const jv = B.createStrategy({ id: name + '-base', hooks: J.hooks, tuning: Object.assign({}, J.tuning, over) });
      bot = ML.create({ id: name, base: jv, fast: true });
    } else {
      if (!S.has(base)) throw new Error('unknown strategy ' + base);
      const b = S.get(base).bot;
      bot = B.createStrategy({ id: name, hooks: b.hooks, tuning: Object.assign({}, b.tuning, over) });
    }
    S.addLab({ id: name, name, bot });
  });
}

// "ml:<file>" in a lineup: Neural Cat with those weights, as its own player.
// "oo:<file>": Only Orphans with those weights; only-orphans-rules: the
// rule-based Only Orphans (scripts/ml/baselines/).
function addModels(lineup) {
  const B = require('./ml/baselines/register.js');
  B.addBaselines();
  B.addOrphanModels(lineup);
  const ML = require('../js/mahjong-ml.js');
  lineup.filter((id) => /^ml:/.test(id) && !S.has(id)).forEach((id) => {
    const weights = JSON.parse(fs.readFileSync(path.resolve(id.slice(3)), 'utf8'));
    S.addLab({ id, name: id, bot: ML.create({ id, weights, fast: true }) });
  });
}

if (!isMainThread) {
  addVariants(workerData.variants);
  addModels(workerData.lineup);
  useMl(workerData.mlWeights, workerData.mlOptions);
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
    S.labIds().forEach((id) => console.log(id.padEnd(14) + '(lab) ' + S.get(id).summary));
    return;
  }
  const lineup = args.lineup ? String(args.lineup).split(',') : ['jorge-yau', 'lucky-cat', 'jorge-yau', 'lucky-cat'];
  if (lineup.length !== 4) throw new Error('--lineup needs four strategy ids, one per seat');
  const variants = args.variant ? String(args.variant).split(';').filter(Boolean) : [];
  addVariants(variants);
  addModels(lineup);
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
      const mlWeights = args['ml-weights'] ? path.resolve(String(args['ml-weights'])) : null;
      const mlOptions = args['ml-options'] ? JSON.parse(String(args['ml-options'])) : null;
      const worker = new Worker(__filename, { workerData: { lineup, deals: count, seed: seed + first, mlWeights, mlOptions, variants } });
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
