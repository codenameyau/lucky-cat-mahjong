#!/usr/bin/env node
/* The frontier benchmark (docs/machine-learning/benchmark.md): one number
   for how strong a model is, and the bar a model must clear to become the
   next generation of its lineage.

   node scripts/ml/bench.js verify
   node scripts/ml/bench.js score lc:ml/models/LS3a.json [--record NAME]
   node scripts/ml/bench.js compare lc:ml/models/LS3a.json lc:ml/models/LS2b.json --deals 10000
   node scripts/ml/bench.js judge lc:ml/models/LS3a.json --lineage lucky-cat [--promote NAME]
   node scripts/ml/bench.js freeze --commit SHA --name hk-table-v1   (how bench/benchmark.json was made)

   verify   checks every pinned file against its SHA-256 and plays the
            fingerprint deals: the frozen opponents on this engine must
            play them exactly as when the benchmark was made. Every other
            command runs it first and refuses to score on a drifted table.
   score    the Table Score: the model takes each seat in turn at the
            benchmark table (frozen Neural Cat NC8, Jorge Yau, NC8) on every
            deal of the benchmark deck, 40,000 deals and 160,000 hands.
            Points a hand, with its standard error deal by deal, and hands
            won, deal-ins, average win and faan. --deals N scores the first N
            deals only (a partial score, never recorded). --record NAME adds
            a full-deck score to bench/scores.json.
   compare  the paired gap between two models at the benchmark table, on
            fresh deals (never the deck): points a hand, the first less the
            second, deal by deal, with its standard error. Played on the
            native simulator's fast build (a screen); --exact plays it on the
            exact build. judge and score always play on the exact build,
            which plays every hand as the JS does (frontier plan §6b).
   judge    the five stages of the bar (bench/benchmark.json "bar") against
            the lineage's current generation (bench/lineages.json, or --vs):
            fair play, screen, qualify, replicate, no regression. It stops
            at the first stage that fails. Qualify and replicate play in
            blocks and stop early when the gap is clearly decided (bar
            block, earlyPass, earlyFail). No regression seats the candidate
            and the current generation each at a table of three of every
            rival (earlier generations, league opponents): against none may
            the candidate do worse by more than 1 standard error. A pass is then scored on the deck;
            --promote NAME records it as the lineage's next generation and
            its Table Score. Every judgment is written to ml/bench/judged/.
            --screened FILE takes a screen already played (compare --json,
            the candidate against the current generation) as the screen.
            --dry-run plays every stage at 1/200 of its deals, to check the
            pipeline; it never promotes. A real judgment is about a million
            hands: some six hours on seven workers.

   Models: lc:<file> is Lucky Cat with those weights, nc:<file> Neural Cat,
   bench:<id> a frozen opponent, any other id a table strategy. A file is a
   path, or git:<commit>:<path> to read it from the repository's history
   (how shipped generations are pinned). Options: --workers N (default:
   CPU cores - 1), --json FILE. */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const BENCH = path.join(ROOT, 'bench');
const LOCAL = path.join(ROOT, 'ml', 'bench');
const E = require('../../js/mahjong-engine.js');

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

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, x) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(x, null, 2) + '\n'); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function benchmark() { return readJson(path.join(BENCH, 'benchmark.json')); }

/* ------------------------------------------------------------------ *
 * Files: a path, or git:<commit>:<path> from the repository's history
 * ------------------------------------------------------------------ */

function resolveFile(spec) {
  const m = /^git:([0-9a-f]{7,40}):(.+)$/.exec(spec);
  if (!m) return path.resolve(ROOT, spec);
  const out = path.join(LOCAL, 'git', m[1], m[2]);
  if (!fs.existsSync(out)) {
    let buf;
    try {
      buf = execFileSync('git', ['show', m[1] + ':' + m[2]], { cwd: ROOT, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      throw new Error('cannot read ' + spec + ' from git (a shallow clone needs the full history: git fetch --unshallow)');
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
  }
  return out;
}

function readWeights(spec) {
  const file = resolveFile(spec);
  if (file.endsWith('.js')) { delete require.cache[file]; return require(file); }
  return readJson(file);
}

// The frozen opponents' files, from the benchmark's commit, checked against their SHA-256.
function frozenDir(bm, check) {
  const dir = path.join(LOCAL, 'git', bm.frozen.commit);
  Object.keys(bm.frozen.files).forEach((f) => {
    const file = resolveFile('git:' + bm.frozen.commit + ':' + f);
    if (check) {
      const got = sha256(fs.readFileSync(file));
      if (got !== bm.frozen.files[f]) throw new Error('bench: ' + f + ' at ' + bm.frozen.commit.slice(0, 9) + ' has SHA-256 ' + got + ', not ' + bm.frozen.files[f]);
    }
  });
  return dir;
}

/* ------------------------------------------------------------------ *
 * Players
 * ------------------------------------------------------------------ */

const bots = {};
function bot(id, bm) {
  if (bots[id]) return bots[id];
  let b;
  if (id.startsWith('bench:')) {
    const what = bm.frozen.players[id.slice(6)];
    if (!what) throw new Error('bench: no frozen player ' + id);
    const mod = require(path.join(frozenDir(bm, false), what.module));
    b = what.create ? mod.create(what.create) : mod;
  } else if (id.startsWith('lc:')) {
    const w = readWeights(id.slice(3));
    const F2 = require('../../js/mahjong-frontier-net.js');
    b = require('../../js/mahjong-lucky-cat-ml.js').create({ weights: w, fast: true, net: w.featureVersion === F2.FEATURE_VERSION ? F2 : undefined });
  } else if (id.startsWith('nc:')) {
    b = require('../../js/mahjong-ml.js').create({ weights: readWeights(id.slice(3)), fast: true });
  } else {
    b = require('../../js/mahjong-strategies.js').get(id).bot;
  }
  return (bots[id] = b);
}

/* ------------------------------------------------------------------ *
 * Play: each model in every seat in turn, the table in the others
 * ------------------------------------------------------------------ */

const blank = () => ({ seats: 0, points: 0, wins: 0, dealIns: 0, winPoints: 0, winFaan: 0, selfDraws: 0, n: 0, sq: 0, winSq: 0 });

async function playWork(job) {
  const bm = job.bm;
  const out = job.models.map(blank);
  const pair = { n: 0, sum: 0, sq: 0, win: 0, winSq: 0 };
  for (let d = job.from; d < job.to; d++) {
    const deal = job.models.map(() => ({ points: 0, wins: 0 }));
    for (let k = 0; k < 4; k++) {
      for (let m = 0; m < job.models.length; m++) {
        const others = bm.table.slice();
        const ids = [0, 1, 2, 3].map((s) => (s === k ? job.models[m] : others.shift()));
        const game = E.createGame({ seed: job.seed + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
        const res = await E.runHand(game, ids.map((id) => bot(id, bm).createBotAgent()));
        const o = out[m];
        o.seats++;
        o.points += res.deltas[k];
        deal[m].points += res.deltas[k] / 4;
        if (res.type === 'win' && res.winner === k) {
          o.wins++; deal[m].wins += 0.25;
          o.winPoints += res.deltas[k];
          o.winFaan += (res.score && res.score.faan) || 0;
          if (res.how === 'selfDraw') o.selfDraws++;
        } else if (res.type === 'win' && res.payer === k) o.dealIns++;
      }
    }
    deal.forEach((x, m) => { out[m].n++; out[m].sq += x.points * x.points; out[m].winSq += x.wins * x.wins; });
    if (deal.length === 2) {
      const g = deal[0].points - deal[1].points, w = deal[0].wins - deal[1].wins;
      pair.n++; pair.sum += g; pair.sq += g * g; pair.win += w; pair.winSq += w * w;
    }
  }
  return { out, pair };
}

// Mean and standard error of n per-deal values from their sum and sum of squares.
function meanSe(n, sum, sq) {
  const mean = sum / n;
  const v = n > 1 ? Math.max(0, (sq - n * mean * mean) / (n - 1)) : 0;
  return { mean, se: Math.sqrt(v / n) };
}

function summarize(models, parts) {
  const sums = models.map(blank);
  const pair = { n: 0, sum: 0, sq: 0, win: 0, winSq: 0 };
  parts.forEach((p) => {
    p.out.forEach((o, m) => Object.keys(o).forEach((k) => { sums[m][k] += o[k]; }));
    Object.keys(pair).forEach((k) => { pair[k] += p.pair[k]; });
  });
  const result = { models: sums.map((o, m) => {
    const pts = meanSe(o.n, o.points / 4, o.sq), win = meanSe(o.n, o.wins / 4, o.winSq);
    return { model: models[m], deals: o.n, hands: o.seats, points: pts.mean, standardError: pts.se,
      winRate: win.mean, winStandardError: win.se, dealInRate: o.dealIns / o.seats,
      averageWin: o.winPoints / Math.max(1, o.wins), averageFaan: o.winFaan / Math.max(1, o.wins), selfDrawShare: o.selfDraws / Math.max(1, o.wins) };
  }) };
  if (models.length === 2 && pair.n) {
    const g = meanSe(pair.n, pair.sum, pair.sq), w = meanSe(pair.n, pair.win, pair.winSq);
    result.gap = { deals: pair.n, points: g.mean, standardError: g.se, winRate: w.mean, winStandardError: w.se };
  }
  return result;
}

// Every core: the parent only waits while the workers play.
const workerCount = (a) => parseInt(a.workers || os.cpus().length, 10);

// Plays `deals` deals from `seed` with each model in turn; workers 0 plays in this process.
// `table`: the three other players (the benchmark table by default).
async function play(models, seed, deals, workers, bm, table) {
  bm = bm || benchmark();
  if (table) bm = Object.assign({}, bm, { table });
  const r = summarize(models, await playParts(models, seed, 0, deals, workers, bm));
  r.simulator = played;
  return r;
}

// Deals [from, to) of the seeds from `seed`, split across the workers: the raw sums.
// The hybrid (frontier plan §6b): the benchmark's own numbers (judgments and
// Table Scores) are played on the exact build, which plays every hand as the
// JS does; screens and training data on the fast one. `simulator` is what this
// process plays on, and `played` what it last actually ran ('js' when a player
// can't run natively).
let simulator = 'fast';
let played = null;
function useSimulator(kind) { simulator = kind; }

async function playParts(models, seed, from, to, workers, bm) {
  const jobs = [];
  const deals = to - from;
  const n = Math.max(1, workers), per = Math.ceil(deals / n);
  for (let k = 0; k < n; k++) if (k * per < deals) jobs.push({ bm, models, seed, from: from + k * per, to: from + Math.min(deals, (k + 1) * per) });
  // The native simulator (native/, npm run native:build) plays the same hands
  // exactly as the JS does, when every player can run there; --js forces the JS.
  if (!process.env.LCM_JS) {
    const parts = require('./native.js').playNativeParts({ bm, models, seed, from, to, exact: simulator === 'exact' }, Math.max(1, workers));
    if (parts) { played = 'native-' + simulator; return parts; }
  }
  played = 'js';
  return workers === 0
    ? [await playWork(jobs[0])]
    : await Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
      const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('message', (m) => { child.kill(); if (m.error) reject(new Error(m.error)); else resolve(m.result); });
      child.on('exit', (code) => { if (code) reject(new Error('bench worker exited with ' + code)); });
      child.send(job);
    })));
}

// Sequential stopping (frontier plan §6): plays in blocks and stops once the
// gap is clearly past the bar (bar.earlyPass SE) or clearly short of it
// (bar.earlyFail SE), after at least one block; otherwise plays all `deals`.
// The early thresholds are far stricter than the bar's, so stopping early
// almost never changes the verdict a full run would give.
async function playSequential(models, seed, deals, workers, bm, bar) {
  const block = Math.min(deals, bar.block || deals);
  const parts = [];
  let r = null;
  for (let from = 0; from < deals; from += block) {
    parts.push(...await playParts(models, seed, from, Math.min(deals, from + block), workers, bm));
    r = summarize(models, parts);
    const sig = r.gap.standardError > 0 ? r.gap.points / r.gap.standardError : 0;
    if (from + block < deals && (sig >= bar.earlyPass || sig <= bar.earlyFail)) { r.stoppedEarly = true; break; }
  }
  r.simulator = played;
  return r;
}

/* ------------------------------------------------------------------ *
 * The pins: SHA-256 of every frozen file, and the fingerprint deals
 * ------------------------------------------------------------------ */

// The fingerprint: the frozen players alone at a table on the first deals
// of the deck. Any change to the engine's rules or to how they play shows.
async function fingerprint(bm) {
  const f = bm.fingerprint;
  const lines = [];
  for (let d = 0; d < f.deals; d++) {
    const game = E.createGame({ seed: bm.deck.start + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
    const res = await E.runHand(game, f.seats.map((id) => bot(id, bm).createBotAgent()));
    lines.push([res.type, res.winner, res.payer, res.how, (res.score && res.score.faan) || 0, res.deltas.join(',')].join('|'));
  }
  return sha256(lines.join('\n'));
}

async function verify(bm) {
  bm = bm || benchmark();
  frozenDir(bm, true);
  const got = await fingerprint(bm);
  if (got !== bm.fingerprint.sha256) {
    throw new Error('bench: the table has drifted (fingerprint ' + got.slice(0, 12) + ', pinned ' + bm.fingerprint.sha256.slice(0, 12) +
      '). The engine\'s rules changed since ' + bm.name + ' was made: scores on it no longer compare. Freeze a new benchmark version.');
  }
  return { name: bm.name, files: Object.keys(bm.frozen.files).length, fingerprint: got };
}

/* ------------------------------------------------------------------ *
 * Fresh deals: seed blocks after the deck, never reused on this machine
 * ------------------------------------------------------------------ */

function inDeck(bm, seed, deals) {
  const a = bm.deck.start, b = bm.deck.start + bm.deck.deals;
  return seed < b && seed + deals > a;
}

function freshSeed(bm, deals) {
  if (deals > bm.fresh.block) throw new Error('bench: ' + deals + ' deals is more than a fresh block (' + bm.fresh.block + ')');
  const file = path.join(LOCAL, 'seeds.json');
  const s = fs.existsSync(file) ? readJson(file) : { next: 0 };
  const seed = bm.fresh.start + s.next * bm.fresh.block;
  s.next++;
  writeJson(file, s);
  return seed;
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

// Whether a stage's numbers pass (pure, so the tests can check the rules).
function stagePasses(stage, gap, bar, keepWinRate) {
  const sigmas = gap.standardError > 0 ? gap.points / gap.standardError : (gap.points > 0 ? Infinity : -Infinity);
  if (stage === 'screen') return { pass: sigmas >= bar.screenSigma, sigmas, why: 'gap ' + sigmas.toFixed(2) + ' SE, needs ' + bar.screenSigma };
  if (stage === 'qualify' || stage === 'replicate') {
    let pass = sigmas >= bar.sigma;
    let why = 'gap ' + sigmas.toFixed(2) + ' SE, needs ' + bar.sigma;
    if (stage === 'qualify' && keepWinRate) {
      const ws = gap.winStandardError > 0 ? gap.winRate / gap.winStandardError : 0;
      if (ws < -bar.winSigma) pass = false;
      why += '; hands won ' + ws.toFixed(2) + ' SE, may not fall below −' + bar.winSigma;
    }
    return { pass, sigmas, why };
  }
  if (stage === 'regression') return { pass: sigmas >= -bar.regressionSigma, sigmas, why: 'gap ' + sigmas.toFixed(2) + ' SE, may not fall below −' + bar.regressionSigma };
  throw new Error('no stage ' + stage);
}

// Fair play for a candidate: it must read only its seat's features, and its
// decisions must not move when the hidden tiles do (scripts/ml/fair-play.js).
async function fairPlay(id) {
  const why = [];
  if (id.startsWith('lc:') || id.startsWith('nc:')) {
    const w = readWeights(id.slice(3));
    if ((w.meta || {}).oracle) why.push('it is an oracle model (meta.oracle)');
    if (w.layers[0].cols !== w.featureSize) why.push('its first layer reads ' + w.layers[0].cols + ' inputs, not its ' + w.featureSize + ' features');
  }
  if (!why.length) {
    try { await require('./fair-play.js').playAll(id, bot(id), null, 4); } catch (err) { why.push(err.message.split('\n')[0]); }
  }
  return { pass: !why.length, why: why.join('; ') || 'reads only its seat; decisions unchanged when hidden tiles move' };
}

function lineages() { return readJson(path.join(BENCH, 'lineages.json')); }

const fmt = (g) => (g.points >= 0 ? '+' : '') + g.points.toFixed(1) + ' ± ' + g.standardError.toFixed(1);

async function judge(a) {
  useSimulator('exact');
  const bm = benchmark();
  const cand = a._[1];
  const lineName = a.lineage;
  const all = lineages();
  const line = all.lineages[lineName];
  if (!cand || !line) throw new Error('usage: bench.js judge <model> --lineage ' + Object.keys(all.lineages).join('|') + ' [--vs <model>] [--promote NAME]');
  const gens = line.generations;
  const current = a.vs || (gens.length ? gens[gens.length - 1].model : null);
  if (!current) throw new Error('bench: ' + lineName + ' has no generation yet; give --vs');
  const workers = workerCount(a);
  // --dry-run: every stage at 1/200 of its deals, to see the pipeline work. Never promotes.
  const dry = !!a['dry-run'];
  const bar = dry ? Object.assign({}, bm.bar, { screen: 50, qualify: 200, replicate: 200, regression: 50, block: 100 }) : bm.bar;
  const record = { candidate: cand, lineage: lineName, current, benchmark: bm.name, dryRun: dry, started: stamp(), stages: [] };
  const dir = path.join(LOCAL, 'judged');
  const save = () => writeJson(path.join(dir, (dry ? 'dry-' : '') + (a.promote || cand.replace(/[^A-Za-z0-9]+/g, '_')) + '.json'), record);
  const log = (s) => console.log(stamp() + ' ' + s);
  await verify(bm);
  log('Judging ' + cand + ' against ' + current + ' (' + lineName + ') on ' + bm.name);

  // The same model spelled two ways (a short and a full commit) is the same model.
  const same = (x, y) => x === y || !!(x && y && modelSha(x) && modelSha(x) === modelSha(y));
  const stop = (stage, why) => { record.passed = false; record.failedAt = stage; save(); log('FAIL at ' + stage + ': ' + why); return record; };

  // Fair play is cheapest, so it runs first: a model that fails it is never played.
  const fp = await fairPlay(cand);
  record.stages.push({ stage: 'fair-play', pass: fp.pass, why: fp.why });
  log('fair play: ' + (fp.pass ? 'pass' : 'FAIL') + ' (' + fp.why + ')');
  if (!fp.pass) return stop('fair-play', fp.why);

  // Screen, qualify, replicate: the candidate against the current generation
  // at the benchmark table. No regression: against each rival, the candidate
  // and the current generation each at a table of three of that rival, on
  // the same deals: the candidate may not do worse against it.
  const paired = async (stage, other, deals) => {
    const seed = a.seed && stage === 'screen' ? parseInt(a.seed, 10) : freshSeed(bm, deals);
    if (inDeck(bm, seed, deals)) throw new Error('bench: fresh deals may not touch the benchmark deck');
    // Qualify and replicate stop early when the gap is clearly decided.
    const r = stage === 'qualify' || stage === 'replicate' ? await playSequential([cand, other], seed, deals, workers, bm, bar)
      : stage === 'regression' ? await play([cand, current], seed, deals, workers, bm, [other, other, other])
      : await play([cand, other], seed, deals, workers, bm);
    const v = stagePasses(stage, r.gap, bar, line.keepWinRate);
    if (r.stoppedEarly) v.why += ' (stopped early at ' + r.gap.deals + ' deals)';
    record.stages.push({ stage, against: other, seed, deals: r.gap.deals, gap: r.gap, models: r.models, pass: v.pass, why: v.why, simulator: r.simulator });
    save();
    log(stage + (stage === 'regression' ? ' against ' + other + ' (less ' + current + ' there)' : ' vs ' + other) + ': ' + fmt(r.gap) + ' points a hand, hands won ' + (100 * r.gap.winRate).toFixed(2) + ' ± ' +
      (100 * r.gap.winStandardError).toFixed(2) + ' points, ' + deals + ' deals: ' + (v.pass ? 'pass' : 'FAIL') + ' (' + v.why + ')');
    return v;
  };

  // --screened FILE: a screen already played (bench.js compare --json, the
  // candidate against the current generation on fresh deals) stands as the
  // screen, instead of a second one. Selection among a round's arms is paid
  // for by qualify and replicate, which play fresh deals at 2 SE each.
  const stages = [['screen', bar.screen], ['qualify', bar.qualify], ['replicate', bar.replicate]];
  if (a.screened) {
    const s = readJson(path.resolve(ROOT, a.screened));
    const ids = (s.models || []).map((m) => m.model);
    if (!same(ids[0], cand) || !same(ids[1], current)) throw new Error('bench: --screened is ' + ids.join(' vs ') + ', not ' + cand + ' vs ' + current);
    if (s.gap.deals < bar.screen) throw new Error('bench: --screened played ' + s.gap.deals + ' deals; the screen needs ' + bar.screen);
    if (inDeck(bm, s.seed, s.gap.deals)) throw new Error('bench: --screened touched the benchmark deck');
    const v = stagePasses('screen', s.gap, bar, line.keepWinRate);
    record.stages.push({ stage: 'screen', against: current, seed: s.seed, deals: s.gap.deals, gap: s.gap, models: s.models, pass: v.pass, why: v.why + ' (screened before the judgment)', from: a.screened });
    save();
    log('screen vs ' + current + ' (already played, ' + a.screened + '): ' + fmt(s.gap) + ' points a hand: ' + (v.pass ? 'pass' : 'FAIL') + ' (' + v.why + ')');
    if (!v.pass) return stop('screen', v.why);
    stages.shift();
  }
  for (const [stage, deals] of stages) {
    const v = await paired(stage, current, deals);
    if (!v.pass) return stop(stage, v.why);
  }
  const rivals = gens.map((g) => g.model).concat(line.league || []).filter((m) => !same(m, current) && !same(m, cand));
  for (const other of rivals) {
    const v = await paired('regression', other, bar.regression);
    if (!v.pass) return stop('regression', 'against ' + other + ': ' + v.why);
  }

  record.passed = true;
  log('PASSED all five stages. Scoring the benchmark deck...');
  const s = await score(cand, dry ? 50 : bm.deck.deals, workers, bm);
  record.tableScore = s;
  record.finished = stamp();
  save();
  log('Table Score ' + (s.full ? '' : '(partial) ') + fmt(s));
  if (a.promote && !dry) {
    promote(lineName, a.promote, cand, record);
    recordScore(a.promote, cand, s, bm);
    log('Promoted ' + a.promote + ': generation ' + (gens.length + 1) + ' of ' + lineName + ', Table Score ' + fmt(s));
  }
  return record;
}

function modelSha(id) {
  const m = /^(lc|nc):(.+)$/.exec(id);
  return m ? sha256(fs.readFileSync(resolveFile(m[2]))) : null;
}

function promote(lineName, name, model, record) {
  const file = path.join(BENCH, 'lineages.json');
  const all = readJson(file);
  all.lineages[lineName].generations.push({ name, model, sha256: modelSha(model), judged: record.finished,
    gaps: record.stages.filter((s) => s.gap).map((s) => ({ stage: s.stage, against: s.against, points: +s.gap.points.toFixed(2), standardError: +s.gap.standardError.toFixed(2) })) });
  writeJson(file, all);
}

/* ------------------------------------------------------------------ *
 * The Table Score
 * ------------------------------------------------------------------ */

async function score(id, deals, workers, bm) {
  bm = bm || benchmark();
  const r = await play([id], bm.deck.start, Math.min(deals, bm.deck.deals), workers, bm);
  return Object.assign({ benchmark: bm.name, full: r.models[0].deals === bm.deck.deals, simulator: r.simulator }, r.models[0]);
}

function recordScore(name, model, s, bm) {
  if (!s.full) throw new Error('bench: only a score on the whole deck is recorded');
  const file = path.join(BENCH, 'scores.json');
  const all = fs.existsSync(file) ? readJson(file) : { scores: [] };
  all.scores = all.scores.filter((x) => !(x.name === name && x.benchmark === bm.name));
  all.scores.push({ name, model, sha256: modelSha(model), benchmark: bm.name, scored: stamp(), gameVersion: E.GAME_VERSION,
    points: +s.points.toFixed(2), standardError: +s.standardError.toFixed(2), winRate: +s.winRate.toFixed(4), dealInRate: +s.dealInRate.toFixed(4),
    averageWin: Math.round(s.averageWin), averageFaan: +s.averageFaan.toFixed(2), deals: s.deals, simulator: s.simulator || 'js' });
  all.scores.sort((x, y) => y.points - x.points);
  writeJson(file, all);
}

function report(r) {
  return r.model + ': ' + fmt(r) + ' points a hand, won ' + (100 * r.winRate).toFixed(2) + '%, dealt in ' + (100 * r.dealInRate).toFixed(2) +
    '%, average win ' + Math.round(r.averageWin) + ' (' + r.averageFaan.toFixed(2) + ' faan), ' + r.deals + ' deals';
}

/* ------------------------------------------------------------------ *
 * Freezing a benchmark version
 * ------------------------------------------------------------------ */

async function freeze(a) {
  const file = path.join(BENCH, 'benchmark.json');
  const bm = readJson(file);
  if (bm.fingerprint && bm.fingerprint.sha256 && !a.force) throw new Error('bench: ' + bm.name + ' is already frozen; a new version gets a new name');
  bm.frozen.commit = execFileSync('git', ['rev-parse', a.commit || bm.frozen.commit], { cwd: ROOT }).toString().trim();
  Object.keys(bm.frozen.files).forEach((f) => { bm.frozen.files[f] = sha256(fs.readFileSync(resolveFile('git:' + bm.frozen.commit + ':' + f))); });
  bm.fingerprint.sha256 = await fingerprint(bm);
  writeJson(file, bm);
  console.log('Froze ' + bm.name + ' at ' + bm.frozen.commit.slice(0, 9) + ': ' + Object.keys(bm.frozen.files).length + ' files, fingerprint ' + bm.fingerprint.sha256.slice(0, 12));
}

async function main(a) {
  const cmd = a._[0];
  const bm = cmd === 'freeze' ? null : benchmark();
  if (cmd === 'freeze') return freeze(a);
  if (cmd === 'verify') { const v = await verify(bm); console.log(v.name + ': ' + v.files + ' pinned files match, fingerprint ' + v.fingerprint.slice(0, 12) + ' matches'); return v; }
  await verify(bm);
  if (cmd === 'score') {
    useSimulator('exact');  // a Table Score is the benchmark's own number
    const s = await score(a._[1], parseInt(a.deals || bm.deck.deals, 10), workerCount(a), bm);
    console.log('Table Score ' + (s.full ? '' : '(partial, ' + s.deals + ' of ' + bm.deck.deals + ' deals) ') + 'on ' + bm.name + '\n  ' + report(s));
    if (a.record) { recordScore(a.record, a._[1], s, bm); console.log('Recorded in bench/scores.json as ' + a.record); }
    if (a.json) writeJson(path.resolve(ROOT, a.json), s);
    return s;
  }
  if (cmd === 'compare') {
    const deals = parseInt(a.deals || bm.bar.screen, 10);
    const seed = a.seed ? parseInt(a.seed, 10) : freshSeed(bm, deals);
    if (inDeck(bm, seed, deals)) throw new Error('bench: compare plays fresh deals; seeds ' + seed + ' onward touch the benchmark deck');
    // A screen plays on the fast build; --exact for a compare whose number must reproduce to the decimal.
    if (a.exact) useSimulator('exact');
    const r = await play([a._[1], a._[2]], seed, deals, workerCount(a), bm);
    r.models.forEach((m) => console.log('  ' + report(m)));
    console.log(a._[1] + ' less ' + a._[2] + ': ' + fmt(r.gap) + ' points a hand (' + (r.gap.points / r.gap.standardError).toFixed(2) + ' SE), seeds from ' + seed + ' (' + r.simulator + ')');
    if (a.json) writeJson(path.resolve(ROOT, a.json), Object.assign({ seed }, r));
    return r;
  }
  if (cmd === 'judge') { const r = await judge(a); if (!r.passed) process.exitCode = 1; return r; }
  throw new Error('usage: bench.js verify|score|compare|judge|freeze (see the top of scripts/ml/bench.js)');
}

if (process.argv[2] === '--worker') {
  process.on('message', (job) => {
    playWork(job).then((result) => process.send({ result })).catch((err) => process.send({ error: err.stack || String(err) }));
  });
} else if (require.main === module) {
  main(parseArgs(process.argv.slice(2))).catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { useSimulator, benchmark, lineages, verify, fingerprint, play, playSequential, score, fairPlay, stagePasses, inDeck, meanSe, resolveFile, promote, recordScore };
