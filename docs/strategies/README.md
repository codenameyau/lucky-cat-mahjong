# Bot strategies

Every bot at the Play Mahjong table plays a named strategy, and the coach follows one too. The **Strategies** button in the top bar describes each strategy and assigns them: one per bot seat, and one for the coach's tips and feedback.

| Strategy | Name | File | Playbook |
| --- | --- | --- | --- |
| (shared foundation) | | `js/mahjong-bot.js` | the rules below |
| `lucky-cat` | Lucky Cat | `js/mahjong-lucky-cat.js` | [lucky-cat.md](lucky-cat.md) |
| `jorge-yau` | Jorge Yau | `js/mahjong-jorge-yau.js` | [jorge-yau.md](jorge-yau.md) |
| `only-orphans` | Only Orphans | `js/mahjong-only-orphans.js` | [only-orphans.md](only-orphans.md) |
| `dishonor` | Dishonor | `js/mahjong-dishonor.js` | [dishonor.md](dishonor.md) |

Before version 0.6.0 the two ids were the other way round; saved choices and save files from then are converted when they're read.

## Which strategy plays where

- Picks are saved in `localStorage` under `lcm-play-strategies`, as `{ "seats": { "1": id, "2": id, "3": id }, "coach": id }`. Seat 1 is on your right, 2 across, 3 on your left.
- A bot seat with nothing saved plays a random strategy, picked again each game. "Random each game" in the sheet clears the saved pick.
- The coach (tips and feedback) defaults to `lucky-cat` ("Coach Lucky Cat").
- A change takes effect on the bot's next move, in the game you're playing.
- The table shows only each player's name; which strategy each bot plays is on the Strategies sheet.

## Adding a strategy

All strategies are built on the shared foundation in `js/mahjong-bot.js` (`MahjongBot`): shanten, live tiles, the exact score of every wait, the threat model, the claim options, and the principles every bot follows:

- **Flowers count toward 3 faan.** A hand's flowers and seasons (your own flower and season are 1 faan each, all four of a kind 2, none at all 1) and any dragon or scoring-wind set already shown are faan it's sure of. When those already reach the minimum, or fall one short while every meld is a chow (All Sequences, runs and no honors, can add the last faan off a discard), the hand is a cheap win: a chow doesn't force a flush, an open All Sequences hand is weighed as a plan, and the hand plays for speed.
- **Bigger hands from the same tiles.** A hand of sets also weighs the special hands its tiles can still make: Mixed Orphans (only 1s, 9s and honors, 1 faan on top of All Triplets), All Terminals, All Honors, Small and Big Three Dragons, Small and Big Four Winds, and on Seven Pairs, the pairs in Mixed Orphans, All Honors or All Terminals. While one is within a step of the hand's best shape, its tiles are kept ahead of tiles it can't use, even a pair with fewer copies left than another pair; a tile of it with no copy left to finish it (a single, or a pair when another pair can be the hand's pair) goes early instead. The coach names it ("Mixed Orphans is in reach, so aim for it too: keep your 1s, 9s and honors") and says when a tile goes because none are left. A big hand of only certain tiles (10 faan or more, like All Terminals) can count from up to three steps away, while the wall and its live tiles can still finish it, and a hand not already set on a target or a special hand of its strategy's makes it the hand's target. On a target, or whenever one of these hands is in the lead, a tile of it with no copy left goes first, then the tiles it can't use, even at a step's cost, and its live tiles wait. A hand with too few draws left to fill one drops it, and a ready hand isn't broken for one.
- **One suit.** After a chow (unless flowers make it a cheap win), keep that suit and the honors: every tile of another suit goes first, even while folding. With 7 or more tiles of one suit (sets count, and more than any other suit), the other suits go first the same way. Hands that need their tiles from every suit or a fixed shape (Seven Pairs, Thirteen Orphans, Nine Gates, All Terminals, All Honors, Four Winds) keep their own order.
- **Concealed Straights throws honors first**, ahead of any number tile, while it's the hand in the lead, keeping only one honor pair as the hand's pair and any dragon nobody has shown, unless throwing that dragon leaves the hand ready (while folding, safety decides, except for a lone dragon, which stays unless throwing it leaves the hand ready). An honor pair costs the All Sequences faan, so the hand is weighed with one less.
- **Never throw a lone dragon nobody has shown.** While all three other copies are unseen, it stays, on every hand and even while folding, unless throwing it leaves the hand ready. Once a copy is showing, the usual order applies.
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
    // also: finishChance, finalOrder, kongOk, readyValue, threats, waitChance, extraLoss, defense
  },
  tuning: { defenseScale: 1.5 },
});
```

Every hook is optional. A strategy with none plays the shared foundation alone: the usual hands (standard, Concealed Straights, the flushes, All Triplets), no Seven Pairs, Thirteen Orphans or Nine Gates, and any chow the shared rule allows. lucky-cat (`js/mahjong-lucky-cat.js`) is a short example: it adds the special hands and its chow timing. The hooks are listed in section 9 of `js/mahjong-bot.js`. Each strategy keeps its own copy of the tuning knobs (`bot.setTuning`), so changing one never changes another.

Then:

1. Load its script in `play-mahjong/index.html` after `mahjong-bot.js` and before `mahjong-strategies.js`.
2. Add an entry to `STRATEGIES` in `js/mahjong-strategies.js` with its `id`, `name`, `bot`, a one-line `summary` and a few `details` paragraphs for the Strategies sheet.
3. Write its playbook here.
4. Play it against the others (below).

The coach speaks for any strategy through `MahjongCoach.forStrategy(bot)`. It names the plan the strategy picked, using `plan.label`, and for a tile the plan doesn't use it gives `plan.reason`.

## Reviewing a hand, and teaching the coach

`npm run review` replays a hand from its seed in under a second and shows what the coach said on each of your turns. Tap your wind badge in the game to copy a hand's seed.

| Command | |
| --- | --- |
| `npm run review -- 3764864992-EE` | Every turn, following the coach |
| `npm run review -- 3764864992-EE --moves d1,c1,pung` | Your moves first, then the coach. Tiles are discards, and a claim is passed unless the next move names it (`pung`, `chow`, `kong`, `win`) |
| `npm run review -- 3764864992-EE --moves d1,c1 --turn 3` | That turn's reasoning: every tile's discard group, steps from ready, copies left, score and plan |
| `npm run review -- --save game.json` | The exact hand from a save file, with its moves and the other seats' strategies |
| `npm run review -- 3764864992-EE --find dr --left 3` | Plays the hand many ways to find turns where the coach throws that tile, with the `--moves` to get there |

The seed alone doesn't say what the other seats play, and their claims change who draws what. Use `--lineup a,b,c`, or a save file for an exact hand.

**Giving feedback.** Add `--keep` (tiles it shouldn't throw) or `--drop` (tiles it should have), with a reason:

```bash
npm run review -- 3764864992-EE --moves d1,c1 --turn 3 --keep dr --drop c4 --note "Keep a dragon nobody has shown"
```

That saves the turn to [feedback.json](feedback.json) as an `open` case. A case holds only what that seat could see, so it still reads the same after a change to how the other seats play.

**Learning from it.** The coach and bots don't change themselves. `npm run review -- --check` lists every case and why the coach chose as it did, which is the to-do list for improving the rules in `js/mahjong-bot.js` or a strategy:

- `open`: the coach still chooses otherwise. Tests don't fail on these.
- `NOW PASSES`: a change fixed it. `npm run review -- --check --update` marks it `fixed`.
- `fixed`: `npm test` fails if the coach goes back to its old choice, so what it learned stays learned.

A rule that fixes one case can hurt elsewhere, so measure a bigger change with the competition below.

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

## Results with all four strategies

At version 0.19.0, one of each strategy sat at the table for 24,000 hands: 1,000 deals in each of the 6 seating orders, each deal played once per seat rotation. 49.7% of hands had no winner.

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
npm run compete -- --lineup dishonor,jorge-yau,lucky-cat,only-orphans --deals 1000 --seed 200000
```

