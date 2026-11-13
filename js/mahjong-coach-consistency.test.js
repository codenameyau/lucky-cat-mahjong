"use strict";
// The coach says the same situation the same way, whichever strategy coaches
// it: Jorge Yau, Lucky Cat Classic, Neural Cat, Lucky Cat and Only Orphans.
// Only each strategy's own numbers differ, and only on Complex: a network's
// score, how often it makes a move, its chance to win; a rule strategy's
// odds of finishing the hand, as its rules work them out.

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./mahjong-engine.js");
const S = require("./mahjong-strategies.js");
const C = require("./mahjong-coach.js");

const IDS = ["jorge-yau", "lucky-cat-classic", "neural-cat", "lucky-cat", "only-orphans"];
const RULES = ["jorge-yau", "lucky-cat-classic"];
const NETWORKS = ["neural-cat", "lucky-cat", "only-orphans"];
const LEVELS = ["simple", "detailed", "complex"];

const clean = (t) => String(t || "").replace(/[\u0001\u0002]/g, "");
const words = (h) => [h.action].concat(h.tips || []).map(clean).filter(Boolean).join(" ");
// A network's own line: its numbers (Complex) or its reasons (Simple, Detailed).
const networkLine = (t) => /^(On average, )?[Tt]he model expects |^Lucky Cat (discards|would) |^Odds to finish /.test(clean(t)) || C.isReasonSentence(clean(t));
const shared = (h) => [h.action].concat(h.tips || []).map(clean).filter((t) => t && !networkLine(t)).join(" | ");
const NUMBERS = /model expects|\bscore\b|chance to win|% of the time|Odds to finish|\d%/;
const NETWORK_NUMBERS = /model expects|\bscore\b|chance to win|% of the time/;
const RULE_ODDS = /^Odds to finish .+ before the wall runs out: about \d+%(, with \d+ tiles? that help\.|\.)( Next best discard is [A-Z][a-z]+ [A-Z][a-z]+: about \d+%\.)?$/;

function coach(id, detail) { return C.forStrategy(S.get(id).bot, { detail }); }

function deal(seed) {
  const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
  E.startHand(game);
  return game;
}

function table(seats) {
  const game = E.createGame({ seed: 11, humanSeat: false, dealer: 0 });
  E.startHand(game);
  game.hand.seats.forEach((s, i) => {
    const mine = seats[i];
    s.hand = mine ? mine.slice() : s.hand.filter((t) => !E.isBonus(t)).slice(0, 13);
    s.melds = []; s.flowers = []; s.discards = [];
  });
  return game;
}

test("a strategy that picks the same discard for the same hand says the same words", () => {
  let groups = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const detail of LEVELS) {
      const by = {};
      for (const id of IDS) {
        const game = deal(seed);
        const h = coach(id, detail).turnHint(game, 0, E.turnOptions(game, 0));
        if (!h || h.kind !== "discard") continue;
        const key = h.tile + " / " + (h.aim && h.aim.name);
        (by[key] = by[key] || []).push([id, shared(h)]);
      }
      for (const [key, list] of Object.entries(by)) {
        if (list.length < 2) continue;
        groups++;
        for (const [id, said] of list.slice(1)) {
          assert.equal(said, list[0][1], "seed " + seed + " " + detail + " " + key + ": " + id + " and " + list[0][0] + " differ");
        }
      }
    }
  }
  assert.ok(groups > 60, "only " + groups + " shared picks compared");
});

test("a hand that claims nothing passes in the same words for every strategy", () => {
  const orphans = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "dr", "dr", "c4", "d5", "b6"];
  const pairs = ["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d1", "b3", "b9", "we", "c5"];
  const triplets = ["c2", "c2", "c2", "d5", "d5", "d5", "b7", "b7", "dr", "dr", "b3", "d2", "c5"];
  const cases = [
    [orphans, "dr", IDS, "Thirteen Orphans claims nothing but the winning tile."],
    [pairs, "d4", ["jorge-yau", "neural-cat", "lucky-cat"], "Seven Pairs claims nothing but the winning tile."],
    [triplets, "dr", ["only-orphans"], "Concealed Triplets claims nothing but the winning tile."],
  ];
  for (const [hand, tile, ids, reason] of cases) {
    for (const id of ids) {
      const h = coach(id, "detailed").claimHint(table([hand]), 0, { tile, pung: true, kong: false, chows: [] });
      assert.equal(h.action, "Pass.", id);
      assert.equal(clean(h.tips[0]), reason, id + ": " + words(h));
    }
  }
});

test("a tile the hand can't use goes for the same reason, said one way", () => {
  const orphans = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "wn", "dr", "dg", "c4", "d5", "b6"];
  let said = 0;
  for (const id of IDS) {
    const h = coach(id, "detailed").turnHint(table([orphans]), 0, { kongs: [] });
    if (E.isTerminalOrHonorIndex(E.tileIndex(h.tile))) continue;
    said++;
    assert.equal(clean(h.tips[0]), "Thirteen Orphans uses only 1s, 9s and honors.", id + ": " + words(h));
  }
  assert.ok(said >= 3, said + " strategies threw a tile Thirteen Orphans can't use");
});

test("no strategy says a hand's tiles or its own name in the old words", async () => {
  const OLD = /\bkeeps only\b|^Not \w+( or an honor)?\.|terminals and honors|I pick it because|Lucky Cat plays |Your target, |never chows|Next most likely is |I like it because/;
  let seen = 0;
  for (const id of IDS) {
    const bot = S.get(id).bot;
    const coaches = LEVELS.map((d) => coach(id, d));
    const check = (h) => {
      if (!h) return;
      seen++;
      for (const t of [h.action].concat(h.tips || [])) {
        for (const part of clean(t).split(/(?<=[.!?])\s+/)) assert.doesNotMatch(part, OLD, id + ": " + clean(t));
      }
    };
    const me = {
      turn(g, s, o) {
        coaches.forEach((c) => check(c.turnHint(g, s, o)));
        return Promise.resolve(bot.chooseTurnAction(g, s, o));
      },
      claim(g, s, o) {
        coaches.forEach((c) => check(c.claimHint(g, s, o)));
        return Promise.resolve(bot.chooseClaim(g, s, o));
      },
    };
    const game = E.createGame({ seed: 9300, humanSeat: false, dealer: 0 });
    await E.runHand(game, [me, S.createAgent("jorge-yau"), S.createAgent("lucky-cat"), S.createAgent("neural-cat")], {});
  }
  assert.ok(seen > 100, "only " + seen + " hints checked");
});

test("every strategy gives its numbers only on Complex: a network its scores, a rule strategy its odds", () => {
  const said = { rule: 0, network: 0 };
  for (let seed = 1; seed <= 12; seed++) {
    for (const id of IDS) {
      for (const detail of LEVELS) {
        const game = deal(seed);
        const h = coach(id, detail).turnHint(game, 0, E.turnOptions(game, 0));
        if (!h) continue;
        if (detail !== "complex") { assert.doesNotMatch(words(h), NUMBERS, id + " " + detail + " " + seed + ": " + words(h)); continue; }
        if (RULES.includes(id)) {
          assert.doesNotMatch(words(h), NETWORK_NUMBERS, id + " " + seed + " has no network: " + words(h));
          const odds = h.tips.map(clean).filter((t) => /^Odds to finish /.test(t));
          odds.forEach((t) => assert.match(t, RULE_ODDS, id + " " + seed));
          said.rule += odds.length;
        } else {
          assert.ok(!h.tips.some((t) => /^Odds to finish /.test(clean(t))), id + " gives its network's numbers, not the rules' odds");
          if (NETWORK_NUMBERS.test(words(h))) said.network++;
        }
      }
    }
  }
  assert.ok(said.rule > 12 && said.network > 20, JSON.stringify(said));
});

test("a rule strategy gives its odds for a claim on Complex, for the call and for passing", () => {
  const triplets = ["c2", "c2", "c2", "d5", "d5", "d5", "b7", "b7", "dr", "dr", "b3", "d2", "c5"];
  for (const id of RULES) {
    const opts = { tile: "dr", pung: true, kong: false, chows: [] };
    const h = coach(id, "complex").claimHint(table([triplets]), 0, opts);
    assert.equal(h.action, "Pung!", id);
    assert.match(clean(h.tips[h.tips.length - 1]), /^Odds to finish All Triplets before the wall runs out: about \d+% if you pung, and about \d+% if you pass\.$/, id + ": " + words(h));
    assert.doesNotMatch(words(coach(id, "detailed").claimHint(table([triplets]), 0, opts)), NUMBERS, id);
  }
});

test("a hint said at any level from the whole hint is the hint at that level", () => {
  for (const id of IDS) {
    for (const seed of [3, 9]) {
      const whole = coach(id, "all").turnHint(deal(seed), 0, E.turnOptions(deal(seed), 0));
      for (const detail of LEVELS) {
        const game = deal(seed);
        assert.equal(words(C.atDetail(whole, detail)), words(coach(id, detail).turnHint(game, 0, E.turnOptions(game, 0))), id + " " + seed + " " + detail);
      }
    }
  }
});

test("each strategy follows your discards on its own", () => {
  const game = deal(5);
  const jy = coach("jorge-yau", "complex"), nc = coach("neural-cat", "complex");
  const pick = jy.turnHint(game, 0, E.turnOptions(game, 0)).tile;
  const other = game.hand.seats[0].hand.find((t) => t !== pick);
  // Two discards away from Jorge Yau's pick; Neural Cat hears of none.
  jy.noteDiscard(game, 0, pick, other);
  jy.noteDiscard(game, 0, pick, other);
  const before = coach("neural-cat", "complex").turnHint(deal(5), 0, E.turnOptions(deal(5), 0));
  assert.equal(words(nc.turnHint(game, 0, E.turnOptions(game, 0))), words(before));
});

test("Detailed keeps every line Complex says, less the network's numbers", () => {
  for (const id of NETWORKS) {
    for (let seed = 1; seed <= 12; seed++) {
      const game = deal(seed);
      const c = coach(id, "complex").turnHint(game, 0, E.turnOptions(game, 0));
      const d = coach(id, "detailed").turnHint(game, 0, E.turnOptions(game, 0));
      if (!c || c.kind !== "discard") continue;
      for (const t of c.tips.filter((x) => !networkLine(x))) assert.ok(d.tips.includes(t), id + " " + seed + " Detailed left out: " + clean(t));
    }
  }
});

test("feedback says the same verdict in the same words, a rule's or a network's", () => {
  const pick = (tile, shanten, score, ml) => ({ tile, index: E.tileIndex(tile), shanten, score, loss: 0, ml });
  const judged = {
    rule: (a, b) => [pick("c1", 1, a.score, null), pick("c2", b.shanten, b.score, null)],
    model: (a, b) => [pick("c1", 1, 0, { ev: a.ev, pWin: 0.2, pDealIn: 0, avgWin: 900 }), pick("c2", b.shanten, 0, { ev: b.ev, pWin: 0.2, pDealIn: 0, avgWin: 900 })],
    policy: (a, b) => [pick("c1", 1, 0, { policy: a.policy }), pick("c2", b.shanten, 0, { policy: b.policy })],
  };
  const cases = [
    // A slower discard: the same two sentences, then a network's numbers.
    { a: { score: 1, ev: 100, policy: 0.6 }, b: { shanten: 2, score: 0.2, ev: 10, policy: 0.05 },
      action: "That discard slows your hand.",
      tips: ["I pick One Character. Nothing connects to it.", "Two Character leaves you 2 tiles from ready, 1 more than One Character."] },
    // Close enough: both work.
    { a: { score: 1, ev: 100, policy: 0.6 }, b: { shanten: 1, score: 0.9, ev: 85, policy: 0.3 },
      action: "Good discard.", tips: ["Both work, but I pick One Character. Nothing connects to it."] },
    // The top choice.
    { a: { score: 1, ev: 100, policy: 0.6 }, b: null, action: "Great discard.", tips: ["One Character was the top choice. Nothing connects to it."] },
  ];
  for (const k of cases) {
    for (const [kind, make] of Object.entries(judged)) {
      const hint = { why: "Nothing connects to it.", candidates: make(k.a, k.b || { shanten: 1, score: 0, ev: 0, policy: 0 }), aim: null };
      const fb = C.discardFeedback(hint, k.b ? "c2" : "c1");
      assert.equal(fb.action, k.action, kind);
      for (const detail of ["simple", "detailed"]) {
        const shaped = C.shapeFeedback(fb, hint, detail);
        assert.doesNotMatch(words(shaped), NUMBERS, kind + " " + detail);
        if (detail === "detailed") assert.deepEqual(shaped.tips.map(clean), k.tips, kind + " " + detail);
      }
      const complex = C.shapeFeedback(fb, hint, "complex");
      assert.deepEqual(complex.tips.filter((t) => !networkLine(t)).map(clean), k.tips, kind + " complex");
      if (kind !== "rule" && k.b) assert.ok(complex.tips.some(networkLine), kind + " gives its numbers on Complex");
    }
  }
});
