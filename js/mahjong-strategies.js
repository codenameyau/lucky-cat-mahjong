/* Bot strategies for the Play game: the list the Strategies sheet shows,
   which strategy each bot seat and the coach use, and how to make an agent
   for one. A strategy is a bot API from MahjongBot.createStrategy, built on
   the shared foundation in js/mahjong-bot.js.

   To add one: build it with MahjongBot.createStrategy({ id, hooks, tuning }),
   load its script before this one, and add an entry to STRATEGIES. The
   competition (npm run compete) can then play it against the others. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var L = node ? require('./mahjong-lucky-cat.js') : root.MahjongLuckyCat;
  var J = node ? require('./mahjong-jorge-yau.js') : root.MahjongJorgeYau;
  var O = node ? require('./mahjong-only-orphans.js') : root.MahjongOnlyOrphans;
  var N = node ? require('./mahjong-ml.js') : root.MahjongML;

  var STRATEGIES = [
    {
      id: 'jorge-yau',
      name: 'Jorge Yau',
      bot: J,
      summary: 'Reads the opening hand, picks one hand to build and pivots. Attacks with no defense, keeps honors, and locks onto a hand worth 7 faan or more. Only plays safe late, when it is far from winning.',
      details: [
        'It looks at the opening hand and picks a target, in this order: Thirteen Orphans, Nine Gates, Four Winds, All Terminals, All Honors, Seven Pairs, Full Flush, Concealed Triplets, Half Flush and Concealed Straights. Tiles the target can\'t use go first.',
        'Each turn it reads the hand again. A stronger target replaces the old one, and when a target can\'t be made it pivots: Seven Pairs to Concealed Triplets to All Triplets, Concealed Triplets to All Triplets or Seven Pairs, Full Flush to Half Flush, Four Winds to All Honors, and Thirteen Orphans to Seven Pairs with Mixed Orphans.',
        'With a seat or round wind, or a seat flower, the hand already has faan, so it plays for speed. It also counts wins off the last tile and off a kong toward the 3-faan minimum.',
        'With 8 tiles of a hand worth 7 faan or more within its first 8 turns (a Full Flush, Thirteen Orphans, Nine Gates, All Honors, All Terminals, Four Winds, Three Dragons or Mixed Orphans), it locks onto that hand and keeps those tiles until the hand can\'t be won.',
        'It keeps honors as long as it can. Number tiles that cost no step go first, then lone honors, and honor pairs stay longest. A lone honor with the other three copies on the table goes first of all.',
        'It claims any chow, pung or kong that brings the hand closer and can still reach 3 faan. On a lock, it claims only that hand\'s tiles.',
        'It plays no defense: it never folds and doesn\'t mind what it feeds. The one exception is late in the wall, when it is still two or more tiles from ready and holds no lock. Then it stops building, plays safe and stops feeding chow tiles and fresh honors, using its reads of what each opponent is collecting.',
      ],
      doc: 'docs/strategies/jorge-yau.md',
    },
    {
      id: 'lucky-cat',
      name: 'Lucky Cat',
      bot: L,
      summary: 'Tracks every discard by who threw it and plays the odds to the fastest 3-faan win. Avoids feeding the table, more and more toward the end.',
      details: [
        'It remembers every discard, who threw it, and what each opponent let go by. From that it estimates what each one wants, and where the unseen copies of each tile are likely to be. It never looks at the wall or another player\'s hand.',
        'For every possible discard it works out the odds of finishing each hand before the wall runs out or someone else wins. A win at the 3-faan minimum comes first, so a bigger hand has to be close to as fast. A ready hand that can win is not broken for a bigger one.',
        'It reads again every turn, so it pivots to a new hand as soon as another one looks faster, or when an opponent starts collecting what it needs or changes hands.',
        'It switches to Seven Pairs, Thirteen Orphans or Nine Gates when the hand is close to one. Otherwise it plays a standard hand, Half Flush, Full Flush, All Triplets or Concealed Straights, whichever has the best odds, and keeps the tiles for Mixed Orphans, All Terminals, All Honors, Small Three Dragons, Big Three Dragons, Small Four Winds or Big Four Winds while one is in reach.',
        'It keeps pairs and unseen dragons, throws other suits first once it commits to one, and chows only for a ready hand, a flush, or late in the hand. Dragons and scoring winds are always punged.',
        'Each opponent gets a threat level from their melds and discards. A tile they\'d claim costs a little early and much more late, so it stops feeding them near the end. When someone looks close and the hand is slow, or the wall is nearly gone, safety decides the discard.',
      ],
      doc: 'docs/strategies/lucky-cat.md',
    },
    {
      id: 'only-orphans',
      name: 'Only Orphans',
      bot: O,
      summary: 'Goes for Thirteen Orphans every hand. When that has little chance left, it pivots to a hand of only 1s, 9s and honors.',
      details: [
        'It throws every tile that isn\'t a 1, a 9 or an honor first, and claims nothing. It stays on Thirteen Orphans for at least its first six discards, however far away the hand is.',
        'It gives up when a tile it needs has run out, or when the chance of finishing falls under about 1 in 1,000.',
        'Then it pivots to whichever has the best odds for what it pays: Mixed Orphans, Seven Pairs with Mixed Orphans, or All Terminals or All Honors, as triplets or as pairs. Triplets pung any tile they keep. Pairs claim nothing.',
        'Only if none of those can be finished does it play the usual hands. It defends like the other bots, and when it folds, safety decides among the tiles it can spare.',
      ],
      doc: 'docs/strategies/only-orphans.md',
    },
  ];

  // Neural Cat, the learned strategy. A page that doesn't load its scripts
  // (js/mahjong-ml*.js) leaves it out.
  if (N) {
    // Listed before Only Orphans.
    STRATEGIES.splice(2, 0, {
      id: 'neural-cat',
      name: 'Neural Cat',
      bot: N,
      summary: 'Plays Jorge Yau\'s hands, but a neural network trained on simulated games picks the discard worth the most points on average: wins that come often and wins that pay big both count.',
      details: [
        'It reads the hand the way Jorge Yau does: the target hand, the plans it can still make, steps from ready, live tiles, and how risky each tile is.',
        'Then a neural network trained on simulated hands, most of them against other Neural Cat models, looks at Jorge Yau\'s three best discards and predicts how the hand ends after each: the chance to win by self-draw or off a discard, the chance to deal in, and how many faan each would be.',
        'Those make one number, the points the discard is worth on average, and the discard worth the most goes. A quick small win and a slower big one are weighed on the same scale.',
        'The coach says, in points, what the model expects from its pick and the next best, its chance to win and how much, and which parts of the position put its pick ahead: speed, hand value, safety, what the table shows.',
        'Claims and kongs are weighed the same way: passing, each pung, chow or kong and the best discard after it, each scored in points. When the model\'s pick is worth more than Jorge Yau\'s call, the model\'s goes, and the coach shows the points for each choice.',
        'It plays fair: it sees only what its seat can see, the same as you. Never the wall, another player\'s hand, or which tile a concealed kong is.',
      ],
      doc: 'docs/strategies/neural-cat.md',
    });
  }

  // Lab strategies: playable by id (npm run compete, npm run review, a
  // saved pick) but not on the Strategies sheet or in the random seats.
  var LAB = [];

  var DEFAULT_COACH = N ? 'neural-cat' : 'jorge-yau'; // Neural Cat, where its scripts load
  var BY_ID = {};
  STRATEGIES.concat(LAB).forEach(function (s) { BY_ID[s.id] = s; });

  function list() { return STRATEGIES.slice(); }
  function ids() { return STRATEGIES.map(function (s) { return s.id; }); }
  function has(id) { return !!BY_ID[id]; }
  function isLab(id) { return !!(BY_ID[id] && BY_ID[id].lab); }
  function labIds() { return LAB.map(function (s) { return s.id; }); }
  // Adds a lab strategy at run time, e.g. Neural Cat with other weights
  // ("ml:<file>" in npm run compete).
  function addLab(entry) {
    entry.lab = true;
    if (!BY_ID[entry.id]) LAB.push(entry);
    BY_ID[entry.id] = entry;
    return entry;
  }

  // The strategy with this id, or the default one.
  function get(id) { return BY_ID[id] || BY_ID[DEFAULT_COACH]; }

  function randomId(rng) {
    var r = rng ? rng() : Math.random();
    return STRATEGIES[Math.floor(r * STRATEGIES.length)].id;
  }

  // An engine agent (turn/claim) that plays this strategy.
  function createAgent(id) {
    return get(id).bot.createBotAgent();
  }

  var api = {
    STRATEGIES: STRATEGIES,
    DEFAULT_COACH: DEFAULT_COACH,
    list: list,
    ids: ids,
    has: has,
    isLab: isLab,
    labIds: labIds,
    addLab: addLab,
    get: get,
    randomId: randomId,
    createAgent: createAgent,
  };

  if (node) module.exports = api;
  else root.MahjongStrategies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
