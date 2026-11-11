#!/usr/bin/env node
/* Only Orphans against its own lineage, on the native simulator: data, arms,
   staged screens and fresh-deal confirmations, with every result cached.

   The table: only older Only Orphans generations (TABLES below, cycling every
   BLOCK deals). A candidate and the champion each take every seat of the same
   deals, and the gap is read deal by deal.

   What makes it fast:
     - Per-deal rows (lcm-sim play --rows): a model's result on a block of deals
       is played once and kept in ml/oo-night/rows/, keyed by the model's .lcmw
       (its weights and play settings), the table, the deals, the build and the
       simulator binary. The champion's side of a screen is played once a deck,
       whatever the number of arms; a rerun replays nothing.
     - Staged screens: every arm plays the first stage; an arm behind by more
       than --drop standard errors is dropped, and only the best --top go on.
     - Play settings and weight-noise mutations need no training; data is made
       once a round (generate.js keeps finished shards by their key).

   node scripts/ml/oo-night.js screen --arms a.json,b.json --champion ml/models/OS2c1.json --seed S --stages 8000,16000,16000
   node scripts/ml/oo-night.js confirm --arm a.json --champion ... --seed S --deals 40000   (exact build)
   node scripts/ml/oo-night.js mutate --from X.json --sigma 0.05 --seed 1 --name N
   node scripts/ml/oo-night.js setting --from X.json --name N --winBonus 1000 [--claimMargin 50]
   node scripts/ml/oo-night.js rows-stats --model X.json --seed S --deals N   (one model's own numbers) */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const N = require('./native.js');

const ROOT = path.join(__dirname, '..', '..');
const EXE = process.platform === 'win32' ? '.exe' : '';
const SIM = { fast: path.join(ROOT, 'native', 'build', 'lcm-sim' + EXE), exact: path.join(ROOT, 'native', 'build', 'lcm-sim-exact' + EXE) };
const DIR = path.join(ROOT, 'ml', 'oo-night');
const ROWS = path.join(DIR, 'rows');
const BLOCK = 250;   // deals a block: the unit of caching and of work
const COLS = 6;      // points, wins, deal-ins, win points, win faan, self-draws (over a deal's 4 seats)

// The evaluation tables: older generations only (before OS2c1), weighted toward the recent ones.
// Block b of a deck plays TABLES[b % TABLES.length].
const TABLES = [
  ['OT11d', 'OT7c', 'OT6e'],
  ['OT11d', 'OT5e', 'OT2d'],
  ['OT7c', 'OT4a', 'OT1a'],
  ['OT11d', 'OT6e', 'OL2c'],
];
const poolFile = (name) => path.join(ROOT, 'ml', 'models', name + '.json');

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
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const simSum = {};
const simHash = (build) => simSum[build] || (simSum[build] = sha(fs.readFileSync(SIM[build])).slice(0, 16));

// A model's native id (oo:<lcmw>), converted once and cached by content.
function oo(file) {
  const id = N.nativeId('oo:' + path.resolve(ROOT, file));
  if (!id) throw new Error("oo-night: can't play " + file + ' natively (build native/, check the pin)');
  return id;
}

// Run up to `workers` tasks at once (each returns a promise).
function pool(tasks, workers) {
  let next = 0, done = 0;
  const out = new Array(tasks.length);
  return new Promise((resolve, reject) => {
    if (!tasks.length) return resolve(out);
    const start = () => {
      if (next >= tasks.length) return;
      const k = next++;
      tasks[k]().then((v) => { out[k] = v; done++; if (done === tasks.length) resolve(out); else start(); }, reject);
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) start();
  });
}

const stats = { played: 0, cached: 0, seconds: 0 };

// One model's rows on one block (cached).
function blockTask(modelId, seed, b, build) {
  const table = TABLES[b % TABLES.length].map((n) => oo(poolFile(n)));
  const key = sha(JSON.stringify([path.basename(modelId), table.map((t) => path.basename(t)), seed, b, BLOCK, build, simHash(build)])).slice(0, 24);
  const file = path.join(ROWS, key + '.bin');
  return () => {
    if (fs.existsSync(file)) { stats.cached++; return Promise.resolve(readRows(file)); }
    fs.mkdirSync(ROWS, { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const p = spawn(SIM[build], ['play', '--models', modelId, '--table', table.join(','), '--seed', String(seed),
        '--from', String(b * BLOCK), '--to', String((b + 1) * BLOCK), '--rows', tmp], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
      let e = '';
      p.stderr.on('data', (d) => (e += d));
      p.on('exit', (c) => {
        if (c) return reject(new Error('lcm-sim play: ' + e));
        fs.renameSync(tmp, file);
        stats.played++; stats.seconds += (Date.now() - t0) / 1000;
        resolve(readRows(file));
      });
    });
  };
}
function readRows(file) {
  const b = fs.readFileSync(file);
  return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

// Rows for several models over blocks [b0, b1) of a deck: { file: Float64Array(deals * COLS) }.
// The same with the first file as the champion and the rest read as its shadows
// (lcm-sim shadow): one process a block plays the champion's hands, and each arm's
// only where it chose otherwise. Each model's rows are cached as play's would be.
const rowsKey = (modelId, seed, b, build) => {
  const table = TABLES[b % TABLES.length].map((n) => oo(poolFile(n)));
  return path.join(ROWS, sha(JSON.stringify([path.basename(modelId), table.map((t) => path.basename(t)), seed, b, BLOCK, build, simHash(build)])).slice(0, 24) + '.bin');
};
const replayStats = { hands: 0, replays: 0 };
function shadowTask(ids, seed, b, build) {
  const files = ids.map((id) => rowsKey(id, seed, b, build));
  return () => {
    const need = ids.map((id, m) => m > 0 && !fs.existsSync(files[m]));
    if (!need.some(Boolean)) {
      if (fs.existsSync(files[0])) { stats.cached += ids.length; return Promise.resolve(files.map(readRows)); }
      return blockTask(ids[0], seed, b, build)().then((r0) => [r0].concat(files.slice(1).map(readRows)));
    }
    const arms = ids.filter((id, m) => need[m]);
    const table = TABLES[b % TABLES.length].map((n) => oo(poolFile(n)));
    fs.mkdirSync(ROWS, { recursive: true });
    const tmp = path.join(ROWS, 'shadow-' + process.pid + '-' + b + '-' + Math.random().toString(36).slice(2) + '.tmp');
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const p = spawn(SIM[build], ['shadow', '--champion', ids[0], '--shadows', arms.join(','), '--table', table.join(','), '--seed', String(seed),
        '--from', String(b * BLOCK), '--to', String((b + 1) * BLOCK), '--rows', tmp], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let e = '', o = '';
      p.stdout.on('data', (d) => (o += d));
      p.stderr.on('data', (d) => (e += d));
      p.on('exit', (c) => {
        if (c) return reject(new Error('lcm-sim shadow: ' + e));
        const all = readRows(tmp);
        fs.unlinkSync(tmp);
        const M = 1 + arms.length, per = BLOCK * COLS;
        const part = (m) => { const r = new Float64Array(per); for (let d = 0; d < BLOCK; d++) r.set(all.subarray((d * M + m) * COLS, (d * M + m + 1) * COLS), d * COLS); return r; };
        const write = (file, r) => { const t = file + '.' + process.pid + '.tmp'; fs.writeFileSync(t, Buffer.from(r.buffer)); fs.renameSync(t, file); };
        if (!fs.existsSync(files[0])) write(files[0], part(0));
        arms.forEach((id, k) => write(files[ids.indexOf(id)], part(k + 1)));
        const js = JSON.parse(o);
        replayStats.hands += js.hands * arms.length; replayStats.replays += js.replays.reduce((t, x) => t + x, 0);
        stats.played += M; stats.seconds += (Date.now() - t0) / 1000;
        resolve(files.map(readRows));
      });
    });
  };
}

async function rowsFor(files, seed, b0, b1, build, workers, useShadow) {
  if (useShadow && files.length > 1) {
    const ids = files.map(oo);
    const tasks = [];
    for (let b = b0; b < b1; b++) tasks.push(shadowTask(ids, seed, b, build));
    const outs = await pool(tasks, workers);
    const res = files.map(() => new Float64Array((b1 - b0) * BLOCK * COLS));
    outs.forEach((rs, k) => rs.forEach((r, m) => res[m].set(r, k * BLOCK * COLS)));
    return res;
  }
  const tasks = [], where = [];
  files.forEach((f, m) => { const id = oo(f); for (let b = b0; b < b1; b++) { tasks.push(blockTask(id, seed, b, build)); where.push([m, b]); } });
  const outs = await pool(tasks, workers);
  const res = files.map(() => new Float64Array((b1 - b0) * BLOCK * COLS));
  outs.forEach((r, k) => { const [m, b] = where[k]; res[m].set(r, (b - b0) * BLOCK * COLS); });
  return res;
}

// One model's numbers from its rows (a hand = one seat of one deal).
function summary(r) {
  const n = r.length / COLS;
  let pts = 0, w = 0, di = 0, wp = 0, wf = 0, sd = 0, sq = 0;
  for (let d = 0; d < n; d++) {
    const o = d * COLS;
    pts += r[o]; w += r[o + 1]; di += r[o + 2]; wp += r[o + 3]; wf += r[o + 4]; sd += r[o + 5];
    sq += (r[o] / 4) * (r[o] / 4);
  }
  const hands = 4 * n, mean = pts / hands;
  return { deals: n, points: mean, pointsSE: Math.sqrt(Math.max(0, sq / n - mean * mean) / n), wins: w / hands, dealIns: di / hands,
    averageWin: wp / Math.max(1, w), averageFaan: wf / Math.max(1, w), selfDraws: sd / Math.max(1, w) };
}
// The paired gap a - b, deal by deal (per hand).
function gap(a, b) {
  const n = a.length / COLS;
  let s = 0, sq = 0, ws = 0, wsq = 0, ds = 0, dsq = 0, same = 0;
  for (let d = 0; d < n; d++) {
    const o = d * COLS;
    const g = (a[o] - b[o]) / 4, w = (a[o + 1] - b[o + 1]) / 4, di = (a[o + 2] - b[o + 2]) / 4;
    s += g; sq += g * g; ws += w; wsq += w * w; ds += di; dsq += di * di;
    if (a[o] === b[o] && a[o + 1] === b[o + 1]) same++;
  }
  const m = s / n, wm = ws / n, dm = ds / n;
  return { deals: n, points: m, se: Math.sqrt(Math.max(0, sq / n - m * m) / n), wins: wm, winsSE: Math.sqrt(Math.max(0, wsq / n - wm * wm) / n),
    dealIns: dm, dealInsSE: Math.sqrt(Math.max(0, dsq / n - dm * dm) / n), sameDeals: same / n };
}

const fmt = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const pct = (x, d = 2) => (100 * x).toFixed(d) + '%';
function line(name, s, g) {
  return name + ': ' + s.points.toFixed(1) + ' a hand, wins ' + pct(s.wins) + ', deal-ins ' + pct(s.dealIns) + ', average win ' + s.averageWin.toFixed(0) +
    (g ? ' | gap ' + fmt(g.points) + ' ± ' + g.se.toFixed(1) + ' (z ' + (g.points / g.se).toFixed(2) + '), wins ' + fmt(100 * g.wins, 2) + ' ± ' + (100 * g.winsSE).toFixed(2) +
      ' pp, deal-ins ' + fmt(100 * g.dealIns, 2) + ' ± ' + (100 * g.dealInsSE).toFixed(2) + ' pp, identical deals ' + pct(g.sameDeals, 0) : '');
}

// Staged screen: every arm against the champion on the same deck.
async function screen(arms, champion, seed, stages, opt) {
  const workers = opt.workers || 10, build = opt.build || 'fast', drop = opt.drop == null ? 1 : opt.drop, top = opt.top || 4;
  const alive = arms.map((f) => ({ file: f, name: path.basename(f, '.json'), alive: true }));
  let b = 0;
  const champRows = [];
  const armRows = alive.map(() => []);
  const t0 = Date.now();
  const log = [];
  for (let k = 0; k < stages.length; k++) {
    const nb = Math.round(stages[k] / BLOCK), b1 = b + nb;
    const live = alive.filter((a) => a.alive);
    const files = [champion].concat(live.map((a) => a.file));
    const res = await rowsFor(files, seed, b, b1, build, workers, opt.shadow !== false);
    champRows.push(res[0]);
    live.forEach((a, i) => armRows[alive.indexOf(a)].push(res[i + 1]));
    b = b1;
    const cat = (parts) => { const out = new Float64Array(parts.reduce((t, p) => t + p.length, 0)); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; };
    const C = cat(champRows);
    live.forEach((a) => {
      const R = cat(armRows[alive.indexOf(a)]);
      a.summary = summary(R); a.gap = gap(R, C);
    });
    // Drop the clearly behind; after the stage, at most `top` go on.
    live.forEach((a) => { if (a.gap.points < -drop * a.gap.se) a.alive = false; });
    if (k < stages.length - 1) {
      // Ranked by z, arms whose hands won fall by more than a standard error last (they can't be kept).
      // The Pareto rule: the better of the two z (points, hands won) when the other is not down by more than one standard error.
      const rank = (x) => { const zp = x.gap.points / x.gap.se, zw = x.gap.wins / Math.max(1e-9, x.gap.winsSE); return zp > -1 && zw > -1 ? Math.max(zp, zw) : Math.min(zp, zw) - 100; };
      const still = alive.filter((a) => a.alive).sort((p, q) => rank(q) - rank(p));
      still.slice(top).forEach((a) => (a.alive = false, a.cut = true));
    }
    const cs = summary(C);
    const msg = ['Stage ' + (k + 1) + ' (' + (b * BLOCK) + ' deals from seed ' + seed + ', ' + build + '): ' + line('champion ' + path.basename(champion, '.json'), cs)]
      .concat(live.map((a) => '  ' + line(a.name, a.summary, a.gap) + (a.alive ? '' : a.cut ? ' [cut: not in the top ' + top + ']' : ' [dropped]')));
    msg.forEach((m) => console.log(m));
    log.push(...msg);
  }
  const secs = (Date.now() - t0) / 1000;
  console.log('Screen: ' + secs.toFixed(0) + ' s; blocks played ' + stats.played + ', from the cache ' + stats.cached +
    (replayStats.hands ? '; shadow hands replayed ' + replayStats.replays + ' of ' + replayStats.hands + ' (' + (100 * replayStats.replays / replayStats.hands).toFixed(0) + '%)' : ''));
  return { seed, stages, build, champion: summary(cat2(champRows)), seconds: secs, played: stats.played, cached: stats.cached,
    arms: alive.map((a) => ({ name: a.name, file: path.relative(ROOT, a.file), alive: a.alive, summary: a.summary, gap: a.gap })), log };
}
function cat2(parts) { const out = new Float64Array(parts.reduce((t, p) => t + p.length, 0)); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; }

// Weight noise: each layer's weights and biases get Gaussian noise of sigma times that layer's own spread.
function mutate(from, sigma, seed, name) {
  const W = require('./weights.js');
  const w = JSON.parse(JSON.stringify(W.readWeights(path.resolve(ROOT, from))));
  let s = (seed * 2654435761 + 12345) >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const dec = (v) => { const b = Buffer.from(v, 'base64'); const o = new Float32Array(b.length / 2); for (let j = 0; j < o.length; j++) o[j] = half2f(b[2 * j] | (b[2 * j + 1] << 8)); return o; };
  const enc = (a) => { const b = Buffer.alloc(a.length * 2); for (let j = 0; j < a.length; j++) { const h = f2half(a[j]); b[2 * j] = h & 255; b[2 * j + 1] = h >> 8; } return b.toString('base64'); };
  if (w.dtype !== 'f16') throw new Error('mutate: f16 weights only');
  w.layers.forEach((l) => {
    ['w', 'b'].forEach((k) => {
      const a = dec(l[k]);
      let m = 0, q = 0;
      for (const x of a) { m += x; q += x * x; }
      m /= a.length; const sd = Math.sqrt(Math.max(1e-12, q / a.length - m * m));
      for (let j = 0; j < a.length; j++) a[j] += sigma * sd * gauss();
      l[k] = enc(a);
    });
  });
  w.meta = Object.assign({}, w.meta, { name, arm: 'noise ' + sigma + ' seed ' + seed, from: (w.meta || {}).name });
  const out = path.join(ROOT, 'ml', 'models', name + '.json');
  fs.writeFileSync(out, JSON.stringify(w));
  return out;
}
function half2f(h) {
  const sign = h & 0x8000 ? -1 : 1, exp = (h >> 10) & 0x1f, frac = h & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function f2half(v) {
  f32[0] = v; const x = u32[0];
  const sign = (x >>> 16) & 0x8000; let exp = ((x >>> 23) & 0xff) - 127 + 15; let mant = x & 0x7fffff;
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) { if (exp < -10) return sign; mant |= 0x800000; const shift = 14 - exp; let h = mant >> shift; if ((mant >> (shift - 1)) & 1) h++; return sign | h; }
  let h = sign | (exp << 10) | (mant >> 13);
  if (mant & 0x1000) h++;  // round half up
  return h;
}

// A blend: base + alpha * (mean of others - base), layer by layer (a model soup when alpha is 1).
// The play settings are base's.
function blend(baseFile, others, alpha, name) {
  const W = require('./weights.js');
  const base = JSON.parse(JSON.stringify(W.readWeights(path.resolve(ROOT, baseFile))));
  const os = others.map((o) => W.readWeights(path.resolve(ROOT, o)));
  const dec = (v) => { const b = Buffer.from(v, 'base64'); const o = new Float32Array(b.length / 2); for (let j = 0; j < o.length; j++) o[j] = half2f(b[2 * j] | (b[2 * j + 1] << 8)); return o; };
  const enc = (a) => { const b = Buffer.alloc(a.length * 2); for (let j = 0; j < a.length; j++) { const h = f2half(a[j]); b[2 * j] = h & 255; b[2 * j + 1] = h >> 8; } return b.toString('base64'); };
  base.layers.forEach((l, i) => ['w', 'b'].forEach((k) => {
    const a = dec(l[k]);
    const ms = os.map((o) => dec(o.layers[i][k]));
    for (let j = 0; j < a.length; j++) { let m = 0; for (const x of ms) m += x[j]; m /= ms.length; a[j] = a[j] + alpha * (m - a[j]); }
    l[k] = enc(a);
  }));
  base.meta = Object.assign({}, base.meta, { name, arm: 'blend ' + alpha + ' toward ' + others.map((o) => path.basename(o, '.json')).join('+'), from: (base.meta || {}).name });
  const out = path.join(ROOT, 'ml', 'models', name + '.json');
  fs.writeFileSync(out, JSON.stringify(base));
  return out;
}

// A play setting: the same weights with other meta.play values.
function setting(from, name, play) {
  const W = require('./weights.js');
  const w = JSON.parse(JSON.stringify(W.readWeights(path.resolve(ROOT, from))));
  w.meta = Object.assign({}, w.meta, { name, arm: JSON.stringify(play), from: (w.meta || {}).name });
  w.meta.play = Object.assign({}, w.meta.play, play);
  const out = path.join(ROOT, 'ml', 'models', name + '.json');
  fs.writeFileSync(out, JSON.stringify(w));
  return out;
}

module.exports = { blend, replayStats, screen, mutate, setting, rowsFor, summary, gap, TABLES, BLOCK, stats, line };

if (require.main === module) {
  (async () => {
    const a = parseArgs(process.argv.slice(2));
    const cmd = a._[0];
    const workers = parseInt(a.workers || 10, 10);
    if (cmd === 'screen' || cmd === 'confirm') {
      const arms = String(a.arms || a.arm).split(',').map((f) => path.resolve(ROOT, f));
      const champion = path.resolve(ROOT, a.champion || 'ml/models/OS2c1.json');
      const stages = cmd === 'confirm' ? [parseInt(a.deals || 40000, 10)] : String(a.stages || '8000,16000,16000').split(',').map(Number);
      const res = await screen(arms, champion, parseInt(a.seed, 10), stages, { workers, build: cmd === 'confirm' ? 'exact' : (a.build || 'fast'), drop: a.drop != null ? parseFloat(a.drop) : 1, top: parseInt(a.top || 4, 10) });
      if (a.out) { fs.mkdirSync(path.dirname(path.resolve(ROOT, a.out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, a.out), JSON.stringify(res, null, 1)); }
    } else if (cmd === 'mutate') {
      console.log(mutate(a.from, parseFloat(a.sigma), parseInt(a.seed, 10), a.name));
    } else if (cmd === 'blend') {
      console.log(blend(a.from, String(a.toward).split(','), parseFloat(a.alpha), a.name));
    } else if (cmd === 'setting') {
      const play = {};
      if (a.winBonus != null) play.winBonus = parseFloat(a.winBonus);
      if (a.claimMargin != null) play.claimMargin = parseFloat(a.claimMargin);
      console.log(setting(a.from, a.name, play));
    } else {
      console.error('usage: see the top of scripts/ml/oo-night.js');
      process.exit(2);
    }
  })().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}

/* ---------------- The round driver ----------------

   node scripts/ml/oo-night.js round [--recipes ...]
   State in ml/oo-night/state.json: the champion, the seed counters (no deck is
   ever played twice for a judgment), and every round's arms and results. */
const STATE = path.join(DIR, 'state.json');
const SEEDS = { data: 1201000000, screen: 1500000000, confirm: 2500000000 };
const OLD = ['OT11d', 'OT7c', 'OT6e', 'OT5e', 'OT4a', 'OT2d', 'OT1a'];
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {
    return { champion: 'ml/models/OS2c1.json', lineage: ['OS2c1'], next: { data: 2, screen: 1, confirm: 0 }, rounds: [] };
  }
}
const saveState = (s) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); };
function run(cmd, args, logFile) {
  const { spawnSync } = require('node:child_process');
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (logFile) fs.appendFileSync(logFile, (r.stdout || '') + (r.stderr || ''));
  if (r.status) throw new Error(cmd + ' ' + args.slice(0, 4).join(' ') + ' exited with ' + r.status + '\n' + (r.stderr || '').slice(-2000));
  return (Date.now() - t0) / 1000;
}
const PY = path.join(ROOT, 'ml', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

module.exports.loadState = loadState;
module.exports.saveState = saveState;
module.exports.run = run;
module.exports.PY = PY;
module.exports.SEEDS = SEEDS;
module.exports.OLD = OLD;
