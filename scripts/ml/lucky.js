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
             --returns records every hand instead, won or lost (the lab's
             points-first training): each move a learner seat chose among
             two or more (each kept with chance --sample, default 0.5),
             with the points that seat scored in the hand, how the hand
             ended for it, the share the move was played with, and the
             hand it came from. ml/train_lucky.py --mode pg or awr learns
             from those which moves led to more points.
             --rollouts N replays deals instead (the lab's Lucky Cat since
             the table rounds LT1 to LT4): the --weights model plays its
             best in one seat at the --pool table, and at up to N of its
             real choices a hand the deal is played again with each of its
             --alts (2) next-best moves forced there, so each move gets its
             own points on the same wall. ml/train_lucky.py --mode q learns
             from those. --futures K (default 1) plays each move, the
             champion's too, on K reshuffles of the wall still to be drawn
             at that choice, and keeps the mean.
   eval      plays the same deals with the strategies of --lineup in every
             seat order (each plays its best) and reports hands won,
             how fast, and points. With two strategies it also reports the
             paired points gap (the first's points a hand less the
             second's, deal by deal) and its standard error.
             --table a,b,c seats each strategy of --lineup alone at a table
             of those three instead, in every seat in turn, on the same
             deals: the game's table (the lab judges Lucky Cat this way,
             since beating its own kind head to head can mean bigger hands
             that don't pay against Neural Cat and Jorge Yau).
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
const { fork, spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const E = require('../../js/mahjong-engine.js');
const N = require('../../js/mahjong-lucky-cat-net.js');
const O = require('./oracle.js');

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

// The encoder a model reads: Lucky Cat's (version 1), or features v2 (js/mahjong-frontier-net.js).
const F2 = require('../../js/mahjong-frontier-net.js');
function netFor(w) { return w && w.featureVersion === F2.FEATURE_VERSION ? F2 : N; }

function readWeights(file) { return JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8')); }

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

const cache = {};
function opponent(id) {
  if (cache[id]) return cache[id];
  let bot;
  if (id.startsWith('lc:')) {
    const w = readWeights(id.slice(3));
    // An oracle model (Suphx's oracle guiding) also reads the hidden tiles, at its own dropout.
    const o = (w.meta || {}).oracle;
    bot = require('../../js/mahjong-lucky-cat-ml.js').create({ weights: w, fast: true, net: netFor(w),
      features: o ? oracleFeatures(o.delta, E.createRng(7)) : null });
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

// Suphx's oracle guiding (scripts/ml/oracle.js): the features the learner
// plays on (its view and the hidden tiles, each hidden input kept with
// chance delta) and the ones recorded (every hidden tile, for the critic
// and for training at any delta). A public model's first layer reads only
// its own columns, so it plays as before on the longer vector.
function oracleFeatures(delta, rng) {
  return (game, seat, x) => {
    const full = O.extend(x, game, seat);
    if (delta >= 1) return { x: full, record: full };
    const play = full.slice();
    for (let i = x.length; i < play.length; i++) if (rng() >= delta) play[i] = 0;
    return { x: play, record: full };
  };
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
  if (job.rollouts) return rolloutWork(job);
  const LC = require('../../js/mahjong-lucky-cat-ml.js');
  const rng = E.createRng(job.seed + 7919);
  const v2 = job.features === 'v2';
  const learnerWeights = job.weights ? readWeights(job.weights) : v2 ? F2.zeroWeights() : N.zeroWeights();
  if (v2 !== (learnerWeights.featureVersion === F2.FEATURE_VERSION)) throw new Error('--features ' + (v2 ? 'v2' : 'v1') + ' needs a model of that version, not ' + job.weights);
  let buffers = [[], [], [], []];
  const returns = !!job.returns;
  const sample = job.sample == null ? 1 : job.sample;
  // --sample-won P: moves of a hand the learner won kept with chance P, the rest with --sample.
  const sampleWon = job.sampleWon == null ? null : job.sampleWon;
  const temp = job.temperature || 1;
  // --oracle: record the hidden tiles too; an oracle model also plays on them (at --oracle-delta, else its own).
  const om = (learnerWeights.meta || {}).oracle;
  const delta = job.oracleDelta != null ? job.oracleDelta : om ? om.delta : 0;
  const learner = LC.create({
    weights: learnerWeights, temperature: job.temperature, rng, fast: true, net: netFor(learnerWeights),
    features: job.oracle || om ? oracleFeatures(delta, E.createRng(job.seed + 31337)) : null,
    onDecision: (d) => {
      // Points-first data: only real choices, a share of them.
      // With --sample-won every real choice is kept until the hand ends (then sampled by how it ended).
      if (returns && (d.moves.length < 2 || (sampleWon == null && rng() >= sample))) return;
      const legal = new Uint8Array(10);
      d.moves.forEach((m) => { legal[m.action >> 3] |= 1 << (m.action & 7); });
      // The chance the move was played with (its share, at the temperature).
      const z = d.moves.reduce((s, m) => s + Math.pow(m.p, 1 / temp), 0);
      const p = Math.pow(d.moves[d.pick].p, 1 / temp) / z;
      buffers[d.seat].push({ x: d.features, a: d.moves[d.pick].action, legal, p });
    },
  });
  const rows = { x: [], a: [], legal: [], w: [], r: [], p: [], o: [], h: [] };
  const stats = { deals: 0, learnerSeats: 0, learnerWins: 0, wins: 0, winDiscards: 0, winFaan: 0, dealIns: 0, samples: 0, negatives: 0, learnerPoints: 0, learnerWinPoints: 0, byOpponent: {} };
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
      // Imitation: the move that dealt in (the learner's last: the discard, or
      // a robbed kong), written with weight -1: training can push it down
      // (--neg-weight). With --returns every move already carries its hand's
      // points, deal-ins included.
      const last = buffers[res.payer][buffers[res.payer].length - 1];
      if (!returns && job.out && last) { rows.x.push(last.x); rows.a.push(last.a); rows.legal.push(last.legal); rows.w.push(-1); stats.negatives++; }
    }
    learnerSeats.forEach((s) => { stats.learnerPoints += res.deltas[s] || 0; });
    if (returns) {
      // Every learner seat's moves, with what the hand paid that seat.
      learnerSeats.forEach((s) => {
        const won = res.type === 'win' && res.winner === s;
        const outcome = won ? 0 : res.type === 'win' && res.payer === s ? 1 : res.type === 'win' ? 2 : 3;
        if (won) {
          stats.learnerWins++;
          stats.winDiscards += game.hand.seats[s].discards.length;
          stats.winFaan += (res.score && res.score.faan) || 0;
          stats.learnerWinPoints += res.deltas[s];
        }
        if (!job.out) return;
        const hand = d * 4 + s;
        const keep = sampleWon == null ? 1 : won ? sampleWon : sample;
        buffers[s].forEach((b) => {
          if (keep < 1 && rng() >= keep) return;
          rows.x.push(b.x); rows.a.push(b.a); rows.legal.push(b.legal); rows.w.push(1);
          rows.r.push(res.deltas[s] || 0); rows.p.push(b.p); rows.o.push(outcome); rows.h.push(hand);
        });
      });
      continue;
    }
    if (res.type !== 'win' || ids[res.winner] !== 'learn') continue;
    const s = res.winner;
    const discards = game.hand.seats[s].discards.length;
    const faan = res.score && res.score.faan;
    stats.learnerWins++;
    stats.winDiscards += discards;
    stats.winFaan += faan || 0;
    stats.learnerWinPoints += res.deltas[s];
    if (!job.out) continue;
    const w = winWeight(discards, faan);
    buffers[s].forEach((b) => { rows.x.push(b.x); rows.a.push(b.a); rows.legal.push(b.legal); rows.w.push(w); });
  }
  stats.samples = rows.a.length;
  if (job.out) {
    const n = rows.a.length;
    const W = rowSize(job);
    const x = new Uint16Array(n * W);
    rows.x.forEach((v, k) => { for (let i = 0; i < W; i++) x[k * W + i] = floatToHalf(v[i]); });
    const legal = new Uint8Array(n * 10);
    rows.legal.forEach((v, k) => legal.set(v, k * 10));
    const base = path.join(job.out, 'shard-' + job.shard);
    fs.writeFileSync(base + '.x.f16', Buffer.from(x.buffer));
    fs.writeFileSync(base + '.a.u1', Buffer.from(Uint8Array.from(rows.a)));
    fs.writeFileSync(base + '.m.u1', Buffer.from(legal));
    fs.writeFileSync(base + '.w.f4', Buffer.from(Float32Array.from(rows.w).buffer));
    if (returns) {
      fs.writeFileSync(base + '.r.f4', Buffer.from(Float32Array.from(rows.r).buffer));
      fs.writeFileSync(base + '.p.f4', Buffer.from(Float32Array.from(rows.p).buffer));
      fs.writeFileSync(base + '.o.u1', Buffer.from(Uint8Array.from(rows.o)));
      fs.writeFileSync(base + '.h.u4', Buffer.from(Uint32Array.from(rows.h).buffer));
    }
  }
  return stats;
}

/* ------------------------------------------------------------------ *
 * Rollouts: each move's points, from replays of the same deal
 * ------------------------------------------------------------------ */

// --rollouts N: the learner (playing its best) takes one seat at the --pool
// table (its three players in order), every seat in turn over the deals. At
// up to N of its real choices a hand (those it was least sure of more often),
// the deal is played again from the start with each of its --alts next-best
// moves forced there instead, and every player playing its best otherwise.
// The deal and every other choice are the same, so the gap between the
// replays' points and the hand's is that one move's worth, on that wall:
// far less noise than crediting every move with the whole hand's points.
// Each row: the features, the legal moves, the moves tried (the one played
// first) and the points each scored. ml/train_lucky.py --mode q learns from them.
//
// --futures K (since LR1 to LR3 kept nothing): on one fixed wall a move is
// judged with the future known, which no player can know when it chooses.
// So at the choice the wall still to be drawn (flowers left in place) is
// shuffled again, K ways, and every move, the champion's included, plays the
// same K futures. The other players' concealed tiles stay: at a claim they
// may already have chosen which of them to meld.
// Its points are the mean: what the move is worth from what the learner
// knew, with the futures' luck shared between the moves.
async function rolloutWork(job) {
  const LC = require('../../js/mahjong-lucky-cat-ml.js');
  const N2 = require('../../js/mahjong-lucky-cat-net.js');
  const rng = E.createRng(job.seed + 104729);
  const model = N2.createModel(readWeights(job.weights));
  const SLOTS = job.alts + 1;
  // The learner, playing its best: with force, the force.at-th decision plays force.k.
  function learnerAgent(record, force, gameRef) {
    let i = 0;
    const wrapped = {
      policy(x, moves) {
        const out = model.policy(x, moves);
        if (record) record.push({ x: Float32Array.from(x), moves: moves.map((m) => ({ action: m.action, p: m.p })) });
        if (force && i === force.at) {
          if (moves.length !== force.n) force.mismatch = true;
          else {
            moves.forEach((m, k) => { m.p = k === force.k ? 2 : m.p / 2; });
            if (force.future != null) reshuffleUnseen(gameRef.game, force.seat, force.future);
          }
        }
        i++;
        return out;
      },
    };
    return LC.create({ model: wrapped, fast: true }).createBotAgent();
  }
  // The wall still to be drawn, shuffled again (flowers left in place): the
  // same future seed gives the same future for every move tried.
  function reshuffleUnseen(game, seat, future) {
    const h = game.hand;
    const slots = [];
    h.wall.forEach((t, i) => { if (!E.isBonus(t)) slots.push([h.wall, i]); });
    const tiles = slots.map(([arr, i]) => arr[i]).sort((x, y) => x - y);
    E.shuffle(tiles, E.createRng(future));
    slots.forEach(([arr, i], k) => { arr[i] = tiles[k]; });
  }
  async function play(d, seat, record, force) {
    const others = job.pool.slice();
    const gameRef = {};
    const agents = [0, 1, 2, 3].map((s) => (s === seat ? learnerAgent(record, force, gameRef) : opponent(others.shift()).createBotAgent()));
    const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
    gameRef.game = game;
    const res = await E.runHand(game, agents);
    return { points: res.deltas[seat] || 0, res, game };
  }
  const rows = { x: [], a: [], legal: [], qa: [], q: [], h: [] };
  const stats = { deals: 0, learnerSeats: 0, learnerWins: 0, wins: 0, winDiscards: 0, winFaan: 0, dealIns: 0, samples: 0, negatives: 0,
    learnerPoints: 0, learnerWinPoints: 0, byOpponent: {}, replays: 0, compared: 0, mismatches: 0, changed: 0, better: 0 };
  for (let d = job.from; d < job.to; d++) {
    const seat = d % 4;
    const record = [];
    const base = await play(d, seat, record, null);
    const { res, game } = base;
    stats.deals++;
    stats.learnerSeats++;
    stats.learnerPoints += base.points;
    if (res.type === 'win') {
      stats.wins++;
      if (res.winner === seat) {
        stats.learnerWins++;
        stats.learnerWinPoints += base.points;
        stats.winDiscards += game.hand.seats[seat].discards.length;
        stats.winFaan += (res.score && res.score.faan) || 0;
      } else if (res.payer === seat) stats.dealIns++;
    }
    // Real choices, the less sure ones more often.
    const choices = [];
    record.forEach((r, at) => {
      if (r.moves.length < 2) return;
      const top = Math.max(...r.moves.map((m) => m.p));
      if (rng() < Math.min(1, (job.rollouts / Math.max(1, record.length)) * 2 * (1.05 - top))) choices.push(at);
    });
    while (choices.length > job.rollouts) choices.splice(Math.floor(rng() * choices.length), 1);
    for (const at of choices) {
      const r = record[at];
      const order = r.moves.map((m, k) => k).sort((p, q) => r.moves[q].p - r.moves[p].p);
      let tried = [order[0]], q = [base.points];
      if (job.futures > 1) {
        // Every move, the champion's first, on the same K reshuffled futures.
        tried = []; q = [];
        for (const k of order.slice(0, SLOTS)) {
          let sum = 0, ok = true;
          for (let f = 0; f < job.futures; f++) {
            const force = { at, k, n: r.moves.length, seat, future: (job.seed + d * 7919 + at * 104729 + f * 15485863) >>> 0 };
            const alt = await play(d, seat, null, force);
            stats.replays++;
            if (force.mismatch) { stats.mismatches++; ok = false; break; }
            sum += alt.points;
          }
          if (!ok) continue;
          tried.push(k);
          q.push(sum / job.futures);
        }
        if (tried.length < 2 || tried[0] !== order[0]) continue;
        for (let j = 1; j < q.length; j++) {
          stats.compared++;
          if (q[j] !== q[0]) stats.changed++;
          if (q[j] > q[0]) stats.better++;
        }
      } else for (const k of order.slice(1, SLOTS)) {
        const force = { at, k, n: r.moves.length };
        const alt = await play(d, seat, null, force);
        stats.replays++;
        if (force.mismatch) { stats.mismatches++; continue; }
        tried.push(k);
        q.push(alt.points);
        stats.compared++;
        if (alt.points !== base.points) stats.changed++;
        if (alt.points > base.points) stats.better++;
      }
      if (tried.length < 2 || !job.out) continue;
      const legal = new Uint8Array(10);
      r.moves.forEach((m) => { legal[m.action >> 3] |= 1 << (m.action & 7); });
      const qa = new Uint8Array(SLOTS).fill(255), qv = new Float32Array(SLOTS);
      tried.forEach((k, j) => { qa[j] = r.moves[k].action; qv[j] = q[j]; });
      rows.x.push(r.x); rows.a.push(r.moves[order[0]].action); rows.legal.push(legal);
      rows.qa.push(qa); rows.q.push(qv); rows.h.push(d);
    }
  }
  stats.samples = rows.a.length;
  if (job.out) {
    const n = rows.a.length;
    const x = new Uint16Array(n * N.SIZE);
    rows.x.forEach((v, k) => { for (let i = 0; i < N.SIZE; i++) x[k * N.SIZE + i] = floatToHalf(v[i]); });
    const legal = new Uint8Array(n * 10);
    rows.legal.forEach((v, k) => legal.set(v, k * 10));
    const qa = new Uint8Array(n * SLOTS), q = new Float32Array(n * SLOTS);
    rows.qa.forEach((v, k) => qa.set(v, k * SLOTS));
    rows.q.forEach((v, k) => q.set(v, k * SLOTS));
    const out = path.join(job.out, 'shard-' + job.shard);
    fs.writeFileSync(out + '.x.f16', Buffer.from(x.buffer));
    fs.writeFileSync(out + '.a.u1', Buffer.from(Uint8Array.from(rows.a)));
    fs.writeFileSync(out + '.m.u1', Buffer.from(legal));
    fs.writeFileSync(out + '.w.f4', Buffer.from(new Float32Array(n).fill(1).buffer));
    fs.writeFileSync(out + '.qa.u1', Buffer.from(qa));
    fs.writeFileSync(out + '.q.f4', Buffer.from(q.buffer));
    fs.writeFileSync(out + '.h.u4', Buffer.from(Uint32Array.from(rows.h).buffer));
  }
  return stats;
}

// A recorded row: the seat's features, then the hidden tiles' with --oracle.
function publicSize(job) { return job.features === 'v2' ? F2.SIZE : N.SIZE; }
function rowSize(job) { return publicSize(job) + (job.oracle ? O.SIZE : 0); }

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
  const out = { deals: 0, learnerSeats: 0, learnerWins: 0, wins: 0, winDiscards: 0, winFaan: 0, dealIns: 0, samples: 0, negatives: 0, learnerPoints: 0, learnerWinPoints: 0, byOpponent: {} };
  all.forEach((s) => {
    Object.keys(s).forEach((k) => { if (typeof s[k] === 'number') out[k] = (out[k] || 0) + s[k]; });
    Object.keys(s.byOpponent).forEach((id) => {
      const o = (out.byOpponent[id] = out.byOpponent[id] || { seats: 0, wins: 0 });
      o.seats += s.byOpponent[id].seats;
      o.wins += s.byOpponent[id].wins;
    });
  });
  return out;
}

// The native simulator writes the same shards byte for byte (scripts/ml/native.js),
// when it can play the learner and every opponent exactly; LCM_JS=1 forces the JS.
function nativeJob(job) {
  if (process.env.LCM_JS || job.rollouts || job.oracleDelta != null || !job.weights) return null;
  const N = require('./native.js');
  const learner = N.nativeId('lc:' + job.weights);
  const pool = job.pool.map((id) => N.nativeId(id));
  if (!learner || pool.some((x) => !x)) return null;
  const args = ['generate', '--weights', learner.slice(3), '--seed', String(job.seed), '--from', String(job.from), '--to', String(job.to),
    '--shard', String(job.shard), '--learners', String(job.learners), '--temperature', String(job.temperature), '--sample', String(job.sample)];
  if (pool.length) args.push('--pool', pool.join(','));
  if (job.returns) args.push('--returns');
  if (job.oracle) args.push('--oracle');
  if (job.sampleWon != null) args.push('--sample-won', String(job.sampleWon));
  if (job.out) args.push('--out', job.out);
  return args;
}

function runJobs(base, deals, workers) {
  const per = Math.ceil(deals / workers);
  const jobs = [];
  for (let k = 0; k < workers; k++) {
    const from = k * per, to = Math.min(deals, from + per);
    if (from < to) jobs.push(Object.assign({}, base, { from, to, shard: k }));
  }
  const natives = jobs.map(nativeJob);
  if (natives.every((x) => x)) {
    const SIM = path.join(ROOT, 'native', 'build', 'lcm-sim');
    return Promise.all(natives.map((args) => new Promise((resolve, reject) => {
      const child = spawn(SIM, args, { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('exit', (code) => (code ? reject(new Error('lcm-sim generate exited with ' + code)) : resolve(JSON.parse(out))));
    }))).then(merge);
  }
  return Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => { if (m.error) reject(new Error(m.error)); else resolve(m.stats); child.kill(); });
    child.on('exit', (code) => { if (code) reject(new Error('worker exited ' + code)); });
    child.send(job);
  }))).then(merge);
}

function workerCount(a) { return parseInt(a.workers || Math.max(1, os.cpus().length - 1), 10); }

function job0Weights(a) { return a.weights ? readWeights(a.weights) : null; }

async function generate(a) {
  const out = a.out ? path.resolve(ROOT, a.out) : null;
  if (out) fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const job = {
    weights: a.weights || null, temperature: parseFloat(a.temperature || 1), seed: parseInt(a.seed || 7000000, 10),
    pool: a.pool ? String(a.pool).split(',') : [], learners: parseInt(a.learners || 2, 10), out,
    returns: !!a.returns, sample: a.returns ? parseFloat(a.sample || 0.5) : 1,
    rollouts: a.rollouts ? parseInt(a.rollouts, 10) : 0, alts: parseInt(a.alts || 2, 10),
    futures: parseInt(a.futures || 1, 10),
    oracle: !!a.oracle, oracleDelta: a['oracle-delta'] != null ? parseFloat(a['oracle-delta']) : null,
    // --features v2: the learner reads features v2 (js/mahjong-frontier-net.js); its model must be v2.
    sampleWon: a['sample-won'] != null ? parseFloat(a['sample-won']) : null,
    features: a.features ? String(a.features) : (job0Weights(a) || {}).featureVersion === F2.FEATURE_VERSION ? 'v2' : 'v1',
  };
  if (job.oracle && job.rollouts) throw new Error('--oracle records hands played (--returns or wins), not --rollouts');
  if (!job.oracle && job.weights && (readWeights(job.weights).meta || {}).oracle) job.oracle = true;
  const stats = await runJobs(job, parseInt(a.deals || 10000, 10), workerCount(a));
  stats.seconds = (Date.now() - t0) / 1000;
  stats.winRate = stats.learnerWins / Math.max(1, stats.learnerSeats);
  stats.avgWinDiscards = stats.winDiscards / Math.max(1, stats.learnerWins);
  stats.avgWinFaan = stats.winFaan / Math.max(1, stats.learnerWins);
  stats.pointsPerHand = stats.learnerPoints / Math.max(1, stats.learnerSeats);
  stats.avgWinPoints = stats.learnerWinPoints / Math.max(1, stats.learnerWins);
  if (out) fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(Object.assign({ featureVersion: job.features === 'v2' ? F2.FEATURE_VERSION : N.FEATURE_VERSION, featureSize: rowSize(job), oracle: job.oracle ? { size: O.SIZE, publicSize: publicSize(job), dangerAt: publicSize(job) + O.DANGER, oracleAt: publicSize(job), per: O.PER, delta: job.oracleDelta } : null, returns: job.returns, rollouts: job.rollouts ? { slots: job.alts + 1 } : null, job }, stats), null, 2) + '\n');
  console.log('generated ' + stats.deals + ' deals in ' + stats.seconds.toFixed(0) + 's: learner won ' + (100 * stats.winRate).toFixed(2) +
    '% of its seats (' + stats.learnerWins + ' hands, ' + stats.avgWinDiscards.toFixed(1) + ' discards, ' + stats.avgWinFaan.toFixed(2) + ' faan, ' +
    Math.round(stats.avgWinPoints) + ' points a win), ' + stats.pointsPerHand.toFixed(1) + ' points a hand, ' + stats.samples + ' samples' +
    (stats.negatives ? ' (' + stats.negatives + ' of them deal-ins)' : '') +
    (stats.replays ? '; ' + stats.replays + ' replays, ' + (100 * stats.changed / (stats.compared || stats.replays)).toFixed(1) + '% changed the points, ' +
      (100 * stats.better / (stats.compared || stats.replays)).toFixed(1) + '% for the better' + (stats.mismatches ? ', ' + stats.mismatches + ' out of step' : '') : ''));
  return stats;
}

/* ------------------------------------------------------------------ *
 * Evaluation: the same deals in every seat order
 * ------------------------------------------------------------------ */

async function evalWork(job) {
  const out = {};
  const rot = [[0, 1, 0, 1], [1, 0, 1, 0]];
  // The paired gap: per deal, the first strategy's points a seat-hand less the second's.
  const pair = { n: 0, sum: 0, sq: 0 };
  const two = job.lineup.length === 2 && job.lineup[0] !== job.lineup[1];
  const record = (o, res, s, game) => {
    o.seats++;
    o.points += res.deltas[s];
    if (res.type !== 'win') return;
    if (res.winner === s) {
      o.wins++;
      o.winPoints += res.deltas[s];
      o.winDiscards += game.hand.seats[s].discards.length;
      o.winFaan += (res.score && res.score.faan) || 0;
      if (res.how === 'selfDraw') o.selfDraws++;
    } else if (res.payer === s) o.dealIns++;
  };
  for (let d = job.from; d < job.to; d++) {
    let gap = 0;
    if (job.table) {
      // --table: each strategy of the lineup takes one seat, in turn every
      // seat, at the same table on the same deal; the gap is its points
      // there less the other's, so only their choices differ.
      for (let k = 0; k < 4; k++) {
        for (const id of job.lineup) {
          const others = job.table.slice();
          const ids = [0, 1, 2, 3].map((s) => (s === k ? id : others.shift()));
          const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
          const res = await E.runHand(game, ids.map((x) => opponent(x).createBotAgent()));
          record((out[id] = out[id] || { seats: 0, wins: 0, points: 0, dealIns: 0, winDiscards: 0, winFaan: 0, selfDraws: 0, winPoints: 0 }), res, k, game);
          if (two) gap += (id === job.lineup[0] ? 1 : -1) * res.deltas[k] / 4;
        }
      }
      if (two) { pair.n++; pair.sum += gap; pair.sq += gap * gap; }
      continue;
    }
    for (const r of rot) {
      const ids = r.map((k) => job.lineup[k % job.lineup.length]);
      const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
      const res = await E.runHand(game, ids.map((id) => opponent(id).createBotAgent()));
      ids.forEach((id, s) => {
        const o = (out[id] = out[id] || { seats: 0, wins: 0, points: 0, dealIns: 0, winDiscards: 0, winFaan: 0, selfDraws: 0, winPoints: 0 });
        o.seats++;
        o.points += res.deltas[s];
        if (two) gap += (id === job.lineup[0] ? 1 : -1) * res.deltas[s] / 4;
        if (res.type !== 'win') return;
        if (res.winner === s) {
          o.wins++;
          o.winPoints += res.deltas[s];
          o.winDiscards += game.hand.seats[s].discards.length;
          o.winFaan += (res.score && res.score.faan) || 0;
          if (res.how === 'selfDraw') o.selfDraws++;
        } else if (res.payer === s) o.dealIns++;
      });
    }
    if (two) { pair.n++; pair.sum += gap; pair.sq += gap * gap; }
  }
  if (two) out._pair = pair;
  return out;
}

async function evaluate(a) {
  const lineup = String(a.lineup).split(',');
  const deals = parseInt(a.deals || 2000, 10), workers = workerCount(a);
  const per = Math.ceil(deals / workers), jobs = [];
  const table = a.table ? String(a.table).split(',') : null;
  if (table && table.length !== 3) throw new Error('--table needs three strategies, e.g. neural-cat,jorge-yau,neural-cat');
  for (let k = 0; k < workers; k++) if (k * per < deals) jobs.push({ mode: 'eval', lineup, table, seed: parseInt(a.seed || 3100000, 10), from: k * per, to: Math.min(deals, (k + 1) * per) });
  const parts = await Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => { if (m.error) reject(new Error(m.error)); else resolve(m.stats); child.kill(); });
    child.send(job);
  })));
  const sum = {};
  const pair = { n: 0, sum: 0, sq: 0 };
  parts.forEach((p) => Object.keys(p).forEach((id) => {
    if (id === '_pair') { pair.n += p[id].n; pair.sum += p[id].sum; pair.sq += p[id].sq; return; }
    const o = (sum[id] = sum[id] || { seats: 0, wins: 0, points: 0, dealIns: 0, winDiscards: 0, winFaan: 0, selfDraws: 0, winPoints: 0 });
    Object.keys(p[id]).forEach((k) => { o[k] += p[id][k]; });
  }));
  let paired = null;
  if (pair.n > 1) {
    const mean = pair.sum / pair.n;
    const sd = Math.sqrt(Math.max(0, (pair.sq - pair.n * mean * mean) / (pair.n - 1)));
    paired = { deals: pair.n, points: mean, standardError: sd / Math.sqrt(pair.n) };
  }
  Object.keys(sum).forEach((id) => {
    const o = sum[id];
    o.winRate = o.wins / o.seats;
    o.dealInRate = o.dealIns / o.seats;
    o.pointsPerHand = o.points / o.seats;
    o.avgWinDiscards = o.winDiscards / Math.max(1, o.wins);
    o.avgWinFaan = o.winFaan / Math.max(1, o.wins);
    o.avgWinPoints = o.winPoints / Math.max(1, o.wins);
    console.log(id + ': won ' + (100 * o.winRate).toFixed(2) + '% of hands (' + o.avgWinDiscards.toFixed(1) + ' discards, ' +
      o.avgWinFaan.toFixed(2) + ' faan), dealt in ' + (100 * o.dealInRate).toFixed(2) + '%, ' + o.pointsPerHand.toFixed(1) + ' points/hand, ' + Math.round(o.avgWinPoints) + ' points a win');
  });
  if (paired) console.log(lineup[0] + ' less ' + lineup[1] + ': ' + paired.points.toFixed(1) + ' ± ' + paired.standardError.toFixed(1) + ' points a hand (standard error, ' + paired.deals + ' deals)');
  if (a.json) fs.writeFileSync(path.resolve(ROOT, a.json), JSON.stringify({ lineup, deals, summary: sum, paired }, null, 2) + '\n');
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
