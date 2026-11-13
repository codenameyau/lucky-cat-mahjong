#!/usr/bin/env node
/* Plays full games (four rounds, each dealer in turn, so at least 16 hands)
   and counts the scoring patterns of every winning hand, by strategy.
   Behind docs/strategies/hand-patterns.md.

   node scripts/hand-patterns.js --strategy jorge-yau --games 1000 --seed 7200001 --json out.json
   node scripts/hand-patterns.js --lineup jorge-yau,neural-cat,lucky-cat,only-orphans --games 1000 --seed 7300001
     --strategy ID     the strategy in all four seats (npm run compete -- --list)
     --lineup A,B,C,D  four strategies at one table instead; game k seats them
                       rotated by k, so each sits in every seat equally often
     --games N         full games to play (default 100)
     --seed N          first game's seed; game k plays seed + k (default 1)
     --workers N       worker threads (default: CPU cores - 1)
     --json FILE       write the counts as JSON (by strategy, and for the table)
     --parquet FILE    write every hand as a row, in Parquet (for analysis and
                       the Hugging Face dataset; keep it under the gitignored
                       ml/data/, e.g. ml/data/hand-patterns/). Needs Python with
                       pyarrow (pip install pyarrow); see hand-results-parquet.py
     --csv FILE        the same rows as CSV

   A game is every hand played until the deal has gone round all four rounds;
   a hand is one hand of mahjong, ending in a win or a draw. */

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const START = 1e9; // nobody busts, so every game plays all four rounds
const LIMIT = 13;

// Counts for one strategy: the hands it sat in (a seat each), what it won and
// paid, and the games it finished on top of.
function emptyStrategy() {
  return { seatHands: 0, wins: 0, faan: 0, limitWins: 0, selfDraws: 0, concealedWins: 0, dealIns: 0, points: 0, gamesTop: 0,
    patterns: {}, hands_by_faan: {}, full: {} };
}
function emptyTable() { return { games: 0, hands: 0, draws: 0, gamesNoWinner: 0 }; }
const COUNTS = ['patterns', 'hands_by_faan', 'full'];
function addInto(a, b) {
  for (const k of Object.keys(b)) {
    if (COUNTS.includes(k)) for (const p of Object.keys(b[k])) a[k][p] = (a[k][p] || 0) + b[k][p];
    else a[k] += b[k];
  }
  return a;
}

// A winning hand's full pattern: every scoring item, in a fixed order, with a
// count where an item scores more than once (two dragon pungs), and the faan
// it adds up to, e.g. "Dragon Triplet x2 + Half Flush + Self-Draw = 6".
function fullPattern(items, faan) {
  const by = {};
  for (const it of items) by[it.name] = (by[it.name] || 0) + 1;
  return Object.keys(by).sort().map((nm) => (by[nm] > 1 ? nm + ' x' + by[nm] : nm)).join(' + ') + ' = ' + faan;
}

// The seats' strategies in game k: the lineup rotated by k.
const seatsFor = (lineup, k) => [0, 1, 2, 3].map((s) => lineup[(s + k) % 4]);

async function playGames(lineup, tableName, jobs) {
  const E = require('../js/mahjong-engine.js');
  const S = require('../js/mahjong-strategies.js');
  const table = emptyTable(), by = {};
  for (const id of lineup) by[id] = by[id] || emptyStrategy();
  const rows = [];
  for (const { seed, k } of jobs) {
    const seats = seatsFor(lineup, k);
    const game = E.createGame({ seed, humanSeat: false, dealer: seed % 4, startPoints: START, mode: 'payout' });
    const agents = seats.map((id) => S.createAgent(id));
    let won = 0, handInGame = 0;
    while (!game.over) {
      const dealer = game.dealer, repeat = game.dealerRepeat, round = game.round;
      const res = await E.runHand(game, agents);
      handInGame++;
      table.hands++;
      for (const id of seats) by[id].seatHands++;
      const draw = res.type === 'draw' || res.winner == null;
      rows.push(csvRow(tableName, seats, seed, handInGame, round, dealer, repeat, res, game, draw));
      for (let s = 0; s < 4; s++) by[seats[s]].points += res.deltas ? res.deltas[s] : 0;
      if (draw) { table.draws++; continue; }
      won++;
      const st = by[seats[res.winner]];
      st.wins++;
      if (res.payer != null && res.how !== 'selfDraw') by[seats[res.payer]].dealIns++;
      const f = res.score.faan;
      st.faan += f;
      if (f >= LIMIT) st.limitWins++;
      if (res.how === 'selfDraw') st.selfDraws++;
      if ((res.melds || []).every((m) => m.concealed)) st.concealedWins++;
      const items = res.score.items || [];
      for (const it of items) st.patterns[it.name] = (st.patterns[it.name] || 0) + 1;
      st.hands_by_faan[f] = (st.hands_by_faan[f] || 0) + 1;
      const key = fullPattern(items, f);
      st.full[key] = (st.full[key] || 0) + 1;
    }
    table.games++;
    if (!won) table.gamesNoWinner++;
    // The game's top seat (most points after all four rounds; a tie goes to each).
    const top = Math.max(...game.players.map((p) => p.points));
    game.players.forEach((p, s) => { if (p.points === top) by[seats[s]].gamesTop++; });
  }
  return { table, by, rows };
}

// One hand as a CSV row (the columns are CSV_COLUMNS).
const CSV_COLUMNS = ['table', 'game_seed', 'hand_in_game', 'round', 'dealer_seat', 'dealer_repeat',
  'seat0_strategy', 'seat1_strategy', 'seat2_strategy', 'seat3_strategy', 'result', 'winner_seat', 'winner_strategy',
  'winner_is_dealer', 'how', 'payer_seat', 'payer_strategy', 'winning_tile', 'faan', 'limit', 'base_points', 'winner_points',
  'claimed_melds', 'concealed', 'winner_discards', 'wall_left', 'pattern_count', 'patterns', 'full_hand'];
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function csvRow(tableName, seats, seed, handInGame, round, dealer, repeat, res, game, draw) {
  const wall = game.hand && game.hand.wall ? game.hand.wall.length : '';
  const head = [tableName, seed, handInGame, round, dealer, repeat, ...seats];
  if (draw) return [...head, 'draw', '', '', '', '', '', '', '', '', '', '', '', '', '', '', wall, 0, '', ''].map(csvCell).join(',');
  const w = res.winner, items = res.score.items || [], f = res.score.faan;
  const claimed = (res.melds || []).filter((m) => !m.concealed).length;
  const pats = items.map((it) => it.name + ' (' + it.faan + ')').join('; ');
  const payer = res.how === 'selfDraw' || res.payer == null ? '' : res.payer;
  return [...head, 'win', w, seats[w], w === dealer ? 1 : 0, res.how, payer, payer === '' ? '' : seats[payer],
    res.tile || '', f, f >= LIMIT ? 1 : 0, res.score.points, res.deltas[w], claimed, claimed ? 0 : 1,
    game.hand.seats[w].discards.length, wall, items.length, pats, fullPattern(items, f)].map(csvCell).join(',');
}

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return a;
}

if (!isMainThread) {
  playGames(workerData.lineup, workerData.tableName, workerData.jobs).then((r) => parentPort.postMessage(r));
} else {
  const a = args(process.argv.slice(2));
  const lineup = a.lineup ? String(a.lineup).split(',') : a.strategy ? [a.strategy, a.strategy, a.strategy, a.strategy] : null;
  if (!lineup || lineup.length !== 4) {
    console.error('usage: node scripts/hand-patterns.js (--strategy ID | --lineup A,B,C,D) [--games N] [--seed N] [--workers N] [--json FILE] [--parquet FILE] [--csv FILE]');
    process.exit(1);
  }
  const tableName = a.lineup ? 'mixed' : 'self:' + a.strategy;
  const games = parseInt(a.games || 100, 10), seed = parseInt(a.seed || 1, 10);
  const workers = Math.max(1, Math.min(games, parseInt(a.workers || Math.max(1, os.cpus().length - 1), 10)));
  const jobs = Array.from({ length: games }, (_, k) => ({ seed: seed + k, k }));
  const parts = Array.from({ length: workers }, (_, w) => jobs.filter((_, k) => k % workers === w));
  const t0 = Date.now();
  Promise.all(parts.map((js) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { lineup, tableName, jobs: js } });
    w.on('message', resolve);
    w.on('error', reject);
  }))).then((rs) => {
    const table = rs.map((r) => r.table).reduce(addInto, emptyTable());
    const by = {};
    for (const r of rs) for (const [id, st] of Object.entries(r.by)) by[id] = addInto(by[id] || emptyStrategy(), st);
    const csvPath = a.csv || (a.parquet ? a.parquet + '.tmp.csv' : null);
    if (csvPath) {
      // Every hand, one row each, in game order (gitignored under ml/data/).
      const rows = [].concat(...rs.map((r) => r.rows));
      const key = (row) => row.split(',').slice(1, 3).map(Number);
      rows.sort((x, y) => { const [sx, hx] = key(x), [sy, hy] = key(y); return sx - sy || hx - hy; });
      fs.mkdirSync(path.dirname(csvPath), { recursive: true });
      fs.writeFileSync(csvPath, CSV_COLUMNS.join(',') + '\n' + rows.join('\n') + '\n');
    }
    if (a.parquet) {
      // The rows as typed Parquet (Python with pyarrow does the writing).
      const py = spawnSync(process.env.PYTHON || 'python', [path.join(__dirname, 'hand-results-parquet.py'), csvPath, a.parquet], { stdio: 'inherit' });
      if (!a.csv) fs.rmSync(csvPath, { force: true });
      if (py.status !== 0) { console.error('writing Parquet failed: needs Python with pyarrow (pip install pyarrow)'); process.exitCode = 1; }
    }
    const out = { table: tableName, lineup, seed, games, ...table, strategies: by, seconds: (Date.now() - t0) / 1000 };
    const won = Object.values(by).reduce((s, st) => s + st.wins, 0);
    console.log(`${tableName}: ${table.games} games, ${table.hands} hands (${(table.hands / table.games).toFixed(1)} a game), ${won} won, ${table.draws} with no winner, ${table.gamesNoWinner} games with no winner, ${out.seconds.toFixed(0)}s`);
    for (const [id, st] of Object.entries(by)) console.log(`  ${id}: ${st.wins} wins in ${st.seatHands} seat-hands (${(100 * st.wins / st.seatHands).toFixed(1)}%), ${(st.faan / Math.max(1, st.wins)).toFixed(2)} faan a win, ${st.gamesTop} games on top`);
    if (a.json) fs.writeFileSync(a.json, JSON.stringify(out, null, 2));
  });
}
