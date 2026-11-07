# Documentation

Guides for working on Lucky Cat Mahjong. The [project README](../README.md) covers the site's pages, running it locally, tests and deploying.

| Folder | What it covers |
| --- | --- |
| [Machine learning](machine-learning/README.md) | Neural Cat and Lucky Cat, the learned strategies. Neural Cat: its features, the neural network, how it picks discards, claims and kongs, how it's trained (self-play and the league), fair play, and the models and data on Hugging Face |
| [Analytics](analytics/README.md) | Google Analytics: how tracking is set up, what's never collected, how to read and add events, and every event the site sends |
| [Strategies](strategies/README.md) | The bots and the coach: the shared foundation, each strategy's playbook, competitions, and reviewing a hand to teach the coach |

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

## Strategies

- [Strategies and the shared foundation](strategies/README.md)
- Playbooks: [Neural Cat](strategies/neural-cat.md) · [Jorge Yau](strategies/jorge-yau.md) · [Lucky Cat](strategies/lucky-cat.md) · [Only Orphans](strategies/only-orphans.md)
