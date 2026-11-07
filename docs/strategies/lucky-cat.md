# lucky-cat: a network that taught itself to win

**Lucky Cat** (`js/mahjong-lucky-cat-ml.js`, network in `js/mahjong-lucky-cat-net.js`, weights in `js/mahjong-lucky-cat-weights.js`) is a neural network that makes every move itself. It is not built on the shared foundation (`js/mahjong-bot.js`) the other strategies use: it has no steps-from-ready count, no plans, no threat reads and no claim rules. What it knows, it learned from playing.

## How it thinks

It doesn't plan a hand. Each turn it looks at what its seat can see and the network gives every legal move a share (a discard of each kind of tile, each kong, or on a claim: pass, each chow, pung or kong). The biggest share is played. What looks like a plan is a habit it found, because it learned only from the hands it won, the quicker the win the more.

So it values speed over size: it wins often and in few discards, mostly with small hands of 4 to 5 faan, and it deals in more often than [Neural Cat](neural-cat.md), which wins about half as many hands but with bigger ones. The coach says how often the network plays its move and the next most likely one.

Its goal is to win as many hands as it can, as fast as it can. Points count for only a little. It takes the risks that have won it hands before, so its wins can look lucky when they are learned.

The rules it replaced are still in the game as **Lucky Cat Classic** (`js/mahjong-lucky-cat.js`, a lab strategy: not on the Strategies sheet, but `npm run compete` and `npm run review` can play it as `lucky-cat-classic`). They are written out from [The classic rules](#the-classic-rules) on. The coach still uses their reads of the hand (plans, waits, threats) for its words.

## What it sees

Only what its seat can see (`encode` in `js/mahjong-lucky-cat-net.js`):

- its own concealed tiles and melds
- every discard still in a pond
- the melds the other players have shown (another player's concealed kong only as a count, never its tile)
- each player's flowers, number of discards, and discards and melds by suit
- the seat and round winds, whether it is the dealer, and the tiles left in the wall
- for a claim, the tile on offer and who threw it

It never reads the wall's tiles, another player's hand, the seed or the move log. `js/mahjong-fair-play.test.js` shuffles everything the seat can't see and traps the hidden records. Its features and every move it makes must come out the same.

## How it moves

One network (376 inputs, two hidden layers of 256 and 128, 74 outputs) gives each legal move a share:

- **Its own turn:** a discard of each kind of tile it holds, and each kong it can make.
- **A claim:** pass, each chow offered (the tile lowest, middle or highest), pung or kong.

Illegal moves are masked out, and the move with the biggest share is played. A win of 3 faan or more is always declared.

## How it learned

1. **It started at random.** The first model (`lc0`) has every weight at zero, so every legal move gets the same share. Playing itself at random, about 0.4% of seats win a hand.
2. **It learns only from wins.** Each round it plays 50,000 hands (`npm run ml:lucky`, `scripts/ml/lucky.js`), taking each move with its share so it keeps exploring. For each hand it wins, every move it made in that hand (discards, chows, pungs, kongs and passes) is kept. Training (`ml/train_lucky.py`) then makes those moves more likely. A quicker win teaches more: the weight is about 2.4 × e^(−discards/10), between 0.25 and 2.5, times 1 + 0.08 for each faan above 3. Hands it lost or drew teach it nothing.
3. **It plays itself, and must beat itself.** Its opponents are the best model and the five before it. Each new model plays the best at the same table, over 2,000 deals in both seat orders. It becomes the best only if it wins more hands, and then it joins the pool the next models play against. The best is shipped to the page as soon as it wins.

4. **Then it plays Neural Cat.** Once the best model wins 10% of its seats against the model before it, Neural Cat (the latest shipped model) takes a third of the opponent seats in every round after. Each round's new model then also plays Neural Cat over 1,000 deals in both seat orders, for the record. Being kept still means beating its own best.

The league runs 20 rounds of 50,000 hands, a million hands in all. Its log and state are in `ml/lucky/` (not committed).

5. **Since lc21, the lab.** After the league, Lucky Cat trains in the lab (`npm run ml:lab -- --strategy lucky-cat`, [how it works](../machine-learning/training.md#the-lab-for-only-orphans-and-lucky-cat---strategy)), like Neural Cat and Only Orphans. Each round plays 50,000 hands against its last three champions, Neural Cat and Jorge Yau, then tries several fine-tunes: at three learning rates, on 2, 6 or 10 rounds of data, and with sharper targets. Since lc29 the data also holds each move that dealt in, and two arms train it down, so Lucky Cat learns from the hands it lost that way, not only from its wins; a third arm tries a wider network. A candidate first plays the champion over 6,000 deals. The best two then play 20,000 new deals, and one replaces the champion only if it wins more hands by more than its standard error. The lab's models are named LL&lt;round&gt;&lt;letter&gt;, and each champion ships under the next lc number.

## Results

### The lab

| Release | Lab model | Against | Hands won | Discards per win | Deal-ins | Faan a win |
|---|---|---|---|---|---|---|
| lc21 | LL1a (fine-tune of lc20 on round 1) | lc20, 20,000 deals | **20.5%** vs 19.0% (± 0.4) | 16.7 vs 16.7 | 14.0% vs 14.3% | 4.85 vs 4.82 |
| lc22 | LL2b (fine-tune of lc21 on rounds 1–2 only) | lc21, 20,000 deals | **21.2%** vs 19.5% (± 0.4) | 16.6 vs 16.5 | 14.5% vs 15.0% | 4.91 vs 4.84 |
| lc23 | LL3a (fine-tune of lc22 on rounds 2–3 only) | lc22, 20,000 deals | **21.8%** vs 20.0% (± 0.4) | 16.4 vs 16.4 | | |
| lc24 | LL5b (fine-tune of lc23 with sharper targets, smoothing 0.01) | lc23, 20,000 deals | **21.9%** vs 20.7% (± 0.4) | 16.4 vs 16.2 | | |
| lc25 | LL7b (sharper targets again, from LL6c, a fine-tune of lc24) | lc24, 20,000 deals | **22.7%** vs 20.8% (± 0.4) | 16.2 vs 16.1 | 16.1% vs 16.5% | 4.98 vs 4.94 |
| lc26 | LL9b (sharper targets a third time, from LL8a, a fine-tune of lc25 on 10 rounds) | lc25, 20,000 deals | **22.9%** vs 21.6% (± 0.4) | 16.0 vs 15.9 | 16.5% vs 16.9% | 5.03 vs 4.96 |
| lc27 | LL11a (the last 2 rounds only, from LL10b, a fine-tune of lc26) | lc26, 20,000 deals | **23.5%** vs 21.4% (± 0.4) | 15.9 vs 15.8 | 16.7% vs 17.4% | 5.02 vs 5.01 |
| lc28 | LL13a (fine-tune of lc27 on the last 2 rounds only) | lc27, 20,000 deals | **23.2%** vs 22.2% (± 0.4) | 15.8 vs 15.8 | 17.2% vs 17.4% | 5.03 vs 5.02 |
| lc29 | LL17c (a third of the learning rate, from LL15a, a fine-tune of lc28) | lc28, 20,000 deals | **23.3%** vs 22.6% (± 0.4) | 15.7 vs 15.7 | 17.4% vs 17.8% | 5.05 vs 5.02 |
| lc30 | LL19b (a wider network, 512-256, trained from scratch on the last 10 rounds) | lc29, 20,000 deals | **23.2%** vs 22.8% (± 0.4) | 15.6 vs 15.7 | 17.7% vs 17.7% | 5.01 vs 5.03 |
| lc31 | LL22b (fine-tunes of lc30 that push down the moves that dealt in, two rounds) | lc30, 20,000 deals | **23.6%** vs 22.6% (± 0.4) | 15.7 vs 15.6 | **17.5%** vs 18.0% | 5.02 vs 5.02 |
| **lc32** | LL26b (more fine-tunes that push down the moves that dealt in, from lc31) | lc31, 20,000 deals | **23.5%** vs 22.7% (± 0.4) | 15.6 vs 15.5 | **17.6%** vs 17.9% | 5.02 vs 5.00 |

Round 4 kept nothing: its three fine-tunes all lost to lc23 on 6,000 deals. Round 5 kept `sharp`. Round 6 kept LL6c (`finetune-fast`) by only +0.5 ± 0.4, too close to ship, and round 7 trained on from it and kept `sharp` again. Round 8 kept LL8a (`long`), +0.3 against lc25 on a second 20,000 deals, too close to ship. Round 9 trained on from it and kept `sharp` a third time. Round 10 kept LL10b (`finetune`) by +0.4 ± 0.4, and round 11 trained on from it and kept `recent`. Round 12 kept nothing. Round 13 kept `recent` again, +0.6 on the lab's 20,000 deals and +0.9 on a separate 20,000, and round 14 kept nothing, so it shipped. Round 15 kept LL15a, level with lc28 on a separate 20,000 deals. Round 16 kept nothing. Round 17 kept `finetune-slow` (+0.7 against lc28 on a separate 20,000 deals), and round 18 kept nothing, so it shipped. Then the lab was rebuilt (see [the critique](../machine-learning/iterations.md#critique-where-the-lucky-cat-lab-stalled-and-whats-next)): round 19 kept a wider network trained from scratch (+0.5 against lc29 on a separate 20,000 deals), and round 20 kept nothing, so it shipped. Rounds 21 and 22 fine-tuned it with deal-ins pushed down (`deal-ins-strong`, then `deal-ins`), and the two steps together shipped. Rounds 23 and 24 gave nothing to ship. Rounds 25 and 26 fine-tuned with deal-ins again (`deal-ins`, then `deal-ins-strong`), and the two together shipped.

lc32 against lc20, the league's last model, over 10,000 deals: **28.7%** of hands won to 15.3%, +14.9 points a hand, in 16.3 discards a win, and deals in on 14.3% of hands to lc20's 18.4% (lc31: 28.0% to 15.9%). The steps add up.

Each against Neural Cat NC2, over the same 5,000 deals in both seat orders (lc32, lc31 and lc30 also over another 15,000: lc32 28.7% and −71.8, lc31 28.1% and −75.3, lc30 27.7% and −79.7):

| | Hands won | Neural Cat wins | Points per hand |
|---|---|---|---|
| lc30 | 27.4% | 8.4% | −97.1 |
| **lc29** | **27.5%** | 8.0% | **−64.7** |
| lc28 | 27.1% | 8.2% | −73.8 |
| lc27 | 25.9% | 8.8% | −86.5 |
| lc26 | 25.3% | 8.5% | −83.2 |
| lc25 | 24.4% | 8.9% | −89.3 |
| lc24 | 22.8% | 9.3% | −98.0 |
| lc23 | 22.2% | 9.4% | −116.0 |
| lc22 | 20.7% | 9.5% | −122.3 |
| lc21 | 19.1% | 9.8% | −137.1 |
| lc20 | 18.3% | 9.8% | −137.7 |

Each lab champion wins about 1.5 to 2 more hands in 100 than the one before it at its own table, at the same speed and size. Against Neural Cat, lc29 and lc30 win about 9 more hands in 100 than lc20. Points a hand against Neural Cat are noisy, about ± 30 on 5,000 deals, because its wins are big: on another 10,000 deals lc30 lost 85 a hand and lc29 94, the other way round, so over the 15,000 the two are level (lc30 −89, lc29 −84). The steady trend from lc20's −138 is real; a single step's change in points is not. It still loses points to Neural Cat: it wins small. It still loses points to Neural Cat: it wins small.

### The league

The league ran 20 rounds of 50,000 deals each: 1,000,000 hands. 18 of the 20 new models beat the best before them and were kept. lc13 and lc16 were not. Its last model was lc20.

Each round's new model played the best before it over 2,000 deals, every deal in both seat orders:

| Round | New model wins | Best before wins | Discards per win |
|---|---|---|---|
| 1 | 2.00% | 0.59% (random) | 18.0 |
| 3 | 6.16% | 2.73% | 18.9 |
| 6 | 11.95% | 8.95% | 18.6 |
| 10 | 14.71% | 13.73% | 17.9 |
| 14 | 17.32% | 15.16% | 17.5 |
| 17 | 17.51% | 17.14% | 17.3 |
| 20 | 20.36% | 17.63% | 16.9 |

lc20 against its older selves, over 2,000 new deals each, every deal in both seat orders:

| lc20 against | lc20 wins | Older model wins | lc20 points per hand | lc20 deals in | Older model deals in |
|---|---|---|---|---|---|
| lc0 (random) | 21.5% | 0.4% | +18.4 | 6.0% | 8.3% |
| lc3 | 26.2% | 4.2% | +27.1 | 7.6% | 13.3% |
| lc6 | 24.7% | 9.0% | +22.7 | 9.4% | 13.8% |
| lc10 | 22.8% | 12.6% | +10.5 | 10.9% | 13.6% |
| lc14 | 21.8% | 15.3% | +12.1 | 12.0% | 14.4% |
| lc17 | 20.7% | 16.6% | +0.2 | 12.0% | 13.4% |

Each new model wins more often than the ones before it. The points stay close, because every version wins cheap hands of 4 to 5 faan.

Neural Cat joined a third of the opponent seats from round 7, once lc6 won 11.9% of its seats. Over 1,000 deals each round, in both seat orders:

| Round | Lucky Cat wins | Neural Cat wins | Lucky Cat points per hand |
|---|---|---|---|
| 7 | 8.92% | 11.33% | -159.8 |
| 10 | 11.05% | 10.70% | -103.6 |
| 14 | 13.08% | 10.32% | -154.5 |
| 17 | 15.07% | 10.47% | -160.0 |
| 20 | 17.90% | 9.13% | -109.1 |

Lucky Cat now wins nearly twice as many hands as Neural Cat, and wins in fewer discards. It still loses points to Neural Cat. Neural Cat's wins are worth about 8 faan to Lucky Cat's 4 to 5, and Neural Cat deals in less often. That is the trade Lucky Cat was built to make: more hands won, not more points.

### Next: points first (trial model LP2b)

The lab ran four rounds from LC20, 100,000 deals in all (state and log in `ml/lab-lucky-cat/`, not committed). Round 2's advantage-weighted imitation (`awr`, model LP2b) cleared the bar. This ran from LC20 at the same time as the lab rounds above, so LP2b didn't ship: LC32 stays in the game, and the lab's next Lucky Cat rounds start from LC32 with this points-first trainer and judge. Rounds 3 and 4 found nothing better, so the lab stopped there.

| Round | Experiments (6,000 deals each, points a hand against the champion) | Best on 20,000 fresh deals | Kept |
|---|---|---|---|
| 1 | pg-2 +8.4, pg-fast −0.6, pg-sqrt −7.9 | pg-2: +2.3 ± 2.5 | no |
| 2 | awr +8.0, pg-clip +2.4, pg-all −4.2, pg −3.5 | awr: **+6.9 ± 2.5** (pg-clip +5.4 ± 2.3) | **LP2b** |
| 3 | awr +3.9, pg-clip +0.2, pg-2 −3.2, pg-wins −4.6 | awr: −4.2 ± 2.4 | no |
| 4 | pg-wins −0.2, pg −0.5, pg-fast −4.1, pg-all −9.0 | none ahead | no |

± is one standard error, deal by deal. LP2b replayed against LC20 on another 20,000 deals it had never played:

| LP2b against | Points a hand | Hands won | Deal-ins | Average win |
|---|---:|---:|---:|---:|
| LC20 (lab, 20,000 deals) | **+6.9 ± 2.5** | 19.7% vs 19.5% | 13.9% vs 14.1% | 170 vs 147 |
| LC20 (fresh, 20,000 deals) | **+4.0 ± 2.3** | 20.0% vs 19.4% | 14.0% vs 14.2% | 162 vs 151 |

Against Jorge Yau, on the same 20,000 deals for both (two seats each):

| | Points a hand against Jorge Yau | Hands won | Deal-ins | Average win |
|---|---:|---:|---:|---:|
| LC20 | −102.7 ± 5.2 | 15.2% vs 22.3% | 14.8% vs 9.9% | 153 vs 424 |
| LP2b | −87.7 ± 4.9 | 15.2% vs 22.3% | 14.9% vs 10.1% | 166 vs 396 |

- **It scores more without winning less.** Against LC20 its points rose by about 4 to 7 points a hand, with the same share of hands won: its wins are worth more (4.86 faan to 4.80, 160 to 170 points a win to about 150).
- **It is still Lucky Cat.** The change is small: 100,000 hands of training, a tenth of the league's million. Jorge Yau still beats it by about 88 points a hand, mostly because Jorge Yau's wins are worth more than twice as much and it deals in about two-thirds as often.
- **One hand's points are mostly luck.** A position barely predicts what a hand will pay (the critic explains well under 1% of it), so each step needs tens of thousands of hands, and most experiments were within the noise.

### Points first from lc32: beating itself, not the table

The lab then ran thirteen points-first rounds from lc32 (models LP1a to LP13a), trained with two learner seats and its own last champions in the pool, and judged head to head. Its champions beat lc32 head to head by 4 to 6 points a hand, with fewer, bigger wins, but at the game's table (one seat against two Neural Cats and Jorge Yau, 5,000 deals in every seat) they didn't: lc32 −103.7 ± 13.8 points a hand, LP11b −104.8 ± 15.0, LP12b −111.2 ± 14.9. So none shipped, and the lab now trains and judges Lucky Cat at that table, from lc32 ([the critique](../machine-learning/iterations.md#critique-points-first-from-lc32-learned-to-beat-itself-not-the-table)).

## What the coach says

The coach's words about the hand (what to go for, the waits, the threats) come from the classic rules' reads. What to do is the network's move. Its line says how often the network plays that move, and the next most likely one, for example "Lucky Cat's network plays this discard 62% of the time. Next most likely is 5 Bamboo: 21% of the time." For a claim or a kong it gives the share of each choice: "Lucky Cat's network would pung Red Dragon 60% of the time, and pass 40% of the time." After your discard, it is a great discard when the network gives your tile at least 80% of its top pick's share.

## The classic rules

The rest of this page is **Lucky Cat Classic** (`js/mahjong-lucky-cat.js`), the original bot logic. Most of it is the shared foundation every strategy is built on: the value model, defense, the one-suit discard rules, keeping pairs and dragons, and the claims every bot takes or passes. What it adds on top is tracking the whole table to find the fastest win, when it switches to Seven Pairs, Thirteen Orphans or Nine Gates (and how it discards on them), and when a chow is worth taking. The other strategies are listed in [the strategies README](README.md).

It only uses what its seat can see: its own hand and flowers, every open meld, the discard pond, and how many tiles are left in the wall.

A winning hand needs at least 3 faan. On a self-draw, every opponent pays. On a discard, only the player who threw the winning tile pays.

### Winning first

The goal is the fastest win at the 3-faan minimum, with as few points lost as possible along the way. A faan above the minimum counts for much less than its payout (`valuePower` 0.35 in place of 1), so a bigger hand has to be close to as fast. A 7-faan hand counts about 2.6 times a 3-faan hand here, not 16 times. A ready hand that can win is not broken for a bigger one.

This replaces the older aim of the most points over many hands. See Tracking the table for how the odds are worked out.

Late in the hand, safety still takes over:

- **Fold when you're unlikely to win.** With fewer than 45 tiles left and the hand still two or more tiles from ready, safety is weighed 1.5 times more.
- **Stop feeding.** See Tracking the table.

### Tracking the table

Every strategy now shares these reads, the discards, wants and feeding (see the [shared foundation](README.md)). What stays lucky-cat's alone is the race: it plays out the odds of finishing turn by turn, and leans hardest on keeping tiles with the most copies left.

Every turn, lucky-cat reads the whole table again from what its seat can see: every discard and who threw it, every open meld, its own tiles, and how many tiles are left in the wall. It never reads the wall's order or another player's concealed tiles, and a test checks that shuffling those changes nothing.

**What each opponent wants.** Each tile gets a score for each opponent, starting at 1:

- **A tile they threw** counts for much less, especially one thrown since their last meld. Its neighbors and its suji (three away) count for a little less.
- **A tile someone else threw that they let go by** counts for less, more so for an honor, since they'd usually pung a pair of one.
- **The suit they keep** counts for more, and the suit they throw most counts for less. Their melds' one suit counts for the most.
- **Honors that score for them** count for more, and an honor with fewer than two copies left counts for less.

**Noticing a pivot.** After eight discards, it compares the first half with the second half. If they barely threw a suit and now throw it often, or the reverse, they've changed hands. From then on it trusts only the later discards for their suit, and what they threw before the change says less.

**Where the tiles are.** Each unseen copy is either in the wall or in a hand. The more an opponent wants a tile, the less likely its copies are in the wall. The less they want it, the more likely they are to throw it next.

**The odds of finishing.** For each hand it could aim for, it works out how likely a go-around is to bring a tile that helps: its own draw, or a discard it could claim (a pung from anyone, a chow only from the player before it, and a win from anyone). It then runs the race a go-around at a time: the hand needs its remaining steps before the wall runs out or someone else wins, and the chance someone else wins comes from how close each opponent looks. Steps after the next one aren't known yet, so a wide hand further away doesn't beat a closer one.

Because this runs for every hand on every turn, it switches as soon as another hand has better odds. It also rates a ready hand's wait this way, so a wait everyone is holding counts for less than its count says.

**Feeding.** A tile an opponent would claim moves their hand along even when it doesn't win. It costs more the more they want it, the closer they look, and the later it is: 0.3 times the cost with more than 60 tiles left, up to 1.5 times with fewer than 16. The next player can also chow, so tiles they want cost them more.

**Limits.** The want scores and rates are hand-set estimates, not exact probabilities. The hand also keeps the shared rules in this playbook, like keeping pairs and a lone unseen dragon, even where the odds alone would throw them.

### Hands they aim for

For each possible discard they score the hand that would be left, and they keep the hand with the best odds of a win worth playing. Early in the hand, a bigger hand counts for a little more. Later, or when someone is showing a big hand, it counts for less.

The hands, in the order they come up:

- **A standard hand.** Four sets and a pair. A concealed hand is worth an extra faan.
- **Concealed Straights.** A concealed hand of runs, with no honors and no claims (not while the hand holds a set of honors, which can't be thrown away). While it's the hand in the lead, every honor goes first, except a dragon nobody has shown. The concealed faan plus All Sequences is most of the way to 3, and flowers make up the rest. A pung of a dragon, or of your own wind, or of the round wind, is still taken. Any other claim is passed.
- **Half flush.** One suit plus honors, once that suit (with honors, counting sets already made) makes up most of the hand and no meld is in another suit. Worth 3 faan on top of whatever the honors add.
- **Full flush.** One suit only, once that suit already makes up most of the hand and there is no honor meld. Worth 7 faan.

**Watch the player before you.** The player on your left is the only one whose discards you can chow. After six discards, a suit they've barely thrown (or the one suit their melds are in) is the one they're collecting, and the suit they've thrown most is the one they're feeding. When the suit they're collecting is about even with another of yours (six or more, within a tile), the hand stays out of theirs and builds the other flush instead, from six tiles: they won't throw what you'd need, and they'd claim it first. Between two close suits otherwise, the one they're feeding wins. The coach says so ("Kwan is collecting Bamboo, so stay out of it").
- **All Triplets.** Sets and pairs, no chows, once the hand already has several of them.
- **Concealed Triplets.** No melds yet, and at least two pungs already in hand.
- **Seven Pairs.** See below. Worth 4 faan, plus a flush when the pairs are all one suit (3 with honors, 7 without). The hand must stay concealed.
- **Thirteen Orphans.** When the concealed hand already holds nine different terminals and honors (or eight and a pair), and none of the missing ones is used up. Worth a limit, 13 faan. Nothing is claimed, and every other tile is discarded first.
- **Nine Gates.** When one suit already holds eleven tiles of the pattern 1112345678999 (three 1s, one each of 2 through 8, three 9s). Tiles beyond those counts, and every tile of another suit, do not count. Worth a limit, 13 faan. The hand stays concealed, and anything outside that suit is discarded first.
- **Bigger hands from the same tiles.** All Triplets also weighs Mixed Orphans (only 1s, 9s and honors, 1 more faan), All Terminals and All Honors; a hand with dragon or wind pairs weighs Small and Big Three Dragons and Small and Big Four Winds; Seven Pairs weighs its pairs in Mixed Orphans, All Honors or All Terminals. While one is within a step of the hand's best shape, its tiles are kept ahead of tiles it can't use, even a pair with fewer copies left, unless no copy is left to finish it. The coach names it and says to aim for it. A big hand of only certain tiles (10 faan or more, like All Terminals) can count from up to three steps away, while the wall and its live tiles can still finish it: it becomes the hand's target, the plan it's on and the one the coach names. See What gets discarded first for its order.
- **A plain hand**, only once it already has 3 faan from flowers, sets and the like. It's never the aim short of that (see the shared rules in [the README](README.md)).

A ready hand is scored exactly. Each wait is checked against the real faan table, including waits that only win on a self-draw and waits that can never reach 3 faan.

### What gets discarded first

When several discards are legal, they are taken in this order. A later group is used only when nothing in an earlier group can be thrown without leaving the hand further from ready. Keeping a pair or a dragon never costs a step: if every tile in an earlier group would slow the hand down, a tile from a later group that doesn't goes first.

While the hand is folding (see Defense), safety decides instead, and this order only breaks ties between equally safe tiles. The one exception is group 1 below: tiles of other suits still go first. Breaking a safe pair is the right play then.

Group 1 and the Concealed Straights rule are shared by every strategy (`js/mahjong-bot.js`), and come before a strategy's own order.

1. **Tiles from a suit you no longer need.** Once the hand holds 7 or more tiles of one suit, more than any other suit (sets already made count), every number tile of the other two suits is thrown first. Honors stay, for a half flush. This doesn't apply while the hand is going for Concealed Straights (below), or for a hand that needs its tiles from every suit or a fixed shape: Seven Pairs, Thirteen Orphans, Nine Gates. After you chow, a mixed hand cannot reach 3 faan, so the hand commits to the chow's suit (honors can stay, for a half flush). Every tile of another suit is thrown first, including pairs, every time, whatever faan the hand already has from flowers or honor sets. Even while folding, these go first (the safest of them first). The only exception is when the open melds already cover two number suits, since no flush is possible then.
2. **A tile someone has already Punged or Konged**, when the hand does not need it. See below.
3. **Ordinary tiles.** Singles and the spare tile from a triplet, chosen by which one leaves the hand closest to a good win.
4. **Pairs.** A pair is kept until the tiles above are gone. Keeping it leaves a later pung, a chow, or Seven Pairs open.
5. **A dragon that none of the table has shown yet.** This is kept even longer than a normal pair.

**Concealed Straights throws honors first.** While the hand in the lead is Concealed Straights, every honor goes before any number tile, with two exceptions. One honor pair can stay as the hand's pair (a dragon or scoring-wind pair before another), and any other honor pair goes. A dragon nobody has shown stays too, since it can still become a set, unless throwing it leaves the hand ready. A hand finished with an honor pair still scores Concealed, but not All Sequences, which allows no honors at all, so it's worth a faan less. While folding, safety decides instead.

**Honors early in the hand.** While more than 60 tiles are left in the wall, an honor that can still become a set (fewer than two copies on the table) is one of the hand's most valuable tiles. A single one waits like a pair (group 4). A dragon, or your own or the round's wind, waits longer still (group 5), and a pair of them longest. Honors are only let go early once two copies are out, or when the hand is on Seven Pairs, which only needs its pairs.

Two things change this order:

- **A bigger hand from the same tiles.** On a target, or whenever one of these hands is in the lead, a tile of it with no copy left goes first, then the tiles it can't use, even when that costs a step, and its live tiles wait. A ready hand isn't broken for one, and a hand with too few draws left to fill one drops it. While folding, safety still decides.
- **All Triplets** (or Concealed Triplets) keeps every pair and every pung. Both wait behind any single, and a finished pung waits behind a pair. Within each group, the tile with the fewest copies left (not yet seen by you) goes first, and the tiles with the most left are kept, because they're the ones that can still become sets. So a single with three left goes before a pair with one left: the pair is only one copy short and can pung. This comes ahead of the tile's kind, of a step toward a plainer hand and of risk. A discard that leaves the hand ready stays on top, tiles a bigger hand wants still wait, and while folding, safety decides.

### Pairs

A pair is two concealed copies of the same tile, not three. Three is a pung. The spare from a pung can be thrown. The pair itself waits.

The exception is the chow above. Once the hand is committed to one suit, pairs in the other suits are discarded with those suits, because they can no longer be used.

### Dragons

Red, Green, and White Dragon are kept until at least one copy of that dragon is already on the table, either in the pond or in an open meld. Until then they are not a discard if anything else can be thrown, even on Concealed Straights.

After one copy is visible, a dragon is considered like any other tile. A pair of them is still kept under the pair rule. A single dragon is let go once two copies are already out, because it can no longer become a pung. Winds follow that same "two are out" rule. Dragons do not: one visible copy is enough to consider discarding a dragon, and two visible copies is when a single dragon is given up.

While the hand is going for Seven Pairs, a single dragon can be thrown after the other singles. A dragon pair is still kept.

### A punged tile

Once any player has an open pung or kong of a tile, nobody can pung the last copy or wait on it as a pair.

For an honor, that makes it completely safe: an honor can only be won as a pung or a pair. A number tile is safer but not safe, because it can still finish someone's chow. The last Five Bamboo can still complete a 4-6 or a 6-7.

If throwing that tile leaves the hand as close to ready as the best other discard, and it is not itself a pair the hand is keeping, it is the first discard.

### Thirteen Orphans

The hand switches to Thirteen Orphans when it is concealed and already holds nine different terminals and honors. One and nine of each suit, and all seven honors, are those tiles. A pair of any of them also counts once, so eight different ones and a pair is enough too. A third copy does not count, because the hand only needs one pair. Nine means the hand is at most four tiles from ready.

It is dropped if any terminal or honor the hand still lacks has all four copies on the table, because it can never be finished.

Every tile that is not a terminal or an honor is discarded first. No chow, pung, or kong is taken. An open meld makes the hand impossible.

Eight different tiles without a pair is not enough.

### Nine Gates

Nine Gates is 1112345678999 in one suit, plus any one extra tile of that suit. The hand switches to it when one suit already contains eleven of those tiles: up to three 1s, one each of 2 through 8, and up to three 9s. A second 5 does not count, because the pattern only needs one. A fourth 1 does not count either.

Short of eleven, the same tiles make a Full Flush (7 faan), which can still claim and doesn't have to throw spare copies. Going for Nine Gates earlier gives that up for a hand that is rarely finished.

The suit with the most of those tiles is the one to build, once it has reached eleven. Tiles of the other suits, honors, and spare copies are discarded first. No claim is taken. An open meld makes Nine Gates impossible.

Ten of the pattern is not enough.

If one hand qualifies for more than one of Seven Pairs, Thirteen Orphans, and Nine Gates, they play whichever of those is closer to ready.

### Seven Pairs

The hand switches to Seven Pairs when all of these are true:

- More than four concealed pairs. Five or more tiles that you hold exactly two of.
- No pung or kong in the hand. Three or four of a kind is a set, not a pair, and the hand stays on sets.
- No open meld. A chow, pung, or kong makes Seven Pairs impossible.

Shedding one tile from a pung you currently hold does not count. The hand you have right now has to already be pairs. The next turn, if that pung is gone and five pairs remain, Seven Pairs starts then.

On this plan every pair is kept, nothing is claimed, and singles are discarded first. When the pairs are all in one suit (with or without honors), the hand is also worth the flush, and the bot counts that.

### After you chow

A chow gives up the concealed-hand faan and shows what you are doing, so it is taken only when it does real work:

- it makes the hand ready for a win of at least 3 faan, or
- it builds the flush the hand is already collecting and leaves you within two tiles of ready (within one tile while more than 60 tiles are left in the wall, since early on there's still time to draw the tile instead), or
- it is late in the hand (around the ninth discard, or under 48 tiles left in the wall) and it still leaves you within two tiles of ready.

A chow that does not get you closer is passed. A Concealed Straights hand is not chowed or punged, except for a dragon or a wind that scores.

Once the chow is down, tiles outside that suit are thrown first, as described above.

**Flowers count toward 3 faan.** A hand's flowers and seasons (your own flower and season are 1 faan each, all four of a kind 2, none at all 1) and any dragon or scoring-wind set already shown are faan it's sure of. When those already reach the minimum, or fall one short while every meld is a chow (All Sequences, runs and no honors, can add the last faan off a discard), the hand is a cheap win: a chow doesn't force a flush, an open All Sequences hand is weighed as a plan, and the hand plays for speed. lucky-cat then takes a chow that leaves the hand within two tiles of ready, at any point in the hand, and the coach says so ("Your flowers and sets give 2 faan, so one more wins").

### Dragons, winds, and kongs as claims

A pung of a dragon, or of your own wind, or of the round wind, is always taken, unless the hand is on Seven Pairs, Thirteen Orphans, or Nine Gates (a set cannot be part of those hands), or its target can't use the tile. On a target, only a pung or kong of a tile it uses is taken, and no chow. The one other exception is a hand that is already ready, when the pung would leave it further from ready and worth less than waiting. Then it is weighed like any other claim.

A kong is fine at any point in the hand, early or late. It draws a free replacement tile, so it is taken whenever the hand is no worse for it. A kong of a dragon or a scoring wind is taken like the pung above. Early chows are the ones to avoid (see After you chow). A concealed kong is declared when it does not break the hand. A kong draws a replacement tile.

Other pungs and chows are taken only when the hand afterwards is clearly better than passing.

### Defense

Each opponent is read as Low, Medium, High, or Extreme from how many melds they have, whether those melds are one suit, and how late the hand is. Three open melds is Extreme. Two melds in one suit is at least High. After many discards, even a quiet hand may be ready, but that read stops at High unless the melds themselves are Extreme.

Defense takes over when someone is High or Extreme and this hand is still two or more tiles from ready, or when fewer than 16 tiles are left in the wall and the hand is not already ready for a big win (5 faan or more). It also gets more weight once fewer than 45 tiles are left and the hand is still two or more tiles from ready (see Playing for points). The dealer pushes a little harder than the other seats.

Against one opponent, a tile is safer in this order:

1. An honor that anyone has already punged or konged. This one is safe against the whole table. (A punged number tile only loses its pung and pair waits. It can still finish a chow.)
2. A tile they have thrown since their last meld. Their current hand did not want it.
3. An honor with three or more copies already visible. It is dead.
4. A tile whose suji they have thrown. If they threw the 2, the 5 is safer, and the same three-away step in the other direction.
5. A tile blocked by a neighbor whose four copies are all visible.
6. A tile they threw earlier in the hand.
7. Everything else. A fresh honor, or a middle tile of the suit they are collecting, is the most dangerous.

A flush read makes their suit more dangerous and the other two suits safer. Near the end of the hand (fewer than 32 tiles left), a suit an opponent has chowed in is more dangerous too: they're building in it. A wait with three or more copies already visible is worth little. A wait with only one copy left is treated as nearly dead.

### What the coach adds

The coach does not choose for itself. It says the bot's decision in three parts: what to do and why, how far the hand is from ready and which hand it is building, and how dangerous the opponents look. It doesn't say which tile to drop after this one.

It only says "Play safe" on the last wall, when a win is unlikely: fewer than 16 tiles left and the hand not ready, or fewer than 36 left and two or more tiles from ready. A safe pick earlier in the hand is explained like any other discard.

When it bears on the hand, the coach also says what the tracker read from the discards: someone collecting a suit you hold a lot of ("Grace is collecting Bamboo, so stay out of it") or one your hand is building ("Grace is collecting Bamboo too, so those tiles will be slow"), or someone changing hands ("Grace has pivoted out of Bamboo").

When the hand it's building changes from last turn, it says so and why ("Pivoting from Half Flush in Bamboo to Concealed Straights: it's 2 tiles from ready, and the old hand is 4 tiles from ready."). A read of an opponent changing hands gives the reason too ("Grace has pivoted out of Bamboo: they kept it early and are throwing it now."). That read only uses their discards, never their hidden tiles.

The threats line says only what you can see on the table: the hand an opponent is going for, only when it is close to certain (three melds in one suit with none of that suit thrown, or four pungs and kongs: these held in about 95% or more of simulated hands), such as "Grace is almost certainly going for a Bamboo flush, so any Bamboo you throw is a likely deal-in." It never restates the melds, or says how many there are. The Low, Medium, High and Extreme levels above are the bots' own estimate, so the coach never names them, and a player with no melds isn't mentioned, however late it is.

It only calls a tile risky (or says "Hold" a tile, or calls your discard risky in feedback) when the table shows why, and it says the reason: a High or Extreme player's melds are all in that tile's suit, with or without honors ("Grace is almost certainly going for a Bamboo flush"). A tile any safety read covers (thrown since their meld, suji, kabe, three out, another suit than their flush) never counts. Without that, it says nothing about risk.

**Feedback on** does not tell you the tile first. After you discard or claim, it compares that move with the one above and says whether it was the coach's choice, close, slow, or risky. **Coach off** leaves the bar in place, in gray, and asks you to turn the coach on (on an upright phone the bar is hidden instead).
