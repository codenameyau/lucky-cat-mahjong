# Running the models on another frontend

The models play in three places today: the browser (plain JS), the native simulator (C++, for training and judging), and PyTorch (training only). A fourth, such as Swift for an iOS app, needs the same four parts and has the same three checks to pass. Nothing in the model is tied to JS.

## Contents

- [What a port has to build](#what-a-port-has-to-build)
- [The weights](#the-weights)
- [The forward pass](#the-forward-pass)
- [The outputs](#the-outputs)
- [The three checks](#the-three-checks)
- [Where training runs](#where-training-runs)
- [What is and isn't exact](#what-is-and-isnt-exact)

## What a port has to build

| Part | The JS | The C++ | Size |
| --- | --- | --- | --- |
| The engine: the deal, the wall, turns, claims, scoring | `js/mahjong-engine.js`, `js/points.js` | `native/src/engine.cpp`, `scoring.cpp`, `shanten.cpp` | The largest part |
| The shared foundation: the hands a seat could make, steps from ready, threats, the contradiction check | `js/mahjong-bot.js`, `js/mahjong-jorge-yau.js` | `native/src/bot.cpp`, `jy.inc` | Large |
| The features: 568 numbers for a position after a discard | `js/mahjong-ml-features.js` | `native/src/neural_cat.cpp` `encode` | About 150 lines |
| The network and the choice: the forward pass, expected points, picking among the best few | `js/mahjong-ml-model.js`, `js/mahjong-ml.js` | `native/src/model.cpp`, `neural_cat.cpp` | About 300 lines |

The C++ is the better source to port from for Swift: it is already typed, has no closures over shared state, and every place where JS arithmetic matters is marked (`native/src/jsmath.h`, `jssort.h`).

## The weights

Two files hold the same numbers.

**JSON** (`ml/models/<name>.json`, and inside `js/mahjong-ml-weights.js`), what the browser loads:

```
{ featureVersion, featureSize, dtype: "f16", meta: { name, hidden, play: { topK, winBonus, claimMargin }, ... },
  layers: [ { rows, cols, w, b }, ... ] }
```

`w` and `b` are base64 of little-endian float16 (`dtype: "f16"`) or float32. `w` is row-major: weight of input `c` to output `r` is at `r * cols + c`. `meta.play` are the model's own play settings, and a port must read them.

**`.lcmw`** (`node scripts/ml/weights.js export <weights> <out.lcmw>`), what the native simulator loads, and the easier one for Swift:

```
"LCMW"            4 bytes
version           uint32 little-endian (1)
header length     uint32 little-endian
header            JSON: featureVersion, featureSize, meta, layers: [{ rows, cols }]
then, for each layer: rows × cols float32 (row-major), rows float32 (the biases)
```

## The forward pass

For each layer `y = W x + b`; every layer but the last is followed by `max(0, y)`. The inputs and the weights are float32. That is the whole network. A float16 weight is widened to float32 once, when the file is read.

## The outputs

The model the game plays has 28 outputs, raw scores:

| Outputs | What | Read as |
| --- | --- | --- |
| 0–5 | How the hand ends for this seat | softmax: win by self-draw, win off a discard, deal in, someone else self-draws, someone else wins, a draw |
| 6–16 | The faan of its win | softmax over 3 to 13 faan |
| 17–27 | The faan it pays | softmax over 3 to 13 faan |

Expected points are in [the model](model.md#expected-points). The frontier model's extra heads ([frontier plan](frontier-plan.md)) follow in `<name>.heads.json`, which has the same body and a wider last layer:

| Outputs | Head | Read as |
| --- | --- | --- |
| 28–39 | The hand this seat wins with | softmax over 12 hands (`scripts/ml/heads.js` `HANDS`); times its chance to win, the chance to finish as each |
| 40–51 | The hand the rules read for the tiles kept | softmax over the same 12 |
| 52–54 | Each opponent is ready, from the seat's right | a sigmoid each |
| 55 | The tile thrown deals in now | a sigmoid |
| 56–157 | Each opponent's winning tiles (34 each) | a sigmoid each; meaningful when that opponent is ready |

The first 28 rows of the last layer are the play model, unchanged, so a frontend that only plays can ignore the rest.

## The three checks

Each one is a file a port can read and compare against, with no JS to run.

| Check | What it proves | The fixture | The command that makes or runs it |
| --- | --- | --- | --- |
| **The network** | The forward pass gives the same outputs | `ml/models/<name>.check.json`: 16 inputs and their outputs from PyTorch | `node scripts/ml/parity.js <weights> <check>` (the largest difference must be under 0.001) |
| **The rows** | The features and labels of a position are the same bytes | The shard files of a short run (`shard-N.features`, float16; `.labels`; `.aux`) | `npm run ml:generate -- parity --deals 200` |
| **The actions** | Every move of every hand is the same | A trace: one line an action for a list of deals | `node scripts/ml/native.js parity --agents neural-cat,jorge-yau,neural-cat,jorge-yau --deals 2000` |

A Swift port passes when it reads the same weights, reproduces the check file's outputs, and prints the same trace for the same deal seeds. The action check is the one that matters to a player: it says the app plays the hand the way the website does.

## Where training runs

| Step | Runs on | Why |
| --- | --- | --- |
| Playing the games that make the data | The native simulator (`lcm-sim generate-nc`, through `npm run ml:generate -- --native`) | This is nearly all of the time. The simulator plays the same deals with the same random draws and writes the same bytes as the JS |
| The same, in JS | `npm run ml:generate` | The reference. `parity` plays a short run both ways and compares the files byte for byte, so the fast path can't drift from what the browser does |
| Fitting the network | PyTorch (`ml/train.py`), on the GPU when there is one | Minutes a round |
| Judging | The native simulator (`node scripts/ml/bench.js compare` and `judge`) | Screens on the fast build, judgments on the exact build |

## What is and isn't exact

- **The exact build** (`lcm-sim-exact`) does its arithmetic the way JS does, in the same order, and its rows and actions match the JS bit for bit. Use it for the checks.
- **The fast build** (`lcm-sim`) lets the compiler reorder the network's sums. Its outputs differ in the last bits, so a move that was a near tie can go the other way. It is used for training data and screens, where that doesn't matter, and never for a judgment.
- **A new frontend should aim for the exact build's behaviour**: float32 weights and inputs, sums in the order the code writes them, and JS's `Math.exp`, `Math.log` and `Math.pow` (the platform's `exp`, `log` and `pow` on doubles agree on macOS and iOS; `jsmath.h` notes where a platform might not).
- **Sorting matters.** Several choices sort candidates and break ties by their earlier order. `jssort.h` is a stable sort with JS's comparator rules; Swift's `sort` is not guaranteed stable, so a port needs its own.
