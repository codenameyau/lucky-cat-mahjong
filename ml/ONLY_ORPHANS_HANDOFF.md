# Only Orphans: handoff

Written 2026-11-07 by the Only Orphans session, for the session that takes over training. Branch: `feature/only-orphans-model`. Work in `C:\Users\coden\Workspace\lucky-cat-mahjong`.

## What the user asked for

- Train a neural network for the **only-orphans** strategy, the way the Neural Cat models are trained, in batches of **50,000 games** (first target 1,000,000 games = 20 rounds), and then **keep training with more games and iterations until the user says stop**.
- **Compare every round against the rule-based only-orphans bot as the baseline.**
- Track progress every iteration in the docs, and report the results in the chat.
- The trained model **replaces the rule-based logic** in the game; the old JS isn't needed once the open-weight model ships.
- On every **milestone leap**, publish to a pull request automatically, without asking. Keep all Only Orphans models in **one PR** until the user merges or closes it, then open a new one. **Every merged PR must leave the model playable in the actual game.** (The user now wants one PR for both models: the combined session decides how.)
- Don't stop to ask: go with the recommended choice and say what it was.

## What's built (commit `1ddae8b` and the handoff commit after it)

| File | What it is |
| --- | --- |
| `js/mahjong-only-orphans.js` | The learned strategy, id `only-orphans`. Fixed rules as hooks on the shared foundation: tiles that aren't 1s, 9s or honors go first (even when folding), no chows, pungs/kongs only of 1s, 9s and honors, and the plans are Thirteen Orphans (while alive) plus Mixed Orphans, All Terminals and All Honors as triplets or pairs. Built with `MahjongML.create({ base, topK: 0, allow, claimOk, kongOk, loadWeights })`, so the model picks among every allowed discard and every allowed call. `create(options)` makes training copies. It loads `js/mahjong-only-orphans-weights.js` (`MahjongOnlyOrphansWeights` in the browser); with no weights it plays a random model. |
| `js/mahjong-ml.js` | New opt-in options for any learned strategy: `allow(candidates, ctx, counts, game)` (the discards the model may pick from, exploring included), `claimOk(option, opts)`, `kongOk(kong, game, seat)`, `loadWeights()`. Neural Cat doesn't use them, and its tests are unchanged. |
| `scripts/ml/baselines/only-orphans-rules.js` | The old rule-based bot (git history of `js/mahjong-only-orphans.js`), now id `only-orphans-rules`, never loaded by the game. |
| `scripts/ml/baselines/register.js` | Registers `only-orphans-rules` and `oo:<file>` (learned Only Orphans with those weights) as lab strategies for the scripts. |
| `scripts/ml/generate.js` | New `--learner only-orphans` (the learner's id is its exploring copy; positions are read through its foundation; `oo:<file>` seats are earlier models; `neural-cat` is then the shipped Neural Cat as an opponent) and `--record a,b` (record only those seats). Defaults unchanged for Neural Cat. |
| `scripts/competition.js` | Accepts `oo:<file>` and `only-orphans-rules` in `--lineup`. |
| `scripts/ml/ship.js` | `ship(file, strategy)`; `--strategy only-orphans` writes `js/mahjong-only-orphans-weights.js`. |
| `scripts/ml/orphans.js` (`npm run ml:orphans`) | The training league (below). State and log in `ml/orphans/` (gitignored). Writes `docs/strategies/only-orphans-training.md` after every round. With `--publish` it runs `npm test`, commits the doc and weights, and from the first milestone pushes and opens or updates one PR (a new branch `feature/only-orphans-model-r<N>` after a merge or close). |
| `js/mahjong-game.js` | `loadAssets` also loads `/js/mahjong-only-orphans-weights.js` (a missing file doesn't stop the game). |
| `play-mahjong/index.html`, `play-mahjong/playback/index.html` | `mahjong-only-orphans.js` now loads after `mahjong-ml.js` (it depends on it). |
| `js/mahjong-strategies.js` | New summary and details for only-orphans (names its model from the weights' `meta.name`). |
| Tests | Rule tests now target the baseline module. New "only-orphans (learned)" tests check the fixed rules hold for the shipped model and for random models with exploration. `js/mahjong-analysis.test.js` uses rule bots only. 489 pass. |
| Docs | `docs/strategies/only-orphans.md` (rewritten: fixed rules, what the model decides, how it's trained, the baseline), `docs/machine-learning/training.md` (Only Orphans section), `README.md` (strategy row, file tree, `ml:orphans` command). |

## The league, round by round (`scripts/ml/orphans.js`)

1. **Round 1 (bootstrap):** 50,000 deals, pool `only-orphans-rules` x3 + `neural-cat`, `jorge-yau`, `lucky-cat` (each seat drawn at random, so about half are the rule bot), `--record only-orphans-rules --explore 0.05 --sample 0.25`. O1 trains from scratch (`--epochs 30 --patience 4`).
2. **Rounds 2+:** pool `only-orphans` x3 (the best, `--temperature 150 --epsilon 0.05`) + the three opponents + up to 2 earlier models (`oo:<file>`), `--record only-orphans --explore 0 --sample 0.25`. Train from the best: `--lr 3e-4 --epochs 8 --patience 3 --dropout 0.2 --weight-decay 1e-3`, last 8 rounds of data, `--device-bytes 8e9`.
3. **Rank:** `seat()` runs `competition.js --lineup <X>,neural-cat,jorge-yau,lucky-cat --deals 3000` for the new model, the best and `only-orphans-rules` on the same seed (`90000000 + round * 10000`). Score = points a hand difference; margin = sqrt of the two 95% margins squared.
4. **Kept** if it beats the best. **Milestone** if kept and its score against the baseline is above the margin and above the shipped model's. A milestone ships the weights.

Data seeds: `50000000 + round * 1000000`. Data in `ml/data/orphans-<N>`, models `ml/models/O<N>.json`.

## Commands

```powershell
# The whole league (one round per call is easiest to report on):
npm run ml:orphans -- --rounds 1 --deals 50000            # add --publish to commit/push/PR automatically

# By hand. Bootstrap data from the rule bot:
node scripts/ml/generate.js --learner only-orphans --deals 50000 --lineup mix --pool only-orphans-rules,only-orphans-rules,only-orphans-rules,neural-cat,jorge-yau,lucky-cat --record only-orphans-rules --explore 0.05 --sample 0.25 --seed 51000000 --out ml/data/orphans-1
# Self-play data from a model:
node scripts/ml/generate.js --learner only-orphans --deals 50000 --lineup mix --pool only-orphans,only-orphans,only-orphans,neural-cat,jorge-yau,lucky-cat --weights ml/models/O1.json --temperature 150 --epsilon 0.05 --explore 0 --record only-orphans --sample 0.25 --seed 52000000 --out ml/data/orphans-2
# Train:
npm run ml:train -- --data ml/data/orphans-1 --name O1 --epochs 30 --patience 4 --device-bytes 8e9
npm run ml:train -- --data ml/data/orphans-1 ml/data/orphans-2 --name O2 --init ml/models/O1.json --lr 3e-4 --epochs 8 --patience 3 --dropout 0.2 --weight-decay 1e-3 --device-bytes 8e9
# Evaluate against the baseline (same seed for both):
npm run compete -- --lineup oo:ml/models/O2.json,neural-cat,jorge-yau,lucky-cat --deals 3000 --seed 90020000 --json ml/O2.json
npm run compete -- --lineup only-orphans-rules,neural-cat,jorge-yau,lucky-cat --deals 3000 --seed 90020000 --json ml/base.json
# Ship to the game:
node scripts/ml/ship.js ml/models/O2.json --strategy only-orphans
```

Windows notes: Node 26, Python in `ml\.venv` (CUDA PyTorch, TITAN RTX), and new shells need PATH reloaded (`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`). Git uses `core.autocrlf=input`.

## State, models and results so far

**None.** Round 1 was stopped during data generation for the handoff; its partial data and `ml/orphans/` state were deleted. No Only Orphans model has been trained, and `js/mahjong-only-orphans-weights.js` doesn't exist yet.

Smoke tests (300 deals a round, not kept) showed the pipeline works end to end: bootstrap data, O1 from scratch, O2 from O1, ranking, ship, doc. Speeds: generation with ML seats is about 40-110 deals/s on 31 workers; training is about 5 s an epoch per 4.4M positions; the rule-based baseline won about 1.3% of hands in a 160-hand smoke ranking.

## What's left

1. Run the rounds (bootstrap first), report each one in chat, and keep going until the user says stop.
2. At the first milestone, ship the weights and open the PR (the user now wants one PR for both models). **Until weights ship, the game's only-orphans plays a random model**, so don't merge before `js/mahjong-only-orphans-weights.js` is committed.
3. If no model clearly beats the baseline after several rounds, consider more data per round (`--deals 100000`), a larger `--sample`, or a bigger evaluation (`--eval-deals 6000`) to shrink the margin. The baseline's score is driven by rare limit hands, so its variance is high.
4. When a model ships, update `docs/strategies/only-orphans.md` "How it does" with its measured results, and the GitHub release notes (as `docs/machine-learning/iterations.md` describes for Neural Cat).
5. Optional: upload the models to Hugging Face like Neural Cat's (`scripts/ml/hf-sync.js` is Neural Cat-only today). Ask the user first: it publishes.

## How a merged PR makes it playable

The game loads `js/mahjong-only-orphans.js` (the strategy) on the Play and Playback pages, and `js/mahjong-game.js` loads `/js/mahjong-only-orphans-weights.js` with the other assets before a strategy builds its model. So a merged PR that contains a shipped `js/mahjong-only-orphans-weights.js` makes the trained model play in the only-orphans seats and coach as soon as the site deploys. `npm test` checks the fixed rules hold with any weights.
