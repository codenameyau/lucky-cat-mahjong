#!/usr/bin/env node
/* League training for Neural Cat: it plays only other Neural Cat models,
   never the rule bots. Each round:
     1. generate: deals where every seat is a model. Half the seats are the
        best model so far, exploring (discards, claims and kongs); the rest
        are league members, earlier kept models (s5 among them), playing
        their best.
     2. train: a new model from the best one, on the latest rounds' data.
     3. evaluate: the new model against the best one, two seats each on new
        deals every round, and against s5, the model that shipped before.
        It joins the league and becomes the best if it beats the best.
   The best model is shipped to js/mahjong-ml-weights.js as soon as it wins.
   State is in ml/league/state.json, so a stopped league picks up where it
   left off.

   npm run ml:league -- --start ml/models/s5.json --rounds 10 --deals 100000

   Options:
     --start FILE      the model to begin from (first run only); it is the
                       anchor every round is also measured against
     --rounds N        rounds to play this run (default 10)
     --deals N         deals to generate per round (default 100000)
     --keep N          rounds of data to train on (default 4)
     --members N       league members besides the best (default 4)
     --sample P        chance each decision is recorded (default 0.12)
     --eval-deals N    deals per evaluation, x4 seat rotations (default 2000)
     --hidden a,b      the network's hidden layers (default 256,128)
     --dir DIR         state and log (default ml/league) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ship } = require('./ship.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA_SEED = 10000000; // round r's deals start at DATA_SEED + r * 1,000,000
const EVAL_SEED = 30000000; // round r's evaluation deals start at EVAL_SEED + r * 10,000

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

let DIR = path.join(ROOT, 'ml', 'league');

function log(line) {
  const text = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + line;
  console.log(text);
  fs.appendFileSync(path.join(DIR, 'league.log'), text + '\n');
}

function run(cmd, args) {
  log('$ ' + cmd + ' ' + args.join(' '));
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = (res.stdout || '') + (res.stderr || '');
  fs.appendFileSync(path.join(DIR, 'league.log'), out + '\n');
  if (res.status !== 0) throw new Error(cmd + ' failed:\n' + out.slice(-2000));
  return out;
}

// Two seats each, rotated through every seat, on the same deals: the score
// is a's points per hand less b's.
function headToHead(a, b, deals, seed, name) {
  const json = path.join(DIR, 'eval-' + name + '.json');
  const A = 'ml:' + a, B = 'ml:' + b;
  run('node', ['scripts/competition.js', '--lineup', [A, B, A, B].join(','), '--deals', String(deals),
    '--seed', String(seed), '--json', json]);
  const s = JSON.parse(fs.readFileSync(json, 'utf8')).summary;
  return {
    score: s[A].pointsPerHand - s[B].pointsPerHand,
    pointsPerHand: s[A].pointsPerHand,
    winRate: s[A].winRate,
    dealInRate: s[A].dealInRate,
    avgWinPoints: s[A].avgWinPoints,
  };
}

function fmt(e) {
  return (e.score >= 0 ? '+' : '') + e.score.toFixed(1) + ' points/hand (wins ' + (100 * (e.winRate || 0)).toFixed(1) +
    '%, deal-ins ' + (100 * (e.dealInRate || 0)).toFixed(1) + '%, average win ' + Math.round(e.avgWinPoints || 0) + ')';
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.dir) DIR = path.resolve(String(a.dir));
  const STATE = path.join(DIR, 'state.json');
  const args = {
    rounds: parseInt(a.rounds || 10, 10),
    deals: parseInt(a.deals || 100000, 10),
    keep: parseInt(a.keep || 4, 10),
    members: parseInt(a.members || 4, 10),
    sample: parseFloat(a.sample || 0.12),
    evalDeals: parseInt(a['eval-deals'] || 2000, 10),
    hidden: String(a.hidden || '256,128'),
  };
  fs.mkdirSync(DIR, { recursive: true });
  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    if (!a.start) throw new Error('first run needs --start ml/models/<name>.json');
    const start = path.relative(ROOT, path.resolve(String(a.start)));
    state = { anchor: start, members: [start], best: start, rounds: [], deals: 0 };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
    log('League starts from ' + start);
  }

  for (let k = 0; k < args.rounds; k++) {
    const r = state.rounds.length + 1;
    const name = 'L' + r;
    const data = path.join('ml', 'data', 'league-' + r);
    // Half the seats: the best, exploring. The rest: the latest members.
    const members = state.members.filter((m) => m !== state.best).slice(-args.members);
    if (members.indexOf(state.anchor) === -1 && state.anchor !== state.best) members[0] = state.anchor;
    const others = members.length ? members : [state.best];
    const pool = others.map(() => 'neural-cat').concat(others.map((m) => 'ml:' + m));
    log('Round ' + r + ': ' + args.deals + ' deals, the best (' + state.best + ') exploring against ' + others.join(', '));
    run('node', ['scripts/ml/generate.js', '--deals', String(args.deals), '--lineup', 'mix', '--pool', pool.join(','),
      '--weights', state.best, '--temperature', '150', '--epsilon', '0.05', '--explore', '0',
      '--sample', String(args.sample), '--seed', String(DATA_SEED + r * 1000000), '--out', data]);
    state.deals += args.deals;
    const recent = state.rounds.map((x) => x.data).concat([data]).slice(-args.keep);
    log('Round ' + r + ': training ' + name + ' on ' + recent.join(', '));
    run('ml/.venv/bin/python', ['ml/train.py', '--data'].concat(recent, ['--name', name, '--hidden', args.hidden,
      '--init', state.best, '--lr', '3e-4', '--epochs', '8', '--patience', '3', '--dropout', '0.2', '--weight-decay', '1e-3']));
    const model = path.join('ml', 'models', name + '.json');
    const seed = EVAL_SEED + r * 10000;
    const vsBest = headToHead(model, state.best, args.evalDeals, seed, name + '-vs-best');
    const vsAnchor = state.best === state.anchor ? vsBest : headToHead(model, state.anchor, args.evalDeals, seed, name + '-vs-anchor');
    const kept = vsBest.score > 0;
    log('Round ' + r + ': ' + name + ' against the best ' + fmt(vsBest) + '; against ' + path.basename(state.anchor, '.json') + ' ' + fmt(vsAnchor) +
      (kept ? ' -> new best' : ' -> kept ' + state.best));
    state.rounds.push({ name, data, model, vsBest, vsAnchor, against: state.best, kept, deals: args.deals });
    if (kept) {
      state.best = model;
      state.members.push(model);
      ship(path.join(ROOT, model));
      log('Shipped ' + name + ' to js/mahjong-ml-weights.js');
    }
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }
  log('Done: ' + state.deals + ' deals. Best: ' + state.best);
}

try { main(); } catch (err) { log('FAILED: ' + (err.stack || err.message)); process.exit(1); }
