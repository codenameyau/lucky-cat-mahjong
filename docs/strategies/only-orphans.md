# only-orphans: one family of hands, played by a model

This is the playbook for the **only-orphans** strategy (`js/mahjong-only-orphans.js`). It only plays hands of 1s, 9s and honors. A neural network trained by self-play decides how, the same way [Neural Cat](neural-cat.md) plays its hands. Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

## How it thinks

The rules fix the family of hands: every tile that isn't a 1, a 9 or an honor goes first, and it never chows. The hands it can reach are big (it wins about 2 hands in 100, each worth thousands of points), so the question is how long to keep chasing one. The network answers it with a score for each choice: the chance to win, how big the win would be and the chance of dealing in, folded into what the choice is worth on average. It plays the best one: which spare 1, 9 or honor goes, when to give up on Thirteen Orphans and for which hand, and which pungs and kongs to take. There is no separate rule for playing safe, because dealing in is already part of every score.

The model in the game, OL2c, plays like this compared with O5 before it (the same 20,000 deals): it takes more orphan pungs (0.52 a hand to 0.48) and settles for Mixed Orphans in triplets sooner (848 Mixed Orphans to 679, with Thirteen Orphans level at 724 to 718). It wins 2.2% of hands to 1.9%, each win a little smaller (about 6,000 points to 6,700), and deals in just as often (11.1%). Against the rule-based bot it scores +26.8 ± 14.8 points a hand.

It only uses what its seat can see, and it plays on the shared foundation in `js/mahjong-bot.js`, so it keeps the shared rules, like never throwing a lone dragon nobody has shown.

Training progress, round by round: [only-orphans-training.md](only-orphans-training.md).

## What stays fixed

These rules are what make it Only Orphans, so the model can't change them:

- **Tiles that aren't 1s, 9s or honors always go first**, even when it plays safe. The model picks which of them goes.
- **It never chows.** It only pungs or kongs a 1, a 9 or an honor, and only declares a kong of one. A win is always taken.
- **The hands it reads** are Thirteen Orphans (while no meld is down and no tile it needs has run out), and Mixed Orphans, All Terminals and All Honors, as triplets or as pairs. The usual hands only come in if a meld somehow rules all of those out.

## What the model decides

Everything else, scored in expected points (the [model](../machine-learning/model.md) Neural Cat uses, with its own weights in `js/mahjong-only-orphans-weights.js`):

- **Which tile goes.** It reads the position each allowed discard leaves and throws the one worth the most. Once it holds only 1s, 9s and honors, every tile is allowed.
- **When to give up on Thirteen Orphans, and for which hand.** The rule-based bot gave up on a fixed odds threshold after six discards. The model keeps or breaks the singles a Thirteen Orphans hand needs, and the pairs and triplets the other hands need, by what each is worth.
- **Which pungs and kongs to take.** Passing and each call it may make are scored, and the best one is played.
- **When to play safe.** Deal-in risk is part of every position it reads, so there is no separate folding rule beyond the shared foundation's order.

## How it is trained

`npm run ml:orphans` (`scripts/ml/orphans.js`) trains it like the Neural Cat [league](../machine-learning/training.md#4-the-league-npm-run-mlleague), in rounds of 50,000 games:

1. **Bootstrap (round 1).** The rule-based bot plays about half the seats, exploring, against Neural Cat, Jorge Yau and Lucky Cat. Its positions are read through the learned strategy's foundation and labelled with how each hand ended. O1 is trained on them from scratch.
2. **Play.** From round 2, the best model so far plays about half the seats, exploring (`--temperature 150`, `--epsilon 0.05`), against Neural Cat, Jorge Yau, Lucky Cat and up to two earlier models. Only its own seats are recorded, about 25% of their decisions.
3. **Train.** A new model starts from the best one's weights and trains on the last 8 rounds of data (`--lr 3e-4`, dropout 0.2, weight decay 1e-3, up to 8 epochs).
4. **Rank.** The new model, the best one, the model in the game and the rule-based bot each take one seat against Neural Cat, Jorge Yau and Lucky Cat, on the same 9,000 deals, each played from every seat, new deals every round. (Rounds 1 to 4 used 3,000 deals, which left a margin of about ±35 points a hand, wider than most differences between models.)
5. **Keep and ship.** It becomes the best if it scores more points a hand than the best. A best that also beats the rule-based bot by more than the 95% margin, and scores more than the model in the game on the same deals, is a **milestone**: it ships to `js/mahjong-only-orphans-weights.js`, so the game plays it. Both are measured on the same deals because the opponents change when the game's other strategies do, and every score with them.

**From O5, training moved to the lab** (`npm run ml:lab -- --strategy only-orphans`, state in `ml/lab-only-orphans/`), like Neural Cat's and Lucky Cat's. Each round the champion plays 50,000 games against the game's table and its last two champions, several candidates are trained from it (other learning rates, wider or deeper networks, other claim margins and win bonuses), and each takes one seat on 6,000 deals. The best two play 40,000 fresh deals, and one is kept only if J (points a hand + 5 × hands won, in percentage points) beats the champion beyond its standard error. Margins are read from the difference on each deal, since the candidate and the champion play the same deals. A kept champion ships to the game. The rule-based bot plays the same deals as the baseline.

The features are read through this strategy's own hooks, not Neural Cat's, so its data and models can't be mixed with Neural Cat's.

## The rule-based baseline

The rule-based bot this strategy replaces is kept, out of the game, as the baseline every model is ranked against: `scripts/ml/baselines/only-orphans-rules.js`, the lab strategy `only-orphans-rules` in `npm run compete`. It played like this:

- **Thirteen Orphans first.** From the first discard, every tile that isn't a 1, a 9 or an honor goes first, then spare copies of 1s, 9s and honors (one pair is kept). Nothing is claimed, and no kong is declared.
- **Giving up.** It stops playing Thirteen Orphans when all four copies of a tile it needs are on the table, or, after its first six discards, when its estimated chance of finishing falls under about 1 in 1,000. The odds are worked out a go-around at a time from the copies still unseen and the tiles left in the wall.
- **Pivots.** Then it plays whichever of Mixed Orphans, All Terminals and All Honors, as triplets or as pairs, has the best odds for what it pays (`valuePower` 0.5). Triplets pung any tile they keep; pairs claim nothing.
- **Defense.** Shared with the other bots ([lucky-cat.md](lucky-cat.md#defense)).

In the four-strategy competition it won least and scored most: 1.7% of hands, about 41 points a hand, carried by limit hands, so its score swings widely from run to run. It dealt in about 3 times for every win.
