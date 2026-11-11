#!/usr/bin/env node
/* One round of the Only Orphans overnight loop (scripts/ml/oo-night.js):

   1. Data: the champion explores (temperature 150, epsilon 0.05) against a pool of
      the lineage's older generations, every seat recorded, on the native simulator.
      Made once a round, cached by generate.js's shard keys.
   2. Arms: networks fine-tuned from the champion on the last --window rounds of
      data (each recipe --seeds times; training takes about 20 s on the GPU), play
      settings (win bonus, claim margin) and weight-noise mutations (no training).
   3. A staged screen on a fresh deck (fast build): the champion's side is played
      once for every arm; an arm behind by more than a standard error is dropped,
      and only the best --top go on to the last stages.
   4. The screen's best, if ahead by more than --promote standard errors with hands
      won not down by more than one, plays a fresh deck on the exact build
      (--confirm deals). It becomes the champion if ahead by 2 standard errors there
      and hands won don't fall by more than one standard error.

   node scripts/ml/oo-round.js [--recipes default] [--no-train] [--no-data]
     --deals N      data deals (default 100000)   --window N  rounds of data (default 3)
     --stages a,b,c screen stages (default 8000,16000,16000)
     --confirm N    confirming deals (default 40000)
     --arms LIST    extra model files to screen as arms too */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const O = require('./oo-night.js');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'ml', 'oo-night');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

// Training recipes: fine-tunes from the champion.
const RECIPES = {
  c: { what: 'lr 1e-4, 4 epochs (the OS2c1 recipe)', args: ['--lr', '1e-4', '--epochs', '4'] },
  a: { what: 'lr 3e-4, 8 epochs', args: ['--lr', '3e-4', '--epochs', '8'] },
  b: { what: 'lr 1e-3, 8 epochs', args: ['--lr', '1e-3', '--epochs', '8'] },
};

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const st = O.loadState();
  const r = st.rounds.length + 1;
  const champ = st.champion, champName = path.basename(champ, '.json');
  const W = require('./weights.js');
  const cw = W.readWeights(path.resolve(ROOT, champ));
  const play = cw.meta.play;
  const logFile = path.join(DIR, 'round-' + r + '.log');
  const say = (m) => { const l = new Date().toISOString().slice(11, 19) + ' ' + m; console.log(l); fs.appendFileSync(logFile, l + '\n'); };
  const timing = {};
  const round = { round: r, champion: champName, arms: [], timing };
  say('Round ' + r + ': champion ' + champName + ' ' + JSON.stringify(play));

  // 1. Data.
  const dataDir = 'ml/data/oon-' + st.next.data;
  const window = parseInt(a.window || 3, 10);
  if (!a['no-data']) {
    const pool = ['only-orphans', 'only-orphans', 'only-orphans'].concat(O.OLD.map((n) => 'oo:ml/models/' + n + '.json'),
      st.lineage.filter((n) => n !== champName).map((n) => 'oo:ml/models/' + n + '.json'));
    const seed = O.SEEDS.data + (st.next.data - 1) * 1000000;
    say('Data: ' + (a.deals || 100000) + ' deals into ' + dataDir + ', pool ' + pool.join(','));
    timing.data = O.run('node', ['scripts/ml/generate.js', '--native', '--deals', String(a.deals || 100000), '--workers', '10', '--lineup', 'mix', '--pool', pool.join(','),
      '--explore', '0', '--sample', '0.12', '--temperature', '150', '--epsilon', '0.05', '--learner', 'only-orphans', '--weights', champ, '--seed', String(seed), '--out', dataDir], logFile);
    round.data = dataDir;
    st.next.data++;
    saveSoon(st);
  }
  const sets = [];
  for (let k = st.next.data - 1; k >= 1 && sets.length < window; k--) if (fs.existsSync(path.join(ROOT, 'ml', 'data', 'oon-' + k, 'manifest.json'))) sets.push('ml/data/oon-' + k);
  say('Training window: ' + sets.join(', '));

  // 2. Arms.
  const arms = [];
  const seeds = parseInt(a.seeds || 2, 10);
  if (!a['no-train']) {
    const t0 = Date.now();
    const recipes = String(a.recipes || 'c,a').split(',');
    for (const id of recipes) for (let s = 0; s < seeds; s++) {
      const name = 'N' + r + id + s, file = path.join(ROOT, 'ml', 'models', name + '.json');
      if (!fs.existsSync(file)) {
        O.run(O.PY, ['ml/train.py', '--data'].concat(sets, ['--name', name, '--init', champ, '--hidden', (cw.meta.hidden || [256, 128]).join(','), '--seed', String(s + 10 * r), '--patience', '3'], RECIPES[id].args), logFile);
        const w = JSON.parse(fs.readFileSync(file, 'utf8')); w.meta.play = play; w.meta.arm = 'recipe ' + id + ': ' + RECIPES[id].what; w.meta.from = champName;
        fs.writeFileSync(file, JSON.stringify(w));
      }
      arms.push({ name, file, kind: 'train', recipe: id });
    }
    timing.train = (Date.now() - t0) / 1000;
  }
  // Play settings around the champion's.
  const settings = String(a.settings || 'wb-200,wb+200,cm-25,cm+25').split(',').filter(Boolean);
  settings.forEach((sx) => {
    const m = sx.match(/^(wb|cm)([+-]\d+)$/);
    const p = m[1] === 'wb' ? { winBonus: Math.max(0, play.winBonus + parseInt(m[2], 10)) } : { claimMargin: Math.max(0, play.claimMargin + parseInt(m[2], 10)) };
    const name = 'S' + r + sx.replace('+', 'p').replace('-', 'm');
    arms.push({ name, file: O.setting(champ, name, p), kind: 'setting', setting: p });
  });
  // Weight noise.
  const noise = String(a.noise || '0.02,0.05').split(',').filter(Boolean).map(Number);
  noise.forEach((sg) => { for (let s = 1; s <= seeds; s++) { const name = 'M' + r + 'n' + Math.round(sg * 100) + 's' + s; arms.push({ name, file: O.mutate(champ, sg, 1000 * r + s, name), kind: 'noise', sigma: sg }); } });
  (a.arms ? String(a.arms).split(',') : []).forEach((f) => arms.push({ name: path.basename(f, '.json'), file: path.resolve(ROOT, f), kind: 'extra' }));
  say('Arms: ' + arms.map((x) => x.name).join(', '));

  // 3. Screen.
  const stages = String(a.stages || '8000,16000,16000').split(',').map(Number);
  const sseed = O.SEEDS.screen + st.next.screen * 1000000;
  st.next.screen++;
  saveSoon(st);
  O.stats.played = 0; O.stats.cached = 0;
  const res = await O.screen(arms.map((x) => x.file), path.resolve(ROOT, champ), sseed, stages, { workers: 10, build: 'fast', drop: 1, top: parseInt(a.top || 4, 10) });
  res.log.forEach((l) => fs.appendFileSync(logFile, l + '\n'));
  timing.screen = res.seconds;
  round.screen = { seed: sseed, stages, champion: res.champion, played: res.played, cached: res.cached };
  res.arms.forEach((x) => { const arm = arms.find((y) => y.name === x.name); Object.assign(arm, { alive: x.alive, summary: x.summary, gap: x.gap }); arm.file = path.relative(ROOT, arm.file); });
  round.arms = arms;

  // 4. Confirm the best.
  const z = (x) => x.gap.points / x.gap.se;
  // The best by z among arms whose hands won are not down by more than a standard error.
  const best = arms.filter((x) => x.alive && x.gap.deals >= stages.reduce((t, s) => t + s, 0) && x.gap.wins > -x.gap.winsSE).sort((p, q) => z(q) - z(p))[0];
  const promote = parseFloat(a.promote || 1);
  if (best && z(best) > promote) {
    const cseed = O.SEEDS.confirm + st.next.confirm * 1000000;
    st.next.confirm++;
    saveSoon(st);
    const deals = parseInt(a.confirm || 40000, 10);
    say('Confirming ' + best.name + ' on ' + deals + ' fresh deals from seed ' + cseed + ' (exact build)');
    O.stats.played = 0; O.stats.cached = 0;
    const c = await O.screen([path.resolve(ROOT, best.file)], path.resolve(ROOT, champ), cseed, [deals], { workers: 10, build: 'exact', drop: 1e9, top: 1 });
    c.log.forEach((l) => fs.appendFileSync(logFile, l + '\n'));
    timing.confirm = c.seconds;
    const g = c.arms[0].gap;
    // The Pareto rule (a new generation): points a hand or hands won up 2 standard errors, the
    // other not down more than 1, deal-ins not up more than 1. A ship candidate (against the
    // shipped model) needs points up 3 standard errors on pooled fresh exact deals, wins not
    // down more than 1: this run alone is printed as a step toward that bar.
    const kept = ((g.points > 2 * g.se && g.wins > -g.winsSE) || (g.wins > 2 * g.winsSE && g.points > -g.se)) && g.dealIns < g.dealInsSE;
    const shipBar = g.points > 3 * g.se && g.wins > -g.winsSE;
    round.confirm = { name: best.name, seed: cseed, deals, champion: c.champion, summary: c.arms[0].summary, gap: g, kept, shipBar };
    say((kept ? 'KEPT (Pareto rule): ' : 'not kept: ') + O.line(best.name, c.arms[0].summary, g) + (shipBar ? ' [meets the 3 SE ship bar on this run: needs a second fresh run pooled]' : ''));
    if (kept) { st.champion = best.file; st.lineage.push(best.name); }
  } else say('No arm ahead enough to confirm' + (best ? ' (best ' + best.name + ', z ' + z(best).toFixed(2) + ')' : ''));
  st.rounds.push(round);
  O.saveState(st);
  say('Round ' + r + ' done: ' + JSON.stringify(timing));
}
function saveSoon(st) { O.saveState(st); }

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
