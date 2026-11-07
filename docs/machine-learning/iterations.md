# Iterations

How each Neural Cat and Lucky Cat model came to be, how it plays differently from the one before it, and what each step taught. Every release of a Neural Cat or Lucky Cat model adds its iterations here and to the GitHub release notes (see [each release](#documenting-a-release)).

**How to read this.** A model has no stated reasons: it scores choices with a network. So "what it does differently" below is measured, from the evaluation each model plays against the best before it (`ml/league/eval-<name>-vs-best.json`: the same deals, the two models two seats each). The reason a change happened is the training that produced it, and where the numbers hint at why, it says so as a reading, not a fact. The coach's text for a single decision is the only place the model explains itself.

Every score here is **points a hand**: one player's average points per hand less the other's, on the same deals, with every deal played from every seat. At 2,000 deals a model-against-model score swings by about ±50 points a hand, and at 6,000 deals by about ±30. Where a 95% margin was measured, it's shown as ±.

## At a glance

| | Neural Cat | Lucky Cat |
| --- | --- | --- |
| In the game | **NC3** (lab model N2b) | **LC21** (lab model LP2b, from LC20) |
| What it is | A network that scores Jorge Yau's best choices in expected points | A network that makes every move itself, with no rules underneath |
| What it plays for | Points: often and big wins on one scale | Points first, wins second (LC20 and before: wins, as many and as fast as it can) |
| Trained on | 950,000 league hands (stopped in round 19, at a plateau), and earlier rounds against the rule bots | 1,000,000 league hands against its earlier selves and Neural Cat, then 100,000 lab hands against Neural Cat, Jorge Yau and its last two champions, every hand weighted by its points |
| Wins / deal-ins | about 9% / 5–6% against other Neural Cat models | about 18–21% against its older selves; 17.9% against Neural Cat's 9.1% |
| Average win | about 1,900 points | 4–5 faan, about a quarter of Neural Cat's |
| Head to head | Beats s5, the model before the league, by about 75–80 points a hand | LC21 beats LC20 by +4.0 to +6.9 points a hand (± 2.3–2.5); loses about 88 points a hand to Jorge Yau (LC20: 103) |

## Before the league

Neural Cat's first models learned at tables with the rule bots, discards only.

### j0: learning from the rule bots

The first model learned from the rule strategies (Jorge Yau, Lucky Cat, Only Orphans): 20,000 hands of their discards, each labelled with how the hand ended. It scored **+17.1** points a hand against Jorge Yau.

**What it taught:** a model that chooses among *every* discard is dangerous. Trained only on the bots' own choices, it couldn't tell close discards apart or judge safety, and it dealt in on **12%** of hands while winning 3.5%. So Neural Cat became a reranker: Jorge Yau's foundation lists the discards, and the model chooses among only the **best three** (`TOP_K` = 3). The hand-reading judgment stays, and the model decides the close calls. With `topK: 1` it plays exactly like Jorge Yau, which a test checks.

### s1–s6: self-play against the rule bots (discards only)

`npm run ml:loop` played Neural Cat (exploring) at tables with Jorge Yau, Lucky Cat and Only Orphans. A new model was kept only if it beat the best so far.

| Model | Trained from | Score against Jorge Yau | Kept |
| --- | --- | ---: | --- |
| s1 | j0 | +61.4 | yes |
| s2–s4 | s1 | +34.6 to +52.3 | no |
| s5 | s1 | +76.0 | yes, shipped |
| s6 | s5 | +50.2 | no |

Replayed on fresh deals, s5 scored **+48.5**, not +76. Keeping the best of several noisy scores flatters the winner.

**What it taught:**
- **Neural Cat wins less often but bigger.** s5 won about 10.5% of hands to Jorge Yau's 14%, but its average win was 731 points to 292, and it came out ahead. That shape (fewer, bigger wins) has held for every Neural Cat since.
- **Always replay the winner on fresh deals.** The first score of a "best" model is biased upward.
- **The rule bots are a ceiling.** Against fixed opponents, gains stalled after s5.

## How an iteration is made

Each [league](training.md) round does the same four things:

1. **Play.** The best model so far, exploring (`--temperature 150`, `--epsilon 0.05`: it sometimes picks a slightly worse choice or a random one), sits with earlier models at a table of Neural Cat models only, 50,000 hands, keeping about 12% of positions. Exploring is how it finds out whether a different choice would have paid.
2. **Label.** Each kept position is labelled with how its hand really ended (win by self-draw or off a discard, deal in, someone else's win, draw) and the faan won or paid.
3. **Train.** The new model starts from the best model's weights and trains on the league's data so far, the last 8 rounds from round 9 on (`--lr 3e-4`, dropout 0.2, weight decay 1e-3, up to 8 epochs, stopping after 3 without improvement). More rounds means more varied tables: the pool of opponents grows with each round (s5; then L1; then L2 and L3; and so on).
4. **Judge.** The new model plays the best head to head. It is kept, and shipped, only if it scores more points a hand. A kept model is the starting point for the next round.

## At the table: each model against the one before it

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

## L1: stop claiming everything

- **Thinking.** s5 was trained against the rule bots and learned discards only. L1 was the first model to learn claims and kongs too, from 560,988 positions of s5 exploring against s5. Starting from s5's weights, it had only one round of data and one opponent.
- **What it does differently.** It claims about half as often (0.44 chows and 0.46 pungs a hand, against 0.82 and 0.71) and wins fewer hands (9.2% against 12.2%), but each win pays 88% more (1,675 against 892). Nearly twice the share of its wins are concealed (42% against 24%) and twice the share are limit hands (8.4% against 4.3%).
- **Reading.** Claiming opens the hand, which costs faan and shows opponents what you hold. s5 claimed far more and won more hands, for small wins. Scored in expected points, L1 traded win count for win size.
- **Result.** +62.5 points a hand against s5 (± 50 at this evaluation size), the only league gain clearly beyond noise before round 6.

## L2: claim a little again, kong more

- **Thinking.** Two rounds of data (L1 against s5), started from L1.
- **What it does differently.** Claims move back up a little (0.49 chows and 0.49 pungs against 0.46 and 0.44), it declares more kongs (0.08 against 0.06), and it wins 16% more per win (1,672 against 1,437) while dealing in slightly less (5.4% against 5.6%). Its concealed share falls (37% against 43%).
- **Reading.** L1 may have over-corrected away from claiming, and L2 took some of those claims back, mostly pungs and kongs. The numbers don't show which claims they were.
- **Result.** +28.3 points a hand against L1, and +68.4 against s5.

## L3: pungs over chows, more limit hands

- **Thinking.** Three rounds, with L1 and s5 in the opponent pool.
- **What it does differently.** It claims fewer chows (0.40 against 0.49) and more pungs (0.53 against 0.49). Its limit share jumps from 5.5% to 8.8%. Average win is 13% higher (1,537 against 1,360), and its concealed share is lower (34% against 38%).
- **Reading.** A chow builds a plain hand worth few faan, a pung works toward All Triplets and dragon and wind hands. L3 favoured the second.
- **Result.** +16.4 points a hand against L2, and +95.7 against s5, its best against s5. It was the shipped model before L7.

## L4: bigger wins, riskier when it loses

- **Thinking.** Four rounds, with L1, L2 and s5 in the pool.
- **What it does differently.** Average win 22% higher (1,808 against 1,483) and limit hands 9.4% of wins. It wins more Seven Pairs, Concealed Triplets, Seat Wind and Thirteen Orphans hands (about 1 to 3 more per 1,000 hands), and fewer Self-Draw, Full Flush and All Sequences hands. When it deals in it pays more (1,129 a deal-in against 872), a sign that it keeps going for big hands when others threaten.
- **Result.** +14.8 points a hand against L3. Against s5 it measured +0.0, which at that evaluation size says it had stopped gaining on s5 even while it beat L3.

## L5: no better (not kept)

- **Thinking.** Five rounds, started from L4. Its validation loss fell (2.721 against 2.737).
- **What it does differently.** Nothing measurable: its play matched L4's (average win 1,708 against 1,712, deal-ins 5.5% against 5.4%).
- **Result.** −3.5 points a hand against L4, so the league kept L4. A lower training loss didn't mean better play. The next round started again from L4.

## L6: from Half Flush to Full Flush

- **Thinking.** Started from L4, not L5. It trained on six rounds of data, where round 6 had L4 exploring against s5, L1, L2 and L3. From here the league played 6,000-deal evaluations (about ±30 points a hand) instead of 2,000 (about ±50), because the earlier scores were too noisy to separate models. The league games from round 6 on used Jorge Yau's honor tie-break order (the `honorOrder` tuning), which ships in 0.44.
- **What it does differently.** It wins about 3 more Full Flush hands per 1,000 hands and 5 fewer Half Flush hands, plus more All Sequences and Concealed Triplets, and fewer All Triplets and Dragon Triplet. The faan per win rises from 6.49 to 6.87, with a slightly lower win rate (8.3% against 8.8%).
- **Reading.** It more often commits all the way to one suit instead of stopping at a Half Flush that includes honors, taking a slower, bigger hand.
- **Result.** +7.9 ± 30 points a hand against L4: kept, but not a clear gain on its own.

## L7: the limit-hand model

- **Thinking.** Seven rounds, started from L6, trained on 3,994,461 positions, with s5, L2, L3 and L4 in the pool. Its held-out accuracy and outcome loss are the best so far (73.3%, 0.896).
- **What it does differently.** It claims fewer chows still (0.38 against 0.41), and 10.3% of its wins are limit hands against 8.7% (400 against 340 over 6,000 deals). Its average win is 23% higher (2,069 against 1,682) though it wins no more often (8.1% against 8.2%). It deals in less (5.1% against 5.4%). It wins more Concealed Triplets, Thirteen Orphans and Seven Pairs hands, and fewer Half Flush, Concealed, Self-Draw and Chicken Hand wins.
- **Reading.** Each model since L1 has moved toward fewer, bigger wins. L7 takes it furthest: it claims fewer chows and keeps hands for limit hands, while dealing in a little less. The numbers show the result, not which individual choices changed.
- **Result.** +41.1 ± 33 points a hand against L6, just beyond its margin. It shipped until NC1 (L17).

## L8: fewer pungs, more concealed

- **Thinking.** Started from L7, on rounds 1–8 (4,571,784 positions), with s5, L3, L4 and L6 in the pool.
- **What it does differently.** It claims fewer pungs (0.42 against 0.47) and wins more hands with no melds claimed (43% against 40%). Its average win is the same as L7's (1,889 against 1,890). When it deals in, it pays more (1,165 a deal-in against 1,072).
- **Result.** +2.1 ± 32 points a hand against L7: kept, but no measurable gain.

## L9 and L10: not kept

- **Thinking.** Both started from L8, with s5, L4, L6 and L7 in the pool. From round 9 the league trains on its last 8 rounds, so the training set stops growing (about 4.6 million positions).
- **What they do differently.** L9 won smaller hands (1,615 against 1,719). L10 claimed a few more chows (0.39 against 0.36) and also won smaller (1,739 against 1,835).
- **Result.** −3.1 ± 29 and −9.5 ± 32 points a hand against L8. Round 10 also measured L10 against s5: **+81.6 ± 32**, the clearest sign yet that the league as a whole had moved well past s5.

## L11: the fewest chows

- **Thinking.** Started from L8, on rounds 4–11.
- **What it does differently.** It claims the fewest chows of any model so far (0.31 against 0.36), wins more hands concealed (46% against 43%), and more of its wins are limit hands (10.5% against 10.0%). Average win 1,937 against 1,829.
- **Result.** +1.4 ± 31 points a hand against L8: kept, within the noise.

## L12 and L13: not kept

- **Thinking.** Both started from L11, with s5, L6, L7 and L8 in the pool.
- **What they do differently.** L12 claimed more (0.40 chows and 0.46 pungs against 0.33 and 0.41) and won more often (9.1% against 8.4%), but smaller (1,988 against 2,188). L13 claimed more pungs, won smaller (1,748 against 1,979) and dealt in more (5.9% against 5.6%).
- **Result.** −5.3 ± 35 and **−34.1 ± 31**. L13 is the one model the league clearly rejected: claiming more cost it more than it won.

## L14: wins more often, same size

- **Thinking.** Started from L11, on rounds 7–14.
- **What it does differently.** It wins more often (8.9% against 8.4%) with the same size of win (1,888 against 1,852), more of them concealed (46% against 41%) and more of them limit hands (9.1% against 8.4%).
- **Result.** +17.6 ± 33 points a hand against L11.

## L15: not kept

- **Thinking.** Started from L14, with s5, L7, L8 and L11 in the pool.
- **What it does differently.** More chows (0.42 against 0.30), more wins (9.3% against 8.6%), smaller wins (1,741 against 1,868).
- **Result.** −0.0 ± 32 against L14. Against s5: **+75.5 ± 33**, the league still far ahead of where it started.

## L16: the biggest wins

- **Thinking.** Started from L14, on rounds 9–16.
- **What it does differently.** Its wins pay the most of any model against its predecessor: 1,952 points against 1,630, 7.32 faan against 6.81, and 9.3% limit hands against 7.9%. It also pays less when it deals in (949 a deal-in against 1,193). It claims more chows than L14 (0.39 against 0.30), so not every chow it takes is a cheap one.
- **Result.** **+43.9 ± 31** points a hand against L14, one of the three clear gains of the league (with L1 and L7).

## L17 (NC1): wins more often

- **Thinking.** Started from L16, on rounds 10–17, with s5, L8, L11 and L14 in the pool.
- **What it does differently.** Fewer chows (0.35 against 0.40), and it wins more often (8.9% against 8.3%) with about the same size of win (1,907 against 1,917). Its wins are a little cheaper in faan (6.92 against 7.19), and it pays more when it deals in (1,152 against 994).
- **Reading.** L16 found bigger hands; L17 keeps most of that while finishing more hands.
- **Result.** +6.9 ± 33 points a hand against L16: kept, within the noise. It ships as **NC1**, the first release under the NC names.

## L18: not kept

- **Thinking.** Started from L17, with s5, L11, L14 and L16 in the pool.
- **What it does differently.** It won more often (9.2% against 8.8%) but smaller (1,768 against 1,940).
- **Result.** −5.7 ± 32 against L17.

## L19 (NC2): bigger wins again

- **Thinking.** Started from L17, on rounds 12–19 (4,647,945 positions), with s5, L11, L14 and L16 in the pool. Its held-out accuracy is the best yet (77.2%).
- **What it does differently.** Against NC1 on 20,000 deals, its average win is 14% bigger (2,091 points against 1,835) while it wins slightly less often (8.5% against 9.2%) and deals in slightly more (6.0% against 5.7%).
- **Result.** The league was stopped while L19 played its 6,000-deal evaluation, so the league never judged it. The 20,000-deal benchmark that followed did: **+20.5 ± 18.2** points a hand over NC1, J +17.0 against a standard error of about 9, a clear gain by the lab's rule. It ships as **NC2**, and the lab starts from it.
- **Reading.** Stopping the league cost exactly the model it would have kept. A model's first evaluation is a coin flip at ±30; only a long one tells.

## The league overall

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

**What it taught:**
- **The league beats the starting point by a clear margin.** L10 beat s5 by +81.6 ± 32 and L15 by +75.5 ± 33, and neither was even kept: the whole league is well past s5. That's beyond the noise, and the biggest gain of any phase.
- **Each round's step is small.** Most new models land within ±30 of the best. Only three steps were clearly beyond the noise: L1 over s5 (+62.5), L7 (+41.1) and L16 (+43.9). The rest of the progress comes from many small, noisy steps.
- **Reading the hand keeps improving, even when points don't.** Held-out accuracy rose with almost every model, from 68.6% to 77.1%, including models that weren't kept. Data and training kept getting better; winning more points per hand is the harder part.
- **The gains are in the size of wins.** Win rate stayed at 8–9% and deal-ins at 5–6% throughout. The average win went from about 1,670 points (L1–L2) to about 1,900–2,070 (L7 onward). The league learned to steer toward bigger hands, the trade-off expected points exist to make. L7, for example, won about as often as L6 but each win paid 23% more, and it won 18% more limit hands.
- **2,000-deal evaluations were too noisy.** Rounds 1–5 used them (±50), so L4 and L5's scores against s5 (+0.0, +0.3) said nothing. From round 6 the league plays 6,000 deals (±30) and records the margin, and measures against s5 every 5 rounds to save time.
- **Training data levels off.** With an 8-round window the training set stays at about 4.6 million positions from L8 on. More rounds now bring fresher data, not more of it.
- **It reached a plateau.** After L7, new models were kept about half the time, mostly within the noise. See the next section.

## The plateau: where Neural Cat stands

The league was stopped during round 19 because Neural Cat looked like it had stopped improving: since about L7, each round's step was too small to see. The long benchmark that followed showed it hadn't fully stopped: NC1 beats L7 by +21.3 ± 18.0, and L19 beats NC1 by +20.5 ± 18.2 and ships as NC2. Slow, real gains were hidden by noisy evaluations.

### The evidence

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

### Why it stalled

1. **The model can't stray far from Jorge Yau.** It only chooses among Jorge Yau's top 3 discards (`TOP_K` = 3). Once it picks the best of those three well, there's little room left. This is probably the main limit.
2. **It plays near-copies of itself.** The pool is L models that all play alike, so new rounds teach little that's new.
3. **The training data stopped growing.** With an 8-round window it has been about 4.6 million positions since L8, with the same network size (256 and 128 hidden units) and the same features.
4. **Evaluations can't see small gains.** At 6,000 deals the margin is about ±30 points a hand, so a real gain of +10 is invisible.

### What to do next, in order

1. **Measure honestly first.** Play NC1 against s5, L7 and L11 over about 20,000 deals each (about ±15 points a hand). That shows whether anything real was gained since L7. L19, never judged, can be measured the same way.
2. **Make keeping a model stricter.** Keep a new model only if it beats the best by more than its margin, or re-test close calls on more deals. That stops the noise-driven random walk.
3. **Raise the ceiling.** Let the model choose among Jorge Yau's top 5 discards instead of 3, try a bigger network (512 and 256), and add features for what it can't yet see.
4. **Vary the opponents.** Put LC20, Jorge Yau and Lucky Cat Classic in the pool, so it learns against different styles, not only copies of itself.

More rounds of the same league were unlikely to help, so the league was replaced by the lab, which does all four (next section). The league's data for rounds 10–19 seeds the lab's first rounds.

## The lab: remaking Neural Cat

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

- **Thinking.** Round 1's fine-tunes moved too far, or not usefully. The bandit tried the other end: fine-tune at a third of the learning rate, plus a deeper network (512-256-128) from scratch, recent-data-only, `topK` 3 → 2 and `claimMargin` 0 → 25.
- **Result.** The slow fine-tune, N2b, beat NC2 by **+8.1 ± 18.3** points a hand on 20,000 fresh deals, winning 9.0% against 8.4% with deal-ins down from 6.0% to 5.7%: **J +11.4**, beyond its standard error. It ships as **NC3**. The deeper network was even (+1.2 ± 17.5); `topK` 2 lost badly on 6,000 deals (−40.9: more, smaller wins); recent-data-only and the claim margin lost too.
- **What the bot does differently.** It wins a little more often and deals in a little less, with wins about the same size (1,896 against 1,963 points): the same style as NC2, slightly sharper. The gain is in J, mostly from the extra wins; the points alone are within their margin.

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

**What it taught:**
- **Jorge Yau's own claim rule was its biggest weakness.** It took any claim that moved the hand closer, so it chowed about six times as often as the shared rules (0.57 chows a hand against 0.09). Its hands opened early and paid little: an average win of 298 points against 482 with shared claims, and more deal-ins (9.5% against 8.6%). One change was worth more than everything the tuning screen tried.
- **Many pairs are good, but breaking a single to keep one isn't.** Keeping pairs won as often but with smaller hands (about 340 points a win against 430). The coach no longer calls many pairs a problem; the bot logic stays as it was.
- **Most knobs were already near their best.** Nothing in the tuning screen moved the score beyond its noise.

## Fair play

A test plays every strategy, then shuffles everything a seat can't see (the wall, other hands, the tile of a concealed kong) and traps the hidden records. Every feature and every move must come out the same. It caught a real leak: the foundation read the tile of other players' concealed kongs, and so did the coach. Both were fixed (`shownMelds`) before the league trained on anything.

## Lucky Cat

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

**What it taught:**
- **Learning from wins alone works, from scratch.** A random player wins about 0.4% of hands. After a million hands Lucky Cat wins about 20% against its older selves, and 18 of 20 new models beat the best before them.
- **It gets what it's rewarded for.** It was rewarded for winning quickly, so it wins often (nearly twice as often as Neural Cat by the end) and fast (16.9 discards per win, down from 18). It wasn't rewarded much for size, so its wins stay at 4–5 faan against Neural Cat's 8, and it still loses about 100–160 points a hand to Neural Cat.
- **Points stay close between its own versions.** LC20 beats its older selves by +0.2 to +27.1 points a hand, because every version wins cheap hands. Its progress shows in wins, not points.
- **It needs no rules to play well.** Lucky Cat has no steps-from-ready count, plans or threat reads. It learned all of that from its wins, and the fair-play test checks it too.

### LC21: points first, wins second

**The thinking.** LC20 got what it was rewarded for: wins, fast. Its hands were cheap (4 to 5 faan) and its losses taught it nothing, so it never learned what a deal-in costs, and it lost about 103 points a hand to Jorge Yau on 20,000 deals. The goal now is points first and wins second, learned on its own, so the reward had to be the points:

- **Learn from every hand, by its points.** `lucky.js generate --returns` keeps the champion's real choices in every hand its seats play, won or lost, with the points the hand paid that seat. That is reinforcement learning: a move's advantage is the hand's points (clipped at ±4,000) less what positions like it usually score.
- **A critic for the baseline.** A value network (in `ml/train_lucky.py`, not shipped) predicts what a position scores, fitted on half the hands and scoring the other half. It explains well under 1% of the points: from one position, a hand's points are mostly luck. So the advantage is close to the hand's points less the average, and each step needs tens of thousands of hands.
- **Two kinds of step.** A clipped policy gradient (PPO) moves each move's share by its advantage, at most 20% per move from the share it was played with. Advantage-weighted imitation (AWR) imitates every move, weighted by exp(advantage): moves from hands that did well teach the most, from hands that went badly almost nothing.
- **A points-first judge.** J = points a hand + 0.5 × hands won (percentage points): a point of win rate is worth half a point a hand, a tie-breaker. A candidate is kept only if its points a hand beat the champion's by more than their paired standard error on 20,000 fresh deals. (Neural Cat's J counts a point of win rate as 5 points; that would let Lucky Cat's habit of cheap wins pass for progress.)
- **Let it explore.** Eight arms (`pg`, `pg-2`, `pg-all`, `pg-fast`, `pg-sqrt`, `pg-clip`, `pg-wins`, `awr`), chosen by the bandit; the champion explores at temperature 0.5, close to how it plays, and shares are read at that temperature in training.

| Round | Experiments (6,000 deals, points a hand against the champion) | Best on 20,000 fresh deals | Kept |
| --- | --- | ---: | --- |
| 1 | pg-2 +8.4, pg-fast −0.6, pg-sqrt −7.9 | pg-2 +2.3 ± 2.5 | no |
| 2 | awr +8.0, pg-clip +2.4, pg-all −4.2, pg −3.5 | **awr +6.9 ± 2.5**, pg-clip +5.4 ± 2.3 | **LP2b, shipped as LC21** |
| 3 | awr +3.9, pg-clip +0.2, pg-2 −3.2, pg-wins −4.6 | awr −4.2 ± 2.4 | no |
| 4 | pg-wins −0.2, pg −0.5, pg-fast −4.1, pg-all −9.0 | none ahead | no |

Round 1's policy-gradient steps on one round of data were within the noise. In round 2, with two rounds (50,000 deals) of LC20's play, both AWR and the clipped policy gradient cleared the bar, and AWR by more. Rounds 3 and 4 trained from LC21 on its own data and LC20's, and nothing beat it: two rounds without a gain, so the lab stopped there (100,000 deals in all). By the bandit's record, `awr` and `pg-clip` are the arms that have paid; `pg-all` (four rounds, mostly an older champion's play) and `pg-sqrt` the ones that haven't.

**What it does differently.** Replayed against LC20 on 20,000 deals neither had played in the lab, LC21 scores **+4.0 ± 2.3** points a hand (the lab's own 20,000 said +6.9 ± 2.5; keeping the best of several flatters it):

| LC21 against | Points a hand | Hands won | Deal-ins | Average win | Faan a win |
| --- | ---: | ---: | ---: | ---: | ---: |
| LC20, fresh deals | +4.0 ± 2.3 | 20.0% vs 19.4% | 14.0% vs 14.2% | 162 vs 151 | 4.86 vs 4.80 |
| LC20, the lab's deals | +6.9 ± 2.5 | 19.7% vs 19.5% | 13.9% vs 14.1% | 170 vs 147 | 4.87 vs 4.80 |
| Jorge Yau (LC20 on the same deals: −102.7 ± 5.2) | −87.7 ± 4.9 | 15.2% vs 22.3% | 14.9% vs 10.1% | 166 vs 396 | 4.78 vs 5.08 |

- **More points, not fewer wins.** It wins as often as LC20, and its wins are worth about 8–15% more. Against Jorge Yau it gains about 15 points a hand on the same deals, all from bigger wins (166 points a win to 153); it deals in just as often there.
- **A small step.** It is still a fast player of 4 to 5 faan hands. Most of what separates it from Jorge Yau (wins worth more than twice as much, and a third fewer deal-ins) is still to learn.
- **What it taught:** with a noisy reward, data counts more than the size of the step. The bigger policy-gradient step (`pg-fast`) and the square root of the points (`pg-sqrt`) did no better, and the gains came once there were 50,000 deals of the champion's own play to learn from.

## What the two show together

- **What a model optimizes is what you get.** Neural Cat scores choices in expected points and learned bigger hands. Lucky Cat scores wins and learned faster, smaller ones. Neither is "better" in general: Neural Cat scores more points, and Lucky Cat wins more hands.
- **Building on rules gets far faster than starting from scratch.** Neural Cat was ahead of the rule bots from its first model, because it chooses among Jorge Yau's best options. Lucky Cat needed a million hands to learn what the rules already knew, but it isn't limited by them.
- **Play against strong opponents.** Neural Cat stalled against the fixed rule bots and moved again once it played other models in the league. Lucky Cat kept improving because each new version had to beat its own best.
- **Noise is the main obstacle to telling models apart.** Most head-to-head results between neighbours are within ±30. Use 6,000 or more deals, record the margin, and replay any "best" on fresh deals.

## Where the files are

- Every model's weights are kept, in `ml/models/` and on [Hugging Face](https://huggingface.co/codenameyau/lucky-cat-mahjong), so any of them can play in `npm run compete` (`ml:ml/models/L8.json`).
- League logs and every evaluation: `ml/league/` (Neural Cat) and `ml/lucky/` (Lucky Cat). The rule-bot screens: `ml/tune/` and `ml/pairs/`.
- Training data is kept only while a model uses it ([what is kept](hugging-face.md#what-is-kept)).
- The full playbooks: [Neural Cat](../strategies/neural-cat.md), [Lucky Cat](../strategies/lucky-cat.md), [Jorge Yau](../strategies/jorge-yau.md).

## Documenting a release

Every release of a Neural Cat or Lucky Cat model does two things, in the GitHub release notes and in this page:

1. **The thinking of each iteration since the last release:** what was trained, from which model, on what data and opponents, and why it was kept or not.
2. **What the bot does differently:** the table's measures against the model before it, and a plain reading of them, from the `eval-<name>-vs-best.json` files in `ml/league/`.

For Lucky Cat, the first is what each lab round trained (the arms, on which data) and whether it beat the champion on points, and the second is its points, wins, deal-ins and average win against the model before it and Jorge Yau (`ml/lab-lucky-cat/eval/`, `lucky.js eval`). Its league rounds (LC20 and before) were recorded against its older selves and Neural Cat (`ml/lucky/`). For a rule strategy (Jorge Yau, Only Orphans), the first is what rule or tuning changed and why, and the second is measured the same way with `npm run compete`.
