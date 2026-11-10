#!/usr/bin/env node
/* The frontier model's rounds (docs/machine-learning/frontier-plan.md): one
   network, grown from Neural Cat, with heads for the table, the hand and the
   move. Each round:

     1. Data. The champion plays --deals deals on the native simulator
        (generate.js --native), exploring, against earlier champions, Jorge Yau
        and Lucky Cat. Every seat is recorded, read through the champion, with
        the labels of the extra heads (scripts/ml/heads.js).
     2. Arms. Each recipe trains --seeds models from the champion (ml/train.py
        --heads), so a recipe is judged by the average of its seeds, not by
        its luckiest one.
     3. Heads. Each model's report: how often the hand head names the hand a
        seat wins with (against the rules' read), calibration by hand, and
        how well the table heads read the opponents.
     4. Screens, in stages, on fresh deals, on the native simulator's fast
        build (lcm-sim play): the model and the champion each take every seat
        of the same deals at the game's table (the shipped Neural Cat, Jorge
        Yau, Lucky Cat), and the gap is taken deal by deal. The frozen
        benchmark table (game 0.57.9) can't run natively since the native
        port moved on (the contradiction check), and in JS a screen takes
        hours, so it is kept for the bar (bench.js judge). After each
        stage a model that is behind the champion by more than --drop
        standard errors is dropped, so losing arms cost a few thousand deals
        and not forty thousand.
     5. A recipe whose seeds average ahead by more than --keep standard
        errors at the last stage is a candidate. It is not promoted here:
        the bar is bench.js judge (two standard errors, twice, on the exact
        build), and the command is printed.

   Caching: every stage writes its result and is skipped when the result is
   there (the data's manifest and finished shards, each model file, each
   screen's JSON), so a stopped round picks up where it was.
   Pruning: besides the staged screens, data older than --window rounds goes
   to the Trash (never deleted; weights, reports and logs stay).

   npm run ml:frontier -- --rounds 1
   npm run ml:frontier -- report

   Options:
     --rounds N     rounds to run (default 1)
     --deals N      deals a round (default 200000)
     --seeds N      models a recipe (default 3)
     --window N     rounds of data a model trains on, and that are kept (default 3)
     --keep N       keep N rounds of data, if more than the window
     --stages a,b   deals of each screen stage (default 4000,16000,40000)
     --drop X       drop a model behind by more than X standard errors (default 1)
     --candidate X  a recipe is a candidate ahead by more than X standard errors (default 2)
     --recipes SET  heads (step 2, the default), stacked (step 3), replay (step 5)
                    or rank (option replays and the ranking loss, steps 5, 6 and 11)
     --reader FILE  for stacked and replay: the reader, a <name>.heads.json
     --no-reader-yet  leave out the stacked recipes (a lineage's first round)
     --learner-only record the champion's seats alone (rounds 1 to 3 did; every
                    model trained on that fell behind it). Default: every seat
     --sample P     the share of positions recorded (default 0.12; 0.3 learner-only)
     --replays K    the round's data replays a share of its discards K times
                    (--replay-share, default 0.25), for --recipes replay and rank
     --option-replays K  the round's data plays every option a seat weighs on K
                    times at a share of the positions (--option-share, default 0.1;
                    --options, the discards weighed, default 4), for --recipes rank
     --start FILE   the first champion (default: Neural Cat's lab champion,
                    else the model in the game)
     --strategy S   neural-cat (the default) or only-orphans: the learned strategy
                    trained. Only Orphans' rounds start from the model in the game
                    (js/mahjong-only-orphans-weights.js, OT11d), name their models OS<round>
                    and data ml/data/os-<round>, keep state in ml/os, and screen at the
                    same game table (the shipped Neural Cat, Jorge Yau and Lucky Cat)
     --dir DIR      state, log and screens (default ml/fm, or ml/os)
     --workers N    processes (default: CPU cores) */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PYTHON } = require('./python.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA_SEED = 90000000;      // round r's deals: DATA_SEED + (r - 1) * 1,000,000
const SCREEN_SEED = 930000000;   // fresh deals for screens, never the benchmark deck

// The recipes a round tries (--recipes), each trained --seeds times.
//   heads    step 2: the extra heads as outputs (round 1)
//   replay   step 5: replayed labels (below)
//   stacked  step 3: the move network reads the reader's read (--reader, a
//            <name>.heads.json from an earlier round). These train on this
//            round's data alone: the reader learned from earlier rounds', so
//            its read of these rows is as honest as it will be in play. The
//            control trains on the same rows.
const RECIPE_SETS = {
  heads: [
    { id: 'a', what: 'heads at weight 0.5, lr 3e-4', args: ['--lr', '3e-4', '--epochs', '8', '--head-weight', '0.5'] },
    { id: 'b', what: 'heads at weight 0.2, lr 3e-4', args: ['--lr', '3e-4', '--epochs', '8', '--head-weight', '0.2'] },
    { id: 'c', what: 'no extra heads, lr 3e-4 (the control)', args: ['--lr', '3e-4', '--epochs', '8'], plain: true },
  ],
  stacked: [
    { id: 's', what: 'reads the reader, lr 3e-4', args: ['--lr', '3e-4', '--epochs', '8'], plain: true, stacked: true, latest: true },
    { id: 't', what: 'reads the reader, lr 1e-3', args: ['--lr', '1e-3', '--epochs', '6'], plain: true, stacked: true, latest: true },
    { id: 'c', what: 'the same rows, no reader, lr 3e-4 (the control)', args: ['--lr', '3e-4', '--epochs', '8'], plain: true, latest: true },
  ],
  // step 5: replayed labels (the round's data made with --replays). The control
  // trains on the same rows with only their real endings.
  // Rounds 1 and 2 found that one round of the champion's own seats pulls it off
  // course, so these train on the whole window at a gentler rate. The stacked
  // recipe leaves out the data its reader learned from.
  replay: [
    { id: 'p', what: 'replayed labels, the window, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay'], plain: true },
    { id: 'q', what: 'replayed labels and the reader, the window less the reader\'s data, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay'], plain: true, stacked: true, notReaderData: true },
    { id: 'c', what: 'the same window, real endings only, lr 1e-4 (the control)', args: ['--lr', '1e-4', '--epochs', '4'], plain: true },
  ],
  // Steps 5, 6 and 11 together, on data made with --replays and --option-replays: every
  // option a seat weighed at a share of the positions, each played on from there.
  // Round 4 found replayed labels predict better without playing better; these
  // test whether learning which option is best (a ranking loss) moves play.
  rank: [
    { id: 'r', what: 'option replays and the ranking loss, the window, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay', '--options', '--rank-weight', '1'], plain: true },
    { id: 'o', what: 'option replays as values only, no ranking loss, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay', '--options'], plain: true },
    { id: 's', what: 'option replays, the ranking loss and the reader, the window less the reader\'s data, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay', '--options', '--rank-weight', '1'], plain: true, stacked: true, notReaderData: true },
    { id: 'w', what: 'option replays and the ranking loss, a wider body (768, 384) grown from the champion, lr 1e-4', args: ['--lr', '1e-4', '--epochs', '4', '--replay', '--options', '--rank-weight', '1'], plain: true, hidden: '768,384' },
    { id: 'c', what: 'the same window, replayed labels only, lr 1e-4 (the control)', args: ['--lr', '1e-4', '--epochs', '4', '--replay'], plain: true },
  ],
};

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

const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const rel = (f) => path.relative(ROOT, f);

// The learned strategies a round can train: the id its exploring copy has in a
// lineup, the native id prefix of a model, an earlier model's lineup id, and names.
const STRATEGIES = {
  'neural-cat': { learner: 'neural-cat', native: 'nc:', member: 'ml:', name: 'FM', data: 'fm-', dir: 'ml/fm', start: 'js/mahjong-ml-weights.js' },
  'only-orphans': { learner: 'only-orphans', native: 'oo:', member: 'oo:', name: 'OS', data: 'os-', dir: 'ml/os', start: 'js/mahjong-only-orphans-weights.js' },
};
let S = STRATEGIES['neural-cat'];
// A weights file's JSON (a .js weights file too).
const weightsOf = (f) => { try { return require('./weights.js').readWeights(path.resolve(ROOT, f)); } catch (e) { return { meta: {} }; } };

// A screen: the model against the champion at the game's table (scripts/ml/h2h.js).
function screen(file, champ, seed, deals, workers) {
  return require('./h2h.js').headToHead(S.native + file, S.native + champ, null, seed, deals, workers);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  S = STRATEGIES[String(a.strategy || 'neural-cat')];
  if (!S) throw new Error('--strategy: one of ' + Object.keys(STRATEGIES).join(', '));
  const dir = path.resolve(ROOT, String(a.dir || S.dir));
  const stateFile = path.join(dir, 'state.json');
  const logFile = path.join(dir, 'fm.log');
  fs.mkdirSync(dir, { recursive: true });
  const log = (line) => {
    const out = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + line;
    console.log(out);
    fs.appendFileSync(logFile, out + '\n');
  };
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status) throw new Error(cmd + ' ' + args.slice(0, 3).join(' ') + ' exited with ' + r.status + '\n' + (r.stdout || '').slice(-2000));
    return r.stdout;
  };
  const state = readJson(stateFile, null) || { champion: null, members: [], rounds: [] };
  if (a._[0] === 'report') {
    console.log('Champion: ' + state.champion);
    state.rounds.forEach((r) => {
      console.log('Round ' + r.round + ' (' + r.data + '):');
      r.recipes.forEach((x) => console.log('  ' + x.id + ' [' + x.what + ']: ' + x.verdict + (x.gap != null ? ', ' + x.gap.toFixed(1) + ' ± ' + x.se.toFixed(1) + ' points a hand' : '')));
    });
    return;
  }
  if (!state.champion) {
    const lab = S.learner === 'neural-cat' ? readJson(path.join(ROOT, 'ml', 'lab', 'state.json'), null) : null;
    state.champion = a.start ? String(a.start) : lab && lab.champion ? lab.champion : S.start;
    state.members = lab && lab.members ? lab.members.slice(-2) : [];
    log('The first champion is ' + state.champion);
  }
  const rounds = parseInt(a.rounds || 1, 10);
  const deals = parseInt(a.deals || 200000, 10);
  const seeds = parseInt(a.seeds || 3, 10);
  const window = parseInt(a.window || 3, 10);
  const stages = String(a.stages || '4000,16000,40000').split(',').map(Number);
  const drop = parseFloat(a.drop || 1), keep = parseFloat(a.candidate || 2);
  const workers = String(a.workers || os.cpus().length);
  const readerFile = a.reader ? String(a.reader) : null;
  // --no-reader-yet: a lineage's first round has no reader of its own data, so the
  // stacked recipes wait for the next round.
  const RECIPES = (RECIPE_SETS[String(a.recipes || 'heads')] || []).filter((x) => !(x.stacked && !readerFile && a['no-reader-yet']));
  if (!RECIPES.length) throw new Error('--recipes: one of ' + Object.keys(RECIPE_SETS).join(', '));
  // Every seat is recorded (as the lab does) unless --learner-only: rounds 1 to 3 recorded the
  // champion's seats alone, and every model trained on that fell behind it.
  const learnerOnly = !!a['learner-only'];
  // Data kept: the window, or more (--keep N rounds), so a shipped model's data stays.
  const keepRounds = Math.max(parseInt(a.window || 3, 10), parseInt(a.keep || 0, 10));
  const sample = parseFloat(a.sample || (learnerOnly ? 0.3 : 0.12));
  const replays = a.replays ? parseInt(a.replays, 10) : 0, replayShare = parseFloat(a['replay-share'] || 0.25);
  if (String(a.recipes) === 'replay' && !replays) throw new Error('--recipes replay needs --replays K');
  const optionReplays = a['option-replays'] ? parseInt(a['option-replays'], 10) : 0;
  const optionArgs = optionReplays ? ['--option-replays', String(optionReplays), '--options', String(a.options || 4), '--option-share', String(a['option-share'] || 0.1)] : [];
  if (String(a.recipes) === 'rank' && (!replays || !optionReplays)) throw new Error('--recipes rank needs --replays K and --option-replays K');
  if (RECIPES.some((x) => x.stacked) && !readerFile) throw new Error('--recipes stacked needs --reader <name>.heads.json');

  for (let n = 0; n < rounds; n++) {
    const r = state.rounds.length + 1;
    const champ = state.champion;
    const hidden = (weightsOf(champ).meta.hidden || [256, 128]).join(',');
    // 1. Data (cached by its manifest; finished shards are reused).
    const data = path.join('ml', 'data', S.data + r);
    if (!fs.existsSync(path.join(ROOT, data, 'manifest.json'))) {
      const others = state.members.filter((m) => m !== champ).slice(-2).map((m) => S.member + m);
      // Only Orphans plays against the game's table: Neural Cat as well as Jorge Yau and Lucky Cat.
      const opponents = others.concat(S.learner === 'neural-cat' ? ['jorge-yau', 'jorge-yau', 'lucky-cat'] : ['neural-cat', 'jorge-yau', 'lucky-cat']);
      const pool = opponents.map(() => S.learner).concat(opponents);
      log('Round ' + r + ': ' + deals + ' deals on the native simulator, ' + path.basename(champ) + ' exploring against ' + opponents.join(', '));
      run('node', ['scripts/ml/generate.js', '--native', '--deals', String(deals), '--workers', workers, '--lineup', 'mix', '--pool', pool.join(','),
        '--explore', '0', '--sample', String(sample), '--temperature', '150', '--epsilon', '0.05'].concat(S.learner === 'neural-cat' ? [] : ['--learner', S.learner], learnerOnly ? ['--record', S.learner] : [], [
        '--weights', champ, '--seed', String(DATA_SEED + (r - 1) * 1000000), '--out', data].concat(replays ? ['--replays', String(replays), '--replay-share', String(replayShare)] : [], optionArgs)));
    }
    const sets = [];
    for (let k = Math.max(1, r - window + 1); k <= r; k++) sets.push(path.join('ml', 'data', S.data + k));
    // 2. Arms: each recipe, --seeds times (cached by the model file).
    const models = [];
    RECIPES.forEach((rec) => {
      for (let s = 0; s < seeds; s++) {
        const name = S.name + r + rec.id + s;
        const file = path.join('ml', 'models', name + '.json');
        if (!fs.existsSync(path.join(ROOT, file))) {
          log('Round ' + r + ': training ' + name + ' [' + rec.what + ', seed ' + s + ']');
          const readerData = readerFile ? (readJson(path.resolve(ROOT, readerFile), { meta: {} }).meta.data || []) : [];
          const use = rec.latest ? [data] : rec.notReaderData ? sets.filter((d) => readerData.indexOf(d) === -1) : sets;
          run(PYTHON, ['ml/train.py', '--data'].concat(use, ['--name', name, '--init', champ, '--hidden', rec.hidden || hidden, '--seed', String(s), '--patience', '3'],
            rec.plain ? [] : ['--heads'], rec.stacked ? ['--reader', readerFile] : [], rec.args));
          // The model plays with its champion's settings.
          const w = readJson(path.join(ROOT, file));
          const play = (weightsOf(champ).meta || {}).play;
          if (play) { w.meta.play = play; fs.writeFileSync(path.join(ROOT, file), JSON.stringify(w)); }
        }
        models.push({ name, file, recipe: rec.id, alive: true, n: 0, sum: 0, sq: 0, heads: readJson(path.join(ROOT, 'ml', 'models', name + '.heads-report.json'), null) });
      }
    });
    // 3. The heads, by recipe.
    RECIPES.filter((rec) => !rec.plain).forEach((rec) => {
      const reps = models.filter((m) => m.recipe === rec.id && m.heads).map((m) => m.heads);
      if (!reps.length) return;
      const avg = (f) => reps.reduce((t, x) => t + f(x), 0) / reps.length;
      log('Round ' + r + ': recipe ' + rec.id + ' heads: the hand head names the winning hand ' + (100 * avg((x) => x.handHeadNamesWin)).toFixed(1) +
        '% of the time (the rules\' read ' + (100 * avg((x) => x.rulesNameWin)).toFixed(1) + '%); ready AUC ' + avg((x) => x.readyAuc).toFixed(3) +
        ', deals in now AUC ' + avg((x) => x.dealNowAuc).toFixed(3) + ', waits AUC ' + avg((x) => x.waitsAuc).toFixed(3));
    });
    // 4. Screens in stages; a model clearly behind is dropped (cached by the screen's JSON).
    let seed = SCREEN_SEED + r * 1000000;
    for (let k = 0; k < stages.length; k++) {
      const stageDeals = stages[k];
      for (const m of models.filter((x) => x.alive)) {
        const json = path.join(dir, 'screens', m.name + '-' + k + '.json');
        if (!fs.existsSync(json)) writeJson(json, await screen(m.file, champ, seed, stageDeals, parseInt(workers, 10)));
        const res = readJson(json);
        // Pooled over the stages so far, weighted by deals.
        m.n += stageDeals; m.sum += res.gap.points * stageDeals; m.sq += Math.pow(res.gap.standardError * stageDeals, 2);
        m.gap = m.sum / m.n; m.se = Math.sqrt(m.sq) / m.n;
        if (m.gap < -drop * m.se) m.alive = false;
        log('Round ' + r + ' stage ' + (k + 1) + ' (' + stageDeals + ' deals): ' + m.name + ' ' + (m.gap >= 0 ? '+' : '') + m.gap.toFixed(1) + ' ± ' + m.se.toFixed(1) +
          ' points a hand over ' + m.n + ' deals' + (m.alive ? '' : ': dropped'));
      }
      seed += stageDeals;
    }
    // 5. A recipe by the average of its seeds.
    const recipes = RECIPES.map((rec) => {
      const ms = models.filter((m) => m.recipe === rec.id);
      // Judged on the mean of every seed (a dropped seed counts at the gap it was dropped on):
      // dropping a recipe for one unlucky seed drops good recipes about one time in six.
      const done = ms;
      const out = { id: rec.id, what: rec.what, models: ms.map((m) => ({ name: m.name, gap: m.gap, se: m.se, deals: m.n, alive: m.alive })) };
      out.gap = done.reduce((t, m) => t + m.gap, 0) / done.length;
      out.se = Math.sqrt(done.reduce((t, m) => t + m.se * m.se, 0)) / done.length;
      out.verdict = out.gap > keep * out.se ? 'candidate' : 'not ahead';
      return out;
    });
    recipes.forEach((x) => log('Round ' + r + ': recipe ' + x.id + ' [' + x.what + ']: ' + x.verdict + (x.gap != null ? ', ' + (x.gap >= 0 ? '+' : '') + x.gap.toFixed(1) + ' ± ' + x.se.toFixed(1) + ' points a hand' : '')));
    const best = recipes.filter((x) => x.verdict === 'candidate').sort((p, q) => q.gap - p.gap)[0];
    if (best) {
      const top = best.models.filter((m) => m.alive).sort((p, q) => q.gap - p.gap)[0];
      log('Round ' + r + ': ' + top.name + ' is a candidate. The bar: node scripts/ml/bench.js judge ' + S.native + 'ml/models/' + top.name + '.json --vs ' + S.native + champ);
    }
    state.rounds.push({ round: r, data, champion: champ, recipeSet: String(a.recipes || 'heads'), reader: readerFile, recipes });
    writeJson(stateFile, state);
    // Data no round trains on any more goes to the Trash.
    for (let k = 1; k <= r - keepRounds; k++) {
      const old = path.join(ROOT, 'ml', 'data', S.data + k);
      if (!fs.existsSync(old)) continue;
      const to = path.join(os.homedir(), '.Trash', S.data + k + '-' + Date.now());
      try { fs.renameSync(old, to); log('Moved ' + rel(old) + ' to the Trash'); } catch (e) { log('Could not move ' + rel(old) + ' to the Trash: ' + e.message); }
    }
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
