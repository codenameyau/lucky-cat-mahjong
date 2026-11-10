#!/usr/bin/env node
/* Training data for the learned strategy (js/mahjong-ml.js).

   Plays deals across worker threads and records discards: the features of
   the position each discard left (js/mahjong-ml-features.js), read through
   neural-cat's own foundation as in play, and labelled with how the hand
   ended for that seat. Every seat is recorded, whatever strategy it plays.

   npm run ml:generate -- --deals 2000
   npm run ml:generate -- --deals 50000 --lineup mix --explore 0.1 --out ml/data/r1
   npm run ml:generate -- --lineup neural-cat,jorge-yau,lucky-cat,neural-cat --weights ml/models/r1.json --temperature 150

   Options:
     --deals N        deals to play (default 1000)
     --seed N         first deal's seed (default 1)
     --lineup ...     four strategy ids by seat, or "mix" (default): each
                      seat picks at random from --pool every deal
     --pool a,b,..    strategies for "mix" (default: every table strategy
                      and neural-cat); ml:<file> is an earlier model playing
                      its best, so neural-cat can train against a league
     --sample P       chance each discard is recorded (default 0.3)
     --explore P      chance a rule bot's discard is swapped for a random
                      one that costs no step toward ready, and its claim
                      choice for a random one (default 0.05)
     --top-k N        neural-cat picks among its foundation's best N (default 3)
     --weights FILE   neural-cat's weights (JSON); default: shipped or random
     --temperature T  neural-cat's exploration, in points (default 100)
     --epsilon P      neural-cat's random discards (default 0.05)
     --workers N      worker threads (default: CPU cores - 1)
     --out DIR        where to write (default ml/data/<date-time>)
     --learner ID     the learned strategy being trained: neural-cat
                      (default) or only-orphans. Its id in a lineup is the
                      exploring copy (--weights, --temperature, --epsilon),
                      every position is read through its foundation, and
                      for only-orphans, oo:<file> is an earlier Only Orphans
                      model playing its best (neural-cat is then the shipped
                      Neural Cat, a table opponent)
     --record a,b,..  record only the seats playing these strategies
                      (default: every seat)
     --native         play on the native simulator (native/, lcm-sim generate-nc):
                      the same shard files as the JS writes, far faster. It
                      needs --record <learner> for Neural Cat, --explore 0, a
                      mixed lineup, and a pool the simulator has (neural-cat,
                      ml:<file>, jorge-yau, lucky-cat). --exact uses the exact
                      build, whose rows are the JS's byte for byte
     --replays K      native only: replay a share (--replay-share, default 0.25) of
                      the recorded discards K times after the hand, with the
                      tiles the seat can't see shuffled; the counts of how the
                      replays ended go in shard-N.replay (labels only)
   npm run ml:generate -- parity --deals 200   checks that: the JS and the native
                      simulator write the same bytes for the same deals
   only-orphans-rules (the rule-based Only Orphans, the baseline) can sit at
   any table too. */

/*

   Writes, per worker, shard-N.features (float16, SIZE per sample) and
   shard-N.labels (16 bytes per sample: outcome, winFaan, payFaan, turn,
   seat, strategy, wallLeft, explored as uint8 (bit 1: a random choice; bit 2:
   a position waiting for a tile, after a passed claim or a kong); delta as
   float32; deal seed
   as uint32), shard-N.aux (scripts/ml/heads.js: the hand and the table, for
   the frontier model's extra heads) and manifest.json describing them. */

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const E = require('../../js/mahjong-engine.js');
const S = require('../../js/mahjong-strategies.js');
const F = require('../../js/mahjong-ml-features.js');
const M = require('../../js/mahjong-ml-model.js');
const ML = require('../../js/mahjong-ml.js');
const OO = require('../../js/mahjong-only-orphans.js');
const { addBaselines, MODEL_PREFIX } = require('./baselines/register.js');
const H = require('./heads.js');

const LABEL_BYTES = 16;
const OUTCOMES = M.OUTCOMES;
// The learned strategy each run trains: its exploring copy, the prefix of
// its earlier models in a lineup, and how a copy is made.
const LEARNERS = {
  'neural-cat': { prefix: 'ml:', create: (o) => ML.create(o) },
  'only-orphans': { prefix: MODEL_PREFIX, create: (o) => OO.create(o) },
};
addBaselines();

// Which outcome the hand had for `seat` (an index into OUTCOMES).
function outcomeFor(res, seat) {
  if (res.type !== 'win') return 5;
  const selfPaid = res.payer === null || res.payer === undefined;
  if (res.winner === seat) return selfPaid ? 0 : 1;
  if (res.payer === seat) return 2;
  return selfPaid ? 3 : 4;
}

function faanOf(res) { return Math.max(3, Math.min(13, (res.score && res.score.faan) || 3)); }

// The discards that cost no step toward ready, for exploring.
function noStepDiscards(hand, declared) {
  const c = E.countsOf(hand);
  let best = Infinity, out = [];
  for (let i = 0; i < 34; i++) {
    if (!c[i]) continue;
    c[i]--;
    const s = E.shanten(c, declared);
    c[i]++;
    if (s < best) { best = s; out = [i]; } else if (s === best) out.push(i);
  }
  return out;
}

// Learned seats (the exploring copy, earlier models) and the shipped Neural
// Cat never get the rule bots' --explore swaps.
const LEARNED = ['neural-cat', 'only-orphans'];

function makeAgent(id, cfg) {
  if (cfg.models[id]) return { agent: cfg.models[id].createBotAgent(), rule: false };
  if (id === cfg.learner) return { agent: cfg.mlBot.createBotAgent(), rule: false };
  return { agent: S.createAgent(id), rule: LEARNED.indexOf(id) === -1 };
}

async function runWorker(cfg) {
  addBaselines();
  const strategies = cfg.strategies;
  const L = LEARNERS[cfg.learner];
  const rng = E.createRng((cfg.seed * 2654435761) >>> 0);
  const weights = cfg.weightsFile ? JSON.parse(fs.readFileSync(cfg.weightsFile, 'utf8')) : null;
  // One copy of the learner for every seat that plays it (its calls are
  // synchronous). Every position is read through its foundation.
  const shipped = cfg.learner === 'neural-cat' ? ML.model : OO.model;
  cfg.mlBot = L.create({ model: weights ? M.createModel(weights) : shipped, topK: cfg.topK, temperature: cfg.temperature, epsilon: cfg.epsilon, rng, fast: true });
  // Earlier models ("ml:<file>" or "oo:<file>"), playing their best (a league).
  cfg.models = {};
  cfg.pool.concat(cfg.lineup === 'mix' ? [] : cfg.lineup).filter((id) => id.startsWith(L.prefix)).forEach((id) => {
    if (!cfg.models[id]) cfg.models[id] = L.create({ id, weights: JSON.parse(fs.readFileSync(path.resolve(id.slice(L.prefix.length)), 'utf8')), fast: true });
  });
  const recorded = (id) => !cfg.record || cfg.record.indexOf(id) !== -1;
  const featFd = fs.openSync(path.join(cfg.out, 'shard-' + cfg.index + '.features'), 'w');
  const labelFd = fs.openSync(path.join(cfg.out, 'shard-' + cfg.index + '.labels'), 'w');
  const auxFd = fs.openSync(path.join(cfg.out, 'shard-' + cfg.index + '.aux'), 'w');
  let samples = 0, hands = 0;
  const outcomes = OUTCOMES.map(() => 0);
  const t0 = Date.now();

  for (let d = 0; d < cfg.deals; d++) {
    const dealSeed = (cfg.seed + d) >>> 0;
    const ids = cfg.lineup === 'mix'
      ? [0, 1, 2, 3].map(() => cfg.pool[Math.floor(rng() * cfg.pool.length)])
      : cfg.lineup;
    const game = E.createGame({ seed: dealSeed, humanSeat: false, dealer: dealSeed % 4, startPoints: 1e9 });
    game.round = ((dealSeed >>> 2) % 4) + 1;
    const records = [];
    // Waiting positions (a passed claim, a kong) are marked with 2 in `explored`.
    const push = (g, s, id, x, explored) => records.push({
      seat: s, strategy: strategies.indexOf(id), explored: explored | 2,
      turn: g.hand.seats[s].discards.length, wallLeft: g.hand.wall.length, x,
      aux: H.tableLabels(g, s, -1),
    });
    const waiting = (g, s, id, kind, tile, explored) => push(g, s, id, ML.waitingFeatures(cfg.mlBot, g, s, kind, tile), explored);
    const agents = ids.map((id, seat) => {
      const made = makeAgent(id, cfg);
      return {
        turn(g, s, opts) {
          // Read the position before the bot moves (its plan memo moves after).
          const keep = !opts.win && recorded(id) && rng() < cfg.sample;
          const state = keep ? F.prepare(g, s, null, null, cfg.mlBot) : null;
          return made.agent.turn(g, s, opts).then((action) => {
            if (action && action.type === 'kong') {
              // The position after the kong, before its replacement tile.
              const kong = opts.kongs.filter((k) => k.tile === action.tile)[0];
              if (kong && recorded(id)) waiting(g, s, id, kong.kind, kong.tile, 0);
              return action;
            }
            if (!action || action.type !== 'discard') return action;
            let explored = 0;
            if (made.rule && cfg.explore && rng() < cfg.explore) {
              const pool = noStepDiscards(g.hand.seats[s].hand, g.hand.seats[s].melds.length);
              const i = pool[Math.floor(rng() * pool.length)];
              if (E.tileId(i) !== action.tile) { action = { type: 'discard', tile: E.tileId(i) }; explored = 1; }
            }
            if (state) {
              // The hand the rules read for the tiles kept, and the table as it is now.
              const index = E.tileIndex(action.tile);
              const kept = state.counts.slice();
              kept[index]--;
              const analysis = cfg.mlBot.handUtility(kept, state.ctx);
              const aux = H.tableLabels(g, s, index);
              aux[0] = H.planHand(analysis && analysis.best && analysis.best.plan && analysis.best.plan.id);
              records.push({
                seat: s, strategy: strategies.indexOf(id), explored,
                turn: g.hand.seats[s].discards.length, wallLeft: g.hand.wall.length,
                x: F.encode(state, index, analysis), aux,
              });
            }
            return action;
          });
        },
        claim(g, s, opts) {
          const can = !opts.win && (opts.pung || opts.kong || opts.chows.length);
          // Read before the choice moves anything.
          const keep = can && recorded(id) && rng() < cfg.sample;
          const pass = keep ? ML.waitingFeatures(cfg.mlBot, g, s, 'pass', opts.tile) : null;
          const kong = keep && opts.kong ? ML.waitingFeatures(cfg.mlBot, g, s, 'kong', opts.tile) : null;
          return made.agent.claim(g, s, opts).then((d) => {
            let explored = 0;
            if (can && made.rule && cfg.explore && rng() < cfg.explore) {
              const all = [{ type: 'pass' }].concat(opts.pung ? [{ type: 'pung' }] : [], opts.kong ? [{ type: 'kong' }] : [],
                opts.chows.map((tiles) => ({ type: 'chow', tiles })));
              const pick = all[Math.floor(rng() * all.length)];
              if (pick.type !== d.type || (pick.tiles && (!d.tiles || pick.tiles.join() !== d.tiles.join()))) { d = pick; explored = 1; }
            }
            if (d && d.type === 'pass' && pass) push(g, s, id, pass, explored);
            if (d && d.type === 'kong' && kong) push(g, s, id, kong, explored);
            return d;
          });
        },
      };
    });
    const res = await E.runHand(game, agents);
    hands++;
    if (!records.length) continue;
    const feats = new Float16Array(records.length * F.SIZE);
    const labels = Buffer.alloc(records.length * LABEL_BYTES);
    const aux = Buffer.alloc(records.length * H.AUX_BYTES);
    const won = res.type === 'win' ? H.winHand(res.score) : H.NONE;
    records.forEach((r, k) => {
      feats.set(r.x, k * F.SIZE);
      const o = outcomeFor(res, r.seat);
      outcomes[o]++;
      const off = k * LABEL_BYTES;
      labels.writeUInt8(o, off);
      labels.writeUInt8(o === 0 || o === 1 ? faanOf(res) : 0, off + 1);
      labels.writeUInt8(o === 2 || o === 3 ? faanOf(res) : 0, off + 2);
      labels.writeUInt8(Math.min(255, r.turn), off + 3);
      labels.writeUInt8(r.seat, off + 4);
      labels.writeUInt8(r.strategy, off + 5);
      labels.writeUInt8(Math.min(255, r.wallLeft), off + 6);
      labels.writeUInt8(r.explored, off + 7);
      labels.writeFloatLE(res.deltas[r.seat], off + 8);
      labels.writeUInt32LE(dealSeed, off + 12);
      if (o === 0 || o === 1) r.aux[1] = won;
      aux.set(r.aux, k * H.AUX_BYTES);
    });
    fs.writeSync(featFd, new Uint8Array(feats.buffer));
    fs.writeSync(labelFd, labels);
    fs.writeSync(auxFd, aux);
    samples += records.length;
    if (cfg.progress && (d + 1) % cfg.progress === 0) parentPort.postMessage({ progress: d + 1, index: cfg.index });
  }
  fs.closeSync(featFd);
  fs.closeSync(labelFd);
  fs.closeSync(auxFd);
  return { index: cfg.index, deals: cfg.deals, hands, samples, outcomes, ms: Date.now() - t0 };
}

if (!isMainThread) {
  runWorker(workerData).then((r) => parentPort.postMessage({ done: r }));
  return;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

// The same run on the native simulator: a function that plays one worker's
// deals with lcm-sim generate-nc and resolves to what runWorker returns.
function nativePlan(cfg, known, args) {
  const N = require('./native.js');
  const { execFile } = require('node:child_process');
  const fail = (why) => { throw new Error('--native: ' + why); };
  if (cfg.learner !== 'neural-cat') fail('only Neural Cat and the frontier model are ported');
  if (cfg.lineup !== 'mix') fail('needs a mixed lineup (--lineup mix)');
  if (cfg.explore) fail('needs --explore 0');
  if (!cfg.record || cfg.record.length !== 1 || cfg.record[0] !== cfg.learner) fail('needs --record ' + cfg.learner);
  if (cfg.topK !== undefined) fail("--top-k isn't ported: the model's own setting is used");
  const pool = cfg.pool.map((id) => {
    if (id === cfg.learner) return 'learner';
    const n = id.startsWith('ml:') ? N.nativeId('nc:' + path.resolve(id.slice(3)))
      : id === 'lucky-cat' ? N.nativeId('lc:js/mahjong-lucky-cat-weights.js') : N.nativeId(id);
    if (!n) fail(id + " can't play on the native simulator (build it with make -C native; see docs/machine-learning/native.md)");
    return n;
  });
  const weights = N.nativeId('nc:' + (cfg.weightsFile || 'js/mahjong-ml-weights.js'));
  if (!weights) fail("Neural Cat can't play on the native simulator as it stands (node scripts/ml/native.js parity, then pin)");
  const sim = path.join(__dirname, '..', '..', 'native', 'build', (args.exact ? 'lcm-sim-exact' : 'lcm-sim') + (process.platform === 'win32' ? '.exe' : ''));
  // A finished shard is kept (shard-N.done.json says what made it): a run that was
  // stopped part way picks up at the shards it hadn't finished.
  const replays = args.replays ? ['--replays', String(args.replays), '--replay-share', String(args['replay-share'] || 0.25)] : [];
  const key = (c) => JSON.stringify([c.seed, c.deals, weights, pool, cfg.temperature, cfg.epsilon, cfg.sample, !!args.exact, E.GAME_VERSION, replays]);
  return (c) => new Promise((resolve, reject) => {
    const done = path.join(cfg.out, 'shard-' + c.index + '.done.json');
    try {
      const was = JSON.parse(fs.readFileSync(done, 'utf8'));
      if (was.key === key(c) && fs.existsSync(path.join(cfg.out, 'shard-' + c.index + '.features'))) return resolve(was.result);
    } catch (e) { /* not there yet */ }
    execFile(sim, ['generate-nc', '--weights', weights.slice(3), '--temperature', String(cfg.temperature), '--epsilon', String(cfg.epsilon),
      '--sample', String(cfg.sample), '--seed', String(c.seed), '--deals', String(c.deals), '--shard', String(c.index),
      '--strategy', String(known.indexOf(cfg.learner)), '--pool', pool.join(','), '--out', cfg.out].concat(replays), { maxBuffer: 1 << 24 },
    (err, stdout, stderr) => {
      if (err) return reject(new Error('lcm-sim generate-nc: ' + (stderr || err.message)));
      const result = JSON.parse(stdout);
      fs.writeFileSync(done, JSON.stringify({ key: key(c), result }));
      resolve(result);
    });
  });
}

// parity: the JS and the native simulator (its exact build) write the same bytes.
function parity(args) {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcm-rows-'));
  const deals = String(args.deals || 200);
  const pool = String(args.pool || 'neural-cat,neural-cat,jorge-yau,lucky-cat');
  const base = ['--deals', deals, '--workers', String(args.workers || 2), '--seed', String(args.seed || 4242), '--lineup', 'mix', '--pool', pool,
    '--record', 'neural-cat', '--explore', '0', '--sample', String(args.sample || 0.3),
    '--temperature', String(args.temperature || 150), '--epsilon', String(args.epsilon || 0.05)].concat(args.weights ? ['--weights', String(args.weights)] : []);
  const run = (name, extra) => {
    const r = spawnSync('node', [__filename].concat(base, ['--out', path.join(dir, name)], extra), { encoding: 'utf8' });
    if (r.status) throw new Error(name + ' failed: ' + (r.stderr || r.stdout));
  };
  run('js', []);
  run('native', ['--native', '--exact']);
  let bytes = 0, bad = 0;
  fs.readdirSync(path.join(dir, 'js')).filter((f) => f.startsWith('shard-')).sort().forEach((f) => {
    const a = fs.readFileSync(path.join(dir, 'js', f));
    const b = fs.existsSync(path.join(dir, 'native', f)) ? fs.readFileSync(path.join(dir, 'native', f)) : Buffer.alloc(0);
    bytes += a.length;
    if (a.equals(b)) return;
    bad++;
    let at = 0;
    while (at < a.length && at < b.length && a[at] === b[at]) at++;
    console.log('  ' + f + ': differs at byte ' + at + ' (JS ' + a.length + ' bytes, native ' + b.length + ')');
  });
  fs.rmSync(dir, { recursive: true, force: true });
  if (bad) { console.log('generate parity: ' + bad + ' shard file' + (bad > 1 ? 's differ' : ' differs') + ' over ' + deals + ' deals'); process.exit(1); }
  console.log('generate parity: the native simulator wrote the JS rows byte for byte (' + deals + ' deals, ' + bytes + ' bytes)');
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.argv[2] === 'parity') return parity(args);
  const learner = String(args.learner || 'neural-cat');
  if (!LEARNERS[learner]) throw new Error('unknown --learner ' + learner + ' (have: ' + Object.keys(LEARNERS).join(', ') + ')');
  const prefix = LEARNERS[learner].prefix;
  const pool = args.pool ? String(args.pool).split(',') : null;
  const lineup = !args.lineup || args.lineup === 'mix' ? 'mix' : String(args.lineup).split(',');
  const models = (pool || []).concat(lineup === 'mix' ? [] : lineup).filter((id) => id.startsWith(prefix));
  const extra = [learner].concat(S.labIds(), models).filter((id) => S.ids().indexOf(id) === -1);
  const known = S.ids().concat(extra.filter((id, k) => extra.indexOf(id) === k));
  if (lineup !== 'mix' && lineup.length !== 4) throw new Error('--lineup needs four strategy ids, or "mix"');
  (lineup === 'mix' ? (pool || known) : lineup).forEach((id) => {
    if (known.indexOf(id) === -1) throw new Error('unknown strategy ' + id + ' (have: ' + known.join(', ') + ')');
  });
  const deals = Math.max(1, parseInt(args.deals || 1000, 10));
  const seed = parseInt(args.seed || 1, 10);
  const workers = Math.max(1, Math.min(deals, parseInt(args.workers || Math.max(1, os.cpus().length - 1), 10)));
  const out = path.resolve(String(args.out || path.join('ml', 'data', stamp())));
  fs.mkdirSync(out, { recursive: true });
  const cfgBase = {
    lineup, pool: pool || S.ids(), out, learner,
    record: args.record ? String(args.record).split(',') : null,
    strategies: known,
    sample: args.sample !== undefined ? parseFloat(args.sample) : 0.3,
    explore: args.explore !== undefined ? parseFloat(args.explore) : 0.05,
    temperature: args.temperature !== undefined ? parseFloat(args.temperature) : 100,
    epsilon: args.epsilon !== undefined ? parseFloat(args.epsilon) : 0.05,
    topK: args['top-k'] !== undefined ? parseInt(args['top-k'], 10) : undefined,
    weightsFile: args.weights ? path.resolve(String(args.weights)) : null,
  };

  console.log('Playing ' + deals + ' deals on ' + workers + ' worker' + (workers > 1 ? 's' : '') + ' into ' + out + (args.native ? ' (native simulator)' : ''));
  const t0 = Date.now();
  const per = Math.ceil(deals / workers);
  const progress = new Array(workers).fill(0);
  let lastLog = 0;
  const jobs = [];
  if (args.replays && !args.native) throw new Error('--replays runs on the native simulator only (--native)');
  const native = args.native ? nativePlan(cfgBase, known, args) : null;
  for (let w = 0; w < workers; w++) {
    const first = w * per;
    const count = Math.min(per, deals - first);
    if (count <= 0) break;
    const cfg = Object.assign({}, cfgBase, { index: w, deals: count, seed: seed + first, progress: 50 });
    if (native) { jobs.push(() => native(cfg)); continue; }
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: cfg });
      worker.on('message', (m) => {
        if (m.done) return resolve(m.done);
        progress[m.index] = m.progress;
        const done = progress.reduce((a, b) => a + b, 0);
        if (Date.now() - lastLog > 10000) {
          lastLog = Date.now();
          const rate = done / ((Date.now() - t0) / 1000);
          console.log('  ' + done + '/' + deals + ' deals, ' + rate.toFixed(1) + '/s, about ' + Math.round((deals - done) / rate) + 's left');
        }
      });
      worker.once('error', reject);
    }));
  }
  const shards = native ? await require('./native.js').pool(jobs, workers) : await Promise.all(jobs);
  const total = shards.reduce((a, s) => a + s.samples, 0);
  const outcomes = OUTCOMES.map((_, i) => shards.reduce((a, s) => a + s.outcomes[i], 0));
  const manifest = {
    featureVersion: F.FEATURE_VERSION,
    featureSize: F.SIZE,
    featureDtype: 'float16',
    groups: F.GROUPS,
    labelBytes: LABEL_BYTES,
    labelFields: [
      ['outcome', 'u8'], ['winFaan', 'u8'], ['payFaan', 'u8'], ['turn', 'u8'],
      ['seat', 'u8'], ['strategy', 'u8'], ['wallLeft', 'u8'], ['explored', 'u8'],
      ['delta', 'f32'], ['dealSeed', 'u32'],
    ],
    auxBytes: H.AUX_BYTES,
    hands: H.HANDS,
    outcomes: OUTCOMES,
    strategies: known,
    gameVersion: E.GAME_VERSION,
    learner,
    native: native ? (args.exact ? 'exact' : 'fast') : false,
    replays: args.replays ? { replays: parseInt(args.replays, 10), share: parseFloat(args['replay-share'] || 0.25), bytes: 30 } : null,
    config: { deals, seed, lineup, pool, record: cfgBase.record, sample: cfgBase.sample, explore: cfgBase.explore, temperature: cfgBase.temperature, epsilon: cfgBase.epsilon, weights: cfgBase.weightsFile },
    shards: shards.map((s) => ({ features: 'shard-' + s.index + '.features', labels: 'shard-' + s.index + '.labels', aux: 'shard-' + s.index + '.aux', replay: args.replays ? 'shard-' + s.index + '.replay' : undefined, samples: s.samples, deals: s.deals })),
    samples: total,
    ms: Date.now() - t0,
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const secs = (Date.now() - t0) / 1000;
  console.log('Wrote ' + total + ' samples from ' + deals + ' deals in ' + secs.toFixed(1) + 's (' + (deals / secs).toFixed(1) + ' deals/s)');
  console.log('Outcomes: ' + OUTCOMES.map((k, i) => k + ' ' + (100 * outcomes[i] / Math.max(1, total)).toFixed(1) + '%').join(', '));
  console.log('Size: ' + ((total * (F.SIZE * 2 + LABEL_BYTES)) / 1e6).toFixed(1) + ' MB');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
