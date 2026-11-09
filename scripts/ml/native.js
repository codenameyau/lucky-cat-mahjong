#!/usr/bin/env node
/* The native simulator's harness: the same hands in the JS engine and in
   native/build/lcm-sim, compared action by action, and their speed.

   node scripts/ml/native.js parity --agents simple,simple,simple,simple --seed S --deals N
       plays the deals in both and diffs every action and every result; exits 1
       on the first difference, printing it
   node scripts/ml/native.js speed --agents ... --deals N
       hands a second in each, and the ratio
   node scripts/ml/native.js trace ...  the JS side's trace (lcm-sim trace prints the native one)

   Agents: simple (a deterministic test agent, written the same way in
   native/src/simple_agent.h) and, as they are ported, the table's players.
   A hand is played on createGame({ seed: S + d, dealer: d % 4 }), as the
   benchmark deals it. Results stay the same only if every line matches. */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const E = require('../../js/mahjong-engine.js');
// The fast build plays training, screens and judgments; the exact build is diffed against the JS.
const SIM = process.env.LCM_SIM || path.join(ROOT, 'native', 'build', 'lcm-sim');
const SIM_EXACT = process.env.LCM_SIM_EXACT || path.join(ROOT, 'native', 'build', 'lcm-sim-exact');
const PORTED = path.join(ROOT, 'native', 'ported.json');

// The JS the port plays exactly as (native/ported.json, written by `native.js pin`
// after a parity run): a player runs natively only while its files are these.
const GROUPS = {
  engine: ['js/mahjong-engine.js', 'js/points.js'],
  'jorge-yau': ['js/mahjong-bot.js', 'js/mahjong-jorge-yau.js'],
  'neural-cat': ['js/mahjong-bot.js', 'js/mahjong-jorge-yau.js', 'js/mahjong-ml.js', 'js/mahjong-ml-features.js', 'js/mahjong-ml-model.js'],
  'lucky-cat': ['js/mahjong-lucky-cat-ml.js', 'js/mahjong-lucky-cat-net.js', 'js/mahjong-frontier-net.js'],
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// A file as the port depends on it: the engine's GAME_VERSION line changes with
// every release and nothing plays differently for it, so it's left out.
function content(f, buf) {
  return f === 'js/mahjong-engine.js' ? Buffer.from(buf.toString('utf8').replace(/var GAME_VERSION = '[^']*';/, "var GAME_VERSION = '';")) : buf;
}
const pinSum = (f, buf) => sha(content(f, buf));
function ported() { return fs.existsSync(PORTED) ? JSON.parse(fs.readFileSync(PORTED, 'utf8')) : null; }
// sums: file -> SHA-256 of the version a player would run (today's, or the benchmark's frozen ones)
const warned = new Set();
function groupOk(group, sums) {
  const p = ported();
  if (!p) return false;
  const stale = GROUPS[group].concat(GROUPS.engine).filter((f) => !p.files[f] || sums(f) !== p.files[f]);
  stale.forEach((f) => {
    if (warned.has(f)) return;
    warned.add(f);
    console.error('native: ' + f + ' is not the version native/ported.json pins, so its players run in the JS (slower). ' +
      'Port the change to native/, check it (node scripts/ml/native.js parity), then node scripts/ml/native.js pin.');
  });
  return !stale.length;
}
const today = (f) => pinSum(f, fs.readFileSync(path.join(ROOT, f)));
const frozenSums = {};
function frozenSum(bm, f) {
  const key = bm.frozen.commit + ':' + f;
  if (!(key in frozenSums)) {
    try { frozenSums[key] = pinSum(f, execFileSync('git', ['show', bm.frozen.commit + ':' + f], { cwd: ROOT, maxBuffer: 1 << 28 })); } catch (e) { frozenSums[key] = null; }
  }
  return frozenSums[key];
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

// The test agent of native/src/simple_agent.h.
const simple = {
  createBotAgent() {
    return {
      turn(game, seat, o) {
        if (o.win) return { type: 'win' };
        if (o.kongs.length) return { type: 'kong', tile: o.kongs[0].tile };
        const h = game.hand.seats[seat].hand;
        let best = -1, bestN = 99, tile = null;
        for (const t of h) {
          const n = E.countIn(h, t), i = E.tileIndex(t);
          if (n < bestN || (n === bestN && i > best)) { best = i; bestN = n; tile = t; }
        }
        return { type: 'discard', tile };
      },
      claim(game, seat, o) {
        if (o.win) return { type: 'win' };
        if (o.kong) return { type: 'kong' };
        if (o.pung) return { type: 'pung' };
        if (o.chows.length) return { type: 'chow', tiles: o.chows[0] };
        return { type: 'pass' };
      },
    };
  },
};

function agentFor(id) {
  if (id === 'simple') return simple;
  if (id === 'jorge-yau') return require('../../js/mahjong-jorge-yau.js');
  if (id === 'neural-cat') return require('../../js/mahjong-ml.js').create({ fast: true });
  if (id.startsWith('lc:')) {
    const W = require('./weights.js');
    const w = W.readWeights(id.slice(3));
    const F2 = require('../../js/mahjong-frontier-net.js');
    return require('../../js/mahjong-lucky-cat-ml.js').create({ weights: w, fast: true, net: w.featureVersion === F2.FEATURE_VERSION ? F2 : undefined });
  }
  throw new Error('native.js: no agent ' + id);
}

function line(ev) {
  const t = (x) => (x == null ? '-' : x);
  switch (ev.a) {
    case 'flower': return 'flower ' + ev.s + ' ' + ev.t;
    case 'draw': return 'draw ' + ev.s + ' ' + ev.t + ' ' + ev.k;
    case 'discard': return 'discard ' + ev.s + ' ' + ev.t;
    case 'claim': return 'claim ' + ev.s + ' ' + ev.from + ' ' + ev.t + ' ' + ev.c + ' ' + (ev.tiles ? ev.tiles.join(',') : '-');
    case 'kong': return 'kong ' + ev.s + ' ' + ev.t + ' ' + ev.k;
    case 'win': return 'win ' + ev.s + ' ' + ev.how + ' ' + t(ev.t) + ' ' + t(ev.from);
    case 'drawGame': return 'drawGame';
    default: throw new Error('native.js: no line for ' + ev.a);
  }
}

function resultLine(r) {
  const d = r.deltas.join(' ');
  if (r.type !== 'win') return 'result draw ' + d;
  return 'result win ' + r.winner + ' ' + (r.payer == null ? '-' : r.payer) + ' ' + r.how + ' ' + r.score.faan + ' ' +
    (r.score.points == null ? -1 : r.score.points) + ' ' + d;
}

// LCM_DEBUG=<seed>: each turn of that hand, the foundation's ranked discards (as lcm-sim prints them).
function debugAgent(bot, seed) {
  const agent = bot.createBotAgent();
  if (!bot.analyzeDiscards) return agent;
  const f = (v) => (Object.is(v, -0) ? 0 : v).toPrecision(17).replace(/\.?0+$/, '').replace(/\.?0+e/, 'e');
  return {
    turn(game, seat, o) {
      if (String(game.seed) === process.env.LCM_DEBUG && !o.win) {
        const a = bot.analyzeDiscards(game, seat);
        const id = (p) => (p ? p.id : '-');
        const g = (v) => String(v);
        console.error('turn seat ' + seat + ' discards ' + game.hand.seats[seat].discards.length + ' lead ' + id(a.ctx.leadPlan) + ' folding ' + (a.folding ? 1 : 0));
        a.candidates.forEach((x) => console.error('  ' + x.tile + ' util ' + num(x.util) + ' loss ' + num(x.loss) + ' sh ' + x.shanten + ' score ' + num(x.score) +
          ' pri ' + g(x.priority) + ' tier ' + g(x.tier) + ' plan ' + id(x.analysis.best && x.analysis.best.plan)));
      }
      return agent.turn(game, seat, o);
    },
    claim: (game, seat, o) => agent.claim(game, seat, o),
  };
}
// %.17g as C prints it
function num(v) {
  if (v === 0) return '0';
  let s = v.toPrecision(17);
  if (s.includes('e')) { let [m, e] = s.split('e'); if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, ''); const n = parseInt(e, 10); return m + 'e' + (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(2, '0'); }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

async function jsTrace(ids, seed, deals) {
  const bots = ids.map(agentFor);
  const out = [];
  for (let d = 0; d < deals; d++) {
    const game = E.createGame({ seed: seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
    const res = await E.runHand(game, bots.map((b) => (process.env.LCM_DEBUG ? debugAgent(b) : b.createBotAgent())));
    out.push('hand ' + (seed + d));
    game.hand.trace.forEach((ev) => out.push(line(ev)));
    out.push(resultLine(res));
  }
  return out;
}

// The native simulator reads weights as .lcmw: a .json (or git:) model is converted once, cached by its contents.
const converted = new Map();  // spec -> { stamp, file }: each model converted once a process
function lcmwFor(spec) {
  const stamp = spec.startsWith('git:') ? spec : (() => { try { const st = fs.statSync(path.resolve(ROOT, spec)); return st.mtimeMs + ':' + st.size; } catch (e) { return null; } })();
  const hit = converted.get(spec);
  if (hit && stamp && hit.stamp === stamp && fs.existsSync(hit.file)) return hit.file;
  const file = lcmwConvert(spec);
  if (stamp) converted.set(spec, { stamp, file });
  return file;
}
function lcmwConvert(spec) {
  const W = require('./weights.js');
  const buf = W.toLcmw(W.readWeights(spec));
  const dir = path.join(ROOT, 'native', 'build', 'cache');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, sha(buf).slice(0, 16) + '.lcmw');
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  else { const now = new Date(); try { fs.utimesSync(file, now, now); } catch (e) { /* read-only: fine */ } }  // used: scripts/ml/disk.js keeps the recent ones
  return file;
}

// A player id as the native simulator names it, or null when it can't play it
// exactly as the JS does. bm: the benchmark (for its frozen bench:* players).
function nativeId(id, bm) {
  if (!fs.existsSync(SIM)) return null;
  if (id.startsWith('bench:')) {
    const name = id.slice(6);
    const frozen = (f) => (bm && bm.frozen.files[f] ? frozenSum(bm, f) : null);
    if (!bm || !bm.frozen.players[name] || !GROUPS[name] || !groupOk(name, frozen)) return null;
    if (name === 'neural-cat') {
      const what = bm.frozen.players[name];
      if (what.create && (what.create.temperature || what.create.epsilon || what.create.topK != null)) return null;
      return 'nc:' + lcmwFor('git:' + bm.frozen.commit + ':js/mahjong-ml-weights.js');
    }
    return name;
  }
  if (id === 'jorge-yau') return groupOk('jorge-yau', today) ? id : null;
  if (id === 'neural-cat') return groupOk('neural-cat', today) ? 'nc:' + lcmwFor('js/mahjong-ml-weights.js') : null;
  if (id.startsWith('nc:')) return groupOk('neural-cat', today) ? 'nc:' + (id.endsWith('.lcmw') ? id.slice(3) : lcmwFor(id.slice(3))) : null;
  if (id.startsWith('lc:')) {
    if (!groupOk('lucky-cat', today)) return null;
    const W = require('./weights.js');
    const w = id.endsWith('.lcmw') ? null : W.readWeights(id.slice(3));
    if (w && ((w.meta || {}).oracle || (w.featureVersion !== 1 && w.featureVersion !== 2))) return null;
    return 'lc:' + (id.endsWith('.lcmw') ? id.slice(3) : lcmwFor(id.slice(3)));
  }
  return id === 'simple' ? id : null;
}

// Runs native jobs with at most `workers` at once, the next one starting as
// each finishes, so the efficiency cores don't hold the rest up.
function pool(tasks, workers) {
  const results = new Array(tasks.length);
  let next = 0;
  const run = () => (next >= tasks.length ? Promise.resolve() : (() => { const k = next++; return tasks[k]().then((r) => { results[k] = r; return run(); }); })());
  return Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, run)).then(() => results);
}

// bench.js playWork natively, for deals [from, to) split into chunks run `workers` at a time:
// the chunks' sums (bench.js summarize adds them), or null when a player can't run natively.
function playNativeParts(job, workers) {
  const models = job.models.map((id) => nativeId(id, job.bm));
  const table = job.bm.table.map((id) => nativeId(id, job.bm));
  if (models.concat(table).some((x) => !x)) return null;
  const deals = job.to - job.from;
  const chunks = Math.max(1, Math.min(deals, workers * 4));
  const per = Math.ceil(deals / chunks);
  const tasks = [];
  for (let from = job.from; from < job.to; from += per) {
    const to = Math.min(job.to, from + per);
    tasks.push(() => playNative(Object.assign({}, job, { from, to }), models, table));
  }
  return pool(tasks, Math.max(1, workers));
}

function playNative(job, models, table) {
  models = models || job.models.map((id) => nativeId(id, job.bm));
  table = table || job.bm.table.map((id) => nativeId(id, job.bm));
  if (models.concat(table).some((x) => !x)) return null;
  return new Promise((resolve, reject) => {
    const child = spawn(job.exact ? SIM_EXACT : SIM, ['play', '--models', models.join(','), '--table', table.join(','), '--seed', String(job.seed),
      '--from', String(job.from), '--to', String(job.to)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('exit', (code) => (code ? reject(new Error('lcm-sim play exited with ' + code)) : resolve(JSON.parse(out))));
  });
}

// A player as the simulator names it, ignoring the pin: the parity check is
// how a port is verified before it's pinned.
function simId(id) {
  if (id === 'neural-cat') return 'nc:' + lcmwFor('js/mahjong-ml-weights.js');
  if ((id.startsWith('lc:') || id.startsWith('nc:')) && !id.endsWith('.lcmw')) return id.slice(0, 3) + lcmwFor(id.slice(3));
  return id;
}

function nativeRun(cmd, ids, seed, deals, exact) {
  const r = spawnSync(exact ? SIM_EXACT : SIM, [cmd, '--agents', ids.map(simId).join(','), '--seed', String(seed), '--deals', String(deals)], { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('lcm-sim failed: ' + (r.stderr || r.error));
  return r.stdout;
}

async function main(a) {
  const cmd = a._[0];
  const ids = (a.agents || 'simple,simple,simple,simple').split(',');
  const seed = parseInt(a.seed || 912000000, 10), deals = parseInt(a.deals || 200, 10);
  if (cmd === 'trace') { (await jsTrace(ids, seed, deals)).forEach((l) => console.log(l)); return; }
  if (cmd === 'parity') {
    const t0 = Date.now();
    const js = await jsTrace(ids, seed, deals);
    const t1 = Date.now();
    const nat = nativeRun('trace', ids, seed, deals, true).trimEnd().split('\n');
    const t2 = Date.now();
    let hand = '';
    for (let i = 0; i < Math.max(js.length, nat.length); i++) {
      if (js[i] && js[i].startsWith('hand ')) hand = js[i];
      if (js[i] !== nat[i]) {
        console.log('DIFFERENT at line ' + (i + 1) + ' (' + hand + '):\n  js:     ' + js[i] + '\n  native: ' + nat[i]);
        const from = Math.max(0, i - 6);
        console.log('  before:\n' + js.slice(from, i).map((l) => '    ' + l).join('\n'));
        process.exitCode = 1;
        return;
      }
    }
    console.log('same: ' + deals + ' hands, ' + js.length + ' lines (' + ids.join(',') + '); js ' + (t1 - t0) + ' ms, native ' + (t2 - t1) + ' ms');
    return;
  }
  if (cmd === 'speed') {
    const t0 = Date.now();
    await jsTrace(ids, seed, deals);
    const js = (Date.now() - t0) / 1000;
    const nat = JSON.parse(nativeRun('speed', ids, seed, deals));
    console.log(ids.join(',') + ': js ' + (deals / js).toFixed(1) + ' hands/s, native ' + nat.handsPerSecond.toFixed(1) +
      ' hands/s: ' + (nat.handsPerSecond / (deals / js)).toFixed(1) + 'x');
    return;
  }
  if (cmd === 'pin') {
    // Records today's JS as what the port matches: run parity first, on every player.
    const files = {};
    [...new Set([].concat(...Object.values(GROUPS)))].forEach((f) => { files[f] = today(f); });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
    fs.writeFileSync(PORTED, JSON.stringify({ checked: new Date().toISOString().slice(0, 10), commit, files }, null, 2) + '\n');
    console.log('pinned ' + Object.keys(files).length + ' files in native/ported.json');
    return;
  }
  throw new Error('usage: native.js parity|speed|trace|pin [--agents a,b,c,d] [--seed S] [--deals N]');
}

if (require.main === module) main(parseArgs(process.argv.slice(2))).catch((err) => { console.error(err.stack || err.message); process.exit(1); });

module.exports = { line, resultLine, jsTrace, nativeId, playNative, playNativeParts, lcmwFor, pool };
