# Hugging Face

The trained models are public on Hugging Face, so anyone can read the model card or download a model. Each new best model is pushed as it ships.

**Training data isn't published.** A league round is about 680 MB, the data is only useful for retraining, and every set can be played again from its `manifest.json`.

| Repo | Kind | What's in it |
| --- | --- | --- |
| [codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong) | Model | `neural-cat/neural-cat.json`, the model the game ships; `neural-cat/models/<name>.json`, every model that became the best (and `s5.json`, the league's starting point); and the model card with the league's results. `only-orphans/only-orphans.json`, the Only Orphans model the game plays, and `only-orphans/models/<name>.json`, every Only Orphans milestone. `neural-cat/stacked/`: Neural Cat's stacked models (FC1, the Frontier Cat that played in 0.58.0, with its reader inside) and round 5's FM5c0. `lucky-cat/self-taught/`: Lucky Cat's new lineage from lc32 (the values LV1a, LV1s, LV1c, LV2a and the policies LV2p, LV2t), none shipped. `frontier/lucky-cat/` and `frontier/sphinx/`: the frontier lineages' models (lc32v2, every Lucky Cat candidate from LV1a, the policy-gradient probes, and Sphinx's), each with its screen in the model card. None has passed the benchmark's bar yet |

The model repo is shared with any other learned strategy: each has its own folder and its own section of the README, between markers like `<!-- neural-cat:start -->` and `<!-- neural-cat:end -->`. The uploader rewrites only its own section.

## Contents

- [Uploading](#uploading)
- [What is kept](#what-is-kept)
- [Using a model from Hugging Face](#using-a-model-from-hugging-face)

## Uploading

The uploader pushes over git and SSH, with no access token:

- Your SSH key must be on your Hugging Face account (`ssh -T git@hf.co` says hello).
- The repo must already exist. Create it on huggingface.co; SSH can push to a repo but can't create one.

```bash
# Models: each model that became the best, as its own commit, with the model card.
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --watch        # keep going while the league runs
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --strategy only-orphans   # each Only Orphans milestone
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --strategy only-orphans --dry-run   # build it locally, push nothing
```

| Script | Options |
| --- | --- |
| `scripts/ml/hf-sync.js` | `--repo`, `--strategy` (`neural-cat`, the default, or `only-orphans`), `--state` (default `ml/league/state.json`, or `ml/orphans/state.json` for Only Orphans), `--folder` (default: the strategy's id), `--watch`, `--every SECONDS` (default 120), `--dry-run` (commits in an empty local repo in the temp folder; no clone, no push) |
| `scripts/ml/prune-data.js` | `--apply` (without it, only lists what would go), `--window N`, `--data DIR`, `--league DIR` |

It keeps a clone in `ml/hf/` (gitignored). `--watch` stops when the league's log says it's done.

The model card is rebuilt from `ml/league/state.json` on every upload: the current best, how it plays, how it was trained, and a results table with every round's score against the best before it and against s5. Only Orphans' section is rebuilt from `ml/orphans/state.json` the same way, with every round's score against the best and against the rule-based bot. Only its milestones (the models shipped to the game) are uploaded, and nothing goes up before the first one.

## What is kept

Every model's weights stay, on Hugging Face (`neural-cat/models/`) and in `ml/models/`, so any of them can still play in `npm run compete` (`ml:ml/models/L8.json`). So do the docs and the reports: `ml/league/` (the league log and every evaluation), `ml/tune/` and `ml/pairs/`.

Training data is kept only while a model uses it: the sets the shipped model trained on, and the league's last 8 rounds, which the next model trains on. When a new model ships or the window moves on, a set that drops out moves from `ml/data/` to the Trash (`scripts/ml/prune-data.js`) after every league round.

## Using a model from Hugging Face

```bash
curl -L -o L3.json https://huggingface.co/codenameyau/lucky-cat-mahjong/resolve/main/neural-cat/models/L3.json
npm run compete -- --lineup ml:L3.json,jorge-yau,lucky-cat,jorge-yau --deals 1000
node scripts/ml/ship.js L3.json      # make it the game's Neural Cat
```

A model only works with features of the same `featureVersion` (in the file); see [features](features.md#changing-the-features).
