#!/usr/bin/env node
/* Neural Cat's overnight loop: native data against a pool of its own past
   generations, several arms trained in one GPU pass (ml/nc_multi.py),
   weight-noise mutations and play settings, a cached, batched and pruned
   screen, and a confirmation on fresh deals on the exact build.

   node scripts/ml/nc-overnight.js gen --deals 50000            one data set (cached by its settings)
   node scripts/ml/nc-overnight.js round --spec spec.json       a whole round (see roundSpec below)
   node scripts/ml/nc-overnight.js screen --cands a.json,b.json [--deals 40000]
   node scripts/ml/nc-overnight.js confirm --cand a.json [--deals 40000]
   node scripts/ml/nc-overnight.js mutate --from a.json --sigma 0.02 --seed 1 --name X
   node scripts/ml/nc-overnight.js status

   Only Neural Cats sit at the table: in the data, the learner (the champion,
   exploring) against the pool (ml/models/pool: NC9, NC8, NC7, NC5, NC3, and
   every champion this loop makes); in evaluation, a model in one seat and
   the table (--table, default NC9, NC8, NC5) in the other three, every seat
   of every deal, the candidate and the champion on the same deals (paired).

   What makes it fast:
   - everything plays on the native simulator (lcm-sim), 10 processes;
   - a screen plays the champion once for all candidates (lcm-sim play takes
     several models, each independent of the others), and every model's
     per-deal results are cached by (model contents, table, build, deals), so
     nothing is ever played twice;
   - screens look every --look deals and drop a candidate that is clearly
     behind (its points 2 standard errors under the champion's) or clearly
     beaten by another candidate;
   - data sets are cached by their settings (generate.js's shard keys), and a
     trained arm by its settings and data;
   - every training arm of a round shares one load of the data and one pass
     over it on the GPU.

   Seeds: data from 1,300,000,000 and evaluations from 3,000,000,000 up,
   counters in the state, never reused. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const N = require('./native.js');
const W = require('./weights.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'ml', 'overnight', 'neural-cat');
const WORK = path.join(OUT, 'work');
const STATE = path.join(WORK, 'state.json');
const CACHE = path.join(WORK, 'cache', 'play');
const PY = path.join(ROOT, 'ml', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const EXE = process.platform === 'win32' ? '.exe' : '';
const SIM = { fast: path.join(ROOT, 'native', 'build', 'lcm-sim' + EXE), exact: path.join(ROOT, 'native', 'build', 'lcm-sim-exact' + EXE) };
const WORKERS = 8;  // 8 while the orchestrator runs a benchmark compare in this worktree
const PIECE = 250;            // deals a process plays, the unit of the cache
const WIN_W = 0;              // the screen ranks on points; wins are a guard

fs.mkdirSync(CACHE, { recursive: true });

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
  fs.appendFileSync(path.join(WORK, 'loop.log'), text + '\n');
}

const rel = (f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/');
const shaOf = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const fileSha = (f) => shaOf(fs.readFileSync(path.resolve(ROOT, f)));
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));
const nameOf = (f) => path.basename(f, '.json');

function loadState() {
  if (fs.existsSync(STATE)) return readJson(STATE);
  return {
    seeds: { data: 1300000000, eval: 3000000000 },
    champion: 'ml/models/pool/NC9.json',
    championName: 'NC9',
    reference: 'ml/models/pool/NC9.json',
    pool: ['ml/models/pool/NC9.json', 'ml/models/pool/NC8.json', 'ml/models/pool/NC7.json', 'ml/models/pool/NC5.json', 'ml/models/pool/NC3.json'],
    table: ['ml/models/pool/NC9.json', 'ml/models/pool/NC8.json', 'ml/models/pool/NC5.json'],
    datasets: [],
    trained: {},
    rounds: [],
    timings: [],
  };
}
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); }
function takeSeed(state, kind, n) { const s = state.seeds[kind]; state.seeds[kind] += n; saveState(state); return s; }
function timing(state, stage, seconds, extra) {
  state.timings.push(Object.assign({ stage, seconds: +seconds.toFixed(1), at: new Date().toISOString() }, extra || {}));
  saveState(state);
}

/* ---------------- playing ---------------- */

const simIds = new Map();
function simId(file) {
  const key = path.resolve(ROOT, file) + ':' + fileSha(file);
  if (!simIds.has(key)) {
    const id = N.nativeId('nc:' + path.resolve(ROOT, file));
    if (!id) throw new Error(file + " can't play natively (the pin is stale?)");
    simIds.set(key, id);
  }
  return simIds.get(key);
}

function runSim(build, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(SIM[build], args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => (code ? reject(new Error('lcm-sim ' + args[0] + ' exited ' + code + ': ' + err)) : resolve(out)));
  });
}

// Per-deal rows (4 float32s a deal: points a hand over the 4 seats, wins, deal-ins,
// winning points) of each model on deals [seed, seed + deals), from the cache or played.
// With half: also each model's half-spicy points a hand per deal (rows.half, cached as .h4).
async function playRows(models, table, seed, deals, build, half) {
  const tableKey = shaOf(table.map(fileSha).join(','));
  const shas = models.map(fileSha);
  const pieces = [];
  for (let from = 0; from < deals; from += PIECE) pieces.push([from, Math.min(deals, from + PIECE)]);
  const cacheFile = (m, p) => path.join(CACHE, build + '-' + tableKey + '-' + seed + '-' + p[0] + '-' + p[1] + '-' + shas[m] + '.f4');
  const tasks = [];
  let played = 0, cached = 0;
  pieces.forEach((p) => {
    const need = models.map((_, m) => m).filter((m) => !fs.existsSync(cacheFile(m, p)) || (half && !fs.existsSync(cacheFile(m, p).replace(/\.f4$/, '.h4'))));
    cached += models.length - need.length;
    if (!need.length) return;
    played += need.length;
    tasks.push(async () => {
      const tmp = path.join(CACHE, 'tmp-' + process.pid + '-' + seed + '-' + p[0] + '-' + Math.random().toString(36).slice(2) + '.f4');
      await runSim(build, ['play', '--models', need.map((m) => simId(models[m])).join(','), '--table', table.map(simId).join(','),
        '--seed', String(seed), '--from', String(p[0]), '--to', String(p[1]), '--per-deal', tmp].concat(half ? ['--per-deal-half', tmp + '.h'] : []));
      const buf = fs.readFileSync(tmp);
      const n = p[1] - p[0], k = need.length;
      if (buf.length !== n * k * 16) throw new Error('per-deal file has ' + buf.length + ' bytes, expected ' + n * k * 16);
      const all = new Float32Array(buf.buffer, buf.byteOffset, n * k * 4);
      need.forEach((m, j) => {
        const rows = new Float32Array(n * 4);
        for (let d = 0; d < n; d++) for (let c = 0; c < 4; c++) rows[d * 4 + c] = all[(d * k + j) * 4 + c];
        fs.writeFileSync(cacheFile(m, p), Buffer.from(rows.buffer));
      });
      fs.unlinkSync(tmp);
      if (half) {
        const hb = fs.readFileSync(tmp + '.h');
        const ha = new Float32Array(hb.buffer, hb.byteOffset, n * k);
        need.forEach((m, j) => {
          const rows = new Float32Array(n);
          for (let d = 0; d < n; d++) rows[d] = ha[d * k + j];
          fs.writeFileSync(cacheFile(m, p).replace(/\.f4$/, '.h4'), Buffer.from(rows.buffer));
        });
        fs.unlinkSync(tmp + '.h');
      }
    });
  });
  await N.pool(tasks, WORKERS);
  const rows = models.map((_, m) => {
    const out = new Float32Array(deals * 4);
    pieces.forEach((p) => { const b = fs.readFileSync(cacheFile(m, p)); out.set(new Float32Array(b.buffer, b.byteOffset, (p[1] - p[0]) * 4), p[0] * 4); });
    return out;
  });
  const halves = half ? models.map((_, m) => {
    const out = new Float32Array(deals);
    pieces.forEach((p) => { const b = fs.readFileSync(cacheFile(m, p).replace(/\.f4$/, '.h4')); out.set(new Float32Array(b.buffer, b.byteOffset, p[1] - p[0]), p[0]); });
    return out;
  }) : null;
  return { rows, played, cached, halves };
}

function summary(rows, n) {
  let pts = 0, wins = 0, ins = 0, wp = 0;
  for (let d = 0; d < n; d++) { pts += rows[d * 4]; wins += rows[d * 4 + 1]; ins += rows[d * 4 + 2]; wp += rows[d * 4 + 3]; }
  return { points: pts / n, winRate: wins / (4 * n), dealInRate: ins / (4 * n), avgWin: wins ? wp / wins : 0 };
}

function paired(a, b, n) {
  let s = 0, q = 0, sw = 0, qw = 0, si = 0, qi = 0;
  for (let d = 0; d < n; d++) {
    const x = a[d * 4] - b[d * 4], w = (a[d * 4 + 1] - b[d * 4 + 1]) / 4, i = (a[d * 4 + 2] - b[d * 4 + 2]) / 4;
    s += x; q += x * x; sw += w; qw += w * w; si += i; qi += i * i;
  }
  const m = s / n, mw = sw / n, mi = si / n;
  const se = (q2, m2) => Math.sqrt(Math.max(0, q2 / n - m2 * m2) / (n - 1));
  return { n, points: m, se: se(q, m), wins: mw, winSe: se(qw, mw), dealIns: mi, dealInSe: se(qi, mi) };
}

function pairedHalf(a, b, n) {
  let s = 0, q = 0, sa = 0;
  for (let d = 0; d < n; d++) { const x = a[d] - b[d]; s += x; q += x * x; sa += a[d]; }
  const m = s / n;
  return { points: m, se: Math.sqrt(Math.max(0, q / n - m * m) / (n - 1)), self: sa / n };
}

const f1 = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
const pc = (x) => (100 * x).toFixed(2) + '%';
function line(name, p, s, c) {
  return name + ': ' + f1(p.points) + ' ± ' + p.se.toFixed(1) + ' points a hand (z ' + (p.points / p.se).toFixed(2) + '), wins ' + pc(s.winRate) + ' vs ' + pc(c.winRate) +
    ' (' + f1(100 * p.wins) + ' ± ' + (100 * p.winSe).toFixed(2) + ' pp), deal-ins ' + pc(s.dealInRate) + ' vs ' + pc(c.dealInRate) +
    ', average win ' + Math.round(s.avgWin) + ' vs ' + Math.round(c.avgWin) + ', ' + p.n + ' deals';
}

// The screen: every candidate and the champion on the same fresh deals, looked at
// every `look` deals; a candidate is dropped once it's 2 standard errors behind
// the champion or behind the best candidate's lower bound.
async function screen(state, cands, opts) {
  const champ = opts.champion || state.champion;
  const table = opts.table || state.table;
  const deals = opts.deals || 40000, look = opts.look || 10000, minDeals = opts.minDeals || 10000;
  const seed = opts.seed || takeSeed(state, 'eval', deals);
  const t0 = Date.now();
  let live = cands.slice();
  const res = {};
  let played = 0, cached = 0, at = 0;
  log('Screen of ' + cands.map(nameOf).join(', ') + ' against ' + nameOf(champ) + ' at ' + table.map(nameOf).join(', ') + ', up to ' + deals + ' deals from seed ' + seed + ' (' + (opts.build || 'fast') + ')');
  while (at < deals && live.length) {
    at = Math.min(deals, at + look);
    const r = await playRows([champ].concat(live), table, seed, at, opts.build || 'fast', opts.half);
    played += r.played; cached += r.cached;
    const cs = summary(r.rows[0], at);
    live.forEach((c, k) => {
      const p = paired(r.rows[k + 1], r.rows[0], at);
      res[c] = { name: nameOf(c), file: rel(c), pair: p, self: summary(r.rows[k + 1], at), champ: cs, deals: at,
        half: r.halves ? pairedHalf(r.halves[k + 1], r.halves[0], at) : null };
    });
    const best = Math.max(...live.map((c) => res[c].pair.points - 2 * res[c].pair.se));
    // Past half the budget, a candidate behind the champion can't plausibly be confirmed either.
    // A candidate whose hands won are up 2 SE stays (the Pareto rule's other leg) unless its points are 2 SE down.
    const winsUp = (c) => res[c].pair.wins >= 2 * res[c].pair.winSe && res[c].pair.points + 2 * res[c].pair.se >= 0;
    const drop = at >= minDeals ? live.filter((c) => !winsUp(c) && (res[c].pair.points + 2 * res[c].pair.se < Math.max(0, best) || (at >= deals / 2 && res[c].pair.points < 0))) : [];
    drop.forEach((c) => { res[c].dropped = at; });
    live = live.filter((c) => drop.indexOf(c) === -1);
    log('  ' + at + ' deals: ' + Object.values(res).filter((x) => x.deals === at).map((x) => x.name + ' ' + f1(x.pair.points) + '±' + x.pair.se.toFixed(1) + (x.dropped ? ' (dropped)' : '')).join(', '));
  }
  const secs = (Date.now() - t0) / 1000;
  timing(state, 'screen', secs, { candidates: cands.length, deals, played, cached });
  Object.values(res).sort((a, b) => b.pair.points - a.pair.points).forEach((x) => log('  ' + line(x.name, x.pair, x.self, x.champ) +
    (x.half ? ', half spicy ' + f1(x.half.points) + ' +- ' + x.half.se.toFixed(2) + ' (' + x.half.self.toFixed(1) + ' a hand)' : '')));
  log('  screen took ' + secs.toFixed(0) + 's (' + played + ' model-pieces played, ' + cached + ' from the cache)');
  return { seed, deals, results: res, seconds: secs };
}

// The confirmation: fresh deals, the exact build, paired against the champion.
// Several candidates may share one confirmation (the champion is played once); each is judged on its own.
async function confirm(state, cand, opts) {
  const all = await confirmMany(state, [cand], opts);
  return all[0];
}
async function confirmMany(state, cands, opts) {
  const deals = opts.deals || 40000;
  const champ = opts.champion || state.champion;
  const table = opts.table || state.table;
  const seed = opts.seed || takeSeed(state, 'eval', deals);
  const t0 = Date.now();
  log('Confirm ' + cands.map(nameOf).join(', ') + ' against ' + nameOf(champ) + ' on ' + deals + ' fresh deals from seed ' + seed + ' (exact)');
  const r = await playRows([champ].concat(cands), table, seed, deals, 'exact', opts.half);
  const secs = (Date.now() - t0) / 1000;
  timing(state, 'confirm', secs, { deals, candidates: cands.length });
  return cands.map((cand, k) => {
    const j = judge(cand, r.rows[k + 1], r.rows[0], deals, seed, secs);
    if (r.halves) { j.half = pairedHalf(r.halves[k + 1], r.halves[0], deals); log('    half spicy: ' + f1(j.half.points) + ' +- ' + j.half.se.toFixed(2) + ' points a hand (' + j.half.self.toFixed(1) + ' a hand)'); }
    return j;
  });
}
function judge(cand, rowsC, rowsChamp, deals, seed, secs) {
  const p = paired(rowsC, rowsChamp, deals);
  const s = summary(rowsC, deals), c = summary(rowsChamp, deals);
  // A generation (the Pareto rule): points or hands won up 2 SE, the other not down more than 1 SE,
  // deal-ins not up more than 1 SE. A ship candidate needs points up 3 SE on pooled fresh exact deals.
  const pass = ((p.points >= 2 * p.se && p.wins >= -p.winSe) || (p.wins >= 2 * p.winSe && p.points >= -p.se)) && p.dealIns <= Math.max(0.0025, p.dealInSe);  // deal-ins: up at most 0.25 pp or 1 SE, the larger (orchestrator, 2026-11-11)
  const shipLike = p.points >= 3 * p.se && p.wins >= -p.winSe;
  log('  ' + line(nameOf(cand), p, s, c) + ', deal-in diff ' + (100 * p.dealIns).toFixed(2) + ' +- ' + (100 * p.dealInSe).toFixed(2) + ' pp' +
    (pass ? '  PASS (generation, Pareto 2 SE)' : '  fail') + (shipLike ? ' points 3 SE' : '') + ' (' + secs.toFixed(0) + 's)');
  return { name: nameOf(cand), file: rel(cand), seed, deals, pair: p, self: s, champ: c, pass, shipLike, seconds: secs };
}

/* ---------------- data ---------------- */

// One data set: the champion exploring against the pool, every seat recorded.
function gen(state, opts) {
  const deals = opts.deals || 50000;
  const learners = opts.learners || 4;
  const pool = Array(learners).fill('neural-cat').concat((opts.pool || state.pool).map((f) => 'ml:' + rel(f)));
  const champ = opts.champion || state.champion;
  const key = shaOf(JSON.stringify([deals, pool, fileSha(champ), (opts.pool || state.pool).map(fileSha), opts.temperature || 150, opts.epsilon || 0.05, opts.sample || 0.12, opts.tag || ''].concat(opts.optionReplays ? [opts.optionReplays, opts.options, opts.optionShare, !!opts.crn] : [])));
  const hit = state.datasets.find((d) => d.key === key && fs.existsSync(path.join(ROOT, d.dir, 'manifest.json')));
  if (hit && !opts.fresh) { log('Data ' + hit.dir + ': cached'); return hit.dir; }
  const seed = takeSeed(state, 'data', deals);
  const dir = 'ml/data/nco-' + (state.datasets.length + 1);
  const t0 = Date.now();
  const r = spawnSync('node', ['scripts/ml/generate.js', '--native', '--deals', String(deals), '--lineup', 'mix', '--pool', pool.join(','),
    '--weights', rel(champ), '--temperature', String(opts.temperature || 150), '--epsilon', String(opts.epsilon || 0.05), '--explore', '0',
    '--sample', String(opts.sample || 0.12), '--seed', String(seed), '--workers', String(WORKERS), '--out', dir].concat(
    opts.optionReplays ? ['--option-replays', String(opts.optionReplays), '--options', String(opts.options || 6), '--option-share', String(opts.optionShare || 0.5)] : [],
    opts.crn ? ['--crn'] : []), { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status) throw new Error('generate failed: ' + r.stderr + r.stdout);
  const secs = (Date.now() - t0) / 1000;
  const m = readJson(path.join(dir, 'manifest.json'));
  state.datasets.push({ dir, key, seed, deals, champion: nameOf(champ), pool, samples: m.samples, seconds: secs, options: m.options || null });
  timing(state, 'generate', secs, { deals, samples: m.samples });
  log('Data ' + dir + ': ' + deals + ' deals, ' + m.samples + ' samples in ' + secs.toFixed(0) + 's (' + (deals / secs).toFixed(0) + ' deals/s), learner ' + nameOf(champ) + ' against ' + (opts.pool || state.pool).map(nameOf).join(', '));
  return dir;
}

/* ---------------- candidates ---------------- */

// Arms trained in one GPU pass. Each arm: { name, lr, epochs, patience, dropout,
// weightDecay, seed, init, hidden, ... } (ml/nc_multi.py); its play settings are the champion's.
function trainArms(state, arms, data, from, advData) {
  const play = (readJson(from || state.champion).meta || {}).play;
  const dataKey = data.concat(advData || []).map((d) => shaOf(fs.readFileSync(path.join(ROOT, d, 'manifest.json')))).join(',');
  const todo = [], files = {};
  arms.forEach((a) => {
    const key = shaOf(JSON.stringify([a, dataKey, a.init ? fileSha(a.init) : null]).replace(/"name":"[^"]*",?/, ''));
    const f = 'ml/models/' + a.name + '.json';
    const hit = state.trained[key];
    if (hit && fs.existsSync(path.join(ROOT, hit))) { files[a.name] = hit; log('Arm ' + a.name + ': cached as ' + hit); return; }
    todo.push(Object.assign({}, a, { key }));
    files[a.name] = f;
  });
  if (todo.length) {
    const spec = path.join(WORK, 'arms-' + Date.now() + '.json');
    fs.writeFileSync(spec, JSON.stringify(todo.map((a) => { const b = Object.assign({}, a); delete b.key; return b; })));
    const t0 = Date.now();
    log('Training ' + todo.map((a) => a.name).join(', ') + ' on ' + data.join(', '));
    const r = spawnSync(PY, ['ml/nc_multi.py', '--device-bytes', String(state.deviceBytes || 4e9), '--data'].concat(data, ['--arms', spec], advData && advData.length ? ['--adv-data'].concat(advData) : []), { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    fs.appendFileSync(path.join(WORK, 'train.log'), (r.stdout || '') + (r.stderr || ''));
    if (r.status) throw new Error('nc_multi failed: ' + (r.stderr || '').slice(-3000) + (r.stdout || '').slice(-2000));
    const secs = (Date.now() - t0) / 1000;
    timing(state, 'train', secs, { arms: todo.length });
    (r.stdout || '').split('\n').filter((l) => l.startsWith('ARM ')).forEach((l) => log('  ' + l.slice(4)));
    log('  trained ' + todo.length + ' arms in ' + secs.toFixed(0) + 's');
    todo.forEach((a) => {
      const f = files[a.name];
      const w = readJson(f);
      w.meta.play = Object.assign({}, play);
      w.meta.from = from ? nameOf(from) : state.championName;
      fs.writeFileSync(path.join(ROOT, f), JSON.stringify(w));
      state.trained[a.key] = f;
    });
    saveState(state);
  }
  return arms.map((a) => files[a.name]);
}

// Weight noise: each layer's weights and biases plus sigma x that layer's spread x N(0, 1).
function mutate(from, sigma, seed, name, layers) {
  const w = readJson(from);
  let s = (seed * 2654435761 + 12345) >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const enc = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  w.layers = w.layers.map((l, i) => {
    const wt = W.floats(l.w, w.dtype), b = W.floats(l.b, w.dtype);
    if (layers && layers.indexOf(i) === -1) return { rows: l.rows, cols: l.cols, w: enc(wt), b: enc(b) };
    let m = 0, q = 0;
    for (const v of wt) { m += v; q += v * v; }
    m /= wt.length;
    const sd = Math.sqrt(Math.max(0, q / wt.length - m * m));
    for (let j = 0; j < wt.length; j++) wt[j] += sigma * sd * gauss();
    for (let j = 0; j < b.length; j++) b[j] += sigma * sd * gauss();
    return { rows: l.rows, cols: l.cols, w: enc(wt), b: enc(b) };
  });
  delete w.dtype;  // float32
  w.meta = Object.assign({}, w.meta, { name, mutation: { from: nameOf(from), sigma, seed, layers: layers || 'all' } });
  const f = 'ml/models/' + name + '.json';
  fs.writeFileSync(path.join(ROOT, f), JSON.stringify(w));
  return f;
}

// Output calibration: the last layer's bias of some outputs moved by delta (an outcome
// logit: 0 win by self-draw, 1 win off a discard, 2 deal in, 3 another's self-draw,
// 4 another's win, 5 a draw). The options' expected points move unevenly, so the choice changes.
function bias(from, changes, name) {
  const w = readJson(from);
  const enc = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  w.layers = w.layers.map((l, i) => {
    const wt = W.floats(l.w, w.dtype), b = W.floats(l.b, w.dtype);
    if (i === w.layers.length - 1) changes.forEach((c) => { b[c.out] += c.delta; });
    return { rows: l.rows, cols: l.cols, w: enc(wt), b: enc(b) };
  });
  delete w.dtype;
  w.meta = Object.assign({}, w.meta, { name, bias: { from: nameOf(from), changes } });
  const f = 'ml/models/' + name + '.json';
  fs.writeFileSync(path.join(ROOT, f), JSON.stringify(w));
  return f;
}

// A model soup: the mean of several models' weights (same shapes), the first one's play settings.
function soup(files, name) {
  const ws = files.map(readJson);
  const enc = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const out = JSON.parse(JSON.stringify(ws[0]));
  out.layers = ws[0].layers.map((l, i) => {
    const sw = new Float32Array(l.rows * l.cols), sb = new Float32Array(l.rows);
    ws.forEach((w) => {
      const a = W.floats(w.layers[i].w, w.dtype), b = W.floats(w.layers[i].b, w.dtype);
      for (let j = 0; j < sw.length; j++) sw[j] += a[j] / ws.length;
      for (let j = 0; j < sb.length; j++) sb[j] += b[j] / ws.length;
    });
    return { rows: l.rows, cols: l.cols, w: enc(sw), b: enc(sb) };
  });
  delete out.dtype;
  out.meta = Object.assign({}, ws[0].meta, { name, soup: files.map(nameOf) });
  const f = 'ml/models/' + name + '.json';
  fs.writeFileSync(path.join(ROOT, f), JSON.stringify(out));
  return f;
}

function tune(from, change, name) {
  const w = readJson(from);
  w.meta = Object.assign({}, w.meta, { name, play: Object.assign({}, (w.meta || {}).play, change), tunedFrom: nameOf(from) });
  const f = 'ml/models/' + name + '.json';
  fs.writeFileSync(path.join(ROOT, f), JSON.stringify(w));
  return f;
}

/* ---------------- a chain ---------------- */

// Generations without a judgment between them (critique 2: one step is below what a
// confirmation can see): each link plays its own data (the link exploring against the
// pool), fine-tunes itself on the last `window` sets with `seeds` seeds, and the soup of
// those is the next link. Only the last link (and any asked for) is judged, on fresh deals.
async function chain(state, spec) {
  let cur = spec.start ? path.join(ROOT, spec.start) : path.join(ROOT, state.champion);
  const links = [];
  for (let k = 1; k <= spec.links; k++) {
    const name = spec.name + 'g' + k;
    const t0 = Date.now();
    for (let j = 0; j < (spec.sets || 2); j++) gen(state, { deals: spec.deals || 50000, champion: rel(cur), tag: name + '-' + j, temperature: spec.temperature, epsilon: spec.epsilon });
    const all = state.datasets.map((d) => d.dir).filter((d) => fs.existsSync(path.join(ROOT, d, 'manifest.json')));
    const window = all.slice(-(spec.window || 8));
    const arms = [];
    for (let sd = 1; sd <= (spec.seeds || 3); sd++) arms.push(Object.assign({ name: name + 's' + sd, lr: 1e-4, epochs: 4, patience: 2, dropout: 0.2, weightDecay: 1e-3, hidden: '512,256' }, spec.arm || {}, { seed: sd + 10 * k, init: rel(cur) }));
    const files = trainArms(state, arms, window, rel(cur));
    cur = path.join(ROOT, soup(files, name));
    links.push({ name, file: rel(cur), data: window, seconds: (Date.now() - t0) / 1000 });
    log('Link ' + name + ': soup of ' + files.map(nameOf).join(', ') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
    state.chains = state.chains || [];
    saveState(state);
  }
  (state.chains = state.chains || []).push({ name: spec.name, links });
  saveState(state);
  return links;
}

/* ---------------- a round ---------------- */

// spec: { name: 'R1', data: { deals, sets, window }, arms: [...nc_multi arms, init 'champion' allowed],
//         mutations: [{ sigma, seed, layers }], play: [{ topK: 7 }, ...],
//         screen: { deals, look }, confirm: { deals, top } }
async function round(state, spec) {
  const r = { name: spec.name, champion: state.championName, started: new Date().toISOString(), candidates: [] };
  const t0 = Date.now();
  log('=== Round ' + spec.name + ': champion ' + state.championName);
  const champ = state.champion;
  const cands = [], trained = [];
  if (spec.arms && spec.arms.length) {
    const fresh = [];
    // sets: a count, or a list of per-set settings ({ temperature, epsilon, learners, deals }).
    const sets = Array.isArray(spec.data.sets) ? spec.data.sets : Array(spec.data.sets ?? 1).fill({});
    sets.forEach((o, k) => fresh.push(gen(state, { deals: o.deals || spec.data.deals, tag: spec.name + '-' + k, learners: o.learners || spec.data.learners,
      temperature: o.temperature || spec.data.temperature, epsilon: o.epsilon || spec.data.epsilon,
      optionReplays: o.optionReplays, options: o.options, optionShare: o.optionShare, crn: o.crn })));
    spec.data.advData = (spec.data.advData || []).concat(fresh.filter((d, k) => sets[k].optionReplays));
    const all = state.datasets.map((d) => d.dir).filter((d) => fs.existsSync(path.join(ROOT, d, 'manifest.json')));
    const window = spec.data.window ? all.slice(-spec.data.window) : fresh;
    const arms = spec.arms.map((a) => Object.assign({}, a, { init: a.init === 'champion' ? rel(champ) : a.init }));
    trained.push(...trainArms(state, arms, window, null, spec.data.advData));
    trained.forEach((f) => cands.push(f));
  }
  if (spec.trainOnly) { log('Trained only (--train-only)'); return null; }
  // Soups: of every arm trained this round ("trained") or of named models; optional play changes on top.
  (spec.soups || []).forEach((sp, k) => {
    const of = sp.of === 'trained' ? trained : sp.of.map((x) => (x.endsWith('.json') ? x : 'ml/models/' + x + '.json'));
    let f = soup(of, spec.name + 's' + k);
    if (sp.play) f = tune(f, sp.play, spec.name + 's' + k);
    cands.push(f);
  });
  // Trained arms with play changes on top: { arm: name, play: {...} }.
  (spec.armPlay || []).forEach((ap, k) => cands.push(tune('ml/models/' + ap.arm + '.json', ap.play, spec.name + 'q' + k)));
  (spec.mutations || []).forEach((m, k) => cands.push(mutate(champ, m.sigma, m.seed, spec.name + 'm' + k, m.layers)));
  (spec.play || []).forEach((p, k) => cands.push(tune(champ, p, spec.name + 'p' + k)));
  (spec.bias || []).forEach((b, k) => cands.push(bias(champ, b, spec.name + 'b' + k)));
  (spec.extra || []).forEach((f) => cands.push(f));
  const sc = await screen(state, cands, spec.screen || {});
  r.screen = { seed: sc.seed, seconds: sc.seconds, results: Object.values(sc.results).map((x) => ({ name: x.name, file: x.file, deals: x.deals, dropped: x.dropped || null, pair: x.pair, self: x.self, champ: x.champ })) };
  const conf = spec.confirm || {};
  const top = Object.values(sc.results).filter((x) => !x.dropped && x.pair.points > (conf.minZ || 1) * x.pair.se)
    .sort((a, b) => b.pair.points - a.pair.points).slice(0, conf.top ?? 2);
  r.confirms = [];
  for (const x of top) {
    const c = await confirm(state, path.join(ROOT, x.file), { deals: conf.deals || 40000, half: conf.half });
    r.confirms.push(c);
  }
  const winner = r.confirms.filter((c) => c.pass).sort((a, b) => b.pair.points - a.pair.points)[0];
  if (winner) {
    state.generation = (state.generation || 0) + 1;
    const name = 'G' + state.generation;
    const f = 'ml/models/pool/' + name + '.json';
    const w = readJson(winner.file);
    w.meta = Object.assign({}, w.meta, { name, trainedName: winner.name, overnight: { round: spec.name, confirm: { deals: winner.deals, points: winner.pair.points, se: winner.pair.se } } });
    fs.writeFileSync(path.join(ROOT, f), JSON.stringify(w));
    r.kept = { name, from: winner.name, file: f };
    state.champion = f;
    state.championName = name;
    state.pool.unshift(f);
    log('New champion ' + name + ' (' + winner.name + ')');
  } else log('Nothing kept: ' + state.championName + ' stays');
  r.seconds = (Date.now() - t0) / 1000;
  state.rounds.push(r);
  saveState(state);
  log('=== Round ' + spec.name + ' took ' + r.seconds.toFixed(0) + 's');
  return r;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  const state = loadState();
  saveState(state);
  if (cmd === 'gen') { gen(state, { deals: +a.deals || 50000, tag: a.tag || '', fresh: !!a.fresh }); return; }
  if (cmd === 'screen') {
    const r = await screen(state, String(a.cands).split(','), { deals: +a.deals || 40000, look: +a.look || 10000, build: a.build, champion: a.champion, seed: a.seed ? +a.seed : undefined, half: !!a.half });
    fs.writeFileSync(path.join(WORK, 'screen-' + Date.now() + '.json'), JSON.stringify(r, null, 1));
    return;
  }
  if (cmd === 'confirm') { const r = await confirmMany(state, String(a.cand).split(','), { deals: +a.deals || 40000, champion: a.champion, seed: a.seed ? +a.seed : undefined, half: !!a.half }); fs.writeFileSync(path.join(WORK, 'confirm-' + Date.now() + '.json'), JSON.stringify(r, null, 1)); return; }
  if (cmd === 'mutate') { console.log(mutate(a.from, +a.sigma, +a.seed, a.name)); return; }
  if (cmd === 'soup') { console.log(soup(String(a.of).split(','), a.name)); return; }
  if (cmd === 'tune') { console.log(tune(a.from, JSON.parse(a.play), a.name)); return; }
  if (cmd === 'round') { await round(state, Object.assign(readJson(a.spec), a['train-only'] ? { trainOnly: true } : {})); return; }
  if (cmd === 'chain') { await chain(state, readJson(a.spec)); return; }
  if (cmd === 'status') { console.log(JSON.stringify({ champion: state.championName, rounds: state.rounds.length, seeds: state.seeds, datasets: state.datasets.length }, null, 1)); return; }
  throw new Error('usage: nc-overnight.js gen|round|screen|confirm|mutate|tune|status');
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { paired, summary, mutate, tune, bias, soup };
