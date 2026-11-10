# The evaluation architecture (proposed)

A design, not built yet (written 2026-11-09, revised the same day after a critical pass). One pipeline that every strategy, every model and the coach run for every decision: read the table, pick the hand, decide whether to pivot, choose the move, and check the move against the hand. It replaces five overlapping ways of choosing a hand and four of leaving one.

**Simplified on 2026-11-09 (maintainer's decision): one model does the middle of the pipeline, and it is the new frontier model.** The Suphx-based frontier plan is cancelled as a failed experiment ([why](../machine-learning/frontier-plan.md#the-suphx-line-is-cancelled-2026-11-09)). The five layers below are still the five jobs, but a model strategy no longer has a rule set or a model for each. One network with three heads reads the table, picks the hand and values the moves; exact rules feed it facts and check its move. That design is [One model for the middle](#one-model-for-the-middle), and where it and the layer-by-layer text disagree, it wins.

This page also says where the design is weak, which layers should be rules and which a model, and what has to be measured before any of it is built. Two things in the first draft were wrong and are corrected here: that choosing the hand before the model chooses would by itself return Neural Cat's loss ([it won't](#1-masking-before-the-model-is-not-a-fix-by-itself)), and that the pipeline should hold exactly one hand ([it should hold two](#2-one-hand-is-too-few-early-in-the-hand)).

## Contents

- [Why](#why)
- [The reward: points](#the-reward-points)
- [One model for the middle](#one-model-for-the-middle)
  - [The shape](#the-shape)
  - [How each layer falls out of a head](#how-each-layer-falls-out-of-a-head)
  - [What it learns from](#what-it-learns-from)
  - [Why it is simpler](#why-it-is-simpler)
  - [What stays outside the model](#what-stays-outside-the-model)
  - [Where this is weak](#where-this-is-weak)
  - [Making it strong](#making-it-strong)
  - [The first step is small](#the-first-step-is-small)
- [How a decision is made today](#how-a-decision-is-made-today)
  - [Where each layer's work lives now](#where-each-layers-work-lives-now)
- [The pipeline](#the-pipeline)
  - [Layer 0: the table read](#layer-0-the-table-read)
  - [Layer 1: the hand picker](#layer-1-the-hand-picker)
  - [Layer 2: the pivot checker](#layer-2-the-pivot-checker)
  - [Layer 3: the discarder](#layer-3-the-discarder)
  - [Layer 4: the contradiction check](#layer-4-the-contradiction-check)
- [Rules or a model, layer by layer](#rules-or-a-model-layer-by-layer)
- [Critique: where this design is weak](#critique-where-this-design-is-weak)
  - [1. Masking before the model is not a fix by itself](#1-masking-before-the-model-is-not-a-fix-by-itself)
  - [2. One hand is too few early in the hand](#2-one-hand-is-too-few-early-in-the-hand)
  - [3. "Keeps" is too coarse](#3-keeps-is-too-coarse)
  - [4. Everything rests on a chance nobody has checked](#4-everything-rests-on-a-chance-nobody-has-checked)
  - [5. The models were trained without the check](#5-the-models-were-trained-without-the-check)
  - [6. Three stages of refactoring before any proof](#6-three-stages-of-refactoring-before-any-proof)
  - [7. "Worth the most" is the wrong target if it means faan](#7-worth-the-most-is-the-wrong-target-if-it-means-faan)
- [Claims and kongs](#claims-and-kongs)
- [Each strategy in the pipeline](#each-strategy-in-the-pipeline)
- [The coach](#the-coach)
- [State](#state)
- [Training and the native simulator](#training-and-the-native-simulator)
- [Building it: measure, then experiment, then refactor](#building-it-measure-then-experiment-then-refactor)
- [How it will be judged](#how-it-will-be-judged)
- [Open questions](#open-questions)

## Why

The coach said "Go for Half Flush in Characters" and threw a Character with a Bamboo in hand. The [contradiction check](../strategies/README.md#the-contradiction-check) (0.57.25) now stops that: a move that goes against the hand it builds toward gives way to the strategy's next choice. Measured head to head on 20,000 deals ([iterations](../machine-learning/iterations.md#head-to-head-with-the-check-against-without-it)), it gains Jorge Yau about 8 to 10 points a hand and Lucky Cat 12 to 14, and costs Neural Cat 9 to 16.

The contradiction is a symptom. No layer picks a hand for the turn: each possible discard is scored against the best hand for the tiles left after it, so a discard can always disagree with "the hand". The check stays on for every strategy and model by decision. This design is about making it rarely needed, and about finding out why it costs Neural Cat points, which is not yet known.

## The reward: points

Decided by the maintainer (2026-11-09): **models are trained toward points**, on this game's payout table, as they have been. An earlier revision of this page made faan (capped at 13) the reward; that is withdrawn. The hand picker ranks hands by expected points, a model that scores predicts expected points, the lab's objective and the frontier's Table Score stay as they are, and a change is kept or rejected on points a hand.

Faan is still worth reporting beside points in every benchmark: hands won, the average faan of a win, and deal-ins say how a player got its points, and a faan total is the one number that would carry to a house with a different payout table.

## One model for the middle

Decided by the maintainer (2026-11-09): one model, trained to do several layers, in place of a rule set or a model for each. The reason given is that it is easier, and for the model strategies that is right: one training run, one set of weights, one port to the native simulator, one thing to judge.

**This is the new frontier model.** The frontier plan built on Suphx was cancelled the same day as a failed experiment ([the record](../machine-learning/frontier-plan.md#the-suphx-line-is-cancelled-2026-11-09)): its critic, its teacher-pushed policy, its from-scratch lineage and its search each failed to pay here. What has worked in this project is Neural Cat: rules propose the moves, and a model trained on how hands actually ended values them. So the one model grows from Neural Cat, generation by generation, and takes from the cancelled plan only what was shown to work: the benchmark and its bar, the native simulator, features v2, and the heads that read the table.

### The shape

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

### How each layer falls out of a head

| Layer | From |
| --- | --- |
| 0. Table read | The facts, and the table head. Folding stops being a mode decided above the hand: it is the move head choosing a safe tile because the table head says a discard is dear. `mode` is reported afterwards (a fold is a move that sets the hand back while an opponent reads as ready) |
| 1. Hand picker | The hand head. Each family the facts say is still possible gets a chance to finish and a faan; the main hand is the one worth the most (its chance × what its faan pays), the backup the second when it is close |
| 2. Pivot checker | The hand head, a turn apart, and one rule: the seat stays on its hand unless that hand is dead by the facts, or another leads it by a margin. No list of holds and chains. The reason is read off the numbers: **dead** (facts), **hopeless** (its chance fell under a floor), **faster** (the new hand's chance is higher, its faan isn't), **bigger** (its faan is higher) |
| 3. Discarder | The move head, which reads the hand head's output as well as the body. That is the point of doing it in one model: the move is valued knowing the hand, so the hand and the move come from one reading of the position |
| 4. Contradiction check | Rules, as now, against the hand head's main hand and backup. It now catches the model disagreeing with itself, not with a hand a rule set chose for it |
| Claims and kongs | The move head values them with the discards. The hand head is read again with the meld in place, so the coach can say what the claim turns the hand into |

### What it learns from

Every label comes free from simulated games. None is written by hand.

| Head | Label | How good the label is |
| --- | --- | --- |
| Table | The opponents' hidden hands | Exact, on every row. The cancelled plan's heads already learned this (deal-in and ready AUC about 0.90) |
| Hand | For each family: did this seat win the hand as that family, and for how many faan | True but thin: a seat wins about one hand in five, so most rows are all zeros, and rare families have few wins. See [the weak points](#where-this-is-weak) |
| Hand, to start | The hand today's rules pick in that position | Dense, on every row, and only as good as the rules. A warm start that keeps the coach's hand names sensible from the first round; its weight falls as the true label takes over |
| Move | The points the hand ended with for the seat, as a distribution (how it ended, faan won, faan paid, turned into points by the payout table) | Unbiased and noisy, as Neural Cat's is today |

Training plays with the contradiction check on, so the model learns the game it will play ([critique 5](#5-the-models-were-trained-without-the-check)).

### Why it is simpler

- **One of everything.** One dataset, one training run, one weights file, one forward pass in JS and one in C++, one parity check. A model for the opponents plus a model for the chance to finish plus a model for the discard, which the layer-by-layer verdicts added up to, is three of each.
- **The hand and the move can't drift apart.** They share a body and the move head reads the hand. With separate layers, every improvement to one is a new chance to disagree with the other, which is the bug this page started from.
- **The pivot rules mostly go.** The four reasons, three holds, the lock and the chains exist because the rule-made values are noisy ([layer 2](#layer-2-the-pivot-checker)). A calibrated chance needs one margin.
- **The read gets used.** The cancelled plan's finding was that the heads read the table well and the policy ignored them, because nothing in its loss rewarded acting on the read. A move head trained on how the hand ended, with the table head's output as an input, is rewarded for exactly that.
- **The coach gets more to say, not less.** Lucky Cat gives the coach one share a move. This gives a chance and a faan for every hand, expected points for every move, and a risk for every discard.

### What stays outside the model

One model for the middle, not one model for everything. Three things stay rules, and should not be argued back in:

- **The facts.** Steps from ready, live tiles, legal moves and the faan a hand holds are exact, and networks count badly. They are inputs. This is also what makes the hand head trainable at all: for a rare family it mostly has to learn how a known "steps" and "live tiles" turn into a chance.
- **The check.** An invariant enforced by the thing it constrains is not an invariant. It stays a rule, it stays on for every strategy, and `checked` becomes the measure of how often the model contradicts itself. That number should fall toward zero as training goes on; if it doesn't, the hand head and the move head aren't sharing what they should.
- **Jorge Yau.** He is the rule strategy by definition, and he is also the teacher (the warm-start label) and the fallback when weights fail to load. So the rule-made hand picker doesn't disappear. What changes is its priority: tidying its five places into one is now housekeeping for one strategy, not the main work.

### Where this is weak

1. **Neural Cat's recipe may be near its own ceiling.** It has been through eight shipped generations, and whether more of the same still gains is unmeasured. The steps in [Making it strong](#making-it-strong) that change what the model can learn (valuing every move, less noisy labels, the table read as an input) matter more than the ones that tune it. If those don't gain either, the limit is the body or the inputs, and that is a bigger build.
2. **The hand head's true label is thin and one-sided.** It only ever sees the hand a seat won with. It never sees that a different hand would have been finished from the same tiles, because that hand wasn't played. So it learns "what hands like this usually end as under the policy that played them", which is circular early on. The rules' label breaks the circle at the start; exploration (sometimes playing for the second hand) keeps it broken. Rare families (Thirteen Orphans, Nine Gates, Four Winds) may never have enough wins, and for those the rule formula should stay as the answer until calibration says the head is better.
3. **One model is one point of failure.** A bad round used to cost one layer. Now a regression in the body moves the table read, the hand and the move together, and a play result alone won't say which. Every head needs its own number, judged every round: AUC for the table head, calibration by family for the hand head, points a hand for the move head.
4. **Heads can pull against each other.** Sharing a body helps when the tasks agree and hurts when one loss swamps the others. The loss weights are tuning that didn't exist before. The cancelled plan is a caution here too: adding the table heads didn't hurt, and didn't help play either.
5. **Folding loses its arithmetic.** In the layered design, attack or fold was a comparison the coach could state: this hand expects 40 points, this discard risks 130. Inside a move head it is a number with no parts. The parts are still there (the hand head's value, the table head's risk), so the coach can show them beside the choice, but nothing forces the choice to follow them. Worth checking in review: how often the move head folds when the parts say attack.
6. **It doesn't help Lucky Cat, and it doesn't replace the small fixes.** Lucky Cat's network chooses a move directly and has no value to hang a hand on; it stays as it is. And Neural Cat as shipped still loses points to the contradiction check today. "Keeps" by what a tile does and a round trained with the check on are days of work and worth doing whatever happens here.
7. **The benchmark table is two Neural Cats and Jorge Yau.** A model grown from Neural Cat is judged mostly against its own parent, which it has studied more than any other player. A gain there may not hold against Lucky Cat or a person. Every kept generation is also played head to head against each shipped strategy.

### Making it strong

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

### The first step is small

Before anything else changes: **add the hand head and the table heads to Neural Cat's network as it stands**, as extra outputs. The body, the inputs and the move head are untouched, so play doesn't change, and it trains on data the lab already makes with three more labels a row (the hand the rules picked, the family the seat won with, the opponents' hands).

One round answers the question this whole section rests on: can a model pick a hand? The test is calibration by family (of the positions where it said 30%, about 30% finished) and whether its main hand beats the rules' pick at naming the hand a seat wins with. If it can't beat the rules there, the hand picker stays rules, the model keeps two heads, and the rest of [Making it strong](#making-it-strong) goes ahead without it.

## How a decision is made today

`analyzeDiscards` (`js/mahjong-bot.js`) takes each tile the seat could throw, removes it, and asks `handUtility` what the 13 tiles left are worth. `handUtility` lists the plans those tiles could make (`plansFor`, a strategy's `plans` hook), scores each as value times its chance to finish, and keeps the best (`chooseEntry`, which prefers the committed plan unless `pivotWhy` finds a reason to leave it). So with 14 tiles there are up to 14 hands in play in one turn, one for each discard. The discards are then ordered (score, priority groups, tiers, a strategy's `finalOrder`, a model's `rerank`), and the first that passes the contradiction check is played. The hand the coach names is the plan of that discard.

That is not all bad. A discard that keeps two hands alive scores well under both, so the hand hedges without anyone deciding to. The design below has to keep that, on purpose.

### Where each layer's work lives now

| Layer | Today |
| --- | --- |
| Table read | `buildContext`, `leftRead`, `afterRead`, `opponentThreats`, `defenseWeight`, Jorge Yau's reads |
| Hand picker | Five places: the foundation's plan list scored for each discard (`plansFor`, `chooseEntry`); the commit memory (`planMemo`); Jorge Yau's targets (`TARGETS`, `classify`, `currentTarget`); Jorge Yau's lock onto a hand worth 7 faan or more (`lockHand`); the coach's read of the hand your own discards point to (`playerDrift`, `playerPlan`) |
| Pivot checker | Four places: the foundation's `pivotWhy` ("hopeless" or "points"); Jorge Yau's dead and stronger targets; Jorge Yau's `pivot()`; the lock's "still possible" test |
| Discarder | The foundation's scoring and ordering; then Neural Cat's `rerank` among the best few, or Lucky Cat's network choosing among every legal move |
| Contradiction check | `consistentFirst`, `claimConsistent`, `kongContradicts`: last, against the plan of each discard |

## The pipeline

```
0. Table read          context, threats, attack or fold
1. Hand picker         every hand these tiles could make, valued: the main hand and a backup
2. Pivot checker       stay on the main hand, or pivot, with a reason
3. Discarder           rules or a model: the move, chosen for those hands
4. Contradiction check the move against them; the next choice if it fails
```

One call returns all of it, for the bot to play and the coach to say:

```js
decide(game, seat, options) -> {
  mode,      // 'attack' or 'fold'
  hand,      // { id, family, label, keep, faan, steps, outs, chance, value }
  backup,    // the same, for the second hand it is keeping alive, or null
  pivot,     // null, or { from, to, why }
  moves,     // the discarder's order, each with its reading
  move,      // the one played
  checked,   // how many of the discarder's choices the check passed over
}
```

### Layer 0: the table read

Gathered once a turn: the context (melds, flowers, winds, tiles unseen, draws left), the reads of the players before and after, the threats, and whether the hand is folding. Folding is a mode, decided here: a folding hand throws its safest tile, as it does today, and the layers below don't apply.

### Layer 1: the hand picker

Reads the 14 tiles (13 on a claim) once and values every hand they could still make.

- **Candidates.** The plans the foundation already builds: the plain hand, All Sequences and Concealed Straights, the flushes, All Triplets and Concealed Triplets, Seven Pairs, Thirteen Orphans, Nine Gates, the hands of honors and terminals, Three Dragons and Four Winds. Open melds rule hands out as they do now.
- **Value.** Expected points: what the hand pays times its chance to finish, less what the extra turns cost in deal-ins. `handValue(faan)` and `finishChance(steps, live tiles, draws left)` exist; the deal-in cost of a slower hand is only in the discard scoring today and belongs here too. Not the hand with the most faan: see [critique 7](#7-worth-the-most-is-the-wrong-target-if-it-means-faan).
- **A strategy's taste.** A table, not code: the order it tries hands in (Jorge Yau's targets), a weight for the hand it is on (his 1.5), hands it never plays (Only Orphans plays only its own).
- **Output: two hands, not one.** The main hand, and a backup when one is close: the best other hand whose value is within reach of the main one and that shares tiles with it. Early, most hands have a backup (a Half Flush that can still be a plain fast hand, Concealed Triplets that can be Seven Pairs). The backup drops away as the main hand gets close (two steps from ready or nearer) or the backup dies. See [critique 2](#2-one-hand-is-too-few-early-in-the-hand).

### Layer 2: the pivot checker

Holds the hand the seat is on and decides, each turn, whether to leave it. Staying is the default.

It pivots for one of four reasons, which the coach can say:

| Reason | When |
| --- | --- |
| **Dead** | The hand can't be made: a meld rules it out, or too few copies are left of a tile it needs |
| **Hopeless** | No live tile helps it, or there aren't the draws left to fill it (`steps + 1 > draws left × 1.5`, today's rule) |
| **Faster** | A smaller hand is ready and this one isn't; or a smaller hand is no further from ready and there are too few draws left for the bigger one |
| **Bigger** | Another hand is worth clearly more: at least 1 faan more, no more than 1 step further away, and its value beats this one's by a margin |

And it holds back for three:

- **Commitment.** No pivot for "bigger" in the first three discards: the opening hand hasn't shown what it is.
- **No going back.** A hand it left needs 2 faan more, and no extra step, to return to.
- **Chains.** A strategy can name the smaller hand each hand falls to (Jorge Yau's). Without a chain, the backup from layer 1 is taken, which is what a backup is for.

Two corrections to today's rules while they are being moved:

- **"Late" should be draws against steps, not a tile count.** "20 tiles or fewer" is about 5 draws for the seat. A hand 1 step away with 5 draws is fine; a hand 3 away isn't. `steps × 2 > draws left` says both, and has no magic number in it.
- **The margin exists because the values are noisy.** With a chance that is right ([critique 4](#4-everything-rests-on-a-chance-nobody-has-checked)), "pivot when another hand is worth more" needs only a small margin. Every extra rule here is a patch over a weak estimate in layer 1, and should be removed when the estimate improves, not tuned.

The lock (8 tiles of a hand worth 7 faan or more in the first 8 turns) becomes a commitment that only "dead" and "hopeless" can break.

### Layer 3: the discarder

Chooses the move, given the main hand and the backup. Three kinds, one interface (`order(hand, backup, table) -> moves`):

- **Rules** (Jorge Yau, Only Orphans, Lucky Cat Classic). The foundation's scoring for the main hand: each discard by how close it leaves that hand and how many live tiles improve it, plus a share for what it leaves the backup (today's `backup` value, now named), then the shared order (the tile that connects least, the fewest copies left), the strategy's priority groups, and safety.
- **A model that scores** (Neural Cat). The rules' best few discards, reranked by the model's expected score.
- **A model that chooses** (Lucky Cat). The network's share for every legal move.

A model's choice is still checked in layer 4. Masking its choices by the hand before it chooses is the same restriction as checking after, so it is not listed as a separate step ([critique 1](#1-masking-before-the-model-is-not-a-fix-by-itself)).

### Layer 4: the contradiction check

What it forbids stays. What it checks against changes in two ways:

- **The turn's hands, not the plan of each discard.** A move contradicts when it hurts the main hand while the seat holds a tile that is no use to the main hand or the backup, and isn't being held for safety.
- **"Hurts" by what the tile does, not which suit it is.** A tile the hand "keeps" is one whose loss costs the hand a step or live tiles. A fourth copy or a dead terminal in the flush's suit can go without contradicting anything. See [critique 3](#3-keeps-is-too-coarse).

`checked` counts the choices it passed over. It is a number to watch in every simulation, for each strategy: a rule strategy's should be near zero by construction, and a model's says how often the model and the hand picker disagree, which is the most useful single measure this design produces.

## Rules or a model, layer by layer

**Read this table as the reasoning, not the plan.** It asks, layer by layer, whether a model could do the job, and its answer was a model in three places. [One model for the middle](#one-model-for-the-middle) takes those three and makes them heads of one network, and moves the pivot checker and attack-or-fold in with them, against the verdicts below. What that costs is in [its weak points](#where-this-is-weak) (5 for folding). The verdicts for the facts and for the check stand.

The test for each layer: is there a right answer that can be computed, or only one that can be estimated? Is there a label to learn from? Does the coach have to say why?

| Layer | Verdict | Why |
| --- | --- | --- |
| 0. Table read: the facts | **Rules** | Tiles seen, melds, draws left: counted, not guessed |
| 0. Table read: what the others hold | **Model, the best place for one** | A supervised problem with perfect labels: the hidden hands are known in every simulated game. The frontier's auxiliary heads already do it (deal-in AUC 0.92, waits 0.61), where today's reads are hand-written thresholds ("10% of discards", "6 discards"). The threat reads feed everything below, so a gain here is a gain everywhere |
| 0. Table read: attack or fold | **Rules over learned chances** | The decision is arithmetic (what my hand is worth against what a deal-in costs) once the chances are good. A learned fold policy would hide the reason from the coach |
| 1. Hand picker: which hands, and what they pay | **Rules** | Enumeration and scoring are exact. A model that guesses faan has nothing to add to a scorer that knows it |
| 1. Hand picker: the chance to finish | **Model, the second best place** | Estimation, with a label from every simulated hand (did it finish as that hand, and when). Today's formula has hand-set constants (a step costs a fixed factor, an open hand finishes 1.33 times as fast) that nobody has checked against results. A small model, or just a table fitted to simulations, is a contained change: one number in, one number out, easy to check for calibration |
| 2. Pivot checker | **Rules** | Given good values it is a comparison with a reason attached, and the coach has to say the reason. A learned pivot policy would learn the same thing as the value in layer 1, less directly, and couldn't explain itself. Its thresholds are tuned by simulation, which is search, not learning |
| 3. Discarder: the candidates and their features | **Rules** | Steps from ready and live tiles are exact combinatorics. Models are bad at counting and rules are perfect at it |
| 3. Discarder: the choice among them | **Model** | Trading speed against size against safety is judgment, and where both models already earn their keep: Jorge Yau, the rules Neural Cat reranks, loses about 80 points a hand at a table of three Neural Cats |
| 4. Contradiction check | **Rules, always** | It is an invariant, and an invariant enforced by a model isn't one |
| Claims and kongs | **As the discarder** | Rules say which calls are legal and consistent; a model weighs them |

So: models for the two places that are estimation with labels (what the others hold, the chance to finish) and for the final judgment; rules for everything exact, everything the coach must explain, and the invariant. The two estimation layers are where a model is missing today, and the discarder, where the models are, is the layer that needs one least urgently.

One caution on the order of work. A model for the opponents' hands exists in the frontier lineage but isn't wired into anything the bots use; wiring it in is worth more than any refactor on this page, and doesn't depend on one.

## Critique: where this design is weak

### 1. Masking before the model is not a fix by itself

The first draft said: let the model choose among moves that fit the hand, instead of overriding it afterwards, and Neural Cat's loss comes back. That is wrong as stated. For a model that ranks moves, "take the best move that passes" is the same move whether the filter runs before or after the ranking. The check costs Neural Cat points because of what it forbids, not when.

What it forbids is the model disagreeing with a hand the rules chose. Neural Cat's model was reading something in those positions (safety, a second hand, a tile that was dead weight) that the rule-made hand didn't. So the levers that could return the loss are the ones that change the reference, not the timing: a backup hand ([2](#2-one-hand-is-too-few-early-in-the-hand)), a finer meaning of "keeps" ([3](#3-keeps-is-too-coarse)), and a model trained with the check on ([5](#5-the-models-were-trained-without-the-check)). Which of them it is can be found out before building anything: log the positions where the check overrides Neural Cat, and look.

### 2. One hand is too few early in the hand

"Pick a hand, then play for it" is how the weakest of the three strategies thinks. Strong play keeps two hands alive while it is cheap to, and commits when one pulls ahead. Today's per-discard scoring does this by accident; a pipeline with exactly one hand would remove it on purpose. Hence the backup in layer 1. The risk on the other side is real too: two hands is an excuse for any discard. The backup has to be named, shown to the coach, and dropped on a rule (close to ready, or dead), or it becomes the old vagueness with a new name.

### 3. "Keeps" is too coarse

The check calls any Character a tile the Half Flush in Characters keeps. A fourth Character of a kind, or a terminal with nothing near it and no copies left, is not helping that hand. Throwing it while holding a Bamboo that is safe against a ready opponent is good play, and the check forbids it. Defining "keeps" by what the tile does for the hand (its loss costs a step or live tiles) is more work to compute and closer to what a player means by a contradiction. It should be tried before anything structural, because it is small, and because it may be most of Neural Cat's loss.

### 4. Everything rests on a chance nobody has checked

Layer 1 ranks hands by value times the chance to finish, and layer 2 pivots on the difference. If the chance is off by a factor for one family of hands (too kind to flushes, say), the picker is wrong systematically and every layer below inherits it. This is cheap to measure and has never been measured: for each family, the chance the formula gave against how often the hand was finished, over a few thousand simulated hands. Do this first. If it is badly off, fixing it is worth more than the pipeline.

### 5. The models were trained without the check

Neural Cat and Lucky Cat learned from games where a contradicting move was allowed, and now play in games where it isn't. Their values for a position assume a freedom they no longer have. A lab round with the check on (which the trainers now do) lets them learn the constrained game. This may return a good part of Neural Cat's loss with no change to the architecture, and it is the cheapest experiment on this page: one round, judged head to head.

### 6. Three stages of refactoring before any proof

The first draft's plan was a facade, then a merge of the pickers, then the switch to one hand, each with a port to C++. That is weeks of careful work whose first two stages change nothing a player can see, resting on the belief that hand-first play is better. The evidence so far is one number in favour (rules gain from consistency) and one against (the model loses). The honest order is the reverse: measure, run the small experiments that test the belief, and refactor only what the experiments support. If hand-first scoring doesn't beat per-discard scoring for Jorge Yau in a head to head, the pipeline is still worth having as the shape the coach reads, and stage 3 isn't built.

### 7. "Worth the most" is the wrong target if it means faan

The hand worth the most faan is usually the wrong hand: a limit hand four steps away is worth less than a 3-faan hand that is ready. The picker's number is expected points, and it has to include the cost of the turns a slow hand takes (each one a chance to deal in). Jorge Yau's fixed target order is "most faan first, if it fits", softened by thresholds; ranking by expected points would replace the order with one rule. That is a behaviour change to measure, not assume: his order may encode something the value formula misses.

## Claims and kongs

A claim is a question for layers 1 and 2: with this meld, which hands would the picker choose, and would the pivot checker stay or move? The claim is taken when the hand after it is the main hand, the backup, or a pivot the checker allows, and it leaves the hand closer or worth more; then layer 3 picks the discard and layer 4 checks both. The dragon and scoring-wind pung stays the stated exception (always taken, except on Thirteen Orphans). A kong on your own turn is taken when the hand can hold it and it doesn't cost the hand.

## Each strategy in the pipeline

| Strategy | Hand picker | Pivot checker | Discarder |
| --- | --- | --- | --- |
| Jorge Yau | The shared picker, with his target order and weight | The shared checker, with his chains and the lock | Rules |
| Only Orphans | The shared picker, limited to its hands | The shared checker | Its model, scoring the rules' discards |
| Lucky Cat Classic | The shared picker | The shared checker | Rules |
| Neural Cat | The shared picker (Jorge Yau's table) | The shared checker | Its model, reranking the best few |
| Lucky Cat | The shared picker | The shared checker | Its network |
| The new frontier model ([one model](#one-model-for-the-middle)) | Its hand head | Its hand head, a turn apart, and one margin | Its move head |

A rule strategy is then a table (hands, order, weights, chains) and a discarder, not a set of hooks into the foundation. Today's models keep the shared rule-made picker, because they have no hand of their own. The new frontier model brings its own, and uses none of the rule tables.

## The coach

The coach says what the pipeline returned, and computes nothing of its own: the hand, the backup when there is one ("Go for Half Flush in Characters, about 5 faan; a plain hand is still open"), the pivot and its reason, the move, and why the discarder chose it. When it follows the hand your own discards point to, that is a different hand picker in layer 1 (the player's intent), and everything after it is the same. The coach and the bot can't disagree, because they read one result.

One thing to decide deliberately: at Simple the coach names one hand. A backup the coach doesn't mention can make a discard look like a contradiction to the player even when it isn't one. Either Simple names the backup when the discard is for it, or the check for the coach is stricter than for the bot. The first is better.

## State

One record a seat, in place of the commit memory, Jorge Yau's opening target and his lock:

```js
seat.handState = { hand, backup, since, locked, left: { family: turn }, pivots: [{ turn, from, to, why }] }
```

Saved with the game and kept in the native simulator's seat memo. A claim being weighed reads it and doesn't write it, as now.

## Training and the native simulator

- **Training data** records the move the pipeline played. It can also record the hands and the pivot, which is the label a learned chance-to-finish needs, and later a learned picker.
- **The hand as a head, not a feature.** Neither of today's models is told the hand, and neither is changed. The new frontier model predicts the hand itself and feeds it to its move head ([one model](#one-model-for-the-middle)). Its data records, for every position, the hand the rules picked (the warm-start label) and, when the hand is over, the family and faan the seat won with.
- **The native simulator** ports each change as it lands, with the parity check (every action identical to the JS) before it is pinned. Picking hands once a turn instead of once a discard should make a turn cheaper.

## Building it: measure, then experiment, then refactor

**Measure first. Nothing here changes play.**

1. **Why the check overrides Neural Cat.** Log every position where the check passes over the model's pick: the tile it wanted, the hand, what the tile was doing (safe, a second hand, dead in suit). A few hundred positions, read by eye, say which of critiques 2, 3 and 5 is the cause.
2. **Is the chance to finish right?** For each family of hands, the formula's chance against how often it finished.
3. **The counters.** `checked` and pivots a hand, for every strategy, in the simulator's output.

**Then the small experiments, each one a head to head on 20,000 deals against the check as it stands.**

4. **A lab round for Neural Cat with the check on** ([5](#5-the-models-were-trained-without-the-check)).
5. **"Keeps" by what the tile does** ([3](#3-keeps-is-too-coarse)).
6. **A backup hand in the check** ([2](#2-one-hand-is-too-few-early-in-the-hand)).
7. **Hand-first scoring for Jorge Yau only**, behind a switch: the hands picked once, the discards scored for them. This is the experiment that says whether the pipeline's central idea is right.

**Then the one model, smallest step first** ([one model for the middle](#one-model-for-the-middle)).

8. **The hand head and the table heads on Neural Cat's network** ([the first step](#the-first-step-is-small)). One round, judged on calibration by family and against the rules' pick.
9. **The rest of [Making it strong](#making-it-strong), in its order**, one change at a time against the benchmark's bar, trained on points with the check on.

**And for the rule strategies and today's models, build what survived.**

10. **The pipeline as the shape of the result**: `decide()` returns the record above, and the coach reads it. Worth doing whatever the experiments say, because it ends the coach computing its own version of the hand.
11. **One rule-made hand picker and one pivot checker**, with a table for each rule strategy and `seat.handState`, if 7 held. It serves Jorge Yau, Lucky Cat Classic and today's models, and is the teacher for step 8; it is no longer where the models are headed.
12. **Today's models' discarders on the pipeline**, last, and only if the new frontier model isn't close.

Wiring the frontier's read of the opponents' hands into layer 0 is separate from all of this and can start at any time.

## How it will be judged

- **Head to head, each strategy against itself before the change**, each in every seat of the same 20,000 deals against the same table (`lcm-sim play --models X,X~before`), the difference taken deal by deal. A change is kept when no strategy loses beyond its margin. For Neural Cat the bar is the play before the check: the aim is to end with the check on and the loss gone.
- **`checked`**: near zero for rule strategies; for models, falling as the experiments land.
- **Pivots a hand**, with their reasons. More than about twice a hand is flip-flopping.
- **Calibration**: the chance to finish against results, for each family, within a few points.
- **The coach and the bot agree** on every hint, by construction, and by test.
- **The frontier benchmark** is frozen at 0.57.9 and doesn't move; it and its bar (two standard errors, twice) carry over from the cancelled plan to judge the new frontier model. The experiments on today's players are measured against today's players.

## Open questions

- **Is hand-first better at all?** Experiment 7, for the rule strategies. If per-discard scoring with a good check plays as well, layers 1 and 2 are a tidier way to describe the bot, not a stronger way to play, and should be built only as far as the coach needs.
- **How much is a backup worth?** Too little and it is ignored; too much and nothing is ever committed to. Today's share for backups is 0.12 of the best one or two; nobody has tuned it.
- **Jorge Yau's order against expected points.** Keep his order as a table first, try the value second, and keep whichever wins.
- **Lucky Cat's hand.** Its network never chose by a hand, and the check now makes it win 4 points fewer hands for 60% bigger wins. The points are up, but that is a different player from the one the lab has been training (points first, without losing wins). Whether the lab's bar should change with it is a call for the maintainer.
- **Can a model pick a hand?** Step 8. If the hand head can't beat the rules' pick at naming the hand a seat wins with, the one model keeps two heads and the hand stays rules.
- **How much does the move head lean on the hand head?** Too little and the two disagree (`checked` stays high); too much and a wrong hand early drags every move after it. The backup is the hedge, and its weight is learned, not set.
- **Should folding name a hand?** It is a mode above the hand, and stays one. Whether the coach still says what the hand was going for is a wording question.
