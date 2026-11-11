# Iterations

How each Neural Cat, Lucky Cat and Only Orphans model came to be, how it plays differently from the one before it, and what each step taught. Every release of a Neural Cat or Lucky Cat model adds its iterations here and to the GitHub release notes (see [each release](#documenting-a-release)).

**How to read this.** A model has no stated reasons: it scores choices with a network. So "what it does differently" below is measured, from the evaluation each model plays against the best before it (`ml/league/eval-<name>-vs-best.json`: the same deals, the two models two seats each). The reason a change happened is the training that produced it, and where the numbers hint at why, it says so as a reading, not a fact. The coach's text for a single decision is the only place the model explains itself.

Every score here is **points a hand**: one player's average points per hand less the other's, on the same deals, with every deal played from every seat. At 2,000 deals a model-against-model score swings by about ±50 points a hand, and at 6,000 deals by about ±30. Where a 95% margin was measured, it's shown as ±.

## Contents

Every training idea and every milestone model is a section below, in the order they happened.

- [At a glance](#at-a-glance)
- [Before the league](#before-the-league)
  - [j0: learning from the rule bots](#j0-learning-from-the-rule-bots)
  - [s1–s6: self-play against the rule bots (discards only)](#s1s6-self-play-against-the-rule-bots-discards-only)
- [How an iteration is made](#how-an-iteration-is-made)
- [Neural Cat: the league, L1 to L18 (NC1)](#neural-cat-the-league-l1-to-l18-nc1)
  - [At the table: each model against the one before it](#at-the-table-each-model-against-the-one-before-it)
  - [L1: stop claiming everything](#l1-stop-claiming-everything)
  - [L2: claim a little again, kong more](#l2-claim-a-little-again-kong-more)
  - [L3: pungs over chows, more limit hands](#l3-pungs-over-chows-more-limit-hands)
  - [L4: bigger wins, riskier when it loses](#l4-bigger-wins-riskier-when-it-loses)
  - [L5: no better (not kept)](#l5-no-better-not-kept)
  - [L6: from Half Flush to Full Flush](#l6-from-half-flush-to-full-flush)
  - [L7: the limit-hand model](#l7-the-limit-hand-model)
  - [L8: fewer pungs, more concealed](#l8-fewer-pungs-more-concealed)
  - [L9 and L10: not kept](#l9-and-l10-not-kept)
  - [L11: the fewest chows](#l11-the-fewest-chows)
  - [L12 and L13: not kept](#l12-and-l13-not-kept)
  - [L14: wins more often, same size](#l14-wins-more-often-same-size)
  - [L15: not kept](#l15-not-kept)
  - [L16: the biggest wins](#l16-the-biggest-wins)
  - [L17 (NC1): wins more often](#l17-nc1-wins-more-often)
  - [L18: not kept](#l18-not-kept)
  - [The league overall](#the-league-overall)
- [Changes to the base logic during the league](#changes-to-the-base-logic-during-the-league)
- [Neural Cat 2: L19 and the plateau (NC2)](#neural-cat-2-l19-and-the-plateau-nc2)
  - [L19 (NC2): bigger wins again](#l19-nc2-bigger-wins-again)
  - [The plateau: where Neural Cat stands](#the-plateau-where-neural-cat-stands)
- [The lab: Neural Cat 3 to 8 (NC3 to NC8)](#the-lab-neural-cat-3-to-8-nc3-to-nc8)
  - [The benchmark](#the-benchmark)
  - [Lab round 1: nothing kept](#lab-round-1-nothing-kept)
  - [Lab round 2 (NC3): a gentler fine-tune](#lab-round-2-nc3-a-gentler-fine-tune)
  - [Lab round 3 (NC4): leaning toward wins](#lab-round-3-nc4-leaning-toward-wins)
  - [Lab round 4 (NC5): learning from its own newest games](#lab-round-4-nc5-learning-from-its-own-newest-games)
  - [Lab rounds 5 and 6: nothing beat NC5](#lab-rounds-5-and-6-nothing-beat-nc5)
  - [Lab round 7 (NC6): a bigger bonus for winning](#lab-round-7-nc6-a-bigger-bonus-for-winning)
  - [Lab round 8 (NC7): a wider choice](#lab-round-8-nc7-a-wider-choice)
  - [Lab rounds 9 and 10 (NC8): a small step, then a plateau check](#lab-rounds-9-and-10-nc8-a-small-step-then-a-plateau-check)
- [Looking three discards ahead: tried, not shipped](#looking-three-discards-ahead-tried-not-shipped)
- [Fair play](#fair-play)
- [Lucky Cat: the league, LC1 to LC20](#lucky-cat-the-league-lc1-to-lc20)
- [Lucky Cat 2: the lab, LC21 to LC32](#lucky-cat-2-the-lab-lc21-to-lc32)
  - [LC21 (lab model LL1a): the first lab champion](#lc21-lab-model-ll1a-the-first-lab-champion)
  - [LC22 (lab model LL2b): only the newest games](#lc22-lab-model-ll2b-only-the-newest-games)
  - [LC23 (lab model LL3a): recent data again](#lc23-lab-model-ll3a-recent-data-again)
  - [LC24 (lab model LL5b): sharper targets](#lc24-lab-model-ll5b-sharper-targets)
  - [LC25 (lab model LL7b): sharper targets, two rounds on](#lc25-lab-model-ll7b-sharper-targets-two-rounds-on)
  - [LC26 (lab model LL9b): the same two-step again](#lc26-lab-model-ll9b-the-same-two-step-again)
  - [LC27 (lab model LL11a): recent data, two rounds on](#lc27-lab-model-ll11a-recent-data-two-rounds-on)
  - [LC28 (lab model LL13a): fewer points to Neural Cat](#lc28-lab-model-ll13a-fewer-points-to-neural-cat)
  - [LC29 (lab model LL17c): four rounds for one small step](#lc29-lab-model-ll17c-four-rounds-for-one-small-step)
  - [Critique: where the Lucky Cat lab stalled, and what's next](#critique-where-the-lucky-cat-lab-stalled-and-whats-next)
  - [LC30 (lab model LL19b): a wider network](#lc30-lab-model-ll19b-a-wider-network)
  - [LC31 (lab model LL22b): learning from its deal-ins](#lc31-lab-model-ll22b-learning-from-its-deal-ins)
  - [LC32 (lab model LL26b): deal-ins again](#lc32-lab-model-ll26b-deal-ins-again)
- [Only Orphans: the league and the lab (O1 to OL2c)](#only-orphans-the-league-and-the-lab-o1-to-ol2c)
  - [OL2c: more triplet hands](#ol2c-more-triplet-hands)
  - [The plateau after OL2c (lab rounds 3 to 6)](#the-plateau-after-ol2c-lab-rounds-3-to-6)
- [Points first for Lucky Cat (LP2b): the new objective, not shipped](#points-first-for-lucky-cat-lp2b-the-new-objective-not-shipped)
  - [Critique: points first from lc32 learned to beat itself, not the table](#critique-points-first-from-lc32-learned-to-beat-itself-not-the-table)
  - [Critique: at the table, a whole hand's points are too noisy to learn from](#critique-at-the-table-a-whole-hands-points-are-too-noisy-to-learn-from)
  - [Critique: on one wall, a move is judged by a future no player can see](#critique-on-one-wall-a-move-is-judged-by-a-future-no-player-can-see)
- [Suphx for Lucky Cat: an oracle teacher, not an oracle critic](#suphx-for-lucky-cat-an-oracle-teacher-not-an-oracle-critic)
- [Only Orphans: targets by expected points](#only-orphans-targets-by-expected-points)
  - [The targets (rules, with O5's weights)](#the-targets-rules-with-o5s-weights)
  - [OT1a: bigger hands inside the targets](#ot1a-bigger-hands-inside-the-targets)
  - [OT2d: fewer pungs](#ot2d-fewer-pungs)
  - [OT4a: more wins, a few of them small](#ot4a-more-wins-a-few-of-them-small)
  - [OT5e: a bigger win bonus](#ot5e-a-bigger-win-bonus)
  - [OT6e: win bonus 500, a hair better](#ot6e-win-bonus-500-a-hair-better)
  - [OT7c: a new network again](#ot7c-a-new-network-again)
  - [OT11d: win bonus 800, wins without points](#ot11d-win-bonus-800-wins-without-points)
  - [Critique: the screen favored luck, and J favored wins](#critique-the-screen-favored-luck-and-j-favored-wins)
- [The frontier: Lucky Cat generation 1 and Sphinx](#the-frontier-lucky-cat-generation-1-and-sphinx)
  - [The plan and the benchmark](#the-plan-and-the-benchmark)
  - [Phase 0: the Suphx teacher](#phase-0-the-suphx-teacher)
  - [Phase 1: features v2 and the hidden tiles as targets](#phase-1-features-v2-and-the-hidden-tiles-as-targets)
  - [The native simulator](#the-native-simulator)
  - [Native-scale rounds (from 2026-11-09)](#native-scale-rounds-from-2026-11-09)
  - [Where it stands](#where-it-stands)
- [Lucky Cat 3: self-taught and stacked, playing to win (from 2026-11-10)](#lucky-cat-3-self-taught-and-stacked-playing-to-win-from-2026-11-10)
  - [Round 1: a value, judged on points, wins fewer hands](#round-1-a-value-judged-on-points-wins-fewer-hands)
  - [Round 2: the policy learns from the replays (LV2p)](#round-2-the-policy-learns-from-the-replays-lv2p)
  - [The objective: points, with a floor on hands won](#the-objective-points-with-a-floor-on-hands-won)
- [Lucky Cat against its own lineage: LC33 (2026-11-11)](#lucky-cat-against-its-own-lineage-lc33-2026-11-11)
- [Only Orphans on the stacked method (2026-11-10)](#only-orphans-on-the-stacked-method-2026-11-10)
  - [Round 1: replayed labels against the control](#round-1-replayed-labels-against-the-control)
  - [The reader, OR1](#the-reader-or1)
  - [Round 2: the control comes out ahead (OS2c1)](#round-2-the-control-comes-out-ahead-os2c1)
- [The contradiction check: every move agrees with its hand](#the-contradiction-check-every-move-agrees-with-its-hand)
  - [What it is](#what-it-is)
  - [The discard check, measured](#the-discard-check-measured)
  - [Every decision, and every strategy](#every-decision-and-every-strategy)
  - [Head to head: with the check against without it](#head-to-head-with-the-check-against-without-it)
  - [What it taught, and what comes next](#what-it-taught-and-what-comes-next)
- [Frontier Cat: one model, three heads (FC1)](#frontier-cat-one-model-three-heads-fc1)
  - [Thinking](#thinking-2)
  - [Round 1: the heads, as outputs](#round-1-the-heads-as-outputs)
  - [Round 2: the read, as an input](#round-2-the-read-as-an-input)
  - [A wider choice](#a-wider-choice)
  - [Round 3: replayed labels](#round-3-replayed-labels)
  - [Round 4: replays on fresh every-seat data](#round-4-replays-on-fresh-every-seat-data)
  - [Round 5: option replays and a ranking loss](#round-5-option-replays-and-a-ranking-loss)
  - [FC1: what ships, and what it does differently](#fc1-what-ships-and-what-it-does-differently)
- [Where the files are](#where-the-files-are)
- [Documenting a release](#documenting-a-release)

## At a glance

| | Neural Cat | Lucky Cat | Only Orphans |
| --- | --- | --- | --- |
| In the game | **NC9** (lab model N14c; the stacked [FC1](#frontier-cat-one-model-three-heads-fc1) was beside it in 0.58) | **LC32** (lab model LL26b) | **OS2c1** |
| What it is | A network that scores Jorge Yau's best choices in expected points | A network that makes every move itself, with no rules underneath | Fixed rules pick a target each deal (Thirteen Orphans, triplet hands, Seven Pairs); a network, the same kind as Neural Cat's, chooses the rest in expected points |
| What it plays for | Points: often and big wins on one scale | Points first, wins second (LC20 and before: wins, as many and as fast as it can) | Points and wins on one scale (J), with a win bonus of 800 |
| Trained on | 950,000 league hands (stopped in round 19, at a plateau), and earlier rounds against the rule bots | 1,000,000 league hands against its earlier selves and Neural Cat, then 100,000 lab hands against Neural Cat, Jorge Yau and its last two champions, every hand weighted by its points | Its own league (O1 to O5), then 11 lab rounds with the targets against Neural Cat, Jorge Yau, Lucky Cat and its earlier selves |
| Wins / deal-ins | about 9% / 5–6% against other Neural Cat models | about 18–21% against its older selves; 17.9% against Neural Cat's 9.1% | 4.6% of hands won (OT7c: 4.1%) |
| Average win | about 1,900 points | 4–5 faan, about a quarter of Neural Cat's | About 4,000 points (OT6e: 3,961), mostly Seven Pairs |
| Head to head | Beats s5, the model before the league, by about 75–80 points a hand | LC21 beats LC20 by +4.0 to +6.9 points a hand (± 2.3–2.5); loses about 88 points a hand to Jorge Yau (LC20: 103) | +85.1 ± 9.4 points a hand over the rule-based bot (OT7c: +84.9) |

**Not shipped yet.** The [frontier](#the-frontier-lucky-cat-generation-1-and-sphinx) (Lucky Cat generation 1 and Sphinx, with a frozen benchmark and a native simulator) has not passed its bar: Lucky Cat is still lc32.

## Before the league

**In this section:** [j0: learning from the rule bots](#j0-learning-from-the-rule-bots) · [s1–s6: self-play against the rule bots (discards only)](#s1s6-self-play-against-the-rule-bots-discards-only)

Neural Cat's first models learned at tables with the rule bots, discards only.

### j0: learning from the rule bots

The first model learned from the rule strategies (Jorge Yau, Lucky Cat, Only Orphans): 20,000 hands of their discards, each labelled with how the hand ended. It scored **+17.1** points a hand against Jorge Yau.

#### What it taught

a model that chooses among *every* discard is dangerous. Trained only on the bots' own choices, it couldn't tell close discards apart or judge safety, and it dealt in on **12%** of hands while winning 3.5%. So Neural Cat became a reranker: Jorge Yau's foundation lists the discards, and the model chooses among only the **best three** (`TOP_K` = 3). The hand-reading judgment stays, and the model decides the close calls. With `topK: 1` it plays exactly like Jorge Yau, which a test checks.

### s1–s6: self-play against the rule bots (discards only)

`npm run ml:loop` played Neural Cat (exploring) at tables with Jorge Yau, Lucky Cat and Only Orphans. A new model was kept only if it beat the best so far.

| Model | Trained from | Score against Jorge Yau | Kept |
| --- | --- | ---: | --- |
| s1 | j0 | +61.4 | yes |
| s2–s4 | s1 | +34.6 to +52.3 | no |
| s5 | s1 | +76.0 | yes, shipped |
| s6 | s5 | +50.2 | no |

Replayed on fresh deals, s5 scored **+48.5**, not +76. Keeping the best of several noisy scores flatters the winner.

#### What it taught

- **Neural Cat wins less often but bigger.** s5 won about 10.5% of hands to Jorge Yau's 14%, but its average win was 731 points to 292, and it came out ahead. That shape (fewer, bigger wins) has held for every Neural Cat since.
- **Always replay the winner on fresh deals.** The first score of a "best" model is biased upward.
- **The rule bots are a ceiling.** Against fixed opponents, gains stalled after s5.

## How an iteration is made

Each [league](training.md) round does the same four things:

1. **Play.** The best model so far, exploring (`--temperature 150`, `--epsilon 0.05`: it sometimes picks a slightly worse choice or a random one), sits with earlier models at a table of Neural Cat models only, 50,000 hands, keeping about 12% of positions. Exploring is how it finds out whether a different choice would have paid.
2. **Label.** Each kept position is labelled with how its hand really ended (win by self-draw or off a discard, deal in, someone else's win, draw) and the faan won or paid.
3. **Train.** The new model starts from the best model's weights and trains on the league's data so far, the last 8 rounds from round 9 on (`--lr 3e-4`, dropout 0.2, weight decay 1e-3, up to 8 epochs, stopping after 3 without improvement). More rounds means more varied tables: the pool of opponents grows with each round (s5; then L1; then L2 and L3; and so on).
4. **Judge.** The new model plays the best head to head. It is kept, and shipped, only if it scores more points a hand. A kept model is the starting point for the next round.

## Neural Cat: the league, L1 to L18 (NC1)

**In this section:** [At the table: each model against the one before it](#at-the-table-each-model-against-the-one-before-it) · [L1: stop claiming everything](#l1-stop-claiming-everything) · [L2: claim a little again, kong more](#l2-claim-a-little-again-kong-more) · [L3: pungs over chows, more limit hands](#l3-pungs-over-chows-more-limit-hands) · [L4: bigger wins, riskier when it loses](#l4-bigger-wins-riskier-when-it-loses) · [L5: no better (not kept)](#l5-no-better-not-kept) · [L6: from Half Flush to Full Flush](#l6-from-half-flush-to-full-flush) · [L7: the limit-hand model](#l7-the-limit-hand-model) · [L8: fewer pungs, more concealed](#l8-fewer-pungs-more-concealed) · [L9 and L10: not kept](#l9-and-l10-not-kept) · [L11: the fewest chows](#l11-the-fewest-chows) · [L12 and L13: not kept](#l12-and-l13-not-kept) · [L14: wins more often, same size](#l14-wins-more-often-same-size) · [L15: not kept](#l15-not-kept) · [L16: the biggest wins](#l16-the-biggest-wins) · [L17 (NC1): wins more often](#l17-nc1-wins-more-often) · [L18: not kept](#l18-not-kept) · [The league overall](#the-league-overall)

The league trained Neural Cat's first learned models: 19 rounds of self-play at a table of Neural Cat models, each new model judged head to head against the best before it ([how an iteration is made](#how-an-iteration-is-made)). L17 shipped as **NC1**. Each model below is one round: what it trained on, what it does differently, and whether it was kept.

### At the table: each model against the one before it

Per hand dealt to a seat, from each model's evaluation (L1 against s5, the rule-bot-trained model that shipped before the league). "Limit" is the share of its wins that were limit hands, "Concealed" the share won with no melds claimed.

| Model | vs | Chows | Pungs | Kongs | Hands won | Deal-ins | Average win | Limit | Concealed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| L1 | s5 | 0.44 vs 0.82 | 0.46 vs 0.71 | 0.05 vs 0.08 | 9.2% vs 12.2% | 6.2% vs 6.4% | 1,675 vs 892 | 8.4% vs 4.3% | 42% vs 24% |
| L2 | L1 | 0.49 vs 0.46 | 0.49 vs 0.44 | 0.08 vs 0.06 | 8.6% vs 8.9% | 5.4% vs 5.6% | 1,672 vs 1,437 | 8.0% vs 7.2% | 37% vs 43% |
| L3 | L2 | 0.40 vs 0.49 | 0.53 vs 0.49 | 0.08 vs 0.08 | 8.5% vs 8.6% | 5.6% vs 5.5% | 1,537 vs 1,360 | 8.8% vs 5.5% | 34% vs 38% |
| L4 | L3 | 0.44 vs 0.42 | 0.50 vs 0.53 | 0.06 vs 0.07 | 8.7% vs 8.8% | 5.6% vs 5.5% | 1,808 vs 1,483 | 9.4% vs 7.7% | 41% vs 35% |
| L5 (not kept) | L4 | 0.41 vs 0.45 | 0.49 vs 0.49 | 0.07 vs 0.07 | 8.6% vs 8.3% | 5.5% vs 5.4% | 1,708 vs 1,712 | 9.0% vs 7.7% | 40% vs 41% |
| L6 | L4 | 0.41 vs 0.46 | 0.48 vs 0.50 | 0.07 vs 0.08 | 8.3% vs 8.8% | 5.4% vs 5.7% | 1,781 vs 1,662 | 8.8% vs 8.8% | 40% vs 38% |
| L7 | L6 | 0.38 vs 0.41 | 0.48 vs 0.48 | 0.07 vs 0.07 | 8.1% vs 8.2% | 5.1% vs 5.4% | 2,069 vs 1,682 | 10.3% vs 8.7% | 41% vs 39% |
| L8 | L7 | 0.37 vs 0.38 | 0.42 vs 0.47 | 0.07 vs 0.08 | 8.3% vs 8.1% | 5.3% vs 5.3% | 1,889 vs 1,890 | 9.4% vs 9.8% | 43% vs 40% |
| L9 (not kept) | L8 | 0.35 vs 0.37 | 0.41 vs 0.44 | 0.06 vs 0.07 | 8.6% vs 8.5% | 5.6% vs 5.4% | 1,615 vs 1,719 | 8.6% vs 8.0% | 43% vs 42% |
| L10 (not kept) | L8 | 0.39 vs 0.36 | 0.43 vs 0.43 | 0.07 vs 0.07 | 8.6% vs 8.5% | 5.3% vs 5.4% | 1,739 vs 1,835 | 8.1% vs 9.0% | 41% vs 42% |
| L11 | L8 | 0.31 vs 0.36 | 0.40 vs 0.42 | 0.06 vs 0.07 | 8.0% vs 8.2% | 5.4% vs 5.3% | 1,937 vs 1,829 | 10.5% vs 10.0% | 46% vs 43% |
| L12 (not kept) | L11 | 0.40 vs 0.33 | 0.46 vs 0.41 | 0.07 vs 0.07 | 9.1% vs 8.4% | 5.8% vs 5.7% | 1,988 vs 2,188 | 9.4% vs 10.9% | 38% vs 42% |
| L13 (not kept) | L11 | 0.33 vs 0.33 | 0.45 vs 0.40 | 0.07 vs 0.06 | 8.7% vs 8.6% | 5.9% vs 5.6% | 1,748 vs 1,979 | 9.0% vs 9.3% | 41% vs 44% |
| L14 | L11 | 0.31 vs 0.34 | 0.42 vs 0.41 | 0.07 vs 0.06 | 8.9% vs 8.4% | 5.6% vs 5.6% | 1,888 vs 1,852 | 9.1% vs 8.4% | 46% vs 41% |
| L15 (not kept) | L14 | 0.42 vs 0.30 | 0.45 vs 0.42 | 0.06 vs 0.07 | 9.3% vs 8.6% | 6.0% vs 5.8% | 1,741 vs 1,868 | 8.1% vs 9.8% | 39% vs 44% |
| L16 | L14 | 0.39 vs 0.30 | 0.45 vs 0.42 | 0.07 vs 0.07 | 8.5% vs 8.7% | 5.8% vs 5.6% | 1,952 vs 1,630 | 9.3% vs 7.9% | 42% vs 44% |
| L17 (NC1) | L16 | 0.35 vs 0.40 | 0.44 vs 0.46 | 0.07 vs 0.07 | 8.9% vs 8.3% | 5.7% vs 5.7% | 1,907 vs 1,917 | 9.2% vs 9.2% | 42% vs 41% |
| L18 (not kept) | L17 | 0.36 vs 0.35 | 0.41 vs 0.44 | 0.06 vs 0.06 | 9.2% vs 8.8% | 5.9% vs 5.8% | 1,768 vs 1,940 | 8.6% vs 9.6% | 43% vs 41% |

### L1: stop claiming everything

#### Thinking

s5 was trained against the rule bots and learned discards only. L1 was the first model to learn claims and kongs too, from 560,988 positions of s5 exploring against s5. Starting from s5's weights, it had only one round of data and one opponent.
#### What it does differently

It claims about half as often (0.44 chows and 0.46 pungs a hand, against 0.82 and 0.71) and wins fewer hands (9.2% against 12.2%), but each win pays 88% more (1,675 against 892). Nearly twice the share of its wins are concealed (42% against 24%) and twice the share are limit hands (8.4% against 4.3%).
#### Reading

Claiming opens the hand, which costs faan and shows opponents what you hold. s5 claimed far more and won more hands, for small wins. Scored in expected points, L1 traded win count for win size.
#### Result

+62.5 points a hand against s5 (± 50 at this evaluation size), the only league gain clearly beyond noise before round 6.

### L2: claim a little again, kong more

#### Thinking

Two rounds of data (L1 against s5), started from L1.
#### What it does differently

Claims move back up a little (0.49 chows and 0.49 pungs against 0.46 and 0.44), it declares more kongs (0.08 against 0.06), and it wins 16% more per win (1,672 against 1,437) while dealing in slightly less (5.4% against 5.6%). Its concealed share falls (37% against 43%).
#### Reading

L1 may have over-corrected away from claiming, and L2 took some of those claims back, mostly pungs and kongs. The numbers don't show which claims they were.
#### Result

+28.3 points a hand against L1, and +68.4 against s5.

### L3: pungs over chows, more limit hands

#### Thinking

Three rounds, with L1 and s5 in the opponent pool.
#### What it does differently

It claims fewer chows (0.40 against 0.49) and more pungs (0.53 against 0.49). Its limit share jumps from 5.5% to 8.8%. Average win is 13% higher (1,537 against 1,360), and its concealed share is lower (34% against 38%).
#### Reading

A chow builds a plain hand worth few faan, a pung works toward All Triplets and dragon and wind hands. L3 favoured the second.
#### Result

+16.4 points a hand against L2, and +95.7 against s5, its best against s5. It was the shipped model before L7.

### L4: bigger wins, riskier when it loses

#### Thinking

Four rounds, with L1, L2 and s5 in the pool.
#### What it does differently

Average win 22% higher (1,808 against 1,483) and limit hands 9.4% of wins. It wins more Seven Pairs, Concealed Triplets, Seat Wind and Thirteen Orphans hands (about 1 to 3 more per 1,000 hands), and fewer Self-Draw, Full Flush and All Sequences hands. When it deals in it pays more (1,129 a deal-in against 872), a sign that it keeps going for big hands when others threaten.
#### Result

+14.8 points a hand against L3. Against s5 it measured +0.0, which at that evaluation size says it had stopped gaining on s5 even while it beat L3.

### L5: no better (not kept)

#### Thinking

Five rounds, started from L4. Its validation loss fell (2.721 against 2.737).
#### What it does differently

Nothing measurable: its play matched L4's (average win 1,708 against 1,712, deal-ins 5.5% against 5.4%).
#### Result

−3.5 points a hand against L4, so the league kept L4. A lower training loss didn't mean better play. The next round started again from L4.

### L6: from Half Flush to Full Flush

#### Thinking

Started from L4, not L5. It trained on six rounds of data, where round 6 had L4 exploring against s5, L1, L2 and L3. From here the league played 6,000-deal evaluations (about ±30 points a hand) instead of 2,000 (about ±50), because the earlier scores were too noisy to separate models. The league games from round 6 on used Jorge Yau's honor tie-break order (the `honorOrder` tuning), which ships in 0.44.
#### What it does differently

It wins about 3 more Full Flush hands per 1,000 hands and 5 fewer Half Flush hands, plus more All Sequences and Concealed Triplets, and fewer All Triplets and Dragon Triplet. The faan per win rises from 6.49 to 6.87, with a slightly lower win rate (8.3% against 8.8%).
#### Reading

It more often commits all the way to one suit instead of stopping at a Half Flush that includes honors, taking a slower, bigger hand.
#### Result

+7.9 ± 30 points a hand against L4: kept, but not a clear gain on its own.

### L7: the limit-hand model

#### Thinking

Seven rounds, started from L6, trained on 3,994,461 positions, with s5, L2, L3 and L4 in the pool. Its held-out accuracy and outcome loss are the best so far (73.3%, 0.896).
#### What it does differently

It claims fewer chows still (0.38 against 0.41), and 10.3% of its wins are limit hands against 8.7% (400 against 340 over 6,000 deals). Its average win is 23% higher (2,069 against 1,682) though it wins no more often (8.1% against 8.2%). It deals in less (5.1% against 5.4%). It wins more Concealed Triplets, Thirteen Orphans and Seven Pairs hands, and fewer Half Flush, Concealed, Self-Draw and Chicken Hand wins.
#### Reading

Each model since L1 has moved toward fewer, bigger wins. L7 takes it furthest: it claims fewer chows and keeps hands for limit hands, while dealing in a little less. The numbers show the result, not which individual choices changed.
#### Result

+41.1 ± 33 points a hand against L6, just beyond its margin. It shipped until NC1 (L17).

### L8: fewer pungs, more concealed

#### Thinking

Started from L7, on rounds 1–8 (4,571,784 positions), with s5, L3, L4 and L6 in the pool.
#### What it does differently

It claims fewer pungs (0.42 against 0.47) and wins more hands with no melds claimed (43% against 40%). Its average win is the same as L7's (1,889 against 1,890). When it deals in, it pays more (1,165 a deal-in against 1,072).
#### Result

+2.1 ± 32 points a hand against L7: kept, but no measurable gain.

### L9 and L10: not kept

#### Thinking

Both started from L8, with s5, L4, L6 and L7 in the pool. From round 9 the league trains on its last 8 rounds, so the training set stops growing (about 4.6 million positions).
- **What they do differently.** L9 won smaller hands (1,615 against 1,719). L10 claimed a few more chows (0.39 against 0.36) and also won smaller (1,739 against 1,835).
#### Result

−3.1 ± 29 and −9.5 ± 32 points a hand against L8. Round 10 also measured L10 against s5: **+81.6 ± 32**, the clearest sign yet that the league as a whole had moved well past s5.

### L11: the fewest chows

#### Thinking

Started from L8, on rounds 4–11.
#### What it does differently

It claims the fewest chows of any model so far (0.31 against 0.36), wins more hands concealed (46% against 43%), and more of its wins are limit hands (10.5% against 10.0%). Average win 1,937 against 1,829.
#### Result

+1.4 ± 31 points a hand against L8: kept, within the noise.

### L12 and L13: not kept

#### Thinking

Both started from L11, with s5, L6, L7 and L8 in the pool.
- **What they do differently.** L12 claimed more (0.40 chows and 0.46 pungs against 0.33 and 0.41) and won more often (9.1% against 8.4%), but smaller (1,988 against 2,188). L13 claimed more pungs, won smaller (1,748 against 1,979) and dealt in more (5.9% against 5.6%).
#### Result

−5.3 ± 35 and **−34.1 ± 31**. L13 is the one model the league clearly rejected: claiming more cost it more than it won.

### L14: wins more often, same size

#### Thinking

Started from L11, on rounds 7–14.
#### What it does differently

It wins more often (8.9% against 8.4%) with the same size of win (1,888 against 1,852), more of them concealed (46% against 41%) and more of them limit hands (9.1% against 8.4%).
#### Result

+17.6 ± 33 points a hand against L11.

### L15: not kept

#### Thinking

Started from L14, with s5, L7, L8 and L11 in the pool.
#### What it does differently

More chows (0.42 against 0.30), more wins (9.3% against 8.6%), smaller wins (1,741 against 1,868).
#### Result

−0.0 ± 32 against L14. Against s5: **+75.5 ± 33**, the league still far ahead of where it started.

### L16: the biggest wins

#### Thinking

Started from L14, on rounds 9–16.
#### What it does differently

Its wins pay the most of any model against its predecessor: 1,952 points against 1,630, 7.32 faan against 6.81, and 9.3% limit hands against 7.9%. It also pays less when it deals in (949 a deal-in against 1,193). It claims more chows than L14 (0.39 against 0.30), so not every chow it takes is a cheap one.
#### Result

**+43.9 ± 31** points a hand against L14, one of the three clear gains of the league (with L1 and L7).

### L17 (NC1): wins more often

#### Thinking

Started from L16, on rounds 10–17, with s5, L8, L11 and L14 in the pool.
#### What it does differently

Fewer chows (0.35 against 0.40), and it wins more often (8.9% against 8.3%) with about the same size of win (1,907 against 1,917). Its wins are a little cheaper in faan (6.92 against 7.19), and it pays more when it deals in (1,152 against 994).
#### Reading

L16 found bigger hands; L17 keeps most of that while finishing more hands.
#### Result

+6.9 ± 33 points a hand against L16: kept, within the noise. It ships as **NC1**, the first release under the NC names.

### L18: not kept

#### Thinking

Started from L17, with s5, L11, L14 and L16 in the pool.
#### What it does differently

It won more often (9.2% against 8.8%) but smaller (1,768 against 1,940).
#### Result

−5.7 ± 32 against L17.

### The league overall

Every league round's score against the best before it, against s5 where that was played, and its held-out accuracy:

| Model | Against | vs the best | vs s5 | Wins | Deal-ins | Average win | Held-out accuracy | Kept |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| L1 | s5 | +62.5 | +62.5 | 9.3% | 6.2% | 1,675 | 68.6% | yes |
| L2 | L1 | +28.3 | +68.4 | 8.6% | 5.4% | 1,672 | 69.0% | yes |
| L3 | L2 | +16.4 | +95.7 | 8.5% | 5.6% | 1,537 | 70.6% | yes |
| L4 | L3 | +14.8 | +0.0 | 8.7% | 5.6% | 1,808 | 71.8% | yes |
| L5 | L4 | −3.5 | +0.3 | 8.6% | 5.5% | 1,708 | 72.6% | no |
| L6 | L4 | +7.9 ± 30 | | 8.3% | 5.4% | 1,781 | 73.0% | yes |
| L7 | L6 | +41.1 ± 33 | | 8.1% | 5.1% | 2,069 | 73.3% | yes |
| L8 | L7 | +2.1 ± 32 | | 8.3% | 5.3% | 1,889 | 73.8% | yes |
| L9 | L8 | −3.1 ± 29 | | 8.6% | 5.6% | 1,615 | 74.6% | no |
| L10 | L8 | −9.5 ± 31 | +81.6 ± 32 | 8.6% | 5.3% | 1,739 | 75.5% | no |
| L11 | L8 | +1.4 ± 31 | | 8.0% | 5.4% | 1,937 | 75.8% | yes |
| L12 | L11 | −5.3 ± 35 | | 9.1% | 5.8% | 1,988 | 76.0% | no |
| L13 | L11 | −34.1 ± 31 | | 8.7% | 5.9% | 1,748 | 76.2% | no |
| L14 | L11 | +17.6 ± 33 | | 8.9% | 5.6% | 1,888 | 76.3% | yes |
| L15 | L14 | −0.0 ± 32 | +75.5 ± 33 | 9.3% | 6.0% | 1,741 | 76.7% | no |
| L16 | L14 | +43.9 ± 31 | | 8.5% | 5.8% | 1,952 | 76.6% | yes |
| **L17 (NC1)** | L16 | +6.9 ± 33 | | 8.9% | 5.7% | 1,907 | 77.0% | yes, shipped |
| L18 | L17 | −5.7 ± 32 | | 9.2% | 5.9% | 1,768 | 77.1% | no |

"Held-out accuracy" is how often the model names how a hand ends, on positions from deals it wasn't trained on. The league was planned for 20 rounds and stopped during round 19, after 950,000 hands.

#### What it taught

- **The league beats the starting point by a clear margin.** L10 beat s5 by +81.6 ± 32 and L15 by +75.5 ± 33, and neither was even kept: the whole league is well past s5. That's beyond the noise, and the biggest gain of any phase.
- **Each round's step is small.** Most new models land within ±30 of the best. Only three steps were clearly beyond the noise: L1 over s5 (+62.5), L7 (+41.1) and L16 (+43.9). The rest of the progress comes from many small, noisy steps.
- **Reading the hand keeps improving, even when points don't.** Held-out accuracy rose with almost every model, from 68.6% to 77.1%, including models that weren't kept. Data and training kept getting better; winning more points per hand is the harder part.
- **The gains are in the size of wins.** Win rate stayed at 8–9% and deal-ins at 5–6% throughout. The average win went from about 1,670 points (L1–L2) to about 1,900–2,070 (L7 onward). The league learned to steer toward bigger hands, the trade-off expected points exist to make. L7, for example, won about as often as L6 but each win paid 23% more, and it won 18% more limit hands.
- **2,000-deal evaluations were too noisy.** Rounds 1–5 used them (±50), so L4 and L5's scores against s5 (+0.0, +0.3) said nothing. From round 6 the league plays 6,000 deals (±30) and records the margin, and measures against s5 every 5 rounds to save time.
- **Training data levels off.** With an 8-round window the training set stays at about 4.6 million positions from L8 on. More rounds now bring fresher data, not more of it.
- **It reached a plateau.** After L7, new models were kept about half the time, mostly within the noise. See the next section.

## Changes to the base logic during the league

Neural Cat plays Jorge Yau's foundation, so improving Jorge Yau improves what Neural Cat chooses from. The league was restarted at round 6 on new base logic, and every round after it plays whatever the foundation is at the time.

| Change | Tested as | Result | Decision |
| --- | --- | ---: | --- |
| Shared claim rules instead of Jorge Yau's own (claim anything that gets closer) | Jorge Yau against itself, 6,000 deals | **+47.1 ± 16.7** | On since 0.43.0 |
| | At a mixed table (Lucky Cat, Neural Cat), 4,000 deals | +40.8 ± 32.5 | |
| | Neural Cat with shared claims, 3,000 deals | +0.0 ± 42.3 | No change: its model makes its own claims |
| Own claims only while locked onto a big hand | Against shared claims, 6,000 deals | −2.1 ± 19.9 | Not used; shared claims are simpler |
| Keep pairs over singles (throw honors) | Jorge Yau, 6,000 deals | −14.8 ± 17.6 | Off |
| Keep pairs over singles (throw number tiles only) | Jorge Yau, 6,000 deals | −19.8 ± 17.6 | Off |
| Keep pairs, Neural Cat | 3,000 deals | +2.2 ± 41.8 | Off |
| Keep tied honors by value (0-faan winds first, 2-faan winds last) | Jorge Yau, 6,000 deals | +2.0 ± 17.7 | On: the right order, and the coach teaches it |
| A screen of 11 other Jorge Yau knobs (target weight, give-up point, feeding, defense, how much a hand is worth) | Jorge Yau, 3,000 deals each | all between −8.3 and +2.5, ±28 | None changed |

### What it taught

- **Jorge Yau's own claim rule was its biggest weakness.** It took any claim that moved the hand closer, so it chowed about six times as often as the shared rules (0.57 chows a hand against 0.09). Its hands opened early and paid little: an average win of 298 points against 482 with shared claims, and more deal-ins (9.5% against 8.6%). One change was worth more than everything the tuning screen tried.
- **Many pairs are good, but breaking a single to keep one isn't.** Keeping pairs won as often but with smaller hands (about 340 points a win against 430). The coach no longer calls many pairs a problem; the bot logic stays as it was.
- **Most knobs were already near their best.** Nothing in the tuning screen moved the score beyond its noise.

## Neural Cat 2: L19 and the plateau (NC2)

**In this section:** [L19 (NC2): bigger wins again](#l19-nc2-bigger-wins-again) · [The plateau: where Neural Cat stands](#the-plateau-where-neural-cat-stands)

The league stopped during round 19, at a plateau. L19, never judged by the league, turned out better than NC1 on a long benchmark and shipped as **NC2**. Why the league stalled, and what the lab changed, follow.

### L19 (NC2): bigger wins again

#### Thinking

Started from L17, on rounds 12–19 (4,647,945 positions), with s5, L11, L14 and L16 in the pool. Its held-out accuracy is the best yet (77.2%).
#### What it does differently

Against NC1 on 20,000 deals, its average win is 14% bigger (2,091 points against 1,835) while it wins slightly less often (8.5% against 9.2%) and deals in slightly more (6.0% against 5.7%).
#### Result

The league was stopped while L19 played its 6,000-deal evaluation, so the league never judged it. The 20,000-deal benchmark that followed did: **+20.5 ± 18.2** points a hand over NC1, J +17.0 against a standard error of about 9, a clear gain by the lab's rule. It ships as **NC2**, and the lab starts from it.
#### Reading

Stopping the league cost exactly the model it would have kept. A model's first evaluation is a coin flip at ±30; only a long one tells.

### The plateau: where Neural Cat stands

The league was stopped during round 19 because Neural Cat looked like it had stopped improving: since about L7, each round's step was too small to see. The long benchmark that followed showed it hadn't fully stopped: NC1 beats L7 by +21.3 ± 18.0, and L19 beats NC1 by +20.5 ± 18.2 and ships as NC2. Slow, real gains were hidden by noisy evaluations.

#### The evidence

| Measure | L1–L7 | L8–L18 |
| --- | --- | --- |
| Gain over the model before it | +62, +28, +16, +15, +8, +41 points a hand | Mostly −10 to +7, against noise of ±30 |
| Models clearly better than the one before | L1 and L7 | Only L16 (+43.9 ± 31) |
| Against s5, the fixed starting model | L1 +62 (L3 +96 and L4 +0.0 at ±50, too noisy to read) | L10 +81.6 ± 32, L15 +75.5 ± 33: flat |
| Average win | 1,670 rising to 2,070 points | About 1,900 points, flat |
| Held-out accuracy | 68.6% to 73.3% | 73.8% to 77.1%, rising slowly |

- **The fixed comparison is the clearest sign.** Against s5, the round-10 and round-15 models score the same. If the league were still improving, that number would rise.
- **Several models were kept on noise.** A model was kept if it scored above 0 against the best, so L8 (+2.1), L11 (+1.4) and L17 (+6.9) were kept, but each was a coin flip at ±30. The "best" model became partly a random walk.
- **The model still reads hands better, but that doesn't turn into points.** Its accuracy at predicting how a hand ends kept rising slowly, but it stopped translating into more points a hand.

#### Why it stalled

1. **The model can't stray far from Jorge Yau.** It only chooses among Jorge Yau's top 3 discards (`TOP_K` = 3). Once it picks the best of those three well, there's little room left. This is probably the main limit.
2. **It plays near-copies of itself.** The pool is L models that all play alike, so new rounds teach little that's new.
3. **The training data stopped growing.** With an 8-round window it has been about 4.6 million positions since L8, with the same network size (256 and 128 hidden units) and the same features.
4. **Evaluations can't see small gains.** At 6,000 deals the margin is about ±30 points a hand, so a real gain of +10 is invisible.

#### What to do next, in order

1. **Measure honestly first.** Play NC1 against s5, L7 and L11 over about 20,000 deals each (about ±15 points a hand). That shows whether anything real was gained since L7. L19, never judged, can be measured the same way.
2. **Make keeping a model stricter.** Keep a new model only if it beats the best by more than its margin, or re-test close calls on more deals. That stops the noise-driven random walk.
3. **Raise the ceiling.** Let the model choose among Jorge Yau's top 5 discards instead of 3, try a bigger network (512 and 256), and add features for what it can't yet see.
4. **Vary the opponents.** Put LC20, Jorge Yau and Lucky Cat Classic in the pool, so it learns against different styles, not only copies of itself.

More rounds of the same league were unlikely to help, so the league was replaced by the lab, which does all four (next section). The league's data for rounds 10–19 seeds the lab's first rounds.

## The lab: Neural Cat 3 to 8 (NC3 to NC8)

**In this section:** [The benchmark](#the-benchmark) · [Lab round 1: nothing kept](#lab-round-1-nothing-kept) · [Lab round 2 (NC3): a gentler fine-tune](#lab-round-2-nc3-a-gentler-fine-tune) · [Lab round 3 (NC4): leaning toward wins](#lab-round-3-nc4-leaning-toward-wins) · [Lab round 4 (NC5): learning from its own newest games](#lab-round-4-nc5-learning-from-its-own-newest-games) · [Lab rounds 5 and 6: nothing beat NC5](#lab-rounds-5-and-6-nothing-beat-nc5) · [Lab round 7 (NC6): a bigger bonus for winning](#lab-round-7-nc6-a-bigger-bonus-for-winning) · [Lab round 8 (NC7): a wider choice](#lab-round-8-nc7-a-wider-choice) · [Lab rounds 9 and 10 (NC8): a small step, then a plateau check](#lab-rounds-9-and-10-nc8-a-small-step-then-a-plateau-check)

After the plateau, Neural Cat's training was rebuilt as the lab (`npm run ml:lab`, [how it works](training.md#4-the-lab-npm-run-mllab)), starting from NC1 (L17). It does each step above:

| The plateau's lesson | What the lab does |
| --- | --- |
| Measure honestly | NC1 is benchmarked against s5, L7, L11 and L19 on 20,000 deals each (about ±15 points a hand), and every candidate that looks ahead is re-judged on 20,000 fresh deals |
| Keep only clear gains | A candidate is kept only if it beats the champion by more than its standard error on those 20,000 deals, not on any score above 0 |
| Score wins as well as points | The objective is J = points a hand + 5 × hands won (percentage points) |
| Raise the ceiling | Experiments choose among more of Jorge Yau's discards (`topK`), add a bonus for the chance to win (`winBonus`), change the claim margin, and train wider (512, 256) and deeper (512, 256, 128) networks from scratch |
| Vary the opponents | Each round's table mixes the champion with its last three predecessors, s5, Jorge Yau, LC20 and Lucky Cat Classic |
| Learn from failures | Each experiment's results are kept, and the next round favours the experiments that have paid, while still trying the rest now and then |
| Don't stall quietly | After 3 rounds with no new champion the lab escalates: bolder experiments, more exploration, and longer judging of close calls. After 6 it stops and says what it tried |

New features (what the model can't yet see) need new data from scratch, so they're not an experiment yet. They're the next step if these stall.

### The benchmark

NC1 (L17), 20,000 deals against each, every deal played from every seat, two seats each:

| NC1 against | Points a hand | Hands won | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: |
| L19 | −20.5 ± 18.2 | 9.2% vs 8.5% | 5.7% vs 6.0% | 1,835 vs 2,091 |
| L7 | +21.3 ± 18.0 | 8.8% vs 8.5% | 5.6% vs 5.5% | 1,910 vs 1,740 |
| L11 | +18.2 ± 18.0 | 8.9% vs 8.5% | 5.8% vs 5.6% | 1,895 vs 1,848 |
| s5 | +80.0 ± 17.6 | 8.7% vs 13.2% | 6.6% vs 7.0% | 1,996 vs 905 |

- **The league did improve after L7**, by about 20 points a hand over ten rounds (NC1 beats L7 and L11 by about the same), too slowly for its 6,000-deal evaluations to see.
- **The league as a whole is +80 points a hand past s5**, the model it started from. NC1 wins far fewer hands than s5 (8.7% against 13.2%) but its wins are more than twice as big.
- **L19 is better than NC1**, so the lab starts from it, shipped as NC2.

The lab's rounds go below as they finish.

### Lab round 1: nothing kept

Starting from NC2 (L19), on 50,000 deals against L14, L16, L17, s5, Jorge Yau, LC20 and Lucky Cat Classic. Five experiments: three re-trainings (fine-tune at 3× the learning rate, fine-tune, a wider 512-256 network from scratch) and two play changes (`winBonus` 0 → 50, `topK` 3 → 5).

- **`topK` 3 → 5 looked best on 6,000 deals** (+39.0 ± 35.6 points a hand: wins fell from 9.1% to 7.2%, but the average win rose from 1,883 to 2,759 points). On 20,000 fresh deals it fell to +12.7 ± 19.5, J +2.6: within the noise, rejected. Choosing among more of Jorge Yau's discards makes bigger, rarer wins, about even overall.
- **The fast fine-tune** was −11.8 ± 18.2 on 20,000 deals: rejected.
- **The wider network from scratch** was even (−1.2 ± 33.5 on 6,000 deals): one round of data isn't enough to train a bigger network from nothing.

### Lab round 2 (NC3): a gentler fine-tune

#### Thinking

Round 1's fine-tunes moved too far, or not usefully. The bandit tried the other end: fine-tune at a third of the learning rate, plus a deeper network (512-256-128) from scratch, recent-data-only, `topK` 3 → 2 and `claimMargin` 0 → 25.
#### Result

The slow fine-tune, N2b, beat NC2 by **+8.1 ± 18.3** points a hand on 20,000 fresh deals, winning 9.0% against 8.4% with deal-ins down from 6.0% to 5.7%: **J +11.4**, beyond its standard error. It ships as **NC3**. The deeper network was even (+1.2 ± 17.5); `topK` 2 lost badly on 6,000 deals (−40.9: more, smaller wins); recent-data-only and the claim margin lost too.
- **What the bot does differently.** It wins a little more often and deals in a little less, with wins about the same size (1,896 against 1,963 points): the same style as NC2, slightly sharper. The gain is in J, mostly from the extra wins; the points alone are within their margin.

### Lab round 3 (NC4): leaning toward wins

#### Thinking

Round 2's gain was mostly more wins, so the bandit pushed on that: the same network with `winBonus` 0 → 150, `topK` 3 → 4, a plain fine-tune, the slow fine-tune again and a deeper network.
#### Result

`winBonus` 150 (N3d) won on 6,000 deals (J +40.4) and held on 20,000 fresh ones: **+7.5 ± 17.5 points a hand, 12.2% of hands won against 8.7%, deal-ins 6.6% against 7.3%, J +25.3**, beyond its standard error. It ships as **NC4** with the NC3 weights and a new play setting. The plain fine-tune looked best on points (+26.7) and fell to −10.3 on 20,000 deals: rejected. `topK` 4 (+14.1) and the rest were not re-judged.
- **What the bot does differently.** It wins about four hands in a hundred more, with smaller wins (1,347 against 1,853 points). It takes a ready hand over a bigger one that is further off.

### Lab round 4 (NC5): learning from its own newest games

#### Thinking

NC4's games are a new style, and the old data is not. The bandit tried a fine-tune on the last three rounds only, a wider network from scratch, a faster fine-tune, a lower `winBonus` and a negative claim margin.
#### Result

The recent-data fine-tune (N4c) beat NC4 by **+4.9 ± 16.9** points a hand on 20,000 fresh deals, winning 12.6% against 11.4%: **J +11.1**. It ships as **NC5**. The faster fine-tune (J +3.5) was within the noise; the wider network, lower `winBonus` and claim margin did nothing.
- **What the bot does differently.** The same style as NC4, a little sharper: slightly more wins, slightly smaller ones (1,220 against 1,275 points).

### Lab rounds 5 and 6: nothing beat NC5

#### Thinking

Round 5 asked whether more of what worked would keep working: the slow fine-tune, a plain fine-tune, a wider network, `winBonus` 150 → 300 and `topK` 3 → 4. Round 6 repeated the fine-tunes, tried a deeper network, and nudged `winBonus` to 200 and `topK` to 5. Several looked good on 6,000 deals (the slow fine-tune J +23.6, `topK` 4 J +14.3).
#### Result

Every one that was re-judged on 20,000 fresh deals fell inside the noise: N5b J −2.9, N5e (`topK` 4) +8.5 (+14.3 points ± 17.4, not beyond its margin), N6b −5.2, N6d (`winBonus` 200) +4.7. NC5 stayed champion for two rounds.
- **Self-critique.** A 6,000-deal result is about ±30 points, so the best of five candidates is mostly the luckiest of five. The 20,000-deal check did its job. The lab also kept picking the same experiments, so the next rounds leaned on the arms that had the best record and on the two play settings that had paid off before, `winBonus` and `topK`.

### Lab round 7 (NC6): a bigger bonus for winning

#### Thinking

The plateau was in the network, not in what it was asked to do. Round 3 showed the choice (`winBonus`) mattered more than any re-training, so the bandit tried the next step of it: 150 → 300, with no new training.
#### Result

N7e beat NC5 by **+22.0 ± 16.9** points a hand on 20,000 fresh deals, winning 14.7% of hands against 12.3% with deal-ins 8.6% against 8.9%: **J +34.2**, the biggest gain since round 3. It ships as **NC6**. The recent-data fine-tune (N7b, J −0.6) did not hold on 20,000 deals.
- **What the bot does differently.** It takes a ready hand over a bigger one that is further off more often: more wins, each smaller (1,070 against 1,176 points).

### Lab round 8 (NC7): a wider choice

#### Thinking

With wins now worth more, the model may be right more often than Jorge Yau's ordering of discards lets it show. `topK` is how many of Jorge Yau's best discards the model reorders; 3 → 4 gives it one more to consider. A bigger `winBonus` (300 → 450) was tried too.
#### Result

`topK` 4 (N8e) beat NC6 by **+20.4 ± 17.1** points a hand on 20,000 fresh deals (wins 13.7% against 14.6%, average win 1,168 against 965): **J +15.8**. It ships as **NC7**. `winBonus` 450 (J +2.2) won more hands (15.9%) but with smaller wins, no better.
- **What the bot does differently.** A little fewer wins than NC6 but bigger ones: the extra discard it can pick is sometimes a slower, larger hand.

### Lab rounds 9 and 10 (NC8): a small step, then a plateau check

- **Round 9.** The wider network, the fine-tunes, `winBonus` 250 and a claim margin of +25 all fell inside the noise (J +1.8 and +5.5 for the two that were re-judged). NC7 stayed champion.
- **Round 10.** The 3× learning-rate fine-tune looked like a breakthrough on 6,000 deals (J +52.1) and was nothing on 20,000 (J +0.1, points +1.9 ± 17.5): rejected. The slow fine-tune (N10c, from NC7 on the lab's newest eight rounds of games) held: **+7.7 ± 16.9** points a hand, 14.5% of hands won against 13.5%, deal-ins 9.2% against 9.6%, **J +12.9**, beyond its standard error. It ships as **NC8**. `topK` 5 and the wider network did not beat NC7.
- **What the bot does differently.** Slightly more wins and slightly fewer deal-ins than NC7, with a smaller average win (1,078 against 1,157 points): the same style, sharper.
- **Where this leaves the lab.** Rounds 1 to 10 lifted J by about +100 in total, and about half of it came from two play settings that retrained nothing (`winBonus` and `topK`). The fine-tunes now give about +10 a round, near the lab's detection limit. The next gains likely need new information (a different training signal, or more diverse opponents), not more fine-tuning.

## Looking three discards ahead: tried, not shipped

Not a new network: the same weights (NC2, LC20, O5), choosing differently. [What was built and the full numbers](decisions.md#looking-ahead-depth-tried-not-shipped).

### Thinking

Each network reads only the position one discard leaves; its read guesses the rest of the hand from features (steps from ready, live tiles, the plan). Playing out the next two draws and discards replaces part of that guess with the tiles that could really come, weighted by the copies the seat hasn't seen, so it stays fair. Neural Cat and Only Orphans have a value, so their search is an expectimax with the network at the leaves; Lucky Cat has only a policy, so its policy prunes and short rollouts of its own moves give the value.
### What it did differently

With the search, Neural Cat threw a different tile than its one-deep read on about 1 turn in 5, Lucky Cat on about 1 in 13, Only Orphans on 2 in 5. It kept the tiles that make a hand ready on a live wait.
### Result

3,000 deals each, depth 3 against depth-1 copies, then depth 1 in the same seat on the same deals:

  | Model | Points a hand | Hands won |
  | --- | ---: | ---: |
  | Neural Cat | +9.8 ± 29.0 | +1.16 ± 0.50 points |
  | Lucky Cat | −5.5 ± 6.2 | +1.79 ± 0.63 points |
  | Only Orphans | +5.0 ± 32.2 | +0.30 ± 0.31 points |

### Reading

For Neural Cat and Lucky Cat the gain is in how often they win, not in points, and Lucky Cat's wins got smaller. The search sees only the seat's own next draws, so it finishes close hands better and can't see the other players. At about 10 times the time a move, with points flat, it **wasn't shipped**: every model still plays one discard deep.
- **Limits.** 3,000 deals rather than 20,000, against copies of the same model, with untuned search settings. A fair retry measures against the current models on 20,000 deals.

## Fair play

A test plays every strategy, then shuffles everything a seat can't see (the wall, other hands, the tile of a concealed kong) and traps the hidden records. Every feature and every move must come out the same. It caught a real leak: the foundation read the tile of other players' concealed kongs, and so did the coach. Both were fixed (`shownMelds`) before the league trained on anything.

## Lucky Cat: the league, LC1 to LC20

Lucky Cat started from nothing: a network with every weight at zero, so every legal move was equally likely. It learned only from hands it won, the quicker the win the more. It played its own earlier selves, and from round 7 a third of its opponent seats were Neural Cat. A new model was kept only if it won more hands than the best at the same table.

| Round | New model wins | Best before wins | Discards per win |
| --- | ---: | ---: | ---: |
| 1 | 2.00% | 0.59% (random) | 18.0 |
| 3 | 6.16% | 2.73% | 18.9 |
| 6 | 11.95% | 8.95% | 18.6 |
| 10 | 14.71% | 13.73% | 17.9 |
| 14 | 17.32% | 15.16% | 17.5 |
| 17 | 17.51% | 17.14% | 17.3 |
| **20 (LC20)** | 20.36% | 17.63% | 16.9 |

Against Neural Cat, over 1,000 deals each round:

| Round | Lucky Cat wins | Neural Cat wins | Lucky Cat points a hand |
| --- | ---: | ---: | ---: |
| 7 | 8.92% | 11.33% | −159.8 |
| 10 | 11.05% | 10.70% | −103.6 |
| 14 | 13.08% | 10.32% | −154.5 |
| 17 | 15.07% | 10.47% | −160.0 |
| 20 | 17.90% | 9.13% | −109.1 |

### What it taught

- **Learning from wins alone works, from scratch.** A random player wins about 0.4% of hands. After a million hands Lucky Cat wins about 20% against its older selves, and 18 of 20 new models beat the best before them.
- **It gets what it's rewarded for.** It was rewarded for winning quickly, so it wins often (nearly twice as often as Neural Cat by the end) and fast (16.9 discards per win, down from 18). It wasn't rewarded much for size, so its wins stay at 4–5 faan against Neural Cat's 8, and it still loses about 100–160 points a hand to Neural Cat.
- **Points stay close between its own versions.** LC20 beats its older selves by +0.2 to +27.1 points a hand, because every version wins cheap hands. Its progress shows in wins, not points.
- **It needs no rules to play well.** Lucky Cat has no steps-from-ready count, plans or threat reads. It learned all of that from its wins, and the fair-play test checks it too.

## Lucky Cat 2: the lab, LC21 to LC32

**In this section:** [LC21 (lab model LL1a): the first lab champion](#lc21-lab-model-ll1a-the-first-lab-champion) · [LC22 (lab model LL2b): only the newest games](#lc22-lab-model-ll2b-only-the-newest-games) · [LC23 (lab model LL3a): recent data again](#lc23-lab-model-ll3a-recent-data-again) · [LC24 (lab model LL5b): sharper targets](#lc24-lab-model-ll5b-sharper-targets) · [LC25 (lab model LL7b): sharper targets, two rounds on](#lc25-lab-model-ll7b-sharper-targets-two-rounds-on) · [LC26 (lab model LL9b): the same two-step again](#lc26-lab-model-ll9b-the-same-two-step-again) · [LC27 (lab model LL11a): recent data, two rounds on](#lc27-lab-model-ll11a-recent-data-two-rounds-on) · [LC28 (lab model LL13a): fewer points to Neural Cat](#lc28-lab-model-ll13a-fewer-points-to-neural-cat) · [LC29 (lab model LL17c): four rounds for one small step](#lc29-lab-model-ll17c-four-rounds-for-one-small-step) · [Critique: where the Lucky Cat lab stalled, and what's next](#critique-where-the-lucky-cat-lab-stalled-and-whats-next) · [LC30 (lab model LL19b): a wider network](#lc30-lab-model-ll19b-a-wider-network) · [LC31 (lab model LL22b): learning from its deal-ins](#lc31-lab-model-ll22b-learning-from-its-deal-ins) · [LC32 (lab model LL26b): deal-ins again](#lc32-lab-model-ll26b-deal-ins-again)

From LC21 Lucky Cat moved to the lab: each round trains several arms on fresh games against the champion's last versions, Neural Cat and Jorge Yau, and a model ships only for a clear gain on 20,000 new deals. Every model below is one kept round.

### LC21 (lab model LL1a): the first lab champion

#### Thinking

The league kept a new model whenever it won more hands than the best over 2,000 deals, where the win-rate margin is about ±1 point. That's enough to see the league's big early gains, but not the half-point steps near the end. So Lucky Cat moved to the lab: the same rule as Neural Cat's, a clear gain over 20,000 new deals (about ±0.4 points of win rate), with several fine-tunes tried each round. Its first lab round played 50,000 hands with lc20 against lc17, lc18, lc19, Neural Cat (two seats' worth) and Jorge Yau. Jorge Yau and the newer Neural Cat were new to it: the league's tables were only itself and NC1. It then tried three fine-tunes of lc20 on that round's 153,016 winning moves: at its usual rate (`finetune`), on a longer window (`long`, the same with one round of data so far), and with sharper targets (`sharp`, label smoothing 0.01).
#### What it does differently

Against lc20 over 20,000 deals, it wins 20.5% of its seats to 19.0%, in the same 16.7 discards a win and at the same 4.8 faan, and deals in a little less (14.0% against 14.3%). Against Neural Cat NC2 it wins 19.1% of hands to lc20's 18.3%.
#### Reading

One round against new opponents (Jorge Yau's rule-based play, and NC2) taught it something its own league couldn't, with the same network and learning rate as the league used. The gain is in how often it finishes a hand, not how fast or how big, so it's likely in which hands it chases and when it stops feeding others, not in speed. Its points against Neural Cat didn't move (−137 a hand): wins this small still lose to Neural Cat's bigger hands.
#### Result

J +1.5 (hands won) ± 0.39 at 95%, beyond its standard error: kept, and shipped as **lc21**. `sharp` matched it on the first 6,000 deals (+1.5). `long` was the same model as `finetune` until there's more than one lab round of data.

### LC22 (lab model LL2b): only the newest games

#### Thinking

Round 2 played 50,000 hands with lc21 against lc18, lc19, lc20, Neural Cat and Jorge Yau, then tried three fine-tunes of lc21 on 318,444 winning moves: at 3x the learning rate (`finetune-fast`), at a third (`finetune-slow`), and on the last two rounds only (`recent`, here the same two lab rounds, with the league's older data left out).
#### What it does differently

Against lc21 over 20,000 new deals it wins 21.2% of its seats to 19.5%, in the same 16.6 discards a win, and deals in less (14.5% against 15.0%). Against Neural Cat NC2 it wins 20.7% of hands (lc21 19.1%), and loses 122 points a hand to it, against lc21's 137.
#### Reading

Two lab rounds in a row each gained about 1.5 points of win rate, after the league's last rounds gained less than half a point each. Both rounds' data came from tables with Jorge Yau and the newer Neural Cat in them, so the opponents, not a new kind of training, look like what changed. `finetune-slow` was almost as good (+1.6 on 20,000 deals), and `finetune-fast` was the weakest (+0.4 on 6,000), so smaller steps from the champion work best for Lucky Cat so far.
#### Result

J +1.7 ± 0.39: kept, and shipped as **lc22**.

### LC23 (lab model LL3a): recent data again

#### Thinking

Round 3 played 50,000 hands with lc22 against lc19, lc20, lc21, Neural Cat and Jorge Yau. The lab favoured `recent` after it won round 2, and tried it again, with `finetune-slow` and `sharp`.
#### What it does differently

Against lc22 over 20,000 new deals it wins 21.8% of its seats to 20.0%, in the same 16.4 discards a win. Against lc20 over 10,000 deals it wins 22.8% to 18.2%. Against Neural Cat NC2 it wins 22.2% of hands and loses 116 points a hand (lc20: 18.3% and 138).
#### Reading

The gains add up: the three lab steps were +1.5, +1.7 and +1.9 points of win rate, and lc23 against lc20 directly is +4.5. So it isn't only learning to beat its last self. `recent`, training on the newest two rounds only, won both rounds it was tried, ahead of `finetune-slow` (+0.2 on 6,000 deals) and `sharp` (+1.3 on 20,000, also beyond the noise). Fresh games against the current table matter more than more data.
#### Result

J +1.9 ± 0.40: kept, and shipped as **lc23**.

### LC24 (lab model LL5b): sharper targets

#### Thinking

Round 4 played 50,000 hands with lc23 and tried plain `finetune`, `long` (the last 10 rounds) and `finetune-fast`: all three lost to lc23 on 6,000 deals (J −0.3, −0.3 and −0.8), and it stayed champion. Round 5 played 50,000 more hands against lc20, lc21, lc22, Neural Cat NC2 and Jorge Yau, then tried `recent`, `sharp` (label smoothing 0.01 instead of the usual, so the network commits harder to the move that won) and `finetune-slow`.
#### What it does differently

Against lc23 over 20,000 new deals it wins 21.9% of its seats to 20.7%, in 16.4 discards a win to 16.2: a little slower, about as many more wins. Against lc20 over 10,000 deals it wins 23.8% to 17.6%. Against Neural Cat NC2 it wins 22.8% of hands and loses 98 points a hand to it (lc23: 22.2% and 116, lc20: 18.3% and 138).
#### Reading

The gains are shrinking: +1.5, +1.7, +1.9, then a round with nothing, then +1.1. `recent` tied `sharp` on 20,000 deals (J +1.1 each), so fresh data still helps, but the round-to-round step is now about the size of the noise on 6,000 deals (± 0.73). Its biggest gain is against Neural Cat: 18 points a hand less lost, more than any step before it, though on 5,000 deals that number is noisy. If the next rounds keep nothing, the lab needs something new for Lucky Cat, not another fine-tune.
#### Result

J +1.1 ± 0.40: kept, and shipped as **lc24**.

### LC25 (lab model LL7b): sharper targets, two rounds on

#### Thinking

Round 6 played 50,000 hands with lc24 and tried `finetune`, `long` and `finetune-fast`. `finetune` and `long` were the same model, since the lab has fewer than 10 rounds of data. `finetune-fast` (LL6c) beat lc24 by J +0.5 ± 0.40 on 20,000 deals: the lab kept it, since its bar is half the margin, but that's too close to ship. Round 7 played 50,000 hands with LL6c against LL2b, LL3a, LL5b, Neural Cat NC2 and Jorge Yau, then tried `recent` (+1.1 on 6,000 deals), `sharp` and `finetune-slow` (+1.1 on 20,000).
#### What it does differently

Against lc24 directly over 20,000 new deals it wins 22.7% of hands to 20.8%, in about the same 16.2 discards a win, and deals in a little less (16.1% against 16.5%). Against lc20 over 10,000 deals it wins 24.7% to 17.3%. Against Neural Cat NC2 it wins 24.4% of hands, Neural Cat's lowest yet at 8.9%, and loses 89 points a hand to it (lc24: 98).
#### Reading

`sharp` has now won two of the three rounds it was tried: targets with less smoothing make the network commit to the move that won, and the gain held up against lc24 directly, not only against LL6c. Two rounds of fine-tuning in a row gained more than either alone, so a marginal champion is still a good place to train from, even if it isn't one to ship.
#### Result

J +1.3 ± 0.40 against LL6c, and +1.8 ± 0.40 against lc24: shipped as **lc25**.

### LC26 (lab model LL9b): the same two-step again

#### Thinking

Round 8 played 50,000 hands with lc25 and tried `long` (now 8 rounds of data), `finetune` and `finetune-fast`, all about level on 6,000 deals (J +0.1 to +0.2). `long` (LL8a) beat lc25 by +0.8 ± 0.41 on 20,000 deals, but it was the better of the two picked for that test, and on a second 20,000 deals it was only +0.3: kept by the lab, not shipped. Round 9 played 50,000 hands with LL8a against LL5b, LL6c, LL7b, Neural Cat NC2 and Jorge Yau, then tried `recent`, `sharp` and `finetune-slow` (J +0.6 to +0.8 on 6,000 deals, +0.5 and +0.7 on 20,000 for the top two).
#### What it does differently

Against lc25 directly over 20,000 new deals it wins 22.9% of hands to 21.6%, in 16.0 discards a win, deals in a little less (16.5% to 16.9%), and wins slightly bigger (5.03 faan to 4.96). Against lc20 over 10,000 deals it wins 25.5% to 17.0%. Against Neural Cat NC2 it wins 25.3% of hands, holds Neural Cat to 8.5%, and loses 83 points a hand to it (lc25: 89).
#### Reading

The pattern from lc25 repeats: a round whose gain is too small to ship, then a `sharp` round on top of it, and together they clear the bar. Single rounds now gain under a point of win rate, so the lab can't tell a round's winner from noise on 6,000 deals (± 0.74); it takes the 20,000-deal tests and a check against the shipped release. `sharp` has won three of the four rounds it was tried.
#### Result

J +0.7 ± 0.41 against LL8a, and +1.2 ± 0.41 against lc25 on a separate 20,000 deals: shipped as **lc26**.

### LC27 (lab model LL11a): recent data, two rounds on

#### Thinking

Round 10 played 50,000 hands with lc26 and tried `long` (now all 10 rounds, J −0.3 on 6,000 deals), `finetune` and `finetune-fast`. `finetune` (LL10b) beat lc26 by +0.4 ± 0.41 on 20,000 deals: kept by the lab, not shipped. Round 11 played 50,000 hands with LL10b against LL7b, LL8a, LL9b, Neural Cat NC2 and Jorge Yau, then tried `recent`, `sharp` and `finetune-slow` (J +0.4 to +0.7 on 6,000 deals).
#### What it does differently

Against lc26 directly over 20,000 new deals it wins 23.5% of hands to 21.4%, in about the same 15.9 discards a win, and deals in less (16.7% to 17.4%). Against lc20 over 10,000 deals it wins 26.5% to 16.6%. Against Neural Cat NC2 it wins 25.9% of hands (lc26: 25.3%) but loses 87 points a hand to it (lc26: 83), within the noise of 5,000 deals.
#### Reading

The two-round pattern held a third time, and with `recent` this time, not `sharp`: the arm matters less than training twice in a row from the newest champion on the newest games. The biggest change is fewer deal-ins against its own kind. Against Neural Cat the win rate still rises but the points have stopped improving, so lc27 wins Lucky Cat's small hands more often without stopping Neural Cat's big ones. The lab's J for Lucky Cat counts only wins, so it can't see that.
#### Result

J +0.8 ± 0.41 against LL10b, and +2.1 ± 0.41 against lc26 on a separate 20,000 deals: shipped as **lc27**.

### LC28 (lab model LL13a): fewer points to Neural Cat

#### Thinking

Round 12 played 50,000 hands with lc27 and tried `long`, `finetune` and `finetune-fast`: none beat it (the best, `finetune`, was −0.3 on 20,000 deals). Round 13 played 50,000 more against LL8a, LL9b, LL10b, Neural Cat NC2 and Jorge Yau, and tried `recent`, `sharp` and `finetune-slow`. `recent` (LL13a) beat lc27 by +0.6 ± 0.41 on 20,000 deals and by +0.9 ± 0.41 on a separate 20,000. That's small, so it was held a round to see whether a second step would add to it, as it had for lc25, lc26 and lc27. Round 14 kept nothing, so LL13a shipped.
#### What it does differently

Against lc27 over 20,000 new deals it wins 23.2% of hands to 22.2%, at the same 15.8 discards a win, and deals in a little less (17.2% to 17.4%). Against lc20 over 10,000 deals it wins 26.7% to 16.6%. Against Neural Cat NC2 it wins 27.1% of hands, holds Neural Cat to 8.2%, and loses 74 points a hand to it (lc27: 87), the biggest drop of any lab step.
#### Reading

Against its own kind the gain is the smallest yet, but against Neural Cat it's the largest, which lc27 didn't show. Points against Neural Cat on 5,000 deals swing by about ±30 between runs (measured at lc30), so both lc27's flat result and lc28's drop are mostly noise. Taken together, the last two steps cut 9 points a hand from what Neural Cat takes. `recent` has now won three rounds, and the other fine-tunes (`long`, `finetune`, `finetune-fast`) haven't won since round 10. Two of the last three rounds kept nothing. The lab is close to a plateau for Lucky Cat.
#### Result

J +0.6 ± 0.41 against lc27, confirmed at +0.9 ± 0.41 on a separate 20,000 deals: shipped as **lc28**.

### LC29 (lab model LL17c): four rounds for one small step

#### Thinking

Round 15 kept `recent` (LL15a) by +0.7 on the lab's 20,000 deals, but on a separate 20,000 against lc28 it won exactly as many hands (22.85% each): the lab's pick of the better of two had been noise. Round 16 kept nothing. Round 17 played 50,000 hands with LL15a against LL10b, LL11a, LL13a, Neural Cat NC2 and Jorge Yau, and kept `finetune-slow` (LL17c, +0.8). Round 18 kept nothing, so LL17c shipped.
#### What it does differently

Against lc28 directly over 20,000 new deals it wins 23.3% of hands to 22.6%, at the same 15.7 discards a win, and deals in a little less (17.4% to 17.8%). Against lc20 over 10,000 deals it wins 27.2% to 16.4%. Against Neural Cat NC2 it wins 27.5% of hands, holds Neural Cat to 8.0%, and loses 65 points a hand to it (lc28: 74).
#### Reading

Four rounds and 200,000 hands bought +0.7 points of win rate against its own kind, where rounds 1 to 3 bought about +1.7 each. The lab's fine-tunes have run out of easy gains for Lucky Cat: it needs a new idea, not another round (see the critique that follows). The steady drop in points lost to Neural Cat (138 a hand at lc20, 65 now) is the one trend that hasn't slowed.
#### Result

J +0.8 ± 0.41 against LL15a, and +0.7 ± 0.41 against lc28 on a separate 20,000 deals: shipped as **lc29**.

### Critique: where the Lucky Cat lab stalled, and what's next

Eighteen lab rounds took Lucky Cat from lc20 to lc29: 16.4% of hands to 27.2% when they meet, and 138 points a hand lost to Neural Cat down to 65. But the steps shrank from about +1.7 points of win rate a round (rounds 1 to 3) to +0.7 over rounds 15 to 18. What the lab got right, what it got wrong, and what changes:

- **It only learns from wins.** Every training sample is a move from a hand the learner won. A deal-in is never seen: the network learns what winners did, never what losers did wrong. Deal-ins fell anyway (lc29 deals in on 14.9% of hands to lc20's 17.7% when they meet), but only as a side effect of playing faster. **Next:** the discard that dealt in is written as a negative sample, and training pushes its probability down (an unlikelihood term, weighted below the wins), so the network learns from its worst moves too.
- **Every arm is the same network.** All six arms fine-tune the same 256-128 network: different learning rates and windows of data, nothing that changes what the network can represent. Fine-tunes now differ by less than the noise. **Next:** a `wide` arm (512-256), trained from scratch on the last 10 rounds, as Only Orphans already tries.
- **Two arms were the same model.** `long` (10 rounds) and `finetune` (6) used the same data until round 10, so two of the three candidates were often one model, and round 6 judged the same network twice.
- **The first test is too small.** Its 6,000 deals give ± 0.75, larger than any round's gain since round 9. And picking the better of two on 20,000 deals inflates the winner: round 15's +0.7 was level with lc28 on a separate 20,000. Since then, every Lucky Cat champion is checked against the shipped release on a separate 20,000 deals before it ships, and ships only beyond the full margin.
- **What worked.** Fresh games against the current table (`recent`) and sharper targets (`sharp`) won 8 of the 13 champions, and training on from a champion too marginal to ship often paid off one round later (lc25, lc26, lc27). The lab's J for Lucky Cat counts wins only, yet points lost to Neural Cat kept falling: winning more often is how Lucky Cat cuts Neural Cat's share.

### LC30 (lab model LL19b): a wider network

#### Thinking

The first round of the rebuilt lab. Round 19 played 50,000 hands with lc29, writing each move that dealt in (12,375 of them, beside 253,572 winners' moves), and tried the three new arms: `deal-ins-strong` (fine-tune on the last 2 rounds with deal-ins at weight 1, J 0.0), `deal-ins` (weight 0.3, +0.2, then 0.0 on 20,000 deals) and `wide`, a 512-256 network trained from scratch on the last 10 rounds with deal-ins at weight 0.3 (+0.3, then +0.6 on 20,000). Round 20 kept nothing: `wide` from scratch again was −0.3, and both deal-in fine-tunes failed to start, because they built a 256-128 network to load the new 512-256 champion into. The trainer now keeps the shape of the model it starts from.
#### What it does differently

Against lc29 directly over a separate 20,000 deals it wins 23.2% of hands to 22.8%, in 15.6 discards a win to 15.7, with the same deal-ins (17.7%). Against lc20 over 10,000 deals it wins 27.7% to 16.0%. Against Neural Cat NC2 it wins 27.4% to 27.8% of hands over 15,000 deals, about what lc29 does, and loses about as many points.
#### Reading

A network twice as wide, trained once from scratch on 10 rounds, matched and slightly beat 19 rounds of fine-tuning. That points at the 256-128 network as part of the plateau. The deal-in fine-tunes cut deal-ins a little (17.4% to 17.7% for the strong one against lc29 on 10,000 deals) without winning more, so far. The wide network is now the champion, so the next rounds fine-tune it: the deal-in arms on it are the real test.
#### Result

J +0.6 ± 0.41 against lc29, confirmed at +0.5 ± 0.41 on a separate 20,000 deals: shipped as **lc30**.

### LC31 (lab model LL22b): learning from its deal-ins

#### Thinking

With the trainer fixed to keep the wide network's shape, round 21 tried all three new arms on lc30, and all three beat it on 6,000 deals: `deal-ins` (weight 0.3) +1.4, `deal-ins-strong` (weight 1) +1.0, `wide` from scratch +0.9. `deal-ins-strong` (LL21c) won on 20,000 deals, +0.7, and on a separate 20,000 against lc30 it won 23.3% of hands to 22.8% and dealt in on 17.3% to 18.0%. Small, so it was held. Round 22 trained on from it: `deal-ins` (LL22b) +0.2, kept, and the two steps together shipped. Each fine-tune trained on 510,405 moves from the last two rounds, 24,995 of them moves that dealt in.
#### What it does differently

Against lc30 directly over a separate 20,000 deals it wins 23.6% of hands to 22.6%, in about the same 15.7 discards a win, and deals in on 17.5% of hands to 18.0%. Against lc20 over 10,000 deals it wins 28.0% to 15.9% and deals in on 14.8% to 18.2%. Against Neural Cat NC2 over 15,000 deals it wins 28.1% of hands to lc30's 27.7% and loses 75 points a hand to lc30's 80, both within the noise, and doesn't deal in less (13.5% to 13.2%).
#### Reading

The first change of the rebuild that does what it was built for: pushing down the moves that dealt in cut deal-ins against its own kind by half a point, beyond the noise, and the hands it stopped giving away became wins. Against Neural Cat it didn't, so far: Neural Cat's hands are slow and big and look different, and the moves that dealt in were mostly into other Lucky Cats (the learner takes two of the four seats in every training deal, and its earlier selves often a third). The `wide` network from scratch was level with the fine-tunes both rounds, so the 512-256 network now has room the old one didn't.
#### Result

J +0.7 and +0.2 on the lab's 20,000 deals, and +0.9 ± 0.41 against lc30 on a separate 20,000: shipped as **lc31**.

### LC32 (lab model LL26b): deal-ins again

#### Thinking

Round 23 kept nothing. Round 24 kept `finetune-slow` (LL24b, +0.6), but on a separate 20,000 deals it won exactly as often as lc31 and dealt in more (18.1% to 17.7%), so it didn't ship. Round 25 trained on from it with `deal-ins` (LL25c, +0.2; +0.5 ± 0.41 against lc31 on a separate 20,000), held a round, and round 26's `deal-ins-strong` (LL26b, +0.3) built on it. `wide` from scratch and `finetune-fast` lost both rounds (−0.4 to −1.7).
#### What it does differently

Against lc31 directly over a separate 20,000 deals it wins 23.5% of hands to 22.7%, at about the same 15.6 discards a win, and deals in on 17.6% to 17.9%. Against lc20 over 10,000 deals it wins 28.7% to 15.3% and deals in on 14.3% to 18.4%. Against Neural Cat NC2, on the same 15,000 deals as lc31's test, it wins 28.7% of hands to lc31's 28.1%, holds Neural Cat to 7.5% (lc31: 7.9%), deals in on 13.2% (lc31: 13.5%), and loses 72 points a hand to lc31's 75.
#### Reading

In the six rounds since lc30, all four kept models that held up came from the deal-in arms (LL21c, LL22b, LL25c, LL26b), and every arm that ignores deal-ins (`recent`, `sharp`, `finetune-slow`, `finetune-fast`, `long`, `wide` from scratch) lost or tied. Against Neural Cat it now deals in a little less too, the first step to do so, though by less than the noise on 15,000 deals. Each shipped step still takes two rounds of about +0.4.
#### Result

J +0.2 and +0.3 on the lab's 20,000 deals, and +0.8 ± 0.41 against lc31 on a separate 20,000: shipped as **lc32**.

## Only Orphans: the league and the lab (O1 to OL2c)

**In this section:** [OL2c: more triplet hands](#ol2c-more-triplet-hands) · [The plateau after OL2c (lab rounds 3 to 6)](#the-plateau-after-ol2c-lab-rounds-3-to-6)

Only Orphans keeps fixed rules (only 1s, 9s and honors, no chows) and lets a network, the same model as Neural Cat's, choose everything else in expected points. Its league (`scripts/ml/orphans.js`) made O1 to O5 against the rule-based bot it replaced: O5 beat that bot by +37.6 ± 22 points a hand and shipped (round by round: [only-orphans-training.md](../strategies/only-orphans-training.md)). From O5 it moved to the lab (`npm run ml:lab -- --strategy only-orphans`), judged by J = points a hand + 5 × hands won (in percentage points). The rule-based bot plays each round's deals as the baseline.

### OL2c: more triplet hands

#### Thinking

Lab round 1, against NC1, the newer Jorge Yau and LC20, kept nothing: the wider network (`wide`) led on 6,000 deals but fell to J +5.1 on 20,000 (points +4.0 ± 15.6), within the noise. Round 2 played 50,000 hands with O5 against the game's new table (NC2, lc23, Jorge Yau) and O2 and O3, then tried a third of the learning rate (`finetune-slow`, J −6.6), a deeper network from scratch (`deep`, +29.1 on 6,000 deals, then +7.1 on 20,000, within the noise), three times the learning rate (`finetune-fast`), and claim margins of −25 and +25 (0.0 and +6.7). `finetune-fast` trained O5 on 3,457,210 positions from the league's five rounds and the lab's two.
#### What it does differently

Against O5 on the same 20,000 deals, it wins 2.2% of its hands to 1.9% (1,767 wins to 1,560) and deals in just as often (11.1%). The extra wins are Mixed Orphans in triplets: 848 Mixed Orphans to 679, and 710 All Triplets to 535, while Thirteen Orphans stayed level (724 to 718). It pungs more (0.52 a hand to 0.48), kongs more (5,458 to 5,106) and self-draws more (463 to 377). Each win is a little smaller (9.8 faan to 10.0, about 6,000 points to 6,700), but more wins add up to more points: 49.1 a hand to O5's 42.5.
#### Reading

A larger step from O5 on games against the stronger table taught it to take more orphan pungs and settle for the triplet hands earlier, where O5 kept chasing Thirteen Orphans. It deals in on about 11% of hands, against the rule bot's 4.6%, but on cheap hands, so in points its deal-ins cost about the same as the rule bot's (see the plateau below).
#### Result

J +8.0 on 20,000 fresh deals (points +6.7 ± 15.4), beyond its standard error: kept, and shipped as **OL2c**. Against the rule-based bot on those deals: +26.8 ± 14.8 points a hand.

### The plateau after OL2c (lab rounds 3 to 6)

Four rounds in a row kept nothing, so the lab stopped to look at what it does badly.

**The evidence.**

| Round | Best on 6,000 deals | On 20,000 deals | OL2c against the rule bot (6,000 deals) |
| ---: | --- | --- | ---: |
| 3 | deep +4.3 | +1.2 (points +2.8 ± 15.0) | +42.0 ± 27 |
| 4 | claimMargin−25 +5.6, winBonus+150 +2.0 | 0.0, +0.9 | +23.4 ± 28 |
| 5 | claimMargin+25 +3.4, finetune +1.6 | +4.9 (points +6.0 ± 15.5), +1.9 | +43.5 ± 27 |
| 6 | claimMargin+25 +7.0, finetune-slow +3.7 | +1.6, −6.5 | +29.8 ± 28 |

- **The noise is wider than the gains.** On 20,000 deals the 95% margin was about ±15 points a hand. The candidates sent there averaged J +3.9 on their first 6,000 deals and +0.6 on the 20,000: picking the best of five on ±28 mostly picks luck. OL2c's own score against the rule bot swung from +23 to +44 between rounds, with nothing changed. A limit hand pays up to 24,576 points, so this strategy's points swing more than Neural Cat's.
- **The margins ignored that both models play the same deals.** The lab added the two runs' margins as if they were independent. Measured deal by deal (OL2c against O5, 3,000 deals), the two runs correlate at 0.28, and the paired margin is about 15% narrower: ±30 against ±36. For a play setting that changes only a few choices, the gap is far bigger: on 300 deals, `winBonus+150` was ±5 paired, where the independent margin would be about ±60.
- **One arm could never change anything.** A claim is the model's only when it's worth more than the base strategy's pass, so a negative claim margin never changes a choice. `claimMargin−25` played exactly like the champion all three times it was tried, and used a candidate's slot each time.
- **Training drifts back to fewer, bigger hands.** All 12 networks trained in rounds 3 to 6 won fewer hands than OL2c (1.6–2.2% against 2.2–2.4%), with bigger average wins (5,900–8,400 points against 5,700–6,200), and lost: J −5.8 on average. That held even for `recent` in round 6, trained only on OL2c's own games, so it isn't the league's old data. OL2c had gained by going the other way: more wins, smaller.
- **Deal-ins weren't the weak spot.** OL2c deals in more than twice as often as the rule bot (11.1% of hands against 4.6%), but on cheap hands (216 points each against 506), so its deal-ins cost about the same: 23.9 points a hand against 23.3. Its whole lead is in what it wins: 132.6 points a hand against the rule bot's 103.4. Lucky Cat's fix, training on each move that dealt in as a negative example, doesn't apply here either: Lucky Cat learns which move to copy, and this network already learns the chance of dealing in as one of its outcomes.

**What changed** (`scripts/ml/lab.js`, Only Orphans only; `scripts/competition.js --per-deal`):

1. **Paired margins.** Each Only Orphans evaluation writes its points on every deal, and the margin of a difference is read from the per-deal differences, for candidates, the champion and the rule bot alike.
2. **40,000 deals for the long evaluation**, against 20,000. With pairing, the 95% margin is about ±8 points a hand, against ±15 before: a candidate needs about +4 to be kept, against +8.
3. **`claimMargin−25` is gone**, replaced by `claimMargin+50`. `claimMargin+25`, the next step up, averaged J +3.0 over four tries and cut deal-ins each time.
4. **A training arm against the drift**, `finetune-wins`: a fine-tune whose play then leans toward winning (winBonus +300). The lab's arm choice will show whether it pays.

The lab's first round after the change is round 7, from OL2c.

## Points first for Lucky Cat (LP2b): the new objective, not shipped

**In this section:** [Critique: points first from lc32 learned to beat itself, not the table](#critique-points-first-from-lc32-learned-to-beat-itself-not-the-table) · [Critique: at the table, a whole hand's points are too noisy to learn from](#critique-at-the-table-a-whole-hands-points-are-too-noisy-to-learn-from) · [Critique: on one wall, a move is judged by a future no player can see](#critique-on-one-wall-a-move-is-judged-by-a-future-no-player-can-see)

### Thinking

LC20 got what it was rewarded for: wins, fast. Its hands were cheap (4 to 5 faan) and its losses taught it nothing, so it never learned what a deal-in costs, and it lost about 103 points a hand to Jorge Yau on 20,000 deals. The goal now is points first and wins second, learned on its own, so the reward had to be the points:

- **Learn from every hand, by its points.** `lucky.js generate --returns` keeps the champion's real choices in every hand its seats play, won or lost, with the points the hand paid that seat. That is reinforcement learning: a move's advantage is the hand's points (clipped at ±4,000) less what positions like it usually score.
- **A critic for the baseline.** A value network (in `ml/train_lucky.py`, not shipped) predicts what a position scores, fitted on half the hands and scoring the other half. It explains well under 1% of the points: from one position, a hand's points are mostly luck. So the advantage is close to the hand's points less the average, and each step needs tens of thousands of hands.
- **Two kinds of step.** A clipped policy gradient (PPO) moves each move's share by its advantage, at most 20% per move from the share it was played with. Advantage-weighted imitation (AWR) imitates every move, weighted by exp(advantage): moves from hands that did well teach the most, from hands that went badly almost nothing.
- **A points-first judge.** J = points a hand + 0.5 × hands won (percentage points): a point of win rate is worth half a point a hand, a tie-breaker. A candidate is kept only if its points a hand beat the champion's by more than their paired standard error on 20,000 fresh deals. (Neural Cat's J counts a point of win rate as 5 points; that would let Lucky Cat's habit of cheap wins pass for progress.)
- **Let it explore.** Eight arms (`pg`, `pg-2`, `pg-all`, `pg-fast`, `pg-sqrt`, `pg-clip`, `pg-wins`, `awr`), chosen by the bandit; the champion explores at temperature 0.5, close to how it plays, and shares are read at that temperature in training.

| Round | Experiments (6,000 deals, points a hand against the champion) | Best on 20,000 fresh deals | Kept |
| --- | --- | ---: | --- |
| 1 | pg-2 +8.4, pg-fast −0.6, pg-sqrt −7.9 | pg-2 +2.3 ± 2.5 | no |
| 2 | awr +8.0, pg-clip +2.4, pg-all −4.2, pg −3.5 | **awr +6.9 ± 2.5**, pg-clip +5.4 ± 2.3 | **LP2b** |
| 3 | awr +3.9, pg-clip +0.2, pg-2 −3.2, pg-wins −4.6 | awr −4.2 ± 2.4 | no |
| 4 | pg-wins −0.2, pg −0.5, pg-fast −4.1, pg-all −9.0 | none ahead | no |

Round 1's policy-gradient steps on one round of data were within the noise. In round 2, with two rounds (50,000 deals) of LC20's play, both AWR and the clipped policy gradient cleared the bar, and AWR by more. Rounds 3 and 4 trained from LP2b on its own data and LC20's, and nothing beat it: two rounds without a gain, so the lab stopped there (100,000 deals in all). By the bandit's record, `awr` and `pg-clip` are the arms that have paid; `pg-all` (four rounds, mostly an older champion's play) and `pg-sqrt` the ones that haven't.

### What it does differently

Replayed against LC20 on 20,000 deals neither had played in the lab, LP2b scores **+4.0 ± 2.3** points a hand (the lab's own 20,000 said +6.9 ± 2.5; keeping the best of several flatters it):

| LP2b against | Points a hand | Hands won | Deal-ins | Average win | Faan a win |
| --- | ---: | ---: | ---: | ---: | ---: |
| LC20, fresh deals | +4.0 ± 2.3 | 20.0% vs 19.4% | 14.0% vs 14.2% | 162 vs 151 | 4.86 vs 4.80 |
| LC20, the lab's deals | +6.9 ± 2.5 | 19.7% vs 19.5% | 13.9% vs 14.1% | 170 vs 147 | 4.87 vs 4.80 |
| Jorge Yau (LC20 on the same deals: −102.7 ± 5.2) | −87.7 ± 4.9 | 15.2% vs 22.3% | 14.9% vs 10.1% | 166 vs 396 | 4.78 vs 5.08 |

- **More points, not fewer wins.** It wins as often as LC20, and its wins are worth about 8–15% more. Against Jorge Yau it gains about 15 points a hand on the same deals, all from bigger wins (166 points a win to 153); it deals in just as often there.
- **A small step.** It is still a fast player of 4 to 5 faan hands. Most of what separates it from Jorge Yau (wins worth more than twice as much, and a third fewer deal-ins) is still to learn.
### What it taught

with a noisy reward, data counts more than the size of the step. The bigger policy-gradient step (`pg-fast`) and the square root of the points (`pg-sqrt`) did no better, and the gains came once there were 50,000 deals of the champion's own play to learn from.

**Status.** This ran in parallel with the lab rounds above, from LC20, and was merged after LC32 shipped. LC32 stays in the game; LP2b is kept in `ml/models/` for benchmarking. The points-first trainer and judge are now the lab's for Lucky Cat: its next rounds start from LC32 and are kept only when they score more points a hand. LP2b has not been played against LC32.

### Critique: points first from lc32 learned to beat itself, not the table

Thirteen points-first rounds from lc32 (LP1a to LP13a, 650,000 deals) kept six champions, and none shipped. What happened, and what changed:

- **Head to head, it looked like progress.** LP11b beat lc32 by +4.0 ± 1.9 points a hand on 40,000 deals neither had played, and LP12b beat LP11b by +6.0 ± 2.1. Each kept champion won fewer hands than the one before, with bigger wins (lc32 about 160 points a win, LP11b 193, LP13a 218).
- **At the game's table, it wasn't.** One seat each against two Neural Cats and Jorge Yau, on the same 5,000 deals rotated through every seat (`scripts/competition.js`): lc32 −103.7 ± 13.8 points a hand, LP11b −104.8 ± 15.0, LP12b −111.2 ± 14.9. Against Jorge Yau alone, LP11b lost 40.6 a hand to lc32's 32.0, and against Neural Cat NC3 it was level (−76.2 to −74.6).
- **Why.** The lab trained and judged Lucky Cat against its own kind. Each training deal gave the learner two of the four seats and drew its last two champions into the opponents' pool, and the judge was head to head. Against a fast player of cheap hands, waiting for bigger hands pays: its deal-ins go into small hands, and the other Lucky Cat rarely builds a big one. Against Neural Cat, whose wins are worth about 1,800 points, and Jorge Yau, whose are worth about 400, the same waiting costs wins and deals into big hands. Points first was the right goal, measured at the wrong table.
- **The judge is also noisier than it looked.** Head to head on 20,000 deals, one standard error was about 2.6 points a hand, and LP3c, LP5a and LP8b were each kept about one standard error ahead of the last without clearly beating lc32. Judging on 40,000 deals (from round 9) brought that to about 1.8, but it couldn't fix the table.

**What changed.** The lab now trains and judges Lucky Cat at the game's table (`LC_TABLE` in `scripts/ml/lab.js`):
- **Training:** one learner seat; the other three are drawn from Neural Cat (two in three) and Jorge Yau, with no earlier selves.
- **Judging:** `lucky.js eval --table neural-cat,jorge-yau,neural-cat` seats the candidate and the champion alone at that table, each in every seat in turn, on the same 40,000 deals, paired deal by deal (one standard error about 3.5 points a hand).
- **A fresh start from lc32**, with new names (LT models, `lctab` data); the head-to-head rounds are kept as LP models and `ml/lab-lucky-cat-points-h2h/`.

### Critique: at the table, a whole hand's points are too noisy to learn from

Four rounds at the game's table from lc32 (LT1a to LT4c, 200,000 deals, bold mode in the fourth) kept nothing. Of the eight candidates that looked ahead on the screen, the four that went on to 40,000 fresh deals all came out level or behind: LT1c −4.2 ± 2.7 points a hand, LT2b −9.3 ± 3.0, LT2a −1.1 ± 2.7, LT4c −1.8 ± 2.6, LT4b −0.6 ± 2.8. Two things were wrong:

- **The training signal was mostly luck.** Every move was credited with the hand's points. At this table those are decided mostly by the others: Neural Cat's wins are worth about 1,800 points, and whether one comes rarely turns on a single Lucky Cat move. The critic, which should explain what a position is worth, explained none of the reward's variance (−1.2% in round 1), so each move's advantage was the hand's luck. A few hundred thousand moves can't average that out.
- **The screen picked the luckiest arm.** On 6,000 deals one standard error at the table is about 7 points a hand, more than the gains looked for (2 to 5). So the arms that screened best were the ones the deals favoured: LT4c screened at +11.4 and LT4b at +10.4, and both were level on 40,000 deals.

**What changed: move by move, from replays.** The game is deterministic given the deal and every choice, so the lab can ask what a single move was worth:
- **Replays (`lucky.js generate --rollouts`):** the champion plays its best in one seat at the table. At up to 4 of its real choices a hand (the ones it was least sure of more often), the deal is played again from the start with each of its 2 next-best moves forced there, and every player playing its best otherwise. The wall and every other choice are the same, so the gap in points between a replay and the hand is that one move's worth on that wall. About a third of the forced moves change the hand's points, and about one in six does better than the champion's move.
- **Training (`train_lucky.py --mode q`):** the target for each choice is the champion's shares times exp(advantage / tau), and the network is fitted to it. A move that scored more on the same wall gets more of the share, by an amount tau sets (in points), and choices where the replays changed nothing keep the champion's shares, so the step stays small where the evidence is.
- **A longer screen:** Lucky Cat's candidates are screened on 15,000 deals (about ±4.5) before the best two play 40,000.
- **New names:** LR models and `lcroll` data, from lc32 again. The table rounds above are kept as LT models and `ml/lab-lucky-cat-table-pg/`.

### Critique: on one wall, a move is judged by a future no player can see

Three rounds of replays (LR1a to LR3c, 90,000 deals, against NC5) kept one model, and it didn't hold. On 40,000 deals every finalist was level: LR1c +1.2 ± 2.1 points a hand, LR2a −0.9 ± 2.0, LR2c +1.0 ± 2.1, LR3b +1.4 ± 2.0. LR3a was kept at +3.0 ± 1.9, but on 40,000 fresh deals against NC8 it scored −0.4 ± 1.9. Three things were wrong:

- **The replays knew the future.** Each move was replayed on the same wall, with the same tiles in the other hands. So a move "scored more" when it happened to suit the tiles still to come, which the player can't see when it chooses. A third of the forced moves changed the hand's points, but mostly through luck, not through anything the move's position shows. The network was fitted to that luck: the points it gained on held-out moves were about zero (−0.02 to −0.05 a choice), and it moved very little from the champion (a KL of 0.003).
- **One sample a move.** Even with the right futures, one replay of a hand is one draw of all that's still to come.
- **The keep bar picked luck.** It kept a candidate whose points beat one standard error. With two finalists a round, one does that about a third of the time by chance, as LR3a did.

**What changed: every move on the same reshuffled futures.**
- **Futures (`lucky.js generate --futures 4`):** at a replayed choice, the wall still to be drawn (flowers left where they are) is shuffled again, 4 ways. The other players' concealed tiles stay as dealt: at a claim they may already have chosen which of them to meld, and reshuffling them broke those claims. Every move tried, the champion's included, plays the same 4 futures, and its points are the mean. That's what the move is worth from what the player knew, and the futures' luck is shared between the moves compared. Each round now replays 2 choices a hand (3 in bold mode) on 20,000 deals.
- **A stricter keep bar:** Lucky Cat's points must beat the full margin (about two standard errors), not half of it.
- **New names:** LF models and `lcfut` data, from lc32, against NC8. The one-wall rounds are kept as LR models and `ml/lab-lucky-cat-one-wall/`.

## Suphx for Lucky Cat: an oracle teacher, not an oracle critic

Lucky Cat still loses points at the game's table, mostly through deal-ins. lc32 deals in on about 17.6% of hands, and there a Neural Cat win is worth about 1,800 points. So the lab now tries the ideas in Suphx ([Li et al. 2020](https://arxiv.org/abs/2003.13590)), Microsoft's mahjong AI: train with the hidden tiles in view (the "oracle"), then take them away. A Hong Kong hand settles on its own, so Suphx's global reward prediction (for a game of many rounds) isn't needed. Its run-time adaptation is too slow for a bot in the browser.

**The hidden tiles, for training only.** `lucky.js generate --oracle` records, beside the seat's 376 features, 312 more (`scripts/ml/oracle.js`):
- each other player's concealed tiles, their waits, and how far they are from ready;
- the live wall and its next tile;
- for each tile the seat holds, the points it would pay if it discarded that tile now, from the engine's own win check (`claimOptions`) and score.

The game never loads that file. `ship.js` refuses a model that reads the hidden tiles, and `scripts/ml/oracle.test.js` checks both.

**What the probes showed (lc32 at the table, 5,000 deals, 108,559 choices):**
- **A critic with every tile in view doesn't help.** On the hand's points, a critic explained −1.2% of the variance with the hidden tiles and −1.4% without (−12% to −14% when trained longer: it overfits). The fault is the target: one hand's points are decided mostly by one discard, and a critic scores the position, not the move. A squared-error critic didn't change that. Predicting how the hand ends (win, deal-in, someone else wins, draw), the hidden tiles moved the held-out loss only from 1.2186 to 1.2116.
- **The answer key per move is sharp.** At 4.2% of choices a discard would deal in right now, and lc32 played one 685 times in those 5,000 deals (25 times in 400 deals, at 628 points each on average).

**What changed: an oracle teacher, distilled (`ml/train_lucky.py --mode oracle`).** At every recorded choice, the teacher is lc32's shares with each discard that would deal in pushed down by what it would pay: its share is divided by e for each `--danger-tau` points. The network reads only the seat's view and is fitted to the teacher. The best it can do from that view is to learn how likely each tile is to deal in, choice by choice, with none of the hand's luck. On those 5,000 deals, its shares on held-out choices would pay 2.91 points a choice to deal-ins right now, against lc32's 3.38 (−14%), with a KL of 0.0004 from lc32, so the rest of its play barely moves.

**A first check at the table.** That model (tau 400, 4 epochs on those 5,000 deals) played lc32 at the game's table over 2,000 fresh deals, each taking every seat in turn on the same deals: **+14.8 ± 6.7 points a hand**, hands won 24.89% vs 24.96%, deal-ins 13.04% vs 13.38%. That's about two standard errors on a small sample, not the lab's bar of the full margin on 40,000 deals, so it's a reason to run the lab, not a result to ship. Its average win was a little smaller (152 vs 159 points).

**The Suphx lab (`npm run ml:lab -- --strategy lucky-cat-suphx`):**
- **Arms:** `teach` (tau 400, the last round), `teach-2`, `teach-sharp` (tau 100), `teach-soft` (tau 1,000), and bold `teach-bold` (tau 50).
- **`guided`:** Suphx's oracle guiding. The same teacher, but the network also reads the hidden tiles at first, each kept with a chance that falls from 1 to 0 over the epochs, then it is written without them (`--oracle-anneal 1,0 --public`).
- **`pg-oc`:** Suphx's RL stage. A policy gradient with the hidden-tile critic and an adaptive entropy bonus (`--target-entropy`), kept to see whether more data changes the probe.
- **Judging:** at the table, as lucky-cat. Points must beat the full margin, and hands won may not fall more than one standard error below the champion's: keep the win rate, gain points.
- **Names:** LS models and `lcsx` data, from lc32. State in `ml/lab-lucky-cat-suphx/`.



- **What a model optimizes is what you get.** Neural Cat scores choices in expected points and learned bigger hands. Lucky Cat scores wins and learned faster, smaller ones. Neither is "better" in general: Neural Cat scores more points, and Lucky Cat wins more hands.
- **Building on rules gets far faster than starting from scratch.** Neural Cat was ahead of the rule bots from its first model, because it chooses among Jorge Yau's best options. Lucky Cat needed a million hands to learn what the rules already knew, but it isn't limited by them.
- **Play against strong opponents.** Neural Cat stalled against the fixed rule bots and moved again once it played other models in the league. Lucky Cat kept improving because each new version had to beat its own best.
- **Noise is the main obstacle to telling models apart.** Most head-to-head results between neighbours are within ±30. Use 6,000 or more deals, record the margin, and replay any "best" on fresh deals.

## Only Orphans: targets by expected points

**In this section:** [The targets (rules, with O5's weights)](#the-targets-rules-with-o5s-weights) · [OT1a: bigger hands inside the targets](#ot1a-bigger-hands-inside-the-targets) · [OT2d: fewer pungs](#ot2d-fewer-pungs) · [OT4a: more wins, a few of them small](#ot4a-more-wins-a-few-of-them-small) · [OT5e: a bigger win bonus](#ot5e-a-bigger-win-bonus) · [OT6e: win bonus 500, a hair better](#ot6e-win-bonus-500-a-hair-better) · [OT7c: a new network again](#ot7c-a-new-network-again) · [OT11d: win bonus 800, wins without points](#ot11d-win-bonus-800-wins-without-points) · [Critique: the screen favored luck, and J favored wins](#critique-the-screen-favored-luck-and-j-favored-wins)

Only Orphans' models O1 to O5 were trained by its league ([only-orphans-training.md](../strategies/only-orphans-training.md)). Up to O5 the rules allowed only hands of 1s, 9s and honors (Thirteen Orphans, and Mixed Orphans, All Terminals and All Honors as triplets or pairs), and the model decided when to give up on Thirteen Orphans and could pung a 1, 9 or honor at any time.

### The targets (rules, with O5's weights)

#### Thinking

The scoring table pays Concealed Triplets 10 faan from any tiles (a limit hand when it is all 1s, 9s and honors) and Seven Pairs 4, and many deals that are hopeless for Thirteen Orphans hold several pairs. So the rules now pick a target each deal, and read it again every turn, from five: Thirteen Orphans, triplets of 1s, 9s and honors, pairs of 1s, 9s and honors, Seven Pairs, and Concealed Triplets. Each is worth its payout times its odds of finishing, played out a go-around at a time with the live tiles each step needs (`finishOdds` in `js/mahjong-only-orphans.js`); a hand keeps its target until another is worth 1.3 times as much. The first version used the foundation's one-step odds, which rated a hand five steps from Concealed Triplets as well as one whose later steps were as wide as its first; it was replaced before any evaluation. The target sets the fixed rules: tiles it can't use go first (on Seven Pairs and Concealed Triplets only single tiles, so their pairs and pungs of any tile stay), pungs of 1s, 9s and honors only on the triplets target, and nothing but the winning tile on the others.

#### What it does differently

Paired on the same 20,000 deals, one seat against Neural Cat, Jorge Yau and Lucky Cat (each deal played once, the dealer moving with the deal: `node scripts/ml/paired.js`, seed 93000000):

| | Old rules + O5 | New targets + O5 |
| --- | ---: | ---: |
| Points a hand | +38.5 ± 20.4 | +60.2 ± 22.5 |
| Difference (paired) | | **+21.6 ± 21.5** |
| Wins | 1.97% | 5.01% (+3.04 ± 0.31 points) |
| Average win | 6,186 points (10.06 faan) | 2,907 points (7.20 faan) |
| Deal-ins | 9.74% | 9.64% |

It wins two and a half times as often, with wins worth half as much: Concealed Triplets and Seven Pairs come in where Thirteen Orphans used to be chased to the end, and it deals in no more. The gain is just past the 95% margin.

### OT1a: bigger hands inside the targets

#### Thinking

OL2c learned under the fixed families, so the lab started again with the targets (round 7 of the old lab was stopped, and its state moved to `ml/lab-only-orphans-fixed-families/`). It trains only on data played with the targets, because older positions were read through the old plans, and it names its models OT. Round 1 played 50,000 deals with OL2c against Neural Cat, Jorge Yau, Lucky Cat, O3 and O5. On 6,000 deals: `finetune` J +4.1, `recent` +4.1 (the same model, since only one round of data exists yet), `finetune-slow` +3.7, `winBonus+150` +1.7, `claimMargin+25` +0.5. With the targets, OL2c beat the rule-based bot by +64.8 ± 24.6 points a hand.
#### What it does differently

Against OL2c on the same 40,000 deals, both with the targets: it wins 2.8% of hands to 4.4% (4,543 wins to 7,052), each worth about 5,500 points to 3,200 (9.4 faan to 7.5). The wins it gives up are Seven Pairs (1,733 to 4,665). It wins more Concealed Triplets (961 to 578), dragon pungs (800 to 484) and All Triplets (369 to 259), and more limit hands (1,743 to 1,662), with Thirteen Orphans about level (1,347 to 1,419). It pungs more (0.10 a hand to 0.07) and kongs more (3,977 to 2,957). It deals in about as often (13.5% to 13.1%), for about the same points (28.0 a hand to 27.2).
#### Reading

The targets alone, with OL2c's weights, won many cheap Seven Pairs. Fine-tuned on its own games with them, the network's discards and claims keep more hands on the way to pungs, so the target settles on Concealed Triplets or triplets more often than Seven Pairs, which pays 4 faan. That is the "fewer, bigger hands" drift the fixed-family lab kept losing to, but here it wins. A Seven Pairs win was worth too little to pay for the pung hands it gave up.
#### Result

J +7.0 on 40,000 fresh deals (points +14.8 ± 9.3, paired), beyond its standard error: kept, and shipped as **OT1a**. Against the rule-based bot on those deals: +74.0 ± 9.7 points a hand (OL2c with the targets: +59.3). J counts wins too, and OT1a's fewer wins cost it 7.8 of the 14.8 points.

### OT2d: fewer pungs

#### Thinking

Round 2 played 50,000 deals with OT1a against Neural Cat, Jorge Yau, Lucky Cat, O5 and OL2c, then tried a deeper and a wider network from scratch on the two rounds of target data (J −17.9 and −34.1 on 6,000 deals: two rounds aren't enough to train from scratch), three times the learning rate (`finetune-fast`, +4.9), and win bonus +50 (+1.1). The claim margin arm, `claimMargin+50`, led with +6.1, and with a paired margin of ±5.1 already on 6,000 deals.
#### What it does differently

It is OT1a's network, taking a pung or kong only when it scores 50 points more than passing. Against OT1a on the same 40,000 deals: it pungs a discard about a fifth as often (3,174 pungs to 15,389) and kongs more (5,370 to 3,919), and more of its wins are concealed (4,173 to 4,056). It wins as often (2.7% to 2.8%), each a little bigger (5,906 points to 5,759, 9.5 faan either way). It wins fewer All Triplets (164 to 319), Mixed Orphans (386 to 522) and dragon pungs (663 to 760), with Thirteen Orphans (1,401 to 1,373), Concealed Triplets (934 to 915) and Seven Pairs (1,750 to 1,686) about level. It deals in just as often (13.4%), for a little less (24.7 points a hand to 24.9).
#### Reading

The network rated most pungs of 1s, 9s and honors only a little above passing. A pung shows a meld, which ends Thirteen Orphans and the pairs hands and fixes the triplets target. Kept concealed, the pair can still become a concealed pung or kong, or the eyes of a bigger hand. The fixed-family lab had found the same direction with `claimMargin+25`, which cut deal-ins whenever it was tried, but its margins were too wide to keep it.
#### Result

J +2.4 on 40,000 fresh deals (points +2.5 ± 1.9, paired), beyond its standard error: kept, and shipped as **OT2d**. Only a few choices change, so the paired margin is narrow. Against the rule-based bot on those deals: +77.9 ± 9.8 points a hand (OT1a: +75.4).

### OT4a: more wins, a few of them small

#### Thinking

Round 3, from OT2d, kept nothing: `finetune-wins` (a fine-tune, then win bonus +300) led with J +20.2 on 6,000 deals but fell to +3.9 on 40,000 (points +0.4 ± 9.4), under the bar of half the margin. It won more (3.4% to 2.7%) but smaller (4,627 points to 5,848). Round 4 played 50,000 more deals with OT2d against Neural Cat, Jorge Yau, Lucky Cat, OL2c and OT1a, so four rounds of data with the targets, then tried `finetune-wins` again (+10.8 on 6,000 deals), `finetune-fast` (+15.1), `finetune-slow` (+1.2), win bonus +50 (+2.8) and claim margin 75 (+2.1). Both fine-tunes sent to 40,000 deals passed: `finetune-fast` J +7.2 (points +6.5 ± 9.7) and `finetune-wins` +14.8.
#### What it does differently

Against OT2d on the same 40,000 deals: it wins 3.5% of hands to 2.7% (5,521 wins to 4,361). Most of the extra wins are Seven Pairs (2,876 to 1,792), and its limit hands hold up (1,864 to 1,796, Thirteen Orphans 1,450 to 1,409, Concealed Triplets 943 to 902). Each win is smaller (4,827 points to 5,746, 8.6 faan to 9.5), and more are self-drawn (1,366 to 1,011). It pungs less (2,043 to 3,038), with the same claim margin of 50, and deals in a little less (13.1% to 13.3%, 25.0 points a hand to 26.4).
#### Reading

Two things changed at once: the network trained on four rounds of target data, and its play adds 300 points times the chance to win to every choice. The bonus tips close calls toward the hand more likely to finish, which brings back some of the Seven Pairs OT1a gave up, without giving up the limit hands. Win bonus +50 alone on OT2d's network was +2.8 on 6,000 deals, so most of the gain is the bonus being big, the new network, or the two together. In the fixed-family lab every candidate drifted to fewer, bigger hands and lost. Here the arm built to push back against that drift was kept, on its second try.
#### Result

J +14.8 on 40,000 fresh deals (points +11.2 ± 9.5, paired), beyond its standard error: kept, and shipped as **OT4a**. Against the rule-based bot on those deals: +79.8 ± 9.8 points a hand (OT2d: +68.7).

### OT5e: a bigger win bonus

#### Thinking

Round 5 played 50,000 deals with OT4a against Neural Cat (NC3), Jorge Yau, Lucky Cat, OT1a and OT2d, then tried `finetune-wins` again (J −3.9 on 6,000 deals: a second bonus of +300 on top of OT4a's), `recent` (−7.3), `finetune-fast` (+11.6, then +0.3 on 40,000 deals, points −2.0 ± 10.1, rejected), and win bonuses of 250 (+1.0) and 450 (+2.9). On 40,000 deals the win bonus of 450 kept its lead: the paired margin of a play setting is narrow.
#### What it does differently

It is OT4a's network, with a win bonus of 450 instead of 300. Against OT4a on the same 40,000 deals: it wins 3.8% of hands to 3.5% (6,154 wins to 5,592), most of the extra ones Seven Pairs (3,371 to 2,842), with limit hands (1,898 to 1,880) and Thirteen Orphans (1,485 to 1,477) level. Each win is smaller (4,436 points to 4,837, 8.4 faan to 8.7), more are self-drawn (1,533 to 1,403), and it deals in just as often (12.9%, 23.7 points a hand either way).
#### Reading

The same direction as OT4a, one step further: more of the close calls go to the hand more likely to finish, and those are Seven Pairs. The points gain alone, +1.9 ± 2.0, is within its margin, so the lab kept it on J, which counts each extra percentage point of hands won as 5 points a hand. Two signs of where it ends: `finetune-wins`, which stacks another +300 on OT4a, lost (−3.9), and `winBonus-50` back to 250 was about level (+1.0). Neither is clean evidence (the first is a new network too), so the next rounds will show how far the bonus can go.
#### Result

J +3.7 on 40,000 fresh deals (points +1.9 ± 2.0, paired), beyond its standard error: kept, and shipped as **OT5e**. Against the rule-based bot on those deals: +81.8 ± 10.0 points a hand (OT4a: +79.9).

### OT6e: win bonus 500, a hair better

#### Thinking

Round 6 was the first against Neural Cat NC5 (with Jorge Yau, Lucky Cat, OT2d and OT4a). Every network the lab trained lost on 6,000 deals: `finetune` J −16.1, `finetune-slow` −20.4, `deep` from scratch −23.9. So did a win bonus of 400 (−2.3). Only a win bonus of 500 led (+1.6), and it was the only candidate with J above 0, so the only one sent to 40,000 deals.
#### What it does differently

It is OT5e with a win bonus of 500 instead of 450. Against OT5e on the same 40,000 deals: it wins 3.87% of hands to 3.76% (6,190 wins to 6,011), the extra ones Seven Pairs (3,576 to 3,406), each win a little smaller (3,961 points to 4,073). Limit hands (1,735 each), pungs, kongs and deal-ins are the same.
#### Reading

A real gain, but a small one. The paired margin of a play setting that changes few choices is narrow (±1.0 point a hand here), so the keep rule, J beyond half its margin, passes steps this small. The win bonus has now gone 0 → 300 → 450 → 500, and each step gained less: J +14.8 (with a new network), +3.7, +1.0. It is close to where more win bonus stops paying. The trained networks are the bigger question. Three in a row lost to OT5e's on 6,000 deals, with six rounds of data and a new Neural Cat at the table. Since OT4a, the gains have come from play settings on that one network.
#### Result

J +1.0 on 40,000 fresh deals (points +0.5 ± 1.0, paired), beyond its standard error: kept, and shipped as **OT6e**. Against the rule-based bot on those deals: +75.3 ± 9.4 points a hand (OT5e: +74.8). The table changed to NC5, so scores against the rule-based bot from round 6 on don't compare directly with earlier rounds.

### OT7c: a new network again

#### Thinking

Before round 7 the keep rule gained a floor: J must beat half its margin and be at least +2, so a step as small as OT6e's (+1.0) is no longer shipped. Round 7 played 50,000 deals with OT6e against Neural Cat NC5, Jorge Yau, Lucky Cat, OT4a and OT5e. The lab chose the arms it had tried least: claim margins of 75 (J +0.9 on 6,000 deals) and 100 (+1.6), and three networks: `finetune-wins` (+18.2), `finetune-fast` (+16.2) and `recent` (−12.6). Both fine-tuned networks went to 40,000 deals, and both held: `finetune-fast` J +13.5 (points +12.5 ± 9.6), `finetune-wins` +13.4 (points +10.7 ± 9.1).
#### What it does differently

It is OT6e's network fine-tuned at three times the learning rate on all seven rounds with the targets, with OT6e's play settings (win bonus 500, claim margin 50). Against OT6e on the same 40,000 deals: it wins 4.1% of hands to 3.9% (6,625 wins to 6,292). Most of the extra wins are Concealed Triplets (1,172 to 993) and Mixed Orphans (622 to 526), with Seven Pairs (3,709 to 3,627) and limit hands (1,884 to 1,786) a little up. Each win is a little bigger (4,165 points to 4,015). It pungs more (2,749 to 2,228) and kongs more (5,628 to 5,203), and it deals in a little less (13.3% to 13.6%, 22.8 points a hand to 24.0).
#### Reading

The first trained network to beat the champion since OT4a, after three that lost. Two things look different this round: seven rounds of data, and an opponent (NC5) the last two rounds of data were played against. Unlike the win-bonus steps, which bought Seven Pairs with smaller wins, this one wins more and bigger at once, and gives away less, with the same settings, so the gain is in the network's own choices, most visibly on the triplet hands. `finetune-wins` (a second +300 win bonus on top) did almost as well on J by winning more hands (4.5%) that were smaller (3,788 points), so the win bonus near 500 still looks about right. The play settings alone gave little this round (claim margins +0.9 and +1.6, below the new floor).
#### Result

J +13.5 on 40,000 fresh deals (points +12.5 ± 9.6, paired), beyond its standard error and the floor: kept, and shipped as **OT7c**. Against the rule-based bot on those deals: +91.1 ± 9.7 points a hand (OT6e: +78.6).

### OT11d: win bonus 800, wins without points

#### Thinking

Rounds 8 to 10, the first against Neural Cat NC8 (so scores against the rule-based bot from round 8 on don't compare directly with earlier rounds), kept nothing. Round 8: `finetune-wins` (+11.3 on 6,000 deals) and `finetune` (+8.4) went to 40,000 deals and lost there (−1.6, −6.1), while a win bonus of 650 (+4.5) never got the longer check, because only the top two go. Round 9: a win bonus of 550 came to J +1.9 on 40,000 deals (points +1.4 ± 1.4), stopped by the +2 floor. Round 10: every candidate lost on 6,000 deals, a wide network from scratch the worst (−25.5). Round 11 ran in bold mode. A much wider network from scratch came to +1.3, `finetune-wins` +10.3 then −3.3 on 40,000 deals, and a win bonus of 800 +4.7 then +2.9.
#### What it does differently

It is OT7c with a win bonus of 800 instead of 500. Against OT7c on the same 40,000 deals: it wins 4.6% of hands to 4.1% (7,315 wins to 6,487), nearly all the extra ones Seven Pairs (4,555 to 3,766), with limit hands (1,750 to 1,752), Thirteen Orphans (1,317 to 1,311) and Concealed Triplets (1,148 to 1,135) level. Each win is smaller (3,482 points to 3,911, 7.7 faan to 8.1), more are self-drawn (1,728 to 1,516), and it deals in just as often (13.7% to 13.8%, 23.6 points a hand to 23.8).
#### Reading

All of the gain is in wins, none in points: 79.3 points a hand to 79.1, +0.3 ± 3.0. J counts each extra percentage point of hands won as 5 points a hand, so a setting that trades bigger hands for more Seven Pairs at the same points passes on J alone. That is what J is built to prefer, but it is the fourth win-bonus step (300 → 450 → 500 → 800), and the 6,000-deal readings around it don't line up: 650 was +4.5 in round 8 and −0.8 in round 11. A win bonus this high is close to where J's win weight, not the score, is doing the choosing. Since OT7c, no trained network has held up on 40,000 deals: four tries over rounds 8 to 11, all lost. Retrained networks swing about ±23 points a hand on 6,000 deals, so they keep taking the two 40,000-deal places from play settings, whose margins are a few points.
#### Result

J +2.9 on 40,000 fresh deals (points +0.3 ± 3.0, paired), beyond its standard error and the +2 floor: kept, and shipped as **OT11d**. Against the rule-based bot on those deals: +85.1 ± 9.4 points a hand (OT7c: +84.9).

### Critique: the screen favored luck, and J favored wins

Eleven rounds with the targets trained 33 networks and tried 22 play settings. Three networks were kept (OT1a, OT4a, OT7c) and four settings (OT2d, OT5e, OT6e, OT11d). Twenty-one of the networks led the champion on 6,000 deals, 14 went on to 40,000, and 11 of those 14 fell short there. The lab's last four rounds kept one setting step that won on wins alone. What went wrong, and what changes from round 12:

- **The first screen was too small for networks.** A retrained network changes many choices, so on 6,000 deals its paired margin is about ±23 points a hand, against ±2 to ±7 for a play setting. The best of three networks on 6,000 deals is mostly the luckiest of three: rounds 8 to 11 sent four networks that led by +8 to +11 to 40,000 deals, and all four lost there. **Next:** networks are screened on 12,000 deals (about ±16).
- **Networks crowded out settings.** Only the top two on 6,000 deals went to 40,000, so a lucky network took the place of a setting with a small, steady lead: in round 8 a win bonus of 650 (+4.5 ± 6.9) never got the long check behind two networks that both lost. **Next:** one of the two places goes to the best network ahead and one to the best setting ahead; if one kind has none ahead, the other may take both.
- **J could be won without points.** J adds 5 points a hand for each extra percentage point of hands won. That was meant to break ties toward finishing hands, but a setting that trades bigger hands for more Seven Pairs at level points passes on it alone: OT11d, J +2.9 with points +0.3 ± 3.0. Four of the seven champions were win-bonus or claim-margin steps, and in three of them (OT5e, OT6e, OT11d) about half of J or more came from the extra wins. **Next:** a candidate must also not lose points a hand (points above 0), on top of J beyond half its margin and at least +2.
- **`recent` repeats `finetune` when data is short.** With three rounds or fewer, both arms train on the same data, so two candidates were one model in rounds 1 and 3. With eleven rounds of data that no longer happens, but `recent` has lost in every round since round 3 (−7.3, −12.6, −9.2), so the lab's arm picking already plays it less.
- **What worked.** Fine-tuning the champion on all the rounds with the targets made the three networks kept, the last (OT7c) at three times the learning rate on seven rounds. Networks trained from scratch never came close: `deep` and `wide` lost all four tries on 6,000 deals, by 18 to 34 points a hand, and `wider` was +1.3. The keep floor of +2, added before round 7, stopped a win bonus of 550 (J +1.9) in round 9, a step as small as OT6e's.
- **Not yet changed.** What the network sees and what it is trained toward are the same as in round 1. If the fairer screen still finds no network ahead after a few rounds, the next step is there: new features or a new training target, not more settings.

## The frontier: Lucky Cat generation 1 and Sphinx

**In this section:** [The plan and the benchmark](#the-plan-and-the-benchmark) · [Phase 0: the Suphx teacher](#phase-0-the-suphx-teacher) · [Phase 1: features v2 and the hidden tiles as targets](#phase-1-features-v2-and-the-hidden-tiles-as-targets) · [The native simulator](#the-native-simulator) · [Native-scale rounds (from 2026-11-09)](#native-scale-rounds-from-2026-11-09) · [Where it stands](#where-it-stands)

The newest training idea, from 2026-11-08: make Lucky Cat the strongest Hong Kong mahjong player by taking apart what made Suphx strong (Li et al. 2020) and keeping only what fits Hong Kong rules. It has two lineages, **Lucky Cat** (generation 1 is still lc32, widened to the new features as `lc32v2`) and **Sphinx** (from random weights). No model has shipped from it yet: every candidate failed the benchmark's bar. The design is the [frontier plan](suphx-plan.md), the choices with their evidence are in the [frontier history](frontier-history.md), and what each step taught is in the plan's learnings.

### The plan and the benchmark

Suphx was argued through four rounds of critique into phases, each with a bar to pass and a reason to stop. The first thing built was the benchmark ([details](benchmark.md)): one frozen table (two Neural Cat NC8 and Jorge Yau at 0.57.9, pinned by SHA-256 and a fingerprint), one fixed 40,000-deal deck, and one number, the Table Score. A candidate must beat its current generation by two standard errors on a screen, qualify, then replicate on fresh deals, and may not do worse than the generation at a table of the rival. The lab's history has several models that were kept and then level on a second look (LL6c, LL8a, LR3a), so the frontier takes fewer, surer steps.

### Phase 0: the Suphx teacher

Built first, as the lab's `lucky-cat-suphx` arm: the hidden tiles (each opponent's concealed hand, their waits, the live wall) say which discards would deal in right now, and a teacher pushes those moves down. It is for training only: the shipped model never sees a hidden tile, and the [fair-play test](fair-play.md) checks it. It became the per-move teacher every phase-1 arm trains with.

### Phase 1: features v2 and the hidden tiles as targets

Lucky Cat's inputs grew to 854 numbers (who threw what, after claims, and shanten and live waits for each discard), and auxiliary heads learn to predict the hidden tiles as targets, never as inputs. [Details](frontier-training.md).

#### Lucky Cat rounds 1 to 3

Nine arms. The best, LV1a, led its screen at +7.6 points a hand and fell to +4.3 on the judgment's own screen. The heads learned to read the table (deal-in AUC 0.87 to 0.92, waits 0.52 to 0.61 by round 3), but play didn't change: the nine screens averaged −0.4 points a hand. Reading the table better did not, by itself, make it play better.

#### Sphinx rounds 1 and 2

Sphinx learned by imitating its own rare wins in self-play among random players. It won five times as often and dealt in far more: SP1a, SP1b, SP1c and SP2a each lost about 43 points a hand to random play. It learned to race for cheap hands, and nothing taught it defence. Sphinx was paused.

#### Policy-gradient probes (PG1 to PG3)

Training on what hands scored, with the heads and the teacher. PG2 and PG3 passed the screen (+8.1, +5.7) and then failed to qualify (−2.4, −2.6). The critic explained none of the reward, so training on hand returns was mostly luck. The next signal is phase 3's per-move value, not another round of the same one.

### The native simulator

Playing hands, not training, set the pace: a round's data took 330 s and a screen about 16 minutes. The engine and the benchmark table's players were ported to C++, bit-exact with the JS (the one real bug it found was V8's sort), then optimized in three rounds: one core went from 148 to 384 hands a second at the benchmark table. A round's 20,000 deals of data now take 12.9 s, and a 2,000-deal compare 9.9 s, against about 200 s in JS. It runs as a hybrid: training data and screens on the fast build, judgments and Table Scores on the exact build, so a verdict reproduces to the decimal against the JS. Every result records its simulator. [Details](native.md).

### Native-scale rounds (from 2026-11-09)

With data costing seconds, the rounds were rescaled: 100,000 deals a round, 40,000-deal screens (one standard error about 2.5 points a hand, enough to see a +3-point arm), and new arms. Sphinx restarted as v2, learning at the table it is judged at from its first round instead of in random self-play. A round of Lucky Cat takes about a minute of data, 8 minutes of training and 10 minutes of screens, plus a judgment of about 20 minutes when an arm passes. The rounds delete their own data once it leaves the training window, so a long run does not fill the disk.

### Where it stands

Phases 0 and 1 are built and training; phases 2 and 3 are designed. Search was measured (4 worlds, ±8.4 points a choice, no measurable gain) and is deferred to after phase 3, when it ships only at +20 points a hand or more within 1.5 s a move. Each decision, and what would reopen it, is in the [frontier history](frontier-history.md#what-would-reopen-each-decision).

## Lucky Cat 3: self-taught and stacked, playing to win (from 2026-11-10)

On 2026-11-10 the stacked design became Lucky Cat's new lineage, still called Lucky Cat and still self-taught: nothing in its choice comes from Jorge Yau's rules or options. It starts from LC32 and is judged on points a hand, with a floor on hands won (the maintainer's call: maximize points, keep a fairly high win rate; rounds 2 and 3's first try judged hands won alone). Models in this lineage are named LV (the round driver `npm run ml:lucky-value`; not the phase-1 arms of the same name above). [Details](../strategies/lucky-cat.md#the-value).

### Round 1: a value, judged on points, wins fewer hands

Thinking: give Lucky Cat Neural Cat's kind of value, a network that scores the position each of the policy's top moves leaves, learned from replays of every option. LV1a scored +14.0 ± 2.7 points a hand over LC32 (60,000 deals) and won 15.5% of its hands against 20.5%: it bought points with fewer, bigger wins. Bigger win bonuses didn't bring the wins back, and a value ranking by its own chance to win still won fewer hands than LC32 (top 4: 3.0 points of win rate fewer; top 2: 1.5). Not kept.

### Round 2: the policy learns from the replays (LV2p)

Thinking: if the value can't choose better than the policy, use the replays to make the policy choose better. `train_lucky --mode q` tilts LC32's shares toward the moves that won more replays. On 80,000 deals, against LC32 over 60,000:

- **LV2p (tau 0.05):** won 21.1% of hands against 20.7%, +0.40 ± 0.08 points of win rate (five standard errors); −2.1 ± 2.0 points a hand. The champion.
- **LV2t (tau 0.15):** +0.32 ± 0.07, a candidate too.
- **LV2a (a value):** −1.31 ± 0.38 after 4,000 deals, dropped.
- **What the bot does differently:** the same network, a little more sure of the moves that won their replays. It deals in as often (15.3% against 15.4%) and wins slightly smaller hands (5.46 faan against 5.49).

### The objective: points, with a floor on hands won

The maintainer then settled the objective: Lucky Cat may be trained to maximize points, as long as it keeps a fairly high win rate. Screens and the bar judge points a hand, and a model more than one point of win rate behind its champion is dropped. The policy recipes now learn each move's replayed mean points plus a bonus for a sure win (300 or 1,000 points). LV2p, level on points (−2.1 ± 2.0), is the starting champion for round 3, not a release.

## Lucky Cat against its own lineage: LC33 (2026-11-11)

In this section: [the idea](#the-idea-only-older-lucky-cats-at-the-table) · [LC33](#lc33-lo2a-two-confirmed-steps-from-lc32) · [what didn't work](#what-didnt-work-that-night)

### The idea: only older Lucky Cats at the table

Thinking: one overnight run (2026-11-10 to 11) trained each lineage against nothing but its own older models, on the native simulator. Lucky Cat's table was three of its last four generations, and a candidate was paired with the champion in every seat of the same deals.

- **Replays with common random numbers.** At a sampled choice, each of the policy's top 4 moves is forced and the hand replayed 8 times on the *same* reshuffled walls (the tiles the seat hasn't seen). The gap between two moves then has 2.4 times less noise than with independent replays, measured with two salts on the same choices. The trainer's q mode tilts the policy's shares toward the moves that scored more.
- **Small steps that compound.** A model becomes the lineage's next generation when, on fresh deals on the exact build, points a hand or hands won is up by two standard errors and the other isn't down by more than one. Each generation then plays the next round's data and joins the table.
- **A stricter bar to ship:** three standard errors on points against the shipped model, on pooled fresh deals, with hands won not down.
- **Screens overstate.** Every arm shared the champion's games, so its luck moved them together. Round 1's leader screened at +4.6 ± 1.4 and confirmed at +0.1 ± 1.4, so every step is confirmed on fresh deals: 160,000 when the gap is small.

### LC33 (LO2a): two confirmed steps from LC32

| Step | Against | Fresh deals (exact build) | Points a hand | Hands won | Deal-ins | Average win |
| --- | --- | --- | --- | --- | --- | --- |
| G1 = LO1b (tau 30, win bonus 300) | LC32 | 80,000 | +0.1 ± 1.4 | **+0.23 ± 0.07** (22.45% vs 22.22%) | 16.72% vs 16.69% | 288 vs 291 |
| G2 = LO2a (tau 30, win bonus 150, data from G1) | G1 | 160,000 | **+2.2 ± 0.9** | +0.07 ± 0.05 | level | 301 vs 295 |
| **LC33 = G2** | **LC32** | **160,000** (two runs of 80,000: +6.3 ± 1.5 and +5.5 ± 1.5) | **+5.9 ± 1.1** | **+0.35 ± 0.05** (22.1% vs 21.8%) | level | about 310 vs 289 |

- **Reading:** the win bonus decides what the replays teach. Points double with each faan, so with 8 replays a move's chance to win is measured far better than its points. At bonus 300 the network learned to win more often and gave up a little hand value (G1). At 150 it kept the wins and won bigger (G2). At 0 it scored more still on the screen but won 0.30 ± 0.10 fewer hands, and was dropped.
- **What the bot does differently:** against its own kind, LC33 wins slightly more often than LC32 and its wins are worth about 20 points more, with the same deal-ins. It is the same network (376 inputs, 512-256, 74 outputs) with its shares moved toward the moves that scored more on the replays; KL from G1 0.014.
- **At the game's table it is level with LC32.** With two Neural Cats and Jorge Yau, on 60,000 fresh deals on the exact build: −1.6 ± 2.6 points a hand, hands won 19.23% vs 19.17%, deal-ins 14.27% vs 14.29%. What it learned against Lucky Cats neither helps nor hurts against the other strategies.
- **Fair play:** the shuffle check passes; it reads only its seat.

### What didn't work that night

- **Weight noise** (sigma 0.01 to 0.05, alone or before a fine-tune): level or behind, every time.
- **Larger steps** (lr 1e-3, 8 epochs): −6.4 ± 4.8 on the screen. With warm-up, a cosine schedule and averaged weights the same step trains stably; in play it kept nothing.
- **Gradient clipping** never bites: the loss is a cross-entropy to a softmax target, and the largest gradient norm was 0.18.
- **A residual, layer-normalized teacher** (768 wide, 4 blocks) overfits and its distilled student is worse than the control: capacity isn't the limit at this much data.
- **Truncated replays scored by a learned value** made the data 2.8 times faster, but the value's expected points correlate with the hand's real points at only 0.12, and every arm trained on them dealt in more.
- **Round 4**, from G2: the screen's leader, LO4c, confirmed at −1.3 ± 0.9 on 160,000 deals. Nothing kept.

Tools: `scripts/ml/lc-own.js` (cached, pruned paired screens and the replay data), `scripts/ml/lc-own-loop.js` (the round driver), `ml/lc_own_train.py` (every arm in one GPU process: 9 arms in 15 s, against 52 s for one arm before).

## Only Orphans on the stacked method (2026-11-10)

**In this section:** [Round 1: replayed labels against the control](#round-1-replayed-labels-against-the-control) · [The reader, OR1](#the-reader-or1) · [Round 2: the control comes out ahead (OS2c1)](#round-2-the-control-comes-out-ahead-os2c1)

Only Orphans was ported to the native simulator ([how](native.md)), then trained the way Neural Cat's stacked models were (`node scripts/ml/frontier-model.js --strategy only-orphans`): every seat recorded, a quarter of the discards replayed 8 times with the wall shuffled, and a reader whose read the move network takes as input. Each round played 100,000 deals (about 1.1 million positions), OT11d exploring against Neural Cat, Jorge Yau and Lucky Cat. Every model started from OT11d at lr 1e-4, and kept its play settings (top 3, win bonus 800, claim margin 50). Screens played 60,000 fresh deals against OT11d at the game's table. OS2c1 shipped in 0.61.7.

### Round 1: replayed labels against the control

| Recipe | Seed 0 | Seed 1 | Mean |
| --- | ---: | ---: | ---: |
| p: replayed labels | +3.7 ± 3.8 | +5.1 ± 3.8 | +4.4 ± 2.7 |
| c: real endings only (the control) | +4.8 ± 3.8 | +0.9 ± 3.7 | +2.9 ± 2.7 |

Points a hand against OT11d. Neither recipe counted as ahead.

### The reader, OR1

Trained on round 1's data from OT11d, with the extra heads. On held-out positions it scores AUC 0.89 for an opponent being ready and 0.88 for the tile thrown dealing in now. On positions whose seat went on to win, its hand head names the winning hand 74.2% of the time, against 38.5% for the rules' read of the same tiles.

### Round 2: the control comes out ahead (OS2c1)

| Recipe | Seed 0 | Seed 1 | Mean |
| --- | ---: | ---: | ---: |
| p: replayed labels | +4.0 ± 3.8 | +6.3 ± 3.9 | +5.2 ± 2.7 |
| q: replayed labels and the reader (stacked) | +5.0 ± 3.8 | +5.2 ± 3.8 | +5.1 ± 2.7 |
| c: real endings only (the control) | +4.9 ± 3.8 | +8.5 ± 3.8 | +6.7 ± 2.7 |

Points a hand against OT11d. p and c trained on both rounds' data. q trained on round 2's alone, leaving out the data its reader learned from, so it saw half as many positions.

#### What it does differently

Every candidate, in both rounds and in every recipe, plays the same new way: more hands won, smaller wins, about the same deal-ins. OS2c1 against OT11d on the same 60,000 deals: wins 6.54% of hands to 5.35%, average win 2,380 points to 2,735, average faan 6.93 to 7.16, deal-ins 14.20% to 14.13%.

#### Reading

The control is the driver's candidate, so the gain comes from more training on fresh data that records every seat, not from the replays or the reader. The three recipes are within a standard error of each other, and OS2c1 is the best of six models, so its +8.5 is likely flattering; the recipe's mean, +6.7 ± 2.7, is the fairer figure.

#### Result

Shipped as **OS2c1** in 0.61.7, by the maintainer's decision, on this screen. It was not judged on the bar: Only Orphans has no lineage in `bench/lineages.json`. The reasoning: it wins clearly more hands, it scores more points, and it learned against today's table, where OT11d learned against older, weaker ones.

## The contradiction check: every move agrees with its hand

**In this section:** [What it is](#what-it-is) · [The discard check, measured](#the-discard-check-measured) · [Every decision, and every strategy](#every-decision-and-every-strategy) · [Head to head: with the check against without it](#head-to-head-with-the-check-against-without-it) · [What it taught, and what comes next](#what-it-taught-and-what-comes-next)

Not a new model: a rule every strategy, every model and the coach now pass every move through (0.57.25). The coach would say "Go for Half Flush in Characters" and then throw a Character with a Bamboo still in hand. The reason was structural: the foundation scores each possible discard against the best hand for the tiles left after it, so the hand a discard is "building" is chosen separately for each discard, and a discard can be scored as building a hand it breaks. The rules are in [the strategies doc](../strategies/README.md#the-contradiction-check).

### What it is

#### Thinking

A move must not go against the hand it builds toward. A discard contradicts its hand when it throws a tile that hand keeps while the hand still holds a tile it has no use for; a claim or a kong contradicts it when that hand can't take the meld. When the first choice contradicts, the strategy's next choice in its own order is taken, until one doesn't; if every one does, the last of them. Never a contradiction: a discard that leaves the hand ready, a win, a pung of a dragon or scoring wind (except on Thirteen Orphans), a dead honor, a dragon held back, and any move while folding.

#### What it does differently

Jorge Yau, Only Orphans and Lucky Cat Classic run it at the end of the foundation's discard order and on every claim and kong. Neural Cat's model chooses only among moves that pass. Lucky Cat's network has each pick checked against the plan the shared foundation reads for its seat, and the network's next most likely move that passes is played. It runs in the game, in every simulation and in training, where the data records the move the check settled on. The native simulator has it too (parity on 2,500 hands), and `lcm-sim` plays `id~nocheck` without it, to measure it.

### The discard check, measured

#### Result

The first version checked discards only (Lucky Cat's network unchecked). Jorge Yau in every seat of 40,000 deals, master's build against the check's, points a hand for that seat:

| Table | Without | With | Change |
| --- | ---: | ---: | ---: |
| Game table (Neural Cat, Jorge Yau, Neural Cat) | −46.8 ± 2.9 | −35.1 ± 2.8 | +11.7 ± 4.0 |
| Three Lucky Cat lc32 | +32.3 ± 2.2 | +39.8 ± 2.3 | +7.5 ± 3.2 |
| Three Neural Cat NC8 | −82.4 ± 3.3 | −58.5 ± 3.1 | +23.9 ± 4.5 |

#### Reading

The Lucky Cat table is the clean row: its opponents were the same in both runs. At the other two the opponents changed too, because Neural Cat plays on the same foundation, so part of the +23.9 against Neural Cat is Neural Cat getting weaker (see the head to head below).

### Every decision, and every strategy

#### Thinking

The check was then extended to claims and kongs, and to Lucky Cat's network in the game, in benchmarks and in training. Lucky Cat's check is based on the shared foundation's plan (as Jorge Yau and Neural Cat play it), which the native simulator already has, in place of the classic rules' plan, which it doesn't: its coach's words about the hand moved to that plan too.

#### Result

The same 40,000 deals, every strategy at the table with the full check against none:

| Table | Without | With | Change |
| --- | ---: | ---: | ---: |
| Game table (Neural Cat, Jorge Yau, Neural Cat) | −46.8 | −37.8 | +9.0 ± 4.0 |
| Three Lucky Cat lc32 | +32.3 | +32.0 | −0.2 ± 3.4 |
| Three Neural Cat NC8 | −82.4 | −54.3 | +28.1 ± 4.5 |

### Head to head: with the check against without it

#### Thinking

The runs above compare whole tables. To see what the check does to each strategy alone, each one played itself: with the check and without it (`id~nocheck`), each in every seat of the same 20,000 deals against the same three opponents, the difference taken deal by deal. Once against opponents without the check, once against opponents with it.

#### Result

| Strategy | Against a table without the check | Against a table with the check | Hands won | Average win |
| --- | ---: | ---: | --- | --- |
| Jorge Yau | **+10.0 ± 2.9** | **+7.6 ± 2.8** | 16.7% vs 16.0% | 493 vs 440 points |
| Neural Cat NC8 | **−15.6 ± 4.2** | **−9.3 ± 4.3** | 15.5% vs 14.2% | 846 vs 994 points |
| Lucky Cat lc32 | **+11.8 ± 2.0** | **+14.2 ± 1.9** | 18.6% vs 23.0% | 280 vs 172 points |

Points a hand, with the check minus without it. A 2,000-deal run in the JS engine (two seats each, seats swapped) had said the same, inside its noise: Jorge Yau +38 ± 22, Neural Cat −42 ± 27, Lucky Cat +17 ± 12.

#### What it does differently

- **Jorge Yau** wins a little more often and bigger (493 points a win against 440), with the same deal-ins.
- **Lucky Cat** wins fewer hands (18.6% against 23.0%) worth about 60% more each (280 points against 172): it stops finishing cheap hands that go against the hand it was building. It deals in a little more (18.5% against 17.7%).
- **Neural Cat** wins more hands (15.5% against 14.2%) worth about 15% less (846 points against 994). Its model weighs a discard in expected score; the check replaces the model's pick after the fact with a move the model rated lower, and the big hands it was building pay for it.

### What it taught, and what comes next

#### What it taught

- **Consistency pays for the rule strategy and for Lucky Cat.** Both gain about 8 to 14 points a hand from never going against their own hand.
- **Overriding a model after it has chosen costs it.** Neural Cat loses 9 to 16 points a hand to the check as it stands. The check stays on for every strategy and model all the same: a move that contradicts the hand the coach names is the thing being fixed. Why it costs the model isn't known yet: its picks in those positions may be reading safety or a second hand that the rule-made hand doesn't, or the model may simply not have learned the game with the check on.
- **A whole-table comparison hides this.** Jorge Yau's seat gained most at the Neural Cat table, where part of the gain was the opponents losing. Only the head to head separated the two.
- **The contradiction is a symptom.** A hand chosen once for each possible discard can always disagree with the discard. The fix that removes it at the root is to choose the hand first.

#### What comes next

The [evaluation architecture](../architecture/README.md): a main hand and a backup picked for the turn (the hand picker), a pivot checker that decides whether to stay on it, a discarder (rules or a model), and the contradiction check last. Before any of it is built, three things are measured (why the check overrides Neural Cat, whether the chance to finish is right, how often each strategy pivots) and four small experiments run head to head: a Neural Cat lab round with the check on, a finer meaning of a tile the hand keeps, a backup hand in the check, and hand-first scoring for Jorge Yau.

## Frontier Cat: one model, three heads (FC1)

The [frontier plan](frontier-plan.md) after the [Suphx plan](suphx-plan.md) was cancelled: grow Neural Cat into one network that reads the table, picks the hand and values the move, and train it on the native simulator. The full comparison with the previous architecture is the [frontier report](frontier-report.md); every finding with its evidence is in the plan's [Learnings](frontier-plan.md#learnings).

### Thinking

Neural Cat's network predicts how the hand ends from the position a discard leaves. That is the part of the project that has worked, so the new model keeps it as its move head and adds what it lacks: a read of the opponents (who is ready, on which tiles) and of its own hand (which hand it will win with), learned with the hidden tiles as answers. The bet was that a move valued with that read in hand would choose better, and that the hand head could replace the rules' five ways of picking a hand.

### Round 1: the heads, as outputs

The heads were added to N14c's network as extra outputs (FM1, three recipes of three seeds).

- **The read is good.** The hand head names the hand a seat goes on to win with 74% of the time, against 64% for the rules' read, and its chances are calibrated hand by hand. An opponent being ready is read with an AUC of 0.84, a tile that deals in now with 0.87.
- **Play didn't change.** Heads at weight 0.2: +0.5 ± 2.2 points a hand against N14c; the control without them, −1.3 ± 2.1. The move was still chosen from the same 28 outputs, so a better read had no way to change it.
- **What it did differently:** every fine-tuned model, the control too, won less often (15.5–16.5% of hands against 17.4%) with bigger wins (6.2 faan against 5.8). That came from the data (one round of the champion's own exploring seats), not from the heads.

### Round 2: the read, as an input

The stacked model: the round-1 heads model became a frozen **reader**, and its read (16 numbers) went after the features of a **move network** that started as N14c with zero weights on the read (FM2).

- **The read added nothing.** On held-out positions the stacked models predicted endings no better than the control trained on the same rows (validation loss 3.0712–3.0718 against 3.0715–3.0723). At the table the best of each were level: −3.9 ± 3.6 and −4.5 ± 3.7 points a hand against N14c over 60,000 deals.
- **Why, as far as the evidence goes:** the read is a function of the same features, and N14c's network already makes most of it from them (its inputs include a hand-made threat read for each opponent). A second network's read only helps if it knows something the move network can't learn from the endings, and here it doesn't.
- **One round of data moves it backwards.** Trained on round 2's data alone, every model was best after one epoch and every one played worse than N14c. The recipes after this train on more rounds at a gentler rate.

### A wider choice

N14c scores Jorge Yau's best 6 discards. Scoring his best 10 was +2.2 ± 3.5 points a hand, and every legal discard +0.8 ± 3.6: neither better, and both dealt in about one point more often. The choice stays at 6.

### Round 3: replayed labels

The plan's biggest lever: one hand's ending is a noisy label, because points double with every faan. A quarter of the champion's recorded discards were replayed 8 times after the hand with the wall shuffled, and the network learned from the replays' endings together with the real one (FM3).

- **The labels are better.** Validation loss on the real endings: replayed labels 3.0641–3.0642, with the reader too 3.0636–3.0638, the control 3.0656–3.0658, five times the spread between seeds. The first version of the replays also shuffled the other players' hands, and it was biased: random hands win far less, so the replays dealt in 4.9% of the time against 12.2% really. Shuffling only the wall fixed that.
- **Play is not.** By recipe against N14c: replayed labels −6.2 ± 4.4, with the reader −4.9 ± 3.6, the control −6.5 ± 3.6.
- **The data was the problem.** Across three rounds, no model trained on frontier data beat N14c, and as a group they were behind it, the controls as much as the rest. That data recorded only the champion's own seats, while the network scores the best 6 options, most of which the champion doesn't choose. N14c's data recorded every seat at the table. On the lab's last two data sets (every seat, new to N14c) the same recipes were all level with N14c: the reader +1.3 and −4.7, the control +2.9 and −3.2, the reader with replayed labels −1.5 and +0.1 (each ± about 5.5 over 20,000 deals). The reader still added nothing to the validation loss there (2.8265–2.8268 against 2.8267–2.8269).

### Round 4: replays on fresh every-seat data

Thinking: if the data was the problem in round 3, replayed labels should pay off on data that records every seat. 150,000 fresh deals on the native simulator, every seat recorded, a quarter of the discards replayed 8 times (FM4).

- **Level, not ahead.** By recipe against N14c over 60,000 deals: replayed labels +0.6 ± 2.4, with the reader +0.7 ± 2.4, the control +2.1 ± 2.4. Round 3's learner-only data had them 5 to 6 points behind, so every-seat data fixes the drift.
- **Prediction again, not play.** Validation loss 3.1090–3.1092 with replays, 3.1086–3.1087 with the reader too, against 3.1111–3.1116 for the control. Twice now the better labels haven't made better moves, so FC1 stays.
- **What the bots did differently:** all six won more hands than N14c (18.5% against 17.4%) and dealt in more (12.3 to 12.5% against 11.8%), the control as much as the rest, which points to the one round of exploring data rather than the labels.

### Round 5: option replays and a ranking loss

Thinking: replayed labels made the network predict better without choosing better; maybe it needed to learn which option is best, not only what each is worth. Every option a seat weighed was played on 12 times from the position, and the network learned a ranking loss over each group (FM5).

- **The ranking loss broke the values:** by recipe −44.7 ± 9.4 points a hand against N14c, −44.4 with the reader, −18.4 with a wider body. A loss on the order of options leaves their level free, and claims compare an option's level against passing.
- **The control is ahead:** replayed labels on two rounds of every-seat data, +6.8 ± 2.4 by recipe (FM5c0 +7.8 ± 3.4 over 60,000 deals), winning 18.6% of hands against 17.3%. On the benchmark's bar it fell short at the screen (+3.7 ± 7.9 points a hand against NC9 over 10,000 deals), so NC9 stays.
- **What the bots did differently:** the control's models win more hands and slightly bigger ones (5.86 faan against 5.75), for a few more deal-ins (12.1% against 11.9%).

### FC1: what ships, and what it does differently

Frontier Cat FC1 is FLq1: the reader, replayed labels, and data that records every seat (the lab's last two sets and round 3's replayed rows), from N14c at lr 1e-4. It plays with N14c's settings (the best 6 options, a win bonus of 300). The same change ships N14c itself as Neural Cat **NC9**, in place of NC8.

On 100,000 fresh deals at the game's table ([frontier report](frontier-report.md#head-to-head)):

| | Points a hand | Hands won | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: |
| FC1 less NC8 | **+15.5 ± 2.8** | 17.4% against 16.8% | 11.6% against 11.5% | 6.00 faan against 5.71 |
| FC1 less N14c (NC9) | **+4.5 ± 2.7** | 17.4% against 17.4% | 11.6% against 11.8% | 6.00 faan against 5.77 |
| N14c less NC8 | +11.6 ± 2.8 | 17.4% against 16.8% | 11.8% against 11.5% | 5.77 faan against 5.70 |

- **What the bot does differently:** against N14c, the same hands won and slightly fewer deal-ins, with wins about a quarter of a faan bigger. The bigger wins came with the replayed labels: on the same deals, the models trained with them won at 5.97 to 6.00 faan and those without at 5.72 to 5.73.
- **What the coach says differently:** at Complex, Frontier Cat adds its read: a player it reads as ready, a tile's chance to win someone the hand right now, and the hand it expects to win with.
- **Not yet proven:** +4.5 ± 2.7 over N14c is short of the bar (two standard errors, twice), and the bar's frozen table only runs in JS now. Most of the gain over the game's Neural Cat is N14c's.

## Where the files are

- Every model's weights are kept, in `ml/models/` and on [Hugging Face](https://huggingface.co/codenameyau/lucky-cat-mahjong), so any of them can play in `npm run compete` (`ml:ml/models/L8.json`).
- League logs and every evaluation: `ml/league/` (Neural Cat) and `ml/lucky/` (Lucky Cat). The rule-bot screens: `ml/tune/` and `ml/pairs/`.
- Training data is kept only while a model uses it ([what is kept](hugging-face.md#what-is-kept)).
- The full playbooks: [Neural Cat](../strategies/neural-cat.md), [Lucky Cat](../strategies/lucky-cat.md), [Jorge Yau](../strategies/jorge-yau.md).

## Documenting a release

**Where it goes.** A new training idea or milestone (a new lab, a new objective, a new model line) is a new `##` section, added to the contents at the top. Each model inside it (L7, LC32, OT11d) is a `###` heading, and its smaller details (Thinking, What it does differently, Reading, Result) are `####` headings. The other pages in this folder follow the same shape: a contents list, `##` sections, `###` inside them.

Every release of a Neural Cat or Lucky Cat model does two things, in the GitHub release notes and in this page:

1. **The thinking of each iteration since the last release:** what was trained, from which model, on what data and opponents, and why it was kept or not.
2. **What the bot does differently:** the table's measures against the model before it, and a plain reading of them, from the `eval-<name>-vs-best.json` files in `ml/league/`.

For Lucky Cat, the first is what each lab round trained (the arms, on which data) and whether it beat the champion on points, and the second is its points, wins, deal-ins and average win against the model before it and Jorge Yau (`ml/lab-lucky-cat/eval/`, `lucky.js eval`). Its league rounds (LC20 and before) were recorded against its older selves and Neural Cat (`ml/lucky/`). For a rule strategy (Jorge Yau, Only Orphans), the first is what rule or tuning changed and why, and the second is measured the same way with `npm run compete`.
