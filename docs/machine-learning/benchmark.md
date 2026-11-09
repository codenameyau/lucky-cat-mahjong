# The frontier benchmark

How strong a model is, as one number anyone can reproduce, and the bar a model must clear to become the next generation of its lineage. This is phase 0 of the [frontier plan](frontier-plan.md) (§9), built in `scripts/ml/bench.js`, with the benchmark pinned in `bench/`.

## The table, frozen

The benchmark is named **hk-table-v1**. It is defined in `bench/benchmark.json` and never edited: a new table gets a new name, and every model is scored again on it.

- **Who plays.** The model being scored takes one seat. The other three are frozen copies of **Neural Cat NC8** (N10c, fast), **Jorge Yau** and NC8 again, as they were at game version 0.57.9, which is commit `dd881a5`. The model takes every seat in turn on every deal. The frozen players don't follow the game: when Neural Cat ships NC9, the benchmark's Neural Cat stays NC8.
- **How they are frozen.** `bench/benchmark.json` pins eight files at that commit by SHA-256:
  - Neural Cat's weights;
  - the code both players run (`mahjong-ml.js` and its features and model, `mahjong-jorge-yau.js`, `mahjong-bot.js`);
  - the engine and points rules they call.
  
  `bench.js` reads the files out of git history into `ml/bench/git/`, checks every hash, and loads the players from there. So nothing large is committed, and a full clone is needed (CI fetches the whole history for this). The model being scored uses today's engine and code.
- **The fingerprint.** The frozen players play 24 deals alone, on today's engine, from the first seeds of the deck. The hash of how every hand ended must match the one recorded when the benchmark was frozen. If an engine change alters how a hand plays or scores, the fingerprint no longer matches, and every command refuses to score until a new benchmark version is frozen. Scores from two versions never mix.
- **The deck.** 40,000 deals, seeds 900,000,000 to 900,039,999, with the dealer rotating. No training data or lab evaluation uses nine-digit seeds. The plan first named 90,000,000, but the Only Orphans lab ranks its models on those seeds, so the deck moved.

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

**Sequential stopping** (plan §6). Qualify and replicate play in blocks of 10,000 deals. After a block, they stop early if the gap is already at least 4 standard errors (a pass: twice the bar) or at most 0 (a fail: a gap that still needs to reach +2 standard errors with three quarters of the deals to come). The thresholds sit far outside the bar, so stopping early rarely changes the verdict a full run would give, and a clear case costs a quarter of the deals.

The current generation is the last one in `bench/lineages.json`; `--vs` gives another. The stage sizes and sigmas are in `bench/benchmark.json` under `bar`, and the tests hold them to the numbers above.

**What a judgment costs.** About a million hands: some six hours on seven workers. Most candidates stop at the screen, about 40 minutes. `--dry-run` plays every stage at 1/200 of its deals to check the pipeline, and it never promotes.

## The lineages

`bench/lineages.json` holds both lineages of the plan:

- **Lucky Cat** starts from **lc32**, pinned as `git:dd881a5:js/mahjong-lucky-cat-weights.js` with its SHA-256. It keeps its win rate (`keepWinRate`).
- **Sphinx** has no generation yet: its first is judged with `--vs` against random play.

A generation's model should be pinned by `git:<commit>:<path>` once it ships, so that anyone with the repository can play it again. A local `ml/models/` path works on the machine that trained it, and its SHA-256 says whether it is still the same file.

## Not built yet

- **The lab's keep rule.** The labs still keep models by their own one-judge rule. Running `judge` on what they keep, and shipping only what passes, is the next step, along with wiring `judge` into the lab.
- **The Hugging Face fallback for the pinned files.** They come from git history only.
- **The head-to-head between the lineages**, which waits for Sphinx's first generation.
