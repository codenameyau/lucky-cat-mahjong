"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const E = require("./mahjong-engine.js");
const B = require("./mahjong-lucky-cat.js");
const L = require("./mahjong-jorge-yau.js");
const S = require("./mahjong-strategies.js");
const Coach = require("./mahjong-coach.js");
const C = require("./mahjong-competition.js");

function table(opts) {
  const game = E.createGame({ seed: opts.seed || 11, humanSeat: false, dealer: opts.dealer || 0 });
  if (opts.round) game.round = opts.round;
  E.startHand(game);
  const h = game.hand;
  for (let i = 0; i < 4; i++) {
    const s = (opts.seats || [])[i] || {};
    h.seats[i].hand = s.hand ? s.hand.slice() : h.seats[i].hand.filter((t) => !E.isBonus(t)).slice(0, 13);
    h.seats[i].melds = s.melds || [];
    h.seats[i].flowers = s.flowers || [];
    h.seats[i].discards = (s.discards || []).map((t) => ({ tile: t, claimed: false }));
  }
  if (opts.wallLeft !== undefined) h.wall = h.wall.slice(0, opts.wallLeft);
  return game;
}

function pung(tile) {
  return { type: "pung", tiles: [tile, tile, tile], concealed: false, from: 2 };
}

function targetOf(hand, extra) {
  const game = table(Object.assign({ seats: [null, { hand }] }, extra));
  return L.targetFor(game, 1);
}

describe("strategy registry", () => {
  it("lists every strategy, with neural-cat as the coach default", () => {
    assert.deepEqual(S.ids(), ["jorge-yau", "neural-cat", "lucky-cat", "only-orphans"]);
    assert.equal(S.DEFAULT_COACH, "neural-cat");
    // Lucky Cat is its network once weights ship; the classic rules stay a lab strategy.
    assert.equal(S.get("lucky-cat").bot.learned, true);
    assert.equal(S.get("lucky-cat-classic").bot, B);
    assert.equal(S.isLab("lucky-cat-classic"), true);
    assert.equal(S.get("jorge-yau").bot, L);
    assert.equal(S.get("lucky-cat").bot.id, "lucky-cat");
    assert.equal(S.get("jorge-yau").bot.id, "jorge-yau");
    assert.equal(S.has("base"), false);
    S.list().forEach((s) => {
      assert.ok(s.name && s.summary && s.details.length, s.id + " has words for the sheet");
    });
  });

  it("opens each learned strategy's summary with its name and model", () => {
    assert.match(S.get("neural-cat").model, /^NC\d+$/);
    assert.match(S.get("lucky-cat").model, /^LC\d+$/);
    assert.equal(S.get("jorge-yau").model, undefined);
    assert.match(S.get("neural-cat").summary, /^Neural Cat NC\d+ /);
    assert.match(S.get("lucky-cat").summary, /^Lucky Cat LC\d+ /);
    assert.match(S.get("only-orphans").summary, /^Only Orphans O[A-Z]\w+ /);
    assert.match(S.get("jorge-yau").summary, /^Play mahjong the way the founder of Lucky Cat plays\./);
  });

  it("keeps results and training history out of the descriptions", () => {
    S.list().forEach((s) => {
      assert.doesNotMatch(s.summary, /\d+(\.\d+)?%|hands? in \d|one hand in|earlier .* models|trained on/, s.id);
      s.details.forEach((d) => assert.doesNotMatch(d, /^(Its numbers|How it was trained): |\d+(\.\d+)?%|older versions/, s.id + ": " + d));
    });
  });

  it("writes hand names in their canonical form, so the sheet highlights them", () => {
    const NON_CANONICAL = /\b(Big|Small) (Dragons|Winds)\b|(?<!Big |Small )\bThree Dragons\b|(?<!Big |Small )\bFour Winds\b/;
    S.list().forEach((s) => {
      [s.summary].concat(s.details).forEach((t) => assert.doesNotMatch(t, NON_CANONICAL, s.id + ": " + t));
    });
  });

  it("falls back to the default for an unknown id", () => {
    assert.equal(S.has("nope"), false);
    assert.equal(S.get("nope").id, "neural-cat");
  });

  it("picks a random strategy from the list", () => {
    assert.equal(S.randomId(() => 0), "jorge-yau");
    assert.equal(S.randomId(() => 0.99), "only-orphans");
  });

  it("makes agents that play a full hand", async () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0 });
    const agents = ["jorge-yau", "lucky-cat", "jorge-yau", "lucky-cat"].map(S.createAgent);
    const res = await E.runHand(game, agents);
    assert.ok(res.type === "win" || res.type === "draw");
  });

  it("keeps each strategy's tuning to itself", () => {
    const before = B.setTuning({}).defenseScale;
    L.setTuning({ defenseScale: 9 });
    assert.equal(B.setTuning({}).defenseScale, before);
    L.setTuning({ defenseScale: before });
  });
});

describe("jorge-yau opening targets", () => {
  it("reads Thirteen Orphans from 8 different terminals and honors", () => {
    assert.equal(targetOf(["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "c2", "c3", "d4", "d5", "b6"]).id, "orphans");
  });

  it("reads Nine Gates from 7 tiles of a suit's 1112345678999", () => {
    const t = targetOf(["c1", "c1", "c2", "c3", "c4", "c5", "c9", "d2", "d5", "b3", "b7", "ws", "dr"]);
    assert.deepEqual([t.id, t.suit], ["gates", "c"]);
  });

  it("reads Four Winds from 8 winds", () => {
    assert.equal(targetOf(["we", "we", "ws", "ws", "ww", "ww", "wn", "wn", "c2", "c5", "d3", "b7", "b8"]).id, "winds");
  });

  it("reads All Terminals from 8 ones and nines", () => {
    assert.equal(targetOf(["c1", "c1", "c9", "c9", "d1", "d9", "d9", "b1", "b9", "c4", "d5", "b6", "dr"]).id, "terminals");
  });

  it("reads an honors hand from 8 honors", () => {
    assert.equal(targetOf(["we", "we", "ws", "dr", "dr", "dg", "dg", "dw", "c2", "c3", "d4", "b5", "b6"]).id, "honors");
  });

  it("reads Seven Pairs from 4 pairs", () => {
    assert.equal(targetOf(["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d1", "b3", "b9", "we", "dr"]).id, "pairs");
  });

  it("reads a Full Flush from 8 tiles of one suit", () => {
    const t = targetOf(["b2", "b2", "b2", "b4", "b4", "b4", "b6", "b7", "c3", "d6", "we", "dr", "c9"]);
    assert.deepEqual([t.id, t.suit], ["full", "b"]);
  });

  it("reads Concealed Triplets from 1 to 3 sets in hand, in its main suit", () => {
    const t = targetOf(["c2", "c2", "c2", "d5", "d6", "d7", "b1", "b4", "b8", "c5", "c8", "we", "dr"]);
    assert.deepEqual([t.id, t.suit], ["triplets", "c"]);
    // Pairs alone don't make it.
    assert.notEqual(targetOf(["c2", "c2", "d5", "d5", "d7", "b1", "b4", "b8", "c5", "c8", "we", "ws", "dr"]).id, "triplets");
  });

  it("throws a single of another suit first on Concealed Triplets", () => {
    const hand = ["c2", "c2", "c2", "c4", "c5", "dr", "dr", "we", "ws", "c9", "b4", "d6", "b7", "d9"];
    const game = table({ seats: [null, { hand }] });
    assert.equal(L.targetFor(game, 1).id, "triplets");
    assert.ok(["b4", "d6", "b7", "d9"].includes(L.chooseTurnAction(game, 1, { kongs: [] }).tile));
  });

  it("reads a Half Flush from one main suit and honors", () => {
    const t = targetOf(["c1", "c3", "c4", "c6", "c8", "c9", "we", "ws", "dr", "d2", "b5", "d8", "b9"]);
    assert.deepEqual([t.id, t.suit], ["half", "c"]);
  });

  it("on hands of pairs and pungs, throws a single with no copy left first", () => {
    const top = (hand, discards) => L.analyzeDiscards(table({ seats: [{ hand }, { discards }] }), 0).candidates[0].tile;
    // Concealed Triplets: the Three Bamboo is dead (three are out), so it goes before the live singles.
    assert.equal(top(["c5", "c5", "c5", "d3", "d3", "b8", "b8", "c9", "d4", "b3", "we", "ws", "dr", "d5"], ["b3", "b3", "b3"]), "b3");
    // Seven Pairs: the same.
    assert.equal(top(["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d1", "b3", "we", "ws", "dr", "b9"], ["b3", "b3", "b3"]), "b3");
  });

  it("on a hand of runs, throws the loose tile that connects least, a 1 or 9 before a middle tile", () => {
    const order = L.analyzeDiscards(table({ seats: [{ hand: ["c2", "c3", "c4", "d2", "d3", "d4", "we", "we", "b4", "b5", "c8", "dr", "d9", "b1"] }] }), 0)
      .candidates.map((x) => x.tile);
    assert.ok(order.indexOf("b1") < order.indexOf("b4") && order.indexOf("d9") < order.indexOf("b5"), order.join(" "));
    assert.ok(order.indexOf("b1") < order.indexOf("c8"), order.join(" "));
  });

  it("tries the targets in order, with Big Three Dragons after Four Winds and All Triplets after Half Flush", () => {
    assert.deepEqual(L.TARGETS.map((x) => x.id), ["orphans", "gates", "winds", "dragons", "terminals", "honors", "pairs", "full", "triplets", "half", "all-triplets", "sequences", "standard"]);
  });

  it("goes for Big Three Dragons with a pair of every dragon, and not once a dragon is gone", () => {
    const hand = ["dr", "dr", "dg", "dg", "dw", "dw", "c2", "c3", "c5", "d3", "d4", "b7", "b8"];
    assert.equal(targetOf(hand).id, "dragons");
    assert.notEqual(targetOf(hand, { seats: [null, { hand }, { discards: ["dw", "dw"] }] }).id, "dragons");
  });

  it("pivots to the smaller hand late in the wall (20 tiles or fewer)", () => {
    const lead = (hand, wallLeft) => L.analyzeDiscards(table({ seats: [{ hand }], wallLeft }), 0).ctx.leadPlan.id;
    // Big Three Dragons to Small Three Dragons.
    const dragons = ["dr", "dr", "dg", "dg", "dw", "dw", "c2", "c3", "c5", "d3", "d4", "b7", "b8", "c9"];
    assert.equal(lead(dragons, 70), "big-dragons");
    assert.equal(lead(dragons, 20), "small-dragons");
    // Concealed Triplets to Seven Pairs.
    const sets = ["c2", "c2", "c2", "d5", "d5", "b8", "b8", "c9", "d1", "b3", "we", "ws", "dr", "b1"];
    assert.equal(lead(sets, 70), "concealed-triplets");
    assert.equal(lead(sets, 15), "pairs");
    // A target closer to ready than any smaller hand stays.
    const pairs = ["c2", "c2", "d5", "d5", "b8", "b8", "c7", "c7", "d1", "b3", "we", "ws", "dr", "b1"];
    assert.equal(lead(pairs, 15), "pairs");
  });

  it("goes for All Triplets after Half Flush: three pairs and no set, when pairs are as quick as runs", () => {
    assert.equal(targetOf(["c2", "c2", "d5", "d5", "b8", "b8", "c9", "d1", "b3", "we", "ws", "dr", "dg"]).id, "all-triplets");
    // Half Flush comes first.
    assert.equal(targetOf(["c2", "c2", "c5", "c5", "c8", "c8", "c9", "d1", "b3", "we", "ws", "dr", "dg"]).id, "half");
    // Runs that are quicker keep it off.
    assert.notEqual(targetOf(["c2", "c2", "d5", "d5", "b8", "b8", "c3", "c4", "d6", "d7", "b6", "b7", "we"]).id, "all-triplets");
    const ids = L.TARGETS.map((x) => x.id);
    assert.equal(ids.indexOf("all-triplets"), ids.indexOf("half") + 1);
  });

  it("reads Concealed Straights from evenly mixed suits", () => {
    assert.equal(targetOf(["c1", "c3", "c5", "c7", "d2", "d4", "d6", "d8", "b3", "b5", "b7", "b9", "we"]).id, "sequences");
  });

  it("gives up Thirteen Orphans once a missing tile is all out", () => {
    const hand = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "c2", "c3", "d4", "d5", "b6"];
    const game = table({ seats: [null, { hand }, { discards: ["dr", "dr", "dr", "dr"] }] });
    assert.notEqual(L.targetFor(game, 1).id, "orphans");
  });

  it("plays for speed with a seat wind or a seat flower", () => {
    // Dealer is seat 0, so seat 1 is South.
    const windy = table({ seats: [null, { hand: ["c2", "c3", "c4", "d5", "d6", "b1", "b4", "b8", "c8", "we", "dr"], melds: [pung("ws")] }] });
    assert.equal(L.buildContext(windy, 1).fast, true);
    const flower = table({ seats: [null, { hand: ["c2", "c3", "c4", "d5", "d6", "b1", "b4", "b8", "c8", "we", "dr", "d9", "d1"], flowers: ["f2"] }] });
    assert.equal(L.buildContext(flower, 1).fast, true);
    const plain = table({ seats: [null, { hand: ["c2", "c3", "c4", "d5", "d6", "b1", "b4", "b8", "c8", "we", "dr", "d9", "d1"], flowers: ["f3"] }] });
    assert.equal(L.buildContext(plain, 1).fast, false);
  });
});

describe("jorge-yau decisions", () => {
  it("throws a tile the honors hand can't use first", () => {
    const hand = ["we", "we", "ws", "ws", "dr", "dr", "dg", "dg", "dw", "c5", "d4", "b6", "ww", "wn"];
    const game = table({ seats: [null, { hand }] });
    const tile = L.chooseTurnAction(game, 1, { kongs: [] }).tile;
    assert.ok(["c5", "d4", "b6"].includes(tile), tile);
  });

  it("claims nothing on Seven Pairs", () => {
    const hand = ["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d1", "b3", "b9", "we", "c5"];
    const game = table({ seats: [null, { hand }] });
    game.hand.seats[0].discards.push({ tile: "d4", claimed: false });
    assert.deepEqual(L.chooseClaim(game, 1, { tile: "d4", from: 0, pung: true, kong: false, chows: [] }), { type: "pass" });
  });

  it("always pungs a dragon or a scoring wind, early or late, unless it is going for Thirteen Orphans", () => {
    const hand = ["c2", "c3", "c4", "d5", "d6", "b1", "b4", "b8", "c8", "we", "dr", "dr", "d9"];
    const opts = { tile: "dr", from: 0, pung: true, kong: false, chows: [] };
    assert.deepEqual(L.chooseClaim(table({ seats: [null, { hand }] }), 1, opts), { type: "pung" });
    assert.deepEqual(L.chooseClaim(table({ seats: [null, { hand }], wallLeft: 55 }), 1, opts), { type: "pung" });
    // A wind that scores nothing waits, early, like any other tile.
    const plain = ["c2", "c3", "c4", "d5", "d6", "b1", "b4", "b8", "c8", "dr", "wn", "wn", "d9"];
    assert.deepEqual(L.chooseClaim(table({ seats: [null, { hand: plain }] }), 1, { tile: "wn", from: 0, pung: true, kong: false, chows: [] }), { type: "pass" });
    // On Thirteen Orphans it never claims.
    const orphans = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "dr", "dr", "c2", "d5", "b6"];
    assert.equal(targetOf(orphans).id, "orphans");
    assert.deepEqual(L.chooseClaim(table({ seats: [null, { hand: orphans }] }), 1, opts), { type: "pass" });
  });

  it("claims early only to be within two tiles of ready, a pung before a chow, a chow only once the player before it is read", () => {
    // A Characters Half Flush with a dragon pair: punging the dragon leaves it within two tiles of ready, for 3 faan or more.
    const hand = ["c2", "c3", "c4", "c5", "c6", "c8", "c9", "c9", "dr", "dr", "we", "ws", "b3"];
    const pung = { tile: "dr", from: 0, pung: true, kong: false, chows: [] };
    assert.deepEqual(L.chooseClaim(table({ seats: [{}, { hand }] }), 1, pung), { type: "pung" });
    // The same hand could chow the 7 Characters from the player before it, but early, with no read of them yet, it passes.
    const chow = { tile: "c7", from: 0, pung: false, kong: false, chows: [["c5", "c6"], ["c6", "c8"], ["c8", "c9"]] };
    assert.deepEqual(L.chooseClaim(table({ seats: [{}, { hand }] }), 1, chow), { type: "pass" });
    // Once its discards show the suit they feed, the chow is taken.
    const read = table({ seats: [{ discards: ["c1", "c1", "c3", "b1", "b2", "d1"] }, { hand }] });
    assert.equal(L.chooseClaim(read, 1, chow).type, "chow");
  });

  it("won't chow early into a suit it barely holds", () => {
    // Two Bamboos in hand: the 3-4-5 chow is passed even though it's a step closer.
    const hand = ["b3", "b4", "c2", "c3", "c4", "c6", "c7", "d5", "d6", "d7", "dr", "dr", "c9"];
    const game = table({ seats: [{}, { hand }] });
    assert.deepEqual(L.chooseClaim(game, 1, { tile: "b5", from: 0, pung: false, kong: false, chows: [["b3", "b4"]] }), { type: "pass" });
  });
});

describe("a pair stays until a chow of another suit closes All Triplets", () => {
  // Pung of 1 Character, then a lone 3 Bamboo beside a pair of 8 Bamboo.
  // Seed 2510433994 reaches this shape. Both coaches were throwing the pair.
  const hand = ["c2", "c4", "c4", "c7", "c7", "d5", "d7", "b3", "b8", "b8", "dr"];
  function seat(melds) {
    return table({ seats: [{ hand: hand, melds: melds }] });
  }
  function order(bot, game) {
    return bot.analyzeDiscards(game, 0).candidates.map((c) => c.tile);
  }

  it("throws the single before the pair, for both coaches", () => {
    const game = seat([pung("c1")]);
    [B, L].forEach((bot) => {
      const tiles = order(bot, game);
      assert.notEqual(tiles[0], "b8", bot.id);
      assert.ok(tiles.indexOf("b3") < tiles.indexOf("b8"), bot.id + " " + tiles.join(" "));
    });
  });

  it("lets the pair go with the other suit once a different suit has been chowed", () => {
    const chow = { type: "chow", tiles: ["c2", "c3", "c4"], concealed: false, from: 3 };
    const game = seat([chow]);
    [B, L].forEach((bot) => {
      const b8 = bot.analyzeDiscards(game, 0).candidates.find((c) => c.tile === "b8");
      assert.equal(b8.priority, 0, bot.id);
    });
  });
});

describe("Concealed Straights keeps one honor pair", () => {
  const noKongs = { kongs: [] };
  it("throws every other honor first and keeps the pair", () => {
    const hand = ["c2", "c3", "c4", "d5", "d6", "d7", "b3", "b4", "b6", "b7", "wn", "wn", "ws", "ww"];
    const game = table({ seats: [{ hand }], wallLeft: 80 });
    const a = L.analyzeDiscards(game, 0);
    assert.equal(a.ctx.leadPlan.id, "straights");
    const order = a.candidates.map((x) => x.tile);
    assert.deepEqual(order.slice(0, 2).sort(), ["ws", "ww"]);
    assert.ok(order.indexOf("wn") > 2, order.join(" "));
    const hint = Coach.forStrategy(L).turnHint(game, 0, noKongs);
    assert.match(hint.tips.join(" "), /Keep your North Wind pair as the eyes, and throw your other honors first/);
  });

  it("keeps a finished straight and a lone dragon", () => {
    // 36529946-NE, North to play: 5-6-7 dots is already a straight and South
    // is the pair, but the white dragon has three copies left, so it stays.
    const hand = ["b7", "b8", "b9", "b9", "c3", "c5", "c6", "c6", "d5", "d6", "d7", "dw", "ws", "ws"];
    const game = table({ seats: [{ hand }], wallLeft: 70 });
    const bots = [require("./mahjong-bot.js"), B, L];
    bots.forEach((bot) => {
      const top = bot.analyzeDiscards(game, 0).candidates[0];
      assert.equal(bot.analyzeDiscards(game, 0).ctx.leadPlan.id, "straights", bot.id);
      assert.ok(!["dw", "d5", "d6", "d7"].includes(top.tile), bot.id + " threw " + top.tile);
    });
    const hint = Coach.turnHint(game, 0, noKongs);
    assert.equal(hint.tile, "b9");
  });

  it("keeps a dragon or scoring-wind pair ahead of another honor pair", () => {
    const counts = E.countsOf(["wn", "wn", "dr", "dr", "c2"]);
    const ctx = B.buildContext(table({ seats: [{ hand: ["c2"] }] }), 0);
    assert.equal(B.keptHonorPair(counts, ctx), E.tileIndex("dr"));
  });
});

describe("the player before you decides a close flush suit", () => {
  // Seven Bamboo and six Circles: about even.
  const hand = ["b2", "b3", "b4", "b6", "b7", "b8", "b9", "d2", "d3", "d5", "d6", "d8", "d9", "c5"];
  // Seat 3 (on your left) has thrown no Bamboo and mostly Circles.
  const keepsBamboo = ["d1", "d9", "d5", "c1", "c9", "wn", "d5"];
  // A flower that isn't this seat's: Concealed Straights would fall short of
  // 3 faan, so the choice is between the two flushes.
  const at = (discards) => table({ seats: [{ hand, flowers: ["f4"] }, {}, {}, { discards }], wallLeft: 70 });

  it("reads the suit they keep and the suit they throw", () => {
    const read = B.leftRead(at(keepsBamboo), 0);
    assert.deepEqual(read, { seat: 3, keeps: "b", feeds: "d", locked: false, tosses: [] });
    assert.deepEqual(B.leftRead(at([]), 0), { seat: 3, keeps: null, feeds: null, locked: false, tosses: [] });
  });

  it("reads a chow by the player before you: they need that suit and toss the others", () => {
    const game = table({ seats: [{}, {}, {}, { discards: ["d1", "d2", "c9"] }] });
    game.hand.seats[3].melds = [{ type: "chow", tiles: ["b3", "b4", "b5"], concealed: false, from: 2 }];
    const read = B.leftRead(game, 0);
    assert.deepEqual([read.keeps, read.locked, read.tosses, read.feeds], ["b", true, ["c", "d"], "d"]);
  });

  it("lucky-cat leaves the suit they keep for a faster hand", () => {
    assert.equal(B.analyzeDiscards(at([]), 0).ctx.leadPlan.id, "full-b");
    const a = B.analyzeDiscards(at(keepsBamboo), 0);
    assert.notEqual(a.ctx.leadPlan.id, "full-b");
    const hint = Coach.turnHint(at(keepsBamboo), 0, { kongs: [] });
    assert.match(hint.tips.join(" "), /is collecting Bamboo, so stay out of it/);
    assert.equal(hint.tips.join(" ").split("is collecting Bamboo").length, 2);
  });

  it("every coach says when an opponent changes hands", () => {
    const game = table({ seats: [{ hand: ["c2", "c3", "c4", "c6", "c7", "d2", "d3", "d5", "d6", "wn", "we", "ws", "b5", "b9"] }, { discards: ["c1", "d1", "c2", "d2", "b2", "b3", "b7", "b8"] }], wallLeft: 60 });
    const lucky = Coach.forStrategy(B).turnHint(game, 0, { kongs: [] });
    assert.match(lucky.tips.join(" "), /has pivoted out of Bamboo: they kept it early and are throwing it now\./);
    assert.match(Coach.forStrategy(L).turnHint(game, 0, { kongs: [] }).tips.join(" "), /has pivoted out of Bamboo: they kept it early and are throwing it now\./);
  });

  it("jorge-yau gives up a Bamboo flush target", () => {
    assert.equal(L.targetFor(at([]), 0).suit, "b");
    assert.notEqual(L.targetFor(at(keepsBamboo), 0).suit, "b");
  });
});

describe("a flush keeps a dragon pair", () => {
  // 2902793872-WE, once the next player has shown they are collecting
  // Characters. The hand already has a red dragon pair; Four and Six
  // Character are the short chain in the other suit.
  const hand = ["c4", "c6", "b1", "b3", "b4", "b6", "b6", "b7", "b7", "b8", "dw", "dg", "dr", "dr"];
  const game = table({
    seats: [{ hand }, { discards: ["d6", "d9", "b6", "b8", "d3", "d7"] }],
    wallLeft: 60,
  });

  it("throws that chain instead of the red dragon", () => {
    const found = L.analyzeDiscards(game, 0);
    assert.equal(found.ctx.leadPlan.id, "full-b");
    assert.ok(found.candidates[0].tile === "c4" || found.candidates[0].tile === "c6", found.candidates[0].tile);
    const hint = Coach.forStrategy(L).turnHint(game, 0, { kongs: [] });
    assert.equal(hint.tile, found.candidates[0].tile);
    assert.match(hint.action, /^Discard (Four|Six) Character/);
  });
});

describe("the player after you is not fed the suit they need", () => {
  const Base = require("./mahjong-bot.js");
  const chow = (tiles) => ({ type: "chow", tiles, concealed: false, from: 0 });
  const bambooChow = chow(["b2", "b3", "b4"]);
  const bambooPung = { type: "pung", tiles: ["b6", "b6", "b6"], concealed: false, from: 2 };
  // Eight Dots, so the two spare tiles are both off that suit.
  const hand = ["d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "c9", "b9", "we", "ws", "wn", "dr"];
  const five = ["c1", "c9", "d1", "d4", "wn"];
  const wantBamboo = (discards) => {
    const threats = Base.opponentThreats(table({ seats: [null, { discards }], wallLeft: 55 }), 0);
    return threats.find((t) => t.seat === 1).want[E.tileIndex("b5")];
  };

  it("reads their suit by the fifth discard, and a chow locks it at once", () => {
    assert.equal(Base.afterRead(table({ seats: [null, { discards: five.slice(0, 4) }] }), 0).keeps, null);
    const read = Base.afterRead(table({ seats: [null, { discards: five }] }), 0);
    assert.equal(read.seat, 1);
    assert.equal(read.keeps, "b");
    assert.equal(read.locked, false);
    assert.ok(wantBamboo(five) > wantBamboo(five.slice(0, 4)) * 1.3);
    const locked = Base.afterRead(table({ seats: [null, { melds: [bambooChow] }] }), 0);
    assert.deepEqual(
      { keeps: locked.keeps, locked: locked.locked, melds: locked.melds },
      { keeps: "b", locked: true, melds: 1 },
    );
    const more = Base.afterRead(table({ seats: [null, { melds: [bambooChow, bambooPung] }] }), 0);
    assert.equal(more.melds, 2);
    assert.equal(more.locked, true);
    const split = Base.afterRead(table({ seats: [null, { melds: [bambooChow, chow(["d2", "d3", "d4"])] }] }), 0);
    assert.equal(split.keeps, null);
  });

  it("holds their suit behind another suit, and a pung holds it longer", () => {
    const analyzed = (melds) => Base.analyzeDiscards(table({ seats: [{ hand }, { melds }], wallLeft: 50 }), 0);
    const list = analyzed([bambooChow]).candidates;
    assert.ok(list.findIndex((x) => x.tile === "c9") < list.findIndex((x) => x.tile === "b9"));
    const pri = (melds) => analyzed(melds).candidates.find((x) => x.tile === "b9").priority;
    assert.ok(pri([bambooChow, bambooPung]) > pri([bambooChow]));
  });

  it("late, a safer tile goes before the suit they are winning on", () => {
    const late = Base.analyzeDiscards(table({ seats: [{ hand }, { melds: [bambooChow] }], wallLeft: 20 }), 0).candidates;
    assert.ok(late.findIndex((x) => x.tile === "wn") < late.findIndex((x) => x.tile === "b9"));
  });

  it("pivots onto their suit when the hand can use it", () => {
    const even = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "b1", "b2", "b3", "b4", "b5", "b6", "b7"];
    const open = { hand: even, flowers: ["f4"] };
    const chased = Base.analyzeDiscards(table({ seats: [open, { melds: [bambooChow] }] }), 0);
    const top = chased.candidates[0];
    assert.equal(E.suitOfIndex(E.tileIndex(top.tile)), "d");
    assert.equal(top.analysis.best.plan.suit, "b");
    assert.match(
      Coach.turnHint(table({ seats: [open, { melds: [bambooChow] }] }), 0, { kongs: [] }).tips.join(" "),
      /chow locks that suit, so keep it/,
    );
  });
});

describe("coach for a strategy", () => {
  it("speaks for the strategy it is given", () => {
    const hand = ["we", "we", "ws", "ws", "dr", "dr", "dg", "dg", "dw", "c5", "d4", "b6", "ww", "wn"];
    const game = table({ seats: [{ hand }] });
    const lucky = Coach.forStrategy(L).turnHint(game, 0, { kongs: [] });
    assert.equal(lucky.tile, L.chooseTurnAction(game, 0, { kongs: [] }).tile);
    const claude = Coach.forStrategy(B).turnHint(game, 0, { kongs: [] });
    assert.equal(claude.tile, B.chooseTurnAction(game, 0, { kongs: [] }).tile);
    // The default coach is still lucky-cat's.
    assert.equal(Coach.turnHint(game, 0, { kongs: [] }).tile, claude.tile);
  });
});

describe("competition", () => {
  it("adds up every seat by strategy, rotated through the seats", async () => {
    const report = await C.runMatch({ lineup: ["jorge-yau", "lucky-cat", "jorge-yau", "lucky-cat"], deals: 2, seed: 5 });
    assert.equal(report.deals, 2);
    assert.equal(report.hands, 8);
    const lucky = report.strategies["jorge-yau"];
    const claude = report.strategies["lucky-cat"];
    assert.equal(lucky.hands, 16);
    assert.equal(claude.hands, 16);
    // Points only move between players.
    assert.equal(lucky.points + claude.points, 0);
    [lucky, claude].forEach((st) => {
      assert.equal(st.wins, st.selfDraws + st.discardWins + st.robKongWins + st.flowerWins);
    });
    const wins = lucky.wins + claude.wins;
    assert.equal(wins + report.draws, report.hands);
    assert.match(C.formatReport(report), /Points per hand/);
  });

  it("plays the same deals the same way for the same seed", async () => {
    const opts = { lineup: ["jorge-yau", "lucky-cat", "lucky-cat", "lucky-cat"], deals: 1, seed: 9 };
    const a = await C.runMatch(opts);
    const b = await C.runMatch(opts);
    assert.deepEqual(a.strategies, b.strategies);
  });

  it("merges reports from split runs", async () => {
    const lineup = ["jorge-yau", "lucky-cat", "jorge-yau", "lucky-cat"];
    const a = await C.runMatch({ lineup, deals: 1, seed: 1 });
    const b = await C.runMatch({ lineup, deals: 1, seed: 2 });
    const both = await C.runMatch({ lineup, deals: 2, seed: 1 });
    const merged = C.mergeReports(a, b);
    assert.deepEqual(merged.strategies, both.strategies);
    assert.equal(merged.hands, both.hands);
  });

  it("rejects an unknown strategy", async () => {
    await assert.rejects(C.runMatch({ lineup: ["jorge-yau", "x", "jorge-yau", "jorge-yau"], deals: 1 }), /unknown strategy/);
  });
});

// Upgrades: bigger hands the same tiles can make (MahjongBot.upgradePlans).
describe("both strategies: special-hand upgrades", () => {
  // Pungs of 1 Character and North Wind, pairs of 9 Bamboo, 5 Circle and
  // Green Dragon: All Triplets, with Mixed Orphans in reach.
  const triplets = ["c1", "c1", "c1", "wn", "wn", "wn", "b9", "b9", "d5", "d5", "dg", "dg", "c9", "d4"];
  const order = (bot, game) => bot.analyzeDiscards(game, 1).candidates.map((x) => x.tile);

  for (const [name, bot] of [["lucky-cat", B], ["jorge-yau", L]]) {
    it(name + " keeps a Mixed Orphans pair over a plain pair with more copies left", () => {
      // One 9 Bamboo is out, so it has fewer left than the 5 Circle.
      const game = table({ seats: [{ discards: ["b9"] }, { hand: triplets }] });
      const found = bot.analyzeDiscards(game, 1);
      assert.equal(found.ctx.upgrade.id, "mixed-orphans");
      const tiles = found.candidates.map((x) => x.tile);
      assert.equal(tiles[0], "d4");
      assert.ok(tiles.indexOf("d5") < tiles.indexOf("b9"), tiles.join(" "));
      assert.ok(tiles.indexOf("d4") < tiles.indexOf("c9"), tiles.join(" "));
    });

    it(name + " throws an orphan with no copies left first", () => {
      const game = table({ seats: [{ discards: ["c9", "c9", "c9"] }, { hand: triplets }] });
      assert.equal(order(bot, game)[0], "c9");
    });

    it(name + " builds Small Three Dragons from two dragon pairs and a single", () => {
      const hand = ["dr", "dr", "dg", "dg", "dw", "c2", "c3", "c4", "d6", "d7", "b1", "b5", "b9", "we"];
      const found = bot.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
      assert.equal(found.ctx.upgrade.id, "small-dragons");
      assert.ok(!["dr", "dg", "dw"].includes(found.candidates[0].tile));
    });
  }

  it("lucky-cat plays Seven Pairs with Mixed Orphans when the pairs are 1s, 9s and honors", () => {
    const hand = ["c1", "c1", "b9", "b9", "wn", "wn", "d9", "d9", "dr", "dr", "c5", "b4", "d3", "ww"];
    const found = B.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
    assert.equal(found.ctx.leadPlan.id, "pairs-orphans");
    assert.ok(["c5", "b4", "d3"].includes(found.candidates[0].tile));
  });

  it("the coach names the upgrade and says to aim for it", () => {
    const game = table({ seats: [{ hand: triplets }] });
    const hint = Coach.turnHint(game, 0, { kongs: [] });
    const said = [hint.action].concat(hint.tips).join(" ").replace(/[\u0001\u0002]/g, "");
    assert.match(said, /Discard Four Circle\. Mixed Orphans uses only 1s, 9s and honors\./);
    assert.match(said, /Mixed Orphans is in reach: keep your 1s, 9s and honors\./);
  });

  it("the coach says to throw an upgrade tile with none left", () => {
    const game = table({ seats: [{ hand: ["c1", "c1", "c1", "wn", "wn", "wn", "b9", "b9", "d5", "d5", "dg", "dg", "c9", "b4"] }, { discards: ["c9", "c9", "c9"] }] });
    const hint = Coach.turnHint(game, 0, { kongs: [] });
    assert.match([hint.action].concat(hint.tips).join(" "), /Discard Nine Character\. None are left/);
  });
});

describe("a big hand in reach keeps its tiles", () => {
  // From hand seed 919942249-NE: eight terminals, All Terminals five steps away.
  const SEED_TURNS = [
    ["c1", "c2", "c3", "c3", "c5", "d1", "d1", "d5", "d9", "b1", "b8", "b9", "b9", "b9"],
    ["c1", "c2", "c3", "c3", "c5", "c8", "d1", "d1", "d5", "d9", "b1", "b9", "b9", "b9"],
  ];
  const terminal = (t) => /^[cdb][19]$/.test(t);
  const plainText = (hint) => [hint.action].concat(hint.tips).join(" ").replace(/[\u0001\u0002]/g, "");

  for (const [name, bot] of [["lucky-cat", B], ["jorge-yau", L]]) {
    it(name + " throws every other tile before a terminal", () => {
      for (const hand of SEED_TURNS) {
        const found = bot.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
        const order = found.candidates.map((x) => x.tile);
        const firstKept = order.findIndex(terminal);
        assert.equal(firstKept, order.filter((t) => !terminal(t)).length, order.join(" "));
      }
    });
  }

  it("the coach aims for All Terminals and recommends a non-terminal", () => {
    for (const hand of SEED_TURNS) {
      const said = plainText(Coach.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] }));
      assert.match(said, /Go for All Terminals/);
      assert.ok(!/Discard (One|Nine) /.test(said), said);
    }
  });

  it("a terminal with no copies left to finish goes, and a late hand stops chasing it", () => {
    const hand = SEED_TURNS[0];
    const dead = table({ seats: [{ discards: ["d9", "d9", "d9"] }, { hand }] });
    assert.equal(B.analyzeDiscards(dead, 1).candidates[0].tile, "d9");
    const late = B.analyzeDiscards(table({ wallLeft: 12, seats: [null, { hand }] }), 1);
    assert.ok(!late.ctx.upgrade);
    assert.notEqual((late.ctx.leadPlan || {}).id, "all-terminals");
  });

  it("stays with a ready hand instead of breaking it", () => {
    const hand = ["c1", "c1", "c1", "d1", "d1", "d2", "d3", "d4", "b9", "b9", "b9", "c9", "c9", "d8"];
    const top = B.analyzeDiscards(table({ seats: [null, { hand }] }), 1).candidates[0];
    assert.equal(top.shanten, 0);
  });

  it("claims only what the target uses", () => {
    const hand = SEED_TURNS[0].filter((t) => t !== "b8");
    const game = table({ seats: [null, { hand }] });
    assert.deepEqual(B.chooseClaim(game, 1, { tile: "d1", pung: true, kong: false, chows: [] }), { type: "pung" });
    assert.deepEqual(B.chooseClaim(game, 1, { tile: "c4", pung: false, kong: false, chows: [["c3", "c5"]] }), { type: "pass" });
  });
});

describe("saving and loading a game", () => {
  // Seat 0 plays as the human (its moves are recorded); the others are bots.
  const agents = () => [B.createBotAgent(), L.createBotAgent(), B.createBotAgent(), L.createBotAgent()];
  const summary = (res) => JSON.stringify([res.type, res.winner, res.payer, res.deltas, res.concealed]);
  const newGame = () => {
    const game = E.createGame({ seed: 4242, mode: "payout" });
    assert.equal(game.players[0].isHuman, true);
    return game;
  };
  // Plays a hand, keeping the save record after every discard.
  async function playSaving(game) {
    const records = [];
    const ui = { emit: (name) => { if (name === "discard") records.push(JSON.stringify(E.gameRecord(game))); } };
    const res = await E.runHand(game, agents(), ui);
    return { res, records };
  }

  it("deals a hand again from its seed and replays your moves to the same result", async () => {
    const game = newGame();
    const first = await playSaving(game);
    const mid = first.records.filter((r) => JSON.parse(r).hand.moves.length > 0);
    assert.ok(mid.length > 4);
    for (const at of [mid[0], mid[Math.floor(mid.length / 2)], mid[mid.length - 1]]) {
      const record = JSON.parse(at);
      const restored = E.restoreGame(record);
      let ended = 0;
      const res = await E.runHand(restored, agents(), {}, { seed: record.hand.seed, replay: record.hand.moves, onReplayEnd: () => ended++ });
      assert.equal(summary(res), summary(first.res));
      assert.equal(ended, 1);
      assert.deepEqual(restored.players.map((p) => p.points), game.players.map((p) => p.points));
      assert.equal(restored.handNumber, game.handNumber);
    }
  });

  it("keeps the same walls as before hands had their own seeds", () => {
    const a = E.createGame({ seed: 99 });
    const b = E.createGame({ seed: 99 });
    E.startHand(a);
    const wall = E.buildWall(b.rng);
    assert.deepEqual(a.hand.wall.concat([]).length, 144 - 53);
    assert.equal(wall.slice(53).join(), a.hand.wall.join());
    E.startHand(a, a.hand.seed);
    assert.equal(wall.slice(53).join(), a.hand.wall.join());
  });

  it("saves no hidden tiles: only the hand's seed and your moves", async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records[records.length - 1]);
    assert.deepEqual(Object.keys(record.hand).sort(), ["moves", "seed"]);
    assert.ok(!/"wall"|"discards"|"flowers"/.test(records[records.length - 1]));
    assert.ok(record.hand.moves.every((m) => m.k === "turn" || m.k === "claim"));
  });

  it("goes on live, instead of waiting forever, when a saved move no longer fits the hand", async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records.find((r) => JSON.parse(r).hand.moves.length > 3));
    const at = record.hand.moves.findIndex((m) => m.s === 0 && m.k === "turn");
    record.hand.moves[at] = { k: "turn", d: { type: "discard", tile: "zz" }, s: 0 };
    let ended = 0;
    const res = await E.runHand(E.restoreGame(record), agents(), {}, { seed: record.hand.seed, replay: record.hand.moves, onReplayEnd: () => { ended++; } });
    assert.equal(ended, 1);
    assert.ok(res && (res.type === "win" || res.type === "draw"), "the hand plays to its end");
  });

  it("keeps every seat's moves, so a saved hand comes back the same after a bot changes", async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records.find((r) => JSON.parse(r).hand.moves.length > 8));
    assert.ok(record.hand.moves.every((m) => typeof m.s === "number"), "each move names its seat");
    assert.ok(record.hand.moves.some((m) => m.s !== 0), "the bots' moves are kept");
    // Bots that would now play differently (always their last tile) don't change the replayed hand.
    const changed = agents().map((a, seat) => seat === 0 ? a : {
      turn: (g, s) => ({ type: "discard", tile: g.hand.seats[s].hand[g.hand.seats[s].hand.length - 1] }),
      claim: () => ({ type: "pass" }),
    });
    const replayed = E.restoreGame(record);
    let caught = null;
    await E.runHand(replayed, changed, {}, {
      seed: record.hand.seed, replay: record.hand.moves,
      onReplayEnd: () => { caught = replayed.hand.moves.map((m) => JSON.stringify(m)); },
    });
    assert.deepEqual(caught, record.hand.moves.map((m) => JSON.stringify(m)));
  });

  it("plays an old save (your moves only) with the bots deciding again, as before", async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records.find((r) => JSON.parse(r).hand.moves.length > 8));
    const old = record.hand.moves.filter((m) => m.s === 0).map((m) => ({ k: m.k, d: m.d }));
    let ended = 0;
    const res = await E.runHand(E.restoreGame(record), agents(), {}, { seed: record.hand.seed, replay: old, onReplayEnd: () => { ended++; } });
    assert.equal(ended, 1);
    assert.ok(res && (res.type === "win" || res.type === "draw"));
  });

  it("signs saves, and refuses changed, foreign or incompatible ones", async () => {
    const game = newGame();
    await playSaving(game);
    const file = await E.makeSave({ game: E.gameRecord(game) });
    assert.equal(file.version, E.GAME_VERSION);
    assert.match(file.signature, /^[0-9a-f]{64}$/);
    assert.deepEqual(await E.checkSave(JSON.parse(JSON.stringify(file))), { ok: true, reason: null });
    const edited = JSON.parse(JSON.stringify(file));
    edited.payload.game.players[0].points += 1000;
    assert.match((await E.checkSave(edited)).reason, /changed or damaged/);
    assert.match((await E.checkSave({ app: "other", payload: {} })).reason, /isn't a Lucky Cat Mahjong save/);
    assert.match((await E.checkSave(Object.assign({}, file, { version: "1.0.0" }))).reason, /newer/);
  });

  it("deals your starting hand from the hand seed your wind badge copies", async () => {
    for (const dealer of [0, 1, 2, 3]) {
      const game = E.createGame({ seed: 777 + dealer, dealer, mode: "payout" });
      let first = null;
      const ui = { emit: (name) => { if (name === "turn" && !first) first = { hand: E.sortTiles(game.hand.seats[0].hand.slice()), flowers: game.hand.seats[0].flowers.slice(), text: E.handSeedText(game, 0) }; } };
      await E.runHand(game, agents(), ui);
      const parsed = E.parseHandSeed(first.text);
      assert.equal(parsed.seat, ((0 - dealer + 4) % 4) + 1);
      assert.equal(parsed.round, 1);
      assert.deepEqual(E.dealtHand(parsed.seed, parsed.seat), { hand: first.hand, flowers: first.flowers });
    }
    assert.equal(E.parseHandSeed("458555827"), null);
    assert.equal(E.parseHandSeed("99999999999-EE"), null);
    assert.deepEqual(E.parseHandSeed(" 12-nw "), { seed: 12, seat: 4, round: 3 });
  });

  it("signs the same without Web Crypto (plain http on a phone), so saves load either way", async () => {
    const game = newGame();
    await playSaving(game);
    const payload = { game: E.gameRecord(game) };
    const withCrypto = await E.makeSave(payload);
    const real = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
    try {
      const without = await E.makeSave(payload);
      assert.equal(without.signature, withCrypto.signature);
      assert.deepEqual(await E.checkSave(JSON.parse(JSON.stringify(withCrypto))), { ok: true, reason: null });
    } finally {
      Object.defineProperty(globalThis, "crypto", real);
    }
  });

  it("loads saves from any minor or patch version of the same major version", () => {
    assert.equal(E.GAME_VERSION, "0.61.95");
    for (const v of ["0.1.0", "0.2.0", "0.2.7", "0.0.9", "0.9.3"]) assert.equal(E.saveCompatibility(v).ok, true, v);
    assert.match(E.saveCompatibility("1.0.0").reason, /newer/);
    assert.equal(E.saveCompatibility("0.1").ok, false);
    assert.throws(() => E.restoreGame({ players: [] }), /not a saved game/);
  });
});

describe("only-orphans-rules (the baseline)", () => {
  const O = require("../scripts/ml/baselines/only-orphans-rules.js");
  const far = ["c1", "c9", "d1", "d9", "we", "dr", "c4", "c5", "d4", "d6", "b3", "b5", "b7", "d5"];
  const seven = ["c1", "c9", "d1", "d9", "b1", "we", "ws", "dr", "dg", "c4", "c5", "d4", "b5", "b6"];
  const pung = (t) => ({ type: "pung", tiles: [t, t, t], concealed: false, from: 2 });
  const planIds = (a) => a.candidates[0].analysis.best.plan.id;
  // All four Bamboo 9s on the table: Thirteen Orphans can't be finished.
  const noB9 = { discards: ["b9", "b9", "b9", "b9"] };

  it("plays Thirteen Orphans from any hand, throwing other tiles first", () => {
    const a = O.analyzeDiscards(table({ seats: [{ hand: far }] }), 0);
    assert.ok(a.ctx.lockedSpecial);
    assert.equal(planIds(a), "orphans");
    assert.ok(!E.isTerminalOrHonorIndex(a.candidates[0].index), "threw " + a.candidates[0].tile);
  });

  it("claims nothing on Thirteen Orphans, but takes a win", () => {
    const hand = seven.slice(0, 13);
    hand[9] = "dr";
    const game = table({ seats: [{ hand }] });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "dr", pung: true, kong: false, chows: [] }), { type: "pass" });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "c1", win: { faan: 13 }, pung: false, kong: false, chows: [] }), { type: "win" });
  });

  it("declares no kong on Thirteen Orphans", () => {
    const hand = ["dr", "dr", "dr", "dr", "c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "ww", "wn"];
    const game = table({ seats: [{ hand }] });
    assert.equal(O.chooseTurnAction(game, 0, E.turnOptions(game, 0)).type, "discard");
  });

  it("pivots once a tile it needs has run out", () => {
    const a = O.analyzeDiscards(table({ seats: [{ hand: far }, noB9] }), 0);
    assert.equal(a.ctx.lockedSpecial, null);
    assert.ok(["mixed-orphans", "all-terminals", "all-honors", "pairs-orphans", "pairs-honors", "pairs-terminals"].includes(planIds(a)), planIds(a));
    assert.ok(!E.isTerminalOrHonorIndex(a.candidates[0].index), "threw " + a.candidates[0].tile);
  });

  it("holds on for its first discards, then gives up when the odds are too low", () => {
    const c = E.countsOf(far);
    const early = table({ seats: [{ hand: far }], wallLeft: 24 });
    assert.equal(O.stillOrphans(c, O.buildContext(early, 0)), true);
    const discards = ["b2", "b3", "b4", "b5", "b6", "b7"];
    assert.equal(O.stillOrphans(c, O.buildContext(table({ seats: [{ hand: far, discards }], wallLeft: 24 }), 0)), false);
    assert.equal(O.stillOrphans(E.countsOf(seven), O.buildContext(table({ seats: [{ hand: seven, discards }], wallLeft: 60 }), 0)), true);
  });

  it("rates the hand lower with fewer tiles held or fewer draws left", () => {
    const odds = (hand, wallLeft) => O.handOdds(E.countsOf(hand), O.buildContext(table({ seats: [{ hand }], wallLeft }), 0));
    assert.ok(odds(seven, 60) > odds(far, 60));
    assert.ok(odds(seven, 70) > odds(seven, 20));
  });

  it("as triplets, pungs the tiles it keeps and passes everything else", () => {
    const hand = ["c1", "c1", "d9", "d9", "we", "we", "dr", "dr", "b1", "b9", "ws", "wn", "c9"];
    const game = table({ seats: [{ hand, melds: [pung("c9")] }, noB9] });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "dr", pung: true, kong: false, chows: [] }), { type: "pung" });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "c5", pung: false, kong: false, chows: [["c4", "c6"]] }), { type: "pass" });
  });

  it("as pairs, claims nothing", () => {
    const hand = ["c1", "c1", "d9", "d9", "we", "we", "dr", "dr", "b1", "b1", "ws", "ws", "c9"];
    const game = table({ seats: [{ hand }, noB9] });
    const ctx = O.buildContext(game, 0);
    assert.ok(O.pivotPlans(E.countsOf(hand), ctx).some((p) => p.id === "pairs-orphans"));
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "dg", pung: false, kong: false, chows: [] }), { type: "pass" });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: "dr", pung: true, kong: false, chows: [] }), { type: "pass" });
  });

  it("only ever finishes on a pivot hand it can use, with no usual hands in the list", () => {
    const ctx = O.buildContext(table({ seats: [{ hand: far }, noB9] }), 0);
    const ids = O.pivotPlans(E.countsOf(far), ctx).map((p) => p.id);
    assert.deepEqual(ids.slice().sort(), ["all-honors", "all-terminals", "mixed-orphans", "pairs-honors", "pairs-orphans", "pairs-terminals"]);
  });

  it("the coach names the hand it is on", () => {
    const coach = Coach.forStrategy(O);
    assert.match(coach.turnHint(table({ seats: [{ hand: far }] }), 0, { kongs: [] }).tips.join(" "), /Thirteen Orphans/);
    assert.match(coach.turnHint(table({ seats: [{ hand: far }, noB9] }), 0, { kongs: [] }).tips.join(" "), /Mixed Orphans|All Terminals|All Honors/);
  });

  it("plays full hands against the other strategies", async () => {
    for (let n = 0; n < 8; n++) {
      const game = E.createGame({ seed: 31000 + n, humanSeat: false, dealer: 0 });
      const agents = [O.createBotAgent(), S.createAgent("lucky-cat"), O.createBotAgent(), S.createAgent("jorge-yau")];
      const res = await E.runHand(game, agents, {});
      assert.ok(res.type === "win" || res.type === "draw", res.type);
    }
  });
});

describe("only-orphans (learned)", () => {
  const OO = require("./mahjong-only-orphans.js");
  const M = require("./mahjong-ml-model.js");
  const far = ["c1", "c9", "d1", "d9", "we", "dr", "c4", "c5", "d4", "d6", "b3", "b5", "b7", "d5"];
  const orphansOnly = ["c1", "c1", "d9", "d9", "we", "we", "dr", "dr", "b1", "b9", "ws", "wn", "c9", "dg"];
  // The fixed rules hold whatever the weights: the shipped model and random ones.
  const bots = [OO, OO.create({ model: M.randomModel(3) }), OO.create({ model: M.randomModel(5), epsilon: 0.5, temperature: 300 })];

  it("is the table strategy only-orphans", () => {
    assert.equal(S.get("only-orphans").bot, OO);
    assert.equal(OO.id, "only-orphans");
  });

  it("throws a tile that is not a 1, a 9 or an honor while it holds one", () => {
    for (const bot of bots) {
      for (let n = 0; n < 5; n++) {
        const d = bot.chooseTurnAction(table({ seats: [{ hand: far }] }), 0, { kongs: [] });
        assert.equal(d.type, "discard");
        assert.ok(!E.isTerminalOrHonorIndex(E.tileIndex(d.tile)), "threw " + d.tile);
      }
    }
  });

  it("with only 1s, 9s and honors, throws one of them", () => {
    for (const bot of bots) {
      const d = bot.chooseTurnAction(table({ seats: [{ hand: orphansOnly }] }), 0, { kongs: [] });
      assert.ok(E.isTerminalOrHonorIndex(E.tileIndex(d.tile)), "threw " + d.tile);
    }
  });

  it("never chows, never claims a tile that is not a 1, a 9 or an honor, and takes a win", () => {
    const hand = ["c1", "c1", "d9", "d9", "we", "we", "dr", "dr", "b1", "c4", "c6", "b5", "b5"];
    const game = table({ seats: [{ hand }] });
    for (const bot of bots) {
      for (let n = 0; n < 5; n++) {
        assert.deepEqual(bot.chooseClaim(game, 0, { tile: "c5", pung: false, kong: false, chows: [["c4", "c6"]] }), { type: "pass" });
        assert.deepEqual(bot.chooseClaim(game, 0, { tile: "b5", pung: true, kong: false, chows: [] }), { type: "pass" });
        assert.ok(["pass", "pung"].includes(bot.chooseClaim(game, 0, { tile: "dr", pung: true, kong: false, chows: [] }).type));
      }
      assert.deepEqual(bot.chooseClaim(game, 0, { tile: "c1", win: { faan: 13 }, pung: false, kong: false, chows: [] }), { type: "win" });
    }
  });

  it("declares no kong of a tile that is not a 1, a 9 or an honor on Thirteen Orphans", () => {
    const hand = ["b5", "b5", "b5", "b5", "c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "ww", "wn"];
    const game = table({ seats: [{ hand }] });
    for (const bot of bots) {
      for (let n = 0; n < 5; n++) assert.notEqual(bot.chooseTurnAction(game, 0, E.turnOptions(game, 0)).type, "kong");
      assert.equal(bot.targetOf(game, 0).id, "orphans");
    }
  });

  it("reads Thirteen Orphans beside the pivot hands, and only those", () => {
    const ctx = OO.buildContext(table({ seats: [{ hand: far }] }), 0);
    const ids = OO.plans(E.countsOf(far), ctx).map((p) => p.id);
    assert.deepEqual(ids.slice().sort(), ["all-honors", "all-terminals", "mixed-orphans", "orphans", "pairs-honors", "pairs-orphans", "pairs-terminals"]);
  });

  it("the coach gives a hint for it", () => {
    const tips = Coach.forStrategy(OO).turnHint(table({ seats: [{ hand: far }] }), 0, { kongs: [] }).tips;
    assert.ok(tips.length > 0);
  });

  describe("targets", () => {
    const thirteen = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "dr", "dg", "c4", "d5", "b6", "b7"];
    const triplets = ["c2", "c2", "c2", "d5", "d5", "d5", "b7", "b7", "c8", "c8", "b3", "d2", "c5", "b4"];
    const pairs = ["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d8", "d8", "b3", "c5", "d6", "b9"];
    // Every other copy of its pairs is on the table: they can be pairs, never pungs.
    const gone = { discards: ["c2", "c2", "d4", "d4", "b6", "b6", "c7", "c7", "d8", "d8"] };
    const opened = { hand: ["d9", "d9", "we", "we", "dr", "dr", "b9", "c4", "b5", "d6", "b3"], melds: [{ type: "pung", tiles: ["c1", "c1", "c1"], concealed: false, from: 2 }] };
    const target = (game, bot) => { (bot || OO).chooseTurnAction(game, 0, { kongs: [] }); return (bot || OO).targetOf(game, 0); };
    const explorer = () => OO.create({ model: M.randomModel(7), epsilon: 1 });

    it("keeps its target until another is worth SWITCH times as much", () => {
      const worth = { orphans: 1, "major-sets": 0, "major-pairs": 0, pairs: 0, "concealed-triplets": 1.2 };
      assert.equal(OO.pickTarget(worth, null), "concealed-triplets");
      assert.equal(OO.pickTarget(worth, "orphans"), "orphans");
      assert.equal(OO.pickTarget(Object.assign({}, worth, { "concealed-triplets": OO.SWITCH + 0.01 }), "orphans"), "concealed-triplets");
      // A target that can't be made is left at once.
      assert.equal(OO.pickTarget(Object.assign({}, worth, { orphans: 0 }), "orphans"), "concealed-triplets");
    });

    it("picks by expected points: Thirteen Orphans, Concealed Triplets, Seven Pairs or triplets of 1s, 9s and honors", () => {
      assert.equal(target(table({ seats: [{ hand: thirteen }] })).id, "orphans");
      assert.equal(target(table({ seats: [{ hand: triplets }] })).id, "concealed-triplets");
      assert.equal(target(table({ seats: [{ hand: pairs }, gone] })).id, "pairs");
      assert.equal(target(table({ seats: [opened] })).id, "major-sets");
      const t = target(table({ seats: [{ hand: thirteen }] }));
      assert.equal(t.label, "Thirteen Orphans");
      assert.ok(t.worth.orphans > OO.SWITCH * t.worth["concealed-triplets"]);
    });

    it("reads it again as the tiles come in", () => {
      const game = table({ seats: [{ hand: thirteen }] });
      assert.equal(target(game).id, "orphans");
      game.hand.seats[0].hand = triplets.slice();
      const t = target(game);
      assert.equal(t.id, "concealed-triplets");
      assert.equal(t.from, "orphans");
    });

    it("reads only what its seat can see", () => {
      const game = table({ seats: [{ hand: triplets }] });
      const before = target(game).worth;
      // Another hand and the wall change; its read doesn't.
      game.hand.seats[1].hand = ["c2", "d5", "b7", "b7", "c8", "c8", "c2", "d5", "b1", "b1", "b2", "b2", "b3"];
      game.hand.wall = game.hand.wall.slice().reverse();
      game.hand.seats[0]["ooTarget:only-orphans"] = null;
      assert.deepEqual(target(game).worth, before);
    });

    it("on Seven Pairs and Concealed Triplets keeps pairs of any tile and throws a single first", () => {
      for (const bot of bots) {
        for (const game of [table({ seats: [{ hand: pairs }, gone] }), table({ seats: [{ hand: triplets }] })]) {
          const c = E.countsOf(game.hand.seats[0].hand);
          const d = bot.chooseTurnAction(game, 0, { kongs: [] });
          const i = E.tileIndex(d.tile);
          assert.ok(!E.isTerminalOrHonorIndex(i) && c[i] === 1, "threw " + d.tile);
        }
      }
    });

    it("claims nothing but the win on Seven Pairs, Concealed Triplets and Thirteen Orphans", () => {
      const cases = [
        [{ hand: ["c2", "c2", "c2", "d5", "d5", "d5", "b7", "b7", "dr", "dr", "b3", "d2", "c5"] }, "dr"],
        [{ hand: ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "dr", "dr", "c4", "d5", "b6"] }, "dr"],
      ];
      for (const [seat, tile] of cases) {
        const game = table({ seats: [seat] });
        const bot = explorer();
        for (let n = 0; n < 12; n++) assert.deepEqual(bot.chooseClaim(game, 0, { tile, pung: true, kong: false, chows: [] }), { type: "pass" });
        assert.deepEqual(bot.chooseClaim(game, 0, { tile, win: { faan: 13 }, pung: true, kong: false, chows: [] }), { type: "win" });
      }
    });

    it("the coach says why it passes a pung on Concealed Triplets", () => {
      const game = table({ seats: [{ hand: ["c2", "c2", "c2", "d5", "d5", "d5", "b7", "b7", "dr", "dr", "b3", "d2", "c5"] }] });
      const hint = Coach.forStrategy(OO).claimHint(game, 0, { tile: "dr", pung: true, kong: false, chows: [] });
      assert.equal(hint.decision.type, "pass");
      assert.ok(hint.tips.some((t) => /^Concealed Triplets claims nothing but the winning tile\./.test(t)), hint.tips.join(" | "));
    });

    it("may pung a 1, a 9 or an honor on the triplets target", () => {
      const game = table({ seats: [opened] });
      const bot = explorer();
      const seen = new Set();
      for (let n = 0; n < 30; n++) seen.add(bot.chooseClaim(game, 0, { tile: "dr", pung: true, kong: false, chows: [] }).type);
      assert.ok(seen.has("pung"));
      assert.equal(target(game, bot).id, "major-sets");
    });

    it("may declare a concealed kong of any tile on Concealed Triplets", () => {
      const hand = ["b5", "b5", "b5", "b5", "c3", "c3", "c3", "d7", "d7", "b2", "b2", "c6", "d4", "b8"];
      const game = table({ seats: [{ hand }] });
      const bot = explorer();
      const seen = new Set();
      for (let n = 0; n < 30; n++) seen.add(bot.chooseTurnAction(game, 0, E.turnOptions(game, 0)).type);
      assert.ok(seen.has("kong"));
      assert.equal(bot.targetOf(game, 0).id, "concealed-triplets");
    });
  });

  it("plays full hands against the other strategies", async () => {
    for (let n = 0; n < 8; n++) {
      const game = E.createGame({ seed: 31000 + n, humanSeat: false, dealer: 0 });
      const ids = ["only-orphans", "lucky-cat", "only-orphans", "neural-cat"];
      const res = await E.runHand(game, ids.map((id) => S.createAgent(id)), {});
      assert.ok(res.type === "win" || res.type === "draw", res.type);
    }
  });
});

describe("jorge-yau attack, big-hand lock and late defense", () => {
  const N = L;
  const mixed = ["c2", "c3", "c4", "d4", "d5", "d7", "b3", "b4", "b8", "c7", "dr", "dr", "we", "d1"];
  const flush = ["b1", "b2", "b3", "b5", "b6", "b8", "b9", "b9", "c2", "c7", "d4", "dr", "wn", "we"];
  const order = (game) => N.analyzeDiscards(game, 0).candidates.map((x) => x.tile);
  const tileOf = (game) => N.chooseTurnAction(game, 0, { kongs: [] }).tile;
  const others = (tile) => [null, { discards: [tile, tile] }, { discards: [tile] }];
  const eight = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((t) => ({ tile: t, claimed: false }));

  it("keeps honors behind number tiles, and honor pairs longest", () => {
    const list = order(table({ seats: [{ hand: mixed }] }));
    assert.ok(E.tileIndex(list[0]) < 27);
    assert.ok(list.indexOf("we") > list.indexOf("d1"));
    assert.equal(list[list.length - 1], "dr");
  });

  it("throws a lone honor first once the other three are on the table", () => {
    const seats = others("we");
    seats[0] = { hand: mixed };
    assert.equal(tileOf(table({ seats })), "we");
  });

  it("counts a pung of that honor as on the table", () => {
    assert.equal(tileOf(table({ seats: [{ hand: mixed }, { melds: [pung("we")] }] })), "we");
  });

  it("keeps a lone dragon with three copies left behind number tiles", () => {
    // East seat in the South round: East is worth 1 faan, less than a dragon.
    const hand = ["c2", "c3", "c4", "d4", "d5", "d7", "b3", "b4", "b8", "c7", "dg", "dr", "we", "d1"];
    const list = order(table({ seats: [{ hand }], round: 2 }));
    assert.ok(list.indexOf("dr") > list.indexOf("we"));
    assert.ok(list.indexOf("dr") > list.indexOf("c7"));
  });

  it("keeps tied honors by what they are worth: a 2-faan wind, then dragons, then 1-faan winds, then the rest", () => {
    const hand = ["c2", "c3", "c4", "d4", "d5", "d6", "b3", "b4", "b5", "b7", "b8", "we", "ws", "dr"];
    const pos = (list, t) => list.indexOf(t);
    // East seat in the East round: East is worth 2 faan, so it's kept longest.
    const east = order(table({ seats: [{ hand }] }));
    assert.ok(pos(east, "ws") < pos(east, "dr") && pos(east, "dr") < pos(east, "we"), east.join());
    // East seat in the South round: East and South are each worth 1 faan, the dragon more.
    const south = order(table({ seats: [{ hand }], round: 2 }));
    assert.ok(pos(south, "we") < pos(south, "dr") && pos(south, "ws") < pos(south, "dr"), south.join());
    // The rule itself.
    const ctx = { seatWind: 1, round: 1 };
    assert.deepEqual([27, 28, 29, 30, 31, 32, 33].map((i) => B.honorKeepRank(ctx, i)), [3, 0, 0, 0, 2, 2, 2]);
    assert.deepEqual([27, 28, 29, 30].map((i) => B.honorKeepRank({ seatWind: 2, round: 1 }, i)), [1, 1, 0, 0]);
  });

  const threat = { melds: [pung("b5"), pung("b6"), pung("b7")], discards: ["c1", "c9", "d1", "d9", "c2", "d8"] };

  it("plays no defense while the wall is long, however high the threat", () => {
    const a = N.analyzeDiscards(table({ seats: [{ hand: mixed }, threat, threat, threat], wallLeft: 80 }), 0);
    assert.equal(a.folding, false);
    assert.equal(a.defense, 0);
  });

  it("plays safe only when it is late and still 2 or more from ready", () => {
    const a = N.analyzeDiscards(table({ seats: [{ hand: mixed }, threat, threat, threat], wallLeft: 10 }), 0);
    assert.equal(a.folding, true);
  });

  it("never folds on a locked hand, even late", () => {
    const a = N.analyzeDiscards(table({ seats: [{ hand: flush }, threat, threat, threat], wallLeft: 30 }), 0);
    assert.equal(a.folding, false);
  });

  it("locks onto a Full Flush with 8 tiles, and throws other suits, then honors, keeping a lone dragon", () => {
    const list = order(table({ seats: [{ hand: flush }], round: 2 }));
    assert.deepEqual(list.slice(0, 3).sort(), ["c2", "c7", "d4"]);
    assert.deepEqual(list.slice(3, 5).sort(), ["we", "wn"]);
    assert.ok(list.slice(5, -1).every((t) => t[0] === "b"));
    assert.equal(list[list.length - 1], "dr");
  });

  it("does not lock with 7 tiles, or for the first time after turn 8", () => {
    const seven = ["b1", "b2", "b3", "b5", "b6", "b8", "b9", "c2", "c7", "d4", "d8", "dr", "wn", "we"];
    const game = table({ seats: [{ hand: seven }] });
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, null);
    game.hand.seats[0].hand = flush.slice();
    game.hand.seats[0].discards = eight;
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, null);
  });

  it("keeps a lock past turn 8", () => {
    const game = table({ seats: [{ hand: flush }] });
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, "full-b");
    game.hand.seats[0].discards = eight;
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, "full-b");
  });

  it("reads the lock again after a saved game comes back", () => {
    const game = table({ seats: [{ hand: flush }] });
    game.hand.seats[0].discards = eight;
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, "full-b");
  });

  it("weighing a claim leaves the lock alone", () => {
    const game = table({ seats: [{ hand: flush.slice(0, 13) }] });
    game.hand.seats[0].bigHandLock = "full-b";
    N.chooseClaim(game, 0, { tile: "b9", pung: true, kong: false, chows: [] });
    assert.equal(game.hand.seats[0].bigHandLock, "full-b");
  });

  it("drops a lock when the hand can no longer be won", () => {
    const game = table({ seats: [{ hand: flush }] });
    N.analyzeDiscards(game, 0);
    game.hand.seats[0].melds = [pung("c5")];
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, null);
  });

  it("locks onto Thirteen Orphans from 8 of its tiles", () => {
    const orphans = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "c2", "c5", "d4", "d6", "b5", "b7"];
    const game = table({ seats: [{ hand: orphans }] });
    N.analyzeDiscards(game, 0);
    assert.equal(game.hand.seats[0].bigHandLock, "orphans");
  });

  it("on a lock, claims only that hand's tiles", () => {
    const hand = flush.slice(0, 13);
    const game = table({ seats: [{ hand }] });
    game.hand.seats[0].bigHandLock = "full-b";
    N.setTuning({ ownClaims: true });
    try {
      assert.deepEqual(N.chooseClaim(game, 0, { tile: "c7", pung: false, kong: false, chows: [["c6", "c8"]] }), { type: "pass" });
      assert.equal(N.chooseClaim(game, 0, { tile: "b9", pung: true, kong: false, chows: [] }).type, "pung");
    } finally { N.setTuning({ ownClaims: false }); }
  });

  it("claims what brings an unlocked hand closer", () => {
    const hand = ["c2", "c3", "c4", "c6", "c7", "c9", "c9", "dr", "dr", "dr", "d2", "b6", "we"];
    const opts = { tile: "c5", pung: false, kong: false, chows: [["c6", "c7"]] };
    N.setTuning({ ownClaims: true });
    try {
      assert.equal(N.chooseClaim(table({ seats: [{ hand }] }), 0, opts).type, "chow");
    } finally { N.setTuning({ ownClaims: false }); }
    // By default it uses the shared claims, which pass on this chow.
    assert.equal(N.chooseClaim(table({ seats: [{ hand }] }), 0, opts).type, "pass");
  });

  it("the coach names the hand it is on", () => {
    const text = Coach.forStrategy(N).turnHint(table({ seats: [{ hand: flush }] }), 0, { kongs: [] }).tips.join(" ");
    assert.match(text, /Full Flush in Bamboo/);
  });

  it("holds to its rules through real hands", async () => {
    const coach = Coach.forStrategy(N);
    const agent = () => {
      const base = N.createBotAgent();
      return {
        claim: (g, seat, o) => base.claim(g, seat, o),
        turn: async (g, seat, o) => {
          const lockBefore = g.hand.seats[seat].bigHandLock;
          const action = await base.turn(g, seat, o);
          if (o.win || action.type !== "discard") return action;
          const c = E.countsOf(g.hand.seats[seat].hand);
          const ctx = N.buildContext(g, seat);
          const i = E.tileIndex(action.tile);
          const dead = [];
          for (let t = 27; t < 34; t++) if (c[t] === 1 && ctx.unseen[t] === 0) dead.push(t);
          const lock = g.hand.seats[seat].bigHandLock;
          // (While folding, safety decides instead.)
          if (dead.length && lock !== "orphans" && !N.analyzeDiscards(g, seat).folding) assert.ok(dead.includes(i), g.hand.seats[seat].hand.join(" "));
          assert.equal(typeof coach.turnHint(g, seat, { kongs: [] }).tile, "string");
          assert.ok(!lock || lock === lockBefore || ctx.turn <= 8, "locked after turn 8");
          return action;
        },
      };
    };
    for (let n = 0; n < 6; n++) {
      const game = E.createGame({ seed: 32000 + n, humanSeat: false, dealer: 0 });
      const res = await E.runHand(game, [agent(), S.createAgent("lucky-cat"), S.createAgent("only-orphans"), S.createAgent("jorge-yau")], {});
      assert.ok(res.type === "win" || res.type === "draw", res.type);
    }
  });
});

describe("sticking to a plan", () => {
  const Base = require("./mahjong-bot.js");
  const three = ["b1", "b9", "d1"].map((tile) => ({ tile, claimed: false }));
  const hand = ["c2", "c3", "c4", "c6", "c7", "c8", "c9", "dr", "dr", "d5", "d6", "b4", "b5", "we"];
  const planOf = (bot, game) => bot.analyzeDiscards(game, 0).candidates[0].analysis.best.plan.id;
  const memoOf = (game, id) => game.hand.seats[0].planMemo[id];

  it("stays open for its first 3 discards, then commits", () => {
    const game = table({ seats: [{ hand }], wallLeft: 70 });
    Base.analyzeDiscards(game, 0);
    assert.equal(memoOf(game, "base").now, null);
    const later = table({ seats: [{ hand, discards: three }], wallLeft: 70 });
    const plan = planOf(Base, later);
    assert.equal(memoOf(later, "base").now, Base.planFamily(plan));
  });

  it("keeps the plan when a better one is only a little closer", () => {
    const near = ["c2", "c3", "c4", "c6", "c7", "c8", "c9", "c9", "d4", "d5", "d6", "b4", "b5", "b6"];
    const free = table({ seats: [{ hand: near, discards: three }], wallLeft: 70 });
    assert.equal(Base.planFamily(planOf(Base, free)), "flush-c");
    const game = table({ seats: [{ hand: near, discards: three }], wallLeft: 70 });
    game.hand.seats[0].planMemo = { base: { turn: -1, base: null, now: "runs", left: {}, pivot: null } };
    assert.equal(Base.planFamily(planOf(Base, game)), "runs");
    assert.equal(Base.planPivot(game, 0), null);
  });

  it("pivots for a hand worth more that is not behind", () => {
    const game = table({ seats: [{ hand, discards: three }], wallLeft: 70 });
    game.hand.seats[0].planMemo = { base: { turn: -1, base: null, now: "runs", left: {}, pivot: null } };
    assert.equal(Base.planFamily(planOf(Base, game)), "flush-c");
    assert.deepEqual(Base.planPivot(game, 0), { turn: 3, from: "runs", why: "points" });
  });

  it("pivots when the plan can no longer be made, and says so", () => {
    const game = table({ seats: [{ hand, discards: three }], wallLeft: 70 });
    planOf(Base, game);
    game.hand.seats[0].planMemo.base.now = "not-a-plan";
    game.hand.seats[0].planMemo.base.turn = -1;
    const plan = planOf(Base, game);
    assert.notEqual(plan, "not-a-plan");
    assert.deepEqual(Base.planPivot(game, 0), { turn: 3, from: "not-a-plan", why: "gone" });
    assert.equal(memoOf(game, "base").left["not-a-plan"], 3);
  });

  it("needs more to come back to a hand it left", () => {
    const game = table({ seats: [{ hand, discards: three }], wallLeft: 70 });
    game.hand.seats[0].planMemo = { base: { turn: -1, base: null, now: "runs", left: { "flush-c": 1 }, pivot: null } };
    const plan = planOf(Base, game);
    assert.equal(Base.planFamily(plan), "runs");
  });

  it("weighing a claim leaves the plan alone", () => {
    const game = table({ seats: [{ hand: hand.slice(0, 13), discards: three }], wallLeft: 70 });
    Base.chooseClaim(game, 0, { tile: "c5", pung: false, kong: false, chows: [["c6", "c7"]] });
    assert.equal(!game.hand.seats[0].planMemo || !game.hand.seats[0].planMemo.base || memoOf(game, "base").turn === -1, true);
  });

  it("counts hands built from the same tiles as one plan", () => {
    assert.equal(Base.planFamily("half-c"), Base.planFamily("full-c"));
    assert.notEqual(Base.planFamily("half-c"), Base.planFamily("half-b"));
    assert.equal(Base.planFamily("triplets"), Base.planFamily("concealed-triplets"));
    assert.equal(Base.planFamily("plain"), Base.planFamily("straights"));
    assert.equal(Base.planFamily("all-honors"), Base.planFamily("mixed-orphans"));
    assert.equal(Base.planFamily("pairs"), Base.planFamily("pairs-honors"));
    assert.equal(Base.planFamily("orphans"), "orphans");
  });

  it("every strategy keeps its own record", () => {
    const game = table({ seats: [{ hand, discards: three }], wallLeft: 70 });
    Base.analyzeDiscards(game, 0);
    B.analyzeDiscards(game, 0);
    assert.ok(memoOf(game, "base") && memoOf(game, "lucky-cat"));
  });
});

describe("the coach says when its hand changes", () => {
  const hint = (game, bot) => Coach.forStrategy(bot || B).turnHint(game, 0, { kongs: [] }).tips.join(" ");
  const flush = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c9", "d2", "b3", "we", "ws"];
  const mixed = ["c2", "c3", "c4", "d4", "d5", "d6", "b3", "b4", "b6", "b7", "b8", "c7", "d1", "we"];
  const three = ["b1", "b9", "d1"].map((tile) => ({ tile, claimed: false }));
  const play = (game, tile) => game.hand.seats[0].discards.push({ tile, claimed: false });
  const start = (hand) => table({ seats: [{ hand, discards: three }], wallLeft: 70 });

  it("says nothing in the first discards, or while the hand stays the same", () => {
    const open = table({ seats: [{ hand: mixed }], wallLeft: 70 });
    hint(open);
    play(open, "b1");
    open.hand.seats[0].hand = flush;
    assert.doesNotMatch(hint(open), /Pivoting from/);
    const game = start(flush);
    assert.doesNotMatch(hint(game), /Pivoting from/);
    play(game, "we");
    assert.doesNotMatch(hint(game), /Pivoting from/);
  });

  it("names both hands and why", () => {
    const game = start(mixed);
    assert.doesNotMatch(hint(game), /Pivoting from/);
    play(game, "we");
    game.hand.seats[0].hand = flush;
    assert.match(hint(game), /Pivoting from .+ to Full Flush in Characters: it's worth \d+ faan, and the old hand \d+\./);
  });

  it("says it once a turn, however often the hint is asked for", () => {
    const game = start(mixed);
    hint(game);
    play(game, "we");
    game.hand.seats[0].hand = flush;
    const first = hint(game);
    assert.equal(hint(game), first);
    play(game, "ws");
    assert.doesNotMatch(hint(game), /Pivoting from/);
  });

  it("keeps each coach to its own hand", () => {
    const game = start(flush);
    hint(game, B);
    play(game, "we");
    assert.doesNotMatch(hint(game, L), /Pivoting from/);
  });

  it("gives a reason on every change through real hands", async () => {
    for (const id of S.ids()) {
      const bot = S.get(id).bot;
      const agent = () => {
        const base = bot.createBotAgent();
        return {
          claim: (g, seat, o) => base.claim(g, seat, o),
          turn: async (g, seat, o) => {
            const text = Coach.forStrategy(bot).turnHint(g, seat, o).tips.join(" ");
            const said = text.match(/Pivoting from .*?: [^.]+\./g) || [];
            assert.equal(said.length, (text.match(/Pivoting from/g) || []).length, text);
            assert.doesNotMatch(said.join(" "), /undefined|NaN|Infinity/);
            return base.turn(g, seat, o);
          },
        };
      };
      for (let n = 0; n < 3; n++) {
        const game = E.createGame({ seed: 8800 + n, humanSeat: false, dealer: n });
        await E.runHand(game, [agent(), agent(), agent(), agent()], {});
      }
    }
  });
});

describe("the isolated tile in the shortest suit goes first", () => {
  const Base = require("./mahjong-bot.js");
  const every = [Base, L, B];
  const hand = ["d1", "d4", "d5", "c2", "c3", "c4", "c6", "c7", "c8", "b2", "b3", "b4", "b6", "b7"];

  it("finds a tile with nothing within 2 ranks", () => {
    const c = E.countsOf(hand);
    assert.equal(Base.isolatedTile(c, E.tileIndex("d1")), true);
    assert.equal(Base.isolatedTile(c, E.tileIndex("d4")), false);
    assert.equal(Base.isolatedTile(E.countsOf(["d1", "d3"]), E.tileIndex("d1")), false);
    assert.equal(Base.isolatedTile(E.countsOf(["d1", "d1", "d4"]), E.tileIndex("d1")), false);
    assert.equal(Base.isolatedTile(E.countsOf(["we"]), E.tileIndex("we")), false);
  });

  it("throws the 1 from 1, 4 and 5 of a suit, in every strategy", () => {
    for (const bot of every) {
      const game = table({ seats: [{ hand }], wallLeft: 70 });
      assert.equal(bot.chooseTurnAction(game, 0, { kongs: [] }).tile, "d1", bot.id);
    }
  });

  it("takes the isolated tile from the shorter suit", () => {
    const two = ["d1", "d5", "d6", "b1", "b5", "b6", "b7", "c2", "c3", "c4", "c6", "c7", "c8", "c9"];
    const game = table({ seats: [{ hand: two }], wallLeft: 70 });
    assert.equal(Base.chooseTurnAction(game, 0, { kongs: [] }).tile, "d1");
  });

  it("in the suit you hold least, throws the tile that connects the least", () => {
    // Circles is the short suit. The 4 sits farther from the 2-3 than the 2 does.
    // Five Bamboo touches nothing, so a fully-isolated rule throws that instead.
    const loose = ["d2", "d3", "d6", "b1", "b2", "b5", "b8", "b9", "c2", "c3", "c4", "c5", "c6", "c7"];
    const game = table({ seats: [{ hand: loose }], wallLeft: 70 });
    assert.equal(Base.chooseTurnAction(game, 0, { kongs: [] }).tile, "d6");
    const text = Coach.forStrategy(Base).turnHint(game, 0, { kongs: [] }).tips.join(" ");
    assert.match(text, /Nothing connects to it, and Circles is your shortest suit/);
  });

  it("throws a terminal of the shortest suit before a tile that connects less", () => {
    const loose = ["d1", "d2", "d4", "b1", "b2", "b5", "b8", "b9", "c2", "c3", "c4", "c5", "c6", "c7"];
    const game = table({ seats: [{ hand: loose }], wallLeft: 70 });
    assert.equal(Base.chooseTurnAction(game, 0, { kongs: [] }).tile, "d1");
    const text = Coach.forStrategy(Base).turnHint(game, 0, { kongs: [] }).tips.join(" ");
    assert.match(text, /Circles is your shortest suit: discard its terminal first/);
  });

  it("keeps a short-suit terminal once seven other majors belong to all terminals, mixed orphans, or thirteen orphans", () => {
    // Bamboo is the short suit, so its 1 would go first. Eight majors (the 1s, 9s and honors)
    // make it part of Mixed Orphans, so the loose 2 goes instead.
    const mixed = ["d1", "d2", "d4", "b1", "b9", "we", "ws", "ww", "wn", "dg", "c2", "c3", "c4", "c5"];
    const game = table({ seats: [{ hand: mixed }], wallLeft: 70 });
    assert.equal(Base.chooseTurnAction(game, 0, { kongs: [] }).tile, "d2");

    const terminals = ["d1", "d9", "d9", "b1", "b1", "b9", "c1", "c1", "c9", "d4", "d5", "b5", "c4", "c5"];
    const tile = Base.chooseTurnAction(table({ seats: [{ hand: terminals }], wallLeft: 70 }), 0, { kongs: [] }).tile;
    assert.ok(["d4", "d5", "b5", "c4", "c5"].includes(tile), tile);

    const thirteen = ["c1", "c9", "d1", "d9", "b1", "b9", "we", "ws", "ww", "wn", "dw", "dg", "dr", "dr"];
    assert.equal(B.chooseTurnAction(table({ seats: [{ hand: thirteen }], wallLeft: 70 }), 0, { kongs: [] }).tile, "dr");
  });

  it("still throws a short-suit terminal when the hand has fewer than 7 other majors", () => {
    const early = ["d1", "we", "ws", "ww", "wn", "dg", "dr", "b2", "b3", "b4", "b5", "b6", "b7", "b8"];
    const game = table({ seats: [{ hand: early }], wallLeft: 70 });
    assert.equal(Base.chooseTurnAction(game, 0, { kongs: [] }).tile, "d1");
    assert.equal(B.chooseTurnAction(game, 0, { kongs: [] }).tile, "d1");
  });

  it("throws a shortest-suit tile before a terminal of the longest suit", () => {
    // Circles is shortest, and 2-3-5 is not a finished straight. One and Nine
    // Bamboo are terminals of the longest suit. A middle Bamboo can still go
    // first. The circles go before either terminal.
    const hand = ["d2", "d3", "d5", "b1", "b3", "b4", "b5", "b6", "b9", "c3", "c4", "c5", "c6", "c7"];
    const game = table({ seats: [{ hand }], wallLeft: 70 });
    const list = Base.analyzeDiscards(game, 0).candidates;
    const at = (id) => list.findIndex((x) => x.tile === id);
    assert.ok(!["b1", "b9"].includes(list[0].tile), list[0].tile);
    ["d2", "d3", "d5"].forEach((tile) => {
      assert.ok(at(tile) < at("b9"), tile);
      assert.ok(at(tile) < at("b1"), tile);
    });
  });

  it("keeps a terminal that is paired or already a straight", () => {
    const pair = ["d1", "d1", "d6", "b2", "b3", "b4", "b5", "b6", "c2", "c3", "c4", "c5", "c6", "c7"];
    assert.equal(Base.chooseTurnAction(table({ seats: [{ hand: pair }], wallLeft: 70 }), 0, { kongs: [] }).tile, "d6");
    const straight = ["d1", "d2", "d3", "d7", "b2", "b3", "b4", "b5", "b6", "c2", "c3", "c4", "c5", "c6"];
    assert.equal(Base.chooseTurnAction(table({ seats: [{ hand: straight }], wallLeft: 70 }), 0, { kongs: [] }).tile, "d7");
    const otherEnd = ["d4", "d7", "d8", "d9", "b2", "b3", "b4", "b5", "b6", "c2", "c3", "c4", "c5", "c6"];
    assert.equal(Base.chooseTurnAction(table({ seats: [{ hand: otherEnd }], wallLeft: 70 }), 0, { kongs: [] }).tile, "d4");
  });

  it("still takes a discard that leaves the hand ready first", () => {
    const ready = ["d1", "c2", "c3", "c4", "c6", "c7", "c8", "dr", "dr", "dr", "b5", "b6", "b7", "b7"];
    const game = table({ seats: [{ hand: ready }], wallLeft: 70 });
    const pick = Base.analyzeDiscards(game, 0).candidates[0];
    assert.equal(pick.shanten, 0);
  });

  it("the coach says why", () => {
    const game = table({ seats: [{ hand }], wallLeft: 70 });
    const text = Coach.forStrategy(Base).turnHint(game, 0, { kongs: [] }).tips.join(" ");
    assert.match(text, /Nothing connects to it, and Circles is your shortest suit\./);
  });
});

describe("ready means the hand can win, and dragons stay", () => {
  const Base = require("./mahjong-bot.js");
  const bots = { base: Base, "jorge-yau": L, "lucky-cat": B, "only-orphans": S.get("only-orphans").bot };
  const short = {
    seats: [{ hand: ["c8", "b5", "c8", "c3", "d8", "c8", "dg", "b3", "c2", "d8", "c1"], melds: [pung("wn")] }],
    round: "e",
  };

  it("keeps a lone dragon when throwing it only makes a hand under the minimum", () => {
    for (const bot of [Base, L, B]) {
      assert.notEqual(bot.chooseTurnAction(table(short), 0, { kongs: [] }).tile, "dg");
    }
  });

  it("keeps a lone dragon on Concealed Straights, even with an honor pair kept", () => {
    const hand = ["c1", "c6", "c7", "c8", "d1", "d4", "d9", "b2", "b2", "b8", "we", "we", "dg", "dr"];
    for (const bot of Object.values(bots)) {
      const tile = bot.chooseTurnAction(table({ seats: [{ hand }] }), 0, { kongs: [] }).tile;
      assert.ok(tile !== "dg" && tile !== "dr", bot.id + " threw " + tile);
    }
  });

  it("keeps a lone dragon on a big-hand lock", () => {
    const hand = ["b1", "b2", "b3", "b5", "b6", "b8", "b9", "b9", "b4", "b4", "b7", "b7", "wn", "dr"];
    const list = L.analyzeDiscards(table({ seats: [{ hand }] }), 0).candidates;
    assert.equal(list[list.length - 1].tile, "dr");
  });

  it("does not call a shape under the minimum ready", () => {
    for (const bot of [Base, L, B]) {
      const text = Coach.forStrategy(bot).turnHint(table(short), 0, { kongs: [] }).tips.join(" ");
      assert.doesNotMatch(text, /Ready, waiting on|It leaves you ready/);
    }
  });

  it("holds to it through real hands", async () => {
    for (const bot of Object.values(bots)) {
      const coach = Coach.forStrategy(bot);
      const agent = () => {
        const base = bot.createBotAgent();
        return {
          claim: (g, seat, o) => base.claim(g, seat, o),
          turn: async (g, seat, o) => {
            const action = await base.turn(g, seat, o);
            if (o.win) return action;
            const c = E.countsOf(g.hand.seats[seat].hand);
            const ctx = bot.buildContext(g, seat);
            const canWin = (i) => {
              const after = c.slice();
              after[i]--;
              return E.shanten(after, ctx.declared) === 0 && Base.winsWhenReady(bot.readyValue(after, ctx));
            };
            const hint = coach.turnHint(g, seat, { kongs: [] });
            if (hint.tile && /Ready, waiting on|It leaves you ready/.test(hint.tips.join(" "))) {
              assert.ok(canWin(E.tileIndex(hint.tile)), hint.tips.join(" "));
            }
            if (action.type === "discard") {
              const i = E.tileIndex(action.tile);
              if (i >= 31 && c[i] === 1 && E.unseenCounts(g, seat)[i] === 3) {
                const lead = bot.analyzeDiscards(g, seat).ctx.leadPlan;
                const eyes = Base.keptHonorPair(c, ctx);
                const spare = lead && lead.id === "straights" && eyes !== null && eyes !== i;
                assert.ok(canWin(i) || spare || c.every((n, j) => !n || j === i), g.hand.seats[seat].hand.join(" "));
              }
            }
            return action;
          },
        };
      };
      for (let n = 0; n < 4; n++) {
        const game = E.createGame({ seed: 7100 + n, humanSeat: false, dealer: n });
        await E.runHand(game, [agent(), agent(), agent(), agent()], {});
      }
    }
  });
});

describe("every strategy reads the table", () => {
  const Base = require("./mahjong-bot.js");
  const collector = { discards: ["c1", "c9", "d1", "d9", "c2", "d8"] };

  it("tracks each opponent, for all of them", () => {
    for (const bot of [Base, L, B, S.get("only-orphans").bot]) {
      const ctx = bot.buildContext(table({ seats: [null, collector], wallLeft: 60 }), 0);
      assert.equal(ctx.track.seats.length, 3);
      assert.equal(ctx.track.seats[0].collecting, "b");
    }
  });

  it("feeding a tile someone collects costs more, for all of them", () => {
    const game = table({ seats: [null, collector], wallLeft: 30 });
    for (const bot of [Base, L, B]) {
      const threats = bot.opponentThreats(game, 0);
      assert.ok(bot.feedLoss(game, threats, E.tileIndex("b5")) > bot.feedLoss(game, threats, E.tileIndex("c5")));
    }
  });

  it("between close discards, keeps the tile with more copies left", () => {
    const hand = ["c2", "c3", "c4", "d2", "d3", "d4", "b2", "b3", "b4", "c6", "c6", "we", "ws", "wn"];
    const seen = { discards: ["we", "we", "we"] };
    const list = B.analyzeDiscards(table({ seats: [{ hand }, seen], wallLeft: 70 }), 0).candidates;
    const at = (t) => list.findIndex((x) => x.tile === t);
    assert.ok(at("we") < at("ws"));
  });

  it("reads your own discards: a suit you keep is favored, one you left is not", () => {
    const plan = (suit) => ({ id: "full-" + suit, suit });
    const ctx = Base.buildContext(table({ seats: [{ discards: ["c1", "c2", "c3", "we", "d5"] }] }), 0);
    ctx.leftRead = null;
    assert.ok(Base.suitLean(plan("b"), ctx) > 1);
    assert.ok(Base.suitLean(plan("c"), ctx) < 1);
  });
});

describe("the contradiction check", () => {
  const Base = require("./mahjong-bot.js");
  const at = (t) => E.tileIndex(t);
  const counts = (tiles) => E.countsOf(tiles);
  const cand = (tile, plan, shanten = 2) => ({ index: at(tile), tile, shanten, analysis: { best: { plan } } });
  const game = E.createGame({ seed: 1, humanSeat: false, dealer: 0 });
  E.startHand(game);

  it("flags a discard that goes against the hand it builds toward", () => {
    const half = { id: "half-c", suit: "c" };
    const hand = ["c1", "c2", "c3", "c5", "c6", "c7", "c8", "we", "we", "b5", "d7", "c9", "c9", "ws"];
    // A Character thrown on the way to a Half Flush in Characters while a Bamboo and a Circle are in hand.
    assert.equal(Base.contradicts(game, counts(hand), cand("c5", half)), true);
    // The Bamboo is fine.
    assert.equal(Base.contradicts(game, counts(hand), cand("b5", half)), false);
    // With only Characters and honors left, any Character may go.
    const clean = ["c1", "c2", "c3", "c5", "c6", "c7", "c8", "we", "we", "c9", "c9", "ws", "ws", "c4"];
    assert.equal(Base.contradicts(game, counts(clean), cand("c5", half)), false);
    // A discard that leaves the hand ready never contradicts it.
    assert.equal(Base.contradicts(game, counts(hand), cand("c5", half, 0)), false);
    // Hands of pungs and pairs: breaking a pair while a single is left.
    const sets = ["c2", "c2", "c2", "d5", "d5", "b8", "b8", "c9", "d1", "we", "we", "b3", "ws", "ws"];
    assert.equal(Base.contradicts(game, counts(sets), cand("d5", { id: "triplets" })), true);
    assert.equal(Base.contradicts(game, counts(sets), cand("c9", { id: "triplets" })), false);
    // Concealed Straights: an honor pair is its eyes, not a tile it has no use for.
    const runs = ["c2", "c3", "c4", "d5", "d6", "d7", "b2", "b3", "b4", "c7", "c8", "ws", "ws", "d9"];
    assert.equal(Base.contradicts(game, counts(runs), cand("d9", { id: "straights" })), false);
  });

  it("plays the first discard that doesn't contradict, or the last if they all do", () => {
    const hand = counts(["c1", "c2", "c3", "c5", "c6", "c7", "c8", "we", "we", "b5", "d7", "c9", "c9", "ws"]);
    const half = { id: "half-c", suit: "c" };
    const order = [cand("c5", half), cand("c8", half), cand("b5", half), cand("d7", half)];
    assert.deepEqual(Base.consistentFirst(order, game, hand, false).map((x) => x.tile), ["b5", "c5", "c8", "d7"]);
    // Folding, safety decides.
    assert.deepEqual(Base.consistentFirst(order, game, hand, true).map((x) => x.tile), ["c5", "c8", "b5", "d7"]);
    const all = [cand("c5", half), cand("c8", half)];
    assert.deepEqual(Base.consistentFirst(all, game, hand, false).map((x) => x.tile), ["c8", "c5"]);
  });

  it("no strategy's first discard contradicts its own plan", () => {
    for (const id of S.ids()) {
      const bot = S.get(id).bot;
      for (let seed = 1; seed <= 25; seed++) {
        const g = E.createGame({ seed, humanSeat: true, dealer: 0 });
        E.startHand(g);
        const res = bot.analyzeDiscards(g, 0);
        if (res.folding) continue;
        const first = res.candidates[0];
        assert.equal(Base.contradicts(g, E.countsOf(g.hand.seats[0].hand), first), false, id + " " + seed + " " + first.tile);
      }
    }
  });
});
