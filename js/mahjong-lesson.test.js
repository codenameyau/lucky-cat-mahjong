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
    const at = (game) => { const p = Lesson.progress(game); return { move: p.move, moves: p.moves, next: p.next }; };
    assert.deepEqual(at({ lessonStep: 0 }), { move: 0, moves: 8, next: "discard" });
    // After the first discard, the three other seats play, then the chow.
    assert.deepEqual(at({ lessonStep: 1 }), { move: 1, moves: 8, next: "chow" });
    assert.deepEqual(at({ lessonStep: 4 }), { move: 1, moves: 8, next: "chow" });
    assert.deepEqual(at({ lessonStep: 5 }), { move: 2, moves: 8, next: "discard" });
    assert.deepEqual(at({ lessonStep: 16 }), { move: 8, moves: 8, next: null });
  });

  it("shows 22 short steps: 3 for the flowers, then each move's cards", () => {
    assert.equal(Lesson.SCREENS, 22);
    // Steps done: none before the flowers, 3 after them, 5 after the first discard.
    assert.equal(Lesson.progress({ lessonStep: 0 }).screen, 0);
    assert.equal(Lesson.progress({ lessonStep: 0, lessonFlowers: true }).screen, 3);
    assert.equal(Lesson.progress({ lessonStep: 1 }).screen, 5);
    assert.equal(Lesson.progress({ lessonStep: 16 }).screen, 22);
    assert.equal(Lesson.progress({ lessonStep: 16 }).screens, 22);
    // Each card's number, flowers first, with no gaps.
    const numbers = [];
    Lesson.FLOWER_HINT.cards.forEach((c, i) => numbers.push(Lesson.screen({ lessonStep: 0 }, Lesson.FLOWER_HINT, i)));
    for (let step = 0; step < 16; step++) {
      const note = Lesson.hint({ lessonStep: step });
      if (note) note.cards.forEach((c, i) => numbers.push(Lesson.screen({ lessonStep: step }, note, i)));
    }
    assert.deepEqual(numbers, Array.from({ length: 22 }, (x, i) => i + 1));
  });

  it("keeps every step short, and ends each move on what to do and where", () => {
    const notes = [Lesson.FLOWER_HINT];
    for (let step = 0; step < 16; step++) {
      const note = Lesson.hint({ lessonStep: step });
      if (note) notes.push(note);
    }
    assert.equal(notes.length, 9);
    // What each move's last card points at: the tile, or the button to press.
    const targets = ["replace-flower", "c1", "chow-2-3-4", "d9", "pung", "c5", "kong-b8", "d1", "win"];
    notes.forEach((note, k) => {
      assert.ok(note.cards.length >= 1 && note.cards.length <= 3, note.action);
      note.cards.forEach((c) => {
        assert.ok(c.text.length <= 160, c.text.length + ": " + c.text);
        assert.doesNotMatch(c.text, /\bsets?\b(?! aside)/, c.text); // meld, never set (setting a tile aside is fine)
      });
      assert.equal(note.cards[note.cards.length - 1].point, targets[k], note.action);
      assert.deepEqual(note.tips, note.cards.map((c) => c.text));
    });
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
