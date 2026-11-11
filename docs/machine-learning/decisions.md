# Decisions

`js/mahjong-ml.js` is the Neural Cat strategy. It turns the [model](model.md)'s expected points into choices, within guardrails that keep it from straying far from a sound rule-based player.

## Contents

- [Discards](#discards)
- [Looking ahead (depth): tried, not shipped](#looking-ahead-depth-tried-not-shipped)
- [Claims](#claims)
- [Kongs on your own turn](#kongs-on-your-own-turn)
- [Explanations](#explanations)
- [What the coach says](#what-the-coach-says)
- [Options](#options)
  - [Exploring](#exploring)

## Discards

Jorge Yau's foundation lists every discard in its order. Neural Cat reads the position each of the **best three** leaves (`TOP_K` = 3, unless the model's own `meta.play.topK` says otherwise) and plays the one worth the most. The rest keep Jorge Yau's order. With `topK: 1` it plays exactly like Jorge Yau, which a test checks.

Why only three: the first model chose among every discard, and it dealt in 12% of the time (3.5% wins). Trained only on the bots' own choices, it couldn't yet tell close discards apart or see safety well. Choosing among Jorge Yau's best three keeps the hand reading's judgment and lets the model decide between close calls.

Every candidate it reads gets `ml`, with `ev`, `pWin`, `avgWin`, `winFaan` and the outcome odds. `ml.choice` says whether the model picked from it, and `ml.order` where Jorge Yau put it. The chosen one also gets `ml.best` (the most any of the three is worth) and `ml.why`.

## Looking ahead (depth): tried, not shipped

Every learned strategy reads one discard deep: the network scores the position each discard leaves. A three-discards-deep search was built and measured (version 0.45.0's cycle) and **not shipped**: the game, the models and the training tools still play depth 1. The code is kept on the local branch `worktree-agent-af26925f622b57282` (commit `e0c61b3`) if it's picked up again.

**What was built.**

- **Neural Cat and Only Orphans: an expectimax over the seat's own next draws.** The best 3 discards by the network's read are searched. Each draw is a chance node, weighted by the copies of each tile the seat **hasn't seen** (four of each, less its own hand and melds, every discard and every shown meld), so the wall and other hands are never read; the fair-play test was extended to the searched values.
  - A drawn tile that wins ends the path with what the win pays.
  - The 3 likeliest useful tiles (from the hand's plan) are played out, then the best 2 of up to 4 discards that keep the hand as close to ready, one level deeper.
  - Any other tile counts as the same hand one go-around later.
  - The network scores the end of each path. A path past a discard takes off that tile's deal-in cost, since its end position no longer prices that risk.
  - Claims and kongs stayed one discard deep.
- **Lucky Cat: the policy prunes, rollouts value.** Its network has no value head, so its 3 favourite discards were each played out over every kind of tile it could draw (weighted the same way), with its own favourite discard for 2 more discards and 4 more draws. A future was worth its chance to win soon (0.9 less for each draw waited), with the network's share breaking near-ties.
- **Speed** (Node, on a machine busy with training): Neural Cat about 28 ms a move on average (60 ms at the 90th percentile, 184 ms at most, capped at 300 network reads) against about 3 ms at depth 1; Lucky Cat about 34 ms; Only Orphans about 26 ms. Not timed on a phone.

**Results.** Each model played depth 3 in one seat against depth-1 copies of itself, every seat rotation, then the depth-1 copy in the same seat on the same 3,000 deals, so hands both play the same way cancel (Only Orphans played at its game table: Neural Cat, Jorge Yau and Lucky Cat). ± is a 95% margin.

| Model | Points a hand, depth 3 − depth 1 | Hands won | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: |
| Neural Cat (NC2) | +9.8 ± 29.0 | 9.66% vs 8.50% (+1.16 ± 0.50 points) | 5.67% vs 5.84% | 1,880 vs 1,825 |
| Lucky Cat (LC20) | −5.5 ± 6.2 | 21.07% vs 19.28% (+1.79 ± 0.63 points) | 13.02% vs 13.62% | 106 vs 158 |
| Only Orphans (O5) | +5.0 ± 32.2 | 2.47% vs 2.17% (+0.30 ± 0.31 points) | 10.13% vs 9.44% | 5,430 vs 5,476 |

**Why it didn't ship.**

- **The gain is in wins, not points.** Neural Cat and Lucky Cat both won clearly more hands, but neither scored measurably more points a hand, and Lucky Cat's wins got smaller (106 points against 158): the wrong way for a points-first goal. The search plays out only the seat's own next two draws, so it is best at finishing a hand that is already close, and blind to the other players' turns.
- **Only Orphans** showed no clear gain at about 7 times the time a move.
- **Cost.** About 10 times the time a move, on phones too, and the lab's evaluations would slow by about as much.
- **Thin evidence.** 3,000 deals, not 20,000 (the machine was shared with the overnight lab), only against copies of the same model, with the search's settings set by reasoning, not tuned.

**If it's tried again:** measure on 20,000 deals against the current models (NC10, LC34), head to head; tune the search's width and its deal-in weight; and try searching claims too.

## Claims

When a tile is on offer, each choice is a position to compare:

| Choice | The position read |
| --- | --- |
| Pass | The hand as it is, waiting for the next tile |
| Pung, chow | The hand after the call and the best discard after it (Jorge Yau's best few, as on any turn) |
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
