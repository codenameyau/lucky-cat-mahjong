#!/usr/bin/env node
/* Phase 1 of the frontier plan (docs/machine-learning/frontier-plan.md):
   rounds of training for the two lineages, on features v2 with the hidden
   tiles as targets, kept only by the benchmark's bar.

   node scripts/ml/frontier.js --lineage lucky-cat --rounds 4
   node scripts/ml/frontier.js --lineage sphinx --rounds 10
   (npm run ml:frontier -- --lineage sphinx)

   Each round:
     1. generate  the champion plays (lucky.js generate --oracle --returns),
                  every real choice recorded with the hidden tiles beside it:
                  labels for training, never inputs.
     2. train     three arms (ml/train_lucky.py --mode oracle --aux): the
                  per-move deal-in teacher of phase 0 and the auxiliary heads
                  that learn to read the other hands and the wall.
     3. screen    each arm against the champion at the benchmark table
                  (bench.js compare); the best with a gap of 1 standard error
                  or more goes on.
     4. judge     the five stages of the bar (bench.js judge --vs champion).
                  Only a model that passes becomes the champion, and it is
                  recorded as the lineage's next generation with its Table
                  Score (bench/lineages.json, bench/scores.json).

   Lucky Cat starts from lc32 widened to features v2 (its new inputs start
   at zero, so it plays exactly as lc32) and fine-tunes from it. Sphinx
   starts from zero weights (random play) and owes nothing to any other
   bot: its first rounds learn from its own rare wins in self-play, then it
   joins the table.

   Options: --rounds N (1), --workers N, --deals N (data per round),
   --screen N (deals per screen), --no-judge (screen only: nothing is
   promoted). State and log in ml/frontier/<lineage>/; data in
   ml/data/<prefix>-<round> (the last 3 rounds kept). */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const F2 = require('../../js/mahjong-frontier-net.js');
const D = require('./disk.js');

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

const plain = (w) => { w.layers = w.layers.map((l) => ({ rows: l.rows, cols: l.cols, w: Array.from(l.w), b: Array.from(l.b) })); return w; };

const TABLE = 'neural-cat,jorge-yau,neural-cat';

const LINEAGES = {
  'lucky-cat': {
    prefix: 'LV', seed: 950000000,
    start() {
      const file = 'ml/models/lc32v2.json';
      if (!fs.existsSync(path.join(ROOT, file))) {
        const B = require('./bench.js');
        const gen0 = B.lineages().lineages['lucky-cat'].generations[0];
        const w1 = require(B.resolveFile(gen0.model.slice(3)));
        const w = F2.widen(w1);
        w.meta.name = 'lc32v2';
        fs.writeFileSync(path.join(ROOT, file), JSON.stringify(w));
      }
      return { name: 'lc32v2', model: file };
    },
    // One seat at the game's table, as the lab trains Lucky Cat.
    generate: () => ['--learners', '1', '--pool', TABLE, '--sample', '0.5'],
    // Native scale (from round 4): 5x the data a round, kept for 2 rounds,
    // and screens on 40,000 deals (one standard error about 2.5 points a hand,
    // so a +5 arm passes). Rounds 1-3 (20,000 deals, 10,000-deal screens)
    // kept nothing: every screen was within noise.
    deals: 100000,
    keep: 2,
    screen: 40000,
    // a: round 3's best reader (LV3b: waits AUC 0.61), on 5x the data.
    // b: the same with the heads pulling a quarter as hard (aux 0.2 is a large push).
    // c: what hands scored (PG3, the best probe), heads at 0.05.
    arms: [
      { key: 'a', why: 'teacher + aux 0.2, lr 1e-3, 8 epochs (LV3b on 5x the data)', args: ['--mode', 'oracle', '--lr', '1e-3', '--epochs', '8', '--aux', '0.2'] },
      { key: 'b', why: 'teacher + aux 0.05, lr 1e-3, 8 epochs', args: ['--mode', 'oracle', '--lr', '1e-3', '--epochs', '8', '--aux', '0.05'] },
      { key: 'c', why: 'returns (pg, hidden-tile critic) + teacher 0.5 + aux 0.05, lr 3e-4, 6 epochs', args: ['--mode', 'pg', '--oracle-critic', '--lr', '3e-4', '--epochs', '6', '--aux', '0.05', '--teach', '0.5'] },
    ],
  },
  sphinx: {
    prefix: 'SP', seed: 960000000,
    start() {
      const file = 'ml/models/sp0.json';
      if (!fs.existsSync(path.join(ROOT, file))) {
        const w = plain(F2.zeroWeights());
        w.meta = { name: 'sp0', random: true };
        fs.writeFileSync(path.join(ROOT, file), JSON.stringify(w));
      }
      return { name: 'sp0', model: file };
    },
    // Restarted at native scale (Sphinx v2): at the game's table from round 1.
    // In self-play among random players (v1) the deal-in teacher learned about
    // random opponents, and every arm lost about 43 points a hand to random
    // play at the benchmark table. Its past generations join the pool once it
    // has some.
    generate: (state) => {
      const selves = state.champions.length > 1 ? state.champions.slice(-2).map((c) => 'lc:' + c.model) : [];
      return ['--learners', '1', '--pool', [TABLE].concat(selves).join(','), '--sample', '0.1', '--sample-won', '1'];
    },
    deals: 100000,
    keep: 2,
    screen: 40000,
    // a: v1's recipe, at the table. b: defence first, no imitation of wins.
    // c: imitation down to 0.3 with a sharper teacher.
    arms: [
      { key: 'a', why: 'imitate its wins + teacher + aux 1', args: ['--imitate-wins', '1', '--aux', '1'] },
      { key: 'b', why: 'teacher + aux 1 (defence first: no imitation)', args: ['--aux', '1'] },
      { key: 'c', why: 'imitate 0.3 + sharper teacher (danger-tau 50) + aux 1', args: ['--imitate-wins', '0.3', '--aux', '1', '--danger-tau', '50'] },
    ].map((x) => Object.assign(x, { args: ['--mode', 'oracle', '--lr', '1e-3', '--epochs', '6'].concat(x.args) })),
  },
};

function run(cmd, args, log) {
  log('$ ' + [cmd].concat(args).join(' '));
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.trim().split('\n').slice(-6).join('\n');
  if (tail) log(tail.replace(/^/gm, '    '));
  return { ok: r.status === 0, out };
}

async function main(a) {
  const name = a.lineage;
  const L = LINEAGES[name];
  if (!L) throw new Error('usage: frontier.js --lineage ' + Object.keys(LINEAGES).join('|') + ' [--rounds N]');
  const dir = path.join(ROOT, 'ml', 'frontier', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'ml', 'models'), { recursive: true });
  const STATE = path.join(dir, 'state.json');
  const LOG = path.join(dir, 'frontier.log');
  const log = (s) => { const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + s; console.log(line); fs.appendFileSync(LOG, line + '\n'); };
  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    const c = L.start();
    state = { lineage: name, round: 0, champion: c, champions: [c], rounds: [], data: [] };
    log(name + ' starts from ' + c.name + ' (' + c.model + ')');
  }
  const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  save();
  const workers = a.workers ? ['--workers', String(a.workers)] : [];
  const py = path.join(ROOT, 'ml', '.venv', 'bin', 'python');
  const rounds = parseInt(a.rounds || 1, 10);
  for (let k = 0; k < rounds; k++) {
    state.round++;
    const r = state.round, champ = state.champion;
    const rec = { round: r, champion: champ.name, started: new Date().toISOString(), arms: [] };
    state.rounds.push(rec);
    log('Round ' + r + ': champion ' + champ.name);

    // 1. Data (disk first: what's no longer needed goes, and the round must fit)
    const data = 'ml/data/' + L.prefix.toLowerCase() + '-' + r;
    const deals = String(a.deals || L.deals);
    D.pruneOrphans(log);
    D.pruneCache(log);
    D.makeRoom(state, D.roundBytes(state, +deals, +deals * 30e3), log);
    save();
    const g = run('node', ['scripts/ml/lucky.js', 'generate', '--weights', champ.model, '--oracle', '--returns', '--temperature', '1',
      '--deals', deals, '--seed', String(L.seed + r * 100000), '--out', data].concat(L.generate(state), workers), log);
    if (!g.ok) throw new Error('generate failed');
    state.data.push(data);
    // A round's data is deleted for good once it leaves the training window: it
    // is never read again (its seed and model are in this state, to play it again).
    while (state.data.length > (L.keep || 3)) {
      const old = state.data.shift();
      D.remove(path.join(ROOT, old), 'left the training window (the last ' + (L.keep || 3) + ' rounds are kept)', log);
    }
    save();

    // 2. Arms
    for (const arm of L.arms) {
      const model = L.prefix + r + arm.key;
      // A fresh network only while the champion is still random play: after
      // that, a network from scratch each round would throw away every
      // generation the lineage has earned.
      const fresh = arm.fresh && state.champions.length === 1;
      // Its args are arm a's; from the champion it would be arm a again.
      if (arm.fresh && !fresh) { log('  ' + model + ' skipped: a fresh network only while the champion plays at random'); continue; }
      const init = fresh ? ['--hidden', arm.fresh] : ['--init', champ.model];
      const t = run(py, ['ml/train_lucky.py', '--data'].concat(state.data, ['--name', model], init, arm.args), log);
      const auxLine = (t.out.match(/auxiliary heads, held out: .*/) || [''])[0];
      rec.arms.push({ model, why: arm.why, trained: t.ok, aux: auxLine });
      save();
    }

    // 3. Screen
    let best = null;
    for (const x of rec.arms.filter((y) => y.trained)) {
      const json = path.join('ml', 'frontier', name, x.model + '-screen.json');
      const c = run('node', ['scripts/ml/bench.js', 'compare', 'lc:ml/models/' + x.model + '.json', 'lc:' + champ.model,
        '--deals', String(a.screen || L.screen || 10000), '--json', json].concat(workers), log);
      if (!c.ok) continue;
      const gap = JSON.parse(fs.readFileSync(path.join(ROOT, json), 'utf8')).gap;
      x.screen = gap;
      x.screenFile = json;
      x.sigmas = gap.points / gap.standardError;
      log('  ' + x.model + ' (' + x.why + '): ' + (gap.points >= 0 ? '+' : '') + gap.points.toFixed(1) + ' ± ' + gap.standardError.toFixed(1) +
        ' points a hand over ' + champ.name + ' (' + x.sigmas.toFixed(2) + ' SE)');
      if (x.sigmas >= 1 && (!best || x.sigmas > best.sigmas)) best = x;
      save();
    }
    if (!best) { rec.result = 'no arm passed the screen'; log('Round ' + r + ': no arm passed the screen; ' + champ.name + ' stays champion'); save(); continue; }

    // 4. Judge
    if (a['no-judge']) { rec.result = best.model + ' screened best (no judge)'; log('Round ' + r + ': ' + best.model + ' screened best; --no-judge, so nothing is promoted'); save(); continue; }
    const j = run('node', ['scripts/ml/bench.js', 'judge', 'lc:ml/models/' + best.model + '.json', '--lineage', name,
      // The round's screen stands as the judgment's: a second 10,000-deal
      // screen rejected most real gains near 1 SE (LV1a: +7.6, then +4.3).
      '--vs', 'lc:' + champ.model, '--screened', best.screenFile, '--promote', best.model].concat(workers), log);
    rec.judged = best.model;
    if (j.ok) {
      state.champion = { name: best.model, model: 'ml/models/' + best.model + '.json' };
      state.champions.push(state.champion);
      rec.result = best.model + ' passed the bar: the next generation';
      log('Round ' + r + ': ' + best.model + ' passed all five stages and is the new champion');
    } else {
      rec.result = best.model + ' failed the bar';
      log('Round ' + r + ': ' + best.model + ' failed the bar; ' + champ.name + ' stays champion');
    }
    rec.finished = new Date().toISOString();
    save();
  }
}

if (require.main === module) main(parseArgs(process.argv.slice(2))).catch((err) => { console.error(err.stack || err.message); process.exit(1); });

module.exports = { LINEAGES };
