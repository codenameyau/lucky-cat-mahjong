# Architecture

Neural Cat is a strategy like any other: an object made with `MahjongBot.createStrategy`, with the same `analyzeDiscards`, `chooseTurnAction`, `chooseClaim` and `createBotAgent` as Jorge Yau or Lucky Cat. The learned part sits on top of the shared foundation and changes only the final choice.

## The layers

```
 game engine (js/mahjong-engine.js)
        │  asks a seat: your turn (discard, kong, win)? or a claim (pung, chow, kong, win)?
        ▼
 Neural Cat (js/mahjong-ml.js)
        │  1. Jorge Yau's hooks on the shared foundation (js/mahjong-bot.js) list and read every choice:
        │     steps from ready, live tiles, the plans and their faan, deal-in risk
        │  2. each candidate position is turned into 568 numbers (js/mahjong-ml-features.js)
        │  3. the network scores each one in expected points (js/mahjong-ml-model.js + js/mahjong-ml-weights.js)
        │  4. the choice worth the most is played, within guardrails
        ▼
 coach (js/mahjong-coach.js): says what the model expects, in full sentences, at most 400 characters
```

The model never replaces the hand reading. Jorge Yau's foundation still finds the plans, the waits and the risky tiles, and the features feed those reads to the model. The model learns how much they're worth together, from how real hands ended.

## A discard, step by step

1. The engine calls `bot.chooseTurnAction(game, seat, opts)`. Neural Cat's version is `kongChoice`, which first asks Jorge Yau's foundation what it would do.
2. `analyzeDiscards` (shared foundation) lists every discard and reads the hand each one leaves. Jorge Yau's hooks order them.
3. The last hook, `rerank`, is Neural Cat's. It calls `F.prepare` once for the turn, then `F.encode` for each candidate, and `model.ev` for each feature vector. Each candidate gets `ml`: `ev` (expected points), `pWin`, `pDealIn`, `avgWin`, `winFaan` and the outcome odds.
4. Among Jorge Yau's best three (`TOP_K`), the one with the highest `ev` goes first. The rest keep Jorge Yau's order.
5. The chosen candidate also gets `ml.why`, how much each feature group puts it ahead of the next best ([decisions](decisions.md#explanations)).
6. If kongs are possible, each kong is scored too, as the position after the kong, before its replacement tile, and compared with the best discard.

## A claim, step by step

1. The engine calls `bot.chooseClaim(game, seat, opts)`, which calls Neural Cat's `decideClaim`.
2. The base `decideClaim` (Jorge Yau's hooks) builds the options with `claimCandidates`. Each pung or chow option reads the hand after the call and its best discard through `analyzeDiscards`, so it already carries the model's `ml` read of that discard.
3. Neural Cat adds a read of passing (the hand as it is, waiting for the next tile) and of an exposed kong (the hand after the kong, before its replacement tile). Both are read with `waitingFeatures` and `F.encodeWaiting`.
4. The choice worth the most is played, unless it beats Jorge Yau's call by less than `CLAIM_MARGIN` points (0 now). `found.ml` lists every choice with its read.

## Hooks into the foundation

The foundation (`js/mahjong-bot.js`) has a few hooks the learned layer relies on:

| Hook or change | Where | Why |
| --- | --- | --- |
| `rerank(candidates, ctx, counts, game, seat, threats, folding)` | the end of `analyzeDiscards` | The last word on the discard order, after every shared rule |
| `out.hooks` on every strategy | `createStrategy` | So Neural Cat can build on Jorge Yau's hooks and tuning |
| `ml` on claim options | `claimCandidates` | A pung or chow option carries the model's read of its best discard |
| `shownMelds(s)` | every read of an opponent | Opponents' concealed kongs count as melds, never as tiles ([fair play](fair-play.md)) |

Neural Cat overrides three of its own methods after `createStrategy`: `decideClaim`, `chooseClaim` and `chooseTurnAction` (through `kongChoice`). `createBotAgent` calls the overridden methods, so the engine, the competition and the coach all play the same choices.

## Building another learned strategy

`ML.create(options)` builds a copy with other settings, and `options.base` picks the strategy it builds on:

```js
const ML = require('./js/mahjong-ml.js');
const LuckyCat = require('./js/mahjong-lucky-cat.js');
const bot = ML.create({ id: 'my-cat', base: LuckyCat, weights: myWeights, topK: 3 });
```

The features are read through the new bot's own foundation, so a model must be trained on data read through the same base strategy. `scripts/ml/generate.js` reads every position through neural-cat's foundation for that reason.

## Performance

A table of four models plays about 4.5 hands a second per CPU core. Three things make it fast:

- **Fast mode** (`create({ fast: true })`). In simulations, only the discards the model picks from are read, and explanations are skipped. It makes the same choices, and the tests check that.
- **A sparse first layer**. Most of the 568 features are zero, so the first layer is stored by input and skips zeros.
- **A whole-hand shanten cache** in the engine. The same hands are measured many times per turn (every plan, every discard); `standardShanten` keeps their answers, keyed by two base-5 numbers.

In the browser, one coach hint with the model's read takes about 11 ms.
