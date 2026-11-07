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
  // Lucky Cat's network (the classic rules until its weights ship).
  var LC = node ? require('./mahjong-lucky-cat-ml.js') : root.MahjongLuckyCatML;

  // A shipped network's name, such as L16 or lc20. It is read from the
  // weights themselves, not from a model, so asking never builds one before
  // the Play page has loaded the weights.
  function weightsName(file, global) {
    var w = null;
    try { w = node ? require(file) : root[global]; } catch (err) { w = null; }
    return w && w.meta && w.meta.name ? String(w.meta.name) : null;
  }
  function modelName() { return weightsName('./mahjong-ml-weights.js', 'MahjongMLWeights'); }
  function luckyModelName() { return weightsName('./mahjong-lucky-cat-weights.js', 'MahjongLuckyCatWeights'); }

  // The model before a learned strategy's summary ("Model NC1. ",
  // "Model LC20. "), once its weights are here.
  function withModel(name, text) { return (name ? 'Model ' + name.toUpperCase() + '. ' : '') + text; }

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
        'It claims like Lucky Cat Classic: dragons and scoring winds are punged, other pungs only when the hand is no worse, and chows rarely, for a ready hand, a flush, a fast hand or late in the wall.',
        'It plays no defense: it never folds and doesn\'t mind what it feeds. The one exception is late in the wall, when it is still two or more tiles from ready and holds no lock. Then it stops building, plays safe and stops feeding chow tiles and fresh honors, using its reads of what each opponent is collecting.',
      ],
      doc: 'docs/strategies/jorge-yau.md',
    },
    {
      id: 'lucky-cat',
      name: 'Lucky Cat',
      bot: LC && LC.trained ? LC : L,
      get summary() {
        return withModel(luckyModelName(), 'A neural network that taught itself to win. It started out playing at random, and over a million simulated hands against earlier versions of itself, and later Neural Cat, it learned from every hand it won. It plays to win as many hands as it can, as fast as it can.');
      },
      details: [
        'Every move is the network\'s own: each discard, chow, pung, kong and pass. It isn\'t built on the rules the other strategies share, so it knows nothing about steps from ready, plans or threats beyond what it learned.',
        'It sees only what its seat can see: its own tiles and melds, the discards, the melds others have shown, flowers, the winds and how many tiles are left. It never looks at the wall or another player\'s hand, and a test checks that shuffling those changes nothing it does.',
        'The first version played at random. After each round of simulated hands, the moves of every hand it won were made more likely: the quicker the win, the more so, with a little extra for more faan. Hands it lost or drew taught it nothing.',
        'Each new version plays tables of its earlier selves and replaces the best only when it wins more hands than the best at the same table. Neural Cat joined its opponents once it won regularly.',
        'It wins often but small. Against Neural Cat it wins about 18% of hands to Neural Cat\'s 9%, but Neural Cat\'s bigger hands still score more points.',
        'A win of 3 faan or more is always declared.',
        'The coach says how often the network plays the move it picks, and the next most likely one. The hand\'s plans and waits come from the classic Lucky Cat rules, kept as Lucky Cat Classic for simulations and reviews.',
      ],
      doc: 'docs/strategies/lucky-cat.md',
    },
    {
      id: 'only-orphans',
      name: 'Only Orphans',
      bot: O,
      summary: 'Only plays hands of 1s, 9s and honors: Thirteen Orphans, Mixed Orphans, All Terminals and All Honors. A neural network trained on simulated games decides how.',
      get details() {
        var version = weightsName('./mahjong-only-orphans-weights.js', 'MahjongOnlyOrphansWeights');
        return [
          'It throws every tile that isn\'t a 1, a 9 or an honor first, even when it plays safe. It never chows, and it only pungs or kongs a 1, a 9 or an honor.',
          'The hands it can play are Thirteen Orphans, Mixed Orphans, All Terminals and All Honors, as triplets or as pairs.',
          'Everything else is up to ' + (version ? 'its neural network, model ' + version + ',' : 'a neural network') + ' trained on simulated hands against Neural Cat, Jorge Yau and Lucky Cat: which tile goes, when to give up on Thirteen Orphans and for which hand, which pungs and kongs to take, and when to play safe.',
          'It scores each choice by the points it is worth on average and plays the best one, the same way Neural Cat does. It sees only what its seat can see.',
        ];
      },
      doc: 'docs/strategies/only-orphans.md',
    },
  ];

  // Neural Cat, the learned strategy. A page that doesn't load its scripts
  // (js/mahjong-ml*.js) leaves it out.
  if (N) {
    // Listed second, after Jorge Yau.
    STRATEGIES.splice(1, 0, {
      id: 'neural-cat',
      name: 'Neural Cat',
      bot: N,
      get summary() {
        return withModel(modelName(), 'Plays Jorge Yau\'s hands, but a neural network trained on simulated games picks the discard worth the most points on average: wins that come often and wins that pay big both count.');
      },
      get details() {
        return [
        'It reads the hand the way Jorge Yau does: the target hand, the plans it can still make, steps from ready, live tiles, and how risky each tile is.',
        'Then its neural network, trained on simulated hands, most of them against other Neural Cat models, looks at Jorge Yau\'s three best discards and predicts how the hand ends after each: the chance to win by self-draw or off a discard, the chance to deal in, and how many faan each would be.',
        'Those make one number, the points the discard is worth on average, and the discard worth the most goes. A quick small win and a slower big one are weighed on the same scale.',
        'The coach says, as a score, what the model expects from its pick and the next best, its chance to win and how much, and which parts of the position put its pick ahead: speed, hand value, safety, what the table shows.',
        'Claims and kongs are weighed the same way: passing, each pung, chow or kong and the best discard after it, each given a score. When the model\'s pick is worth more than Jorge Yau\'s call, the model\'s goes, and the coach shows the score for each choice.',
        'It plays fair: it sees only what its seat can see, the same as you. Never the wall, another player\'s hand, or which tile a concealed kong is.',
        ];
      },
      doc: 'docs/strategies/neural-cat.md',
    });
  }

  // Lab strategies: playable by id (npm run compete, npm run review, a
  // saved pick) but not on the Strategies sheet or in the random seats.
  var LAB = [
    {
      id: 'lucky-cat-classic',
      name: 'Lucky Cat Classic',
      bot: L,
      lab: true,
      summary: 'Lucky Cat\'s rules without its network: tracks every discard by who threw it and plays the odds to the fastest 3-faan win, avoiding feeding the table more and more toward the end.',
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
  ];

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
