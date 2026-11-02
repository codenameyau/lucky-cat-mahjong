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

  var STRATEGIES = [
    {
      id: 'jorge-yau',
      name: 'Jorge Yau',
      bot: J,
      summary: 'Reads the opening hand, picks one hand to build and pivots strategically. Stays concealed, and stops feeding the table when it can\'t win.',
      details: [
        'It looks at the opening hand and picks a target, in this order: Thirteen Orphans, Nine Gates, Four Winds, All Terminals, All Honors, Seven Pairs, Full Flush, Concealed Triplets, Half Flush and Concealed Straights. Tiles the target can\'t use go first.',
        'Each turn it reads the hand again. A stronger target replaces the old one, and when a target can\'t be made it pivots: Seven Pairs to Concealed Triplets to All Triplets, Concealed Triplets to All Triplets or Seven Pairs, Full Flush to Half Flush, Four Winds to All Honors, and Thirteen Orphans to Seven Pairs with Mixed Orphans.',
        'With a seat or round wind, or a seat flower, the hand already has faan, so it plays for speed. It also counts wins off the last tile and off a kong toward the 3-faan minimum.',
        'It keeps the hand concealed. Early chows only build a flush in that suit, and never into a suit it holds few tiles of. Pungs are fine early.',
        'It reads every opponent\'s discards for the hand they\'re on: the suit they keep, the honors they hold, or a hand of runs. Late in the wall, if it is still two or more tiles from ready, it stops building and stops feeding: no chow tiles to the next player, no fresh dragons or winds.',
      ],
      doc: 'docs/strategies/jorge-yau.md',
    },
    {
      id: 'lucky-cat',
      name: 'Lucky Cat',
      bot: L,
      summary: 'Weighs every discard by expected points: how fast each hand can finish, what it pays, and the risk of dealing in.',
      details: [
        'For every possible discard it scores the hand that would be left: how many tiles from ready, how many tiles still improve it, and what the finished hand pays. A ready hand is scored exactly, wait by wait.',
        'It switches to Seven Pairs, Thirteen Orphans or Nine Gates when the hand is close to one. Otherwise it plays a standard hand, Half Flush, Full Flush, All Triplets or Concealed Straights, whichever is worth the most, and keeps the tiles for Mixed Orphans, All Terminals, All Honors, Small Three Dragons, Big Three Dragons, Small Four Winds or Big Four Winds while one is in reach.',
        'It keeps pairs and unseen dragons, throws other suits first once it commits to one, and chows only for a ready hand, a flush, or late in the hand. Dragons and scoring winds are always punged.',
        'Each opponent gets a threat level from their melds and discards. When someone looks close and the hand is slow, or the wall is nearly gone, safety decides the discard.',
      ],
      doc: 'docs/strategies/lucky-cat.md',
    },
  ];

  var DEFAULT_COACH = 'lucky-cat';
  var BY_ID = {};
  STRATEGIES.forEach(function (s) { BY_ID[s.id] = s; });

  function list() { return STRATEGIES.slice(); }
  function ids() { return STRATEGIES.map(function (s) { return s.id; }); }
  function has(id) { return !!BY_ID[id]; }

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
    get: get,
    randomId: randomId,
    createAgent: createAgent,
  };

  if (node) module.exports = api;
  else root.MahjongStrategies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
