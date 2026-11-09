# The native simulator: port notes

`native/` is a C++ port of the JS engine and the benchmark table's players, for
training and judging at native speed. The rule is **the same results**: every
seeded hand plays out action for action as it does in JS. `scripts/ml/native.js
parity` checks it, hand by hand.

## Status

| Part | JS source | C++ | Parity |
| --- | --- | --- | --- |
| Tiles, RNG, wall | js/mahjong-engine.js §1 | src/core.* | yes (through the engine) |
| Shanten | engine §2 | src/shanten.* (per-suit table, filled on first use) | 300,000 random hands, 0 mismatches |
| Scoring | js/points.js §5-10 (scoreHand) | src/scoring.* | yes (through the engine) |
| Engine: deal, options, claims, settlement | engine §3-7 | src/engine.* | 2,000 hands, 342,274 actions identical (simple agents) |
| Math.exp, Math.log, Math.pow | V8 | src/jsmath.h | 1,000,000 inputs each, 0 mismatches |
| Array.prototype.sort | V8 TimSort | src/jssort.h | (through the bots) |
| Foundation (shared bot) | js/mahjong-bot.js | src/bot.* | in progress |
| Jorge Yau | js/mahjong-jorge-yau.js | src/bot.* (hooks) | in progress |
| Neural Cat | js/mahjong-ml*.js | src/neural_cat.* | to do |
| Lucky Cat (v1, v2 features), oracle | js/mahjong-lucky-cat*.js, js/mahjong-frontier-net.js, scripts/ml/oracle.js | to do | to do |
| Data generation, bench play | scripts/ml/lucky.js, bench.js | to do | to do |

## What it takes to match JS to the bit

- **Floats.** JS arithmetic never fuses a multiply and an add, so the build uses
  `-ffp-contract=off`. V8's own `Math.exp` and `Math.log` (fdlibm, built by clang
  with contraction on) are ported with `#pragma clang fp contract(on)` inside them.
  `Math.pow` is the C library's (identical on a million inputs).
- **Float32Array.** Neural Cat's and Lucky Cat's buffers are float32: each store
  rounds, each read widens. The port keeps the same stores.
- **Sorting.** V8's TimSort (binary insertion under 64 elements), comparator for
  comparator: the foundation's comparators are not always consistent.
- **Object key order.** Integer-like keys iterate in ascending order (readSeat's
  `seen` and `passed`), string keys in insertion order. Products are taken in
  the same order.
- **State that lives across turns:** `seat.planMemo[strategy id]` (plan
  commitment), `seat.bigHandLock` (Jorge Yau's lock), Jorge Yau's opening read
  per (hand, seat). The port keeps each on the seat.
- **The RNG.** mulberry32 exactly; createGame shuffles the 12 bot names first.

## Measured

- Simple agents, engine only: JS 224 hands/s, native 5,984 hands/s (26.7x), one core.
- Shanten: JS 31,952 hands/s, native 6.9 million/s (217x).
