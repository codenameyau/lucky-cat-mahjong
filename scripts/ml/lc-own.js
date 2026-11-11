#!/usr/bin/env node
/* Lucky Cat against its own lineage: the overnight loop's pieces, on the native simulator.

   node scripts/ml/lc-own.js screen --champ ml/models/lc32.json --cands a.json,b.json --seed S --stages 8000,24000,48000
   node scripts/ml/lc-own.js data --champ ml/models/lc32.json --seed S --deals N --out ml/data/own-1
   node scripts/ml/lc-own.js confirm --champ ml/models/lc32.json --cand a.json --seed S --deals 80000

   The table is only older Lucky Cat generations (--table-pool, default the four
   newest: lc32, lc31, lc30, lc29): the deck is cut into blocks of --block deals,
   and block k is played at the k-th three-of-four of the pool, so every table
   mix gets the same share. Each model plays every seat of every deal of a block
   (lcm-sim play, the same deals for every model), so a candidate and the
   champion are paired deal by deal.

   Caching: each (model, table, seed, block, build) is played once and kept in
   ml/overnight/lucky-cat/cache (per-deal points and hands won, plus the block's
   sums), so the champion is played once per deck however many candidates it
   meets, and a stage of a screen re-run after a crash costs nothing.
   Pruning: a screen's stages add deals; after each, an arm behind by more than
   --drop SE in points, or more than --drop SE in hands won, stops playing.

   Data (lcm-sim generate-lcv --crn --policy-only): the champion explores at
   temperature 1 against itself and the older generations; at a share of the
   choices its top 4 moves are each played on --replays times from the
   position, every move on the same reshuffled walls (common random numbers),
   cached by its settings. ml/lc_own_train.py learns from it. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const N = require('./native.js');

const ROOT = path.join(__dirname, '..', '..');
const EXE = process.platform === 'win32' ? '.exe' : '';
const SIM = process.env.LC_SIM ? path.resolve(ROOT, process.env.LC_SIM) : path.join(ROOT, 'native', 'build', 'lcm-sim' + EXE);
const SIM_EXACT = path.join(ROOT, 'native', 'build', 'lcm-sim-exact' + EXE);
const OUT = path.join(ROOT, 'ml', 'overnight', 'lucky-cat');
const CACHE = path.join(OUT, 'cache');
const WORKERS = parseInt(process.env.LC_WORKERS || '10', 10);
const DEFAULT_POOL = ['lc32', 'lc31', 'lc30', 'lc29'].map((m) => 'ml/models/' + m + '.json');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };

function nid(file) {
  const id = N.nativeId('lc:' + file);
  if (!id) throw new Error("lc-own: can't play " + file + ' natively');
  return id;
}

function run(exe, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd: ROOT });
    let o = '', e = '';
    p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
    p.on('exit', (c) => (c ? reject(new Error(path.basename(exe) + ' ' + args[0] + ': ' + e)) : resolve(o)));
  });
}

// The three-seat tables: every three of the pool (four newest older generations: four tables).
function tables(poolFiles) {
  const p = poolFiles.map(nid), out = [];
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) for (let k = j + 1; k < p.length; k++) out.push([p[i], p[j], p[k]]);
  return out;
}

// One block: a model at one table on deals [from, to) of seed. Cached.
const stats = { played: 0, cached: 0, seconds: 0 };
async function block(model, table, seed, from, to, exact) {
  const key = sha(JSON.stringify([path.basename(model), table.map((t) => path.basename(t)), seed, from, to, exact ? 'exact' : 'fast']));
  const file = path.join(CACHE, key + '.json');
  const hit = readJson(file, null);
  if (hit) { stats.cached += to - from; return hit; }
  fs.mkdirSync(CACHE, { recursive: true });
  const dump = path.join(CACHE, key + '.f4');
  const t0 = Date.now();
  const out = JSON.parse(await run(exact ? SIM_EXACT : SIM, ['play', '--models', model, '--table', table.join(','), '--seed', String(seed),
    '--from', String(from), '--to', String(to), '--dump', dump])).out[0];
  const buf = fs.readFileSync(dump);
  const v = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  fs.unlinkSync(dump);
  const res = { sums: out, points: Array.from(v.filter((x, i) => i % 3 === 0)), wins: Array.from(v.filter((x, i) => i % 3 === 1)), dealIns: Array.from(v.filter((x, i) => i % 3 === 2)) };
  writeJson(file, res);
  stats.played += to - from; stats.seconds += (Date.now() - t0) / 1000;
  return res;
}

// Every model on deals [from, to) of seed, cut into blocks; returns per model the blocks in order.
async function playDeck(models, poolFiles, seed, from, to, opts = {}) {
  const T = tables(poolFiles), B = opts.block || 1000, tasks = [], where = [];
  models.forEach((m, mi) => {
    for (let f = from; f < to; f += B) {
      const t = T[Math.floor(f / B) % T.length];
      tasks.push(() => block(m, t, seed, f, Math.min(to, f + B), opts.exact));
      where.push(mi);
    }
  });
  const res = await N.pool(tasks, opts.workers || WORKERS);
  const out = models.map(() => []);
  res.forEach((r, k) => out[where[k]].push(r));
  return out;
}

function summarize(blocks) {
  const s = { seats: 0, points: 0, wins: 0, dealIns: 0, winPoints: 0, winFaan: 0 };
  blocks.forEach((b) => Object.keys(s).forEach((k) => { s[k] += b.sums[k]; }));
  return { deals: s.seats / 4, points: s.points / s.seats, winRate: s.wins / s.seats, dealIns: s.dealIns / s.seats,
    avgWin: s.winPoints / Math.max(1, s.wins), avgFaan: s.winFaan / Math.max(1, s.wins) };
}

function paired(a, b) {
  const pa = [].concat(...a.map((x) => x.points)), pb = [].concat(...b.map((x) => x.points));
  const wa = [].concat(...a.map((x) => x.wins)), wb = [].concat(...b.map((x) => x.wins));
  const da = [].concat(...a.map((x) => x.dealIns || [])), db = [].concat(...b.map((x) => x.dealIns || []));
  const n = pa.length;
  let s = 0, q = 0, ws = 0, wq = 0, ds = 0, dq = 0;
  const hasD = da.length === n && db.length === n;
  if (hasD) for (let i = 0; i < n; i++) { const d = da[i] - db[i]; ds += d; dq += d * d; }
  const dm = ds / n;
  for (let i = 0; i < n; i++) { const d = pa[i] - pb[i], w = wa[i] - wb[i]; s += d; q += d * d; ws += w; wq += w * w; }
  const m = s / n, wm = ws / n;
  return { deals: n, gap: m, se: Math.sqrt(Math.max(0, q / n - m * m) / n), winGap: 100 * wm, winSe: 100 * Math.sqrt(Math.max(0, wq / n - wm * wm) / n),
    dealInGap: hasD ? 100 * dm : null, dealInSe: hasD ? 100 * Math.sqrt(Math.max(0, dq / n - dm * dm) / n) : null };
}

const fmt = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
function line(name, p, me, ch) {
  return name + ': ' + fmt(p.gap) + ' ± ' + p.se.toFixed(1) + ' points a hand, hands won ' + fmt(p.winGap, 2) + ' ± ' + p.winSe.toFixed(2) +
    ' (' + (100 * me.winRate).toFixed(2) + '% vs ' + (100 * ch.winRate).toFixed(2) + '%), deal-ins ' + (100 * me.dealIns).toFixed(2) + '% vs ' +
    (100 * ch.dealIns).toFixed(2) + '%' + (p.dealInSe != null ? ' (' + fmt(p.dealInGap, 2) + ' ± ' + p.dealInSe.toFixed(2) + ')' : '') + ', average win ' + Math.round(me.avgWin) + ' vs ' + Math.round(ch.avgWin) + ', ' + p.deals + ' deals';
}

// A screen: stages of fresh deals from seed; arms behind by --drop SE (points or wins) stop.
async function screen(champ, cands, seed, stages, opts = {}) {
  const drop = opts.drop == null ? 1 : opts.drop, pool = opts.pool || DEFAULT_POOL, log = opts.log || console.log;
  const C = nid(champ), arms = cands.map((f) => ({ file: f, id: nid(f), alive: true, blocks: [] }));
  let champBlocks = [], from = 0;
  for (let s = 0; s < stages.length; s++) {
    const to = from + stages[s], live = arms.filter((a) => a.alive);
    if (!live.length) break;
    const t0 = Date.now();
    const res = await playDeck([C].concat(live.map((a) => a.id)), pool, seed, from, to, opts);
    champBlocks = champBlocks.concat(res[0]);
    live.forEach((a, k) => { a.blocks = a.blocks.concat(res[k + 1]); });
    const ch = summarize(champBlocks);
    live.forEach((a) => {
      a.pair = paired(a.blocks, champBlocks); a.me = summarize(a.blocks); a.ch = ch;
      if (a.pair.gap < -drop * a.pair.se || a.pair.winGap < -drop * a.pair.winSe) a.alive = false;
      a.line = line(path.basename(a.file, '.json'), a.pair, a.me, ch) + (a.alive ? '' : ' [dropped]');
      log('  stage ' + (s + 1) + ' ' + a.line);
    });
    log('  stage ' + (s + 1) + ': ' + live.length + ' arms, ' + (to - from) + ' deals in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
    from = to;
  }
  return arms.map((a) => ({ file: a.file, alive: a.alive, pair: a.pair, me: a.me, ch: a.ch, line: a.line }));
}

/* ---------------- data ---------------- */

async function data(champ, poolFiles, seed, deals, dir, opts = {}) {
  const manifest = path.join(ROOT, dir, 'manifest.json');
  const settings = { champ: path.basename(nid(champ)), pool: poolFiles.map((f) => path.basename(nid(f))), seed, deals,
    replays: opts.replays || 12, share: opts.share || 0.5, sample: opts.sample || 0.12, learners: opts.learners || 2, crn: true,
    halving: opts.halving || 0, margin: opts.margin || 150, extra: opts.extra || 0, v: 2,
    value: opts.value ? path.basename(N.lcmwFor(opts.value)) : null, truncate: opts.value ? opts.truncate || 4 : 0 };
  const key = sha(JSON.stringify(settings));
  const was = readJson(manifest, null);
  if (was && was.key === key) return Object.assign({ cached: true }, was);
  // A stopped run keeps the shards it finished (each marked .done with the settings' key).
  const keyFile = path.join(ROOT, dir, 'key.txt');
  if (!fs.existsSync(keyFile) || fs.readFileSync(keyFile, 'utf8') !== key) {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
    fs.writeFileSync(keyFile, key);
  }
  const L = nid(champ).slice(3);
  const pool = new Array(settings.learners).fill('learner').concat(poolFiles.map(nid));
  const strategies = pool.map((p, k) => (p === 'learner' ? 0 : k - settings.learners + 1));
  const per = 250, tasks = [];
  const t0 = Date.now();
  for (let f = 0, k = 0; f < deals; f += per, k++) {
    const n = Math.min(per, deals - f);
    const done = path.join(ROOT, dir, 'shard-' + k + '.done.json');
    tasks.push(() => fs.existsSync(done) ? Promise.resolve(readJson(done)) : run(SIM, ['generate-lcv', '--weights', L, '--seed', String(seed + f), '--deals', String(n), '--shard', String(k),
      '--pool', pool.join(','), '--strategies', strategies.join(','), '--out', path.join(ROOT, dir), '--sample', String(settings.sample),
      '--temperature', '1', '--epsilon', '0.1', '--option-replays', String(settings.replays), '--options', '4',
      '--option-share', String(settings.share), '--crn', '--policy-only', '--halving', String(settings.halving), '--halving-margin', String(settings.margin),
      '--extra-random', String(settings.extra)].concat(settings.value ? ['--value', N.lcmwFor(opts.value), '--truncate', String(settings.truncate)] : [])).then((o) => { const j = JSON.parse(o); writeJson(done, j); return j; }));
  }
  const shards = await N.pool(tasks, opts.workers || WORKERS);
  // Drop the empty value files --policy-only leaves.
  for (const f of fs.readdirSync(path.join(ROOT, dir))) if (/\.(features|labels|aux|options|optlabels)$/.test(f)) fs.unlinkSync(path.join(ROOT, dir, f));
  const m = { key, settings, seconds: (Date.now() - t0) / 1000, policyRows: shards.reduce((t, s) => t + s.policyRows, 0), shards: shards.length };
  writeJson(path.join(ROOT, dir, 'meta.json'), { featureVersion: 1, featureSize: 376, rollouts: { slots: 8 }, qPoints: true, policyRows: m.policyRows });
  writeJson(manifest, m);
  return m;
}

// The value's rows (lcm-sim generate-lcv --value-rows): each sampled choice's 416 features of
// the position its move leaves and how the hand ended for that seat, for ml/train.py.
async function valueData(champ, poolFiles, seed, deals, dir, opts = {}) {
  const full = path.join(ROOT, dir), manifest = path.join(full, 'manifest.json');
  const settings = { champ: path.basename(nid(champ)), pool: poolFiles.map((f) => path.basename(nid(f))), seed, deals, sample: opts.sample || 0.5, learners: opts.learners || 2 };
  const key = sha(JSON.stringify(settings));
  const was = readJson(manifest, null);
  if (was && was.key === key) return Object.assign({ cached: true }, was);
  fs.rmSync(full, { recursive: true, force: true });
  fs.mkdirSync(full, { recursive: true });
  const pool = new Array(settings.learners).fill('learner').concat(poolFiles.map(nid));
  const strategies = pool.map((p, k) => (p === 'learner' ? 0 : k - settings.learners + 1));
  const per = Math.ceil(deals / (opts.workers || WORKERS)), tasks = [];
  const t0 = Date.now();
  for (let f = 0, k = 0; f < deals; f += per, k++) {
    tasks.push(() => run(SIM, ['generate-lcv', '--weights', nid(champ).slice(3), '--seed', String(seed + f), '--deals', String(Math.min(per, deals - f)), '--shard', String(k),
      '--pool', pool.join(','), '--strategies', strategies.join(','), '--out', full, '--sample', String(settings.sample), '--temperature', '1', '--epsilon', '0.1',
      '--option-replays', '0', '--policy-only', '--value-rows']).then((o) => JSON.parse(o)));
  }
  const shards = await N.pool(tasks, opts.workers || WORKERS);
  const H = require('./heads.js');
  const m = { key, settings, seconds: (Date.now() - t0) / 1000, featureVersion: 'lcv1', featureSize: 416, featureDtype: 'float16', labelBytes: 16,
    auxBytes: H.AUX_BYTES, hands: H.HANDS, outcomes: ['winSelf', 'winDiscard', 'dealIn', 'otherSelf', 'otherWin', 'draw'], strategies: ['learner'].concat(poolFiles.map((f) => path.basename(f, '.json'))),
    learner: 'learner', native: 'fast', champion: champ,
    shards: shards.map((x) => ({ features: 'shard-' + x.index + '.features', labels: 'shard-' + x.index + '.labels', aux: 'shard-' + x.index + '.aux', samples: x.samples, deals: x.deals })),
    samples: shards.reduce((t, x) => t + x.samples, 0) };
  writeJson(manifest, m);
  return m;
}

/* ---------------- CLI ---------------- */

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

async function main(a) {
  const cmd = a._[0];
  const pool = a['table-pool'] ? String(a['table-pool']).split(',') : DEFAULT_POOL;
  const t0 = Date.now();
  if (cmd === 'screen' || cmd === 'confirm') {
    const cands = String(a.cands || a.cand).split(',');
    const stages = cmd === 'confirm' ? [parseInt(a.deals || 80000, 10)] : String(a.stages || '8000,24000,48000').split(',').map(Number);
    const res = await screen(a.champ, cands, parseInt(a.seed, 10), stages, { pool, exact: cmd === 'confirm' || !!a.exact, drop: a.drop != null ? parseFloat(a.drop) : (cmd === 'confirm' ? 1e9 : 1) });
    if (a.json) writeJson(path.resolve(ROOT, a.json), res);
  } else if (cmd === 'data') {
    const m = a.value === true ? await valueData(a.champ, pool, parseInt(a.seed, 10), parseInt(a.deals, 10), a.out) :
      await data(a.champ, pool, parseInt(a.seed, 10), parseInt(a.deals, 10), a.out, { replays: a.replays && parseInt(a.replays, 10), share: a.share && parseFloat(a.share),
        halving: a.halving && parseInt(a.halving, 10), extra: a.extra && parseInt(a.extra, 10), value: typeof a.value === 'string' ? a.value : null, truncate: a.truncate && parseInt(a.truncate, 10) });
    console.log(JSON.stringify(m));
  } else throw new Error('usage: lc-own.js screen|confirm|data');
  console.log('done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's; blocks played ' + stats.played + ' deal-models (' + stats.seconds.toFixed(0) + ' worker-s), cached ' + stats.cached);
}

if (require.main === module) main(parseArgs(process.argv.slice(2))).catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { valueData, screen, data, playDeck, paired, summarize, tables, nid, stats, DEFAULT_POOL, OUT };
