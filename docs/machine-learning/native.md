# The native simulator

The training and the benchmark spend almost all their time playing hands: generating a round's data, screening arms, judging candidates. `native/` is a C++ port of the JS engine and the benchmark table's players that plays those hands **exactly** as the JS does, 8–10x faster. The game itself still runs on the JS: the port only makes simulation faster.

```bash
npm run native:build      # make -C native: native/build/lcm-sim
npm run native:parity -- --agents neural-cat,jorge-yau,neural-cat,neural-cat --deals 1000
```

Once it's built, nothing else changes: `bench.js` (compare, score, judge) and `lucky.js generate` use it whenever every player in a job can run natively, and fall back to the JS otherwise. `LCM_JS=1` forces the JS.

## What's ported

| JS | C++ |
| --- | --- |
| `js/mahjong-engine.js`: tiles, the RNG, the deal, options, claims, settlement, `runHand` | `native/src/core.*`, `engine.*` |
| `js/points.js` `scoreHand` | `native/src/scoring.*` |
| Shanten | `native/src/shanten.*`: a per-suit table filled on first use, and a whole-hand cache |
| The shared foundation (`js/mahjong-bot.js`) with Jorge Yau's hooks (`js/mahjong-jorge-yau.js`) | `native/src/bot.*`, `jy.inc`: the paths Jorge Yau's tuning takes |
| Neural Cat (`js/mahjong-ml*.js`), fast play | `native/src/neural_cat.*`, `model.*` |
| Lucky Cat, features v1 and v2 (`js/mahjong-lucky-cat-ml.js`, `-net.js`, `js/mahjong-frontier-net.js`) | `native/src/lucky_cat.*` |
| `scripts/ml/oracle.js`, `lucky.js generate`'s worker | `native/src/generate.*` |
| `bench.js` `playWork` | `lcm-sim play` |

Not ported: the classic Lucky Cat rules, Only Orphans, oracle-guided models (`--oracle-delta`), rollouts, exploration (temperature or epsilon) for Neural Cat. A job that needs one runs in JS.

## The same results

`scripts/ml/native.js parity` plays the same seeded hands in both and compares every action (each draw, flower, discard, claim, kong and win) and every result line. The first difference fails it, printing the hand and the line. Measured:

| Check | Result |
| --- | --- |
| The engine (deterministic test agents) | 2,000 hands, 342,274 actions identical |
| Jorge Yau in every seat | 1,000 hands, 158,558 actions identical |
| Neural Cat, Jorge Yau, Neural Cat, Neural Cat | 1,000 hands, 160,856 actions identical |
| Lucky Cat v1 and v2 at the benchmark table | 200 and 300 hands identical |
| `bench.js compare`, 280 deals | byte-identical JSON |
| `lucky.js generate`, Lucky Cat round settings (`--oracle --returns`), Sphinx's (`--sample-won`, its own models in the pool), and wins only | byte-identical shards |
| Shanten, 300,000 random hands | 0 mismatches |
| `Math.exp`, `Math.log`, `Math.pow`, 1,000,000 inputs each | 0 mismatches |

`npm test` runs a short parity check whenever `native/build/lcm-sim` exists (`scripts/ml/native.test.js`).

What it takes to match JS to the bit:

- **No fused multiply-adds.** JS never fuses `a * b + c`, so the build passes `-ffp-contract=off`.
- **V8's math.** `Math.exp` and `Math.log` are V8's fdlibm, which node's build compiles **with** fused multiply-adds: the C library's versions and plain fdlibm each differ on about 1 input in 2,000. They're ported with contraction on inside them (`native/src/jsmath.h`). `Math.pow` is the C library's, identical on every input tried.
- **V8's sort.** Under 8 elements, binary insertion from the second element. From 8, the first ascending or strictly descending run, then binary insertion (`native/src/jssort.h`, measured against node on 60,000 inconsistent comparators). The foundation's discard comparator is inconsistent (a < b, b < c and c < a can all hold), so any other algorithm changes moves.
- **Float32Array.** The networks' buffers and features round to float32 at every store, sums in double, in the JS's order.
- **Iteration order.** Integer-like object keys iterate in ascending order, string keys in insertion order. Products are taken in the same order.
- **State across turns.** Plan commitment (`seat.planMemo`), Jorge Yau's lock (`seat.bigHandLock`) and opening read are kept on the seat, as in the JS.

**Pinned.** `native/ported.json` holds the SHA-256 of every JS file the port matches. A player runs natively only while its files are those. For the benchmark's frozen players, the frozen files must be them too, so a change to the JS can never quietly change what a native judgment measures. After changing the JS, port the change, run parity on every player, then `node scripts/ml/native.js pin`.

## Weights

`scripts/ml/weights.js` converts between the two forms of a model:

```bash
node scripts/ml/weights.js export ml/models/LV3b.json LV3b.lcmw   # JSON (or js/*-weights.js, or git:<commit>:<path>) to .lcmw
node scripts/ml/weights.js import LV3b.lcmw LV3b.json              # back again
```

`.lcmw` is a JSON header (feature version and size, meta with the play settings) followed by each layer's weights and biases as float32, the same numbers the JS plays with (f16 weights are widened exactly as the JS widens them). Training writes JSON as before, the game loads JSON, and the simulator converts a model the first time it plays it (cached in `native/build/cache/`).

## Speed

On this Mac, 7 workers:

| Work | JS | Native |
| --- | --- | --- |
| A round's data (`lucky.js generate --oracle --returns`) | 61 deals a second | 587 deals a second (9.7x) |
| The benchmark table (`bench.js compare`) | about 10 deals a second | 82 deals a second (7.9x) |
| The engine alone, one core | 224 hands a second | 5,984 hands a second (26.7x) |
| Shanten | 32,000 hands a second | 6.9 million hands a second (217x) |

The floor now is the networks: a Neural Cat forward pass takes 12.9 µs and lc32's 26.3 µs, about 200 a hand, and they must run in float32 in the JS's order to give the same moves. JS's JIT already runs that arithmetic close to native speed, which is why the benchmark table gains 8x where the engine gains 27x. Faster still would mean giving up exactness (float32 SIMD, GPU batches), and the benchmark's promise is exactness.

The caches can't change a result: the per-suit shanten table and the whole-hand shanten cache are exact, the opponent reads are kept by the hand's version (a number that changes with every change to the hand), and a forward pass is kept by its exact input.
