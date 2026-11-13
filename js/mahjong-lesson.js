/* The first game: one fixed East hand, and only the move the coach names.

   You are East. Plum, your flower, sets aside. You chow 2-3-4 Bamboo, pung
   8 Bamboo, and kong the fourth 8. Three Red Dragons stay concealed. A pair
   of 6 Bamboo is the pair. East Wind, taken from a discard, finishes the
   East Wind triplet and the Half Flush. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  // Opening hands, 13 tiles each. East's 14th tile is EXTRA.
  // Opponents hold no pairs, so they never claim ahead of the lesson.
  var HANDS = [
    ['f1', 'dr', 'dr', 'dr', 'we', 'we', 'b2', 'b3', 'b8', 'b8', 'b6', 'b6', 'c1'],
    ['c9', 'd4', 'd5', 'd6', 'b1', 'b5', 'b7', 'b9', 'ws', 'wn', 'ww', 'dg', 'dr'],
    ['c2', 'c3', 'c4', 'c6', 'd2', 'd3', 'd7', 'd8', 'b1', 'b5', 'b9', 'ws', 'ww'],
    ['b1', 'b5', 'b7', 'b9', 'd3', 'd4', 'd5', 'ws', 'wn', 'dg', 'dw', 'c2', 'c3'],
  ];
  var EXTRA = 'd9';
  // Draws after the deal, front of the wall. The last two tiles of the wall
  // are popped: c5 replaces the flower, d1 replaces the kong.
  var DRAWS = ['c7', 'c8', 'b4', 'b8', 'dg', 'dw', 'ww', 'b8', 'we'];
  var BACK = ['d1', 'c5'];

  function fullSet() {
    var tiles = [];
    ['c', 'd', 'b'].forEach(function (s) {
      for (var v = 1; v <= 9; v++) for (var n = 0; n < 4; n++) tiles.push(s + v);
    });
    ['we', 'ws', 'ww', 'wn', 'dw', 'dg', 'dr'].forEach(function (id) {
      for (var n = 0; n < 4; n++) tiles.push(id);
    });
    ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'].forEach(function (id) { tiles.push(id); });
    return tiles;
  }

  function pull(bag, id) {
    var at = bag.indexOf(id);
    if (at === -1) throw new Error('lesson wall is short a ' + id);
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
    if (built.length !== 144) throw new Error('lesson wall has ' + built.length + ' tiles');
    return built;
  }

  function say(action, tile, decision, tips) {
    return { kind: decision.type === 'discard' ? 'discard' : 'claim', action: action, tile: tile || null, decision: decision, tips: tips };
  }

  // Step one, before the first move: the deal has put Plum in your hand, and
  // the table waits for the Replace flowers button (the tutorial's only).
  var FLOWER_HINT = { kind: 'flower', action: 'Replace flowers.', tile: 'f1', decision: null, tips: [
    'Welcome, I\'m your coach! At the beginning of the game, reveal and set aside any flower and season tiles and draw a replacement tile for each.',
    'Plum is your flower since it has the number 1 and you sit on East, which is seat number 1, so it scores a faan since they match.',
  ] };

  // The moves, in the order the table asks for them. `drawn` discards the
  // tile that seat just drew. Seat 0 is the player; those steps carry the
  // coach line, and any other choice is refused.
  var STEPS = [
    { seat: 0, kind: 'turn', action: { type: 'discard', tile: 'c1' }, hint: say('Discard 1 Character.', 'c1', { type: 'discard' }, [
      'The player sitting on East always goes first. Tiles in your hand are concealed. Click Rules to see all hand patterns and ways to gain faan. Double click on a tile to discard it.',
    ]) },
    { seat: 1, kind: 'turn', drawn: true },
    { seat: 2, kind: 'turn', drawn: true },
    { seat: 3, kind: 'turn', drawn: true },
    { seat: 0, kind: 'claim', action: { type: 'chow', tiles: ['b2', 'b3'] }, hint: say('Chow 2-3-4 Bamboo.', null, { type: 'chow', tiles: ['b2', 'b3'] }, [
      'A chow is three tiles of the same suit (either Bamboo, Dots, or Characters) in a sequential order. You can claim a tile from the player on your left to form a chow. After claiming a tile from another player, you must expose all tiles used to form that meld. Those tiles can no longer be separated.',
    ]) },
    { seat: 0, kind: 'turn', action: { type: 'discard', tile: 'd9' }, hint: say('Discard 9 Dots.', 'd9', { type: 'discard' }, [
      'You do not draw after claiming a tile. Let\'s go for a half flush in Bamboo, which is worth 3 faan. Discard the 9 Dots.',
    ]) },
    { seat: 1, kind: 'turn', drawn: true },
    { seat: 0, kind: 'claim', action: { type: 'pung' }, hint: say('Pung 8 Bamboo.', 'b8', { type: 'pung' }, [
      'A pung is three tiles of a kind. You can claim a discarded tile from any player to form a pung, which immediately skips all other players\' turns. Afterwards, expose the pung. Let\'s keep the two 6 Bamboo tiles as your pair or eyes, which is needed in every hand to win.',
    ]) },
    { seat: 0, kind: 'turn', action: { type: 'discard', tile: 'c5' }, hint: say('Discard 5 Characters.', 'c5', { type: 'discard' }, [
      'To reach 3 faan, the most common hand is a half flush so your tiles are just one suit plus any combination of Dragon or Wind tiles. Discard the 5 Characters so your hand only has Bamboo tiles.',
    ]) },
    { seat: 1, kind: 'turn', drawn: true },
    { seat: 2, kind: 'turn', drawn: true },
    { seat: 3, kind: 'turn', drawn: true },
    { seat: 0, kind: 'turn', action: { type: 'kong', tile: 'b8' }, hint: say('Kong 8 Bamboo.', 'b8', { type: 'kong' }, [
      'You drew the fourth 8 Bamboo. Add it to the pung to make a kong. A kong draws a replacement from the back of the wall.',
    ]) },
    { seat: 0, kind: 'turn', action: { type: 'discard', tile: 'd1' }, hint: say('Discard 1 Dot.', 'd1', { type: 'discard' }, [
      'That replacement tile is now part of the hand. You are ready on East Wind.',
      'Draw East Wind yourself and it is a self-draw: every opponent pays. Take it from a discard and only the player who threw it pays.',
    ]) },
    { seat: 1, kind: 'turn', drawn: true },
    { seat: 0, kind: 'claim', action: { type: 'win' }, hint: say('Win on East Wind.', null, { type: 'win' }, [
      'East Wind finishes your wind triplet. You are East, and the round is East, so it scores as your seat wind and the round wind.',
      'This is claiming a winning tile, not a self-draw, so only the thrower pays.',
      'The hand is now a half flush. You can claim the last tile you need to win from anyone. Claim the East Wind to win.',
    ]) },
  ];

  // The first discard points to the Rules button, which glows gold then.
  STEPS[0].hint.highlight = 'rules';

  function stepAt(game) { return STEPS[game.lessonStep]; }

  // The player's own moves (seat 0's steps), for analytics: how many there are.
  var MOVES = STEPS.filter(function (st) { return st.seat === 0; }).length;

  // How many of the player's moves are done, and what the next one is.
  function progress(game) {
    var done = 0;
    for (var i = 0; i < Math.min(game.lessonStep || 0, STEPS.length); i++) if (STEPS[i].seat === 0) done++;
    var next = null;
    for (var j = game.lessonStep || 0; j < STEPS.length; j++) {
      if (STEPS[j].seat === 0) { next = STEPS[j].action.type; break; }
    }
    return { move: done, moves: MOVES, next: next };
  }

  function wanted(game, step) {
    if (step.drawn) return { type: 'discard', tile: game.hand.drawnTile };
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
    if (want.type === 'discard' || want.type === 'kong') return decision.tile === want.tile;
    if (want.type === 'chow') return sameTiles(decision.tiles, want.tiles);
    return true;
  }

  function take(game, seat, kind) {
    var step = stepAt(game);
    var action = step && wanted(game, step);
    if (!action || !matches(game, seat, kind, action)) {
      throw new Error('First game left its script at step ' + game.lessonStep);
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

  var api = { FLOWER_HINT: FLOWER_HINT, wall: wall, prepare: prepare, hint: hint, matches: matches, accept: accept, take: take, progress: progress, MOVES: MOVES };

  if (node) module.exports = api;
  else root.MahjongLesson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
