# Frontier Cat

`frontier-cat` is the frontier model ([frontier plan](../machine-learning/frontier-plan.md)) as a strategy you can play with or against. It chooses the way [Neural Cat](neural-cat.md) does, with a **stacked model**: a reading network looks at the table first, and the network that scores each option reads what it saw. Choose it on the Strategies sheet for a seat or the coach, like any other strategy. Its weights are `js/mahjong-frontier-weights.js`, and the sheet shows the model's name (FC1, FC2, …).

How it compares with Neural Cat as it plays today, and why it was built this way, is in the [frontier report](../machine-learning/frontier-report.md).

## How it chooses

1. **The options.** It plays Jorge Yau's hooks on the shared foundation (`js/mahjong-bot.js`), which list every discard in Jorge Yau's order and read each one (steps from ready, live tiles, the best plan and its faan, the deal-in risk). Its best few discards are the options, as for Neural Cat.
2. **The features.** `js/mahjong-ml-features.js` describes the position each option leaves as 568 numbers ([Neural Cat](neural-cat.md#how-it-chooses) lists the groups). Only what the seat can see.
3. **The read.** The reading network (`reader` in the weights) reads those 568 numbers and gives 16:

   | Read | What it says |
   | --- | --- |
   | 3 | The chance that each other player is ready, from your right |
   | 1 | The chance that the tile thrown wins someone the hand right now |
   | 12 | If this seat wins, the chance of each hand it wins with: a standard hand, All Sequences, Half Flush, Full Flush, All Triplets, Concealed Triplets, Seven Pairs, Thirteen Orphans, Nine Gates, a hand of 1s, 9s and honors, Three Dragons, Four Winds |

4. **The score.** The move network reads the 568 numbers and the 16 together (584 inputs), and predicts how the hand ends and the faan won or paid, as Neural Cat's does. Those make one score, expected points, with a bonus for the chance to win. The option worth the most goes.
5. **The check.** The [contradiction check](README.md#the-contradiction-check) runs on its pick, as on every strategy's.

Claims and kongs are weighed the same way: passing, each call and the best discard after it, and each kong, each with its read.

## What the reader learned

The reader is the heads model from the frontier's first round. It learned from simulated hands where every tile was known once the hand was over, so each read had a right answer to learn from: whether each opponent really was ready, whether the tile really would have won someone the hand, and which hand the seat really won with. On positions it never saw:

The reader is FM1b0, one of the frontier's first-round heads models.

- It names the hand a seat goes on to win with **74% of the time**. The rules' own read of the same tiles names it 64% of the time.
- Its chances are calibrated hand by hand. For example, it gave Half Flush 1.43% and it happened 1.37% of the time; for Seven Pairs, 1.29% and 1.32%.
- It tells a ready opponent from one that isn't with an AUC of 0.83, and a tile that deals in now with an AUC of 0.83 (1.0 is perfect, 0.5 is a coin flip).

## What the coach says

At **Complex**, the coach says the score it expects from its pick and from the next best, its chance to win and how much a win pays, as for Neural Cat. It then adds the read:

> It reads the player across as ready (41% likely). It gives this tile a 3% chance to win someone the hand right now. If you win, it expects Half Flush (55% likely).

Each part is said only when it is worth saying: a player read as ready at 30% or more, a tile at 1% or more, a hand at 40% or more. At **Simple** and **Detailed** it speaks like Neural Cat, without the model's numbers.

## Fair play

It sees only what its seat can see, the same as you. The hidden tiles taught the reader what to look for, and were never something it reads in play. `js/mahjong-fair-play.test.js` plays it with the wall and the other hands shuffled, and nothing it does changes.

## Cost

The reader roughly triples the work of each option it scores: about 0.36 ms in the browser's JS against Neural Cat's 0.13 ms. A turn costs about 2 ms. The weights file is about twice Neural Cat's (the reader's layers and the move network's).

## Training

It is trained by the frontier's round driver, `npm run ml:frontier` (`scripts/ml/frontier-model.js`): the games are played on the native simulator, which writes the JS's training rows byte for byte, and the network is fit by `ml/train.py --reader`. Every round, what was tried and what it found, is in the [frontier plan's Learnings](../machine-learning/frontier-plan.md#learnings).
