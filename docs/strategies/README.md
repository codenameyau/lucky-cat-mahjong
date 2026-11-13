# Bot strategies

Every bot at the Play Mahjong table plays a named strategy, and the coach follows one too. The **Strategies** button in the top bar describes each strategy and assigns them: one per bot seat, and one for the coach's tips and feedback.

| Strategy | Name | File | Playbook |
| --- | --- | --- | --- |
| (shared foundation) | | `js/mahjong-bot.js` | the rules below |
| `lucky-cat` | Lucky Cat | `js/mahjong-lucky-cat-ml.js` | [lucky-cat.md](lucky-cat.md) |
| `jorge-yau` | Jorge Yau | `js/mahjong-jorge-yau.js` | [jorge-yau.md](jorge-yau.md) |
| `neural-cat` | Neural Cat | `js/mahjong-ml.js` | [neural-cat.md](neural-cat.md) |
| `only-orphans` | Only Orphans | `js/mahjong-only-orphans.js` | [only-orphans.md](only-orphans.md) |

Before version 0.6.0 the two ids were the other way round; saved choices and save files from then are converted when they're read.

## What each strategy is now

| Strategy | In the game | How it is made | Where its story is |
| --- | --- | --- | --- |
| `jorge-yau` | Rules only (no model) | Hand-written rules: it picks a target hand, keeps honors, locks onto a hand worth 7 faan or more and plays no defense until late in the wall | [jorge-yau.md](jorge-yau.md) |
| `lucky-cat` | **lc34** | **Aim: the most hands won**, with small fast wins, and a bigger hand when the chance is good and it is nearly ready. A network that makes every move itself, trained in the lab (to lc32) on fresh games and kept only for a clear gain on fresh deals; learns from deal-ins since lc31, and since lc33 from replays of its own choices at a table of its older versions; lc34 is the sixth generation of that loop | [lucky-cat.md](lucky-cat.md), [iterations](../machine-learning/iterations.md#lucky-cat-against-its-own-lineage-lc33-2026-11-11) |
| `neural-cat` | **NC10** | **Aim: the balance of both**, winning often and winning big. Jorge Yau's best choices, ranked by a network in expected score; trained by the league (to NC2), the lab (NC3 to NC9), and against its own older versions (NC10) | [neural-cat.md](neural-cat.md), [iterations](../machine-learning/iterations.md#neural-cat-against-its-own-lineage-nc10-2026-11-11) |
| `only-orphans` | **OW1** | **Aim: the biggest hands and the most points**, even if it wins less often. Rules that pick a target each deal (Thirteen Orphans, triplets, Seven Pairs) and a network that chooses the rest in expected points; since OW1 trained against its own older versions, on data rich in won hands | [only-orphans.md](only-orphans.md), [training progress](only-orphans-training.md) |

All three learned models are now trained against older models of their own lineage only ([training](../machine-learning/training.md#training-a-lineage-against-its-own-past)). The frontier model and Lucky Cat's value lineage, the newest work before that, shipped nothing past FC1 (folded into Neural Cat in 0.59.0). Each model's full history is in [Iterations](../machine-learning/iterations.md).

## What each learned strategy is for

The maintainer set each strategy's aim on 2026-11-11, and its training is judged by it:

| Strategy | Aim | What its training keeps a new model for |
| --- | --- | --- |
| **Lucky Cat** | Win as many hands as possible. It goes for smaller, quicker hands to secure the win, and takes a big hand when it has a good chance at one and is nearly ready | More hands won, with points a hand and deal-ins no worse |
| **Only Orphans** | The biggest hands and the most points. It's fine if it wins less often | More points a hand and more limit hands; hands won isn't a bar |
| **Neural Cat** | The balanced one, the best of both: win often and win big | More points with hands won no lower, or more hands won with points no lower |

Each lineage trains and is judged only against its own older versions, so its progress is a clear benchmark: a new model is confirmed on fresh deals against the one before it at a table of its own earlier generations ([training](../machine-learning/training.md#the-bars), [iterations](../machine-learning/iterations.md)). Playing the three against each other, and a championship with the rule-based Jorge Yau, is a later phase.

How often each scoring pattern (Half Flush, All Triplets, Seven Pairs and the rest) appears in each strategy's wins, with the games and wins behind every percentage: [hand patterns](hand-patterns.md).

## Which strategy plays where

- Picks are saved in `localStorage` under `lcm-play-strategies`, as `{ "seats": { "1": id, "2": id, "3": id }, "coach": id }`. Seat 1 is on your right, 2 across, 3 on your left.
- A bot seat with nothing saved plays a random strategy, picked again each game. "Random each game" in the sheet clears the saved pick.
- The coach (tips and feedback) defaults to `neural-cat` ("Coach Neural Cat").
- A change takes effect on the bot's next move, in the game you're playing.
- The table shows only each player's name. Which strategy each bot plays is on the Strategies sheet, and on desktop in a tooltip when you hover over their name.

## The contradiction check

Every decision every strategy makes, and every move the coach recommends, goes through one check (`js/mahjong-bot.js`: `contradicts`, `consistentFirst`, `claimContradicts`, `claimConsistent`, `kongContradicts`; ported to `native/src/bot.cpp`): the move must not go against the hand it is building toward, the hand the coach names ("Go for Half Flush in Characters").

- **Discards.** A discard contradicts its hand when it throws a tile that hand keeps while the hand still holds a tile it has no use for: a Character on the way to a Half Flush in Characters while a Bamboo or a Circle is still in hand, a number tile on Concealed Straights while a loose honor is held. On hands of pungs and pairs (All Triplets, Concealed Triplets, Seven Pairs), breaking a pair or a pung while a single is left contradicts it. The hand is the plan the discard builds toward (its analysis' best plan), so the coach's words and the move agree.
- **Claims.** A pung, chow or kong contradicts the hand being built (the plan if it passes) when that hand can't take it: a hand built concealed (Seven Pairs, Thirteen Orphans, Nine Gates, Concealed Triplets, Concealed Straights), or a meld of tiles the hand doesn't keep (a Bamboo chow on a Half Flush in Characters). A contradicting claim passes.
- **Kongs on your own turn.** A kong contradicts the hand when that hand can't hold it (Seven Pairs, Thirteen Orphans, Nine Gates, Concealed Straights, or a tile it doesn't keep), and is skipped.
- **Never a contradiction:** a discard that leaves the hand ready, a win, a pung or kong of a dragon or scoring wind (the one exception: on Thirteen Orphans), throwing an honor whose other copies are all out, keeping a dragon nobody has shown, keeping an honor pair as the eyes of Concealed Straights, and any move while folding (safety decides then). A claim of the tiles of a big hand the bot is building (a hard target) is that hand's own.
- **When the first choice contradicts.** The strategy's next choice in its own order is taken, until one doesn't contradict; if every one does, the last of them. In practice a hand always holds some tile its hand has no use for, so the fallback almost never happens.

Where it runs:

| Strategy | Its moves | How |
| --- | --- | --- |
| Jorge Yau, Lucky Cat Classic | Discards, claims, kongs | The foundation's discard order ends with `consistentFirst`; `decideClaim` passes a contradicting claim; `chooseTurnAction` skips a contradicting kong |
| Neural Cat, Only Orphans | Discards, claims, kongs | The same, and its model only chooses among moves that pass: its rerank ends with the check, and a contradicting call or kong is never one of its choices |
| Lucky Cat (the network) | Discards, claims, kongs | Each move the network picks is checked against the plan the shared foundation reads for it (as Jorge Yau and Neural Cat play it); if it contradicts, the network's next most likely move that doesn't is played |
| The coach | Every hint | Its hint is the strategy's own move, so it passes the same check; when it follows your own plan instead of the strategy's, it checks against that |

What it measured, strategy by strategy, is in [iterations](../machine-learning/iterations.md#the-contradiction-check-every-move-agrees-with-its-hand); the design that puts it at the end of one pipeline (a hand picker, a pivot checker, a discarder, then this check) is the [evaluation architecture](../architecture/README.md).

It runs in the game, in every simulation, and in training: the data a model learns from records the move the check settled on, so models learn not to contradict themselves. `lcm-sim` takes `id~nocheck` (for example `jorge-yau~nocheck`) to play a player without it, which is how it was measured.

## Adding a strategy

All strategies are built on the shared foundation in `js/mahjong-bot.js` (`MahjongBot`): shanten, live tiles, the exact score of every wait, the threat model, the claim options, and the principles every bot follows:

- **Flowers count toward 3 faan.** A hand's flowers and seasons (your own flower and season are 1 faan each, all four of a kind 2, none at all 1) and any dragon or scoring-wind set already shown are faan it's sure of. When those already reach the minimum, or fall one short while every meld is a chow (All Sequences, runs and no honors, can add the last faan off a discard), the hand is a cheap win: a chow doesn't force a flush, an open All Sequences hand is weighed as a plan, and the hand plays for speed.
- **Bigger hands from the same tiles.** A hand of sets also weighs the special hands its tiles can still make: Mixed Orphans (only 1s, 9s and honors, 1 faan on top of All Triplets), All Terminals, All Honors, Small and Big Three Dragons, Small and Big Four Winds, and on Seven Pairs, the pairs in Mixed Orphans, All Honors or All Terminals. While one is within a step of the hand's best shape, its tiles are kept ahead of tiles it can't use, even a pair with fewer copies left than another pair; a tile of it with no copy left to finish it (a single, or a pair when another pair can be the hand's pair) goes early instead. The coach names it ("Mixed Orphans is in reach: keep your 1s, 9s and honors") and says when a tile goes because none are left. A big hand of only certain tiles (10 faan or more, like All Terminals) can count from up to three steps away, while the wall and its live tiles can still finish it, and a hand not already set on a target or a special hand of its strategy's makes it the hand's target. On a target, or whenever one of these hands is in the lead, a tile of it with no copy left goes first, then the tiles it can't use, even at a step's cost, and its live tiles wait. A hand with too few draws left to fill one drops it, and a ready hand isn't broken for one.
- **One suit.** After a chow (unless flowers make it a cheap win), keep that suit and the honors: every tile of another suit goes first, even while folding. With 7 or more tiles of one suit (sets count, and more than any other suit), the other suits go first the same way. Hands that need their tiles from every suit or a fixed shape (Seven Pairs, Thirteen Orphans, Nine Gates, All Terminals, All Honors, Four Winds) keep their own order.
- **Concealed Straights throws honors first**, ahead of any number tile, while it's the hand in the lead, keeping only one honor pair as the hand's pair and any dragon nobody has shown, even with that pair already kept, unless throwing that dragon leaves the hand ready (while folding, safety decides, except for a lone dragon, which stays unless throwing it leaves the hand ready). An honor pair costs the All Sequences faan, so the hand is weighed with one less.
- **Never throw a lone dragon nobody has shown.** While all three other copies are unseen, it stays, on every hand and even while folding, unless throwing it leaves the hand ready to win. Once a copy is showing, the usual order applies.
- **Ready means it can win.** A hand is ready only when a wait with copies left scores the 3-faan minimum, by discard or self-draw. A complete shape worth less counts as far from ready as the hand that would score, for discards, claims, the lone dragon rule and everything the coach says. The coach says so when a shape is complete but short.
- **Read the whole table.** Every strategy tracks each opponent's discards, open melds and passed tiles from what its seat can see, estimates what each one wants, counts a tile they're collecting as fewer outs, and weighs feeding them, more toward the end of the hand.
- **Read your own hand.** After four discards, a suit you've barely thrown counts for more as a flush, a suit you've thrown a lot of counts for less, and honors going out lean toward straights.
- **Keep the tiles with the most copies left.** Between close discards, the tile with fewer copies unseen goes first. lucky-cat weighs this most.
- **Throw the isolated tile in your shortest suit.** Between discards rated alike, a number tile with no other tile of its suit within 2 ranks goes first, the one in the suit with the fewest tiles: in 1, 4 and 5 of a suit, the 1. A strategy's own order, keeping a hand of sets by copies left, and folding all come first, and it doesn't apply to a discard that leaves the hand ready or a risky one.
- **Stick to a plan.** For its first 3 discards, a hand keeps its options open. From the fourth, it commits to the hand it's on and pivots only for one of three reasons:
  - The plan is gone: a meld or the tiles on the table rule it out.
  - More points: the new hand is worth at least 1 more faan, is no more than 1 step further from ready, and rates at least 10% higher.
  - The plan is hopeless: no tile helps it, there aren't the draws left to fill it, or another hand is at least 2 tiles closer with at least 3 times the odds.

  Coming back to a hand it left needs 2 more faan and no extra steps, unless the current plan has become hopeless. A claim that leaves the plan needs one of the same reasons, unless it makes the hand ready to win. Hands built from the same tiles count as one plan, so moving between them isn't a pivot: a Half Flush and a Full Flush in one suit, All Triplets and Concealed Triplets, a plain hand and Concealed Straights, the hands of 1s, 9s and honors, and the Seven Pairs hands. A saved game replays the bots' turns, so they come back on the same plans. The coach's record for your own hand isn't saved, so after a reload it commits again from what you hold.
- **Keep backups alive.** Between close discards, it adds 12% of the value of the two best other plans those tiles could still become, so a discard that leaves a backup possible stays ahead.
- **Never aim for a chicken hand.** The plain hand is a plan only once it already has 3 faan from flowers, sets and the like. Short of that, the hand aims for something that scores. If nothing else can be finished, that's a Half Flush in its best suit or All Triplets, and with melds that rule both out, a dragon or wind set.
- **Keep pairs and unseen dragons**, and throw a tile someone has punged when the hand doesn't need it. Apart from the lone dragon, keeping them never costs a step toward ready.
- **Watch the player before you.** The player on your left is the only one whose discards you can chow. After six discards, a suit they've barely thrown (or the one suit their melds are in) is the one they're collecting, and the suit they've thrown most is the one they're feeding. When the suit they're collecting is about even with another of yours (six or more, within a tile), the hand stays out of theirs and builds the other flush instead, from six tiles: they won't throw what you'd need, and they'd claim it first. Between two close suits otherwise, the one they're feeding wins.
- **Claims.** Seven Pairs, Thirteen Orphans, Nine Gates and Concealed Straights claim nothing (Concealed Straights still pungs a dragon or scoring wind). A dragon or scoring wind is always punged otherwise, unless that breaks a ready hand. On a target (see above), only a pung or kong of a tile it uses is taken, and no chow. A chow must get the hand closer to ready and still be able to reach 3 faan.

These come before a strategy's own choices. A strategy adds to that foundation through hooks:

```js
var bot = MahjongBot.createStrategy({
  id: 'my-cat',
  hooks: {
    context: function (ctx, game, seat) { /* add your own reads to ctx */ },
    hand: function (ctx, counts) { /* read the 14-tile hand before its discards are weighed */ },
    plans: function (c, ctx) { /* the hands to aim for; MahjongBot.basePlans(c, ctx) is the usual list */ },
    priority: function (game, ctx, counts, candidate, bestShanten) { /* discard group after the shared rules, lower first; null = the shared order */ },
    chowOk: function (option, found, ctx, game) { /* whether a chow the shared rule allows is worth it */ },
    claim: function (found, ctx, game, seat, opts) { /* { type: 'pass' | 'pung' | 'kong' | 'chow', ... }; null = the shared claims */ },
    // also: finishChance, finalOrder, rerank, kongOk, readyValue, threats, waitChance, extraLoss, defense
  },
  tuning: { defenseScale: 1.5 },
});
```

Every hook is optional. A strategy with none plays the shared foundation alone: the usual hands (standard, Concealed Straights, the flushes, All Triplets), no Seven Pairs, Thirteen Orphans or Nine Gates, and any chow the shared rule allows. lucky-cat-classic (`js/mahjong-lucky-cat.js`) is a short example: it adds the special hands and its chow timing. The hooks are listed in section 9 of `js/mahjong-bot.js`. Each strategy keeps its own copy of the tuning knobs (`bot.setTuning`), so changing one never changes another.

Then:

1. Load its script in `playing-mahjong/index.html` (the game page) after `mahjong-bot.js` and before `mahjong-strategies.js`.
2. Add an entry to `STRATEGIES` in `js/mahjong-strategies.js` with its `id`, `name`, `bot`, a one-line `summary` and a few `details` paragraphs for the Strategies sheet.
3. Write its playbook here.
4. Play it against the others (below).

The coach speaks for any strategy through `MahjongCoach.forStrategy(bot)`. It names the plan the strategy picked, using `plan.label`, and for a tile the plan doesn't use it gives `plan.reason`.

## Learned strategy

`neural-cat` (`js/mahjong-ml.js`) lets a model trained on simulated hands pick the discard. It plays Jorge Yau's hooks (a strategy's `hooks` are on the bot, so another can build on them), which list and read every discard as usual, then the `rerank` hook (the last word, after every shared rule) scores the position each of the best few (6 for NC10) leaves in expected points: the chance of winning by self-draw or off a discard, of dealing in, and the faan of each, on the full-spicy payout table. Each candidate gets `ml` with those numbers, and the chosen one gets `ml.why`, the points each feature group (`hand`, `discard`, `table`, `context`, `speed`, `value`, `safety`) puts it ahead of the next best. Claims and kongs are weighed the same way (passing, each call and the discard after it, a kong before its replacement tile), and the model overrules Jorge Yau's call when its pick is worth more. Every strategy reads an opponent's melds through `shownMelds`, never which tile a concealed kong is, and `js/mahjong-fair-play.test.js` checks that no strategy's decisions change when the tiles its seat can't see are shuffled. Its playbook, with training and results, is [neural-cat.md](neural-cat.md), and the whole AI layer is documented in [docs/machine-learning](../machine-learning/README.md).

| File | |
| --- | --- |
| `js/mahjong-ml-features.js` | The features of one discard, from what the seat can see. Training and play share it |
| `js/mahjong-ml-model.js` | The network, in plain JS, and expected points from its prediction |
| `js/mahjong-ml.js` | The strategy, with `create({ temperature, epsilon })` for exploring copies |
| `scripts/ml/generate.js` | Training data from simulated deals (`npm run ml:generate`) |
| `scripts/ml/loop.js` | Self-play rounds: generate, train, evaluate, ship the best (`npm run ml:loop`) |
| `ml/train.py` | Trains the model in PyTorch and ships it to `js/mahjong-ml-weights.js` (`npm run ml:train`) |

```bash
npm run ml:generate -- --deals 2000 --lineup mix --out ml/data/r0
npm run ml:train -- --data ml/data/r0 --name r0 --ship
```

Every seat's discards are recorded, whatever strategy it plays, with how the hand ended for that seat. Data goes to `ml/data/` (not committed).

## Competition

```bash
npm run compete -- --deals 1000
```

Strategies play each other over many deals. Each deal is played four times, with the lineup moved one seat each time, so every strategy plays every seat with the same tiles and luck mostly cancels out. The deals are split across worker threads (one per CPU core, less one).

| Option | Default | |
| --- | --- | --- |
| `--lineup a,b,c,d` | `jorge-yau,lucky-cat,jorge-yau,lucky-cat` | Strategy per seat |
| `--deals N` | 250 | Deals; each is played 4 times |
| `--seed N` | 1 | First deal's seed. The same seed plays the same deals |
| `--workers N` | CPU cores − 1 | Worker threads |
| `--json FILE` | | Also save the full report |
| `--list` | | List the strategies |

It reports, for each strategy:

- **Points per hand** and net points, on the full-spicy payout table. This is the number to compare.
- **Wins**, split into self-draws, wins off a discard, robbed kongs and flower wins.
- **Dealt in**: how often it threw the winning tile, and the points it paid for that. Also the points it paid when someone else self-drew.
- **Average faan** and average points of a win, the biggest win, and limit hands.
- **Concealed wins**, the average turn of a win, and chows, pungs and kongs per hand.
- **Net points against** each other strategy, the patterns most common in its wins, and, for jorge-yau, how often it opened on each target.

Points per hand are noisy: one limit hand on a self-draw moves 24,576 points. At 1,000 deals (4,000 hands) a difference under about 15 points per hand is within the noise. Win and deal-in rates settle much sooner. The library is `js/mahjong-competition.js` (`runMatch`, `mergeReports`, `formatReport`) if you want to script your own comparisons.

## Earlier results

These predate the 0.38.0 merge of no-defense into jorge-yau and include dishonor, a strategy that has since been removed. At version 0.19.0, one of each strategy sat at the table for 24,000 hands: 1,000 deals in each of the 6 seating orders, each deal played once per seat rotation. 49.7% of hands had no winner.

| | only-orphans | jorge-yau | lucky-cat | dishonor |
| --- | ---: | ---: | ---: | ---: |
| Points per hand | 41.3 (± 17.0) | 29.7 (± 15.4) | -26.9 (± 11.6) | -44.0 (± 10.0) |
| Wins | 1.7% | 10.6% | 22.4% | 15.6% |
| Wins by own turn 10 | 0.1% | 1.9% | 4.0% | 2.7% |
| Share of wins by self-draw | 25.4% | 41.0% | 48.3% | 53.8% |
| Dealt in | 5.2% | 7.3% | 5.1% | 8.6% |
| Deal-ins per win | 2.99 | 0.69 | 0.23 | 0.55 |
| Average faan of a win | 8.78 | 5.76 | 4.27 | 4.90 |
| Average points of a win | 5,479 | 885 | 206 | 272 |
| Limit hands | 178 | 89 | 47 | 0 |

The ± is a 95% range that treats hands as independent. only-orphans and jorge-yau are too close to separate on points, and so are lucky-cat and dishonor, but the first pair is clearly ahead of the second. only-orphans ranged from 13 to 85 points a hand across seating orders, so limit hands drive its result.

To play one seating order:

```bash
npm run compete -- --lineup jorge-yau,jorge-yau,lucky-cat,only-orphans --deals 1000 --seed 200000
```

