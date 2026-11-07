# Decisions

`js/mahjong-ml.js` is the Neural Cat strategy. It turns the [model](model.md)'s expected points into choices, within guardrails that keep it from straying far from a sound rule-based player.

## Discards

Jorge Yau's foundation lists every discard in its order. Neural Cat reads the position each of the **best three** leaves (`TOP_K` = 3, unless the model's own `meta.play.topK` says otherwise) and plays the one worth the most. The rest keep Jorge Yau's order. With `topK: 1` it plays exactly like Jorge Yau, which a test checks.

Why only three: the first model chose among every discard, and it dealt in 12% of the time (3.5% wins). Trained only on the bots' own choices, it couldn't yet tell close discards apart or see safety well. Choosing among Jorge Yau's best three keeps the hand reading's judgment and lets the model decide between close calls.

Every candidate it reads gets `ml`, with `ev`, `pWin`, `avgWin`, `winFaan` and the outcome odds. `ml.choice` says whether the model picked from it, and `ml.order` where Jorge Yau put it. The chosen one also gets `ml.best` (the most any of the three is worth) and `ml.why`.

## Claims

When a tile is on offer, each choice is a position to compare:

| Choice | The position read |
| --- | --- |
| Pass | The hand as it is, waiting for the next tile |
| Pung, chow | The hand after the call and the best discard after it (Jorge Yau's best three, as on any turn) |
| Kong | The hand with the kong, before its replacement tile |

A win is always taken. Jorge Yau's call is the default, and the model's pick replaces it when it's worth more than `CLAIM_MARGIN` points (0 now) more. `decideClaim(game, seat, opts).found.ml` has `choices` (each with its `decision` and `ml`), `pick` (the model's) and `foundation` (Jorge Yau's).

## Kongs on your own turn

Each kong you can declare, concealed or added to a pung, is weighed against the best discard. The kong is read as the hand with the kong, before its replacement tile. `kongChoice(game, seat, opts)` returns the decision, `choices`, `pick` and `foundation`, the same way as claims. `chooseTurnAction` plays its decision.

## Explanations

`ml.why` lists how much each feature group puts the pick ahead of the next best discard. For each group, it swaps that group's features from the next best discard into the pick and reads the pick again. The drop in expected points is that group's share:

```js
[{ group: 'safety', points: 14.2 }, { group: 'hand', points: 9.8 }, { group: 'speed', points: -1.1 }, ...]
```

The coach names the top two groups that are worth a point or more, in words: speed, hand value, safety, the tiles you keep, the tile itself, what the table shows, the wall and your seat.

## What the coach says

The coach (`js/mahjong-coach.js`) speaks for whichever strategy is the coach. For Neural Cat it adds the model's line to the usual hint:

- **A discard**: "The model expects +51 score on average from this discard, with a 27% chance to win (about 444 points). Next best discard is South Wind: +17 score. This one comes out ahead on the tiles you keep and on hand value."
- **A claim**: "On average, the model expects −22 score if you pass and −32 score if you chow 5-6-7. That gives an 11% chance to win. The usual call here would be to chow 5-6-7, but the model expects less from it."
- **A kong**: "On average, the model expects −14 score if you skip the kong and −19 score if you kong Two Circle."
- **Feedback on your discard**: "The model expects −114 score on average from Four Character, and −137 score from Two Circle. With Four Character, your chance to win is 17% instead of 8%."

Every hint is held to the coach's house style, and `js/mahjong-coach-text.test.js` checks it on real hands for every strategy:

- At most 400 characters, the action and the explanation together, so it fits on a phone. When there's more to say, the least useful lines go first; the model's line is kept until only the reason is left.
- Full, natural sentences. Every number says what it counts ("−35 points", never "−35").
- "Meld", never "set"; "eyes" for the pair a hand wins with.
- The chance of dealing in isn't said.

## Options

```js
const ML = require('./js/mahjong-ml.js');
const bot = ML.create({
  id: 'neural-cat',     // the strategy id
  base: J,              // the strategy it builds on (default Jorge Yau; null = the shared foundation alone)
  weights,              // a weights object, or `model`: a model from createModel
  topK: 3,              // pick among the foundation's best K discards (0 = all)
  claims: true,         // false leaves claims and kongs to the base strategy
  claimMargin: 0,       // points the model's claim or kong must beat the base's by
  winBonus: 0,          // points added per 100% of win chance when choosing (leans toward winning more often)
  temperature: 0,       // exploring: pick by exp(ev / temperature), in points
  epsilon: 0,           // exploring: chance of a random choice
  rng: Math.random,
  fast: false,          // simulations: read only the discards it picks from, skip `why`
});
```

`topK`, `claimMargin` and `winBonus` are play settings. Unless passed here, they come from the weights' own `meta.play` (the [lab](training.md#4-the-lab-npm-run-mllab) tunes and ships them with each model), then from the defaults. The coach always shows expected points, whatever the win bonus.

`ML` itself is the shipped Neural Cat (the default model from `js/mahjong-ml-weights.js`). `ML.create`, `ML.explain`, `ML.waitingFeatures` and `ML.CLAIM_MARGIN` are on it too. If the shipped weights don't fit the features, it falls back to a random model and isn't offered at the table.

### Exploring

Training data needs choices the model wouldn't make, or it can't learn what they're worth. With `temperature`, it picks among the discards it chooses from (and among claim or kong choices) with odds `exp(ev / temperature)`, so close choices are tried often and bad ones rarely. With `epsilon`, it sometimes throws a random discard that costs no step toward ready, or makes a random claim choice. The game's Neural Cat never explores. Only the data generator turns it on ([training](training.md)).
