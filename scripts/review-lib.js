/* Replays a hand from its seed and reads what the coach says on each of your
   turns, and keeps your feedback on it as cases (docs/strategies/feedback.json)
   that the tests can run. The command line is scripts/review.js. */

'use strict';

const E = require('../js/mahjong-engine.js');
const Coach = require('../js/mahjong-coach.js');
const S = require('../js/mahjong-strategies.js');

const CLAIMS = ['pass', 'pung', 'chow', 'kong', 'win'];
const STOP = new Error('stop');

const clean = (s) => String(s || '').replace(/[\u0001\u0002]/g, '');

function coachFor(id) {
  const strategy = S.get(id);
  return { id: strategy.id, bot: strategy.bot, coach: Coach.forStrategy(strategy.bot) };
}

// Your seat is always seat 0, so its wind says who dealt.
function gameFor(seed, seatWind, round, settings) {
  const game = E.createGame(Object.assign({ dealer: (5 - seatWind) % 4, mode: 'practice' }, settings));
  game.round = round;
  return game;
}

// What the coach's discard rules made of each tile, best discard first.
function candidatesOf(bot, game) {
  const found = bot.analyzeDiscards(game, 0);
  return {
    folding: found.folding,
    list: found.candidates.map((x) => ({
      tile: x.tile,
      group: x.priority,
      tier: x.tier,
      steps: x.shanten,
      plan: (x.analysis.best && x.analysis.best.plan && x.analysis.best.plan.id) || '',
      score: x.score,
      left: found.ctx.unseen[x.index],
    })),
  };
}

function discardText(hint) {
  return [clean(hint.action)].concat((hint.tips || []).map(clean)).filter(Boolean).join(' ');
}

// A turn's picture: everything your seat can see and nothing it can't, so a
// case still reads the same after a change to how the other seats play.
function positionOf(game) {
  const h = game.hand;
  const scalars = {};
  Object.keys(h).forEach((k) => {
    if (k !== 'seed' && (typeof h[k] === 'number' || typeof h[k] === 'string' || typeof h[k] === 'boolean')) scalars[k] = h[k];
  });
  return {
    round: game.round,
    dealer: game.dealer,
    wallLeft: h.wall.length,
    hand: h.seats[0].hand.slice(), // as held: the coach breaks ties by this order
    scalars,
    seats: JSON.parse(JSON.stringify(h.seats.map((s) => ({ melds: s.melds, flowers: s.flowers, discards: s.discards })))),
  };
}

function gameFromPosition(p) {
  const game = E.createGame({ dealer: p.dealer, mode: 'practice' });
  game.round = p.round;
  E.startHand(game, 1);
  const h = game.hand;
  Object.assign(h, p.scalars);
  h.wall = h.wall.slice(0, p.wallLeft);
  p.seats.forEach((s, i) => {
    h.seats[i].melds = s.melds;
    h.seats[i].flowers = s.flowers;
    h.seats[i].discards = s.discards;
  });
  h.seats[0].hand = p.hand.slice();
  return game;
}

// spec: { seed: '3764864992-EE', moves: ['d1', 'pung', 'c1'], lineup: [a, b, c],
//   coach: id, turnMoves: [{ k, d }] from a save file, until: turn number,
//   choose(record, moveText) to play your turns once the moves run out }
// Tiles in `moves` are your discards in order, `kong:b9` declares a kong and
// `win` wins. While moves are left a claim is passed unless the next move
// names it. After them you follow the coach.
async function replay(spec) {
  const parsed = E.parseHandSeed(spec.seed);
  if (!parsed) throw new Error('not a hand seed: ' + spec.seed);
  const coach = coachFor(spec.coach);
  const lineup = spec.lineup || ['lucky-cat', 'lucky-cat', 'lucky-cat'];
  const moves = (spec.moves || []).slice();
  const saved = (spec.turnMoves || []).slice();
  const played = [];
  const turns = [];
  const game = spec.game || gameFor(parsed.seed, parsed.seat, parsed.round);
  let result = null;

  function record(kind, extra) {
    const entry = Object.assign({ kind, number: turns.filter((t) => t.kind === 'turn').length + (kind === 'turn' ? 1 : 0) }, extra);
    turns.push(entry);
    return entry;
  }

  const human = {
    turn(g, seat, opts) {
      const hint = coach.coach.turnHint(g, 0, opts);
      const read = candidatesOf(coach.bot, g);
      const h = g.hand;
      const rec = record('turn', {
        wallLeft: h.wall.length,
        hand: E.sortTiles(h.seats[0].hand),
        drew: h.drawnTile || null,
        melds: h.seats[0].melds.map((m) => m.type + ' ' + m.tiles[0]),
        flowers: h.seats[0].flowers.slice(),
        said: discardText(hint),
        canWin: !!opts.win,
        top: hint.tile || (read.list[0] && read.list[0].tile),
        folding: read.folding,
        candidates: read.list,
        position: positionOf(g),
        movesSoFar: played.slice(),
      });
      let action;
      if (saved.length) {
        const next = saved.shift();
        if (next.k !== 'turn') throw new Error('the save\'s moves don\'t fit this hand');
        action = next.d;
      } else if (moves.length) {
        const token = moves.shift();
        if (CLAIMS.includes(token) && token !== 'win') throw new Error('turn ' + rec.number + ' is a discard, but the next move is ' + token);
        if (token === 'win') action = { type: 'win' };
        else if (token.startsWith('kong:')) action = { type: 'kong', tile: token.slice(5) };
        else if (!h.seats[0].hand.includes(token)) throw new Error('turn ' + rec.number + ': ' + token + ' isn\'t in your hand: ' + rec.hand.join(' '));
        else action = { type: 'discard', tile: token };
      } else {
        action = (spec.choose && spec.choose(rec, opts)) || coach.bot.chooseTurnAction(g, 0, opts);
      }
      rec.played = action.type === 'discard' ? action.tile : action.type === 'kong' ? 'kong:' + action.tile : action.type;
      played.push(rec.played);
      if (spec.until && rec.number >= spec.until) throw STOP;
      return Promise.resolve(action);
    },
    claim(g, seat, opts) {
      const hint = coach.coach.claimHint ? coach.coach.claimHint(g, 0, opts) : null;
      let decision;
      if (saved.length) {
        const next = saved.shift();
        if (next.k !== 'claim') throw new Error('the save\'s moves don\'t fit this hand');
        decision = next.d;
      } else if (moves.length) {
        decision = CLAIMS.includes(moves[0]) ? claimFrom(moves.shift(), opts) : { type: 'pass' };
        if (decision.type !== 'pass') played.push(decision.type);
      } else {
        decision = coach.bot.chooseClaim(g, 0, opts);
        if (decision.type !== 'pass') played.push(decision.type);
      }
      record('claim', { tile: opts.tile, said: hint ? discardText(hint) : '', played: decision.type });
      return Promise.resolve(decision);
    },
  };
  const agents = [human].concat(lineup.map((id) => S.get(id).bot.createBotAgent()));
  try {
    result = await E.runHand(game, agents, {}, { seed: parsed.seed });
  } catch (e) {
    if (e !== STOP) throw e;
  }
  return { game, coach: coach.id, turns, result, moves: played };
}

function claimFrom(token, opts) {
  if (token === 'chow') {
    if (!opts.chows || !opts.chows.length) throw new Error('there\'s no chow on ' + opts.tile);
    return { type: 'chow', tiles: opts.chows[0] };
  }
  return { type: token };
}

// A save file's hand: its seed, lineup and your exact moves.
function specFromSave(data, coach) {
  const p = data && data.payload;
  if (!p || !p.game || !p.game.hand) throw new Error('that save isn\'t in the middle of a hand');
  const game = E.restoreGame(p.game);
  const seat = ((0 - p.game.dealer + 4) % 4) + 1;
  const spec = {
    seed: p.game.hand.seed + '-' + 'ESWN'[seat - 1] + 'ESWN'[p.game.round - 1],
    turnMoves: p.game.hand.moves,
    lineup: p.strategies.seats.slice(1),
    coach: coach || p.strategies.coach,
    game,
  };
  return spec;
}

// Plays the hand many ways, each turn a random one of the coach's top three
// tiles, to find a turn where the coach would throw `tile` with at least
// `minLeft` copies unseen. For when all you have is the seed. Returns the turn
// for each different hand found.
async function find(spec, tile, tries, minLeft) {
  let n = 12345;
  const random = (k) => { n = (n * 1103515245 + 12345) & 0x7fffffff; return (n >> 8) % k; };
  const hits = new Map();
  for (let i = 0; i < tries; i++) {
    const run = await replay(Object.assign({}, spec, {
      choose(rec, opts) {
        if (opts.win || i === 0 || random(3) === 0) return null;
        return { type: 'discard', tile: rec.candidates[Math.min(random(3), rec.candidates.length - 1)].tile };
      },
    }));
    const hit = run.turns.find((t) => t.kind === 'turn' && t.top === tile && t.candidates.find((x) => x.tile === tile).left >= (minLeft || 0));
    if (!hit) continue;
    const key = hit.hand.join(' ');
    if (!hits.has(key)) hits.set(key, hit);
  }
  return [...hits.values()].sort((a, b) => a.number - b.number);
}

// A case passes when the coach's first choice is none of `keep` and, if any
// are named, one of `drop`.
function checkCase(c) {
  const { bot, coach } = coachFor(c.coach);
  const game = gameFromPosition(c.position);
  const read = candidatesOf(bot, game);
  const top = coach.turnHint(game, 0, { kongs: [] }).tile || read.list[0].tile;
  const pass = !(c.keep || []).includes(top) && (!(c.drop || []).length || c.drop.includes(top));
  return { pass, top, read };
}

function caseFrom(spec, turn, feedback) {
  return {
    id: spec.seed + '-t' + turn.number + '-' + (feedback.keep || feedback.drop).join('-'),
    seed: spec.seed,
    moves: turn.movesSoFar,
    turn: turn.number,
    coach: spec.coach,
    keep: feedback.keep || [],
    drop: feedback.drop || [],
    note: feedback.note || '',
    status: 'open',
    position: turn.position,
  };
}

module.exports = { replay, find, specFromSave, checkCase, caseFrom, gameFromPosition, candidatesOf, coachFor };
