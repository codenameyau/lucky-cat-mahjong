/* The first game: one fixed East hand, and only the move the coach names.

   You are East. Plum, your flower, and Spring, your season, set aside (two
   faan). You chow 2-3-4 Bamboo, pung
   8 Bamboo, and kong the fourth 8. Three Red Dragons stay concealed. A pair
   of 6 Bamboo is the pair. East Wind, taken from a discard, finishes the
   East Wind triplet and the Half Flush. */

(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  // Opening hands, 13 tiles each. East's 14th tile is EXTRA.
  // Opponents hold no pairs, so they never claim ahead of the lesson.
  var HANDS = [
    ["f1", "dr", "dr", "dr", "we", "we", "b2", "b3", "b8", "b8", "b6", "b6", "s1"],
    ["c9", "d4", "d5", "d6", "b1", "b5", "b7", "b9", "ws", "wn", "ww", "dg", "dr"],
    ["c2", "c3", "c4", "c6", "d2", "d3", "d7", "d8", "b1", "b5", "b9", "ws", "ww"],
    ["b1", "b5", "b7", "b9", "d3", "d4", "d5", "ws", "wn", "dg", "dw", "c2", "c3"],
  ];
  var EXTRA = "d9";
  // Draws after the deal, front of the wall. The last three tiles of the wall
  // are popped: c1 and c5 replace the flower and the season, d1 replaces the kong.
  var DRAWS = ["c7", "c8", "b4", "b8", "dg", "dw", "ww", "b8", "we"];
  var BACK = ["d1", "c5", "c1"];

  function fullSet() {
    var tiles = [];
    ["c", "d", "b"].forEach(function (s) {
      for (var v = 1; v <= 9; v++) for (var n = 0; n < 4; n++) tiles.push(s + v);
    });
    ["we", "ws", "ww", "wn", "dw", "dg", "dr"].forEach(function (id) {
      for (var n = 0; n < 4; n++) tiles.push(id);
    });
    ["f1", "f2", "f3", "f4", "s1", "s2", "s3", "s4"].forEach(function (id) { tiles.push(id); });
    return tiles;
  }

  function pull(bag, id) {
    var at = bag.indexOf(id);
    if (at === -1) throw new Error("lesson wall is short a " + id);
    bag.splice(at, 1);
    return id;
  }

  // Deal order: 13 rounds of East, South, West, North, then East's 14th.
  function wall() {
    var bag = fullSet();
    var front = [];
    for (var r = 0; r < 13; r++) {
      for (var s = 0; s < 4; s++) front.push(pull(bag, HANDS[s][r]));
    }
    front.push(pull(bag, EXTRA));
    DRAWS.forEach(function (id) { front.push(pull(bag, id)); });
    var back = BACK.map(function (id) { return pull(bag, id); });
    var built = front.concat(bag, back);
    if (built.length !== 144) throw new Error("lesson wall has " + built.length + " tiles");
    return built;
  }

  // Each of your moves is a few short cards: the ones to read first, then
  // the one to do (the last). A card's `point` is what the table shows with
  // a pulsing ring: a tile in your hand, a button (by its id), or the tile up
  // for a claim ("claim-tile"). The tips are the cards' text run together,
  // for the Coach panel's history.
  // `id` is the step's stable name, for analytics (it stays when steps move). `gate` holds the card until the player has done what it asks (open and close Rules).
  function read(id, text, point, gate) { return { id: id, text: text, point: point || null, gate: gate || null }; }

  function say(action, tile, decision, cards) {
    return {
      kind: decision.type === "discard" ? "discard" : "claim", action: action, tile: tile || null, decision: decision,
      cards: cards, tips: cards.map(function (c) { return c.text; }),
    };
  }

  // Before the first move: the deal has put Plum in your hand, and the table
  // waits for the Replace flowers button (the tutorial's only).
  var FLOWER_HINT = { kind: "flower", action: "Replace flowers.", tile: "f1", decision: null, cards: [
    read("welcome", "Welcome! I'm your coach, Lucky Cat. We'll play one hand of Hong Kong Mahjong together, one small step at a time."),
    read("plum-flower", "At the beginning, every player announces and sets aside every flower and season tile they drew, starting with the player sitting in East.", "f1,s1"),
    read("flower-faan", "Both have the number 1, and you sit on East, seat number 1, so they match your seat and each scores 1 faan: +2 faan.", "f1,s1"),
    read("replace-flowers", "Press Replace flowers. They go in front of you face up, and you draw a new tile for each from the end of the wall.", "replace-flower"),
  ], tiles: ["f1", "s1"] };
  FLOWER_HINT.tips = FLOWER_HINT.cards.map(function (c) { return c.text; });

  // The moves, in the order the table asks for them. `drawn` discards the
  // tile that seat just drew. Seat 0 is the player; those steps carry the
  // coach's cards, and any other choice is refused.
  var STEPS = [
    { seat: 0, kind: "turn", action: { type: "discard", tile: "c1" }, hint: say("Discard 1 Character.", "c1", { type: "discard" }, [
      read("east-goes-first", "The player on East always goes first. That's you!"),
      read("rules-concealed", "The tiles in your hand are concealed: only you see them. Click Rules at the top to see every hand pattern and how to score faan, then close it.", "rules", "rules"),
      read("discard-1-character", "We're going to learn the hand pattern for half flush, the most common way to win. Tap the 1 Character twice to discard it.", "c1"),
    ]) },
    { seat: 1, kind: "turn", drawn: true },
    { seat: 2, kind: "turn", drawn: true },
    { seat: 3, kind: "turn", drawn: true },
    { seat: 0, kind: "claim", action: { type: "chow", tiles: ["b2", "b3"] }, hint: say("Chow 2-3-4 Bamboo.", null, { type: "chow", tiles: ["b2", "b3"] }, [
      read("chow-claim", "The player on your left threw 4 Bamboo. You hold 2 and 3 Bamboo, so you can make a chow: 3 tiles of one suit in a row.", "claim-tile"),
      read("chow-one-suit", "A chow always comes from one suit: Bamboo, Dots or Characters."),
      read("chow-exposed", "You can claim a tile from the player on your left to make a chow. A claimed meld is exposed: everyone sees it, and its tiles stay together."),
      read("chow-press", "Press Chow 2-3-4 to claim the 4 Bamboo.", "chow-2-3-4"),
    ]) },
    { seat: 0, kind: "turn", action: { type: "discard", tile: "d9" }, hint: say("Discard 9 Dots.", "d9", { type: "discard" }, [
      read("half-flush-aim", "You don't draw after claiming a tile. Let's aim for a half flush in Bamboo, worth 3 faan."),
      read("discard-9-dots", "Tap the 9 Dots twice to discard it.", "d9"),
    ]) },
    { seat: 1, kind: "turn", drawn: true },
    { seat: 0, kind: "claim", action: { type: "pung" }, hint: say("Pung 8 Bamboo.", "b8", { type: "pung" }, [
      read("pung-claim", "A pung is 3 of the same tile. You hold two 8 Bamboo, and 8 Bamboo was just thrown.", "claim-tile"),
      read("pung-any-player", "You can claim a discard from any player to make a pung. It skips the other players' turns."),
      read("eyes", "Keep your two 6 Bamboo. They're your eyes: the pair every winning hand needs.", "b6"),
      read("pung-press", "Press Pung to claim the 8 Bamboo.", "pung"),
    ]) },
    { seat: 0, kind: "turn", action: { type: "discard", tile: "c5" }, hint: say("Discard 5 Characters.", "c5", { type: "discard" }, [
      read("half-flush-honors", "A half flush is one suit plus any triplets or a pair of Dragon or Wind tiles."),
      read("discard-5-characters", "Tap the 5 Characters twice to discard it. Then your hand is all Bamboo, Dragons and Winds.", "c5"),
    ]) },
    { seat: 1, kind: "turn", drawn: true },
    { seat: 2, kind: "turn", drawn: true },
    { seat: 3, kind: "turn", drawn: true },
    { seat: 0, kind: "turn", action: { type: "kong", tile: "b8" }, hint: say("Kong 8 Bamboo.", "b8", { type: "kong" }, [
      read("kong-fourth-tile", "You drew the fourth 8 Bamboo!", "b8"),
      read("kong-explained", "Add it to your pung to make a kong: 4 of a kind. A kong draws a replacement tile from the back of the wall."),
      read("kong-press", "Press Kong 8B.", "kong-b8"),
    ]) },
    { seat: 0, kind: "turn", action: { type: "discard", tile: "d1" }, hint: say("Discard 1 Dot.", "d1", { type: "discard" }, [
      read("replacement-tile", "Your replacement tile is 1 Dot. Throw it, and you're one tile from winning: you need East Wind."),
      read("discard-1-dot", "Tap the 1 Dot twice to discard it.", "d1"),
    ]) },
    { seat: 1, kind: "turn", drawn: true },
    { seat: 0, kind: "claim", action: { type: "win" }, hint: say("Win on East Wind.", null, { type: "win" }, [
      read("east-wind-thrown", "The player on your right threw East Wind! You can claim the last tile you need to win from any player.", "claim-tile"),
      read("round-wind", "The wind in the middle of the table is the round wind. This is the East round, so a triplet of East Wind scores 1 faan for the round wind.", "table-wind"),
      read("seat-wind", "You sit on East, so East is also your seat wind. A triplet of East Wind scores another 1 faan for your seat wind: 2 faan in all."),
      read("self-draw", "Draw East Wind yourself and it's a self-draw: every opponent pays."),
      read("discard-win-payment", "This win is on a discard, so only the player who threw it out pays."),
      read("win-press", "Press Win to finish your half flush.", "win"),
    ]) },
  ];

  function stepAt(game) { return STEPS[game.lessonStep]; }

  // The player's own moves (seat 0's steps), for analytics: how many there are.
  var MOVES = STEPS.filter(function (st) { return st.seat === 0; }).length;

  // The tutorial's steps as the player sees them ("Step N of M"): every card
  // of the flower step and of each move.
  function cardsBefore(game) {
    var n = game.lessonFlowers || game.lessonStep ? FLOWER_HINT.cards.length : 0;
    for (var i = 0; i < Math.min(game.lessonStep || 0, STEPS.length); i++) if (STEPS[i].hint) n += STEPS[i].hint.cards.length;
    return n;
  }
  var SCREENS = cardsBefore({ lessonFlowers: true, lessonStep: STEPS.length });

  // The step number (1 to SCREENS) of a hint's card.
  function screen(game, note, card) {
    var before = note === FLOWER_HINT ? 0 : cardsBefore(Object.assign({}, game, { lessonFlowers: true }));
    return before + Math.max(0, Math.min(card || 0, note.cards.length - 1)) + 1;
  }

  // How many of the player's moves are done, and what the next one is; and
  // how many of the steps the player sees are done (`screen` of `screens`).
  function progress(game) {
    var done = 0;
    for (var i = 0; i < Math.min(game.lessonStep || 0, STEPS.length); i++) if (STEPS[i].seat === 0) done++;
    var next = null;
    for (var j = game.lessonStep || 0; j < STEPS.length; j++) {
      if (STEPS[j].seat === 0) { next = STEPS[j].action.type; break; }
    }
    return { move: done, moves: MOVES, next: next, screen: cardsBefore(game), screens: SCREENS };
  }

  function wanted(game, step) {
    if (step.drawn) return { type: "discard", tile: game.hand.drawnTile };
    return step.action;
  }

  function sameTiles(a, b) {
    return (a || []).slice().sort().join() === (b || []).slice().sort().join();
  }

  function matches(game, seat, kind, decision) {
    var step = stepAt(game);
    if (!step || step.seat !== seat || step.kind !== kind || !decision) return false;
    var want = wanted(game, step);
    if (decision.type !== want.type) return false;
    if (want.type === "discard" || want.type === "kong") return decision.tile === want.tile;
    if (want.type === "chow") return sameTiles(decision.tiles, want.tiles);
    return true;
  }

  function take(game, seat, kind) {
    var step = stepAt(game);
    var action = step && wanted(game, step);
    if (!action || !matches(game, seat, kind, action)) {
      throw new Error("First game left its script at step " + game.lessonStep);
    }
    game.lessonStep++;
    return action;
  }

  function accept(game, seat, kind, decision) {
    if (!matches(game, seat, kind, decision)) return false;
    game.lessonStep++;
    return true;
  }

  function hint(game) {
    var step = stepAt(game);
    return step && step.hint ? step.hint : null;
  }

  function prepare(game) {
    game.fixedWall = wall();
    game.lessonStep = 0;
    game.dealer = 0;
    game.firstDealer = 0;
    game.round = 1;
  }

  // Every card's text, in the order the player reads them.
  function cardTexts() {
    var out = FLOWER_HINT.cards.map(function (c) { return c.text; });
    STEPS.forEach(function (st) { if (st.hint) st.hint.cards.forEach(function (c) { out.push(c.text); }); });
    return out;
  }

  // Every step as the player sees it, in order, and where it lives: the move's index
  // in the script (STEPS) and the card in it. The flower steps are `flower`.
  // `name` is the id with the step's number in front, two digits, for reports: 01-welcome.
  function row(n, c, step, card, flower) {
    return { n: n, id: c.id, name: (n < 10 ? "0" : "") + n + "-" + c.id, text: c.text, step: step, card: card, flower: flower };
  }

  function outline() {
    var rows = [];
    FLOWER_HINT.cards.forEach(function (c, i) { rows.push(row(rows.length + 1, c, 0, i, true)); });
    STEPS.forEach(function (st, k) {
      if (st.hint) st.hint.cards.forEach(function (c, i) { rows.push(row(rows.length + 1, c, k, i, false)); });
    });
    return rows;
  }

  var api = { outline: outline, cardTexts: cardTexts, FLOWER_HINT: FLOWER_HINT, wall: wall, prepare: prepare, hint: hint, matches: matches, accept: accept, take: take, progress: progress, screen: screen, MOVES: MOVES, SCREENS: SCREENS };

  if (node) module.exports = api;
  else root.MahjongLesson = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
