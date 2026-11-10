# The evaluation architecture (proposed)

A design, not built yet (written 2026-11-09). One pipeline that every strategy, every model and the coach run for every decision: pick the hand for the turn, decide whether to pivot, choose the move for that hand, and check the move against it. It replaces five overlapping ways of choosing a hand and four of leaving one, and it removes the cause of the contradictions the [contradiction check](../strategies/README.md#the-contradiction-check) now catches after the fact.

## Contents

- [Why](#why)
- [How a decision is made today](#how-a-decision-is-made-today)
  - [Where each layer's work lives now](#where-each-layers-work-lives-now)
- [The pipeline](#the-pipeline)
  - [Layer 0: the table read](#layer-0-the-table-read)
  - [Layer 1: the hand picker](#layer-1-the-hand-picker)
  - [Layer 2: the pivot checker](#layer-2-the-pivot-checker)
  - [Layer 3: the discarder](#layer-3-the-discarder)
  - [Layer 4: the contradiction check](#layer-4-the-contradiction-check)
- [Claims and kongs](#claims-and-kongs)
- [Each strategy in the pipeline](#each-strategy-in-the-pipeline)
- [The coach](#the-coach)
- [State](#state)
- [Training and the native simulator](#training-and-the-native-simulator)
- [Building it, in three stages](#building-it-in-three-stages)
- [How it will be judged](#how-it-will-be-judged)
- [Open questions](#open-questions)

## Why

The coach said "Go for Half Flush in Characters" and threw a Character with a Bamboo in hand. The contradiction check (0.57.25) now stops that: a move that goes against the hand it builds toward gives way to the strategy's next choice. Measured head to head on 20,000 deals ([iterations](../machine-learning/iterations.md#head-to-head-with-the-check-against-without-it)), it gains Jorge Yau about 8 to 10 points a hand and Lucky Cat 12 to 14, and costs Neural Cat 9 to 16.

Neural Cat's loss says where the real problem is. The check runs after the model has chosen, and replaces its pick with a move the model rated lower. The contradiction itself is a symptom: no layer picks a hand for the turn, so a discard can always disagree with "the hand". Choosing the hand first removes the contradiction at the root and lets a model choose among consistent moves itself.

## How a decision is made today

`analyzeDiscards` (`js/mahjong-bot.js`) takes each tile the seat could throw, removes it, and asks `handUtility` what the 13 tiles left are worth. `handUtility` lists the plans those tiles could make (`plansFor`, a strategy's `plans` hook), scores each as value times its chance to finish, and keeps the best (`chooseEntry`, which prefers the committed plan unless `pivotWhy` finds a reason to leave it). So with 14 tiles there are up to 14 hands in play in one turn, one for each discard. The discards are then ordered (score, priority groups, tiers, a strategy's `finalOrder`, a model's `rerank`), and the first is played. The hand the coach names is the plan of the discard that came first.

### Where each layer's work lives now

| Layer | Today |
| --- | --- |
| Hand picker | Five places: the foundation's plan list scored for each discard (`plansFor`, `chooseEntry`); the commit memory (`planMemo`: the plan family the hand is on); Jorge Yau's targets (`TARGETS`, `classify`, `currentTarget`); Jorge Yau's lock onto a hand worth 7 faan or more (`lockHand`); the coach's read of the hand your own discards point to (`playerDrift`, `playerPlan`) |
| Pivot checker | Four places: the foundation's `pivotWhy` ("hopeless" or "points"); Jorge Yau's dead and stronger targets; Jorge Yau's `pivot()` (a smaller hand that is ready first, or late in the wall); the lock's "still possible" test |
| Discarder | The foundation's scoring and ordering; then Neural Cat's `rerank` among the best few, or Lucky Cat's network choosing among every legal move |
| Contradiction check | `consistentFirst`, `claimConsistent`, `kongContradicts`: last, against the plan of each discard |

## The pipeline

```
0. Table read          context, threats, attack or fold
1. Hand picker         every hand these tiles could make, valued; the best one
2. Pivot checker       stay on the committed hand, or pivot, with a reason
3. Discarder           rules or a model: the move, chosen for that hand
4. Contradiction check the move against that one hand; the next choice if it fails
```

One call returns all of it, for the bot to play and the coach to say:

```js
decide(game, seat, options) -> {
  mode,      // 'attack' or 'fold'
  hand,      // { id, family, label, keep, faan, steps, outs, chance, value }
  pivot,     // null, or { from, to, why }
  moves,     // the discarder's order, each with its reading
  move,      // the one played
  checked,   // how many of the discarder's choices the check passed over
}
```

### Layer 0: the table read

What exists already, gathered once a turn: the context (`buildContext`: melds, flowers, winds, tiles unseen, draws left), the reads of the players before and after (`leftRead`, `afterRead`), the threats (`opponentThreats`), and whether the hand is folding (`defenseWeight`). Folding is a mode, decided here: a folding hand skips layers 1 to 4's hand logic and throws its safest tile, as it does today.

### Layer 1: the hand picker

Reads the 14 tiles (13 on a claim) once and values every hand they could still make.

- **Candidates.** The plans the foundation already builds: the plain hand, All Sequences and Concealed Straights, the flushes, All Triplets and Concealed Triplets, Seven Pairs, Thirteen Orphans, Nine Gates, the hands of honors and terminals, Three Dragons and Four Winds. Open melds rule hands out as they do now.
- **Value.** What the hand is worth times its chance to finish: `handValue(faan)` times `finishChance(steps, live tiles, draws left)`, both of which exist. A hand under the 3 faan minimum is worth nothing unless flowers or melds make it up. The left player's read leans a flush toward the suit they feed and away from the one they keep (`suitLean`), as now.
- **A strategy's taste.** A table, not code: the order it tries hands in (Jorge Yau's targets), a weight for the hand it is on (his 1.5), hands it never plays (Only Orphans plays only its own). Today these are hooks that build plan lists.
- **Output.** The best hand, with the tiles it keeps (`keep`), its faan, steps from ready, live tiles, chance and value, and the runners-up for the pivot checker.

Simple rule-based heuristics to start: the value above is the whole of it. A learned picker (a model that predicts which hand will pay) can replace it later behind the same output.

### Layer 2: the pivot checker

Holds the hand the seat is on and decides, each turn, whether to leave it. Staying is the default: a hand is only as good as the turns spent on it.

It pivots for one of four reasons, which the coach can say:

| Reason | When |
| --- | --- |
| **Dead** | The hand can't be made: a meld rules it out, or too few copies are left of a tile it needs |
| **Hopeless** | No live tile helps it, or there aren't the draws left to fill it (`steps + 1 > draws left × 1.5`, today's rule) |
| **Faster** | A smaller hand is ready and this one isn't; or late in the wall (20 tiles or fewer) a smaller hand is no further from ready (Jorge Yau's rule, for everyone) |
| **Bigger** | Another hand is worth clearly more: at least 1 faan more, no more than 1 step further away, and its value beats this one's by a margin (today's 1.1) |

And it holds back for three:

- **Commitment.** No pivot for "bigger" in the first three discards (today's `COMMIT_TURN`): the opening hand hasn't shown what it is.
- **No going back.** A hand it left needs 2 faan more, and no extra step, to return to (today's `left` memory).
- **Chains.** A strategy can name the smaller hand each hand falls to (Jorge Yau's: Concealed Triplets to Seven Pairs to All Triplets, Full Flush to Half Flush, Big to Small Four Winds and Three Dragons, All Honors to Half Flush or All Triplets, Thirteen Orphans to Seven Pairs or All Triplets with Mixed Orphans). Without a chain, the picker's next best hand is taken.

The lock (8 tiles of a hand worth 7 faan or more in the first 8 turns) becomes a commitment that only "dead" and "hopeless" can break.

### Layer 3: the discarder

Chooses the move for the hand it is given. Three kinds, one interface (`order(hand, table) -> moves`):

- **Rules** (Jorge Yau, Only Orphans, Lucky Cat Classic). The foundation's scoring, for that hand: each discard by how close it leaves that hand and how many live tiles improve it, then the shared order (the tile that connects least, the fewest copies left), the strategy's priority groups, and safety.
- **A model that scores** (Neural Cat). The rules' best few discards for that hand, reranked by the model's expected score. The model only sees moves that fit the hand, so nothing it picks is overridden afterwards.
- **A model that chooses** (Lucky Cat). The network's share for every legal move, with the moves that go against the hand masked out before the biggest share is taken. Today's check does the same thing one move at a time after the choice; masking is the same result in one step.

Tiles the hand doesn't keep go first, as the one-suit rules and Jorge Yau's targets already do. A discard that leaves the hand ready is always allowed.

### Layer 4: the contradiction check

Unchanged in what it forbids, simpler in what it checks against: the one hand of the turn, not the plan of each discard. With layers 1 to 3 in place it should almost never find anything, so it becomes an assertion: `checked` counts the choices it passed over, and a strategy whose count isn't near zero has a discarder that isn't listening to its hand. That count is a number to watch in every simulation.

## Claims and kongs

A claim is a question for layers 1 and 2: with this meld, which hand would the picker choose, and would the pivot checker stay on or move to it? The claim is taken when the hand after it is the committed hand or a pivot the checker allows, and it leaves the hand closer or worth more; then layer 3 picks the discard that follows and layer 4 checks both. The dragon and scoring-wind pung stays the stated exception (always taken, except on Thirteen Orphans). A kong on your own turn is taken when the hand can hold it and it doesn't cost the hand.

## Each strategy in the pipeline

| Strategy | Hand picker | Pivot checker | Discarder |
| --- | --- | --- | --- |
| Jorge Yau | The shared picker, with his target order and weight | The shared checker, with his chains and the lock | Rules |
| Only Orphans | The shared picker, limited to its hands | The shared checker | Its model, scoring the rules' discards for the hand |
| Lucky Cat Classic | The shared picker | The shared checker | Rules |
| Neural Cat | The shared picker (Jorge Yau's table) | The shared checker | Its model, reranking the best few for the hand |
| Lucky Cat | The shared picker | The shared checker | Its network, with moves against the hand masked out |

A strategy is then a table (hands, order, weights, chains) and a discarder, not a set of hooks into the foundation.

## The coach

The coach says what the pipeline returned, and computes nothing of its own: the hand ("Go for Half Flush in Characters, about 5 faan"), the pivot and its reason ("Pivoting from Full Flush to Half Flush: too few Characters are left"), the move, and why the discarder chose it. When it follows the hand your own discards point to instead of the strategy's, that is a different hand picker in layer 1 (the player's intent), and everything after it is the same. The coach and the bot can then never disagree, because they read one result.

## State

One record a seat, in place of the commit memory, Jorge Yau's opening target and his lock:

```js
seat.handState = { hand, since, locked, left: { family: turn }, pivots: [{ turn, from, to, why }] }
```

It is saved with the game and kept in the native simulator's seat memo. A claim being weighed reads it and doesn't write it, as now.

## Training and the native simulator

- **Training data** records the move the pipeline played, as it does since the contradiction check. It can also record the hand and the pivot, which gives a later model two new things to learn: which hand to pick, and when to leave it.
- **The hand as a feature.** Neither model is told the hand today. Giving it as input (a few numbers: family, suit, steps, faan) needs new data and a new model, so it is not part of this design, but the pipeline makes it possible.
- **The native simulator** ports each stage as it lands, with the same parity check (every action identical to the JS) before it is pinned. Picking the hand once a turn instead of once a discard should make a turn cheaper: about a fourteenth of the plan scoring.

## Building it, in three stages

1. **The pipeline, with no change in play.** `decide()` wraps today's code and returns the shape above: the hand is the first discard's plan, the pivot is the commit memory's. The coach reads it. Checked by playing every strategy's hands action for action against the code before it, in JS and native.
2. **One hand picker and one pivot checker.** The foundation's commit memory, Jorge Yau's targets, chains and lock become layer 1 and 2 with a table for each strategy, and `seat.handState` replaces the three memories. Play changes a little here (every strategy gets the late-wall pivot, for one), so each strategy is measured head to head against stage 1.
3. **The discarder chooses for the turn's hand.** The scoring conditions on the hand from layer 2 instead of choosing a hand for each discard; Neural Cat reranks, and Lucky Cat masks, among moves for that hand. This is the change in play that matters, and the one that should return Neural Cat's loss.

Each stage is its own change, with the native port and a measurement before the next.

## How it will be judged

- **Head to head, each strategy against itself a stage earlier**, each in every seat of the same 20,000 deals against the same table (`lcm-sim play --models X,X~before`), the difference taken deal by deal. A stage is kept when no strategy loses beyond its margin. Stage 3 is expected to gain for Neural Cat; if it doesn't, the design is wrong about why the check costs it.
- **`checked` near zero** for every strategy after stage 3.
- **Pivots a hand.** Counted for each strategy, with their reasons. A strategy that pivots more than about twice a hand is flip-flopping, and the margins are too loose.
- **The coach and the bot agree** on every hint, by construction, and by test.
- **The frontier benchmark** is frozen at 0.57.9 and doesn't move; these are measured against today's players.

## Open questions

- **Does a single hand lose the hedging the per-discard choice gives?** Today a discard that keeps two hands alive scores well for both. The picker keeps the runners-up, and the discarder can still count a backup's value (today's `backup`); how much weight it gets is to be measured in stage 3.
- **Jorge Yau's opening read against the shared value.** His targets are tried in a fixed order; the shared picker ranks by value. Stage 2 keeps his order as a table first, and tries value second.
- **Lucky Cat's hand.** Its network never chose by a hand. Masking by the shared picker's hand gains points today (it stops cheap wins that break its hand), but it also wins fewer hands; whether a picker fitted to what the network is good at does better is open.
- **Folding.** It is a mode above the hand today, and stays one. Whether a folding hand should still name a hand for the coach is a wording question, not a play one.
