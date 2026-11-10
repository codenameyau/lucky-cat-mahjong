# The frontier benchmark

How strong a model is, as one number anyone can reproduce, and the bar a model must clear to become the next generation of its lineage. This is phase 0 of the [frontier plan](suphx-plan.md) (§9), built in `scripts/ml/bench.js`, with the benchmark pinned in `bench/`.

## Contents

- [The table, frozen](#the-table-frozen)
- [The Table Score](#the-table-score)
- [Comparing two models](#comparing-two-models)
- [The bar: two standard errors, twice](#the-bar-two-standard-errors-twice)
- [The lineages](#the-lineages)
- [Not built yet](#not-built-yet)

## The table, frozen

The benchmark is named **hk-table-v2**. It is defined in `bench/benchmark.json` and never edited: a new table gets a new name, and every model is scored again on it. Version 1 is kept as `bench/benchmark-v1.json` ([below](#version-1)).

- **Who plays.** The model being scored takes one seat. The other three are frozen copies of **Neural Cat NC9** (N14c, fast), **Jorge Yau** and NC9 again, as they were at game version 0.58.0, which is commit `8ffc0d0`. The model takes every seat in turn on every deal. The frozen players don't follow the game: when Neural Cat ships NC10, the benchmark's Neural Cat stays NC9.
- **How they are frozen.** `bench/benchmark.json` pins eight files at that commit by SHA-256:
  - Neural Cat's weights;
  - the code both players run (`mahjong-ml.js` and its features and model, `mahjong-jorge-yau.js`, `mahjong-bot.js`);
  - the engine and points rules they call.
  
  `bench.js` reads the files out of git history into `ml/bench/git/`, checks every hash, and loads the players from there. So nothing large is committed, and a full clone is needed (CI fetches the whole history for this). The model being scored uses today's engine and code.
- **The fingerprint.** The frozen players play 24 deals alone, on today's engine, from the first seeds of the deck. The hash of how every hand ended must match the one recorded when the benchmark was frozen. If an engine change alters how a hand plays or scores, the fingerprint no longer matches, and every command refuses to score until a new benchmark version is frozen. Scores from two versions never mix.
- **The deck.** 40,000 deals, seeds 900,000,000 to 900,039,999, with the dealer rotating. No training data or lab evaluation uses nine-digit seeds. The plan first named 90,000,000, but the Only Orphans lab ranks its models on those seeds, so the deck moved.
- **Native.** The frozen players' files are the ones `native/ported.json` pins, so every stage plays on the native simulator (the exact build for the bar and the score). A change to one of those files in the game doesn't move the benchmark: its players stay frozen, and they run natively only while the port matches them.

### Version 1

**hk-table-v1** froze NC8 (N10c) and Jorge Yau at game 0.57.9 (commit `dd881a5`). Jorge Yau has changed a lot since (pivots, staying concealed early, the contradiction check), and the native port follows the game, so its players could only run in JS, hours a stage. Version 2 (2026-11-10) keeps the same deck, fresh blocks, bar and fingerprint deals, with the table frozen again at 0.58.0. No model had a recorded score on version 1.

## The Table Score

```bash
node scripts/ml/bench.js score lc:ml/models/LS3a.json
```

Points a hand at the benchmark table over the whole deck: 40,000 deals and 160,000 hands. It comes with its standard error, taken deal by deal (each deal's value is the mean over the model's four seats), and with hands won, deal-ins, average win and average faan.

- `--deals N` scores the first N deals only. That is a partial score, and it is never recorded.
- `--record NAME` adds a full-deck score to `bench/scores.json`.

A full score takes about an hour on seven workers.

Where it stands (partial):

| Model | Table Score | Deals | Hands won | Deal-ins |
| --- | --- | --- | --- | --- |
| Lucky Cat lc32 | −109.5 ± 39.3 | 200 | 24.4% | 13.0% |

The 200-deal run is only a check that the score works. lc32's provisional −98.7 came from 2,000 deals of the lab's table test. Its full-deck score goes in `bench/scores.json` the first time the machine is free for an hour. The north star for Lucky Cat is a Table Score above 0.

## Comparing two models

```bash
node scripts/ml/bench.js compare lc:ml/models/LS3a.json lc:git:dd881a5:js/mahjong-lucky-cat-weights.js --deals 10000
```

This gives the paired gap, the first model less the second, deal by deal at the benchmark table: both models play the same deals in the same seats. By default it plays **fresh** deals and never the deck, so a model can't learn the deck. Each stage of the bar takes the next unused block of 50,000 seeds from 910,000,000 on. The counter is in `ml/bench/seeds.json`, so no block is used twice on one machine.

## The bar: two standard errors, twice

```bash
node scripts/ml/bench.js judge lc:ml/models/LS3a.json --lineage lucky-cat --promote lc33
```

A candidate becomes the next generation only by passing every stage, in this order. `judge` stops at the first stage that fails:

| Stage | Deals | Passes when |
| --- | --- | --- |
| **Fair play** | 4 whole hands, checked | It reads only its seat's features (no `meta.oracle`; the first layer reads exactly its feature size), and its decisions don't move when every hidden tile is shuffled and every hidden record throws (`scripts/ml/fair-play.js`, the same check as `js/mahjong-fair-play.test.js`). It is the cheapest stage, so it runs first: a model that fails it is never played. |
| **Screen** | 10,000 fresh, paired against the current generation | The gap is at least 1 standard error |
| **Qualify** | 40,000 fresh, paired | The gap is at least **2 standard errors**. In the Lucky Cat lineage, hands won may not fall more than 1 standard error below the current generation (winning more is never a fail) |
| **Replicate** | Another 40,000, new seeds | At least **2 standard errors again**. One two-sigma result among several arms a round is a 2% coin; two in a row on independent deals is a 0.05% one |
| **No regression** | 10,000 for each earlier generation and each league opponent (Jorge Yau and the shipped Neural Cat) | The candidate and the current generation each sit at a table of three of that rival, on the same deals; the candidate may not do worse there by more than 1 standard error |

A candidate that passes is then scored on the deck. `--promote NAME` adds it to `bench/lineages.json` as the lineage's next generation, pinned by SHA-256, and puts its Table Score in `bench/scores.json`. Every judgment, passed or failed, with every stage's numbers, is written to `ml/bench/judged/`. A model that fails doesn't come back: the next round trains from the current generation.

**No regression is measured against the current generation, not head to head.** A first draft of `judge` played the candidate against each league opponent directly and required it not to lose. But lc32 loses to Jorge Yau at a table, and so does any early Sphinx, so nothing could ever pass. What the stage is for is a model that beats the champion by learning one opponent's tells and plays worse against another, and the paired comparison at that rival's table catches exactly that.

**Sequential stopping** (plan §6). Qualify and replicate play in blocks of 10,000 deals. After a block, they stop early if the gap is already at least 4 standard errors (a pass: twice the bar) or at most −2 (a clear loss). The thresholds sit far outside the bar, so stopping early rarely changes the verdict a full run would give, and a clear case costs a quarter of the deals.

The early fail was at most 0 standard errors until 2026-11-09, when the maintainer moved it to −2. The candidates in question have a true gain of about +2 points a hand, under half a standard error of a 10,000-deal block (about 5.3). One of those is at or below 0 after its first block about a third of the time, so a 0 threshold stopped many real small gains on a single block's noise: LV8c stopped at −1.34 SE. At −2, a candidate stops early only on a clear loss, and anything else gets its full 40,000 deals. The bar itself is unchanged: 2 standard errors at the end.

**Sphinx's bar is 1 standard error for now** (`bar.lineages.sphinx.sigma`, the maintainer's call, 2026-11-09). Sphinx starts from random weights (sp0) and no candidate has beaten random play yet, so a first generation needs a lower bar to start compounding. It still passes the screen, qualify and replicate, each at 1 SE on fresh deals. A candidate no better than sp0 passes all three about 0.4% of the time (0.16³). Sphinx isn't in the game, so a lucky generation costs little: the next one must beat it. The bar goes back to 2 SE once Sphinx clearly beats random play, and always before a Sphinx model could ship. Lucky Cat's bar is unchanged.

The current generation is the last one in `bench/lineages.json`; `--vs` gives another. The stage sizes and sigmas are in `bench/benchmark.json` under `bar`, and the tests hold them to the numbers above.

**What a judgment costs.** About a million hands: some six hours on seven workers. Most candidates stop at the screen, about 40 minutes. `--dry-run` plays every stage at 1/200 of its deals to check the pipeline, and it never promotes.

## The lineages

`bench/lineages.json` holds three lineages:

- **Neural Cat** (`neural-cat`) starts from **NC9** (N14c), pinned as `git:8ffc0d0…:js/mahjong-ml-weights.js`. Neural Cat's models, stacked ones too (Frontier Cat FC1 was one), are judged in it, against its current generation. Its league, for the no-regression stage, is Jorge Yau, Lucky Cat lc32 and NC8.
- **Lucky Cat** starts from **lc32**, pinned as `git:dd881a5:js/mahjong-lucky-cat-weights.js` with its SHA-256. It keeps its win rate (`keepWinRate`).
- **Sphinx** has no generation yet: its first is judged with `--vs` against random play. The Suphx plan it belongs to is cancelled.

```bash
node scripts/ml/bench.js judge nc:ml/models/<name>.json --lineage neural-cat
```

The first judgment on version 2 was Frontier Cat FC1 against NC9: fair play passed, and the screen gave **+6.6 ± 8.1 points a hand** over 10,000 deals (0.8 standard errors), short of the 1 it needs, so it stopped there ([frontier plan](frontier-plan.md#learnings)). The second was round 5's FM5c0: fair play passed, and the screen gave **+3.7 ± 7.9** (0.47 standard errors), with 1.46 ± 0.20 points more of its hands won. It stopped there too.

A generation's model should be pinned by `git:<commit>:<path>` once it ships, so that anyone with the repository can play it again. A local `ml/models/` path works on the machine that trained it, and its SHA-256 says whether it is still the same file.

## Not built yet

- **The lab's keep rule.** The labs still keep models by their own one-judge rule. Running `judge` on what they keep, and shipping only what passes, is the next step, along with wiring `judge` into the lab.
- **The Hugging Face fallback for the pinned files.** They come from git history only.
- **The head-to-head between the lineages**, which waits for Sphinx's first generation.
