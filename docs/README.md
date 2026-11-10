# Documentation

Guides for working on Lucky Cat Mahjong. The [project README](../README.md) covers the site's pages, running it locally, tests and deploying.

| Folder | What it covers |
| --- | --- |
| [Machine learning](machine-learning/README.md) | Neural Cat and Lucky Cat, the learned strategies. Neural Cat: its features, the neural network, how it picks discards, claims and kongs, how it's trained (self-play and the league), fair play, and the models and data on Hugging Face |
| [Analytics](analytics/README.md) | Google Analytics: how tracking is set up, what's never collected, how to read and add events, and every event the site sends |
| [Architecture](architecture/README.md) | The evaluation architecture (proposed): one model with three heads for the middle layers, inside one pipeline every strategy, model and the coach run for every decision (table read, hand picker, pivot checker, discarder, contradiction check), how it maps onto today's code, and the stages to build it |
| [Strategies](strategies/README.md) | The bots and the coach: the shared foundation, each strategy's playbook, competitions, and reviewing a hand to teach the coach |
| [Offline](offline/README.md) | The service worker: which pages work offline, how every request gets the latest file while online, how new versions take over, retiring the old game worker, and testing |

## Machine learning

- [Overview](machine-learning/README.md): what Neural Cat is, a quick start, and every file
- [Architecture](machine-learning/architecture.md): how a decision flows from the game to the model and back
- [Features](machine-learning/features.md): the 568 numbers that describe a position
- [Model](machine-learning/model.md): the network, expected points, and the weights file
- [Decisions](machine-learning/decisions.md): discards, claims, kongs, explanations and the coach's words
- [Training](machine-learning/training.md): data, training, self-play, the league and competitions
- [Fair play](machine-learning/fair-play.md): how the models are kept from seeing hidden tiles
- [Hugging Face](machine-learning/hugging-face.md): the public models and data, and uploading them
- [Iterations](machine-learning/iterations.md): how Neural Cat and Lucky Cat evolved, model by model, and what each step taught
- [Frontier plan](machine-learning/frontier-plan.md): the frontier model, one network with three heads grown from Neural Cat, the steps to make it strong, and its Learnings
- [Suphx plan](machine-learning/suphx-plan.md): the earlier frontier plan, cancelled on 2026-11-09 as a failed experiment, and its Learnings
- [Benchmark](machine-learning/benchmark.md): the frozen table, the deck, the Table Score and the bar for a next generation
- [Frontier training](machine-learning/frontier-training.md): phase 1, built: features v2, the hidden tiles as targets, the round driver
- [Native simulator](machine-learning/native.md): the engine and the table's players in C++, the exact and fast builds, and the hybrid
- [Frontier history](machine-learning/frontier-history.md): what was done in order, and every decision with why and the evidence

## Strategies

- [Strategies and the shared foundation](strategies/README.md)
- Playbooks: [Neural Cat](strategies/neural-cat.md) · [Jorge Yau](strategies/jorge-yau.md) · [Lucky Cat](strategies/lucky-cat.md) · [Only Orphans](strategies/only-orphans.md)
