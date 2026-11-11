# The native simulator

The training and the benchmark spend almost all their time playing hands: generating a round's data, screening arms, judging candidates. `native/` is a C++ port of the JS engine and the benchmark table's players that plays those hands **exactly** as the JS does, 8–10x faster. The game itself still runs on the JS: the port only makes simulation faster.

```bash
npm run native:build      # make -C native: native/build/lcm-sim and lcm-sim-exact
npm run native:parity -- --agents neural-cat,jorge-yau,neural-cat,neural-cat --deals 1000
```

Once it's built, nothing else changes. `make -C native pgo` rebuilds the fast build profile-guided (a few percent more). `bench.js` (compare, score, judge) and `lucky.js generate` use it whenever every player in a job can run natively, and fall back to the JS otherwise. `LCM_JS=1` forces the JS.

**On Windows**, build with clang from [llvm-mingw](https://github.com/mstorsjo/llvm-mingw) (`winget install MartinStorsjo.LLVM-MinGW.UCRT`, then put its `bin` on the PATH for the build). The exact build needs clang (`#pragma clang fp contract`), and the LLVM installer alone has no C++ headers. The Makefile uses `-march=native` on x86-64 and links the C++ runtime in statically on Windows, so the builds (`lcm-sim.exe`, `lcm-sim-exact.exe`) run without llvm-mingw on the PATH. The simulator puts stdout in binary mode on Windows, so its traces and JSON are byte for byte the JS's. Checked on an x86-64 desktop: the native tests pass, and the reference compare (lc32v2 against lc32 on 1,000 deals from seed 990,000,000, `--exact`) gives −87.1 ± 15.1 points a hand for both, as on the Mac.

## Contents

- [What's ported](#whats-ported)
- [The same results](#the-same-results)
- [Weights](#weights)
- [Two builds](#two-builds)
- [Speed](#speed)

## What's ported

| JS | C++ |
| --- | --- |
| `js/mahjong-engine.js`: tiles, the RNG, the deal, options, claims, settlement, `runHand` | `native/src/core.*`, `engine.*` |
| `js/points.js` `scoreHand` | `native/src/scoring.*` |
| Shanten | `native/src/shanten.*`: a per-suit table filled on first use, and a whole-hand cache |
| The shared foundation (`js/mahjong-bot.js`) with Jorge Yau's hooks (`js/mahjong-jorge-yau.js`) | `native/src/bot.*`, `jy.inc`: the paths Jorge Yau's tuning takes |
| Neural Cat (`js/mahjong-ml*.js`), fast play | `native/src/neural_cat.*`, `model.*` |
| Only Orphans (`js/mahjong-only-orphans.js`), fast play: its target system and hooks on the foundation, and `MahjongML.create`'s options as it sets them (topK 0, `allow`, `claimOk`, `kongOk`, `winBonus` and `claimMargin` from `meta.play`); stacked weights too | `native/src/only_orphans.*` (`oo:<file>`, `only-orphans`) |
| Lucky Cat, features v1 and v2 (`js/mahjong-lucky-cat-ml.js`, `-net.js`, `js/mahjong-frontier-net.js`) | `native/src/lucky_cat.*` |
| `scripts/ml/oracle.js`, `lucky.js generate`'s worker | `native/src/generate.*` |
| `scripts/ml/generate.js`'s worker for Neural Cat, the frontier model and Only Orphans (`--learner only-orphans`): the learner exploring (temperature, epsilon), every seat recorded (or `--record <learner>`, its own), the extra heads' labels (`scripts/ml/heads.js`), replayed labels (`--replays`, native only) | `native/src/generate_nc.*` (`npm run ml:generate -- --native`) |
| `bench.js` `playWork` | `lcm-sim play` |

The foundation takes a strategy's hooks as virtual `hook*` methods (`native/src/bot.h`), Jorge Yau's by default, so Jorge Yau and Neural Cat play exactly as before. Only Orphans overrides them, and returns the shared foundation's no-hook value for the hooks it doesn't define (readyValue, threats, waitChance, extraLoss, defense, finalOrder). The foundation paths its tuning takes that Jorge Yau's doesn't are ported with it: `ctx.mixedHand` (no one-suit commitment), a plan's `committed` (kept however few draws are left), and a hard target (`isHardTarget`: its plan picked first, and claims of its tiles consistent).

The contradiction check is ported with the foundation, Neural Cat and Lucky Cat (which runs the foundation's analysis for its seat to check each move against). `lcm-sim` takes `id~nocheck` to play a player without it, to measure it: with every player's check off, the build plays exactly as before the check.

Not ported: the classic Lucky Cat rules, the rule-based Only Orphans (`only-orphans-rules`, the lab's baseline), oracle-guided models (`--oracle-delta`), rollouts. A job that needs one runs in JS.

## The same results

`scripts/ml/native.js parity` plays the same seeded hands in both and compares every action (each draw, flower, discard, claim, kong and win) and every result line. The first difference fails it, printing the hand and the line. Measured:

| Check | Result |
| --- | --- |
| The engine (deterministic test agents) | 2,000 hands, 342,274 actions identical |
| Jorge Yau in every seat | 1,000 hands, 158,558 actions identical |
| Neural Cat, Jorge Yau, Neural Cat, Neural Cat | 1,000 hands, 160,856 actions identical |
| Lucky Cat v1 and v2 at the benchmark table | 200 and 300 hands identical |
| Only Orphans (OT11d) with Neural Cat, Jorge Yau and Lucky Cat; two, then three Only Orphans seats; a stacked model (`oo:<file>` with a reader) beside OT11d | 400, 400, 300 and 200 hands identical (64,724, 66,452, 51,531 and 32,655 actions); on two such tables (300 deals each) the fast build played every hand as the exact build |
| `generate.js --native --learner only-orphans`, Only Orphans exploring against the shipped Neural Cat, Jorge Yau and Lucky Cat, every seat (600 deals) and its own seats alone (400); a stacked learner against an earlier `oo:` model (300) | byte-identical shards (20.5, 5.9 and 10.1 MB); 270 deals a second on 4 workers against 19 in JS |
| `bench.js compare`, 280 deals | byte-identical JSON |
| `lucky.js generate`, Lucky Cat round settings (`--oracle --returns`), Sphinx's (`--sample-won`, its own models in the pool), and wins only | byte-identical shards |
| `generate.js --native`, Neural Cat exploring against earlier models, Jorge Yau and Lucky Cat, 1,000 deals (`npm run ml:generate -- parity`) | byte-identical shards: every seat recorded (32.4 MB), and the learner's alone (13.4 MB); about 300 to 500 deals a second on 6 to 7 workers against 25 to 34 in JS |
| Shanten, 300,000 random hands | 0 mismatches |
| `Math.exp`, `Math.log`, `Math.pow`, 1,000,000 inputs each | 0 mismatches |

`npm test` runs a short parity check whenever both builds exist (`scripts/ml/native.test.js`).

What it takes to match JS to the bit:

- **No fused multiply-adds.** JS never fuses `a * b + c`, so the build passes `-ffp-contract=off`.
- **V8's math.** `Math.exp` and `Math.log` are V8's fdlibm, which node's build compiles **with** fused multiply-adds: the C library's versions and plain fdlibm each differ on about 1 input in 2,000. They're ported with contraction on inside them (`native/src/jsmath.h`). `Math.pow` is the C library's, identical on every input tried.
- **V8's sort.** Under 8 elements, binary insertion from the second element. From 8, the first ascending or strictly descending run, then binary insertion (`native/src/jssort.h`, measured against node on 60,000 inconsistent comparators). The foundation's discard comparator is inconsistent (a < b, b < c and c < a can all hold), so any other algorithm changes moves.
- **Float32Array.** The networks' buffers and features round to float32 at every store, sums in double, in the JS's order.
- **Iteration order.** Integer-like object keys iterate in ascending order, string keys in insertion order. Products are taken in the same order.
- **State across turns.** Plan commitment (`seat.planMemo`), Jorge Yau's lock (`seat.bigHandLock`) and opening read are kept on the seat, as in the JS.

**Pinned.** `native/ported.json` holds the SHA-256 of every JS file the port matches. A player runs natively only while its files are those. For the benchmark's frozen players, the frozen files must be them too, so a change to the JS can never quietly change what a native judgment measures. After changing the JS, port the change, run parity on every player, then `node scripts/ml/native.js pin`. A file's `equivalent` list in the pin holds earlier versions read by hand to play exactly as the pinned one (a change that only adds an option, its default untouched), with the commit and why, so the frozen players stay native: `js/mahjong-ml-model.js` at the v2 freeze is one (today's adds `createModel`'s optional `expect`). `pin` keeps the list.

**Checked in CI.** The `native-pin` job (`npm run native:check-pin`, which compares SHA-256s and needs no build) fails a PR that changes a pinned file without renewing the pin.

## Weights

`scripts/ml/weights.js` converts between the two forms of a model:

```bash
node scripts/ml/weights.js export ml/models/LV3b.json LV3b.lcmw   # JSON (or js/*-weights.js, or git:<commit>:<path>) to .lcmw
node scripts/ml/weights.js import LV3b.lcmw LV3b.json              # back again
```

`.lcmw` is a JSON header (feature version and size, meta with the play settings) followed by each layer's weights and biases as float32, the same numbers the JS plays with (f16 weights are widened exactly as the JS widens them). Training writes JSON as before, the game loads JSON, and the simulator converts a model the first time it plays it (cached in `native/build/cache/`).

## Two builds

`make -C native` builds both, and the pipeline uses them as a hybrid: training data and screens on the **fast** build (`lcm-sim`), the benchmark's own numbers (every stage of `bench.js judge`, every `bench.js score`) on the **exact** build (`lcm-sim-exact`), which the parity check also diffs against the JS. `bench.js compare --exact` plays a compare exactly. Each result records the build it ran on (`simulator`: `native-fast`, `native-exact` or `js`).

| | Fast (`lcm-sim`) | Exact (`lcm-sim-exact`) |
| --- | --- | --- |
| Float math | fused multiply-adds, float32 networks, the C library's `exp`/`log` | as the JS: no fusing, V8's fdlibm, float32 stores, double sums |
| Same hands as the JS | statistically; a decision between moves tied to the last bit can go the other way | action for action |
| Used by | `lucky.js generate`, `bench.js compare` (screens) | `bench.js judge` and `score`, `compare --exact`, `native.js parity`, `npm test` |

How rarely the fast build differs: on 1,000 deals at the benchmark table every hand was identical to the exact build, and a 2,000-deal compare printed the same gap. On a 20,000-deal round of data (220,000 sampled moves), a few sampled moves flipped; each flip changes that hand, and the rest of its chunk's random stream with it, so 63 of the round's 256 shard files differ while the data is the same in distribution. **This is an accepted trade-off for training data and screens, flagged in the [frontier plan](suphx-plan.md) §6b; judgments and Table Scores don't take it.**

Both builds share every line of code except the arithmetic, so the action-level check on the exact build covers the logic of both.

## Speed

On this Mac (Apple M3: 4 performance and 4 efficiency cores). "Table" is the benchmark table: a Lucky Cat model, Neural Cat, Jorge Yau, Neural Cat.

| | JS | Native, first port (exact) | Round 1 | Round 2 | Round 3 |
| --- | --- | --- | --- | --- | --- |
| Table, one core (hands a second) | 19 | 148 | 308 | 371 | 384 |
| `bench.js compare`, 2,000 deals | about 200 s | 23.7 s | 11.9 s | 11.0 s | **9.9 s** |
| A round's data, 20,000 deals with the oracle | 330 s | about 34 s | | | **12.9 s** |

The exact build, on round 3's pipeline: 235 hands a second on one core, the compare in 15.5 s, the round's data in 20 s.

An Only Orphans seat costs more than a Neural Cat one: it reads its targets' worths from its 14 tiles every turn (each discard, each target's plans, each step's live tiles). Only Orphans, Neural Cat, Jorge Yau and Lucky Cat: 10.5 hands a second in JS, 135 native (fast), 101 exact; four Only Orphans seats: 6.5 and 52.

What each round did:

1. **Round 1 (2.1x on one core):** the fast build (fused multiply-adds, float32 networks with SIMD); standard-shanten ukeire made incremental (adding a tile changes one suit: the other three are merged once, then one lookup and merge per tile); suit tables packed to their reachable states; the networks' first layer updated by the difference from the previous input (consecutive candidates differ in a few features); zero inputs skipped in every layer; the per-input forward cache removed (it never paid).
2. **Round 2 (1.2x):** a plan's shanten and useful tiles memoised by its exact counts and rule (candidate discards share them); Neural Cat's top candidates through the network in one batch; useful tiles as a bitmask instead of a vector.
3. **Round 3 (1.04x on one core, 1.1x end to end):** a profile-guided build (`make -C native pgo`); every core a worker (the parent only waits); work cut into four chunks a worker and queued, so the efficiency cores don't hold the rest up; each model converted to `.lcmw` once a process.

The floor is the bots' own work: per turn, Jorge Yau's foundation weighs about 14 discards against about 10 plans each, and Neural Cat runs its network on the best few (6 for NC9). Neither can be skipped without changing how they play. The networks are already near what float32 arithmetic allows; cheaper formats (int8, float16) would change moves far more often than last-bit rounding does, so they aren't used.

The caches can't change a result: the per-suit shanten table and the whole-hand shanten cache are exact, the opponent reads are kept by the hand's version (a number that changes with every change to the hand), and a forward pass is kept by its exact input.
