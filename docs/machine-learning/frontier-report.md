# The frontier report: the stacked evaluation architecture against the previous one

Written 2026-11-10, after one night of building and training. It compares the new frontier model, **Frontier Cat FC1** (the stacked evaluation architecture of the [frontier plan](frontier-plan.md)), with the previous architecture, **Neural Cat**, as it plays in the game (NC8) and at its best (the lab's champion N14c, which ships in the same change as NC9). Every round, with its evidence, is in the plan's [Learnings](frontier-plan.md#learnings); the model's story is in [iterations](iterations.md#frontier-cat-one-model-three-heads-fc1).

> **A past report (2026-11-11).** FC1 folded into Neural Cat in 0.59.0, and the [frontier plan](frontier-plan.md) is no longer the current approach: each model is now trained against older models of its own lineage only ([training](training.md#training-a-lineage-against-its-own-past)), and the game plays Neural Cat NC10. "What comes next" and "What ships" below are as they were then.

## Contents

- [In short](#in-short)
- [The two architectures](#the-two-architectures)
- [Head to head](#head-to-head)
- [What each step added](#what-each-step-added)
- [The reads](#the-reads)
- [What it costs](#what-it-costs)
- [How it was measured](#how-it-was-measured)
- [What went wrong, and what it taught](#what-went-wrong-and-what-it-taught)
- [What comes next](#what-comes-next)
- [What ships](#what-ships)
- [Reproducing it](#reproducing-it)

## In short

- **Against the Neural Cat in the game (NC8), Frontier Cat is clearly better:** +15.5 ± 2.8 points a hand over 100,000 deals (5.5 standard errors). It wins more often (17.4% of hands against 16.8%) and its wins are bigger (939 points against 879; 6.00 faan against 5.71).
- **Against the best of the previous architecture (N14c), it is ahead but not proven:** +4.5 ± 2.7 points a hand (1.7 standard errors). It wins as often, deals in a little less (11.6% against 11.8%), and wins bigger (6.00 faan against 5.77). The bar for a new generation is two standard errors, twice; this is short of it.
- **Most of the gain over NC8 is N14c's**, a better model of the previous architecture that the lab trained and never shipped: N14c beats NC8 by +11.6 ± 2.8. It ships as Neural Cat NC9 in the same change.
- **The parts, measured one at a time:** the read as an input added nothing measurable on its own; replayed labels made the network predict the endings better; and the data mattered most of all. Recording only the champion's own seats pulled every model backwards, and recording every seat, as the lab does, put them back level.
- **The pipeline is the lasting gain.** Training data is now made on the native simulator about 15 times faster than in JS and checked byte for byte against the JS. Stages are cached, and losing arms are dropped early. Any frontend can run the model from a written contract.

## The two architectures

**Previous: Neural Cat.** The rules propose, one network scores.

```
Jorge Yau's foundation: every discard, read (steps from ready, live tiles, plan, risk)
  -> the best 6 options -> 568 features each
  -> one network (568 -> 512 -> 256 -> 28): how the hand ends, the faan won, the faan paid
  -> expected points + a bonus for the chance to win -> the best option
  -> the contradiction check
```

**New: Frontier Cat, the stacked evaluation architecture.** The same options and features, read first, then scored with the read.

```
Jorge Yau's foundation -> the best 6 options -> 568 features each
  -> the reader (568 -> 512 -> 256 -> 158): each opponent ready, the tile deals in now,
     the hand it wins with, each opponent's waits      (trained with the hidden tiles as answers)
  -> the read: 16 numbers (ready x 3, deals in now, the hand it wins with x 12)
  -> the move network (584 -> 512 -> 256 -> 28): the 568 features and the read
  -> expected points + a bonus for the chance to win -> the best option
  -> the contradiction check
```

The move network is trained on replayed labels (each recorded discard played on 8 times with the wall shuffled, so its target is how the hand tends to end, not how it happened to) and on data that records every seat at the table.

## Head to head

100,000 fresh deals each, at the game's table (Neural Cat NC8, Jorge Yau and Lucky Cat lc32). Both models take every seat of the same deals, and the gap is taken deal by deal. Played on the native simulator's fast build.

| Pair | Points a hand, the first less the second |
| --- | ---: |
| **Frontier Cat FC1** less **Neural Cat NC8** (the game's) | **+15.5 ± 2.8** |
| **Frontier Cat FC1** less **N14c** (the lab's best, NC9) | **+4.5 ± 2.7** |
| N14c less NC8 | +11.6 ± 2.8 |

How each plays, from the same matches:

| | Frontier Cat FC1 | N14c (NC9) | NC8 |
| --- | ---: | ---: | ---: |
| Points a hand | 68.5 | 63.9 | 53.0 |
| Hands won | 17.4% | 17.4% | 16.8% |
| Deal-ins | 11.6% | 11.8% | 11.5% |
| Average win | 939 points | 896 to 908 points | 869 to 879 points |
| Average faan of a win | 6.00 | 5.77 | 5.70 to 5.71 |
| Wins by self-draw | 29.5% | 29.4 to 29.6% | 30.5 to 30.8% |

Where a cell has a range, the model played in two matches.

**What Frontier Cat does differently:** it wins as often as N14c, and its wins are about a quarter of a faan bigger. The bigger wins come with the replayed labels: the models trained with them won at 5.97 to 6.00 faan, and those without at 5.72 to 5.73, on the same deals. It deals in slightly less than N14c.

## What each step added

Each step against N14c, the champion every model started from. The networks are compared by validation loss on the real endings of held-out deals (lower is better, within one data set) and at the table.

| Step | What was tried | Prediction | Play against N14c | Verdict |
| --- | --- | --- | --- | --- |
| 2 The hand and table heads | Extra outputs on N14c's network (round 1) | The reads are good (below) | heads +0.5 ± 2.2; control −1.3 ± 2.1 | Kept: the read is the reader's |
| 3 The read as an input | The stacked model (round 2, and again on lab data) | No better than the control: 3.0712–3.0718 against 3.0715–3.0723; on lab data 2.8265–2.8268 against 2.8267–2.8269 | stacked −3.9 ± 3.6; control −4.5 ± 3.7 (best of each) | Adds nothing measurable alone |
| 4 A wider choice | Best 10 options, and every option, in place of 6 | (same weights) | +2.2 ± 3.5 and +0.8 ± 3.6, with about 1 point more deal-ins | Not kept: the choice stays at 6 |
| 5 Replayed labels | 8 replays of a quarter of the discards (round 3) | Better: 3.0641–3.0642 against 3.0656–3.0658; with the read too, 3.0636–3.0638 | −4.9 ± 3.6 (with the read) against −6.5 ± 3.6 (control), by recipe | Better predictions, not yet better play |
| 5 again, every seat | Replays on fresh every-seat data (round 4, 150,000 deals) | Better: 3.1090–3.1092, with the read 3.1086–3.1087, against 3.1111–3.1116 | replays +0.6 ± 2.4, with the read +0.7 ± 2.4, control +2.1 ± 2.4 | Level; replays still help prediction, not play |
| 5, 6 Option replays, a ranking loss | Every option weighed played on 12 times (round 5), the ranking loss, a wider body, the reader FR1 | Option values: 3.1064–3.1066 against 3.1054–3.1055 | ranking loss −44.7 ± 9.4, with the reader −44.4 ± 9.4, wider −18.4 ± 7.4, option values +1.7 ± 2.4, control **+6.8 ± 2.4** | The ranking loss breaks a fine-tuned value; the control (two rounds of every-seat data) is a candidate |
| Every seat recorded | The lab's data in place of the frontier's | (different data) | level: −1.5 to +2.9 ± about 5.5 | The fix for the drift |
| All together (FC1) | The reader, replayed labels, every-seat data | | +4.5 ± 2.7 over 100,000 deals | Ships as Frontier Cat, for play and review |

Not run: step 11, a bigger network. Each step so far changed what the network learns from rather than how much it can hold, and nothing measured pointed at its size.

## The reads

The reader is FM1b0, trained in round 1 with the hidden tiles as answers. On 135,600 positions from deals it never saw:

| Read | How good |
| --- | --- |
| The hand a seat goes on to win with | Named right 74.0% of the time; the rules' own read of the same tiles, 64.1% |
| The chance of winning as each hand | Calibrated: Half Flush said 1.43%, happened 1.37%; Full Flush 2.51% and 2.43%; All Triplets 1.25% and 1.25%; Seven Pairs 1.29% and 1.32%; Thirteen Orphans 0.24% and 0.22% |
| An opponent is ready | AUC 0.83 (6% of opponent-positions are ready) |
| The tile thrown deals in now | AUC 0.83 (0.45% of throws) |
| A ready opponent's winning tiles | AUC 0.62 |

AUC is the chance that a random positive is rated above a random negative: 0.5 is a coin flip, 1.0 is perfect. Nine Gates had no wins in the data, so its read is untested.

The reads are good and the move network gains little from them. Most of what they say is already in the features: the 568 include a hand-made threat read of each opponent, and N14c's network had learned to use it. The coach uses the reads at Complex, where they are the most direct thing it can say about the table ([stacked models](../strategies/neural-cat.md#stacked-models)).

## What it costs

| | Frontier Cat FC1 | Neural Cat NC9 |
| --- | --- | --- |
| One option scored, in the browser's JS | 0.36 ms | 0.13 ms |
| A turn (6 options) | about 2 ms | under 1 ms |
| Weights file | 2.4 MB (`js/mahjong-frontier-weights.js`) | 1.1 MB |
| Weights | about 900,000 (the reader's 460,000 and the move network's 440,000) | about 430,000 |

The weights load with the game's other weights (`loadAssets`), after the menu, and are kept offline with the rest.

Training, on a laptop (8 cores, Apple GPU):

| Step | Time |
| --- | --- |
| 200,000 deals of data, on the native simulator | about 4 minutes (about 500 deals a second; the JS makes 25 to 34) |
| 100,000 deals with replays (a quarter of the discards, 8 replays each) | about 54 minutes, sharing the CPU with screens |
| One model, 2 to 3 million positions, 4 epochs | about 5 to 6 minutes |
| A screen of 4,000 / 16,000 / 40,000 deals | about 0.7 / 2.5 / 6 minutes |
| A 100,000-deal head to head | about 17 minutes |

## How it was measured

- **Paired deals.** Both models play every seat of the same deals against the same three players, so luck in the deal cancels and the gap's standard error is taken deal by deal.
- **Fresh deals** for every match, never the benchmark's deck, and never the deals a model trained on.
- **The game's table**, not the frozen benchmark. The frozen benchmark's players are game 0.57.9; the native port has moved on since (the contradiction check), so the benchmark only runs in JS, where 100,000 deals would take most of a day. A JS run on the frozen table is in [the frozen benchmark](#the-frozen-benchmark) below. The bar for a new generation (`bench.js judge`, two standard errors twice on the exact build) still runs on the frozen table and has not been run for FC1.
- **The fast build.** It differs from the exact build (which plays as the JS does, bit for bit) only in the last bits of the network's sums, so a near tie can go the other way; a screen and a judgment can differ by a little for that reason.
- **The JS is the reference.** The native simulator writes the JS generator's training rows byte for byte (checked on 1,000 deals, and on 12 in every `npm test`), and plays every action of the stacked model as the JS does (60 hands, 9,514 actions). PyTorch and the JS give the same outputs to within 0.000003.
- **Seeds.** Each recipe trained two or three models from different seeds and was judged on their mean, because one screen moves by several points on luck alone.

### The frozen benchmark

FC1 against N14c on the frozen table (Neural Cat NC8, Jorge Yau, NC8, all at game 0.57.9), 8,000 fresh deals, in JS (`bench.js compare`, about 25 minutes on 8 workers):

| | Points a hand | Hands won | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: |
| FC1 | +21.5 ± 8.5 | 16.0% | 9.7% | 937 points, 6.01 faan |
| N14c | +25.4 ± 8.6 | 16.2% | 9.7% | 951 points, 5.77 faan |
| FC1 less N14c | **−4.0 ± 10.3** | | | |

It's a sanity check, not a verdict: at ± 10 points it can't tell a gap of 5 either way. The style matches the native matches (FC1's wins about a quarter of a faan bigger), and nothing is broken on the frozen table.

## What went wrong, and what it taught

- **Recording only the learner's seats pruned what the value needs.** It halved the data, and it left the network unable to score the options the champion doesn't choose. Those are most of the 6 it is asked to score. Of the twenty-four models trained that way, none beat N14c, and as a group they were behind it (by recipe, from +0.5 to −26.0 points a hand), the controls as much as the experiments. The lab's data, which records every seat, put them level.
- **One round of data at the usual rate moves the champion backwards.** Every model fine-tuned on one round was best after a single epoch. A gentler rate (1e-4) on two or more rounds kept improving through four.
- **The first replays were biased.** Shuffling the other players' hands as well as the wall gave them random hands, and the replays dealt in 4.9% of the time against 12.2% really. Shuffling only the wall, and keeping every hand as it was, made them match.
- **A better loss isn't a better player.** Replayed labels lowered the validation loss by five times the spread between seeds, and the models still played no better. The loss scores the option played; the table scores the choice among six.
- **Editing a pinned file stops the native runs.** The native simulator refuses to stand in for the JS when a pinned JS file has changed since its last parity check. Adding the coach's read to `js/mahjong-ml.js` stalled a round's screens until the parity check was run again and the port re-pinned.
- **Memory.** Three rounds of data (8 GB) pushed the laptop into 7 GB of swap, and training slowed by half. Two rounds fit.

## What comes next

In the order the evidence points:

1. **Done: a round on every-seat data, with replays (round 4).** The native generator now records every seat, so round 4 tested replayed labels on 150,000 fresh deals of every-seat data. Every model came out level with N14c (+0.6, +0.7 and +2.1 ± 2.4 by recipe, the control best), so recording every seat fixed the drift, and the replays again helped prediction but not play. FC1 stays. The [frontier plan](frontier-plan.md#round-4-replayed-labels-on-fresh-every-seat-data-2026-11-10) has the details, and a ranking loss over the options of one position is the next idea it names.

   ```bash
   npm run ml:frontier -- --rounds 1 --recipes replay --replays 8 --deals 150000 --seeds 2 --window 1 --keep 2 --reader ml/models/FM1b0.heads.json
   ```
2. **Judge FC1 against the bar** (`bench.js judge`) once the frozen table can run natively again, or overnight in JS. At +4.5 ± 2.7 it would need about four times the deals to settle whether it is really ahead.
3. **Retrain the reader on every-seat data.** It learned on round 1's learner-only data. Its reads were good, but the move network may trust a reader trained on the positions it scores more.
4. **Replays for claims and kongs.** Only discards are replayed now, and the networks' claim choices are where Frontier Cat and N14c might differ most.
5. **A bigger network, last.** Nothing measured points at size yet.

## What ships

**Since then (0.59.0):** Frontier Cat folded into Neural Cat's lineage. It chooses as Neural Cat does (Jorge Yau's best options, scored in expected points), so a stacked model now ships as Neural Cat once it clears the bar, and FC1 didn't: on the [benchmark](benchmark.md) (version 2, which runs natively) its screen against NC9 was +6.6 ± 8.1 points a hand, short of 1 standard error. The stacked evaluation goes on in Neural Cat's rounds, and, self-taught, as Lucky Cat's new lineage ([Lucky Cat](../strategies/lucky-cat.md#the-value)). Shipped in 0.58.0:

- **Frontier Cat FC1** (`frontier-cat`, `js/mahjong-frontier-weights.js`), on the Strategies sheet after Neural Cat, for a seat or the coach. It is a new strategy and replaces nothing.
- **Neural Cat NC9** (the lab's N14c), in place of NC8. It is the previous architecture's best, +11.6 ± 2.8 points a hand over NC8, and the fair point of comparison for Frontier Cat in the game. It is its own commit, so it can be left out on its own.
- **The coach** says Frontier Cat's reads at Complex: who it reads as ready, a tile's chance to win someone the hand right now, and the hand it expects to win with.

Neither model has passed the frozen benchmark's bar; both are shipped for play and review. Hugging Face is not updated.

## Reproducing it

```bash
make -C native
```

```bash
npm run ml:generate -- parity --deals 200
```

```bash
npm run ml:frontier -- --rounds 1 --recipes replay --replays 8 --deals 100000 --seeds 2 --window 2 --reader ml/models/FM1b0.heads.json
```

```bash
node scripts/ml/frontier-report.js --pairs nc:ml/models/FLq1.json~nc:ml/models/N14c.json,nc:ml/models/FLq1.json~neural-cat --deals 100000 --seed 980000000
```

FC1 itself was trained outside the round driver, on data the driver doesn't make yet (every seat recorded):

```bash
ml/.venv/bin/python ml/train.py --data ml/data/lab-15 ml/data/lab-16 ml/data/fm-3 --name FLq1 --reader ml/models/FM1b0.heads.json --replay --init ml/models/N14c.json --hidden 512,256 --seed 1 --lr 1e-4 --epochs 4 --patience 3
```

It then took N14c's play settings (`meta.play`: the best 6 options, a win bonus of 300) and was shipped with `node scripts/ml/ship.js ml/models/FLq1.json frontier-cat`. The match results are kept in `ml/fm/report/`, each round's log in `ml/fm/fm.log`.
