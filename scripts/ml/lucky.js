#!/usr/bin/env node
/* Lucky Cat's training: simulated hands, learning from every hand it wins.

   node scripts/ml/lucky.js generate --weights ml/models/lc0.json --deals 50000 --out ml/data/lc1
   node scripts/ml/lucky.js eval --lineup lc:ml/models/lc2.json,lc:ml/models/lc1.json --deals 2000
   node scripts/ml/lucky.js league --rounds 20 --deals 50000         (npm run ml:lucky)

   generate  plays deals with the learner (the model in --weights, playing
             each move with its share) in --learners seats and opponents
             from --pool in the rest. For every hand a learner seat wins,
             each move that seat made is written out with a weight: more
             for a quicker win, a little more for more faan. Hands it
             doesn't win write nothing.
   eval      plays the same deals with the strategies of --lineup in every
             seat order (each plays its best) and reports hands won,
             how fast, and points.
   league    rounds of generate, train (ml/train_lucky.py), and eval of
             the new model against the best so far. The new model is kept
             when it wins more hands than the best at the same table; each
             kept model joins the pool of past selves the next rounds play
             against. The best is shipped to js/mahjong-lucky-cat-weights.js.
             State is in ml/lucky/state.json, so a stopped league resumes.

   Opponents: lc:<file> is a Lucky Cat model playing its best; nc:<file> is
   Neural Cat with those weights (a model JSON or a shipped weights file);
   any other id is a table strategy (neural-cat plays its fast copy).

   League options:
     --rounds N --deals N   rounds to play this run, deals per round (20, 50000)
     --rival ID            joins the opponents once the best model wins
                           --rival-at of its seats against the model before
                           it (default 0.1), in a third of the seats from
                           then on; each round after, the new model also plays
                           the rival, --rival-eval-deals deals (default 1000)
     --opponents a,b       always among the opponents
     --pool-size N         past selves played against (default 6)
     --keep N              rounds of data trained on (default 6)
     --workers N           processes (default: CPU cores - 1)

   Every model sees only what its seat can see: js/mahjong-lucky-cat-net.js
   reads the seat's own tiles and the table (js/mahjong-fair-play.test.js). */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const E = require('../../js/mahjong-engine.js');
const N = require('../../js/mahjong-lucky-cat-net.js');

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

function readWeights(file) { return JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8')); }

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

const cache = {};
function opponent(id) {
  if (cache[id]) return cache[id];
  let bot;
  if (id.startsWith('lc:')) {
    bot = require('../../js/mahjong-lucky-cat-ml.js').create({ weights: readWeights(id.slice(3)), fast: true });
  } else if (id === 'neural-cat') {
    bot = require('../../js/mahjong-ml.js').create({ fast: true });
  } else if (id.startsWith('nc:')) {
    // Neural Cat with other weights: a model JSON, or a shipped weights file.
    const file = path.resolve(ROOT, id.slice(3));
    const weights = file.endsWith('.js') ? require(file) : readWeights(file);
    bot = require('../../js/mahjong-ml.js').create({ fast: true, weights });
  } else {
    bot = require('../../js/mahjong-strategies.js').get(id).bot;
  }
  cache[id] = bot;
  return bot;
}

// How much a win teaches: a quicker win more, a bigger one a little more.
function winWeight(discards, faan) {
  const speed = Math.max(0.25, Math.min(2.5, 2.4 * Math.exp(-discards / 10)));
  const size = 1 + 0.08 * (Math.min(faan || 3, 13) - 3);
  return speed * size;
}

/* ------------------------------------------------------------------ *
 * A worker: plays deals [from, to)
 * ------------------------------------------------------------------ */

async function work(job) {
  const LC = require('../../js/mahjong-lucky-cat-ml.js');
  const rng = E.createRng(job.seed + 7919);
  const learnerWeights = job.weights ? readWeights(job.weights) : N.zeroWeights();
  let buffers = [[], [], [], []];
  const learner = LC.create({
    weights: learnerWeights, temperature: job.temperature, rng, fast: true,
    onDecision: (d) => {
      const legal = new Uint8Array(10);
      d.moves.forEach((m) => { legal[m.action >> 3] |= 1 << (m.action & 7); });
      buffers[d.seat].push({ x: d.features, a: d.moves[d.pick].action, legal });
    },
  });
  const rows = { x: [], a: [], legal: [], w: [] };
  const stats = { deals: 0, learnerSeats: 0, learnerWins: 0, wins: 0, winDiscards: 0, winFaan: 0, dealIns: 0, samples: 0, negatives: 0, byOpponent: {} };
  for (let d = job.from; d < job.to; d++) {
    const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
    const pool = job.pool.length ? job.pool : ['lc:' + job.weights];
    // The learner's seats, the rest from the pool.
    const seats = [0, 1, 2, 3];
    E.shuffle(seats, rng);
    const learnerSeats = seats.slice(0, job.learners);
    const ids = [0, 1, 2, 3].map((s) => (learnerSeats.includes(s) ? 'learn' : pool[Math.floor(rng() * pool.length)]));
    const agents = ids.map((id) => (id === 'learn' ? learner : opponent(id)).createBotAgent());
    buffers = [[], [], [], []];
    const res = await E.runHand(game, agents);
    stats.deals++;
    stats.learnerSeats += learnerSeats.length;
    if (res.type === 'win') stats.wins++;
    ids.forEach((id, seat) => {
      if (id === 'learn') return;
      const o = (stats.byOpponent[id] = stats.byOpponent[id] || { seats: 0, wins: 0 });
      o.seats++;
      if (res.type === 'win' && res.winner === seat) o.wins++;
    });
    if (res.type === 'win' && res.payer != null && ids[res.payer] === 'learn' && ids[res.winner] !== 'learn') {
      stats.dealIns++;
      // The move that dealt in (the learner's last: the discard, or a robbed
      // kong), written with weight -1: training can push it down (--neg-weight).
      const last = buffers[res.payer][buffers[res.payer].length - 1];
      if (job.out && last) { rows.x.push(last.x); rows.a.push(last.a); rows.legal.push(last.legal); rows.w.push(-1); stats.negatives++; }
    }
    if (res.type !== 'win' || ids[res.winner] !== 'learn') continue;
    const s = res.winner;
    const discards = game.hand.seats[s].discards.length;
    const faan = res.score && res.score.faan;
    stats.learnerWins++;
    stats.winDiscards += discards;
    stats.winFaan += faan || 0;
    if (!job.out) continue;
    const w = winWeight(discards, faan);
    buffers[s].forEach((b) => { rows.x.push(b.x); rows.a.push(b.a); rows.legal.push(b.legal); rows.w.push(w); });
  }
  stats.samples = rows.a.length;
  if (job.out) {
    const n = rows.a.length;
    const x = new Uint16Array(n * N.SIZE);
    rows.x.forEach((v, k) => { for (let i = 0; i < N.SIZE; i++) x[k * N.SIZE + i] = floatToHalf(v[i]); });
    const legal = new Uint8Array(n * 10);
    rows.legal.forEach((v, k) => legal.set(v, k * 10));
    const base = path.join(job.out, 'shard-' + job.shard);
    fs.writeFileSync(base + '.x.f16', Buffer.from(x.buffer));
    fs.writeFileSync(base + '.a.u1', Buffer.from(Uint8Array.from(rows.a)));
    fs.writeFileSync(base + '.m.u1', Buffer.from(legal));
    fs.writeFileSync(base + '.w.f4', Buffer.from(Float32Array.from(rows.w).buffer));
  }
  return stats;
}

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function floatToHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15, frac = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7c00;
  frac += 0x1000; // round
  if (frac & 0x800000) { frac = 0; exp++; if (exp >= 31) return sign | 0x7c00; }
  return sign | (exp << 10) | (frac >> 13);
}

/* ------------------------------------------------------------------ *
 * Splitting the deals over processes
 * ------------------------------------------------------------------ */

function merge(all) {
  const out = { deals: 0, learnerSeats: 0, learnerWins: 0, wins: 0, winDiscards: 0, winFaan: 0, dealIns: 0, samples: 0, negatives: 0, byOpponent: {} };
  all.forEach((s) => {
    ['deals', 'learnerSeats', 'learnerWins', 'wins', 'winDiscards', 'winFaan', 'dealIns', 'samples', 'negatives'].forEach((k) => { out[k] += s[k]; });
    Object.keys(s.byOpponent).forEach((id) => {
      const o = (out.byOpponent[id] = out.byOpponent[id] || { seats: 0, wins: 0 });
      o.seats += s.byOpponent[id].seats;
      o.wins += s.byOpponent[id].wins;
    });
  });
  return out;
}

function runJobs(base, deals, workers) {
  const per = Math.ceil(deals / workers);
  const jobs = [];
  for (let k = 0; k < workers; k++) {
    const from = k * per, to = Math.min(deals, from + per);
    if (from < to) jobs.push(Object.assign({}, base, { from, to, shard: k }));
  }
  return Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => { if (m.error) reject(new Error(m.error)); else resolve(m.stats); child.kill(); });
    child.on('exit', (code) => { if (code) reject(new Error('worker exited ' + code)); });
    child.send(job);
  }))).then(merge);
}

function workerCount(a) { return parseInt(a.workers || Math.max(1, os.cpus().length - 1), 10); }

async function generate(a) {
  const out = a.out ? path.resolve(ROOT, a.out) : null;
  if (out) fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const job = {
    weights: a.weights || null, temperature: parseFloat(a.temperature || 1), seed: parseInt(a.seed || 7000000, 10),
    pool: a.pool ? String(a.pool).split(',') : [], learners: parseInt(a.learners || 2, 10), out,
  };
  const stats = await runJobs(job, parseInt(a.deals || 10000, 10), workerCount(a));
  stats.seconds = (Date.now() - t0) / 1000;
  stats.winRate = stats.learnerWins / Math.max(1, stats.learnerSeats);
  stats.avgWinDiscards = stats.winDiscards / Math.max(1, stats.learnerWins);
  stats.avgWinFaan = stats.winFaan / Math.max(1, stats.learnerWins);
  if (out) fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(Object.assign({ featureVersion: N.FEATURE_VERSION, featureSize: N.SIZE, job }, stats), null, 2) + '\n');
  console.log('generated ' + stats.deals + ' deals in ' + stats.seconds.toFixed(0) + 's: learner won ' + (100 * stats.winRate).toFixed(2) +
    '% of its seats (' + stats.learnerWins + ' hands, ' + stats.avgWinDiscards.toFixed(1) + ' discards, ' + stats.avgWinFaan.toFixed(2) + ' faan), ' + stats.samples + ' samples (' + stats.negatives + ' of them deal-ins)');
  return stats;
}

/* ------------------------------------------------------------------ *
 * Evaluation: the same deals in every seat order
 * ------------------------------------------------------------------ */

async function evalWork(job) {
  const out = {};
  const rot = [[0, 1, 0, 1], [1, 0, 1, 0]];
  for (let d = job.from; d < job.to; d++) {
    for (const r of rot) {
      const ids = r.map((k) => job.lineup[k % job.lineup.length]);
      const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
      const res = await E.runHand(game, ids.map((id) => opponent(id).createBotAgent()));
      ids.forEach((id, s) => {
        const o = (out[id] = out[id] || { seats: 0, wins: 0, points: 0, dealIns: 0, winDiscards: 0, winFaan: 0, selfDraws: 0 });
        o.seats++;
        o.points += res.deltas[s];
        if (res.type !== 'win') return;
        if (res.winner === s) {
          o.wins++;
          o.winDiscards += game.hand.seats[s].discards.length;
          o.winFaan += (res.score && res.score.faan) || 0;
          if (res.how === 'selfDraw') o.selfDraws++;
        } else if (res.payer === s) o.dealIns++;
      });
    }
  }
  return out;
}

async function evaluate(a) {
  const lineup = String(a.lineup).split(',');
  const deals = parseInt(a.deals || 2000, 10), workers = workerCount(a);
  const per = Math.ceil(deals / workers), jobs = [];
  for (let k = 0; k < workers; k++) if (k * per < deals) jobs.push({ mode: 'eval', lineup, seed: parseInt(a.seed || 3100000, 10), from: k * per, to: Math.min(deals, (k + 1) * per) });
  const parts = await Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => { if (m.error) reject(new Error(m.error)); else resolve(m.stats); child.kill(); });
    child.send(job);
  })));
  const sum = {};
  parts.forEach((p) => Object.keys(p).forEach((id) => {
    const o = (sum[id] = sum[id] || { seats: 0, wins: 0, points: 0, dealIns: 0, winDiscards: 0, winFaan: 0, selfDraws: 0 });
    Object.keys(p[id]).forEach((k) => { o[k] += p[id][k]; });
  }));
  Object.keys(sum).forEach((id) => {
    const o = sum[id];
    o.winRate = o.wins / o.seats;
    o.dealInRate = o.dealIns / o.seats;
    o.pointsPerHand = o.points / o.seats;
    o.avgWinDiscards = o.winDiscards / Math.max(1, o.wins);
    o.avgWinFaan = o.winFaan / Math.max(1, o.wins);
    console.log(id + ': won ' + (100 * o.winRate).toFixed(2) + '% of hands (' + o.avgWinDiscards.toFixed(1) + ' discards, ' +
      o.avgWinFaan.toFixed(2) + ' faan), dealt in ' + (100 * o.dealInRate).toFixed(2) + '%, ' + o.pointsPerHand.toFixed(1) + ' points/hand');
  });
  if (a.json) fs.writeFileSync(path.resolve(ROOT, a.json), JSON.stringify({ lineup, deals, summary: sum }, null, 2) + '\n');
  return sum;
}

/* ------------------------------------------------------------------ *
 * The league
 * ------------------------------------------------------------------ */

async function league(a) {
  const dir = path.resolve(ROOT, a.dir || 'ml/lucky');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'ml', 'models'), { recursive: true });
  const STATE = path.join(dir, 'state.json');
  const LOG = path.join(dir, 'league.log');
  const log = (s) => { const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + s; console.log(line); fs.appendFileSync(LOG, line + '\n'); };
  const prefix = a.prefix || 'lc';
  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  if (!state) {
    // The first model plays at random.
    const zero = path.join('ml', 'models', prefix + '0.json');
    const w = N.zeroWeights();
    w.layers = w.layers.map((l) => ({ rows: l.rows, cols: l.cols, w: Array.from(l.w), b: Array.from(l.b) }));
    w.meta = { name: prefix + '0', random: true };
    fs.writeFileSync(path.join(ROOT, zero), JSON.stringify(w));
    state = { best: { name: prefix + '0', model: zero }, pool: [zero], rounds: [], deals: 0 };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
    log('League starts from ' + zero + ' (random moves)');
  }
  const rounds = parseInt(a.rounds || 20, 10), deals = parseInt(a.deals || 50000, 10);
  const keep = parseInt(a.keep || 6, 10), poolSize = parseInt(a['pool-size'] || 6, 10);
  const extra = a.opponents ? String(a.opponents).split(',') : [];
  const evalDeals = parseInt(a['eval-deals'] || 2000, 10);
  const rival = a.rival ? String(a.rival) : null;
  const rivalAt = parseFloat(a['rival-at'] || 0.1);
  const rivalDeals = parseInt(a['rival-eval-deals'] || 1000, 10);
  const bestWinRate = () => {
    const r = state.rounds.filter((x) => x.name === state.best.name)[0];
    return r ? r.vsBest.winRate : 0;
  };
  for (let k = 0; k < rounds; k++) {
    const r = state.rounds.length + 1, name = prefix + r;
    const data = path.join('ml', 'data', name);
    // Opponents: the best and the latest past selves, plus any others.
    const selves = state.pool.slice(-poolSize).map((m) => 'lc:' + m);
    if (rival && !state.rivalFrom && bestWinRate() >= rivalAt) {
      state.rivalFrom = r;
      log('Round ' + r + ': ' + state.best.name + ' wins ' + (100 * bestWinRate()).toFixed(1) + '% of its seats, so ' + rival + ' joins the opponents');
    }
    const rivals = state.rivalFrom ? new Array(Math.max(1, Math.ceil(selves.length / 2))).fill(rival) : [];
    const pool = selves.concat(rivals, extra);
    log('Round ' + r + ': ' + deals + ' deals, ' + state.best.model + ' learning against ' + pool.join(', '));
    const g = await generate({ weights: state.best.model, deals, out: data, pool: pool.join(','), seed: String(7000000 + r * 1000000),
      temperature: a.temperature || 1, learners: a.learners || 2, workers: a.workers });
    const recent = state.rounds.map((x) => x.data).concat([data]).slice(-keep);
    log('Round ' + r + ': training ' + name + ' on ' + recent.join(', '));
    const tr = spawnSync(require('./python.js').PYTHON, ['ml/train_lucky.py', '--data'].concat(recent,
      ['--name', name, '--init', state.best.model, '--epochs', String(a.epochs || 6)]), { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    fs.appendFileSync(LOG, (tr.stdout || '') + (tr.stderr || ''));
    if (tr.status !== 0) throw new Error('training failed:\n' + (tr.stderr || '').slice(-2000));
    const model = path.join('ml', 'models', name + '.json');
    const ev = await evaluate({ lineup: 'lc:' + model + ',lc:' + state.best.model, deals: evalDeals, seed: String(3100000 + r * 10000),
      workers: a.workers, json: path.join(path.relative(ROOT, dir), 'eval-' + name + '.json') });
    const mine = ev['lc:' + model], best = ev['lc:' + state.best.model];
    const kept = mine.winRate > best.winRate;
    log('Round ' + r + ': ' + name + ' won ' + (100 * mine.winRate).toFixed(2) + '% of hands (' + mine.avgWinDiscards.toFixed(1) +
      ' discards), the best (' + state.best.name + ') ' + (100 * best.winRate).toFixed(2) + '%' + (kept ? ' -> new best' : ' -> kept ' + state.best.name));
    state.rounds.push({ name, data, model, kept, generate: { winRate: g.winRate, learnerWins: g.learnerWins, samples: g.samples },
      vsBest: { winRate: mine.winRate, bestWinRate: best.winRate, avgWinDiscards: mine.avgWinDiscards, pointsPerHand: mine.pointsPerHand } });
    state.deals += deals;
    if (state.rivalFrom) {
      const who = kept ? model : state.best.model;
      const rv = await evaluate({ lineup: 'lc:' + who + ',' + rival, deals: rivalDeals, seed: String(3500000 + r * 10000),
        workers: a.workers, json: path.join(path.relative(ROOT, dir), 'rival-' + name + '.json') });
      const me = rv['lc:' + who], them = rv[rival];
      state.rounds[state.rounds.length - 1].vsRival = { model: who, winRate: me.winRate, rivalWinRate: them.winRate,
        avgWinDiscards: me.avgWinDiscards, pointsPerHand: me.pointsPerHand, rivalPointsPerHand: them.pointsPerHand };
      log('Round ' + r + ': against ' + rival + ', ' + path.basename(who, '.json') + ' won ' + (100 * me.winRate).toFixed(2) + '% of hands (' +
        me.pointsPerHand.toFixed(1) + ' points/hand), ' + rival + ' ' + (100 * them.winRate).toFixed(2) + '% (' + them.pointsPerHand.toFixed(1) + ')');
    }
    if (kept) {
      state.best = { name, model };
      state.pool.push(model);
      if (!a['no-ship']) {
        require('./ship.js').ship(path.join(ROOT, model), 'lucky-cat');
        log('Shipped ' + name + ' to js/mahjong-lucky-cat-weights.js');
      }
    }
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  }
  log('Done. Best: ' + state.best.name + ' after ' + state.deals + ' deals');
}

/* ------------------------------------------------------------------ */

if (process.argv.includes('--worker')) {
  process.on('message', (job) => {
    (job.mode === 'eval' ? evalWork(job) : work(job))
      .then((stats) => process.send({ stats }))
      .catch((err) => process.send({ error: err.stack || String(err) }));
  });
} else if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  const run = cmd === 'generate' ? generate : cmd === 'eval' ? evaluate : cmd === 'league' ? league : null;
  if (!run) { console.error('usage: lucky.js generate|eval|league [options]'); process.exit(2); }
  run(a).catch((err) => { console.error(err.stack || err.message); process.exit(1); });
}

module.exports = { winWeight, generate, evaluate };
