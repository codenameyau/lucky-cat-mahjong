#!/usr/bin/env node
/* Self-play training rounds for Neural Cat. Each round:
     1. generate: deals with neural-cat (the best model so far, exploring)
        in most seats and the table strategies in the rest
     2. train: a new model from the best one, on the latest rounds' data
     3. evaluate: the new model against jorge-yau and lucky-cat on the same
        deals every round, and keep it if it beats the best so far
   The best model is shipped to js/mahjong-ml-weights.js as soon as it wins.
   State is in ml/loop/state.json, so a stopped loop picks up where it left off.

   npm run ml:loop -- --start ml/models/j0.json --base-data ml/data/j0 --rounds 6

   Options:
     --start FILE       the model to begin from (first run only)
     --base-data DIR    data to train on every round, beside the rounds' own
     --rounds N         rounds to play this run (default 4)
     --deals N          deals to generate per round (default 20000)
     --keep N           rounds of data to train on (default 3)
     --eval-deals N     deals per evaluation, x4 seat rotations (default 1500)
     --eval-seed N      the evaluation's first deal (default 900000) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ship } = require('./ship.js');

const ROOT = path.join(__dirname, '..', '..');
const STATE = path.join(ROOT, 'ml', 'loop', 'state.json');
const EVAL_LINEUP = 'neural-cat,jorge-yau,lucky-cat,jorge-yau';
const POOL = 'neural-cat,neural-cat,neural-cat,jorge-yau,lucky-cat,only-orphans';

function parseArgs(argv) {
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

function log(line) {
  const text = new Date().toISOString().slice(11, 19) + ' ' + line;
  console.log(text);
  fs.appendFileSync(path.join(ROOT, 'ml', 'loop', 'loop.log'), text + '\n');
}

function run(cmd, args) {
  log('$ ' + cmd + ' ' + args.join(' '));
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (res.stdout || '') + (res.stderr || '');
  fs.appendFileSync(path.join(ROOT, 'ml', 'loop', 'loop.log'), out + '\n');
  if (res.status !== 0) throw new Error(cmd + ' failed:\n' + out.slice(-2000));
  return out;
}

// Plays the evaluation deals with these weights; the score is neural-cat's
// points per hand less jorge-yau's on the same deals.
function evaluate(model, args, name) {
  const json = path.join(ROOT, 'ml', 'loop', 'eval-' + name + '.json');
  run('node', ['scripts/competition.js', '--lineup', EVAL_LINEUP, '--deals', String(args.evalDeals),
    '--seed', String(args.evalSeed), '--ml-weights', model, '--json', json]);
  const s = JSON.parse(fs.readFileSync(json, 'utf8')).summary;
  const nc = s['neural-cat'], jy = s['jorge-yau'];
  return {
    score: nc.pointsPerHand - jy.pointsPerHand,
    pointsPerHand: nc.pointsPerHand,
    jorgePerHand: jy.pointsPerHand,
    winRate: nc.winRate,
    dealInRate: nc.dealInRate,
    avgWinPoints: nc.avgWinPoints,
  };
}

function fmt(e) {
  return 'score ' + e.score.toFixed(1) + ' (neural-cat ' + e.pointsPerHand.toFixed(1) + ', jorge-yau ' + e.jorgePerHand.toFixed(1) +
    ' points/hand; wins ' + (100 * (e.winRate || 0)).toFixed(1) + '%, deal-ins ' + (100 * (e.dealInRate || 0)).toFixed(1) + '%)';
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const args = {
    rounds: parseInt(a.rounds || 4, 10),
    deals: parseInt(a.deals || 20000, 10),
    keep: parseInt(a.keep || 3, 10),
    evalDeals: parseInt(a['eval-deals'] || 1500, 10),
    evalSeed: parseInt(a['eval-seed'] || 900000, 10),
  };
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    if (!a.start) throw new Error('first run needs --start ml/models/<name>.json');
    const start = path.relative(ROOT, path.resolve(String(a.start)));
    log('Evaluating the starting model ' + start);
    const e = evaluate(start, args, 'start');
    log('start: ' + fmt(e));
    state = { baseData: a['base-data'] ? [path.relative(ROOT, path.resolve(String(a['base-data'])))] : [], rounds: [], best: { model: start, name: 'start', eval: e } };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }

  for (let k = 0; k < args.rounds; k++) {
    const r = state.rounds.length + 1;
    const name = 's' + r;
    const data = path.join('ml', 'data', name);
    log('Round ' + r + ': generating ' + args.deals + ' deals with ' + state.best.model);
    run('node', ['scripts/ml/generate.js', '--deals', String(args.deals), '--lineup', 'mix', '--pool', POOL,
      '--weights', state.best.model, '--temperature', '150', '--epsilon', '0.05', '--explore', '0.05',
      '--sample', '0.3', '--seed', String(2000000 + r * 100000), '--out', data]);
    const recent = state.rounds.map((x) => x.data).concat([data]).slice(-args.keep);
    log('Round ' + r + ': training ' + name + ' on ' + state.baseData.concat(recent).join(', '));
    run('ml/.venv/bin/python', ['ml/train.py', '--data'].concat(state.baseData, recent, ['--name', name,
      '--init', state.best.model, '--lr', '3e-4', '--epochs', '12', '--dropout', '0.2', '--weight-decay', '1e-3']));
    const model = path.join('ml', 'models', name + '.json');
    const e = evaluate(model, args, name);
    const kept = e.score > state.best.eval.score;
    log('Round ' + r + ': ' + name + ' ' + fmt(e) + (kept ? ' -> new best' : ' -> kept ' + state.best.name + ' (' + state.best.eval.score.toFixed(1) + ')'));
    state.rounds.push({ name, data, model, eval: e, kept });
    if (kept) {
      state.best = { model, name, eval: e };
      ship(path.join(ROOT, model));
      log('Shipped ' + name + ' to js/mahjong-ml-weights.js');
    }
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }
  log('Done. Best: ' + state.best.name + ', ' + fmt(state.best.eval));
}

try { main(); } catch (err) { log('FAILED: ' + (err.stack || err.message)); process.exit(1); }
