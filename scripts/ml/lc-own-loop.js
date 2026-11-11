#!/usr/bin/env node
/* Lucky Cat against its own lineage: the overnight rounds (scripts/ml/lc-own.js does the playing).

   node scripts/ml/lc-own-loop.js [--rounds N]

   Each round reads ml/overnight/lucky-cat/plan.json (so the recipe can change
   between rounds without a restart), then:
     1. data: the champion explores against itself and the older generations
        (lc-own.js data, cached by its settings);
     2. training: every arm of the plan in one GPU process (ml/lc_own_train.py),
        on the last plan.window rounds of data;
     3. a screen on fresh deals, in stages, dropping arms behind by 1 SE;
     4. the best arm ahead by plan.screenBar SE (hands won not behind by more
        than 1 SE) is confirmed on plan.confirmDeals fresh deals on the exact
        build; it becomes the champion if it is ahead by 2 SE in points and
        its hands won are not behind by more than 1 SE.
   Seeds come from state.seed, a counter that only goes up: no deal is played
   twice. State in ml/overnight/lucky-cat/state.json, log in loop.log. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const O = require('./lc-own.js');
const { PYTHON } = require('./python.js');

const ROOT = path.join(__dirname, '..', '..');
const DIR = O.OUT;
const STATE = path.join(DIR, 'state.json');
const PLAN = path.join(DIR, 'plan.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const log = (s) => { const l = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + s; console.log(l); fs.appendFileSync(path.join(DIR, 'loop.log'), l + '\n'); };

function py(args, logFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, args, { cwd: ROOT });
    const out = fs.createWriteStream(logFile, { flags: 'a' });
    p.stdout.pipe(out); p.stderr.pipe(out);
    p.on('exit', (c) => (c ? reject(new Error('python ' + args[0] + ' exited ' + c + ' (see ' + logFile + ')')) : resolve()));
  });
}

function takeSeeds(state, n) { const s = state.seed; state.seed += n; writeJson(STATE, state); return s; }

async function round(state, plan) {
  const r = state.rounds.length + 1;
  const champ = state.champion;
  // The head: the lineage's working model, which makes the data and starts the arms.
  // With plan.advance 'screen' it moves to the best screened arm ahead (policy
  // iteration: steps too small to confirm one at a time add up); it becomes the
  // champion only when it beats the champion by the bar on fresh deals.
  const head = state.head || champ;
  const tag = plan.prefix || 'LO';
  const rec = { round: r, champion: champ, head, started: new Date().toISOString(), times: {} };
  log('Round ' + r + ': champion ' + champ + ', head ' + head + ', table pool ' + state.pool.map((f) => path.basename(f, '.json')).join(','));
  // 1. data
  let t = Date.now();
  const dataDir = 'ml/data/own-' + r;
  // plan.dataSeed: round 1 only (data made by hand before the loop started), then the counter.
  const dseed = (r === 1 && plan.dataSeed) || takeSeeds(state, plan.deals);
  const dm = await O.data(head, state.pool, dseed, plan.deals, dataDir, { replays: plan.replays, share: plan.share });
  rec.data = { dir: dataDir, seed: dseed, deals: plan.deals, rows: dm.policyRows, seconds: dm.seconds, cached: !!dm.cached };
  rec.times.data = (Date.now() - t) / 1000;
  log('Round ' + r + ': data ' + dataDir + ' (' + path.basename(head, '.json') + ' exploring), ' + dm.policyRows + ' choices replayed, ' + rec.times.data.toFixed(0) + 's' + (dm.cached ? ' (cached)' : ''));
  state.dataDirs = (state.dataDirs || []).concat([{ dir: dataDir, champion: head }]);
  const window = state.dataDirs.filter((d) => plan.offPolicy || d.champion === head).slice(-(plan.window || 2)).map((d) => d.dir);
  // 2. training
  t = Date.now();
  const arms = plan.arms.map((a, k) => Object.assign({ init: head }, a, { name: tag + r + String.fromCharCode(97 + k) }));
  const armsFile = path.join(DIR, 'arms-' + r + '.json');
  writeJson(armsFile, arms);
  await py(['ml/lc_own_train.py', '--data'].concat(window, ['--arms', armsFile, '--report', path.join(DIR, 'train-' + r + '.json')]), path.join(DIR, 'train-' + r + '.log'));
  rec.times.train = (Date.now() - t) / 1000;
  const tr = readJson(path.join(DIR, 'train-' + r + '.json'), []);
  log('Round ' + r + ': trained ' + arms.length + ' arms on ' + window.join(',') + ' in ' + rec.times.train.toFixed(0) + 's');
  // 3. screen, against the head
  t = Date.now();
  const stages = plan.stages || [8000, 24000, 48000];
  const total = stages.reduce((a, b) => a + b, 0);
  const sseed = takeSeeds(state, total);
  O.stats.played = 0; O.stats.cached = 0; O.stats.seconds = 0;
  const res = await O.screen(head, arms.map((a) => 'ml/models/' + a.name + '.json'), sseed, stages, { pool: state.pool, log });
  rec.times.screen = (Date.now() - t) / 1000;
  rec.screen = { against: head, seed: sseed, stages, played: O.stats.played, cached: O.stats.cached };
  rec.arms = res.map((x, k) => Object.assign({ name: arms[k].name, recipe: plan.arms[k], train: tr.find((y) => y.name === arms[k].name) || null }, x));
  const full = rec.arms.filter((a) => a.alive && a.pair && a.pair.deals >= total);
  log('Round ' + r + ': screen in ' + rec.times.screen.toFixed(0) + 's, ' + O.stats.played + ' deal-models played, ' + O.stats.cached + ' from cache; ' + full.length + ' arms played the whole screen');
  // 4. the next head, then a confirmation against the champion
  let cand = null;
  if (plan.advance === 'screen') {
    // ahead of the head by plan.advanceBar SE in points, hands won not behind
    const up = full.filter((a) => a.pair.gap > (plan.advanceBar || 1) * a.pair.se && a.pair.winGap >= 0).sort((a, b) => b.pair.gap - a.pair.gap);
    if (up.length) { state.head = up[0].file; rec.newHead = up[0].name; log('Round ' + r + ': head moves to ' + up[0].name); }
    if (state.head && state.head !== champ && (r % (plan.confirmEvery || 1) === 0 || up.length)) cand = { file: state.head, name: path.basename(state.head, '.json') };
  } else {
    const bar = plan.screenBar || 2;
    const ok = full.filter((a) => a.pair.gap > bar * a.pair.se && a.pair.winGap >= -a.pair.winSe).sort((a, b) => b.pair.gap - a.pair.gap);
    if (ok.length) cand = { file: ok[0].file, name: ok[0].name };
  }
  if (cand && !(state.confirmed || {})[cand.file + '|' + champ]) {
    t = Date.now();
    const cseed = takeSeeds(state, plan.confirmDeals || 80000);
    const conf = await O.screen(champ, [cand.file], cseed, [plan.confirmDeals || 80000], { pool: state.pool, exact: true, drop: 1e9, log });
    const c = conf[0];
    rec.confirm = { name: cand.name, against: champ, seed: cseed, pair: c.pair, me: c.me, ch: c.ch, line: c.line };
    rec.times.confirm = (Date.now() - t) / 1000;
    const pass = c.pair.gap > 2 * c.pair.se && c.pair.winGap >= -c.pair.winSe;
    rec.confirm.pass = pass;
    state.confirmed = Object.assign(state.confirmed || {}, { [cand.file + '|' + champ]: { pass, gap: c.pair.gap, se: c.pair.se, winGap: c.pair.winGap, winSe: c.pair.winSe, deals: c.pair.deals } });
    log('Round ' + r + ': confirm ' + c.line + ' against ' + path.basename(champ, '.json') + (pass ? ' -> NEW CHAMPION' : ' -> not confirmed'));
    if (pass) {
      state.champion = cand.file;
      state.head = cand.file;
      state.champions = (state.champions || ['ml/models/lc32.json']).concat([cand.file]);
      if (plan.poolGrows !== false) state.pool = [cand.file].concat(state.pool).slice(0, plan.poolSize || 4);
    }
  }
  rec.finished = new Date().toISOString();
  state.rounds.push(rec);
  writeJson(STATE, state);
  return rec;
}

async function main() {
  const a = process.argv.slice(2);
  const n = a.includes('--rounds') ? parseInt(a[a.indexOf('--rounds') + 1], 10) : 1000;
  let state = readJson(STATE, null);
  if (!state) state = { champion: 'ml/models/lc32.json', champions: ['ml/models/lc32.json'], pool: O.DEFAULT_POOL.slice(), seed: 800000000, rounds: [] };
  for (let k = 0; k < n; k++) {
    const plan = readJson(PLAN, null);
    if (!plan || plan.stop) { log('plan.json says stop'); break; }
    try {
      await round(state, plan);
    } catch (e) {
      log('Round failed: ' + (e.stack || e.message));
      break;
    }
    state = readJson(STATE, state);
  }
}

if (require.main === module) main();
