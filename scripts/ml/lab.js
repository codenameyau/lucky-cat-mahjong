#!/usr/bin/env node
/* The lab: Neural Cat's training framework. It replaced the league
   (scripts/ml/league.js), which plateaued after L7: each round there trained
   one model the same way, kept it on any score above 0 (a coin flip at
   +/-30 points a hand), and only ever played copies of itself.

   Each lab round:
     1. Plays 50,000 deals. Half the seats are the champion, exploring; the
        rest are earlier champions, s5, Jorge Yau, Lucky Cat (the LC20
        network) and Lucky Cat Classic, so it learns against several styles.
     2. Runs experiments ("arms"), chosen by what has worked so far:
        - training arms train a new model on the latest data: fine-tuning
          the champion at different learning rates and data windows, or
          training a wider or deeper network from scratch;
        - play arms keep the champion's network and change how it plays:
          how many of Jorge Yau's discards it chooses among (topK), a bonus
          for its chance to win (winBonus), and how much a claim must beat
          Jorge Yau's call by (claimMargin). These ride in the weights
          (meta.play), so a shipped model plays with its own settings.
        Every candidate inherits the champion's play settings.
     3. Judges each candidate against the champion head to head on the
        objective J = points a hand + 5 x hands won (in percentage points),
        so a point of win rate is worth 5 points a hand. A candidate first
        plays 6,000 deals; the best two that are ahead play 20,000 fresh
        deals, and one is kept only if J beats the champion there by more
        than its standard error (half the 95% margin, about +/-8 points a
        hand). Close calls are rejected, so the champion can't drift on
        noise the way the league's did.
     4. Learns from the results: each arm keeps its tries, its average J and
        how often it was kept, and the next round picks arms by an upper
        confidence bound (the best average, plus a bonus for arms tried
        less). Play arms are relative to the champion ("topK+1"), so after
        a change is kept, the next round explores around the new setting.
        A failed arm is tried less; an arm that keeps failing is rarely
        tried, but never ruled out.
     5. Ships a new champion right away (scripts/ml/ship.js names it NC2,
        NC3, ...), pushes its weights to the Hugging Face model repo, and
        moves training data no model uses to the Trash.

   State is in ml/lab/state.json (resumable), the log in ml/lab/lab.log.

   npm run ml:lab -- --rounds 10
   npm run ml:lab -- report
   npm run ml:lab -- bench --model ml/models/L17.json --against s5,L7 --deals 20000

   Options:
     --rounds N          rounds to run (default 10)
     --deals N           deals generated per round (default 50000)
     --train N           training arms per round (default 3)
     --play N            play arms per round (default 2)
     --start FILE        the first champion (default: the league's best)
     --no-upload         don't push new champions to Hugging Face
     --dir DIR           state and log (default ml/lab)
   For a quick check of the lab itself:
     --dry               no shipping, uploading or pruning
     --quick-deals N, --full-deals N   smaller evaluations (6000, 20000)
     --prefix NAME       the round's data set is ml/data/<NAME>-<round> (default lab) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ship } = require('./ship.js');
const { prune } = require('./prune-data.js');
const { PYTHON } = require('./python.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA_SEED = 60000000;   // round r's deals: DATA_SEED + r * 1,000,000
const QUICK_SEED = 70000000;  // round r's first evaluation: QUICK_SEED + r * 10,000
const FULL_SEED = 80000000;   // round r's long evaluation: FULL_SEED + r * 100,000
let QUICK_DEALS = 6000;
let FULL_DEALS = 20000;
let PREFIX = 'lab';
const WIN_WEIGHT = 5;         // points a hand per percentage point of hands won
const WINDOW = 8;             // data sets a fine-tune trains on

let DIR = path.join(ROOT, 'ml', 'lab');

// The experiments. Training arms make a new network; play arms change the
// champion's play settings, relative to its own.
const TRAIN_ARMS = {
  finetune: { init: true, lr: 3e-4, epochs: 8, window: WINDOW, about: 'fine-tune the champion' },
  'finetune-slow': { init: true, lr: 1e-4, epochs: 10, window: WINDOW, about: 'fine-tune at a third of the learning rate' },
  'finetune-fast': { init: true, lr: 1e-3, epochs: 6, window: WINDOW, about: 'fine-tune at 3x the learning rate' },
  recent: { init: true, lr: 3e-4, epochs: 8, window: 3, about: 'fine-tune on the last 3 rounds only' },
  wide: { hidden: '512,256', lr: 1e-3, epochs: 14, window: 12, about: 'a wider network (512, 256), from scratch' },
  deep: { hidden: '512,256,128', lr: 1e-3, epochs: 14, window: 12, about: 'a deeper network (512, 256, 128), from scratch' },
};
const PLAY_DEFAULTS = { topK: 3, winBonus: 0, claimMargin: 0 };
const PLAY_ARMS = {
  'topK+1': { key: 'topK', step: 1, min: 1, max: 10 },
  'topK+2': { key: 'topK', step: 2, min: 1, max: 10 },
  'topK-1': { key: 'topK', step: -1, min: 1, max: 10 },
  'winBonus+50': { key: 'winBonus', step: 50, min: 0, max: 2000 },
  'winBonus+150': { key: 'winBonus', step: 150, min: 0, max: 2000 },
  'winBonus-50': { key: 'winBonus', step: -50, min: 0, max: 2000 },
  'claimMargin+25': { key: 'claimMargin', step: 25, min: -200, max: 200 },
  'claimMargin-25': { key: 'claimMargin', step: -25, min: -200, max: 200 },
};

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

function log(line) {
  const text = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + line;
  console.log(text);
  fs.appendFileSync(path.join(DIR, 'lab.log'), text + '\n');
}

function run(cmd, args) {
  fs.appendFileSync(path.join(DIR, 'lab.log'), '$ ' + cmd + ' ' + args.join(' ') + '\n');
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = (res.stdout || '') + (res.stderr || '');
  fs.appendFileSync(path.join(DIR, 'lab.log'), out.split('\n').slice(-12).join('\n') + '\n');
  if (res.status !== 0) throw new Error(cmd + ' failed:\n' + out.slice(-2000));
  return out;
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const writeJson = (file, v) => fs.writeFileSync(path.resolve(ROOT, file), JSON.stringify(v));
const base = (file) => path.basename(file, '.json');
const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);
const pct = (p) => (100 * (p || 0)).toFixed(1) + '%';

function playOf(file) {
  const m = readJson(file).meta || {};
  return Object.assign({}, PLAY_DEFAULTS, m.play || {});
}

// a against b, two seats each, every seat rotation, on the same deals.
function headToHead(a, b, deals, seed, name) {
  const json = path.join(DIR, 'eval', name + '.json');
  fs.mkdirSync(path.dirname(json), { recursive: true });
  const A = 'ml:' + a, B = 'ml:' + b;
  run('node', ['scripts/competition.js', '--lineup', [A, B, A, B].join(','), '--deals', String(deals), '--seed', String(seed), '--json', json]);
  const s = JSON.parse(fs.readFileSync(json, 'utf8')).summary;
  const points = s[A].pointsPerHand - s[B].pointsPerHand;
  const wins = s[A].winRate - s[B].winRate;
  return {
    deals, points, wins,
    J: points + WIN_WEIGHT * 100 * wins,
    margin: 2 * (s[A].pointsMargin || 0), // 95% margin of the points
    winRate: s[A].winRate, otherWinRate: s[B].winRate,
    dealInRate: s[A].dealInRate, otherDealInRate: s[B].dealInRate,
    avgWin: s[A].avgWinPoints, otherAvgWin: s[B].avgWinPoints,
  };
}

function fmt(e) {
  return 'J ' + signed(e.J) + ' (points ' + signed(e.points) + ' ± ' + e.margin.toFixed(1) + ', wins ' + pct(e.winRate) + ' vs ' + pct(e.otherWinRate) +
    ', deal-ins ' + pct(e.dealInRate) + ' vs ' + pct(e.otherDealInRate) + ', average win ' + Math.round(e.avgWin) + ' vs ' + Math.round(e.otherAvgWin) + ', ' + e.deals + ' deals)';
}

// Training data in order: the league's rounds, then the lab's.
function dataSets() {
  const dir = path.join(ROOT, 'ml', 'data');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const num = (n, p) => parseInt(n.slice(p.length), 10);
  const league = names.filter((n) => /^league-\d+$/.test(n) && fs.existsSync(path.join(dir, n, 'manifest.json'))).sort((a, b) => num(a, 'league-') - num(b, 'league-'));
  const mine = new RegExp('^' + PREFIX + '-\\d+$');
  const lab = names.filter((n) => mine.test(n) && fs.existsSync(path.join(dir, n, 'manifest.json'))).sort((a, b) => num(a, PREFIX + '-') - num(b, PREFIX + '-'));
  return league.concat(lab).map((n) => path.join('ml', 'data', n));
}

// Upper confidence bound on an arm's average J; untried arms first.
function pickArms(state, names, count, valid) {
  const total = names.reduce((s, n) => s + ((state.arms[n] || {}).tries || 0), 0) + 1;
  const score = (n) => {
    const a = state.arms[n];
    if (!a || !a.tries) return Infinity;
    return a.sumJ / a.tries + 25 * Math.sqrt(2 * Math.log(total) / a.tries);
  };
  return names.filter(valid).map((n) => ({ n, s: score(n), r: Math.random() }))
    .sort((a, b) => b.s - a.s || a.r - b.r).slice(0, count).map((x) => x.n);
}

function playArmValue(play, arm) {
  const spec = PLAY_ARMS[arm];
  const v = play[spec.key] + spec.step;
  return v < spec.min || v > spec.max ? null : v;
}

function train(state, r, letter, arm, data) {
  const spec = TRAIN_ARMS[arm];
  const name = 'N' + r + letter;
  const champ = state.champion;
  const champHidden = (readJson(champ).layers || []).slice(0, -1).map((l) => l.rows).join(',');
  const hidden = spec.hidden || champHidden;
  const sets = data.slice(-spec.window);
  const args = ['ml/train.py', '--data'].concat(sets, ['--name', name, '--hidden', hidden, '--lr', String(spec.lr),
    '--epochs', String(spec.epochs), '--patience', '3', '--dropout', '0.2', '--weight-decay', '1e-3']);
  if (spec.init && hidden === champHidden) args.push('--init', champ);
  run(PYTHON, args);
  const file = path.join('ml', 'models', name + '.json');
  const w = readJson(file);
  w.meta = Object.assign(w.meta || {}, { play: playOf(champ), arm, from: base(champ) });
  writeJson(file, w);
  return { name, file, arm, about: spec.about + ' (' + hidden + ', ' + sets.length + ' data sets)' };
}

function tune(state, r, letter, arm) {
  const name = 'N' + r + letter;
  const champ = state.champion;
  const w = readJson(champ);
  const play = playOf(champ);
  const spec = PLAY_ARMS[arm];
  const was = play[spec.key];
  play[spec.key] = playArmValue(play, arm);
  w.meta = Object.assign({}, w.meta, { name, play, arm, from: base(champ) });
  delete w.meta.trainedName;
  const file = path.join('ml', 'models', name + '.json');
  writeJson(file, w);
  return { name, file, arm, about: spec.key + ' ' + was + ' → ' + play[spec.key] + ' (same network)' };
}

function record(state, arm, J, kept) {
  const a = state.arms[arm] || (state.arms[arm] = { tries: 0, kept: 0, sumJ: 0, results: [] });
  a.tries++;
  a.sumJ += J;
  if (kept) a.kept++;
  a.results.push(Math.round(J * 10) / 10);
}

function upload(file) {
  const dir = path.join(ROOT, 'ml', 'hf', 'lucky-cat-mahjong');
  if (!fs.existsSync(path.join(dir, '.git'))) return log('No Hugging Face clone in ml/hf/lucky-cat-mahjong: not uploaded.');
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=20 -o BatchMode=yes' }) });
  git(['pull', '-q', '--ff-only']);
  const name = base(file);
  fs.mkdirSync(path.join(dir, 'neural-cat', 'models'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, file), path.join(dir, 'neural-cat', 'models', name + '.json'));
  fs.copyFileSync(path.join(ROOT, file), path.join(dir, 'neural-cat', 'neural-cat.json'));
  git(['add', '-A']);
  const release = require(path.join(ROOT, 'js', 'mahjong-ml-weights.js')).meta.name;
  git(['commit', '-q', '-m', 'Ship ' + name + ' as ' + release + ' (the lab)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
  const res = git(['push', '-q', 'origin', 'HEAD']);
  log(res.status === 0 ? 'Pushed ' + name + ' to https://huggingface.co/codenameyau/lucky-cat-mahjong' : 'Upload failed: ' + (res.stderr || '').slice(-300));
}

function round(state, opts) {
  const r = state.rounds.length + 1;
  const champ = state.champion;
  const data = path.join('ml', 'data', PREFIX + '-' + r);
  // 1. Play: the champion exploring, against earlier champions and other styles.
  const others = state.members.filter((m) => m !== champ).slice(-3).map((m) => 'ml:' + m);
  if (others.indexOf('ml:ml/models/s5.json') === -1 && fs.existsSync(path.join(ROOT, 'ml', 'models', 's5.json'))) others.push('ml:ml/models/s5.json');
  const opponents = others.concat(['jorge-yau', 'lucky-cat', 'lucky-cat-classic']);
  const pool = opponents.map(() => 'neural-cat').concat(opponents);
  log('Round ' + r + ': ' + opts.deals + ' deals, champion ' + base(champ) + ' (' + JSON.stringify(playOf(champ)) + ') exploring against ' + opponents.map((o) => o.replace('ml:ml/models/', '').replace('.json', '')).join(', '));
  if (!fs.existsSync(path.join(ROOT, data, 'manifest.json'))) {
    run('node', ['scripts/ml/generate.js', '--deals', String(opts.deals), '--lineup', 'mix', '--pool', pool.join(','),
      '--weights', champ, '--temperature', '150', '--epsilon', '0.05', '--explore', '0',
      '--sample', '0.12', '--seed', String(DATA_SEED + r * 1000000), '--out', data]);
  }
  state.deals += opts.deals;
  const sets = dataSets();

  // 2. Experiments, chosen by what has worked.
  const letters = 'abcdefghij';
  const play = playOf(champ);
  const trainArms = pickArms(state, Object.keys(TRAIN_ARMS), opts.train, () => true);
  const playArms = pickArms(state, Object.keys(PLAY_ARMS), opts.play, (n) => playArmValue(play, n) !== null);
  const candidates = [];
  trainArms.forEach((arm) => {
    try { candidates.push(train(state, r, letters[candidates.length], arm, sets)); } catch (err) {
      log('Round ' + r + ': ' + arm + ' failed to train: ' + err.message.split('\n')[0]);
      record(state, arm, -50, false);
    }
  });
  playArms.forEach((arm) => candidates.push(tune(state, r, letters[candidates.length], arm)));

  // 3. Judge: 6,000 deals each, then 20,000 fresh deals for the best two ahead.
  candidates.forEach((c) => {
    c.quick = headToHead(c.file, champ, QUICK_DEALS, QUICK_SEED + r * 10000, c.name + '-quick');
    log('Round ' + r + ': ' + c.name + ' [' + c.arm + ': ' + c.about + '] ' + fmt(c.quick));
  });
  const ahead = candidates.filter((c) => c.quick.J > 0).sort((a, b) => b.quick.J - a.quick.J).slice(0, 2);
  ahead.forEach((c) => {
    c.full = headToHead(c.file, champ, FULL_DEALS, FULL_SEED + r * 100000, c.name + '-full');
    c.kept = c.full.J > c.full.margin / 2;
    log('Round ' + r + ': ' + c.name + ' on ' + FULL_DEALS + ' fresh deals: ' + fmt(c.full) + (c.kept ? ', beyond its standard error' : ', within the noise: rejected'));
  });

  // 4. Learn: every result goes to its arm.
  const best = candidates.filter((c) => c.kept).sort((a, b) => b.full.J - a.full.J)[0] || null;
  candidates.forEach((c) => record(state, c.arm, c.full ? c.full.J : c.quick.J, c === best));

  // 5. Ship a new champion.
  const result = { round: r, data, champion: base(champ), candidates: candidates.map((c) => ({
    name: c.name, arm: c.arm, about: c.about, quick: c.quick, full: c.full || null, kept: c === best,
  })) };
  if (best) {
    state.champion = best.file;
    state.members.push(best.file);
    if (opts.dry) { log('Round ' + r + ': ' + best.name + ' would be the new champion (dry run: not shipped)'); state.rounds.push(result); return result; }
    ship(path.join(ROOT, best.file));
    const release = require(path.join(ROOT, 'js', 'mahjong-ml-weights.js')).meta.name;
    result.shipped = release;
    log('Round ' + r + ': ' + best.name + ' is the new champion (' + best.arm + ', J ' + signed(best.full.J) + '), shipped as ' + release);
    if (!opts.noUpload) upload(best.file);
  } else {
    log('Round ' + r + ': no candidate beat ' + base(champ) + ' beyond its standard error; it stays champion');
  }
  state.rounds.push(result);

  if (opts.dry) return result;
  // Data in use: what the champion trained on, and the last rounds a fine-tune or a new network would use.
  const champMeta = readJson(state.champion).meta || {};
  const keep = new Set(((champMeta.data) || []).map((d) => path.basename(d)).concat(dataSets().slice(-12).map((d) => path.basename(d))));
  const gone = prune({ apply: true, keep });
  if (gone.moved) log('Moved to the Trash: ' + gone.names.join(', '));
  return result;
}

function report(state) {
  console.log('Champion: ' + base(state.champion) + ' ' + JSON.stringify(playOf(state.champion)) + ', after ' + state.rounds.length + ' rounds (' + state.deals.toLocaleString('en-US') + ' deals)\n');
  console.log('Arm               Tries  Kept  Average J  Results');
  Object.keys(TRAIN_ARMS).concat(Object.keys(PLAY_ARMS)).forEach((n) => {
    const a = state.arms[n];
    console.log(n.padEnd(18) + String(a ? a.tries : 0).padStart(5) + String(a ? a.kept : 0).padStart(6) + (a && a.tries ? signed(a.sumJ / a.tries) : '').padStart(11) + '  ' + (a ? a.results.join(', ') : ''));
  });
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.dir) DIR = path.resolve(String(a.dir));
  fs.mkdirSync(DIR, { recursive: true });
  const STATE = path.join(DIR, 'state.json');
  const cmd = a._[0] || 'run';

  if (cmd === 'bench') {
    const model = String(a.model);
    const deals = parseInt(a.deals || FULL_DEALS, 10);
    String(a.against).split(',').forEach((o) => {
      const other = /\.json$/.test(o) ? o : path.join('ml', 'models', o + '.json');
      const e = headToHead(model, other, deals, parseInt(a.seed || 50000000, 10), 'bench-' + base(model) + '-vs-' + base(other));
      log('Bench ' + base(model) + ' vs ' + base(other) + ': ' + fmt(e));
    });
    return;
  }

  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    const league = fs.existsSync(path.join(ROOT, 'ml', 'league', 'state.json')) ? readJson('ml/league/state.json') : null;
    const start = a.start ? path.relative(ROOT, path.resolve(String(a.start))) : league ? league.best : null;
    if (!start) throw new Error('first run needs --start ml/models/<name>.json');
    const members = league ? league.members.filter((m) => m !== start) : [];
    state = { champion: start, members: members.concat([start]), arms: {}, rounds: [], deals: 0 };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
    log('The lab starts from ' + start);
  }
  if (cmd === 'report') return report(state);

  const opts = {
    deals: parseInt(a.deals || 50000, 10),
    train: parseInt(a.train || 3, 10),
    play: parseInt(a.play || 2, 10),
    noUpload: !!a['no-upload'],
    dry: !!a.dry,
  };
  if (a['quick-deals']) QUICK_DEALS = parseInt(a['quick-deals'], 10);
  if (a['full-deals']) FULL_DEALS = parseInt(a['full-deals'], 10);
  if (a.prefix) PREFIX = String(a.prefix);
  const rounds = parseInt(a.rounds || 10, 10);
  for (let k = 0; k < rounds; k++) {
    round(state, opts);
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }
  log('Done: ' + state.rounds.length + ' rounds. Champion: ' + base(state.champion));
  report(state);
}

try { main(); } catch (err) { log('FAILED: ' + (err.stack || err.message)); process.exit(1); }
