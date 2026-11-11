/* Keeps the frontier rounds from filling the disk. What goes, and when, is
   decided by what can never be read again:

   - A frontier round's data (ml/data/lv-<n>, sp-<n>) is deleted for good the
     moment it leaves its lineage's training window (the round driver's `keep`). Its
     seed and the model that played it are in the lineage's state, so it can
     be played again if it's ever wanted.
   - Frontier data no lineage's state lists (a crashed run's, a smoke run's,
     an archived lineage's) is deleted at the start of each round, once it's
     6 hours old (so a round still being generated elsewhere is never caught).
   - Before a round's data is generated, the disk must have room for it (the
     last round's size, or an estimate) plus a margin. If not, the oldest kept
     rounds go first, always keeping the newest; if that's still not enough,
     the round stops with a message instead of filling the disk.
   - The native simulator's converted weights (native/build/cache/*.lcmw) are
     derived files, made again when needed: unused for 14 days, or past 1 GB
     (oldest first), they go.

   Never touched: model weights (ml/models/), reports and logs, the benchmark,
   and any data set that isn't a frontier round (other labs prune their own:
   scripts/ml/prune-data.js). */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'ml', 'data');
const FRONTIER = path.join(ROOT, 'ml', 'frontier');
const CACHE = path.join(ROOT, 'native', 'build', 'cache');
const GB = 1024 ** 3;
const FRONTIER_SET = /^(lv|sp)-\d+$/;

function dirBytes(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return n;
}

function freeBytes(dir) {
  const s = fs.statfsSync(dir);
  return s.bavail * s.bsize;
}

const gb = (n) => (n / GB).toFixed(1) + ' GB';

// The frontier data every lineage's state still lists (ml/frontier/<lineage>/state.json).
function listedSets(frontier) {
  frontier = frontier || FRONTIER;
  const keep = new Set();
  if (!fs.existsSync(frontier)) return keep;
  for (const name of fs.readdirSync(frontier)) {
    const file = path.join(frontier, name, 'state.json');
    if (!fs.existsSync(file)) continue;
    try { (JSON.parse(fs.readFileSync(file, 'utf8')).data || []).forEach((d) => keep.add(path.basename(d))); } catch (e) { /* unreadable: keep everything */ return null; }
  }
  return keep;
}

function remove(dir, why, log) {
  const bytes = dirBytes(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  log('deleted ' + (path.relative(ROOT, dir).startsWith('..') ? dir : path.relative(ROOT, dir)) + ' (' + gb(bytes) + '): ' + why);
  return bytes;
}

// Frontier sets no lineage lists. Returns the bytes freed.
// dirs (tests): { data, frontier }.
function pruneOrphans(log, dirs) {
  dirs = dirs || {};
  const data = dirs.data || DATA;
  const keep = listedSets(dirs.frontier);
  if (!keep || !fs.existsSync(data)) return 0;
  let freed = 0;
  for (const name of fs.readdirSync(data)) {
    if (!FRONTIER_SET.test(name) || keep.has(name)) continue;
    const p = path.join(data, name);
    const st = fs.statSync(p);
    // Not while it could still be being written (a lineage lists a round's data once it's generated).
    if (st.isDirectory() && Date.now() - st.mtimeMs > 6 * 3600e3) freed += remove(p, 'no frontier lineage uses it', log);
  }
  return freed;
}

// The converted weights: unused for maxAgeDays, or past maxBytes (oldest first).
function pruneCache(log, opts) {
  opts = opts || {};
  const maxAge = (opts.maxAgeDays || 14) * 86400e3, maxBytes = opts.maxBytes || 1 * GB, cache = opts.cache || CACHE;
  if (!fs.existsSync(cache)) return 0;
  const now = Date.now();
  const files = fs.readdirSync(cache).filter((f) => f.endsWith('.lcmw')).map((f) => {
    const p = path.join(cache, f), st = fs.statSync(p);
    return { p, size: st.size, used: Math.max(st.mtimeMs, st.atimeMs) };
  }).sort((a, b) => b.used - a.used);
  let total = 0, freed = 0, n = 0;
  for (const f of files) {
    total += f.size;
    if (now - f.used > maxAge || total > maxBytes) { fs.rmSync(f.p, { force: true }); freed += f.size; n++; }
  }
  if (n) log('deleted ' + n + ' converted weights from native/build/cache (' + gb(freed) + '): unused for ' + (opts.maxAgeDays || 14) + ' days, or past ' + gb(maxBytes));
  return freed;
}

// Room for a round of `need` bytes plus `margin`: drops the oldest of `state.data`
// (always keeping the newest) until there is, or throws.
// opts (tests): { root, free: () => bytes }.
function makeRoom(state, need, log, margin, opts) {
  opts = opts || {};
  const root = opts.root || ROOT, free = opts.free || (() => freeBytes(root));
  margin = margin == null ? 10 * GB : margin;
  const want = need + margin;
  while (free() < want && state.data.length > 1) {
    const old = state.data.shift();
    remove(path.join(root, old), 'to make room for the next round (' + gb(free()) + ' free, ' + gb(want) + ' wanted)', log);
  }
  if (free() < want) {
    throw new Error('disk: ' + gb(free()) + ' free, and the next round needs about ' + gb(need) + ' plus ' + gb(margin) +
      ' to spare. Free some space (other labs: node scripts/ml/prune-data.js --apply) and run again.');
  }
}

// Bytes the next round will write: the last round's size scaled to its deal count, or `fallback`.
function roundBytes(state, deals, fallback) {
  const last = state.data.length ? path.join(ROOT, state.data[state.data.length - 1]) : null;
  if (last && fs.existsSync(last)) {
    let lastDeals = null;
    try { lastDeals = JSON.parse(fs.readFileSync(path.join(last, 'meta.json'), 'utf8')).deals; } catch (e) { /* no meta */ }
    const b = dirBytes(last);
    return lastDeals ? b * deals / lastDeals : b;
  }
  return fallback;
}

module.exports = { dirBytes, freeBytes, listedSets, pruneOrphans, pruneCache, makeRoom, roundBytes, remove, FRONTIER_SET };
