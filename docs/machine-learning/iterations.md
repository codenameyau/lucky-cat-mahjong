# Iterations

How each Neural Cat model came to be, and how it plays differently from the one before it. Every release of a Neural Cat or Lucky Cat model adds its iterations here and to the GitHub release notes (see [each release](#documenting-a-release)).

**How to read this.** A model has no stated reasons: it scores choices with a network. So "what it does differently" below is measured, from the evaluation each model plays against the best before it (`ml/league/eval-<name>-vs-best.json`: the same deals, the two models two seats each). The reason a change happened is the training that produced it, and where the numbers hint at why, it says so as a reading, not a fact. The coach's text for a single decision is the only place the model explains itself.

## How an iteration is made

Each [league](training.md) round does the same four things:

1. **Play.** The best model so far, exploring (`--temperature 150`, `--epsilon 0.05`: it sometimes picks a slightly worse choice or a random one), sits with earlier models at a table of Neural Cat models only, 50,000 hands, keeping about 12% of positions. Exploring is how it finds out whether a different choice would have paid.
2. **Label.** Each kept position is labelled with how its hand really ended (win by self-draw or off a discard, deal in, someone else's win, draw) and the faan won or paid.
3. **Train.** The new model starts from the best model's weights and trains on every round's data so far (`--lr 3e-4`, dropout 0.2, weight decay 1e-3, up to 8 epochs, stopping after 3 without improvement). More rounds means more varied tables: the pool of opponents grows with each round (s5; then L1; then L2 and L3; and so on).
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

- **Thinking.** Started from L4, not L5. It trained on six rounds of data, where round 6 had L4 exploring against s5, L1, L2 and L3. From here the league played 6,000-deal evaluations (about ±30 points a hand) instead of 2,000 (about ±50), because the earlier scores were too noisy to separate models. The league games from round 6 on used Jorge Yau's honor tie-break order (the `honorOrder` tuning), which is in the working tree but not yet on master.
- **What it does differently.** It wins about 3 more Full Flush hands per 1,000 hands and 5 fewer Half Flush hands, plus more All Sequences and Concealed Triplets, and fewer All Triplets and Dragon Triplet. The faan per win rises from 6.49 to 6.87, with a slightly lower win rate (8.3% against 8.8%).
- **Reading.** It more often commits all the way to one suit instead of stopping at a Half Flush that includes honors, taking a slower, bigger hand.
- **Result.** +7.9 ± 30 points a hand against L4: kept, but not a clear gain on its own.

## L7: the limit-hand model

- **Thinking.** Seven rounds, started from L6, trained on 3,994,461 positions, with s5, L2, L3 and L4 in the pool. Its held-out accuracy and outcome loss are the best so far (73.3%, 0.896).
- **What it does differently.** It claims fewer chows still (0.38 against 0.41), and 10.3% of its wins are limit hands against 8.7% (400 against 340 over 6,000 deals). Its average win is 23% higher (2,069 against 1,682) though it wins no more often (8.1% against 8.2%). It deals in less (5.1% against 5.4%). It wins more Concealed Triplets, Thirteen Orphans and Seven Pairs hands, and fewer Half Flush, Concealed, Self-Draw and Chicken Hand wins.
- **Reading.** Each model since L1 has moved toward fewer, bigger wins. L7 takes it furthest: it claims fewer chows and keeps hands for limit hands, while dealing in a little less. The numbers show the result, not which individual choices changed.
- **Result.** +41.1 ± 33 points a hand against L6, just beyond its margin. It is the shipped model.

## Documenting a release

Every release of a Neural Cat or Lucky Cat model does two things, in the GitHub release notes and in this page:

1. **The thinking of each iteration since the last release:** what was trained, from which model, on what data and opponents, and why it was kept or not.
2. **What the bot does differently:** the table's measures against the model before it, and a plain reading of them, from the `eval-<name>-vs-best.json` files in `ml/league/`.

For Lucky Cat, whose strategy is rules, not a trained model, the first is what rule or tuning changed and why, and the second is measured the same way with `npm run compete`.
