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

// Two independent paired runs, pooled deal-weighted.
function pool2(a, b) {
  const n = a.deals + b.deals, w = (k) => (a[k] * a.deals + b[k] * b.deals) / n;
  const e = (k) => Math.sqrt(Math.pow(a[k] * a.deals, 2) + Math.pow(b[k] * b.deals, 2)) / n;
  return { deals: n, gap: w('gap'), se: e('se'), winGap: w('winGap'), winSe: e('winSe'),
    dealInGap: a.dealInGap == null ? null : w('dealInGap'), dealInSe: a.dealInSe == null ? null : e('dealInSe') };
}

// The ship bar (the orchestrator, 2026-11-11): against the shipped lc32, on two fresh exact runs
// pooled (never screen deals), points up by 3 SE and hands won not down by more than 1 SE.
async function shipCheck(state, plan, file, log) {
  const deals = plan.shipDeals || 80000, runs = [];
  for (let k = 0; k < 2; k++) {
    const seed = takeSeeds(state, deals);
    // the fixed ship table (the orchestrator, 2026-11-11): lc32, lc31 and lc30 in the other seats
    const c = (await O.screen(SHIPPED, [file], seed, [deals], { pool: ['lc32', 'lc31', 'lc30'].map((m) => 'ml/models/' + m + '.json'), exact: true, drop: 1e9, log }))[0];
    runs.push({ seed, pair: c.pair, me: c.me, ch: c.ch, line: c.line });
  }
  const P = pool2(runs[0].pair, runs[1].pair);
  const pass = P.gap > 3 * P.se && P.winGap >= -P.winSe;
  const fmt = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
  log('Ship check ' + path.basename(file, '.json') + ' against lc32, pooled ' + P.deals + ' fresh exact deals: ' + fmt(P.gap) + ' ± ' + P.se.toFixed(1) +
    ' points a hand, hands won ' + fmt(P.winGap, 2) + ' ± ' + P.winSe.toFixed(2) + (pass ? ' -> SHIP CANDIDATE (3 SE)' : ' -> below the ship bar'));
  const out = { file, runs, pooled: P, pass };
  state.shipChecks = (state.shipChecks || []).concat([out]);
  writeJson(STATE, state);
  return out;
}
const SHIPPED = 'ml/models/lc32.json';

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
  // 0. a value for truncated replays (plan.value): the head's own games, a fresh value each round
  let t = Date.now();
  let valueModel = null;
  if (plan.value) {
    const vdir = 'ml/data/lov-' + r, vname = (plan.prefix || 'LO') + 'V' + r;
    const vseed = takeSeeds(state, plan.value.deals || 20000);
    const vm = await O.valueData(head, state.pool, vseed, plan.value.deals || 20000, vdir, { sample: plan.value.sample || 0.3 });
    if (!fs.existsSync(path.join(ROOT, 'ml', 'models', vname + '.json'))) {
      await py(['ml/train.py', '--data', vdir, '--name', vname, '--hidden', '512,256', '--lr', '1e-3', '--epochs', String(plan.value.epochs || 12), '--patience', '3', '--win-bonus', '0'],
        path.join(DIR, 'value-' + r + '.log'));
    }
    valueModel = 'ml/models/' + vname + '.json';
    rec.value = { dir: vdir, seed: vseed, samples: vm.samples, model: valueModel, truncate: plan.value.truncate || 3 };
    rec.times.value = (Date.now() - t) / 1000;
    log('Round ' + r + ': value ' + vname + ' on ' + vm.samples + ' positions in ' + rec.times.value.toFixed(0) + 's');
    if (plan.value.keepData !== true) fs.rmSync(path.join(ROOT, vdir), { recursive: true, force: true });
  }
  // 1. data
  t = Date.now();
  const dataDir = 'ml/data/own-' + r;
  // plan.dataSeed: round 1 only (data made by hand before the loop started), then the counter.
  const dseed = (r === 1 && plan.dataSeed) || takeSeeds(state, plan.deals);
  const dm = await O.data(head, state.pool, dseed, plan.deals, dataDir, { replays: plan.replays, share: plan.share, halving: plan.halving, margin: plan.halvingMargin, extra: plan.extraRandom, half: plan.halfSpicy, closeSe: plan.closeSe,
    value: valueModel, truncate: plan.value && (plan.value.truncate || 3) });
  rec.data = { dir: dataDir, seed: dseed, deals: plan.deals, rows: dm.policyRows, seconds: dm.seconds, cached: !!dm.cached };
  rec.times.data = (Date.now() - t) / 1000;
  log('Round ' + r + ': data ' + dataDir + ' (' + path.basename(head, '.json') + ' exploring), ' + dm.policyRows + ' choices replayed, ' + rec.times.data.toFixed(0) + 's' + (dm.cached ? ' (cached)' : ''));
  state.dataDirs = (state.dataDirs || []).concat([{ dir: dataDir, champion: head }]);
  const window = state.dataDirs.filter((d) => !(plan.excludeData || []).includes(d.dir) && (plan.offPolicy || d.champion === head)).slice(-(plan.window || 2)).map((d) => d.dir);
  // 2. training
  t = Date.now();
  const arms = plan.arms.map((a, k) => Object.assign({ init: head }, a, { name: tag + r + String.fromCharCode(97 + k) }));
  // a soup arm names its members by their index in plan.arms
  arms.forEach((a) => { if (a.mode === 'soup') a.members = a.of.map((k) => arms[k].name); });
  const armsFile = path.join(DIR, 'arms-' + r + '.json');
  writeJson(armsFile, arms);
  await py(['ml/lc_own_train.py', '--data'].concat(window, ['--arms', armsFile, '--report', path.join(DIR, 'train-' + r + '.json')]), path.join(DIR, 'train-' + r + '.log'));
  rec.times.train = (Date.now() - t) / 1000;
  const tr = readJson(path.join(DIR, 'train-' + r + '.json'), []);
  log('Round ' + r + ': trained ' + arms.length + ' arms on ' + window.join(',') + ' in ' + rec.times.train.toFixed(0) + 's');
  // Blind steps (plan.blind N, after the plateau of rounds 5 and 6): no screen. The single arm
  // becomes the head and makes the next round's data; every N steps the head is confirmed against
  // the champion, so N small steps are judged together, where their sum can be seen.
  let full = [], blindCand = null;
  if (plan.blind) {
    const hk = plan.headArm || 0;
    state.head = 'ml/models/' + arms[hk].name + '.json';
    state.blindSteps = (state.blindSteps || 0) + 1;
    rec.newHead = arms[hk].name; rec.blind = state.blindSteps;
    log('Round ' + r + ': blind step ' + state.blindSteps + ', head moves to ' + arms[hk].name);
    if (state.blindSteps % plan.blind === 0) blindCand = { file: state.head, name: arms[hk].name, screenGap: 0 };
  } else {
    // 3. screen, against the head
    t = Date.now();
    const stages = plan.stages || [8000, 24000, 48000];
    const total = stages.reduce((a, b) => a + b, 0);
    const sseed = takeSeeds(state, total);
    O.stats.played = 0; O.stats.cached = 0; O.stats.seconds = 0;
    const res = await O.screen(head, arms.map((a) => 'ml/models/' + a.name + '.json'), sseed, stages, { pool: state.pool, log, drop: plan.drop == null ? 1 : plan.drop });
    rec.times.screen = (Date.now() - t) / 1000;
    rec.screen = { against: head, seed: sseed, stages, played: O.stats.played, cached: O.stats.cached };
    rec.arms = res.map((x, k) => Object.assign({ name: arms[k].name, recipe: plan.arms[k], train: tr.find((y) => y.name === arms[k].name) || null }, x));
    full = rec.arms.filter((a) => a.alive && a.pair && a.pair.deals >= total);
    log('Round ' + r + ': screen in ' + rec.times.screen.toFixed(0) + 's, ' + O.stats.played + ' deal-models played, ' + O.stats.cached + ' from cache; ' + full.length + ' arms played the whole screen');

  }
  // 4. the next head, then a confirmation against the champion
  let cand = blindCand;
  if (plan.blind) {
    // judged every plan.blind steps (above)
  } else if (plan.advance === 'screen') {
    // ahead of the head by plan.advanceBar SE in points, hands won not behind
    // A Pareto-shaped advance: points up advanceBar SE with hands won not down, or hands won up
    // 2 SE with points not down; deal-ins not up by more than 1 SE. Ranked by the two z-scores summed.
    const z = (a) => a.pair.gap / a.pair.se + a.pair.winGap / a.pair.winSe;
    const up = full.filter((a) => {
      const p = a.pair, bar = plan.advanceBar || 1;
      const okD = p.dealInSe == null || p.dealInGap <= Math.max(0.25, p.dealInSe);
      return okD && ((p.gap > bar * p.se && p.winGap >= 0) || (p.winGap > 2 * p.winSe && p.gap >= 0));
    }).sort((a, b) => z(b) - z(a));
    if (up.length) { state.head = up[0].file; rec.newHead = up[0].name; log('Round ' + r + ': head moves to ' + up[0].name); }
    if (state.head && state.head !== champ && (r % (plan.confirmEvery || 1) === 0 || up.length)) cand = { file: state.head, name: path.basename(state.head, '.json'), screenGap: up.length ? up[0].pair.gap : 0 };
  } else {
    const bar = plan.screenBar || 2;
    const ok = full.filter((a) => a.pair.gap > bar * a.pair.se && a.pair.winGap >= -a.pair.winSe).sort((a, b) => b.pair.gap - a.pair.gap);
    if (ok.length) cand = { file: ok[0].file, name: ok[0].name, screenGap: ok[0].pair.gap };
  }
  if (cand && !(state.confirmed || {})[cand.file + '|' + champ]) {
    t = Date.now();
    // 160,000 deals (SE about 1.0) when the screen's gap is under 4 points.
    const base = plan.confirmDeals || 80000;
    const cdeals = (cand.screenGap || 0) < 4 && base >= 80000 ? Math.max(160000, base) : base;
    const cseed = takeSeeds(state, cdeals);
    let conf = await O.screen(champ, [cand.file], cseed, [cdeals], { pool: state.pool, exact: true, drop: 1e9, log });
    // Within 1.5 SE either way: twice the deals before judging (the first half comes from the cache).
    if (plan.extendConfirm !== false && Math.abs(conf[0].pair.gap) < 1.5 * conf[0].pair.se) {
      takeSeeds(state, cdeals);
      log('Round ' + r + ': confirmation within 1.5 SE, extended to ' + 2 * cdeals + ' deals');
      conf = await O.screen(champ, [cand.file], cseed, [cdeals, cdeals], { pool: state.pool, exact: true, drop: 1e9, log });
    }
    const c = conf[0];
    rec.confirm = { name: cand.name, against: champ, seed: cseed, pair: c.pair, me: c.me, ch: c.ch, line: c.line };
    rec.times.confirm = (Date.now() - t) / 1000;
    // A generation: a Pareto step on fresh exact deals. Points or hands won up by 2 SE, the
    // other not down by more than 1 SE, and deal-ins not up by more than 1 SE. A ship
    // milestone: points up by 2 SE.
    const P = c.pair;
    const dealsOk = P.dealInSe == null || P.dealInGap <= Math.max(0.25, P.dealInSe);
    const pass = dealsOk && ((P.gap > 2 * P.se && P.winGap >= -P.winSe) || (P.winGap > 2 * P.winSe && P.gap >= -P.se));
    const milestone = pass && P.gap > 2 * P.se;
    rec.confirm.pass = pass; rec.confirm.milestone = milestone;
    state.blindSteps = 0;
    state.confirmed = Object.assign(state.confirmed || {}, { [cand.file + '|' + champ]: { pass, gap: c.pair.gap, se: c.pair.se, winGap: c.pair.winGap, winSe: c.pair.winSe, deals: c.pair.deals } });
    log('Round ' + r + ': confirm ' + c.line + ' against ' + path.basename(champ, '.json') + (pass ? ' -> NEW GENERATION' + (milestone ? ' (points milestone)' : '') : ' -> not confirmed'));
    if (!pass && plan.revertOnFail !== false && state.head === cand.file) { state.head = champ; log('Round ' + r + ': head back to ' + path.basename(champ, '.json')); }
    if (pass) {
      state.generations = (state.generations || []).concat([{ name: cand.name, file: cand.file, round: r, milestone, against: champ, pair: P }]);
      // Against lc32 itself: every generation with a points milestone, or every generation with plan.shipCheckAll.
      if (milestone || plan.shipCheckAll) rec.ship = await shipCheck(state, plan, cand.file, log);
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
  // --confirm FILE: a Pareto confirmation of FILE against the champion first (160,000 fresh exact deals).
  if (a.includes('--confirm')) {
    const file = a[a.indexOf('--confirm') + 1], champ = state.champion, plan = readJson(PLAN, {});
    const cseed = takeSeeds(state, 160000);
    const c = (await O.screen(champ, [file], cseed, [160000], { pool: state.pool, exact: true, drop: 1e9, log }))[0];
    const P = c.pair, okD = P.dealInSe == null || P.dealInGap <= Math.max(0.25, P.dealInSe);
    const pass = okD && ((P.gap > 2 * P.se && P.winGap >= -P.winSe) || (P.winGap > 2 * P.winSe && P.gap >= -P.se));
    const milestone = pass && P.gap > 2 * P.se;
    state.confirmed = Object.assign(state.confirmed || {}, { [file + '|' + champ]: { pass, gap: P.gap, se: P.se, winGap: P.winGap, winSe: P.winSe, deals: P.deals, seed: cseed } });
    log('Confirm ' + c.line + ' against ' + path.basename(champ, '.json') + (pass ? ' -> NEW GENERATION' + (milestone ? ' (points milestone)' : '') : ' -> not confirmed'));
    if (pass) {
      state.generations = (state.generations || []).concat([{ name: path.basename(file, '.json'), file, milestone, against: champ, pair: P }]);
      if (milestone) await shipCheck(state, plan, file, log);
      state.champion = file; state.head = file;
      state.champions = (state.champions || []).concat([file]);
      state.pool = [file].concat(state.pool).slice(0, plan.poolSize || 4);
    }
    writeJson(STATE, state);
  }
  // --ship FILE: the ship check for FILE against lc32 first (two fresh exact runs, pooled).
  if (a.includes('--ship')) await shipCheck(state, readJson(PLAN, {}), a[a.indexOf('--ship') + 1], log);
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
