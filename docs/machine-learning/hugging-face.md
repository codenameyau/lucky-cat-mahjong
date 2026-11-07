# Hugging Face

The trained models are public on Hugging Face, so anyone can read the model card or download a model. Each new best model is pushed as it ships.

**Training data is not published unless the maintainer explicitly asks for it.** A league round is about 680 MB, the data is only useful for retraining, and every set can be played again from its `manifest.json`. `scripts/ml/hf-data.js` uploads nothing without `--publish`. The dataset repo holds what was published last: the sets L16 trained on and the manifest of every earlier set.

| Repo | Kind | What's in it |
| --- | --- | --- |
| [codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong) | Model | `neural-cat/neural-cat.json`, the model the game ships; `neural-cat/models/<name>.json`, every model that became the best (and `s5.json`, the league's starting point); and the model card with the league's results. `only-orphans/only-orphans.json`, the Only Orphans model the game plays, and `only-orphans/models/<name>.json`, every Only Orphans milestone |
| [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games) | Dataset | `data/<set>/`: the positions of the sets in use (the ones the shipped model trained on and the league's training window), and the `manifest.json` of every set ever played, in the [format](training.md#data-format) `npm run ml:generate` writes, with a dataset card |

The model repo is shared with any other learned strategy: each has its own folder and its own section of the README, between markers like `<!-- neural-cat:start -->` and `<!-- neural-cat:end -->`. The uploader rewrites only its own section.

## Uploading

Both uploaders push over git and SSH, with no access token:

- Your SSH key must be on your Hugging Face account (`ssh -T git@hf.co` says hello).
- The repo must already exist. Create it on huggingface.co; SSH can push to a repo but can't create one.
- The data needs [Git LFS](https://git-lfs.com) (`brew install git-lfs`). The uploader turns it on only inside its own clone.

```bash
# Models: each model that became the best, as its own commit, with the model card.
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --watch        # keep going while the league runs
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --strategy only-orphans   # each Only Orphans milestone
npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --strategy only-orphans --dry-run   # build it locally, push nothing

# Data: only when the maintainer explicitly asks. Each finished set in use (one with a
# manifest), with the dataset card. Sets no longer in use keep only their manifest, and the
# history is squashed to one commit (a force push).
npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games --publish
```

| Script | Options |
| --- | --- |
| `scripts/ml/hf-sync.js` | `--repo`, `--strategy` (`neural-cat`, the default, or `only-orphans`), `--state` (default `ml/league/state.json`, or `ml/orphans/state.json` for Only Orphans), `--folder` (default: the strategy's id), `--watch`, `--every SECONDS` (default 120), `--dry-run` (commits in an empty local repo in the temp folder; no clone, no push) |
| `scripts/ml/hf-data.js` | `--publish` (required; without it nothing is uploaded), `--repo`, `--sets a,b,...` (default j0, s1–s6 and every league round), `--window N` (league rounds kept, default 8), `--watch`, `--every SECONDS` (default 300) |
| `scripts/ml/prune-data.js` | `--apply` (without it, only lists what would go), `--window N`, `--data DIR`, `--league DIR` |

Both keep a clone in `ml/hf/` (gitignored). The data clone hard-links the shard files from `ml/data/` rather than copying them, so the data isn't stored twice. A league round still being played has no manifest yet, so `--watch` waits for it. Each `--watch` stops when the league's log says it's done.

The model card is rebuilt from `ml/league/state.json` on every upload: the current best, how it plays, how it was trained, and a results table with every round's score against the best before it and against s5. Only Orphans' section is rebuilt from `ml/orphans/state.json` the same way, with every round's score against the best and against the rule-based bot. Only its milestones (the models shipped to the game) are uploaded, and nothing goes up before the first one. The dataset card lists every set with its hands and positions, whether its positions are still there, the format, a short Python loader, and the `generate.js` command that plays each removed set again.

## What is kept

Every model's weights stay, on Hugging Face (`neural-cat/models/`) and in `ml/models/`, so any of them can still play in `npm run compete` (`ml:ml/models/L8.json`). So do the docs and the reports: `ml/league/` (the league log and every evaluation), `ml/tune/` and `ml/pairs/`.

Training data is kept only while a model uses it: the sets the shipped model trained on, and the league's last 8 rounds, which the next model trains on. When a new model ships or the window moves on, a set that drops out:

- moves from `ml/data/` to the Trash (`scripts/ml/prune-data.js`) after every league round.
- if the data is ever published again, loses its positions on Hugging Face and keeps its `manifest.json` (its seed, opponents, model and game version: enough to play it again). The repo's history is squashed to one commit, because Hugging Face keeps every file in the history otherwise.

A squash takes the old files out of the repo, but Hugging Face still counts their storage until they're deleted under the repo's **Settings → Storage → List LFS files**. Delete only the files no longer in `main`.

## Using a model from Hugging Face

```bash
curl -L -o L3.json https://huggingface.co/codenameyau/lucky-cat-mahjong/resolve/main/neural-cat/models/L3.json
npm run compete -- --lineup ml:L3.json,jorge-yau,lucky-cat,jorge-yau --deals 1000
node scripts/ml/ship.js L3.json      # make it the game's Neural Cat
```

A model only works with features of the same `featureVersion` (in the file); see [features](features.md#changing-the-features).
