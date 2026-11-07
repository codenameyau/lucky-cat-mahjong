#!/usr/bin/env node
/* The lab: the training framework for every learned strategy. It replaced
   Neural Cat's league (scripts/ml/league.js), which plateaued after L7: each
   round there trained one model the same way, kept it on any score above 0
   (a coin flip at +/-30 points a hand), and only ever played copies of
   itself. The same lab now trains three strategies (--strategy):

     neural-cat    (default) Neural Cat, from the league's best (NC1)
     only-orphans  the learned Only Orphans, from the model in the game
     lucky-cat     Lucky Cat's network, from the model in the game (LC20)

   Each lab round:
     1. Plays 50,000 deals. Half the seats are the champion, exploring; the
        rest are earlier champions and other styles, so it learns against
        several. Neural Cat: s5, Jorge Yau, Lucky Cat (the LC20 network) and
        Lucky Cat Classic. Only Orphans: Neural Cat, Jorge Yau and Lucky Cat,
        the strategies the game seats beside it. Lucky Cat: Neural Cat and
        Jorge Yau.
     2. Runs experiments ("arms"), chosen by what has worked so far:
        - training arms train a new model on the latest data: fine-tuning
          the champion at different learning rates and data windows, or
          training a wider or deeper network from scratch;
        - play arms keep the champion's network and change how it plays:
          how many of Jorge Yau's discards it chooses among (topK, Neural
          Cat only), a bonus for its chance to win (winBonus), and how much
          a claim must beat the base strategy's call by (claimMargin). These
          ride in the weights (meta.play), so a shipped model plays with its
          own settings. Lucky Cat plays its biggest share, so it has none.
        Every candidate inherits the champion's play settings.
     3. Judges each candidate against the champion. Neural Cat: head to head
        (two seats each), on J = points a hand + 5 x hands won (percentage
        points). Only Orphans: each takes one seat against Neural Cat, Jorge
        Yau and Lucky Cat on the same deals, on the same J; the rule-based
        Only Orphans plays those deals too, as the baseline. Lucky Cat: head
        to head, points first: J = points a hand + 0.5 x hands won
        (percentage points), and it is kept only if its points a hand beat
        the champion's by more than their standard error. A
        candidate first plays 6,000 deals; the best two that are ahead play
        20,000 fresh deals (Only Orphans: 40,000), and one is kept only if J
        beats the champion there by more than its standard error (half the
        95% margin). Close calls are rejected, so the champion can't drift
        on noise. Only Orphans' margins are paired: read from the difference
        on each deal, since both played the same deals.
     4. Learns from the results: each arm keeps its tries, its average J and
        how often it was kept, and the next round picks arms by an upper
        confidence bound (the best average, plus a bonus for arms tried
        less). Play arms are relative to the champion ("topK+1"), so after
        a change is kept, the next round explores around the new setting.
        A failed arm is tried less; an arm that keeps failing is rarely
        tried, but never ruled out.
     5. Ships a new champion right away (scripts/ml/ship.js; Neural Cat's are
        named NC2, NC3, ...), pushes its weights to the Hugging Face model
        repo, and moves Neural Cat training data no model uses to the Trash.

   On a plateau the lab searches harder. After --bold-after (3) rounds with
   no new champion: bold arms join (Neural Cat and Only Orphans: a wider
   768, 384 network, topK+3, winBonus+300; Lucky Cat: a slow fine-tune on
   14 rounds), the champion explores more in the round's deals, and a
   candidate that is ahead but within the noise on 20,000 deals plays
   30,000 more and is judged on all of them. After --stop-after (6) rounds
   with no new champion the lab stops and logs a summary, rather than
   spending the night on the same search.

   State is in ml/lab/state.json (Neural Cat), ml/lab-only-orphans/ or
   ml/lab-lucky-cat/ (resumable), the log in lab.log beside it.

   npm run ml:lab -- --rounds 10
   npm run ml:lab -- --strategy only-orphans --rounds 10
   npm run ml:lab -- --strategy lucky-cat --rounds 10
   npm run ml:lab -- report
   npm run ml:lab -- bench --model ml/models/L17.json --against s5,L7 --deals 20000

   Options:
     --strategy ID       neural-cat (default), only-orphans or lucky-cat
     --rounds N          rounds to run (default 10)
     --deals N           deals generated per round (default 50000)
     --train N           training arms per round (default 3)
     --play N            play arms per round (default 2)
     --bold-after N      rounds without a new champion before bold mode (default 3)
     --stop-after N      rounds without a new champion before the lab stops (default 6)
     --start FILE        the first champion (default: the league's best, or
                         the model in the game)
     --no-upload         don't push new champions to Hugging Face
     --dir DIR           state and log (default ml/lab, ml/lab-<strategy>)
     --workers N         Lucky Cat: processes for its games (default: CPU
                         cores - 1)
     --temperature T     Lucky Cat: the champion explores with its shares
                         sharpened to this temperature (default 0.5)
   For a quick check of the lab itself:
     --dry               no shipping, uploading or pruning
     --quick-deals N, --full-deals N, --extra-deals N   smaller evaluations
                         (6000, 20000, 30000; Only Orphans' full evaluation: 40000)
     --prefix NAME       the round's data set is ml/data/<NAME>-<round>
                         (default lab, oolab or lcpts) */

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
const WIN_WEIGHT = 5;         // points a hand per percentage point of hands won
// Lucky Cat plays for points first: a percentage point of hands won is worth
// half a point a hand, about the size of a tie-breaker (a 20,000-deal
// evaluation's standard error is about 5 points a hand).
const LC_WIN_WEIGHT = 0.5;
let WORKERS = null;           // Lucky Cat's processes (--workers)
let LC_TEMPERATURE = 0.5;     // Lucky Cat's exploring temperature (--temperature)
const WINDOW = 8;             // data sets a fine-tune trains on

let DIR = path.join(ROOT, 'ml', 'lab');

// Neural Cat's experiments, and Only Orphans' (the same network and trainer).
// Training arms make a new network; play arms change the champion's play
// settings, relative to its own.
const TRAIN_ARMS = {
  finetune: { init: true, lr: 3e-4, epochs: 8, window: WINDOW, about: 'fine-tune the champion' },
  'finetune-slow': { init: true, lr: 1e-4, epochs: 10, window: WINDOW, about: 'fine-tune at a third of the learning rate' },
  'finetune-fast': { init: true, lr: 1e-3, epochs: 6, window: WINDOW, about: 'fine-tune at 3x the learning rate' },
  recent: { init: true, lr: 3e-4, epochs: 8, window: 3, about: 'fine-tune on the last 3 rounds only' },
  wide: { hidden: '512,256', lr: 1e-3, epochs: 14, window: 12, about: 'a wider network (512, 256), from scratch' },
  deep: { hidden: '512,256,128', lr: 1e-3, epochs: 14, window: 12, about: 'a deeper network (512, 256, 128), from scratch' },
  // Bold arms join only after a plateau (see stale()).
  wider: { hidden: '768,384', lr: 1e-3, epochs: 16, window: 14, bold: true, about: 'a much wider network (768, 384), from scratch' },
};
// Only Orphans' training arms: Neural Cat's, and a fine-tune that also leans
// toward winning (winBonus +300 on top of the champion's). In lab rounds 3 to
// 6 all 12 trained candidates won fewer hands than the champion, with bigger
// average wins, and lost (J -5.8 on average), even trained on the champion's
// own games only: training pulls it back to fewer, bigger hands.
const OO_TRAIN_ARMS = Object.assign({}, TRAIN_ARMS, {
  'finetune-wins': { init: true, lr: 3e-4, epochs: 8, window: WINDOW, play: { winBonus: 300 }, about: 'fine-tune the champion, then winBonus +300' },
});
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
  'topK+3': { key: 'topK', step: 3, min: 1, max: 12, bold: true },
  'winBonus+300': { key: 'winBonus', step: 300, min: 0, max: 3000, bold: true },
};
// Only Orphans picks among every allowed discard (topK 0, fixed by the
// strategy), so it has no topK arms. Nor claimMargin-25: the model's claim is
// taken only when it's worth more than the base strategy's pass, so a margin
// below 0 never changes a choice (it played exactly like the champion in all
// three lab rounds it was tried). claimMargin+50 goes further the way
// claimMargin+25 went: fewer calls, fewer deal-ins (rounds 2 to 6).
const OO_PLAY_ARMS = {};
Object.keys(PLAY_ARMS).filter((n) => PLAY_ARMS[n].key !== 'topK' && n !== 'claimMargin-25').forEach((n) => { OO_PLAY_ARMS[n] = PLAY_ARMS[n]; });
OO_PLAY_ARMS['claimMargin+50'] = { key: 'claimMargin', step: 50, min: -200, max: 200 };
// Lucky Cat's experiments, points first. LC20 learned by imitating its wins,
// the quicker the more, so it learned fast cheap wins. Here it learns from
// every hand it plays, won or lost, by the points the hand paid it
// (ml/train_lucky.py --mode pg or awr): a critic says what each position is
// worth on average, and a move that did better than that from there gets
// more likely, one that did worse (a deal-in, a cheap win that gave up a
// bigger one) less. The arms vary the update (a clipped policy gradient or
// advantage-weighted imitation), its size, the data window, how the points
// are scaled, and a small bonus for winning.
const LC_TRAIN_ARMS = {
  pg: { init: true, mode: 'pg', lr: 3e-4, epochs: 4, window: 1, about: 'policy gradient on the hand\'s points' },
  'pg-2': { init: true, mode: 'pg', lr: 3e-4, epochs: 4, window: 2, about: 'policy gradient, the last 2 rounds' },
  'pg-fast': { init: true, mode: 'pg', lr: 1e-3, epochs: 4, window: 1, klMax: 0.08, about: 'a bigger policy-gradient step' },
  'pg-sqrt': { init: true, mode: 'pg', lr: 3e-4, epochs: 4, window: 1, reward: 'sqrt', about: 'policy gradient on the square root of the points' },
  'pg-wins': { init: true, mode: 'pg', lr: 3e-4, epochs: 4, window: 1, winBonus: 100, about: 'policy gradient, 100 points more for a win' },
  awr: { init: true, mode: 'awr', lr: 3e-4, epochs: 3, window: 2, about: 'advantage-weighted imitation of every move' },
  // One hand's points are mostly luck, so a step needs many hands: these
  // use the last 4 rounds (the share each move was played with corrects for
  // older champions), or blunt the biggest hands so the common outcomes
  // (small wins, deal-ins) speak.
  'pg-all': { init: true, mode: 'pg', lr: 3e-4, epochs: 6, window: 4, about: 'policy gradient on the last 4 rounds' },
  'pg-clip': { init: true, mode: 'pg', lr: 3e-4, epochs: 4, window: 2, rewardClip: 1000, about: 'policy gradient, points clipped at ±1,000' },
  // Bold (after a plateau): a big step on the last 4 rounds.
  'pg-bold': { init: true, mode: 'pg', lr: 1e-3, epochs: 6, window: 4, klMax: 0.1, bold: true, about: 'a big policy-gradient step on the last 4 rounds' },
};

// The plateau: rounds since the champion last changed. After --bold-after
// of them the lab searches harder (bold arms, more exploration, longer
// judging of close calls); after --stop-after it stops.
let EXTRA_DEALS = 30000;
function stale(state) {
  let n = 0;
  for (let k = state.rounds.length - 1; k >= 0 && !state.rounds[k].shipped && !state.rounds[k].dryKept; k--) n++;
  return n;
}

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
const evalJson = (name) => {
  const json = path.join(DIR, 'eval', name + '.json');
  fs.mkdirSync(path.dirname(json), { recursive: true });
  return json;
};

/* ------------------------------------------------------------------ *
 * Evaluations
 * ------------------------------------------------------------------ */

// Neural Cat: a against b, two seats each, every seat rotation, on the same deals.
function headToHead(a, b, deals, seed, name) {
  const json = evalJson(name);
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

// Only Orphans: one seat against the three strategies the game seats beside
// it, every seat rotation. The champion's and the baseline's runs on a set
// of deals are reused for every candidate judged on them.
const OO_TABLE = ['neural-cat', 'jorge-yau', 'lucky-cat'];
const seatCache = {};
function seatOO(id, deals, seed, name) {
  const key = id + '@' + deals + '@' + seed;
  if (seatCache[key]) return seatCache[key];
  const json = evalJson(name);
  run('node', ['scripts/competition.js', '--lineup', [id].concat(OO_TABLE).join(','), '--deals', String(deals), '--seed', String(seed), '--json', json, '--per-deal']);
  const r = JSON.parse(fs.readFileSync(json, 'utf8'));
  const s = r.summary[id];
  const raw = (r.report && r.report.strategies && r.report.strategies[id]) || {};
  const p = raw.patterns || {};
  return (seatCache[key] = {
    pointsPerHand: s.pointsPerHand, margin: s.pointsMargin || 0, winRate: s.winRate, dealInRate: s.dealInRate,
    avgWin: s.avgWinPoints, limitWins: raw.limitWins || 0, thirteenOrphans: p['Thirteen Orphans'] || 0,
    perDeal: r.perDeal ? r.perDeal.points : null,
  });
}
// The 95% margin of A's points a hand less B's. Both played the same deals,
// so it's read from the difference on each deal (its 4 rotations, 4 hands):
// the luck of the deal they share cancels. About 15% narrower than treating
// the two runs as independent, which is the fallback without per-deal results.
function pairedMargin(A, B) {
  const a = A.perDeal, b = B.perDeal;
  if (!a || !b || a.length !== b.length || a.length < 2) return Math.sqrt(A.margin * A.margin + B.margin * B.margin);
  const n = a.length;
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; sum += d; sq += d * d; }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, (sq - n * mean * mean) / (n - 1)));
  return 1.96 * sd / Math.sqrt(n) / 4;
}
function compareOO(a, b, deals, seed, name, champName) {
  const A = seatOO('oo:' + a, deals, seed, name);
  const B = seatOO('oo:' + b, deals, seed, champName);
  const points = A.pointsPerHand - B.pointsPerHand;
  const wins = A.winRate - B.winRate;
  return {
    deals, points, wins,
    J: points + WIN_WEIGHT * 100 * wins,
    margin: pairedMargin(A, B),
    winRate: A.winRate, otherWinRate: B.winRate,
    dealInRate: A.dealInRate, otherDealInRate: B.dealInRate,
    avgWin: A.avgWin, otherAvgWin: B.avgWin,
    limitWins: A.limitWins, thirteenOrphans: A.thirteenOrphans,
  };
}

// Lucky Cat: a against b, two seats each, both seat orders, on the same
// deals (scripts/ml/lucky.js eval). Points first: J = points a hand +
// 0.5 x hands won (percentage points). The margin is the paired points gap's
// 95% margin (twice its standard error, deal by deal).
function compareLC(a, b, deals, seed, name) {
  const json = evalJson(name);
  const A = /^[a-z]+:/.test(a) || !/\.json$/.test(a) ? a : 'lc:' + a;
  const B = /^[a-z]+:/.test(b) || !/\.json$/.test(b) ? b : 'lc:' + b;
  const args = ['scripts/ml/lucky.js', 'eval', '--lineup', A + ',' + B, '--deals', String(deals), '--seed', String(seed), '--json', json];
  if (WORKERS) args.push('--workers', String(WORKERS));
  run('node', args);
  const r = JSON.parse(fs.readFileSync(json, 'utf8'));
  const s = r.summary;
  const wins = s[A].winRate - s[B].winRate;
  const points = r.paired ? r.paired.points : s[A].pointsPerHand - s[B].pointsPerHand;
  return {
    deals, wins, points,
    J: points + LC_WIN_WEIGHT * 100 * wins,
    margin: 2 * (r.paired ? r.paired.standardError : 0),
    winRate: s[A].winRate, otherWinRate: s[B].winRate,
    dealInRate: s[A].dealInRate, otherDealInRate: s[B].dealInRate,
    avgWin: s[A].avgWinPoints, otherAvgWin: s[B].avgWinPoints,
    avgWinFaan: s[A].avgWinFaan, otherAvgWinFaan: s[B].avgWinFaan,
    avgWinDiscards: s[A].avgWinDiscards, otherAvgWinDiscards: s[B].avgWinDiscards,
  };
}

/* ------------------------------------------------------------------ *
 * The strategies
 * ------------------------------------------------------------------ */

const STRATEGIES = {
  'neural-cat': {
    dir: 'lab', prefix: 'lab', model: 'N', trainArms: TRAIN_ARMS, playArms: PLAY_ARMS, folder: 'neural-cat',
    weights: 'mahjong-ml-weights.js',
    // Training data in order: the league's rounds, then the lab's.
    earlier: /^league-(\d+)$/, done: 'manifest.json',
    start() {
      const league = fs.existsSync(path.join(ROOT, 'ml', 'league', 'state.json')) ? readJson('ml/league/state.json') : null;
      return { start: league ? league.best : null, members: league ? league.members : [] };
    },
    generate(state, r, champ, data, opts) {
      const others = state.members.filter((m) => m !== champ).slice(-3).map((m) => 'ml:' + m);
      if (others.indexOf('ml:ml/models/s5.json') === -1 && fs.existsSync(path.join(ROOT, 'ml', 'models', 's5.json'))) others.push('ml:ml/models/s5.json');
      const opponents = others.concat(['jorge-yau', 'lucky-cat', 'lucky-cat-classic']);
      const pool = opponents.map(() => 'neural-cat').concat(opponents);
      log('Round ' + r + ': ' + opts.deals + ' deals, champion ' + base(champ) + ' (' + JSON.stringify(playOf(champ)) + ') exploring against ' + opponents.map(short).join(', '));
      run('node', ['scripts/ml/generate.js', '--deals', String(opts.deals), '--lineup', 'mix', '--pool', pool.join(','),
        '--weights', champ, '--temperature', opts.bold ? '300' : '150', '--epsilon', opts.bold ? '0.1' : '0.05', '--explore', '0',
        '--sample', '0.12', '--seed', String(DATA_SEED + r * 1000000), '--out', data]);
    },
    trainArgs: trainNetArgs,
    judge: (c, champ, deals, seed, tag) => headToHead(c, champ, deals, seed, base(c) + '-' + tag),
    ship(file) {
      ship(path.join(ROOT, file));
      // ship() reads the old weights through require() first, so drop that cached copy.
      const out = path.join(ROOT, 'js', 'mahjong-ml-weights.js');
      delete require.cache[require.resolve(out)];
      return require(out).meta.name;
    },
  },
  'only-orphans': {
    // From the expected-points targets (#178) on, new names (OT models, ootgt
    // data), so a fresh lab never overwrites the fixed-family rounds (OL<n>,
    // oolab-<n>, state moved to ml/lab-only-orphans-fixed-families/).
    dir: 'lab-only-orphans', prefix: 'ootgt', model: 'OT', trainArms: OO_TRAIN_ARMS, playArms: OO_PLAY_ARMS, folder: 'only-orphans',
    weights: 'mahjong-only-orphans-weights.js',
    // Its points swing more than the others' (a limit hand pays up to 24,576),
    // so its long evaluation plays twice the deals: a 95% margin of about
    // ±8 points a hand, paired, against ±15 on 20,000 deals unpaired.
    fullDeals: 40000,
    // Training data: only the lab's own rounds under the targets. The league's
    // (orphans-<n>) and the fixed-family lab's (oolab-<n>) positions were read
    // through the old fixed-family plans, so they no longer match how it plays.
    earlier: /^$/, done: 'manifest.json',
    start() {
      const shipped = shippedModel('mahjong-only-orphans-weights.js');
      const league = fs.existsSync(path.join(ROOT, 'ml', 'orphans', 'state.json')) ? readJson('ml/orphans/state.json') : null;
      return { start: shipped, members: league ? league.members || [] : [] };
    },
    generate(state, r, champ, data, opts) {
      const members = state.members.filter((m) => m !== champ).slice(-2).map((m) => 'oo:' + m);
      const pool = ['only-orphans', 'only-orphans', 'only-orphans'].concat(OO_TABLE, members);
      log('Round ' + r + ': ' + opts.deals + ' deals, champion ' + base(champ) + ' (' + JSON.stringify(playOf(champ)) + ') exploring against ' + OO_TABLE.concat(members.map(short)).join(', '));
      run('node', ['scripts/ml/generate.js', '--learner', 'only-orphans', '--deals', String(opts.deals), '--lineup', 'mix', '--pool', pool.join(','),
        '--weights', champ, '--temperature', opts.bold ? '300' : '150', '--epsilon', opts.bold ? '0.1' : '0.05', '--explore', '0', '--record', 'only-orphans',
        '--sample', '0.25', '--seed', String(DATA_SEED + r * 1000000), '--out', data]);
    },
    trainArgs: trainNetArgs,
    judge: (c, champ, deals, seed, tag) => compareOO(c, champ, deals, seed, base(c) + '-' + tag, base(champ) + '-' + tag + '-' + seed),
    // The rule-based Only Orphans on the same deals as the long evaluation.
    baseline: (deals, seed, tag) => seatOO('only-orphans-rules', deals, seed, 'baseline-' + tag + '-' + seed),
    ship(file) {
      ship(path.join(ROOT, file), 'only-orphans');
      return base(file);
    },
  },
  'lucky-cat': {
    dir: 'lab-lucky-cat', prefix: 'lcpts', model: 'LP', trainArms: LC_TRAIN_ARMS, playArms: {}, folder: 'lucky-cat',
    weights: 'mahjong-lucky-cat-weights.js',
    // Training data: only the lab's own rounds, which record every hand
    // (the league's lc<n> sets hold only the moves of hands won).
    earlier: /^$/, done: 'meta.json',
    // Points first: kept only when its points a hand beat the champion's by
    // more than their standard error (and J, with the wins, is ahead too).
    keep: (e) => e.points > e.margin / 2 && e.J > 0,
    // One hand's points are mostly luck: on 20,000 deals the standard error is
    // about 2.6 points a hand, so champions one standard error ahead of the
    // last (LP3c, LP5a, LP8b) drifted on noise and none clearly beat lc32.
    // 40,000 deals bring it to about 1.8. --full-deals still overrides it.
    fullDeals: 40000,
    start() {
      const shipped = shippedModel('mahjong-lucky-cat-weights.js');
      const league = fs.existsSync(path.join(ROOT, 'ml', 'lucky', 'state.json')) ? readJson('ml/lucky/state.json') : null;
      if (league) return { start: shipped, members: league.pool || [] };
      // No league here: the Lucky Cat models on disk (lc<n>.json), in order.
      const re = /^lc(\d+)\.json$/;
      const files = fs.readdirSync(path.join(ROOT, 'ml', 'models')).filter((n) => re.test(n))
        .sort((x, y) => parseInt(re.exec(x)[1], 10) - parseInt(re.exec(y)[1], 10));
      return { start: shipped, members: files.map((n) => path.join('ml', 'models', n)) };
    },
    generate(state, r, champ, data, opts) {
      // Its last two champions, and the point scorers the game seats beside it.
      const selves = state.members.filter((m) => m !== champ).slice(-2).map((m) => 'lc:' + m);
      const pool = selves.concat(['neural-cat', 'neural-cat', 'jorge-yau']);
      log('Round ' + r + ': ' + opts.deals + ' deals, champion ' + base(champ) + ' (temperature ' + LC_TEMPERATURE + ') learning against ' + pool.map(short).join(', '));
      const args = ['scripts/ml/lucky.js', 'generate', '--returns', '--sample', '0.5', '--weights', champ, '--deals', String(opts.deals), '--out', data,
        '--pool', pool.join(','), '--seed', String(DATA_SEED + r * 1000000), '--temperature', String(opts.bold ? Math.max(1, LC_TEMPERATURE) : LC_TEMPERATURE), '--learners', '2'];
      if (WORKERS) args.push('--workers', String(WORKERS));
      log('Round ' + r + ': ' + run('node', args).trim().split('\n').pop());
    },
    trainArgs(spec, sets, name, champ) {
      const args = ['ml/train_lucky.py', '--data'].concat(sets, ['--name', name, '--lr', String(spec.lr), '--epochs', String(spec.epochs),
        '--mode', spec.mode || 'imitate']);
      if (spec.smoothing != null) args.push('--smoothing', String(spec.smoothing));
      if (spec.reward) args.push('--reward', spec.reward);
      if (spec.winBonus != null) args.push('--win-bonus', String(spec.winBonus));
      if (spec.klMax != null) args.push('--kl-max', String(spec.klMax));
      if (spec.rewardClip != null) args.push('--reward-clip', String(spec.rewardClip));
      if (spec.negWeight) args.push('--neg-weight', String(spec.negWeight));
      if (spec.hidden) args.push('--hidden', spec.hidden);
      if (spec.init) args.push('--init', champ);
      return { args, about: '(' + sets.length + ' data set' + (sets.length > 1 ? 's' : '') + ')' };
    },
    judge: (c, champ, deals, seed, tag) => compareLC(c, champ, deals, seed, base(c) + '-' + tag),
    ship(file) {
      // Lucky Cat's releases go on from the last shipped, lc32: lc33, lc34, ... (scripts/ml/ship.js).
      ship(path.join(ROOT, file), 'lucky-cat');
      return shippedName('mahjong-lucky-cat-weights.js') || base(file); // lc21, lc22, ...
    },
  },
};
let S = STRATEGIES['neural-cat'];
let PREFIX = S.prefix;

const short = (id) => id.replace(/^(ml|oo|lc):ml[\\/]models[\\/]/, '').replace('.json', '');

// The name a shipped weights file shows in the game (its release name).
function shippedName(weightsFile) {
  const file = path.join(ROOT, 'js', weightsFile);
  try { delete require.cache[require.resolve(file)]; return require(file).meta.name || null; } catch (err) { return null; }
}

// The model file a shipped weights file came from (ml/models/<trained name>.json).
function shippedModel(weightsFile) {
  try {
    const w = require(path.join(ROOT, 'js', weightsFile));
    const name = (w.meta && (w.meta.trainedName || w.meta.name)) || null;
    const file = name && path.join('ml', 'models', name + '.json');
    return file && fs.existsSync(path.join(ROOT, file)) ? file : null;
  } catch (err) { return null; }
}

function playOf(file) {
  const m = readJson(file).meta || {};
  return Object.assign({}, PLAY_DEFAULTS, m.play || {});
}

// Neural Cat's and Only Orphans' trainer (ml/train.py).
function trainNetArgs(spec, sets, name, champ) {
  const champHidden = (readJson(champ).layers || []).slice(0, -1).map((l) => l.rows).join(',');
  const hidden = spec.hidden || champHidden;
  const args = ['ml/train.py', '--data'].concat(sets, ['--name', name, '--hidden', hidden, '--lr', String(spec.lr),
    '--epochs', String(spec.epochs), '--patience', '3', '--dropout', '0.2', '--weight-decay', '1e-3']);
  if (spec.init && hidden === champHidden) args.push('--init', champ);
  return { args, about: '(' + hidden + ', ' + sets.length + ' data sets)' };
}

function fmt(e) {
  if (S === STRATEGIES['lucky-cat']) {
    return 'J ' + signed(e.J) + ' (points ' + signed(e.points) + ' ± ' + (e.margin / 2).toFixed(1) + ' standard error, wins ' + pct(e.winRate) + ' vs ' + pct(e.otherWinRate) +
      ', deal-ins ' + pct(e.dealInRate) + ' vs ' + pct(e.otherDealInRate) + ', average win ' + Math.round(e.avgWin || 0) + ' vs ' + Math.round(e.otherAvgWin || 0) +
      ' (' + (e.avgWinFaan || 0).toFixed(2) + ' vs ' + (e.otherAvgWinFaan || 0).toFixed(2) + ' faan), ' + e.deals + ' deals)';
  }
  return 'J ' + signed(e.J) + ' (points ' + signed(e.points) + ' ± ' + e.margin.toFixed(1) + ', wins ' + pct(e.winRate) + ' vs ' + pct(e.otherWinRate) +
    ', deal-ins ' + pct(e.dealInRate) + ' vs ' + pct(e.otherDealInRate) + ', average win ' + Math.round(e.avgWin) + ' vs ' + Math.round(e.otherAvgWin) + ', ' + e.deals + ' deals)';
}

// Training data in order: the strategy's earlier rounds, then the lab's.
function dataSets() {
  const dir = path.join(ROOT, 'ml', 'data');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const done = (n) => fs.existsSync(path.join(dir, n, S.done));
  const mine = new RegExp('^' + PREFIX + '-(\\d+)$');
  const sorted = (re) => names.filter((n) => re.test(n) && done(n)).sort((a, b) => parseInt(re.exec(a)[1], 10) - parseInt(re.exec(b)[1], 10));
  return sorted(S.earlier).concat(sorted(mine)).map((n) => path.join('ml', 'data', n));
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
  const spec = S.playArms[arm];
  const v = play[spec.key] + spec.step;
  return v < spec.min || v > spec.max ? null : v;
}

function train(state, r, letter, arm, data) {
  const spec = S.trainArms[arm];
  const name = S.model + r + letter;
  const champ = state.champion;
  const sets = data.slice(-spec.window);
  const t = S.trainArgs(spec, sets, name, champ);
  run(PYTHON, t.args);
  const file = path.join('ml', 'models', name + '.json');
  const w = readJson(file);
  w.meta = Object.assign(w.meta || {}, { arm, from: base(champ) });
  if (S !== STRATEGIES['lucky-cat']) w.meta.play = playOf(champ);
  // An arm may also move play settings, relative to the champion's.
  if (spec.play) Object.keys(spec.play).forEach((k) => { w.meta.play[k] = (w.meta.play[k] || 0) + spec.play[k]; });
  writeJson(file, w);
  return { name, file, arm, about: spec.about + ' ' + t.about };
}

function tune(state, r, letter, arm) {
  const name = S.model + r + letter;
  const champ = state.champion;
  const w = readJson(champ);
  const play = playOf(champ);
  const spec = S.playArms[arm];
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

function upload(file, release) {
  const dir = path.join(ROOT, 'ml', 'hf', 'lucky-cat-mahjong');
  if (!fs.existsSync(path.join(dir, '.git'))) return log('No Hugging Face clone in ml/hf/lucky-cat-mahjong: not uploaded.');
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=20 -o BatchMode=yes' }) });
  git(['pull', '-q', '--ff-only']);
  const name = base(file);
  fs.mkdirSync(path.join(dir, S.folder, 'models'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, file), path.join(dir, S.folder, 'models', name + '.json'));
  fs.copyFileSync(path.join(ROOT, file), path.join(dir, S.folder, S.folder + '.json'));
  git(['add', '-A']);
  const what = release && release !== name ? name + ' as ' + release : name;
  git(['commit', '-q', '-m', 'Ship ' + what + ' (' + S.folder + ', the lab)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
  const res = git(['push', '-q', 'origin', 'HEAD']);
  log(res.status === 0 ? 'Pushed ' + name + ' to https://huggingface.co/codenameyau/lucky-cat-mahjong' : 'Upload failed: ' + (res.stderr || '').slice(-300));
}

function round(state, opts) {
  const r = state.rounds.length + 1;
  const champ = state.champion;
  const quiet = stale(state);
  const bold = opts.bold = quiet >= opts.boldAfter;
  if (bold) log('Round ' + r + ': bold mode after ' + quiet + ' round' + (quiet === 1 ? '' : 's') + ' without a new champion: bold arms, more exploration, and ' + EXTRA_DEALS + ' more deals for close calls');
  const data = path.join('ml', 'data', PREFIX + '-' + r);
  // 1. Play: the champion exploring, against earlier champions and other styles.
  if (!fs.existsSync(path.join(ROOT, data, S.done))) S.generate(state, r, champ, data, opts);
  else log('Round ' + r + ': ' + data + ' was already played');
  state.deals += opts.deals;
  const sets = dataSets();

  // 2. Experiments, chosen by what has worked.
  const letters = 'abcdefghij';
  const play = playOf(champ);
  const trainArms = pickArms(state, Object.keys(S.trainArms), opts.train, (n) => bold || !S.trainArms[n].bold);
  const playArms = pickArms(state, Object.keys(S.playArms), opts.play, (n) => (bold || !S.playArms[n].bold) && playArmValue(play, n) !== null);
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
    c.quick = S.judge(c.file, champ, QUICK_DEALS, QUICK_SEED + r * 10000, 'quick');
    log('Round ' + r + ': ' + c.name + ' [' + c.arm + ': ' + c.about + '] ' + fmt(c.quick));
  });
  let champVsBaseline = null;
  if (S.baseline) {
    // Only Orphans: every round, the champion against the rule-based bot on the first evaluation's deals.
    const b = S.baseline(QUICK_DEALS, QUICK_SEED + r * 10000, 'quick');
    const mine = seatOO('oo:' + champ, QUICK_DEALS, QUICK_SEED + r * 10000, base(champ) + '-quick-' + (QUICK_SEED + r * 10000));
    champVsBaseline = { points: mine.pointsPerHand - b.pointsPerHand, margin: pairedMargin(mine, b),
      pointsPerHand: mine.pointsPerHand, baselinePointsPerHand: b.pointsPerHand, winRate: mine.winRate, baselineWinRate: b.winRate,
      dealInRate: mine.dealInRate, baselineDealInRate: b.dealInRate, deals: QUICK_DEALS };
    log('Round ' + r + ': champion ' + base(champ) + ' against the rule-based bot ' + signed(champVsBaseline.points) + ' ± ' + champVsBaseline.margin.toFixed(1) +
      ' points a hand (' + mine.pointsPerHand.toFixed(1) + ' against ' + b.pointsPerHand.toFixed(1) + ', wins ' + pct(mine.winRate) + ' vs ' + pct(b.winRate) + ')');
  }
  const ahead = candidates.filter((c) => c.quick.J > 0).sort((a, b) => b.quick.J - a.quick.J).slice(0, 2);
  ahead.forEach((c) => {
    c.full = S.judge(c.file, champ, FULL_DEALS, FULL_SEED + r * 100000, 'full');
    c.kept = S.keep ? S.keep(c.full) : c.full.J > c.full.margin / 2;
    const close = !c.kept && c.full.J > 0 && bold;
    log('Round ' + r + ': ' + c.name + ' on ' + FULL_DEALS + ' fresh deals: ' + fmt(c.full) + (c.kept ? ', beyond its standard error' : close ? ', ahead but within the noise' : ', within the noise: rejected'));
    if (close) {
      // Bold mode: a close call plays 30,000 more deals and is judged on
      // all of them, each run weighted by its precision.
      const more = S.judge(c.file, champ, EXTRA_DEALS, FULL_SEED + r * 100000 + 50000, 'more');
      const w1 = 1 / Math.pow(c.full.margin / 2, 2), w2 = 1 / Math.pow(more.margin / 2, 2);
      const J = (c.full.J * w1 + more.J * w2) / (w1 + w2);
      const se = 1 / Math.sqrt(w1 + w2);
      c.full = Object.assign({}, more, { J, points: (c.full.points * w1 + more.points * w2) / (w1 + w2), margin: 2 * se, deals: FULL_DEALS + EXTRA_DEALS });
      c.kept = S.keep ? S.keep(c.full) : J > se;
      log('Round ' + r + ': ' + c.name + ' on ' + (FULL_DEALS + EXTRA_DEALS) + ' deals in all: J ' + signed(J) + ' \u00b1 ' + (2 * se).toFixed(1) +
        (c.kept ? ', beyond its standard error' : ', still within the noise: rejected'));
    }
  });

  // 4. Learn: every result goes to its arm.
  const best = candidates.filter((c) => c.kept).sort((a, b) => b.full.J - a.full.J)[0] || null;
  candidates.forEach((c) => record(state, c.arm, c.full ? c.full.J : c.quick.J, c === best));

  // 5. Ship a new champion.
  const result = { round: r, data, champion: base(champ), bold, champVsBaseline, candidates: candidates.map((c) => ({
    name: c.name, arm: c.arm, about: c.about, quick: c.quick, full: c.full || null, kept: c === best,
  })) };
  if (best && S.baseline) {
    // Only Orphans: the new champion against the rule-based bot, on the same deals.
    const b = S.baseline(FULL_DEALS, FULL_SEED + r * 100000, 'full');
    const mine = seatOO('oo:' + best.file, FULL_DEALS, FULL_SEED + r * 100000, best.name + '-full');
    result.vsBaseline = { points: mine.pointsPerHand - b.pointsPerHand, margin: pairedMargin(mine, b),
      pointsPerHand: mine.pointsPerHand, baselinePointsPerHand: b.pointsPerHand, winRate: mine.winRate, baselineWinRate: b.winRate };
    log('Round ' + r + ': ' + best.name + ' against the rule-based bot ' + signed(result.vsBaseline.points) + ' ± ' + result.vsBaseline.margin.toFixed(1) +
      ' points a hand (' + mine.pointsPerHand.toFixed(1) + ' against ' + b.pointsPerHand.toFixed(1) + ')');
  }
  if (best) {
    state.champion = best.file;
    state.members.push(best.file);
    if (opts.dry) { result.dryKept = true; log('Round ' + r + ': ' + best.name + ' would be the new champion (dry run: not shipped)'); state.rounds.push(result); return result; }
    const release = S.ship(best.file);
    result.shipped = release;
    log('Round ' + r + ': ' + best.name + ' is the new champion (' + best.arm + ', J ' + signed(best.full.J) + '), shipped as ' + release);
    if (!opts.noUpload) upload(best.file, release);
  } else {
    log('Round ' + r + ': no candidate beat ' + base(champ) + ' beyond its standard error; it stays champion');
  }
  state.rounds.push(result);

  if (opts.dry || S !== STRATEGIES['neural-cat']) return result;
  // Data in use: what the champion trained on, and the last rounds a fine-tune or a new network would use.
  const champMeta = readJson(state.champion).meta || {};
  const keep = new Set(((champMeta.data) || []).map((d) => path.basename(d)).concat(dataSets().slice(-12).map((d) => path.basename(d))));
  const gone = prune({ apply: true, keep });
  if (gone.moved) log('Moved to the Trash: ' + gone.names.join(', '));
  return result;
}

function report(state) {
  console.log('Champion: ' + base(state.champion) + ' ' + JSON.stringify(playOf(state.champion)) + ', after ' + state.rounds.length + ' rounds (' + state.deals.toLocaleString('en-US') + ' deals); ' +
    stale(state) + ' round' + (stale(state) === 1 ? '' : 's') + ' since it last changed. Arms marked * join only in bold mode.\n');
  console.log('Arm               Tries  Kept  Average J  Results');
  Object.keys(S.trainArms).concat(Object.keys(S.playArms)).forEach((n) => {
    const a = state.arms[n];
    const spec = S.trainArms[n] || S.playArms[n];
    console.log((n + (spec.bold ? ' *' : '')).padEnd(18) + String(a ? a.tries : 0).padStart(5) + String(a ? a.kept : 0).padStart(6) + (a && a.tries ? signed(a.sumJ / a.tries) : '').padStart(11) + '  ' + (a ? a.results.join(', ') : ''));
  });
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const id = String(a.strategy || 'neural-cat');
  if (!STRATEGIES[id]) throw new Error('--strategy is ' + Object.keys(STRATEGIES).join(', '));
  S = STRATEGIES[id];
  PREFIX = a.prefix ? String(a.prefix) : S.prefix;
  DIR = a.dir ? path.resolve(String(a.dir)) : path.join(ROOT, 'ml', S.dir);
  fs.mkdirSync(DIR, { recursive: true });
  const STATE = path.join(DIR, 'state.json');
  const cmd = a._[0] || 'run';
  if (a['quick-deals']) QUICK_DEALS = parseInt(a['quick-deals'], 10);
  if (a['full-deals']) FULL_DEALS = parseInt(a['full-deals'], 10);
  else if (S.fullDeals) FULL_DEALS = S.fullDeals;
  if (a['extra-deals']) EXTRA_DEALS = parseInt(a['extra-deals'], 10);
  if (a.workers) WORKERS = parseInt(a.workers, 10);
  if (a.temperature) LC_TEMPERATURE = parseFloat(a.temperature);

  if (cmd === 'bench') {
    const model = String(a.model);
    const deals = parseInt(a.deals || FULL_DEALS, 10);
    String(a.against).split(',').forEach((o) => {
      // A model name, a model file, or (Lucky Cat) a table strategy such as jorge-yau.
      const strategy = S === STRATEGIES['lucky-cat'] && !/\.json$/.test(o) && !fs.existsSync(path.join(ROOT, 'ml', 'models', o + '.json'));
      const other = strategy || /\.json$/.test(o) ? o : path.join('ml', 'models', o + '.json');
      const e = S.judge(model, other, deals, parseInt(a.seed || 50000000, 10), 'bench-vs-' + base(other));
      log('Bench ' + base(model) + ' vs ' + base(other) + ': ' + fmt(e));
    });
    return;
  }

  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    const found = S.start();
    const start = a.start ? path.relative(ROOT, path.resolve(String(a.start))) : found.start && path.normalize(found.start);
    if (!start) throw new Error('first run needs --start ml/models/<name>.json');
    // Paths in one form (a league's state may use the other slash), so the champion is never its own opponent.
    const members = (found.members || []).map((m) => path.normalize(m)).filter((m, k, all) => m !== start && all.indexOf(m) === k && fs.existsSync(path.join(ROOT, m)));
    state = { strategy: id, champion: start, members: members.concat([start]), arms: {}, rounds: [], deals: 0 };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
    log('The lab starts ' + id + ' from ' + start);
  }
  if (cmd === 'report') return report(state);

  const opts = {
    deals: parseInt(a.deals || 50000, 10),
    train: parseInt(a.train || 3, 10),
    play: parseInt(a.play != null ? a.play : 2, 10),
    noUpload: !!a['no-upload'],
    dry: !!a.dry,
    boldAfter: parseInt(a['bold-after'] || 3, 10),
    stopAfter: parseInt(a['stop-after'] || 6, 10),
  };
  const rounds = parseInt(a.rounds || 10, 10);
  for (let k = 0; k < rounds; k++) {
    if (stale(state) >= opts.stopAfter) {
      const tried = Object.keys(state.arms).map((n) => n + ' ' + state.arms[n].tries + 'x (average J ' + signed(state.arms[n].sumJ / state.arms[n].tries) + ')').join(', ');
      log('Stopping: ' + stale(state) + ' round' + (stale(state) === 1 ? '' : 's') + ' without a new champion, bold mode included. Champion ' + base(state.champion) + '. Tried: ' + tried +
        '. Next: new features (what the model can\'t see yet), which need new data and a person to design them.');
      break;
    }
    round(state, opts);
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }
  log('Done: ' + state.rounds.length + ' rounds. Champion: ' + base(state.champion));
  report(state);
}

try { main(); } catch (err) { log('FAILED: ' + (err.stack || err.message)); process.exit(1); }
