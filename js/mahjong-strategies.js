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

  // A learned strategy's model name for its heading ("NC8"), once its weights are here.
  function upper(name) { return name ? name.toUpperCase() : null; }
  function orphansModelName() { return weightsName('./mahjong-only-orphans-weights.js', 'MahjongOnlyOrphansWeights'); }
  // A learned strategy's summary opens with its name and model ("Neural Cat NC9").
  function named(name, model) { return model ? name + ' ' + model : name; }

  var STRATEGIES = [
    {
      id: 'jorge-yau',
      name: 'Jorge Yau',
      bot: J,
      summary: 'Play mahjong the way the founder of Lucky Cat plays. It reads the opening hand, picks one hand to build, from Thirteen Orphans down to Concealed Straights, and keeps the tiles that hand needs. It loves honors: it holds them longest, and always pungs dragons and scoring winds. It goes for value, locking onto a hand worth 7 faan or more when one is close, and plays for speed when the hand already has faan. It plays no defense until late in the wall.',
      details: [
        'It looks at the opening hand and picks a target, in this order: Thirteen Orphans, Nine Gates, Big Four Winds, Big Three Dragons, All Terminals, All Honors, Seven Pairs, Full Flush, Concealed Triplets, Half Flush, All Triplets and Concealed Straights. Tiles the target can\'t use go first.',
        'Each turn it reads the hand again. A stronger target replaces the old one, and when a target can\'t be made it changes to the closest one: Concealed Triplets to Seven Pairs to All Triplets; Full Flush to Half Flush; Big Four Winds to Small Four Winds; Big Three Dragons to Small Three Dragons; All Honors to Half Flush or All Triplets; and Thirteen Orphans to Seven Pairs, or to All Triplets with Mixed Orphans.',
        'With a seat or round wind, or a seat flower, the hand already has faan, so it plays for speed. It also counts wins off the last tile and off a kong toward the 3-faan minimum.',
        'If it has 8 tiles of a hand worth 7 faan or more within its first 8 turns (Full Flush, Thirteen Orphans, Nine Gates, All Honors, All Terminals, Big Four Winds, Big Three Dragons or Mixed Orphans), it locks onto that hand and keeps those tiles until the hand can\'t be won.',
        'It keeps honors as long as it can. Number tiles that cost no step go first, then lone honors, and honor pairs stay longest. A lone honor whose other three copies are on the table goes first of all.',
        'It stays concealed early on, unless a claim gets it within two or three tiles of ready and it can win quickly; then it prefers pungs to chows. It rarely chows early until it knows whether the player before it is feeding it or needs those tiles. It always pungs dragons and scoring winds, unless it is going for Thirteen Orphans.',
        'It plays no defense: it never folds and doesn\'t mind what it feeds. The one exception is late in the wall, when it is still two or more tiles from ready and holds no lock. Then it stops building and plays safe, holding back chow tiles and fresh honors, using its reads of what each opponent is collecting.',
        'The coach names the hand to go for and says why each move fits it, in the words it uses for every strategy. On Complex it also gives the odds its rules work out: the chance to finish the hand before the wall runs out, the tiles that help, and the next best discard\'s odds.',
      ],
      doc: 'docs/strategies/jorge-yau.md',
    },
    {
      id: 'lucky-cat',
      name: 'Lucky Cat',
      bot: LC && LC.trained ? LC : L,
      get model() { return upper(luckyModelName()); },
      get summary() {
        return named('Lucky Cat', luckyModelName() && upper(luckyModelName())) + ' is a neural network that taught itself to play, with no rules built in. Each turn it looks at what its seat can see and plays the move that most often led to wins in its training, with no target hand and no plan. It goes for speed: fast, cheap wins of a few faan, and it takes risks to get them. It trained on simulated games, first learning from the hands it won, and later also from the discards that dealt in.';
      },
      details: [
        'It has no plan and no rules. Each turn it looks at what its seat can see (its own tiles and melds, every discard, the melds and flowers others have shown, the winds, and how many tiles are left), and its neural network gives every legal move a share. It plays the move with the biggest share.',
        'That goes for every move: which tile to discard, each chow, pung and kong, and whether to pass. It doesn\'t count tiles from ready, pick a target hand or keep a list of safe tiles. What looks like a plan is a habit the network learned.',
        'How it was trained: it started by playing at random. After each round of simulated hands, the moves of every hand it won were made more likely, the faster the win the more. Since LC21 it trains against its last few versions, Neural Cat and Jorge Yau, and a new version replaces it only when it wins clearly more hands over 20,000 fresh deals. Since LC31 it also learns from the hands it lost by dealing in, and makes those discards less likely. LC33 learned by playing only its own older versions: at a choice, each of its likeliest moves was replayed on the same reshuffled walls, and the moves that scored more points were made more likely.',
        'It values speed over size. It wins often and in few discards, mostly small hands of 4 to 5 faan, and it takes risks to get them, so it deals in more often than Neural Cat does.',
        'It never looks at the wall or another player\'s hand, and a test checks that shuffling those changes nothing it does. A win of 3 faan or more is always declared.',
        'The coach names the hand to go for and says why each move fits it, in the words it uses for every strategy. Its words about the hand, such as its plans and waits, come from the shared foundation\'s read, and every move is checked against that plan: one that goes against it gives way to the network\'s next most likely move. On Complex it also says how often Lucky Cat makes the move it picks, and the next most likely one.',
        'Its numbers: against LC32 at a table of older Lucky Cats, LC33 scores 7.8 more points a hand over 160,000 deals and wins more often (22.8% of hands to 22.0%), with bigger wins and slightly fewer deal-ins. At the game\'s table, with Neural Cat and Jorge Yau, it scores about 5 more points a hand and wins 19.8% of hands to 19.2%. LC32 against LC20 over 10,000 deals won 28.7% of hands to 15.3%, just as fast, and dealt in less (14.3% of hands to 18.4%). Against Neural Cat it wins about twice as many hands but scores fewer points, because Neural Cat\'s wins are worth about 8 faan to its 4 to 5.',
      ],
      doc: 'docs/strategies/lucky-cat.md',
    },
    {
      id: 'only-orphans',
      name: 'Only Orphans',
      bot: O,
      get model() { return upper(orphansModelName()); },
      get summary() {
        return named('Only Orphans', orphansModelName()) + ' builds big hands on 1s, 9s and honors: Thirteen Orphans, triplets or pairs of those tiles, Concealed Triplets and Seven Pairs. Each turn it goes for whichever of those the deal is worth most, and keeps its 1s, 9s and honors longest. It bets on a few big wins over many small ones, and among choices worth about the same it takes the one more likely to finish. A neural network trained on its own simulated games picks which tile goes and which pungs and kongs to take.';
      },
      details: [
        'Each deal it picks a target and checks it again every turn: Thirteen Orphans; triplets of 1s, 9s and honors (Mixed Orphans, All Terminals, All Honors); the same hands as pairs; Seven Pairs; or Concealed Triplets of any tiles. It picks the one worth the most points on average, which is what the hand pays times its chance of finishing, from the tiles still live and the draws left. It changes target only when another is worth clearly more.',
        '1s, 9s and honors are the heart of every target: they stay longest, and their pairs become the eyes or pungs. Tiles the target can\'t use go first, even late in the hand when it plays safe. On Seven Pairs and Concealed Triplets that means single tiles go first, and pairs and pungs of any tile stay.',
        'It never chows. It pungs or kongs only a 1, a 9 or an honor, and only when the target is triplets of them. On Thirteen Orphans, the pairs hands and Concealed Triplets it claims nothing but the winning tile.',
        'Within those rules its neural network makes the choices: which allowed tile goes, and which allowed pungs and kongs to take. It scores each by the points it expects on average, counting the chance to win, how big the win would be and the chance of dealing in, and plays the best. Dealing in is part of that score, so there is no separate rule for playing safe.',
        'It rarely pungs a discard: it claims one only when that is clearly worth more than passing. So it keeps more pairs and triplets concealed and declares more kongs.',
        'It leans toward finishing: each choice\'s score gets a bonus for its chance to win (800 points for a sure win), so among choices worth about the same it takes the one more likely to win.',
        'How it was trained: on its own simulated games with these targets, against Neural Cat, Jorge Yau and Lucky Cat. It sees only what its seat can see.',
        'The coach names the hand to go for and says why each move fits it, in the words it uses for every strategy. On Complex it also gives the network\'s numbers: the score it expects from its pick and from the next best, its chance to win and how much a win pays.',
        'Its numbers: over 60,000 deals against Neural Cat, Jorge Yau and Lucky Cat, OS2c1 won 6.5% of hands, each win worth about 2,380 points on average, and dealt in on 14.2% of hands. Against OT11d before it, it won about 12 more hands in 1,000, each win smaller, and scored more points overall.',
      ],
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
      get model() { return upper(modelName()); },
      get summary() {
        return named('Neural Cat', upper(modelName())) + ' reads the hand the way Jorge Yau does, then lets a neural network choose among his best options by what each is worth on average: the chance to win, how big the win would be, and the risk of dealing in. It will take a slower, bigger hand over a fast small one when the numbers favor it, and it plays safer because dealing in is part of every score. Its network learned from simulated hands, most of them played by earlier Neural Cat models.';
      },
      get details() {
        return [
        'First it reads the hand the way Jorge Yau does: the hand to build, the other hands still in reach, how many tiles from ready it is, which tiles are still live, and how risky each discard is. That narrows each choice to his best few options.',
        'Then its neural network scores each option. It predicts how the hand will end after it: a win by self-draw or off a discard, dealing in, someone else winning, or a draw, and how many faan a win would be. Those make one score, the points the option is worth on average, plus a bonus for the chance to win. The best score is played.',
        'A quick small win and a slower big one are scored on the same scale, so it can wait for a bigger hand when the numbers favor it. And because dealing in is part of every score, it plays safe without a separate rule for it.',
        'Claims and kongs work the same way: passing, each pung, chow or kong, and the best discard after it are all scored. When the network\'s pick scores higher than Jorge Yau\'s call, the network\'s pick goes.',
        'How it was trained: on simulated hands, most of them played by earlier Neural Cat models, so each model learns from the games of the one before. A new model replaces the old one only when it beats it over thousands of fresh deals.',
        'The coach names the hand to go for and says why each move fits it, in the words it uses for every strategy. On Complex it also gives the network\'s numbers: the score it expects from its pick and from the next best, its chance to win and how much a win pays, and which parts of the position put its pick ahead: speed, hand value, safety, what the table shows. On Simple and Detailed the coach speaks for itself ("It keeps a bigger hand in reach"); only Complex says "the model".',
        'It plays fair: it sees only what its seat can see, the same as you. Never the wall, another player\'s hand, or which tile a concealed kong is.',
        'Its numbers: NC10 wins about 17% of hands at the game\'s table, each win worth about 900 points on average, and deals in on about 11% of hands. It weighs Jorge Yau\'s best 6 discards. Against NC9, at a table of older Neural Cats, it scored 8.1 points a hand more over 200,000 fresh deals and won 17.2% of hands to 16.2%: its training softened how much the rare very big hands count, so it wins more often for wins about as big. NC9 scored 11.6 points a hand more than NC8 over 100,000 fresh deals. It wins fewer hands than Lucky Cat, but each is worth much more. NC1 to NC3 won about 9% of hands, each worth about 1,900 points; since NC4 a bonus for the chance to win (300 points for a sure win since NC6) has made it win more often with smaller wins.',
        ];
      },
      doc: 'docs/strategies/neural-cat.md',
    });
  }

  // Lab strategies: playable by id (npm run compete, a
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
        'The coach names the hand to go for and says why each move fits it, in the words it uses for every strategy. On Complex it also gives the odds its rules work out: the chance to finish the hand before the wall runs out, the tiles that help, and the next best discard\'s odds.',
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
