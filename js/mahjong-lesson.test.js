"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const E = require("./mahjong-engine.js");
const Lesson = require("./mahjong-lesson.js");

function scripted(seat) {
  return {
    turn: function (g, s) { return Promise.resolve(Lesson.take(g, s, "turn")); },
    claim: function (g, s) { return Promise.resolve(Lesson.take(g, s, "claim")); },
  };
}

describe("the first game", () => {
  it("refuses every move except the one the coach names", () => {
    const game = { lessonStep: 0, hand: { drawnTile: null } };
    assert.equal(Lesson.accept(game, 0, "turn", { type: "discard", tile: "d9" }), false);
    assert.equal(game.lessonStep, 0);
    assert.equal(Lesson.accept(game, 0, "turn", { type: "discard", tile: "c1" }), true);
    assert.equal(game.lessonStep, 1);
    assert.match(Lesson.hint({ lessonStep: 0 }).action, /1 Character/);
  });

  it("counts the player's own moves for analytics: 8 of them, and names the next", () => {
    assert.equal(Lesson.MOVES, 8);
    assert.deepEqual(Lesson.progress({ lessonStep: 0 }), { move: 0, moves: 8, next: "discard" });
    // After the first discard, the three other seats play, then the chow.
    assert.deepEqual(Lesson.progress({ lessonStep: 1 }), { move: 1, moves: 8, next: "chow" });
    assert.deepEqual(Lesson.progress({ lessonStep: 4 }), { move: 1, moves: 8, next: "chow" });
    assert.deepEqual(Lesson.progress({ lessonStep: 5 }), { move: 2, moves: 8, next: "discard" });
    assert.deepEqual(Lesson.progress({ lessonStep: 16 }), { move: 8, moves: 8, next: null });
  });

  it("wins a Half Flush by taking East Wind", async () => {
    const game = E.createGame({ dealer: 0, mode: "practice", seed: 1 });
    Lesson.prepare(game);
    const res = await E.runHand(game, [0, 1, 2, 3].map(scripted), {});
    assert.equal(res.type, "win");
    assert.equal(res.winner, 0);
    assert.equal(res.how, "discard");
    assert.equal(res.tile, "we");
    assert.equal(res.payer, 1);
    assert.deepEqual(res.flowers, ["f1"]);
    const melds = res.melds.map((m) => m.type + " " + m.tiles.join(""));
    assert.deepEqual(melds, ["chow b2b3b4", "kong b8b8b8b8"]);
    assert.deepEqual(res.concealed.filter((id) => id === "dr").length, 3);
    assert.deepEqual(res.concealed.filter((id) => id === "we").length, 3);
    assert.deepEqual(res.concealed.filter((id) => id === "b6").length, 2);
    const names = res.score.items.map((it) => it.name);
    assert.ok(names.indexOf("Half Flush") !== -1, names.join(", "));
    assert.ok(names.indexOf("Dragon Triplet") !== -1, names.join(", "));
    assert.ok(names.indexOf("Seat and Round Wind") !== -1, names.join(", "));
    assert.ok(names.indexOf("Seat Flower") !== -1, names.join(", "));
    assert.ok(res.score.faan >= 3, String(res.score.faan));
    assert.equal(game.lessonStep, 16);
  });
});
