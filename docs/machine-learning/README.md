# Machine learning

Lucky Cat Mahjong has three learned strategies, each a small neural network trained on simulated hands:

- **Neural Cat** (shipped model NC10) scores every choice in expected points (which tile to discard, whether to pung, chow or kong) on top of Jorge Yau's hand reading, and plays the one worth the most. The coach explains each choice in plain words.
- **Lucky Cat** (shipped model lc34) plays every move itself: its network reads what its seat can see and gives each legal move a share, and a move that contradicts the hand it builds toward gives way to its next most likely. It taught itself from random play.
- **Only Orphans** (shipped model OW1): rules pick a target each deal, and its network scores the allowed discards, pungs and kongs in expected points.

In the game, the models run in the browser in plain JavaScript, with no ML server and no ML library. Training runs offline: hands are simulated in Node.js, or in the native C++ simulator, which plays the same hands much faster, and the networks are fitted with PyTorch.

**What each one is for** (the maintainer's aims, set 2026-11-11): Lucky Cat wins the most hands, with small fast hands and a big one when the chance is good and it is nearly ready; Only Orphans goes for the biggest hands and the most points, even if it wins less often; Neural Cat is the balance of both ([what each strategy is for](../strategies/README.md#what-each-learned-strategy-is-for)).

**How they're trained now: each lineage against its own past** ([training](training.md#training-a-lineage-against-its-own-past)). Since 2026-11-10, each model trains and is judged only against older models of its own lineage, so its progress is a clear benchmark. Everything plays on the [native simulator](native.md): its fast build for data and screens, its exact build for confirmations. A new generation must win on fresh paired deals on the exact build, by its lineage's aim: Lucky Cat's hands won up 2 standard errors with points and deal-ins no worse; Only Orphans' points up 2 standard errors; Neural Cat's points or hands won up 2 standard errors with the other not down by more than 1. A ship candidate needs 3 standard errors on its aim's measure against the model in the game. lc33, lc34, NC10 and OW1 came this way. Playing the three against each other, and a championship with Jorge Yau, is a later phase.

Lucky Cat's loop is in master (`scripts/ml/lc-own-loop.js`). Neural Cat's and Only Orphans' are on the branches `train/neural-cat-overnight` and `train/only-orphans-overnight`, not in master.

**Before that.** Neural Cat was trained by self-play, a league (NC1, NC2) and the lab (`npm run ml:lab`, NC3 to NC9). Lucky Cat started from wins imitated in self-play, then the lab (lc21 to lc32). The **frontier plan** built on Suphx, with a second lineage, Sphinx, from random weights, was cancelled on 2026-11-09 as a failed experiment ([why](suphx-plan.md#the-suphx-line-is-cancelled-2026-11-09)); the plan that followed it, one network with three heads grown from Neural Cat ([the frontier plan](frontier-plan.md)), made the stacked FC1, which folded into Neural Cat in 0.59.0. What those plans left that is still used: the native simulator, features v2 and the auxiliary heads, the hidden tiles as targets and never as inputs, and paired judging on fresh deals. Their record is in [frontier history](frontier-history.md).

- **Model**: [huggingface.co/codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong)
- **How they play and their results**: the playbooks for [Neural Cat](../strategies/neural-cat.md), [Lucky Cat](../strategies/lucky-cat.md) and [Only Orphans](../strategies/only-orphans.md)

## Contents

- [Guides](#guides)
- [Quick start](#quick-start)
- [At a glance](#at-a-glance)
- [Files](#files)

## Guides

| Guide | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Every file, how a decision flows from the game to the model and back, and how the pieces fit the bot foundation |
| [Features](features.md) | Neural Cat's 568 numbers that describe a position, group by group, and the rules that keep them honest (Lucky Cat's and the frontier models' are in [frontier training](frontier-training.md)) |
| [Model](model.md) | Neural Cat's network, its outputs, how they become expected points, and the weights file format |
| [Decisions](decisions.md) | How Neural Cat picks discards, claims and kongs, how it explains them, and what the coach says |
| [Training](training.md) | How each model is trained now (against its own lineage's past), generating data, training, self-play, the league, the lab, competitions, and every command and option |
| [Fair play](fair-play.md) | How the models are kept from seeing the wall or another hand, and the test that checks it |
| [Hugging Face](hugging-face.md) | Where the models live, and how they're uploaded |
| [Iterations](iterations.md) | How each Neural Cat, Lucky Cat and Only Orphans model was made, how it plays differently from the one before it, and what each step taught. One section per training idea (the league, the lab, points first, Suphx, the frontier, each lineage against its own past) or milestone (Neural Cat 2, Lucky Cat 2), a heading for each model inside it |
| [Frontier report](frontier-report.md) (past) | The stacked evaluation architecture (Frontier Cat FC1, folded into Neural Cat in 0.59.0) against the previous architecture (Neural Cat: NC8 in the game then, N14c the lab's best), head to head on 100,000 deals, with what each step added |
| [Frontier plan](frontier-plan.md) (past) | The plan for the frontier model: one network with three heads (the table, the hand, the move), grown from Neural Cat. The steps to make it strong, each with a bar and a point at which it is dropped, where it is weak, and its Learnings |
| [Other frontends](porting.md) | What a port to another frontend (Swift, for an iOS app) has to build, the weights formats, the forward pass, each head's outputs, and the three checks a port must pass |
| [Suphx plan](suphx-plan.md) (cancelled) | Suphx taken apart against Hong Kong rules, four rounds of critique (the last on the plan itself), and the phased plan to make Lucky Cat the strongest Hong Kong mahjong player: privileged labels as targets, a tile-structured network, a distributional value, a league, the job each model family (heuristics, MCTS, DQN, policy gradient) gets, the benchmark (one frozen table, one deck, a Table Score) with its two-standard-errors-twice bar, and the two lineages, Lucky Cat and Sphinx |
| [Benchmark](benchmark.md) | The frontier benchmark (no longer the bar for a new generation), built: the frozen table (NC9, Jorge Yau, NC9 at 0.58.0, pinned by SHA-256 and a fingerprint), the 40,000-deal deck, the Table Score, and `bench.js judge`, which runs the five stages of the bar for the next generation of a lineage (Neural Cat, Lucky Cat, Sphinx) |
| [Native simulator](native.md) | The engine and the benchmark table's players (Jorge Yau, Neural Cat, Lucky Cat v1 and v2, the oracle) in C++. A round's data in 13 s instead of 330 s. Two builds used as a hybrid: fast for training data and screens, exact (every hand as the JS plays it) for judgments and Table Scores. How it's built, checked and pinned, the three optimization rounds, and the weights in both forms (JSON and `.lcmw`) |
| [Frontier training](frontier-training.md) (cancelled) | Phase 1, built: features v2 (who threw what, after claims, shanten and live waits per discard), auxiliary heads that learn the hidden tiles as targets, `--sample-won`, and `frontier.js`, the round driver for Lucky Cat (from lc32 widened to v2) and Sphinx (from random weights), kept only by the benchmark's bar (since removed with the cancelled line); the first probe's numbers |
| [Frontier history](frontier-history.md) (past) | The frontier work in order, and every decision taken (the benchmark, training, search, the native simulator, the hybrid) with why, the evidence, and what would reopen it |

## Quick start

```bash
# Play: Neural Cat is the default coach on the play page, and a strategy you can seat.
python3 scripts/serve.py 8080   # then open http://localhost:8080/play-mahjong/

# Measure: the shipped model against the rule bots.
npm run compete -- --lineup neural-cat,jorge-yau,lucky-cat,jorge-yau --deals 1000

# Train: set up Python and build the native simulator once,
# then run Lucky Cat's rounds against its own older generations.
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
npm run native:build
node scripts/ml/lc-own-loop.js --rounds 4   # reads ml/overnight/lucky-cat/plan.json
```

Neural Cat's and Only Orphans' loops run from their branches ([training](training.md#neural-cat-and-only-orphans-on-their-branches)). The earlier tools (`npm run ml:lab`, `npm run ml:frontier`, `npm run ml:bench`) still run.

## At a glance

- **Neural Cat: what it learns**: how a hand ends after each choice: a win by self-draw or off a discard, dealing in, someone else winning, or a draw, plus how many faan are won or paid. Those combine into one number, expected points on the full-spicy payout table, so a fast small win and a slow big one are weighed on the same scale.
- **Neural Cat: what it builds on**: Jorge Yau's hand reading (`js/mahjong-jorge-yau.js` on the shared foundation `js/mahjong-bot.js`). The model picks among Jorge Yau's best few discards (6 for NC10, as for NC9, `meta.play.topK`), and can overrule Jorge Yau's claim or kong call when its own pick is worth more.
- **Neural Cat: how it was trained**: first on hands the rule strategies played, then self-play against the rule bots, then a league of models playing only other models, a million hands in 50,000-hand rounds. A new model ships only if it beats the best one head to head. From NC3 to NC9, the lab: experiments kept only on a clear gain on fresh deals. NC10 is NC9 with its two faan heads retrained on softened labels (label smoothing 0.03), at a table of only older Neural Cats.
- **Lucky Cat: how it was trained**: one network (376 inputs, 512-256, 74 outputs: a share for every discard and kong, and for each claim), first by imitating its own wins in self-play (to lc20), then in the lab (to lc32), then at a table of only older Lucky Cats, learning from replays of its top moves on the same reshuffled walls (lc33, lc34).
- **Only Orphans: how it was trained**: a league, then the lab (to OT11d), native rounds (OS2c1), then at a table of only older Only Orphans, on data rich in won positions (OW1).
- **Lucky Cat and Sphinx, the frontier lineages (cancelled 2026-11-09)**: features v2 (854 inputs) and auxiliary heads, used in training only, that learn to read the other hands and the wall. They were judged at the benchmark table (two Neural Cat NC9 and Jorge Yau, frozen) by its Table Score, points a hand.
- **What keeps it fair**: every model's inputs hold only what its seat can see. A test makes every decision twice, once with every hidden tile shuffled, and fails if anything changes. The hidden tiles may be training targets and a teacher's labels, never a shipped model's inputs.

## Files

| File | Role |
| --- | --- |
| `js/mahjong-ml-features.js` | Builds the inputs ([features](features.md)) |
| `js/mahjong-ml-model.js` | Runs the network and turns its outputs into expected points ([model](model.md)) |
| `js/mahjong-ml-weights.js` | The shipped weights (generated; don't edit by hand) |
| `js/mahjong-ml.js` | The Neural Cat strategy: discards, claims, kongs, explanations ([decisions](decisions.md)) |
| `js/mahjong-coach.js` | The coach's model lines, and the 400-character limit on every hint |
| `js/mahjong-bot.js` | The shared foundation: the `rerank` hook, claim options with the model's read, and `shownMelds` |
| `js/mahjong-engine.js` | The game engine; its whole-hand shanten cache speeds up simulations |
| `scripts/ml/generate.js` | Simulates hands and writes training data ([training](training.md)) |
| `ml/train.py` | Trains a model with PyTorch and exports it for the game |
| `scripts/ml/parity.js`, `scripts/ml/ship.js` | Check the JS model matches PyTorch; copy a model into the game |
| `scripts/ml/loop.js` | Self-play rounds against the rule bots |
| `scripts/ml/league.js` | League rounds: models against models |
| `scripts/competition.js` | Head-to-head matches (`npm run compete`) |
| `scripts/ml/hf-sync.js` | Uploads models to [Hugging Face](hugging-face.md) |
| `scripts/ml/prune-data.js` | Moves training data no model uses to the Trash ([what is kept](hugging-face.md#what-is-kept)) |
| `js/mahjong-lucky-cat-ml.js`, `js/mahjong-lucky-cat-net.js`, `js/mahjong-lucky-cat-weights.js` | Lucky Cat: the strategy, its network and features (v1), the shipped weights |
| `js/mahjong-frontier-net.js` | Features v2 for the frontier models ([frontier training](frontier-training.md)) |
| `scripts/ml/lucky.js`, `ml/train_lucky.py` | Lucky Cat's and Sphinx's data and training (imitation, the deal-in teacher, auxiliary heads, policy gradient) |
| `scripts/ml/lc-own.js`, `scripts/ml/lc-own-loop.js`, `scripts/ml/lc-own-ship.js`, `ml/lc_own_train.py` | Lucky Cat against its own lineage: replay data, cached paired screens and confirmations, the round driver, the ship table, every arm in one GPU process ([training](training.md#lucky-cat-scriptsmllc-own-loopjs)). Neural Cat's and Only Orphans' loops are on their branches ([training](training.md#neural-cat-and-only-orphans-on-their-branches)) |
| `scripts/ml/oracle.js` | The hidden tiles, recorded for training only |
| `scripts/ml/bench.js`, `bench/` | The benchmark: Table Scores and the bar for a next generation ([benchmark](benchmark.md)) |
| `native/`, `scripts/ml/native.js`, `scripts/ml/weights.js` | The native simulator, its parity check against the JS, and weights as JSON and `.lcmw` ([native simulator](native.md)) |
| `js/mahjong-ml.test.js` | Tests for the features, model, strategy, claims, kongs and coach lines |
| `js/mahjong-fair-play.test.js` | The [fair-play](fair-play.md) test, for every strategy |
| `js/mahjong-coach-text.test.js` | Keeps every coach line under 400 characters and in the house style |

Local training files are never committed: `ml/data/`, `ml/models/`, `ml/loop/`, `ml/league/`, `ml/frontier/`, `ml/bench/`, `ml/hf/`, `ml/.venv/`, `native/build/` and `ml/overnight/lucky-cat/` (all but its `REPORT.md`) are gitignored. The model files in git are the shipped weights: `js/mahjong-ml-weights.js`, `js/mahjong-lucky-cat-weights.js` and `js/mahjong-only-orphans-weights.js`.
