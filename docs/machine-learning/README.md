# Machine learning

Lucky Cat Mahjong has one learned strategy, **Neural Cat**. A small neural network, trained on simulated hands, scores every choice a player has in expected points: which tile to discard, whether to pung, chow or kong, and whether to declare a kong. Neural Cat plays the choice worth the most. The coach explains each choice in plain words.

In the game, the model runs in the browser in plain JavaScript, with no ML server and no ML library. Training runs offline in Node.js (simulating hands) and PyTorch (fitting the network).

- **Model**: [huggingface.co/codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong)
- **Training data**: [huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games)
- **How it plays and its results**: [docs/strategies/neural-cat.md](../strategies/neural-cat.md), the strategy's playbook

## Guides

| Guide | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Every file, how a decision flows from the game to the model and back, and how the pieces fit the bot foundation |
| [Features](features.md) | The 568 numbers that describe a position, group by group, and the rules that keep them honest |
| [Model](model.md) | The network, its outputs, how they become expected points, and the weights file format |
| [Decisions](decisions.md) | How Neural Cat picks discards, claims and kongs, how it explains them, and what the coach says |
| [Training](training.md) | Generating data, training, self-play, the league, competitions, and every command and option |
| [Fair play](fair-play.md) | How the models are kept from seeing the wall or another hand, and the test that checks it |
| [Iterations](iterations.md) | How each Neural Cat model was made and how it plays differently from the one before it |
| [Hugging Face](hugging-face.md) | Where the models and data live, and how they're uploaded |

## Quick start

```bash
# Play: Neural Cat is the default coach on the play page, and a strategy you can seat.
python3 scripts/serve.py 8080   # then open http://localhost:8080/play-mahjong/

# Measure: the shipped model against the rule bots.
npm run compete -- --lineup neural-cat,jorge-yau,lucky-cat,jorge-yau --deals 1000

# Train: set up Python once, then run league rounds (models against models).
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
npm run ml:league -- --start ml/models/s5.json --rounds 20 --deals 50000 --keep 8
```

## At a glance

- **What it learns**: how a hand ends after each choice: a win by self-draw or off a discard, dealing in, someone else winning, or a draw, plus how many faan are won or paid. Those combine into one number, expected points on the full-spicy payout table, so a fast small win and a slow big one are weighed on the same scale.
- **What it builds on**: Jorge Yau's hand reading (`js/mahjong-jorge-yau.js` on the shared foundation `js/mahjong-bot.js`). The model picks among Jorge Yau's best three discards, and can overrule Jorge Yau's claim or kong call when its own pick is worth more.
- **How it was trained**: first on hands the rule strategies played, then self-play against the rule bots, then a league of models playing only other models, a million hands in 50,000-hand rounds. A new model ships only if it beats the best one head to head.
- **What keeps it fair**: its inputs hold only what its seat can see. A test makes every decision twice, once with every hidden tile shuffled, and fails if anything changes.

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
| `scripts/ml/hf-sync.js`, `scripts/ml/hf-data.js` | Upload models and data to [Hugging Face](hugging-face.md) |
| `js/mahjong-ml.test.js` | Tests for the features, model, strategy, claims, kongs and coach lines |
| `js/mahjong-fair-play.test.js` | The [fair-play](fair-play.md) test, for every strategy |
| `js/mahjong-coach-text.test.js` | Keeps every coach line under 400 characters and in the house style |

Local training files are never committed: `ml/data/`, `ml/models/`, `ml/loop/`, `ml/league/`, `ml/hf/` and `ml/.venv/` are gitignored. The only model file in git is `js/mahjong-ml-weights.js`.
