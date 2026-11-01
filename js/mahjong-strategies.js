/* Bot strategies for the Play game: the list the Strategies sheet shows,
   which strategy each bot seat and the coach use, and how to make an agent
   for one. A strategy is a bot API from MahjongBot.createStrategy (or
   MahjongBot itself, which is claude-cat).

   To add one: build it with MahjongBot.createStrategy({ id, hooks, tuning }),
   load its script before this one, and add an entry to STRATEGIES. The
   competition (npm run compete) can then play it against the others. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var L = node ? require('./mahjong-lucky-cat.js') : root.MahjongLuckyCat;

  var STRATEGIES = [
    {
      id: 'lucky-cat',
      name: 'Lucky Cat',
      bot: L,
      summary: 'Reads the opening hand, picks one hand to build and sticks to it. Stays concealed, and stops feeding the table when it can\'t win.',
      details: [
        'It looks at the opening hand and picks a target, in this order: Thirteen Orphans (8+ different terminals and honors), Nine Gates (7+ tiles of one suit\'s 1112345678999), Four Winds (8+ winds), All Terminals (8+ ones and nines), All Honors (8+ honors), Seven Pairs (4+ pairs), Full Flush (8+ of one suit), Concealed Triplets (1 to 3 sets already in hand), Half Flush (one main suit with honors), and Concealed All Sequences (a mixed hand). Tiles the target can\'t use go first.',
        'Each turn it reads the hand again. A stronger target replaces the old one, and when a target can\'t be made it pivots: Seven Pairs to Concealed Triplets to All Triplets, Concealed Triplets to All Triplets or Seven Pairs (in one suit and honors where it can), Full Flush to Half Flush, Four Winds to All Honors, Thirteen Orphans to Seven Pairs of terminals and honors.',
        'With a seat or round wind, or a seat flower, the hand already has faan, so it plays for speed. It also counts wins off the last tile and off a kong toward the 3-faan minimum.',
        'It keeps the hand concealed. Early chows only build a flush in that suit, and never into a suit it holds few tiles of. Pungs are fine early.',
        'It reads every opponent\'s discards for the hand they\'re on: the suit they keep, the honors they hold, or a hand of runs. Late in the wall, if it is still two or more tiles from ready, it stops building and stops feeding: no chow tiles to the next player, no fresh dragons or winds.',
      ],
      doc: 'docs/strategies/lucky-cat.md',
    },
    {
      id: 'claude-cat',
      name: 'Claude Cat',
      bot: B,
      summary: 'Weighs every discard by expected points: how fast each hand can finish, what it pays, and the risk of dealing in.',
      details: [
        'For every possible discard it scores the hand that would be left: how many tiles from ready, how many tiles still improve it, and what the finished hand pays. A ready hand is scored exactly, wait by wait.',
        'It switches to Seven Pairs with five pairs, Thirteen Orphans with nine different terminals and honors, and Nine Gates with eleven tiles of the pattern. Otherwise it plays a standard hand, a flush, All Triplets or Concealed All Sequences, whichever is worth the most.',
        'It keeps pairs and unseen dragons, throws other suits first once it commits to one, and chows only for a ready hand, a flush, or late in the hand. Dragons and scoring winds are always punged.',
        'Each opponent gets a threat level from their melds and discards. When someone looks close and the hand is slow, or the wall is nearly gone, safety decides the discard.',
      ],
      doc: 'docs/strategies/claude-cat.md',
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
