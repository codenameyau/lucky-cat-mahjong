# The evaluation architecture (proposed)

A design, not built yet (written 2026-11-09, revised the same day after a critical pass). One pipeline that every strategy, every model and the coach run for every decision: read the table, pick the hand, decide whether to pivot, choose the move, and check the move against the hand. It replaces five overlapping ways of choosing a hand and four of leaving one.

This page also says where the design is weak, which layers should be rules and which a model, and what has to be measured before any of it is built. Two things in the first draft were wrong and are corrected here: that choosing the hand before the model chooses would by itself return Neural Cat's loss ([it won't](#1-masking-before-the-model-is-not-a-fix-by-itself)), and that the pipeline should hold exactly one hand ([it should hold two](#2-one-hand-is-too-few-early-in-the-hand)).

## Contents

- [Why](#why)
- [The reward: faan, capped at 13](#the-reward-faan-capped-at-13)
  - [The faan score](#the-faan-score)
  - [What it changes](#what-it-changes)
  - [What to expect, and one thing to decide](#what-to-expect-and-one-thing-to-decide)
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
  - [7. "Worth the most" means expected faan, not the biggest hand](#7-worth-the-most-means-expected-faan-not-the-biggest-hand)
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

## The reward: faan, capped at 13

Decided by the maintainer (2026-11-09): this architecture optimizes **faan**, not points. Faan is fixed by the rules of the hand; what a faan pays is a table that changes from house to house (this game's doubles every faan; others are flatter, or cap earlier). A player tuned to one payout table is tuned to that house. A player tuned to faan carries to any of them. Faan is capped at 13, the limit.

Points are still tracked in every benchmark and reported beside faan. They stop being what a hand picker ranks by, what a model is trained toward, and what a change is kept or rejected on.

### The faan score

One number a hand, for every seat, that no payout table enters:

| What happened to the seat | Faan score |
| --- | --- |
| It won | + the hand's faan (3 to 13) |
| It dealt in | − the winning hand's faan |
| Someone else won, not off its discard | 0 |
| The hand was drawn | 0 |

A self-draw is already 1 faan inside the hand's own count, so it needs no multiplier. The score of a strategy is its average faan score a hand, with hands won, deal-ins and the average faan of a win beside it.

### What it changes

- **Layer 1.** The hand picker ranks by expected faan: the hand's faan (capped at 13) times its chance to finish, less the faan it expects to give away over the turns it takes. The foundation's `handValue` already has a mode that is linear in faan (`valuePower: null`); today's default raises this game's payout ratio to a power, which is the points view.
- **Layer 2.** "Bigger" was already stated in faan (at least 1 faan more).
- **Layer 3.** A model that scores predicts expected faan score, not expected points. Neural Cat's network predicts how a hand ends and the faan won or paid, and turns that into points with the payout table (`expected points`); the same outputs give expected faan without retraining the outcome heads, but the model was selected on points, so a new line trained and judged on faan is the honest version. Lucky Cat's lab weighs every hand by its points; that becomes its faan score.
- **Benchmarks.** The frontier's Table Score is points and is frozen; it stays, and a faan Table Score is reported beside it from the same games. The lab's objective (J = points a hand + 5 × hands won) becomes faan score a hand; the win term was there to stop a points-only objective trading wins away, which a faan objective does much less.
- **The coach.** It already speaks in faan ("about 5 faan"). Complex's "expected score" is the model's points estimate and becomes its faan estimate.

### What to expect, and one thing to decide

This is a real change in how the bots will want to play, and it should be seen coming:

- **Under this game's table a 13-faan hand pays 1,024 times a 3-faan hand. In faan it is worth 4.3 times.** A player optimizing faan will chase far fewer limit hands and finish more small ones than a player optimizing this table's points. That is the point of the decision (it is the right play at a flat table and a reasonable one at any), but the faan-best player will usually score fewer points here than the points-best one, and the tracked points will show it. A change that gains faan and loses points is, from now on, a change to keep.
- **Neural Cat is the most exposed.** Its style is few, big wins (about 9% of hands, wins worth about four times Lucky Cat's). Much of that is the payout table talking. On faan it should move toward more, smaller wins, and the two models' styles should come closer together.
- **To decide: what a loss costs.** The table above charges a deal-in the winner's full faan and charges nothing when someone else self-draws. That keeps the score free of any payout rule, and makes defense count. The alternatives are to count wins only (simplest, but it is how Lucky Cat first learned to deal in on 18% of hands), or to charge every seat when a hand is self-drawn (closer to how most tables pay, but that is a payout rule again). The table above is the recommendation; it is the maintainer's call.

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
- **Value.** Expected faan ([the faan score](#the-faan-score)): the hand's faan, capped at 13, times its chance to finish, less the faan it expects to give away in deal-ins over the turns it takes. `handValue(faan)` and `finishChance(steps, live tiles, draws left)` exist; the deal-in cost of a slower hand is only in the discard scoring today and belongs here too. Not the hand with the most faan: see [critique 7](#7-worth-the-most-means-expected-faan-not-the-biggest-hand).
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

The test for each layer: is there a right answer that can be computed, or only one that can be estimated? Is there a label to learn from? Does the coach have to say why?

| Layer | Verdict | Why |
| --- | --- | --- |
| 0. Table read: the facts | **Rules** | Tiles seen, melds, draws left: counted, not guessed |
| 0. Table read: what the others hold | **Model, the best place for one** | A supervised problem with perfect labels: the hidden hands are known in every simulated game. The frontier's auxiliary heads already do it (deal-in AUC 0.92, waits 0.61), where today's reads are hand-written thresholds ("10% of discards", "6 discards"). The threat reads feed everything below, so a gain here is a gain everywhere |
| 0. Table read: attack or fold | **Rules over learned chances** | The decision is arithmetic (the faan my hand expects against the faan a deal-in costs) once the chances are good. A learned fold policy would hide the reason from the coach |
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

### 7. "Worth the most" means expected faan, not the biggest hand

The hand with the most faan is usually the wrong hand: a limit hand four steps away is worth less than a 3-faan hand that is ready. The picker's number is expected faan, and it has to include the faan a slow hand gives away while it waits. Jorge Yau's fixed target order is "most faan first, if it fits", softened by thresholds; ranking by expected faan would replace the order with one rule. That is a behaviour change to measure, not assume: his order may encode something the value formula misses.

Faan as the reward makes this sharper, not softer. With points, a big hand's payout (doubling every faan) could justify a long chase; with faan, 13 is only 4.3 times 3, so the chance to finish dominates. Expect the picker to prefer the quick hand more often than any of today's strategies do.

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

A strategy is then a table (hands, order, weights, chains) and a discarder, not a set of hooks into the foundation.

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
- **The hand as a feature.** Neither model is told the hand. Giving it as input needs new data and a new model, so it is not part of this design; the pipeline makes it possible.
- **The native simulator** ports each change as it lands, with the parity check (every action identical to the JS) before it is pinned. Picking hands once a turn instead of once a discard should make a turn cheaper.

## Building it: measure, then experiment, then refactor

**Measure first. Nothing here changes play.**

1. **Why the check overrides Neural Cat.** Log every position where the check passes over the model's pick: the tile it wanted, the hand, what the tile was doing (safe, a second hand, dead in suit). A few hundred positions, read by eye, say which of critiques 2, 3 and 5 is the cause.
2. **Is the chance to finish right?** For each family of hands, the formula's chance against how often it finished.
3. **The counters.** `checked` and pivots a hand, for every strategy, in the simulator's output.
4. **The faan score.** `lcm-sim play` and the JS competition report faan score a hand beside points, and the head to heads so far (the contradiction check, Jorge Yau's new pivots) are read again in faan: a result that was a gain in points may not be one in faan, and the reverse.

**Then the small experiments, each one a head to head on 20,000 deals against the check as it stands, judged on faan score.**

5. **The rule strategies on faan.** The foundation's value switched to linear in faan (`valuePower: null`), Jorge Yau and Lucky Cat Classic head to head against themselves as they play now. The first look at how much play moves, and whether faan score rises as it should.
6. **A lab round for Neural Cat with the check on** ([5](#5-the-models-were-trained-without-the-check)).
7. **"Keeps" by what the tile does** ([3](#3-keeps-is-too-coarse)).
8. **A backup hand in the check** ([2](#2-one-hand-is-too-few-early-in-the-hand)).
9. **Hand-first scoring for Jorge Yau only**, behind a switch: the hands picked once, the discards scored for them. This is the experiment that says whether the pipeline's central idea is right.

**Then build what survived.**

10. **The pipeline as the shape of the result**: `decide()` returns the record above, and the coach reads it. Worth doing whatever the experiments say, because it ends the coach computing its own version of the hand.
11. **One hand picker and one pivot checker**, with a table for each strategy and `seat.handState`, if 9 held.
12. **The models' discarders on the pipeline**, last.

Wiring the frontier's read of the opponents' hands into layer 0 is separate from all of this and can start at any time.

## How it will be judged

- **Head to head, each strategy against itself before the change**, each in every seat of the same 20,000 deals against the same table (`lcm-sim play --models X,X~before`), the difference taken deal by deal. **The number is faan score a hand**; points a hand, hands won, deal-ins and the average faan of a win are reported beside it. A change is kept when no strategy loses faan beyond its margin. For Neural Cat the bar is the play before the check: the aim is to end with the check on and the loss gone.
- **`checked`**: near zero for rule strategies; for models, falling as the experiments land.
- **Pivots a hand**, with their reasons. More than about twice a hand is flip-flopping.
- **Calibration**: the chance to finish against results, for each family, within a few points.
- **The coach and the bot agree** on every hint, by construction, and by test.
- **The frontier benchmark** is frozen at 0.57.9 and doesn't move; these are measured against today's players.

## Open questions

- **Is hand-first better at all?** Experiment 9. If per-discard scoring with a good check plays as well, layers 1 and 2 are a tidier way to describe the bot, not a stronger way to play, and should be built only as far as the coach needs.
- **How much is a backup worth?** Too little and it is ignored; too much and nothing is ever committed to. Today's share for backups is 0.12 of the best one or two; nobody has tuned it.
- **Jorge Yau's order against expected points.** Keep his order as a table first, try the value second, and keep whichever wins.
- **Lucky Cat's hand.** Its network never chose by a hand, and the check now makes it win 4 points fewer hands for 60% bigger wins. The points are up, but that is a different player from the one the lab has been training (points first, without losing wins). Whether the lab's bar should change with it is a call for the maintainer.
- **Should folding name a hand?** It is a mode above the hand, and stays one. Whether the coach still says what the hand was going for is a wording question.
