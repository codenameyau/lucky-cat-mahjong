"use strict";

// The fair-play shuffle check, shared by js/mahjong-fair-play.test.js and the
// benchmark's last stage (scripts/ml/bench.js). At real positions from whole
// hands, every decision is made twice: on a copy of the game, and on a copy
// where every tile this seat can't see is shuffled (the other hands, the
// wall, the other players' concealed kongs) and every hidden record (the
// seed, the random number generator, the move log, someone else's drawn
// tile) throws when read. The decisions, and every number behind them, must
// be the same.

const assert = require("node:assert/strict");
const E = require("../../js/mahjong-engine.js");

function copyGame(game) {
  const { rng, ...rest } = game;
  return JSON.parse(JSON.stringify(rest));
}

function trap(obj, key, what) {
  Object.defineProperty(obj, key, {
    get() { throw new Error("peeked at " + what); },
    set() { throw new Error("peeked at " + what); },
    enumerable: false, configurable: true,
  });
}

// A copy where everything `seat` can't see is shuffled or a trap.
function hiddenShuffled(game, seat, rng, ownTurn) {
  const g = copyGame(game);
  const h = g.hand;
  const others = h.seats.filter((s, i) => i !== seat);
  // Every hidden tile's place: the other hands, then the wall.
  const places = [];
  others.forEach((s) => s.hand.forEach((t, k) => { if (!E.isBonus(t)) places.push([s.hand, k]); }));
  h.wall.forEach((t, k) => { if (!E.isBonus(t)) places.push([h.wall, k]); });
  // Another player's concealed kong becomes a kind whose four copies are
  // all hidden, and its tiles go back among the hidden ones.
  others.forEach((s) => s.melds.forEach((m) => {
    if (!m.concealed) return;
    const byKind = {};
    places.forEach((p) => { (byKind[p[0][p[1]]] = byKind[p[0][p[1]]] || []).push(p); });
    const kinds = Object.keys(byKind).filter((k) => byKind[k].length === 4 && k !== m.tiles[0]);
    if (!kinds.length) return;
    const y = kinds[Math.floor(rng() * kinds.length)];
    const x = m.tiles[0];
    byKind[y].forEach((p) => { p[0][p[1]] = x; });
    m.tiles = m.tiles.map(() => y);
  }));
  const tiles = places.map((p) => p[0][p[1]]);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  places.forEach((p, k) => { p[0][p[1]] = tiles[k]; });
  trap(g, "seed", "the game seed");
  trap(g, "rng", "the random number generator");
  trap(h, "seed", "the deal seed");
  trap(h, "moves", "the move log");
  trap(h, "trace", "the move trace");
  if (!ownTurn) trap(h, "drawnTile", "another player's drawn tile");
  return g;
}

// Everything a decision says, as text, so two can be compared exactly.
function said(x) {
  return JSON.stringify(x, (k, v) => (k === "features" ? undefined : v instanceof Float32Array ? Array.from(v) : v));
}

function check(name, bot, coach) {
  const rng = E.createRng(7);
  let turns = 0, claims = 0;
  function both(game, seat, ownTurn, decide) {
    const a = decide(copyGame(game));
    let b;
    try {
      b = decide(hiddenShuffled(game, seat, rng, ownTurn));
    } catch (err) {
      assert.fail(name + " " + err.message);
    }
    assert.equal(said(b), said(a), name + " changed its decision when hidden tiles moved");
  }
  const agent = {
    turn(game, seat, opts) {
      if (turns++ % 3 === 0) {
        both(game, seat, true, (g) => ({
          action: bot.kongChoice ? bot.kongChoice(g, seat, opts) : bot.chooseTurnAction(g, seat, opts),
          discards: bot.analyzeDiscards(g, seat).candidates.map((x) => [x.tile, x.score, x.ml && x.ml.ev]),
          hint: coach && !opts.win ? coach.turnHint(g, seat, opts) : null,
        }));
      }
      return Promise.resolve(bot.chooseTurnAction(game, seat, opts));
    },
    claim(game, seat, opts) {
      if (!opts.win && (opts.pung || opts.kong || opts.chows.length)) {
        claims++;
        both(game, seat, false, (g) => {
          const d = bot.decideClaim(g, seat, opts);
          return {
            decision: d.decision,
            read: d.found && d.found.ml,
            options: d.found && d.found.options.map((o) => [o.decision, o.score]),
            hint: coach ? coach.claimHint(g, seat, opts) : null,
          };
        });
      }
      return Promise.resolve(bot.chooseClaim(game, seat, opts));
    },
  };
  return { agent, counts: () => ({ turns, claims }) };
}

// Plays `deals` whole hands with `bot` in every seat, checking as it goes.
async function playAll(name, bot, coach, deals) {
  const c = check(name, bot, coach);
  for (let d = 0; d < deals; d++) {
    const game = E.createGame({ seed: 4100 + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
    await E.runHand(game, [c.agent, c.agent, c.agent, c.agent]);
  }
  const n = c.counts();
  assert.ok(n.turns > 50 && n.claims > 20, name + ": too few positions checked");
  return n;
}

module.exports = { copyGame, trap, hiddenShuffled, said, check, playAll };
