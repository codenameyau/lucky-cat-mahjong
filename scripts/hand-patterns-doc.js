// docs/strategies/hand-patterns.md from the 100,000-game run, every hand of
// mixed-100k.csv. Usage: node scripts/hand-patterns-doc.js <mixed-100k.csv> docs/strategies/hand-patterns.md
const fs = require('fs'), readline = require('readline');
const [CSV, OUT] = process.argv.slice(2);

const S = [['jorge-yau', 'Jorge Yau', 'Rules only'], ['neural-cat', 'Neural Cat', 'NC10'], ['lucky-cat', 'Lucky Cat', 'LC34'], ['only-orphans', 'Only Orphans', 'OW1']];
const NAME = Object.fromEntries(S.map(([id, n]) => [id, n]));
const SETS = ['Dragon Triplet', 'Dragon Quad', 'Seat Wind', 'Round Wind', 'Seat and Round Wind'];
const BONUS = ['Self-Draw', 'Concealed', 'Win on Last Tile', 'Win by Kong', 'Win by Double Kong', 'Robbing the Kong', 'No Flowers', 'Seat Flower', 'Seat Season', 'Four Flowers', 'Four Seasons', 'Seven Robbing One', 'Eight Immortals Crossing the Sea', 'Heavenly Hand', 'Earthly Hand'];
const KIND = (p) => (SETS.includes(p) ? 'set' : BONUS.includes(p) ? 'bonus' : 'hand');

function split(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

const blank = () => ({ hands: 0, wins: 0, faan: 0, limit: 0, self: 0, concealed: 0, dealIns: 0, points: 0, top: 0, games: 0,
  dealerHands: 0, dealerWins: 0, pat: {}, patFaan: {}, patPts: {}, byFaan: {}, full: {}, gamePts: [],
  tiles: {}, turns: {}, turnSum: 0, turnVal: {} });
// Turns to win, in bands: [label, lowest, highest].
const TURN_BANDS = [['0 to 8', 0, 8], ['9 to 11', 9, 11], ['12 to 14', 12, 14], ['15 to 17', 15, 17], ['18 to 20', 18, 20], ['21 or more', 21, Infinity]];
const turnBucket = (t) => TURN_BANDS.findIndex(([, lo, hi]) => t >= lo && t <= hi);
// A tile id as its name: c1 1 Character, b5 5 Bamboo, d9 9 Dots, we East Wind, dr Red Dragon.
function tileName(id) {
  const honors = { we: 'East Wind', ws: 'South Wind', ww: 'West Wind', wn: 'North Wind', dr: 'Red Dragon', dg: 'Green Dragon', dw: 'White Dragon', flower: 'a flower (no tile)' };
  if (honors[id]) return honors[id];
  const suit = { c: 'Character', b: 'Bamboo', d: 'Dot' }[id[0]];
  const k = +id.slice(1);
  return suit ? `${k} ${suit === 'Bamboo' ? 'Bamboo' : suit + (k > 1 ? 's' : '')}` : id;
}
const tileGroup = (id) => (id === 'flower' ? 'Flowers' : id[0] === 'w' ? 'Winds' : id[0] === 'd' && id.length === 2 && 'rgw'.includes(id[1]) ? 'Dragons'
  : { c: 'Characters', b: 'Bamboo', d: 'Dots' }[id[0]] + (['1', '9'].includes(id.slice(1)) ? ' (1 or 9)' : ' (2 to 8)'));
const st = Object.fromEntries(S.map(([id]) => [id, blank()]));
const all = blank();
const own = {}; // a pattern's own faan: its most common value
let hands = 0, wins = 0, draws = 0, games = 0, noWinGames = 0, seed0 = Infinity, seed1 = 0;
const wallWin = {}; // wall-left bucket -> [hands ended, won]
let cur = null;
// Per pattern, over every player in every game (wins or not): the faan and
// points each one collected from wins scoring it. Only games where a player
// scored it are stored; the rest count as zero.
const perGame = {}; // pattern -> { faan: [...], pts: [...] } (non-zero games only)
const perGameAll = { faan: [], pts: [] }; // every win, whatever its patterns
const stratPts = {}; // strategy -> pattern -> total points from it, over its games
const stratGames = {}; // strategy -> pattern -> games it won at least once with it
let seatGames = 0;

function closeGame() {
  if (!cur) return;
  games++;
  if (!cur.won) noWinGames++;
  const top = Math.max(...cur.pts);
  cur.seats.forEach((id, s) => { const x = st[id]; x.games++; x.gamePts.push(cur.pts[s] / cur.hands); if (cur.pts[s] === top) x.top++; });
  seatGames += 4;
  cur.seatPat.forEach((pats, s) => {
    const id = cur.seats[s];
    stratPts[id] = stratPts[id] || {}; stratGames[id] = stratGames[id] || {};
    for (const [nm, v] of Object.entries(pats)) {
      const g = perGame[nm] || (perGame[nm] = { faan: [], pts: [] });
      g.faan.push(v[0]); g.pts.push(v[1]);
      stratPts[id][nm] = (stratPts[id][nm] || 0) + v[1];
      stratGames[id][nm] = (stratGames[id][nm] || 0) + 1;
    }
    if (cur.seatWin[s][0]) { perGameAll.faan.push(cur.seatWin[s][0]); perGameAll.pts.push(cur.seatWin[s][1]); }
  });
}

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(CSV) });
  let H = null, I;
  for await (const line of rl) {
    if (!H) { H = split(line); I = Object.fromEntries(H.map((h, i) => [h, i])); continue; }
    const r = split(line);
    const seed = +r[I.game_seed];
    seed0 = Math.min(seed0, seed); seed1 = Math.max(seed1, seed);
    const seats = [r[I.seat0_strategy], r[I.seat1_strategy], r[I.seat2_strategy], r[I.seat3_strategy]];
    if (!cur || cur.seed !== seed) { closeGame(); cur = { seed, seats, pts: [0, 0, 0, 0], hands: 0, seatPat: [{}, {}, {}, {}], seatWin: [[0, 0], [0, 0], [0, 0], [0, 0]] }; }
    cur.hands++; hands++;
    const dealer = +r[I.dealer_seat];
    for (let s = 0; s < 4; s++) { st[seats[s]].hands++; if (s === dealer) st[seats[s]].dealerHands++; }
    if (r[I.result] !== 'win') { draws++; continue; }
    wins++; cur.won = true;
    const w = +r[I.winner_seat], f = +r[I.faan], wp = +r[I.winner_points], how = r[I.how];
    const x = st[seats[w]];
    // Points: on a self-draw each opponent pays a third of what the winner takes.
    cur.pts[w] += wp;
    // (A flower win with no payer is paid by everyone too.)
    if (how === 'selfDraw' || r[I.payer_seat] === '') { for (let s = 0; s < 4; s++) if (s !== w) cur.pts[s] -= wp / 3; }
    else { const p = +r[I.payer_seat]; cur.pts[p] -= wp; st[seats[p]].dealIns++; }
    for (const y of [x, all]) {
      y.wins++; y.faan += f; if (f >= 13) y.limit++; if (how === 'selfDraw') y.self++; if (r[I.concealed] === '1') y.concealed++;
      y.byFaan[f] = (y.byFaan[f] || 0) + 1;
      y.full[r[I.full_hand]] = (y.full[r[I.full_hand]] || 0) + 1;
    }
    if (w === dealer) x.dealerWins++;
    cur.seatWin[w][0] += f; cur.seatWin[w][1] += wp;
    // The winning tile, and the turns it took: the winner's own discards before the win.
    const tile = r[I.winning_tile] || 'flower', turns = +r[I.winner_discards];
    for (const y of [x, all]) {
      y.tiles[tile] = (y.tiles[tile] || 0) + 1;
      y.turns[turns] = (y.turns[turns] || 0) + 1; y.turnSum += turns;
      const tb = turnBucket(turns), tv = y.turnVal[tb] || (y.turnVal[tb] = [0, 0, 0, 0]);
      tv[0]++; tv[1] += f; tv[2] += wp; if (how === 'selfDraw') tv[3]++;
    }
    const items = r[I.patterns] ? r[I.patterns].split('; ') : [];
    const seen = new Set();
    for (const it of items) {
      const m = it.match(/^(.*) \((\d+)\)$/); if (!m) continue;
      const nm = m[1];
      own[nm] = own[nm] || {}; own[nm][m[2]] = (own[nm][m[2]] || 0) + 1;
      if (seen.has(nm)) continue; seen.add(nm);
      const sp = cur.seatPat[w][nm] || (cur.seatPat[w][nm] = [0, 0]); sp[0] += f; sp[1] += wp;
      for (const y of [x, all]) { y.pat[nm] = (y.pat[nm] || 0) + 1; y.patFaan[nm] = (y.patFaan[nm] || 0) + f; y.patPts[nm] = (y.patPts[nm] || 0) + wp; }
    }
    const b = Math.min(5, Math.floor(+r[I.wall_left] / 10));
    wallWin[b] = wallWin[b] || 0; wallWin[b]++;
  }
  closeGame();
  for (const id of Object.keys(st)) st[id].points = st[id].gamePts.reduce((a, v, i) => a, 0);

  const n = (v) => Math.round(v).toLocaleString('en-US');
  const pct = (a, b, d = 1) => (b ? (100 * a / b).toFixed(d) + '%' : '-');
  // A count with its share, e.g. 12,345 (35.4%): a share alone hides how many it is.
  const cp = (a, b, d = 1) => `${n(a)} (${pct(a, b, d)})`;
  const ownFaan = (p) => { const o = own[p] || {}; return Object.keys(o).sort((a, b) => o[b] - o[a])[0]; };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) / a.length); };
  const ppH = (id) => { const x = st[id]; return { m: mean(x.gamePts), se: se(x.gamePts) }; };
  const sgn = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const winSE = (k, N) => 100 * Math.sqrt((k / N) * (1 - k / N) / N);

  let md = `# Hand patterns: what each strategy wins with

Which scoring patterns win hands, how often, and for how much, for each of the four strategies, from **${n(games)} full games** with Jorge Yau, Neural Cat, Lucky Cat and Only Orphans at one table: **${n(hands)} hands**, ${n(wins)} won.

A **hand** is one hand of mahjong, which ends in a win or a draw. A **game** is every hand played until all four rounds are done: each player deals in turn in each round, and a dealer who wins deals again, so a game has at least 16 hands (${(hands / games).toFixed(1)} on average here).

## Contents

- [How it was measured](#how-it-was-measured)
- [Games, hands and wins](#games-hands-and-wins)
- [Points and games won](#points-and-games-won)
- [Win rate and expected faan of each hand pattern](#win-rate-and-expected-faan-of-each-hand-pattern): [by points a game](#sorted-by-points-a-game), [by faan a game](#sorted-by-faan-a-game)
- [Hand patterns by strategy](#hand-patterns-by-strategy)
- [Sets of honors and bonuses](#sets-of-honors-and-bonuses)
- [Wins by total faan](#wins-by-total-faan)
- [Full hands: every pattern of a win, with its faan](#full-hands-every-pattern-of-a-win-with-its-faan)
- [Winning tiles](#winning-tiles)
- [Turns to win](#turns-to-win)
- [What it shows](#what-it-shows)
- [The dataset](#the-dataset)
- [Reproducing it](#reproducing-it)

## How it was measured

- **The table:** the four strategies the game ships, one seat each: Jorge Yau (rules only), Neural Cat NC10, Lucky Cat LC34 and Only Orphans OW1. The seats rotate every game, so each strategy sits in every seat, and deals first, equally often.
- **${n(games)} full games**, game seeds ${n(seed0)} to ${n(seed1)}. Every hand of every game is played, all four rounds.
- **Rules:** the game's own: a 3-faan minimum to win, a 13-faan limit, full-spicy payouts. A self-draw is paid by all three opponents, and a win on a discard only by the player who threw it. Players start with enough points that nobody goes bust, so every game runs all four rounds.
- **Engines:** games 1 to 30,000 were played by the game's JS engine, and the rest by the native C++ simulator's exact build. On a 400-game check the two matched on 7,804 of 7,805 hands.
- **Counting:** a win usually scores several patterns at once, for example Half Flush + Dragon Triplet + Self-Draw, so a pattern's count is the number of wins that scored it. **Hand patterns** say what the hand is. **Sets of honors** are a pung or kong of dragons or a scoring wind. **Bonuses** are how the hand was won, and flowers.
- **Uncertainty:** ± is one standard error. For points, it's over games, since one game's hands aren't independent.

## Games, hands and wins

Every strategy sat in all ${n(hands)} hands, one seat each. ${n(draws)} hands (${pct(draws, hands)}) ended with no winner. ${noWinGames ? n(noWinGames) + ' games had no winner at all.' : 'Every game had at least one winner.'}

| Strategy | Model | Hands won | Win rate per hand | Hands won per game | Average faan a win | Limit hands (% of wins) | Self-drawn (% of wins) | Concealed (% of wins) | Dealt in (per hand) | Won as dealer (of hands it dealt) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
`;
  for (const [id, name, model] of S) {
    const x = st[id];
    md += `| ${name} | ${model} | ${n(x.wins)} | ${pct(x.wins, x.hands, 2)} ± ${winSE(x.wins, x.hands).toFixed(2)} | ${(x.wins / x.games).toFixed(2)} | ${(x.faan / x.wins).toFixed(2)} | ${n(x.limit)} (${pct(x.limit, x.wins)}) | ${cp(x.self, x.wins)} | ${cp(x.concealed, x.wins)} | ${cp(x.dealIns, x.hands, 2)} | ${n(x.dealerWins)} of ${n(x.dealerHands)} (${pct(x.dealerWins, x.dealerHands)}) |\n`;
  }
  md += `| **All** | | ${n(wins)} | ${pct(wins, hands, 2)} (of hands) | ${(wins / games).toFixed(2)} | ${(all.faan / all.wins).toFixed(2)} | ${n(all.limit)} (${pct(all.limit, all.wins)}) | ${cp(all.self, all.wins)} | ${cp(all.concealed, all.wins)} | | |\n`;
  md += `\nA strategy's win rate is the share of all hands it won. Dealt in is the share of hands it paid off a discard.\n`;

  md += `\n## Points and games won\n\n| Strategy | Net points a hand | Games finished on top |\n| --- | ---: | ---: |\n`;
  const byPts = S.slice().sort((a, b) => ppH(b[0]).m - ppH(a[0]).m);
  for (const [id, name] of byPts) { const p = ppH(id); md += `| ${name} | ${sgn(p.m)} ± ${p.se.toFixed(1)} | ${n(st[id].top)} (${pct(st[id].top, st[id].games)}) |\n`; }
  md += `\nNet points a hand is what a seat won less what it paid, averaged over every hand it sat in. Games finished on top is the share of games a strategy ended with the most points; a tie counts for each.\n`;

  // Expected faan and points a game, from every player in every game.
  // values: the non-zero games; the other seatGames - values.length are 0.
  const meanOf = (values) => values.reduce((t, v) => t + v, 0) / seatGames;
  const medianOf = (values) => {
    const zeros = seatGames - values.length;
    const sorted = values.slice().sort((x, y) => x - y);
    const at = (i) => (i < zeros ? 0 : sorted[i - zeros]);
    return seatGames % 2 ? at((seatGames - 1) / 2) : (at(seatGames / 2 - 1) + at(seatGames / 2)) / 2;
  };
  const handPats = Object.keys(all.pat).filter((p) => KIND(p) === 'hand');
  const rows = handPats.map((p) => {
    const g = perGame[p];
    return { p, k: all.pat[p], games: g.faan.length, faanMean: meanOf(g.faan), faanMed: medianOf(g.faan), ptsMean: meanOf(g.pts), ptsMed: medianOf(g.pts) };
  });
  const allRow = { p: '**Any win**', k: wins, games: perGameAll.faan.length, faanMean: meanOf(perGameAll.faan), faanMed: medianOf(perGameAll.faan), ptsMean: meanOf(perGameAll.pts), ptsMed: medianOf(perGameAll.pts), any: true };
  const fx = (v) => (v === 0 ? '0' : v.toFixed(v < 0.1 ? 3 : 2));
  const head = '| Pattern | Its own faan | Win rate per hand | Games a player scores it | Faan a game: mean | Faan a game: median | Points a game: mean | Points a game: median |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
  const row = (x) => `| ${x.p} | ${x.any ? '' : ownFaan(x.p)} | ${cp(x.k, hands, x.k / hands < 0.001 ? 3 : 2)} | ${cp(x.games, seatGames, x.games / seatGames < 0.001 ? 3 : 1)} | ${fx(x.faanMean)} | ${fx(x.faanMed)} | ${x.ptsMean.toFixed(1)} | ${n(x.ptsMed)} |\n`;
  md += `\n## Win rate and expected faan of each hand pattern\n\n`;
  md += `Each pattern's expected value over **every player in every game**: the ${n(seatGames)} games a player sat through (${n(games)} games × 4 players), including every game where that player never won with it.\n\n`;
  md += `- **Faan a game** and **Points a game:** the faan and points a player collected in one game from wins that scored the pattern, as the mean and the median over all ${n(seatGames)}. A game where the player didn't win with the pattern counts as 0. The faan is the whole win's, every other pattern of it included.\n`;
  md += `- **Games a player scores it:** the share of games in which a player won at least once with the pattern. Below 50%, the median is 0: in most games a player doesn't score it at all.\n`;
  md += `- **Win rate per hand:** the share of all ${n(hands)} hands that ended in a win scoring the pattern, by anyone.\n`;
  md += `- **Points** are what the winner collected, before anything paid elsewhere in the game. They double with each faan (8 at 3 faan, 8,192 at the 13-faan limit), so a few big wins pull the means up. **Any win** is every win, whatever its pattern: a player's total from winning, a game.\n`;
  md += `- The data record how hands ended, not what a player was aiming for. These are the values a player gets from each pattern at this table, not the odds of finishing it once going for it. A win can score more than one hand pattern, so the rows overlap.\n`;
  md += `\n### Sorted by points a game\n\n` + head + row(allRow) + rows.slice().sort((a, b) => b.ptsMean - a.ptsMean).map(row).join('');
  md += `\n### Sorted by faan a game\n\n` + head + row(allRow) + rows.slice().sort((a, b) => b.faanMean - a.faanMean).map(row).join('');

  // By strategy: share of each strategy's wins with each pattern.
  const byStrat = (list) => {
    let t = `| Pattern | Faan | ${S.map(([, nm]) => nm).join(' | ')} |\n| --- | ---: | ${S.map(() => '---:').join(' | ')} |\n`;
    for (const p of list) t += `| ${p} | ${ownFaan(p)} | ${S.map(([id]) => cp(st[id].pat[p] || 0, st[id].wins)).join(' | ')} |\n`;
    return t;
  };
  const sortAll = (kind) => Object.keys(all.pat).filter((p) => KIND(p) === kind).sort((a, b) => all.pat[b] - all.pat[a]);
  // Hand patterns by strategy: wins, share of its wins, and games won with it.
  md += `\n## Hand patterns by strategy\n\nEach strategy played all ${n(games)} games. Games won, meaning finished with the most points: ${S.map(([id, nm]) => `${nm} ${n(st[id].top)} (${pct(st[id].top, st[id].games)})`).join(', ')}.\n\n`;
  md += `For each hand pattern and strategy: the hands it won scoring the pattern (and their share of all its wins), and the **games** in which it won at least one hand with it (and their share of its ${n(games)} games).\n\n`;
  md += `| Pattern | Faan | ${S.map(([, nm]) => nm).join(' | ')} |\n| --- | ---: | ${S.map(() => '---:').join(' | ')} |\n`;
  for (const p of sortAll('hand')) {
    md += `| ${p} | ${ownFaan(p)} | ${S.map(([id]) => {
      const k = st[id].pat[p] || 0, g = (stratGames[id] && stratGames[id][p]) || 0;
      return `${n(k)} wins (${pct(k, st[id].wins)}), ${n(g)} games (${pct(g, st[id].games)})`;
    }).join(' | ')} |\n`;
  }
  md += `\n### Points a game from each hand pattern, by strategy\n\nThe mean points a strategy collected in a game from wins scoring each pattern, over all ${n(games)} games it played, with the games it didn't win with the pattern counted as 0.\n\n| Pattern | ${S.map(([, nm]) => nm).join(' | ')} |\n| --- | ${S.map(() => '---:').join(' | ')} |\n`;
  for (const p of sortAll('hand')) md += `| ${p} | ${S.map(([id]) => ((stratPts[id][p] || 0) / st[id].games).toFixed(1)).join(' | ')} |\n`;
  md += `\n## Sets of honors and bonuses\n\nEach strategy's wins scoring each set of honors or bonus, and their share of its wins.\n\n### Sets of honors\n\n` + byStrat(sortAll('set'));
  md += `\n### Bonuses\n\n` + byStrat(sortAll('bonus'));

  const faans = Object.keys(all.byFaan).map(Number).sort((a, b) => a - b);
  md += `\n## Wins by total faan\n\n| Total faan | ${S.map(([, nm]) => nm).join(' | ')} | All |\n| --- | ${S.map(() => '---:').join(' | ')} | ---: |\n`;
  for (const f of faans) md += `| ${f >= 13 ? '13 (limit)' : f} | ${S.map(([id]) => cp(st[id].byFaan[f] || 0, st[id].wins)).join(' | ')} | ${cp(all.byFaan[f], all.wins)} |\n`;
  md += `\nEach strategy's wins at each total faan, and their share of its wins.\n`;

  const fullTable = (full, total, k) => {
    const keys = Object.keys(full).sort((a, b) => full[b] - full[a]).slice(0, k);
    return '| Full hand (every pattern, = total faan) | Wins | % of wins |\n| --- | ---: | ---: |\n' + keys.map((key) => `| ${key} | ${n(full[key])} | ${pct(full[key], total)} |\n`).join('');
  };
  md += `\n## Full hands: every pattern of a win, with its faan\n\nThe most common complete wins: every pattern a win scored, with its total. Patterns that score twice show ×2.\n\n### All four strategies\n\n` + fullTable(all.full, all.wins, 20).replace(/ x(\d)/g, ' ×$1');
  for (const [id, name, model] of S) md += `\n### ${name} (${model})\n\n` + fullTable(st[id].full, st[id].wins, 12).replace(/ x(\d)/g, ' ×$1');

  // Winning tiles: the tile that completed each win.
  const tileRows = Object.keys(all.tiles).sort((a, b) => all.tiles[b] - all.tiles[a]);
  md += `\n## Winning tiles\n\nThe tile that completed each of the ${n(wins)} wins, whether drawn or claimed from a discard. A win on flowers alone has no winning tile.\n\n### The most common winning tiles\n\n| Rank | Tile | Wins |\n| ---: | --- | ---: |\n`;
  tileRows.slice(0, 15).forEach((t, i) => { md += `| ${i + 1} | ${tileName(t)} | ${cp(all.tiles[t], wins, 2)} |\n`; });
  const least = tileRows.filter((t) => t !== 'flower').slice(-3).reverse();
  md += `\nThe least common: ${least.map((t) => `${tileName(t)}, ${cp(all.tiles[t], wins, 2)}`).join('; ')}.\n`;
  const groups = {};
  for (const t of tileRows) groups[tileGroup(t)] = (groups[tileGroup(t)] || 0) + all.tiles[t];
  const groupOrder = ['Characters (2 to 8)', 'Bamboo (2 to 8)', 'Dots (2 to 8)', 'Characters (1 or 9)', 'Bamboo (1 or 9)', 'Dots (1 or 9)', 'Winds', 'Dragons', 'Flowers'].filter((g) => groups[g]);
  const kinds = { 'Characters (2 to 8)': 7, 'Bamboo (2 to 8)': 7, 'Dots (2 to 8)': 7, 'Characters (1 or 9)': 2, 'Bamboo (1 or 9)': 2, 'Dots (1 or 9)': 2, Winds: 4, Dragons: 3 };
  md += `\n### By kind of tile\n\nPer kind, and per tile of that kind, so groups of different sizes compare.\n\n| Kind | Tiles in it | Wins | Wins per tile |\n| --- | ---: | ---: | ---: |\n`;
  for (const g of groupOrder) md += `| ${g} | ${kinds[g] || '-'} | ${cp(groups[g], wins)} | ${kinds[g] ? n(groups[g] / kinds[g]) : '-'} |\n`;
  md += `\n"Tiles in it" is how many different tiles the kind has, each in the wall 4 times: a suit's 2 to 8 is 7 tiles, its 1 and 9 are 2, the winds 4 and the dragons 3.\n`;
  md += `\n### Each strategy's most common winning tiles\n\n| Rank | ${S.map(([, nm]) => nm).join(' | ')} |\n| ---: | ${S.map(() => '---').join(' | ')} |\n`;
  for (let i = 0; i < 8; i++) {
    md += `| ${i + 1} | ${S.map(([id]) => { const x = st[id]; const t = Object.keys(x.tiles).sort((a, b) => x.tiles[b] - x.tiles[a])[i]; return t ? `${tileName(t)}: ${cp(x.tiles[t], x.wins)}` : ''; }).join(' | ')} |\n`;
  }

  // Turns to win: the winner's own discards before the win.
  const medianTurns = (x) => { const half = x.wins / 2; let acc = 0; for (const t of Object.keys(x.turns).map(Number).sort((a, b) => a - b)) { acc += x.turns[t]; if (acc >= half) return t; } return 0; };
  md += `\n## Turns to win\n\n**Turns** here are the winner's own discards before it won (the dataset's \`winner_discards\`): 12 turns means it had thrown 12 tiles when it won, by drawing the winning tile on its next turn or claiming someone else's discard. A dealer can win before discarding at all.\n\n`;
  md += `| Strategy | Wins | Turns: mean | Turns: median | ${TURN_BANDS.map(([l]) => l).join(' | ')} |\n| --- | ---: | ---: | ---: | ${TURN_BANDS.map(() => '---:').join(' | ')} |\n`;
  for (const [id, name] of S.concat([['all', '**All**']])) {
    const x = id === 'all' ? all : st[id];
    md += `| ${name} | ${n(x.wins)} | ${(x.turnSum / x.wins).toFixed(2)} | ${medianTurns(x)} | ${TURN_BANDS.map((b, i) => cp((x.turnVal[i] || [0])[0], x.wins)).join(' | ')} |\n`;
  }
  md += `\nThe bands are the share of each strategy's wins that took that many turns.\n\n### What a win is worth by how long it took\n\nAll ${n(wins)} wins, by the winner's turns:\n\n| Turns | Wins | Average faan | Points a win | Self-drawn |\n| --- | ---: | ---: | ---: | ---: |\n`;
  TURN_BANDS.forEach(([label], i) => { const v = all.turnVal[i]; if (v) md += `| ${label} | ${cp(v[0], wins)} | ${(v[1] / v[0]).toFixed(2)} | ${n(v[2] / v[0])} | ${cp(v[3], v[0])} |\n`; });
  const turnKeys = Object.keys(all.turns).map(Number).sort((a, b) => all.turns[b] - all.turns[a]);
  md += `\nThe most common is ${turnKeys[0]} turns: ${n(all.turns[turnKeys[0]])} wins, ${pct(all.turns[turnKeys[0]], wins)} of them. The longest win took ${Math.max(...Object.keys(all.turns).map(Number))}.\n`;

  // What it shows, from the numbers above.
  const W = (id) => st[id].wins / st[id].hands;
  const F = (id) => st[id].faan / st[id].wins;
  const byWin = S.slice().sort((a, b) => W(b[0]) - W(a[0]));
  const topG = S.slice().sort((a, b) => st[b[0]].top - st[a[0]].top);
  const hf = rows.find((x) => x.p === 'Half Flush'), ff = rows.find((x) => x.p === 'Full Flush');
  md += `\n## What it shows\n\n`;
  md += `- **Points a hand decide who finishes on top, not hands won.** ${byPts.map(([id, nm]) => `${nm} ${sgn(ppH(id).m)}`).join(', ')} points a hand; games on top: ${topG.map(([id, nm]) => `${nm} ${pct(st[id].top, st[id].games)}`).join(', ')}.\n`;
  md += `- **Hands won, most first:** ${byWin.map(([id, nm]) => `${nm} ${pct(st[id].wins, st[id].hands)}`).join(', ')}. ${NAME[byWin[0][0]]} wins the most hands but averages ${F(byWin[0][0]).toFixed(2)} faan a win; Only Orphans wins the fewest at ${F('only-orphans').toFixed(2)}.\n`;
  const best = rows.slice().sort((a, b) => b.ptsMean - a.ptsMean)[0];
  if (hf && ff) md += `- **Half Flush is the most common winning hand** (${pct(hf.k, hands)} of all hands): a player scores it in ${pct(hf.games, seatGames)} of games, for ${hf.ptsMean.toFixed(1)} points a game on average. **Full Flush** wins fewer hands (${pct(ff.k, hands)}) but is worth ${ff.ptsMean.toFixed(1)} points a game. Of all hand patterns, **${best.p}** is worth the most points a game (${best.ptsMean.toFixed(1)}).\n`;
  const nonZero = rows.filter((x) => x.ptsMed > 0).map((x) => x.p);
  md += `- **Medians are 0 for most patterns**, since a player scores them in fewer than half its games. ${nonZero.length ? `Only ${nonZero.join(' and ')} ${nonZero.length > 1 ? 'have' : 'has'} a median above 0.` : 'None has a median above 0.'} Winning at all, with any pattern, is worth a median of ${n(allRow.ptsMed)} points a game against a mean of ${n(allRow.ptsMean)}, because a few big wins carry the mean.\n`;
  const dragonWins = groups.Dragons || 0, midWins = (groups['Characters (2 to 8)'] || 0) + (groups['Bamboo (2 to 8)'] || 0) + (groups['Dots (2 to 8)'] || 0);
  md += `- **The dragons are the most common winning tiles:** ${tileRows.slice(0, 3).map((t) => tileName(t)).join(', ')}, ${n(dragonWins / 3)} wins each against ${n(midWins / 21)} for a middle suit tile (2 to 8). Winds are the least common, at ${n((groups.Winds || 0) / 4)} each.\n`;
  const fast = all.turnVal[0], slow = all.turnVal[TURN_BANDS.length - 1];
  md += `- **Wins take ${(all.turnSum / all.wins).toFixed(1)} turns on average** (the median is ${medianTurns(all)}), and Lucky Cat takes the longest at ${(st['lucky-cat'].turnSum / st['lucky-cat'].wins).toFixed(1)}. Slower wins score more faan: ${TURN_BANDS[0][0]} turns averages ${(fast[1] / fast[0]).toFixed(1)} faan and ${n(fast[2] / fast[0])} points, ${TURN_BANDS[TURN_BANDS.length - 1][0]} averages ${(slow[1] / slow[0]).toFixed(1)} faan and ${n(slow[2] / slow[0])} points.\n`;
  md += `- **Self-draws:** ${pct(all.self, all.wins)} of wins are self-drawn and pay three times over; the rest are paid by the one player who threw the tile.\n`;
  md += `- **${pct(draws, hands)} of hands end with no winner**${noWinGames ? ', and ' + n(noWinGames) + ' games had none at all' : ', and every game had at least one win'}.\n`;

  md += `
## The dataset

Every hand of this run, one row a hand, is on Hugging Face at [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games) as \`hand-results/mixed-100k.parquet\`, ${n(hands)} rows.

\`\`\`python
from datasets import load_dataset
hands = load_dataset("codenameyau/lucky-cat-mahjong-games", "mixed-100k")["train"]
\`\`\`

| Column | What it holds |
| --- | --- |
| \`table\` | \`mixed\`: all four strategies, one seat each |
| \`game_seed\` | The game's seed; with the seats it replays the whole game |
| \`hand_in_game\` | The hand's number in its game, from 1 |
| \`round\` | The round: 1 East, 2 South, 3 West, 4 North |
| \`dealer_seat\`, \`dealer_repeat\` | The dealer's seat (0 to 3), and how many times in a row it has kept the deal |
| \`seat0_strategy\` to \`seat3_strategy\` | The strategy in each seat |
| \`result\` | \`win\` or \`draw\` |
| \`winner_seat\`, \`winner_strategy\`, \`winner_is_dealer\` | Who won (empty on a draw), its strategy, and 1 if it was the dealer |
| \`how\` | \`selfDraw\`, \`discard\`, \`robKong\` or \`flowers\` |
| \`payer_seat\`, \`payer_strategy\` | Who dealt in (empty on a self-draw) |
| \`winning_tile\` | The tile that completed the hand: \`c1\`-\`c9\` characters, \`d1\`-\`d9\` dots, \`b1\`-\`b9\` bamboo, \`we\`/\`ws\`/\`ww\`/\`wn\` winds, \`dr\`/\`dg\`/\`dw\` dragons |
| \`faan\`, \`limit\` | The hand's total faan, and 1 if it is a limit hand (13) |
| \`base_points\`, \`winner_points\` | The full-spicy payout for that faan, and the points the winner collected (three times it on a self-draw) |
| \`claimed_melds\`, \`concealed\` | Melds claimed from discards, and 1 if none were |
| \`winner_discards\` | The winner's own discards before the win (how fast it won) |
| \`wall_left\` | Tiles left in the wall when the hand ended |
| \`pattern_count\`, \`patterns\` | How many patterns the hand scored, and each with its faan, e.g. \`Half Flush (3); Dragon Triplet (1)\` |
| \`full_hand\` | Every pattern of the win with the total faan, as in the tables above |

## Reproducing it

\`\`\`bash
# Native, about 21 times faster a core: build, then play the 100,000 games in 30 processes.
make -C native -j10
IDS=$(node -e "const N = require('./scripts/ml/native.js'); console.log(['jorge-yau', 'neural-cat', 'lc:js/mahjong-lucky-cat-weights.js', 'only-orphans'].map((id) => N.nativeId(id)).join(','))")
D=ml/data/hand-patterns
mkdir -p $D/parts $D/data
for j in $(seq 0 29); do
  native/build/lcm-sim-exact games --lineup "$IDS" --names jorge-yau,neural-cat,lucky-cat,only-orphans \\
    --seed 8000001 --from $((j * 3334)) --to $(( j == 29 ? 100000 : (j + 1) * 3334 )) --out $D/parts/part-$(printf %02d $j).csv &
done
wait
echo "${H.join(',')}" > $D/data/mixed-100k.csv
cat $D/parts/part-*.csv >> $D/data/mixed-100k.csv
python scripts/hand-results-parquet.py $D/data/mixed-100k.csv $D/data/mixed-100k.parquet

# Or in JS, the game's own engine (about 10 hours on 16 workers):
node scripts/hand-patterns.js --lineup jorge-yau,neural-cat,lucky-cat,only-orphans --games 100000 --seed 8000001 \\
  --csv $D/data/mixed-100k.csv --parquet $D/data/mixed-100k.parquet

# Then this page, from the CSV:
node scripts/hand-patterns-doc.js $D/data/mixed-100k.csv docs/strategies/hand-patterns.md
\`\`\`

The native simulator's \`games\` command plays full games and writes the same rows as \`scripts/hand-patterns.js\`, without the header line. On a 400-game check its exact build matched the JS on 7,804 of 7,805 hands. \`scripts/hand-patterns.js\` writes Parquet with \`--parquet\` (needs Python with \`pyarrow\`) and CSV with \`--csv\`. \`ml/data/\` is gitignored.
`;
  fs.writeFileSync(OUT, md);
  console.log('wrote', OUT, md.length, 'chars;', games, 'games', hands, 'hands', wins, 'wins');
})();
