# Features

`js/mahjong-ml-features.js` describes a position as 568 numbers, the input to the [model](model.md). The same code builds features for training data and for play, so the two can't drift apart.

A position is what a choice **leaves**: after a discard, the 13 tiles kept and the tile thrown. Each candidate discard is one feature vector, and the model compares them.

## Contents

- [The groups](#the-groups)
- [Read through the foundation](#read-through-the-foundation)
- [The API](#the-api)
  - [Waiting positions](#waiting-positions)
- [Only what the seat can see](#only-what-the-seat-can-see)
- [Changing the features](#changing-the-features)

## The groups

| Group | Size | What it holds |
| --- | ---: | --- |
| `hand` | 178 | The tiles kept as "at least 1, 2, 3, 4 copies" of each of 34 kinds (136); your melds' tiles (34); counts of chows, pungs and kongs, whether the hand is concealed, flowers and flower faan, melds declared, any chow (8) |
| `discard` | 40 | The tile thrown, one-hot (34); whether it's an honor, a dragon, your seat or round wind, a terminal or honor; copies you held before the throw; copies unseen (6) |
| `table` | 274 | Unseen copies of each kind (34). For each opponent from your right: their discards (34), their shown melds (34), and 12 reads: ready or not, threat level, a flush suit, the faan they're likely building, melds, discards, dealer |
| `context` | 16 | Tiles left in the wall, your turn, seat and round winds, dealer, the minimum faan, a near-empty wall, the foundation's hazard and value slope, melds declared |
| `speed` | 16 | Steps from ready on each shape (standard, Seven Pairs, Thirteen Orphans), the foundation's steps with plans, live tiles that help and how many kinds, the chance to finish, whether the hand is ready and how wide its wait is, draws left |
| `value` | 32 | The best plan's family (runs, sets, pairs, flush, honors…), its suit and faan, steps to it, the hand's value and backup value, what a ready hand scores, tiles per suit, pairs and pungs held, scoring honor pairs, the faan already sure |
| `safety` | 12 | The foundation's deal-in cost for the tile, whether it's a dead tile, and for each opponent: they threw it, it's been thrown since their last meld, and how likely it wins for them; the highest threat at the table |

`GROUPS` gives each group's start and end, and `LAYOUT` their order. [Explanations](decisions.md#explanations) swap one group at a time.

Most values are scaled to about 0 to 1 (copies over 4, turns over 24, faan over 13, logs for counts that can be large). The tests check every feature is finite and inside −0.2 to 1.5.

## Read through the foundation

Many features are reads the foundation already makes: steps from ready, live tiles, the best plan and its faan, deal-in risk, opponents' threats. `prepare` takes the strategy (`bot`) whose foundation reads the position. Neural Cat passes itself, so play and training data read hands the same way, through Jorge Yau's hooks and tuning. A model trained on one foundation's reads shouldn't be used with another's.

## The API

```js
const F = require('./js/mahjong-ml-features.js');

// Once per turn: the parts every candidate shares.
const state = F.prepare(game, seat, ctx, threats, bot, counts);
// One position: the discard of tile index i (0-33).
const x = F.encode(state, i, analysis, loss);       // Float32Array(568)
// A position waiting for a tile (a passed claim, a kong before its replacement).
const w = F.encodeWaiting(state, lastDiscardIndex);
```

- `ctx` and `threats` default to the bot's own `buildContext` and `opponentThreats`.
- `counts` is the tiles held, for a hand being weighed (a claim). By default it's the seat's real hand, and the melds come from `ctx.melds`, so a hypothetical meld counts.
- `analysis` (the foundation's `handUtility` of the 13 tiles kept) and `loss` (`dealInLoss` of the tile) are worked out when not given.

### Waiting positions

A claim or a kong has no discard of its own: passing leaves the hand as it is, and a kong waits for its replacement tile. `encodeWaiting` reads such a hand with the seat's last discard in the `discard` group, a tile no one can claim any more, and a deal-in cost of 0. Waiting positions are in the training data too (marked with bit 2 of `explored`), so the model learns what passing and kongs are worth. `ML.waitingFeatures(bot, game, seat, kind, tile)` builds them for `'pass'`, `'kong'` (exposed), `'concealed'` and `'added'`.

## Only what the seat can see

The features hold the seat's own hand, every discard, every shown meld and counts of tiles not yet seen. Never the wall, another hand, or which tile another player's concealed kong is: opponents' concealed melds are counted as melds and left out of the tile counts. [Fair play](fair-play.md) explains the test that checks this for every feature, decision and coach line.

## Changing the features

`FEATURE_VERSION` (now 2) and `SIZE` (568) are written into every data set's manifest and every weights file. The model refuses weights built for another version or size (`createModel` throws, and the game falls back to a random model rather than play badly). A change to the features needs new data and a new model: bump `FEATURE_VERSION`, regenerate, retrain from scratch.
