# Documentation

Guides for working on Lucky Cat Mahjong. The [project README](../README.md) covers the site's pages, running it locally, tests and deploying.

## In brief

Lucky Cat Mahjong is a static site whose centre is a Hong Kong mahjong game played in the browser, with bots at the table and a coach beside you. Every bot seat, and the coach, plays a named **strategy**. Some are written as rules (Jorge Yau, Only Orphans' targets); the rest are **neural networks** trained on millions of simulated hands:

- **Neural Cat** (NC9) scores Jorge Yau's best options by the points it expects them to win or lose.
- **Lucky Cat** (LC32) makes every move itself; only the contradiction check reads a plan for it.

Every strategy sees only what its seat can see. A **contradiction check** keeps every move in line with the hand it is going for. The coach explains moves in the same words for every strategy, at three levels: Simple, Detailed and Complex.

Training runs on a **native C++ simulator**, about ten times faster than the JS game: a fast build for training, and an exact build that plays every hand as the JS does for judging. A PyTorch trainer fits the networks. Models are judged head to head on fresh deals, and against a frozen benchmark table.

The folders, most important first:

| Folder | What it covers |
| --- | --- |
| [Machine learning](#machine-learning) | The learned strategies: how they see a position, the networks, how they decide, how they're trained and judged, the frontier work and its report, the native simulator, and porting the models to other frontends such as an iOS app |
| [Strategies](#strategies) | The bots and the coach: the shared foundation every rule and model strategy builds on, each strategy's playbook, the contradiction check, and competitions |
| [Architecture](#architecture) | The evaluation architecture: one pipeline every strategy and the coach run for every decision, with one model for the middle layers, and points as the reward |
| [Offline](#offline) | The service worker: which pages work with no connection, how the latest files win while online, and releasing a version |

## Machine learning

The models behind Neural Cat, Lucky Cat and Only Orphans. Start with the frontier report for where things stand, or the overview for how a model plays.

**Where it stands**

- [Frontier report](machine-learning/frontier-report.md): the stacked evaluation architecture (Frontier Cat FC1, since folded into Neural Cat) against the previous one (Neural Cat). It covers the head-to-head results over 100,000 deals, what each step added, what the reader learned, the cost, what went wrong, and what comes next.
- [Frontier plan](machine-learning/frontier-plan.md): the frontier model, one network with three heads grown from Neural Cat. It has the steps to make it strong, how it trains (caching, pruning, where each step runs), how it is judged, and the Learnings from every round.
- [Iterations](machine-learning/iterations.md): how Neural Cat (with its stacked models) and Lucky Cat evolved model by model, with the thinking behind each release and what the bot does differently.

**How a model plays**

- [Overview](machine-learning/README.md): what Neural Cat is, a quick start, and every file.
- [Architecture](machine-learning/architecture.md): how a decision flows from the game to the model and back.
- [Features](machine-learning/features.md): the 568 numbers that describe a position.
- [Model](machine-learning/model.md): the network, expected points, and the weights file.
- [Decisions](machine-learning/decisions.md): discards, claims, kongs, explanations and the coach's words.
- [Fair play](machine-learning/fair-play.md): how the models are kept from seeing hidden tiles, and the test that proves it.

**How models are trained and judged**

- [Training](machine-learning/training.md): data, training, self-play, the league and competitions.
- [Native simulator](machine-learning/native.md): the engine and the table's players in C++, the exact and fast builds, parity with the JS, and the pin.
- [Benchmark](machine-learning/benchmark.md): the frozen table, the deck, the Table Score, and the bar a next generation must clear.
- [Porting](machine-learning/porting.md): running the models on another frontend (Swift, for example). It covers the weights formats, the forward pass, the stacked reader, and the three checks a port must pass.
- [Hugging Face](machine-learning/hugging-face.md): the public models and data, and uploading them.

**History**

- [Suphx plan](machine-learning/suphx-plan.md): the earlier frontier plan, cancelled on 2026-11-09 as a failed experiment, and its Learnings.
- [Frontier training](machine-learning/frontier-training.md): the Suphx plan's phase 1 (features v2, the hidden tiles as targets, the round driver, the loss-aware teacher).
- [Frontier history](machine-learning/frontier-history.md): what was done in order, and every decision with its reason and the evidence.

## Strategies

How each bot plays, and how the coach follows a strategy.

- [Strategies and the shared foundation](strategies/README.md): what each strategy is now and where it plays. It covers the shared foundation (steps from ready, live tiles, plans, threat reads), the contradiction check, adding a strategy, and competition results.
- [Neural Cat](strategies/neural-cat.md): a network scoring Jorge Yau's best options by expected points, with a bonus for the chance to win.
- [Jorge Yau](strategies/jorge-yau.md): the rule playbook. Picking a hand, playing fast, discard order, claims, attack and when to play safe, reading the table, and its knobs.
- [Lucky Cat](strategies/lucky-cat.md): a network that makes every move itself, trained by self-play. LC32 learned to win often and fast; its lineage now plays for points and keeps a fairly high win rate.
- [Only Orphans](strategies/only-orphans.md): big hands of 1s, 9s and honors. Rules pick the target and a network plays inside it.
  - [Training progress](strategies/only-orphans-training.md): its league and lab rounds.

## Architecture

- [The evaluation architecture](architecture/README.md): one pipeline every strategy, model and the coach run for every decision (read the table, pick the hand, decide whether to pivot, choose the move, check it). It also covers why points are the reward, how one model does the middle layers, where the design is weak, and the stages to build it.

## Offline

- [Offline](offline/README.md): the service worker `/sw.js`. Which pages and files it saves, how it answers each request, staying up to date and releasing a new version, retiring the old game worker, and testing.
