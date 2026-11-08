# only-orphans: big hands built on 1s, 9s and honors, played by a model

This is the playbook for the **only-orphans** strategy (`js/mahjong-only-orphans.js`). Its hands are built on 1s, 9s and honors: Thirteen Orphans, triplets or pairs of those tiles, and, when the deal fits better, Seven Pairs and Concealed Triplets of any tiles. Rules pick the target; a neural network trained by self-play decides the moves inside it, the same way [Neural Cat](neural-cat.md) plays its hands. Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

## How it thinks

Every deal it picks a **target**, the hand worth the most points on average, and it reads that again every turn as tiles come in. It has five:

| Target | The hands | Faan (before flowers) | Claims |
| --- | --- | ---: | --- |
| Thirteen Orphans | one of every 1, 9 and honor, and a pair of one | limit (13) | only the winning tile |
| Triplets of 1s, 9s and honors | Mixed Orphans with All Triplets, All Terminals, All Honors | 4 to limit | pungs and kongs of 1s, 9s and honors |
| Pairs of 1s, 9s and honors | Seven Pairs with Mixed Orphans, or in All Honors | 5 to limit | only the winning tile |
| Seven Pairs | seven different pairs of any tiles | 4 | only the winning tile |
| Concealed Triplets | four concealed pungs of any tiles and the eyes | 10 (limit with only 1s, 9s and honors) | only the winning tile |

What a target is worth is its payout (each faan doubles it, up to the 13-faan limit) times the odds of finishing it. The odds are played out a go-around at a time: at each step the hand takes the likeliest kind of help (a new kind of tile, a pair, a pung), its live tiles are counted, the winning tile can come off any discard (and on the triplets target so can a pung's third tile), and every go-around someone else may finish first. So a hand whose later steps need the last two copies of its pairs is slower than one whose first step only looks as wide. A hand keeps its target until another is worth 1.3 times as much, or until the target can't be made any more.

1s, 9s and honors are the shared core: whatever the target, they are kept ahead of other tiles, their pairs become the eyes or pungs, and Concealed Triplets made only of them is a limit hand. Because a bigger hand pays so much more (Concealed Triplets pays 64 times a Seven Pairs of 4 faan), Seven Pairs only becomes the target once nothing bigger has real odds, for example late in the wall or when the copies its pairs need are all on the table.

Inside the target, the network scores every allowed choice: the chance to win, how big the win would be and the chance of dealing in, folded into what the choice is worth on average. It plays the best one: which allowed tile goes, and which allowed pungs and kongs to take. There is no separate rule for playing safe, because dealing in is already part of every score.

It only uses what its seat can see (its tiles and melds, and the copies of each tile not yet on the table), and it plays on the shared foundation in `js/mahjong-bot.js`, so it keeps the shared rules, like never throwing a lone dragon nobody has shown.

The model in the game, OT7c, is OT6e's network fine-tuned, at three times the usual learning rate, on the seven rounds played with the targets, with the same play settings (win bonus 500, claim margin 50). Against OT6e on the same 40,000 deals (against Neural Cat NC5), it wins 4.1% of hands to 3.9% (6,625 wins to 6,292), the extra ones mostly Concealed Triplets (1,172 to 993) and Mixed Orphans (622 to 526), with Seven Pairs (3,709 to 3,627), Thirteen Orphans (1,450 to 1,415) and limit hands (1,884 to 1,786) a little up too. Each win is a little bigger (about 4,165 points to 4,015). It claims a few more tiles (2,749 pungs to 2,228, 5,628 kongs to 5,203), and it deals in a little less (13.3% of hands to 13.6%, 22.8 points a hand to 24.0). It scores 93.6 points a hand to 81.2: +12.5 ± 9.6. Against the rule-based bot on those deals it scores +91.1 ± 9.7 points a hand.

OT6e, before it, was OT5e with a win bonus of 500 instead of 450, a small step. Against OT5e on the same 40,000 deals (against Neural Cat NC5), it wins 3.9% of hands to 3.8% (6,190 wins to 6,011), the extra ones Seven Pairs (3,576 to 3,406), with limit hands (1,735) and deal-ins (21,734 to 21,736) the same. It scores 73.3 points a hand to 72.8: +0.5 ± 1.0. Against the rule-based bot on those deals it scores +75.3 ± 9.4 points a hand.

OT5e, before it, was OT4a's network with a win bonus of 450 instead of 300, so it leans harder toward the choice more likely to finish. Against OT4a on the same 40,000 deals, it wins 3.8% of hands to 3.5% (6,154 wins to 5,592), most of the extra ones Seven Pairs (3,371 to 2,842), with limit hands level (1,898 to 1,880). Each win is smaller (about 4,400 points to 4,800), and it deals in just as often (12.9%, 23.7 points a hand either way). It scores 88.7 points a hand to 86.8: +1.9 ± 2.0, within the margin on points alone, kept because J also counts the extra wins. Against the rule-based bot on those deals it scores +81.8 ± 10.0 points a hand.

OT4a, before it, was OT2d fine-tuned on the four rounds played with the targets, with a win bonus of 300: each choice's score adds 300 points times its chance to win, so among choices worth about the same it takes the one more likely to finish. Against OT2d on the same 40,000 deals, it wins 3.5% of hands to 2.7% (5,521 wins to 4,361), most of the extra ones Seven Pairs (2,876 to 1,792), with limit hands holding up (1,864 to 1,796, Thirteen Orphans 1,450 to 1,409). Each win is smaller (about 4,800 points to 5,700) and it self-draws more (1,366 to 1,011). It pungs less (2,043 to 3,038), and it deals in a little less (13.1% to 13.3%, 25.0 points a hand to 26.4). It scores 87.2 points a hand to 76.0: +11.2 ± 9.5. Against the rule-based bot on those deals it scores +79.8 ± 9.8 points a hand.

OT2d, before it, was OT1a's network with a claim margin of 50: it takes a pung or kong only when it scores 50 points more than passing. Against OT1a on the same 40,000 deals, it pungs a discard about a fifth as often (3,174 pungs to 15,389) and kongs more (5,370 to 3,919), so more of its pairs and triplets stay concealed. It wins about as often (2.7% to 2.8%), a little bigger (about 5,900 points to 5,760), with fewer All Triplets (164 to 319) and Mixed Orphans (386 to 522) and Thirteen Orphans, Concealed Triplets and Seven Pairs about level. It deals in just as often (13.4%). It scores 80.1 points a hand to 77.6: +2.5 ± 1.9. Against the rule-based bot on those deals it scores +77.9 ± 9.8 points a hand.

OT1a, before it, was the first trained with the targets: OL2c fine-tuned on 50,000 deals OL2c played with them. Against OL2c on the same 40,000 deals, both with the targets, it bets on bigger hands inside them. It wins 2.8% of hands to 4.4%, but each win is worth about 5,500 points to 3,200. It wins far fewer Seven Pairs (1,733 to 4,665) and more Concealed Triplets (961 to 578), dragon pungs (800 to 484) and All Triplets (369 to 259), with Thirteen Orphans about level (1,347 to 1,419). It pungs more (0.10 a hand to 0.07), and it deals in about as often (13.5% to 13.1%, 28.0 points a hand to 27.2). That comes to 72.2 points a hand to 57.4: +14.8 ± 9.3. Against the rule-based bot on those deals it scores +74.0 ± 9.7 points a hand.

Before the targets, OL2c played like this compared with O5 (the same 20,000 deals): it takes more orphan pungs (0.52 a hand to 0.48) and settles for Mixed Orphans in triplets sooner (848 Mixed Orphans to 679, with Thirteen Orphans level at 724 to 718). It wins 2.2% of hands to 1.9%, each win a little smaller (about 6,000 points to 6,700), and deals in just as often (11.1%). Against the rule-based bot it scores +26.8 ± 14.8 points a hand.
Training progress, round by round: [only-orphans-training.md](only-orphans-training.md).

## What stays fixed

These rules are what make it Only Orphans, so the model can't change them:

- **The target is the rules' call**, picked as above.
- **Tiles the target can't use always go first**, even when it plays safe. On Thirteen Orphans and the hands of 1s, 9s and honors that is every other tile. On Seven Pairs it is any other tile not in a pair (and a third copy), and on Concealed Triplets any other tile not in a pair or pung: their pairs and pungs stay. The model picks which of those tiles goes.
- **It never chows.** It pungs or kongs only a 1, a 9 or an honor, and only on the triplets target, or when that pung makes the triplets target worth 1.3 times the one it's on. On every other target it claims nothing but the winning tile, and it declares a kong only on the triplets target (of a 1, a 9 or an honor) or a concealed one on Concealed Triplets. A win is always taken.
- **The hands it reads** are the target's: on Seven Pairs, Seven Pairs and the same hand in 1s, 9s and honors; on Concealed Triplets, Concealed Triplets and the triplets of 1s, 9s and honors; otherwise Thirteen Orphans (while no meld is down and no tile it needs has run out) beside Mixed Orphans, All Terminals and All Honors, as triplets or as pairs. The usual hands only come in if a meld somehow rules all of those out.

## What the model decides

Everything else, scored in expected points (the [model](../machine-learning/model.md) Neural Cat uses, with its own weights in `js/mahjong-only-orphans-weights.js`):

- **Which tile goes.** It reads the position each allowed discard leaves and throws the one worth the most. Once only tiles the target uses are left, every tile is allowed.
- **Which pungs and kongs to take**, among the ones the target allows. Passing and each call it may make are scored, and the best one is played.
- **When to play safe.** Deal-in risk is part of every position it reads, so there is no separate folding rule beyond the shared foundation's order.

Before the targets, the model also decided when to give up on Thirteen Orphans: it kept or broke the singles a Thirteen Orphans hand needs by what each was worth, and could pung a 1, 9 or honor at any time. That is the target's job now. With O5's weights the targets scored +21.6 ± 21.5 points a hand more than the old rules on the same 20,000 deals, winning 5.0% of hands instead of 2.0%, with an average win of 2,907 points instead of 6,186 ([iterations](../machine-learning/iterations.md#only-orphans-targets-by-expected-points)).

## How it is trained

`npm run ml:orphans` (`scripts/ml/orphans.js`) trains it like the Neural Cat [league](../machine-learning/training.md#4-the-league-npm-run-mlleague), in rounds of 50,000 games:

1. **Bootstrap (round 1).** The rule-based bot plays about half the seats, exploring, against Neural Cat, Jorge Yau and Lucky Cat. Its positions are read through the learned strategy's foundation and labelled with how each hand ended. O1 is trained on them from scratch.
2. **Play.** From round 2, the best model so far plays about half the seats, exploring (`--temperature 150`, `--epsilon 0.05`), against Neural Cat, Jorge Yau, Lucky Cat and up to two earlier models. Only its own seats are recorded, about 25% of their decisions.
3. **Train.** A new model starts from the best one's weights and trains on the last 8 rounds of data (`--lr 3e-4`, dropout 0.2, weight decay 1e-3, up to 8 epochs).
4. **Rank.** The new model, the best one, the model in the game and the rule-based bot each take one seat against Neural Cat, Jorge Yau and Lucky Cat, on the same 9,000 deals, each played from every seat, new deals every round. (Rounds 1 to 4 used 3,000 deals, which left a margin of about ±35 points a hand, wider than most differences between models.)
5. **Keep and ship.** It becomes the best if it scores more points a hand than the best. A best that also beats the rule-based bot by more than the 95% margin, and scores more than the model in the game on the same deals, is a **milestone**: it ships to `js/mahjong-only-orphans-weights.js`, so the game plays it. Both are measured on the same deals because the opponents change when the game's other strategies do, and every score with them.

**From O5, training moved to the lab** (`npm run ml:lab -- --strategy only-orphans`, state in `ml/lab-only-orphans/`), like Neural Cat's and Lucky Cat's. Each round the champion plays 50,000 games against the game's table and its last two champions, several candidates are trained from it (other learning rates, wider or deeper networks, other claim margins and win bonuses), and each takes one seat on 6,000 deals. The best two play 40,000 fresh deals, and one is kept only if J (points a hand + 5 × hands won, in percentage points) beats the champion beyond its standard error. Margins are read from the difference on each deal, since the candidate and the champion play the same deals. A kept champion ships to the game. The rule-based bot plays the same deals as the baseline. Since the targets, the lab trains only on its own games with them (models OT1a, OT2a, …, data `ml/data/ootgt-<n>`): the positions in older data were read through the fixed-family rules. The fixed-family lab's state is kept in `ml/lab-only-orphans-fixed-families/`.

The features are read through this strategy's own hooks, not Neural Cat's, so its data and models can't be mixed with Neural Cat's.

## The rule-based baseline

The rule-based bot this strategy replaces is kept, out of the game, as the baseline every model is ranked against: `scripts/ml/baselines/only-orphans-rules.js`, the lab strategy `only-orphans-rules` in `npm run compete`. It played like this:

- **Thirteen Orphans first.** From the first discard, every tile that isn't a 1, a 9 or an honor goes first, then spare copies of 1s, 9s and honors (one pair is kept). Nothing is claimed, and no kong is declared.
- **Giving up.** It stops playing Thirteen Orphans when all four copies of a tile it needs are on the table, or, after its first six discards, when its estimated chance of finishing falls under about 1 in 1,000. The odds are worked out a go-around at a time from the copies still unseen and the tiles left in the wall.
- **Pivots.** Then it plays whichever of Mixed Orphans, All Terminals and All Honors, as triplets or as pairs, has the best odds for what it pays (`valuePower` 0.5). Triplets pung any tile they keep; pairs claim nothing.
- **Defense.** Shared with the other bots ([lucky-cat.md](lucky-cat.md#defense)).

In the four-strategy competition it won least and scored most: 1.7% of hands, about 41 points a hand, carried by limit hands, so its score swings widely from run to run. It dealt in about 3 times for every win.
