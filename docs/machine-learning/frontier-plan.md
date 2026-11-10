# The frontier plan: one model, three heads

Written 2026-11-09. This is the plan for the frontier model: one network that reads the table, picks the hand and values every move, grown from Neural Cat. It replaces the [Suphx plan](suphx-plan.md), which was cancelled the same day as a failed experiment ([why](suphx-plan.md#the-suphx-line-is-cancelled-2026-11-09)). The pipeline this model sits in, and the rules around it, are [the evaluation architecture](../architecture/README.md).

## Contents

- [Where it stands](#where-it-stands)
- [The design](#the-design)
- [The shape](#the-shape)
- [How each layer falls out of a head](#how-each-layer-falls-out-of-a-head)
- [What it learns from](#what-it-learns-from)
- [Why it is simpler](#why-it-is-simpler)
- [What stays outside the model](#what-stays-outside-the-model)
- [Where this is weak](#where-this-is-weak)
- [Making it strong](#making-it-strong)
- [The first step is small](#the-first-step-is-small)
- [How it trains](#how-it-trains)
  - [Where each step runs](#where-each-step-runs)
  - [Caching](#caching)
  - [Pruning](#pruning)
  - [Other frontends](#other-frontends)
- [How it is judged](#how-it-is-judged)
- [Learnings](#learnings)

## Where it stands

| Step ([Making it strong](#making-it-strong)) | State |
| --- | --- |
| **Shipped** | **Frontier Cat FC1** (2026-11-10): the reader, replayed labels, every-seat data. +15.5 ± 2.8 points a hand over the game's NC8, +4.5 ± 2.7 over N14c (shipped beside it as NC9), on 100,000 deals each ([frontier report](frontier-report.md)). Not yet through the bar |
| 1 Start from the champion | Every model starts from N14c, the lab's champion |
| 2 The hand head and the table heads | **Built** (2026-11-09). The hand head names the hand a seat wins with 74% of the time, the rules 64% ([Learnings](#step-2-the-hand-head-and-the-table-heads-2026-11-09)) |
| 3 The read as an input to the move head | **Built** (2026-11-10): the stacked model, in the JS, the C++, the converter and the trainer. Adds nothing measurable on its own ([round 2](#round-2-the-read-as-an-input-step-3-adds-nothing-measurable-2026-11-10)) |
| 4 A wider choice | **Tested** (2026-11-10): best 10 and every discard, neither better than the best 6 ([Learnings](#step-4-a-wider-choice-gains-nothing-2026-11-10)) |
| 5 Replayed labels | **Built** (2026-11-10): better predictions, not yet better play on their own ([round 3](#round-3-replayed-labels-step-5-predict-better-and-dont-play-better-2026-11-10)) |
| 6 Explore in the data | In the data already: the champion explores (temperature 150, a random discard 5% of the time) |
| 7 A mixed table | In the data already: earlier champions, Jorge Yau and Lucky Cat. Recording every seat, not only the learner's, turned out to matter most ([every seat](#the-read-and-the-replays-on-data-that-records-every-seat-2026-11-10)); the native generator records every seat too since 2026-11-10 (byte for byte with the JS), and the round driver does by default |
| 8 Claims and kongs by the same value | As Neural Cat already does (claim margin 0) |
| 9 Train with the check on | Always: the data is played with the contradiction check |
| 10 Seeds | Two or three a recipe, judged on their mean |
| 11 A bigger network | Not run: nothing measured points at size |

This table is a status table only. What each step taught goes in [Learnings](#learnings).

## The design

Decided by the maintainer (2026-11-09): one model, trained to do several layers, in place of a rule set or a model for each. The reason given is that it is easier, and for the model strategies that is right: one training run, one set of weights, one port to the native simulator, one thing to judge.

**This is the new frontier model.** The frontier plan built on Suphx was cancelled the same day as a failed experiment ([the record](suphx-plan.md#the-suphx-line-is-cancelled-2026-11-09)): its critic, its teacher-pushed policy, its from-scratch lineage and its search each failed to pay here. What has worked in this project is Neural Cat: rules propose the moves, and a model trained on how hands actually ended values them. So the one model grows from Neural Cat, generation by generation, and takes from the cancelled plan only what was shown to work: the benchmark and its bar, the native simulator, features v2, and the heads that read the table.

## The shape

```
A. Facts (rules, exact)    tiles seen, legal moves, draws left; for each hand family:
                           steps from ready, live tiles, the faan it would hold

B. One model, three heads  one shared body, read twice a turn
     once for the position (the 14 tiles):
       table head          each opponent: ready or not, the tiles that complete the hand (layer 0)
       hand head           each hand family: the chance to finish, the faan       (layers 1, 2)
     once for each legal move (the tiles left after it), given the hands just picked:
       move head           how the hand ends, the faan won, the faan paid:
                           the expected points of that move                       (layer 3)

C. Check (rules)           the move against the hand head's main hand and backup (layer 4)
```

Five layers become three stages. The hand is read once, from the whole position, and every move is then valued for that hand. That is the difference from today, where each discard is valued against its own best hand. The move head is Neural Cat's head as it is (6 ways the hand ends, 11 classes of faan won, 11 of faan paid), which is the part of this design already proven. `decide()` returns the same record as before: the hand, the backup, the pivot, the moves, the move and `checked`.

## How each layer falls out of a head

| Layer | From |
| --- | --- |
| 0. Table read | The facts, and the table head. Folding stops being a mode decided above the hand: it is the move head choosing a safe tile because the table head says a discard is dear. `mode` is reported afterwards (a fold is a move that sets the hand back while an opponent reads as ready) |
| 1. Hand picker | The hand head. Each family the facts say is still possible gets a chance to finish and a faan; the main hand is the one worth the most (its chance × what its faan pays), the backup the second when it is close |
| 2. Pivot checker | The hand head, a turn apart, and one rule: the seat stays on its hand unless that hand is dead by the facts, or another leads it by a margin. No list of holds and chains. The reason is read off the numbers: **dead** (facts), **hopeless** (its chance fell under a floor), **faster** (the new hand's chance is higher, its faan isn't), **bigger** (its faan is higher) |
| 3. Discarder | The move head, which reads the hand head's output as well as the body. That is the point of doing it in one model: the move is valued knowing the hand, so the hand and the move come from one reading of the position |
| 4. Contradiction check | Rules, as now, against the hand head's main hand and backup. It now catches the model disagreeing with itself, not with a hand a rule set chose for it |
| Claims and kongs | The move head values them with the discards. The hand head is read again with the meld in place, so the coach can say what the claim turns the hand into |

## What it learns from

Every label comes free from simulated games. None is written by hand.

| Head | Label | How good the label is |
| --- | --- | --- |
| Table | The opponents' hidden hands | Exact, on every row. The cancelled plan's heads already learned this (deal-in and ready AUC about 0.90) |
| Hand | For each family: did this seat win the hand as that family, and for how many faan | True but thin: a seat wins about one hand in five, so most rows are all zeros, and rare families have few wins. See [the weak points](#where-this-is-weak) |
| Hand, to start | The hand today's rules pick in that position | Dense, on every row, and only as good as the rules. A warm start that keeps the coach's hand names sensible from the first round; its weight falls as the true label takes over |
| Move | The points the hand ended with for the seat, as a distribution (how it ended, faan won, faan paid, turned into points by the payout table) | Unbiased and noisy, as Neural Cat's is today |

Training plays with the contradiction check on, so the model learns the game it will play ([critique 5](../architecture/README.md#5-the-models-were-trained-without-the-check)).

## Why it is simpler

- **One of everything.** One dataset, one training run, one weights file, one forward pass in JS and one in C++, one parity check. A model for the opponents plus a model for the chance to finish plus a model for the discard, which the layer-by-layer verdicts added up to, is three of each.
- **The hand and the move can't drift apart.** They share a body and the move head reads the hand. With separate layers, every improvement to one is a new chance to disagree with the other, which is the bug this page started from.
- **The pivot rules mostly go.** The four reasons, three holds, the lock and the chains exist because the rule-made values are noisy ([layer 2](../architecture/README.md#layer-2-the-pivot-checker)). A calibrated chance needs one margin.
- **The read gets used.** The cancelled plan's finding was that the heads read the table well and the policy ignored them, because nothing in its loss rewarded acting on the read. A move head trained on how the hand ended, with the table head's output as an input, is rewarded for exactly that.
- **The coach gets more to say, not less.** Lucky Cat gives the coach one share a move. This gives a chance and a faan for every hand, expected points for every move, and a risk for every discard.

## What stays outside the model

One model for the middle, not one model for everything. Three things stay rules, and should not be argued back in:

- **The facts.** Steps from ready, live tiles, legal moves and the faan a hand holds are exact, and networks count badly. They are inputs. This is also what makes the hand head trainable at all: for a rare family it mostly has to learn how a known "steps" and "live tiles" turn into a chance.
- **The check.** An invariant enforced by the thing it constrains is not an invariant. It stays a rule, it stays on for every strategy, and `checked` becomes the measure of how often the model contradicts itself. That number should fall toward zero as training goes on; if it doesn't, the hand head and the move head aren't sharing what they should.
- **Jorge Yau.** He is the rule strategy by definition, and he is also the teacher (the warm-start label) and the fallback when weights fail to load. So the rule-made hand picker doesn't disappear. What changes is its priority: tidying its five places into one is now housekeeping for one strategy, not the main work.

## Where this is weak

1. **Neural Cat's recipe may be near its own ceiling.** It has been through eight shipped generations, and whether more of the same still gains is unmeasured. The steps in [Making it strong](#making-it-strong) that change what the model can learn (valuing every move, less noisy labels, the table read as an input) matter more than the ones that tune it. If those don't gain either, the limit is the body or the inputs, and that is a bigger build.
2. **The hand head's true label is thin and one-sided.** It only ever sees the hand a seat won with. It never sees that a different hand would have been finished from the same tiles, because that hand wasn't played. So it learns "what hands like this usually end as under the policy that played them", which is circular early on. The rules' label breaks the circle at the start; exploration (sometimes playing for the second hand) keeps it broken. Rare families (Thirteen Orphans, Nine Gates, Four Winds) may never have enough wins, and for those the rule formula should stay as the answer until calibration says the head is better.
3. **One model is one point of failure.** A bad round used to cost one layer. Now a regression in the body moves the table read, the hand and the move together, and a play result alone won't say which. Every head needs its own number, judged every round: AUC for the table head, calibration by family for the hand head, points a hand for the move head.
4. **Heads can pull against each other.** Sharing a body helps when the tasks agree and hurts when one loss swamps the others. The loss weights are tuning that didn't exist before. The cancelled plan is a caution here too: adding the table heads didn't hurt, and didn't help play either.
5. **Folding loses its arithmetic.** In the layered design, attack or fold was a comparison the coach could state: this hand expects 40 points, this discard risks 130. Inside a move head it is a number with no parts. The parts are still there (the hand head's value, the table head's risk), so the coach can show them beside the choice, but nothing forces the choice to follow them. Worth checking in review: how often the move head folds when the parts say attack.
6. **It doesn't help Lucky Cat, and it doesn't replace the small fixes.** Lucky Cat's network chooses a move directly and has no value to hang a hand on; it stays as it is. And Neural Cat as shipped still loses points to the contradiction check today. "Keeps" by what a tile does and a round trained with the check on are days of work and worth doing whatever happens here.
7. **The benchmark table is two Neural Cats and Jorge Yau.** A model grown from Neural Cat is judged mostly against its own parent, which it has studied more than any other player. A gain there may not hold against Lucky Cat or a person. Every kept generation is also played head to head against each shipped strategy.

## Making it strong

In the order they should be tried. Each is one change, judged on the benchmark's bar (two standard errors, twice), and each has a point at which it is dropped. The cancelled plan had bars too and ran 54 arms past one; these are meant to be used.

1. **Start from the champion, never from random weights.** Generation 0 is NC8: its weights, its data recipe, its lab. Everything below is added to a model that already wins. Sphinx's 18 rounds showed what starting from nothing costs.
2. **The hand head and the table heads, as extra outputs** ([the first step](#the-first-step-is-small)). No change to play yet. *Dropped if* the hand head can't beat the rules' pick; the table heads are already known to learn.
3. **The picked hands and the table read as inputs to the move head.** This is where the read starts to pay: the value of a discard is learned knowing which opponents are ready and what hand the seat is on. *Bar:* a gain at the table, and `checked` falling.
4. **Value every legal move, not the rules' best three.** Neural Cat today only reorders Jorge Yau's top three, so it can never find a move the rules ranked fourth. Widen in steps (three, five, all), with the rules' rank kept as an input so the model starts from their judgment instead of losing it. It was tried once, with the first model, and failed: choosing among every discard it won 3.5% of hands and dealt in 12% of the time, because it had only ever seen the outcome of the bots' own choices and couldn't tell close discards apart ([Neural Cat](../strategies/neural-cat.md)). So this step is only worth running on data from steps 5 and 6, and may come after them. *Dropped at* the first width that loses.
5. **Less noisy labels, by replaying.** The biggest obstacle in this game is that points double with every faan, so one hand's result says little. For a sample of recorded positions, the native simulator replays the rest of the hand many times with the unseen tiles reshuffled, and the label is the average. The same position then teaches with a fraction of the noise. This uses hidden tiles only to make targets, never inputs, as the fair-play tests require. *Bar:* lower validation loss on held-out single results, then a gain at the table.
6. **Explore in the data.** A share of recorded moves are the second or third choice, played out. Without this the model only ever sees what happened after the move it already liked, and the hand head only sees the hand that was already chosen. This is what breaks the circle in [weak point 2](#where-this-is-weak).
7. **A mixed table for training.** Data from tables of Neural Cat, Jorge Yau, Lucky Cat, earlier generations and itself, so it doesn't learn one opponent. Judged on the frozen benchmark and head to head against each.
8. **Claims and kongs by the same value**, every option including the pass, in place of overruling the rules only when the model's pick is worth more.
9. **Train with the contradiction check on**, always, so the game it learns is the game it plays.
10. **Three seeds an arm.** Sphinx's last rounds showed the round's draw moving a result more than the recipe did. A recipe is kept on the average of its seeds, not its best one. If the phone budget allows, the shipped model is the average of two.
11. **A bigger body, last.** Wider first, a body built around the 34 tile kinds only after that. The cancelled plan designed one and it was never the bottleneck that was measured.

Left out on purpose: a critic that sees hidden tiles, a policy pushed by a teacher, any lineage from random weights, and search. Each failed here once. Search can be asked again when this model's value is clearly better than NC8's.

## The first step is small

Before anything else changes: **add the hand head and the table heads to Neural Cat's network as it stands**, as extra outputs. The body, the inputs and the move head are untouched, so play doesn't change, and it trains on data the lab already makes with three more labels a row (the hand the rules picked, the family the seat won with, the opponents' hands).

One round answers the question this whole section rests on: can a model pick a hand? The test is calibration by family (of the positions where it said 30%, about 30% finished) and whether its main hand beats the rules' pick at naming the hand a seat wins with. If it can't beat the rules there, the hand picker stays rules, the model keeps two heads, and the rest of [Making it strong](#making-it-strong) goes ahead without it.

## How it trains

`npm run ml:frontier -- --rounds 1` (`scripts/ml/frontier-model.js`) runs a round: the champion plays for data, each recipe trains several seeds from the champion, the heads are reported, and the models are screened in stages at the benchmark table. `npm run ml:frontier -- report` lists the rounds so far.

### Where each step runs

| Step | Runs on | Speed |
| --- | --- | --- |
| Playing the deals for data | The native simulator's fast build (`npm run ml:generate -- --native`) | About 500 deals a second on a laptop, against 25 to 34 in JS |
| Fitting the network | PyTorch (`ml/train.py --heads`), on the GPU when there is one | Minutes a model |
| Screens | The native simulator's fast build (`bench.js compare`) | Thousands of deals a minute |
| The bar | The native simulator's exact build (`bench.js judge`) | Hours, so only for a candidate |

**The JS is the reference, not the workhorse.** The native generator plays the same deals with the same random draws as `scripts/ml/generate.js` and writes the same bytes. `npm run ml:generate -- parity` checks that on a short run, and `npm test` runs it whenever the simulator is built. So the data a model learns from is the data the browser's engine would have made, and a model trained on it behaves the same in the game.

### Caching

Every stage writes its result and is skipped when the result is already there, so a round that is stopped picks up where it was, and nothing is computed twice:

- **Data:** a set is done when its `manifest.json` exists. Inside a set, each finished shard keeps a `shard-N.done.json` saying what made it (seeds, weights, pool, settings, game version), and is reused only if that still matches.
- **Weights for the simulator:** each model's `.lcmw` is cached under `native/build/cache/` by the hash of its contents.
- **Models:** a model file that exists is not trained again.
- **Screens:** each stage's result is a JSON file under `ml/fm/screens/`; a stage that has one is read, not replayed.
- **The simulator's own reads:** the threats and the table read are cached for each position, and the plan a seat is committed to is kept with the seat.

### Pruning

- **Staged screens.** A model plays 4,000 deals, then 16,000, then 40,000, on fresh deals each time. After each stage, a model behind the champion by more than one standard error (pooled over the stages so far) is dropped. A losing arm costs 4,000 deals, not 60,000.
- **Recipes, not lucky models.** A recipe is kept on the average of its seeds, and dropped when any seed falls behind. One good draw can't carry a recipe.
- **Only the learner's seats are recorded.** Rows read through the learner's foundation from other players' seats are left out: they doubled the data and were read with a plan memory that wasn't theirs.
- **A sample of positions.** 30% of the learner's discards, and every kong and passed claim.
- **Early stopping.** Training stops after 3 epochs without a better validation loss.
- **Old data.** Sets older than the training window (3 rounds) go to the Trash, never deleted outright. Weights, reports and logs stay.

### Other frontends

The model is a list of matrices and a short forward pass, with nothing tied to JS. [Running the models on another frontend](porting.md) is the contract for a port such as Swift: the weights file, the forward pass, the outputs of each head, and three checks (the network's outputs, the rows, every action of a list of deals) that a port can run against files, with no JS involved.

## How it is judged

- **The frozen benchmark and its bar** carry over from the Suphx plan ([benchmark](benchmark.md)): two standard errors better on 40,000 paired deals, replicated on another 40,000.
- **Head to head against every shipped strategy**, because the benchmark table is mostly Neural Cat ([weak point 7](#where-this-is-weak)).
- **Each head by its own number, every round:** AUC for the table head, calibration by family for the hand head, points a hand for the move head.
- **`checked`**, the share of moves the contradiction check passes over: it should fall as the hand head and the move head come to agree.
- **Points are the reward**; faan (hands won, the average faan of a win, deal-ins) is reported beside them.

## Learnings

One sub-section a step, each entry as a finding, its *Evidence* (numbers, sizes, source), and what *Changed* or stays *Open*. Negative results are kept.

### Step 2: the hand head and the table heads (2026-11-09)

Model FM1a0: NC's body (512, 256) started from N14c, the extra heads at loss weight 0.5, trained on fm-1 (200,000 deals on the native simulator, the champion's own seats, about 2.7 million positions). Judged on 135,600 held-out positions from whole held-out deals.

- **A model can pick a hand, and it picks better than the rules do.**
  - *Evidence:* on the 8,555 held-out positions whose seat went on to win, the hand head named the hand it won with 74.4% of the time. The rules' read of the same tiles (the foundation's best plan) named it 64.1%. The head trained to copy the rules matched them on 99.9% of positions, so the gap isn't the head failing to learn the rules: it learned something they miss.
- **Its chances are calibrated, hand by hand.**
  - *Evidence (the chance it gave to win as each hand, against how often that happened):* half flush 1.42% against 1.37%, full flush 2.38% against 2.43%, all triplets 1.19% against 1.25%, seven pairs 1.26% against 1.32%, thirteen orphans 0.22% against 0.22%. The mean error by bin is under 0.2 points for every hand. AUC 0.82 (plain) to 0.99 (thirteen orphans).
  - Nine Gates had no wins in the data, so its head is untested; the rules' formula stays its answer.
- **The table heads read the opponents.**
  - *Evidence:* an opponent is ready, AUC 0.84 (6.4% of opponent-positions are ready); the tile thrown deals in now, AUC 0.87 (0.45% of throws); a ready opponent's winning tiles, AUC 0.68.
- *Changed:* the first step passed, so the hand stays a head of the model (it doesn't fall back to rules). Whether the heads also make the moves better is the screen's question, below.

### Round 1: the heads don't change play yet (2026-11-10)

Nine models from N14c on fm-1, three recipes of three seeds: a (heads at loss weight 0.5), b (weight 0.2), c (no heads, the control); lr 3e-4, up to 8 epochs. Screened in stages (4,000, 16,000, 40,000 fresh deals) on the native simulator's fast build, each model and N14c in every seat of the same deals at the game's table (the shipped Neural Cat, Jorge Yau, Lucky Cat).

- **No recipe beat the champion, and the heads made no difference either way.**
  - *Evidence (points a hand, model less N14c, 60,000 deals unless dropped):*

    | Recipe | Seed 0 | Seed 1 | Seed 2 | Mean |
    | --- | ---: | ---: | ---: | ---: |
    | a: heads at 0.5 | −1.7 ± 3.8 | −5.4 ± 3.8 | −8.8 ± 6.5 (20,000) | about −4 |
    | b: heads at 0.2 | +1.7 ± 3.8 | +1.3 ± 3.8 | −1.6 ± 3.8 | +0.5 ± 2.2 |
    | c: control | +0.0 ± 3.7 | +1.1 ± 3.7 | −4.9 ± 3.7 | −1.3 ± 2.1 |

  - b and c are within a standard error of each other and of zero. As expected: the heads are outputs only, and the move is still chosen by the same 28 outputs, so a better read can't change a move until the move head reads it (step 3).
  - The heavier head weight (a) may cost a little, by pulling the shared body away from the move value. It is within the noise.
- **Fine-tuning on one round of the champion's own seats moved every model toward bigger, rarer wins, heads or not.**
  - *Evidence (the third stage, model against N14c):* hands won 15.5 to 16.5% against 17.4%; deal-ins 11.8 to 12.6% against 11.7%; average win 908 to 1,017 points against 906; average faan 6.17 to 6.30 against 5.77. The control shows it as much as the head recipes.
  - The likely cause is the data, not the heads: N14c learned from 12 rounds of every seat, these from one round of its own exploring seats (temperature 150, epsilon 0.05). Exploring wins are fewer and bigger, and one round is all the model saw.
  - *Open:* more rounds in the window (the driver keeps 3), or a lower learning rate, should pull it back. Measured on round 2.
- **The screen's pruning worked, and one of its rules is too strict.**
  - *Evidence:* a model costs about 2.5 minutes at stage 2 and 5.5 at stage 3 on 8 cores; dropping 3 of the 9 saved about 20 minutes of a 72-minute round. 4,000-deal stages are ±14 points, so the leads at stage 1 (up to +22.7) were all luck.
  - *Changed:* a recipe was dropped when any one seed fell behind. With margins of ±3.8 a seed falls behind by chance about one time in six, so that rule drops good recipes. A recipe is now judged on the mean of its seeds, every seed played through.
- **The frozen benchmark can't run natively any more.** Its players are game 0.57.9; the native port has moved on (the contradiction check), so `bench.js compare` falls back to JS, which takes hours a screen. *Changed:* the round's screens play at the game's table on the native simulator; the frozen table stays for the bar (`bench.js judge`).

### Round 3: replayed labels (step 5) predict better and don't play better (2026-11-10)

fm-3: 100,000 deals on the native simulator, a quarter of the champion's recorded discards replayed 8 times after the hand with the wall shuffled (336,000 replayed rows of 1,341,000). Three recipes of two seeds from N14c, on fm-2 and fm-3, lr 1e-4, up to 4 epochs: p (replayed labels), q (replayed labels and the reader), c (the same rows, real endings only).

- **Replays built, and the first version was biased.**
  - *Evidence (861 replayed rows, 8 replays each):* shuffling the other players' hands as well as the wall gave them random hands, which won far less than the hands they held: the replays dealt in 4.9% of the time against 12.2% in the real endings of the same rows, and drew 61% against 46%. Shuffling only the wall (every hand kept as it was) brought them in line: 9.7% deal-ins against 12.5%, 41.9% draws against 46.6%; the replays' learner plays its best, without exploring, so it deals in a little less.
  - The replays carry real information about the ending: they give the real outcome 41% of their weight on average, against 29% from the base rates.
  - *Changed:* replays shuffle the wall only. The hidden hands are used for labels only, never as inputs: a target conditioned on more than the seat can see is still an unbiased target for what it can see, with less noise.
- **The labels help the network predict, as intended.**
  - *Evidence (validation loss on the real endings of held-out deals):* p 3.0641 and 3.0642, q 3.0636 and 3.0638, c 3.0656 and 3.0658. The gain is 5 times the spread between seeds, and the reader added a little more on top of the replays (the first time it helped anything).
  - Every model kept improving through 4 epochs at lr 1e-4, where at 3e-4 on one round they were best after 1.
- **But they don't play better.**
  - *Evidence (points a hand against N14c, each seat at stage 3 over 60,000 deals, the others dropped at 20,000):* p −6.2 and −6.2 (dropped); q −8.1 (dropped), −1.7 ± 3.6; c −2.1 ± 3.5, −10.9 (dropped). By recipe: p −6.2 ± 4.4, q −4.9 ± 3.6, c −6.5 ± 3.6.
- **Why, as far as the evidence goes: the data, not the labels.** No model trained on frontier data has beaten N14c, and as a group they were behind it, the controls as much as anything (rounds 1 to 3, 24 models; by recipe from +0.5 to −26.0 points a hand). Frontier data records only the champion's own seats, and only the discard it chose. The network is asked to score the best 6 options, most of which the champion doesn't choose, and on those it has seen little. N14c's data recorded every seat at the table (Jorge Yau's, Lucky Cat's, earlier models'), so it saw the positions other choices lead to. Recording only the learner's seats was meant to prune the data; it pruned what the value needs.
  - *Changed:* the next test trains on data that records every seat (below), and the native generator should record every seat, as the JS generator's default does.

### The read and the replays on data that records every seat (2026-11-10)

The lab's last two data sets (lab-15 and lab-16, 1.1 million positions from every seat, played by N14c's lab after N14c was trained, so new to it), each recipe two seeds from N14c at lr 1e-4: s (the reader), c (the control), q (the reader, with fm-3's replayed rows added).

- **The read adds nothing here either.**
  - *Evidence (validation loss on lab-15 and lab-16's held-out deals):* s 2.8268 and 2.8265, c 2.8269 and 2.8267. q 2.9738 is on a different validation set (fm-3's rows included) and doesn't compare.
- **Every model is level with N14c, where every frontier-data model was behind.**
  - *Evidence (points a hand against N14c, 20,000 fresh deals each at the game's table):* s +1.3 and −4.7; c +2.9 and −3.2; q −1.5 and +0.1 (each ± 5.4 to 6.0). By recipe: s −1.7, c −0.2, q −0.7, each about ± 3.9.
  - They deal in less than the frontier-data models did (11.2 to 11.7% against N14c's 11.6%, where frontier data gave 11.8 to 12.6%), and they win as often (17.4 to 17.8% against 17.5%).
  - With fm-3's replayed rows in (q), the wins are bigger (6.0 faan against 5.76) for the same hands won.
- *Changed:* the data hypothesis holds: recording every seat keeps the value from drifting. FLq1 (the reader, replayed labels, every-seat data) ships as Frontier Cat FC1, for play and review, as the whole new architecture in one model ([frontier report](frontier-report.md)).
- *Open:* nothing tried overnight beats N14c. What the evidence points to next is in [the report](frontier-report.md#what-comes-next).

### Step 4: a wider choice gains nothing (2026-11-10)

N14c, the champion, scores Jorge Yau's best 6 discards (its `meta.play.topK`). The same weights scoring his best 10, and every legal discard, each against N14c on 40,000 fresh deals at the game's table (the native simulator):

- **Neither is better, and both deal in more.**
  - *Evidence:* best 10: +2.2 ± 3.5 points a hand; hands won 16.8% against 17.5%, deal-ins 12.8% against 11.7%, average win 976 against 897 points. Every discard: +0.8 ± 3.6; hands won 17.6% against 17.5%, deal-ins 12.9% against 11.7%, average win 925 against 897.
  - A wider choice lets a noisy value pick a tile the rules would have kept back, and the tiles it picks are riskier. This is what the first Neural Cat found choosing among every discard (3.5% of hands won, 12% deal-ins), now much smaller because the values are better.
- *Changed:* the choice stays at the best 6. The plan put this step after the labels get less noisy (step 5); it is worth trying again on a model trained on replayed labels.

### Round 2: the read as an input (step 3) adds nothing measurable (2026-11-10)

The stacked model: the reader (FM1b0's heads, frozen) reads the 568 features and gives 16 numbers (each opponent ready, the tile thrown deals in now, the hand it wins with), and the move network reads the 568 and the 16. It starts as N14c with zero weights on the 16, so it plays exactly as N14c until training moves them. Trained on fm-2 alone (200,000 fresh deals), so the reader's read of those rows is as honest as in play (it learned from fm-1). Three recipes of three seeds: s (stacked, lr 3e-4), t (stacked, lr 1e-3), c (the same rows, no reader).

- **The read doesn't help the move network predict how the hand ends.**
  - *Evidence (validation loss on fm-2's held-out deals):* stacked 3.0712 to 3.0718 (lr 3e-4), control 3.0715 to 3.0723. Outcome accuracy 52.1 to 52.2% in both. The difference is a twentieth of the spread between seeds.
  - The likely reason is information, not training: the read is a function of the same 568 features, and N14c's body already extracts what they say about threats (its features include a hand-made threat read for each opponent). A second network's read can only help if it learned something the move network can't learn from the endings, and at this data size it doesn't.
- **And it doesn't change play.**
  - *Evidence (stage 1, 4,000 deals):* every model behind N14c, the control as much as the stacked ones: s −9.9, −20.0, −18.4; t −26.6, −17.5, −34.0; c −6.3, −18.2, −1.7. The best of each over 60,000 deals: stacked FM2s0 −3.9 ± 3.6, control FM2c2 −4.5 ± 3.7. By recipe (every seed, each at the stage it was dropped): s −14.1 ± 6.9, t −26.0 ± 8.8, c −10.0 ± 5.4.
  - The faster rate (t) was worst in every seed.
- **Training on one round of the champion's own seats moves it backwards.**
  - *Evidence:* every model's best validation loss was at epoch 1 (later epochs were worse), and every one played worse than N14c, which learned from 12 rounds of every seat. Round 1 showed the same drift (fewer, bigger wins) at a smaller cost.
  - *Changed:* the next recipes train on the whole window (3 rounds) at a gentler rate (1e-4).
- **A change to a pinned file stops every native run that starts after it.**
  - *Evidence:* adding the coach's read to `js/mahjong-ml.js` unpinned it, and the round's next screen refused to run (the native port no longer provably matched the JS). The parity check passed unchanged and the pin was renewed; the round resumed from its cached stages.
  - *Changed:* pin again (after the parity check) in the same step as any edit to a pinned file while rounds run.

