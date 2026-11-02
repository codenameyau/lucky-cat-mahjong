# Bot strategies

Every bot at the Play Mahjong table plays a named strategy, and the coach follows one too. The **Strategies** button in the top bar describes each strategy and assigns them: one per bot seat, and one for the coach's tips and feedback.

| Strategy | File | Playbook |
| --- | --- | --- |
| (shared foundation) | `js/mahjong-bot.js` | the rules below |
| `lucky-cat` | `js/mahjong-lucky-cat.js` | [lucky-cat.md](lucky-cat.md) |
| `jorge-yau` | `js/mahjong-jorge-yau.js` | [jorge-yau.md](jorge-yau.md) |

## Which strategy plays where

- Picks are saved in `localStorage` under `lcm-play-strategies`, as `{ "seats": { "1": id, "2": id, "3": id }, "coach": id }`. Seat 1 is on your right, 2 across, 3 on your left.
- A bot seat with nothing saved plays a random strategy, picked again each game. "Random each game" in the sheet clears the saved pick.
- The coach (tips and feedback) defaults to `jorge-yau`.
- A change takes effect on the bot's next move, in the game you're playing.
- Each bot's name on the table shows its strategy: "Mei · Lucky Cat".

## Adding a strategy

All strategies are built on the shared foundation in `js/mahjong-bot.js` (`MahjongBot`): shanten, live tiles, the exact score of every wait, the threat model, the claim options, and the principles every bot follows:

- **One suit.** After a chow, keep that suit and the honors: every tile of another suit goes first, even while folding. With 7 or more tiles of one suit (sets count, and more than any other suit), the other suits go first the same way. Hands that need their tiles from every suit or a fixed shape (Seven Pairs, Thirteen Orphans, Nine Gates, All Terminals, All Honors, Four Winds) keep their own order.
- **Concealed Straights throws honors first**, ahead of any number tile, while it's the hand in the lead, keeping only one honor pair as the hand's pair (while folding, safety decides). An honor pair costs the All Sequences faan, so the hand is weighed with one less.
- **Keep pairs and unseen dragons**, and throw a tile someone has punged when the hand doesn't need it. Keeping them never costs a step toward ready.
- **Claims.** Seven Pairs, Thirteen Orphans, Nine Gates and Concealed Straights claim nothing (Concealed Straights still pungs a dragon or scoring wind). A dragon or scoring wind is always punged otherwise, unless that breaks a ready hand. A chow must get the hand closer to ready and still be able to reach 3 faan.

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
    // also: readyValue, threats, waitChance, extraLoss, defense
  },
  tuning: { defenseScale: 1.5 },
});
```

Every hook is optional. A strategy with none plays the shared foundation alone: the usual hands (standard, Concealed Straights, the flushes, All Triplets), no Seven Pairs, Thirteen Orphans or Nine Gates, and any chow the shared rule allows. jorge-yau (`js/mahjong-jorge-yau.js`) is a short example: it adds the special hands and its chow timing. The hooks are listed in section 9 of `js/mahjong-bot.js`. Each strategy keeps its own copy of the tuning knobs (`bot.setTuning`), so changing one never changes another.

Then:

1. Load its script in `play-mahjong/index.html` after `mahjong-bot.js` and before `mahjong-strategies.js`.
2. Add an entry to `STRATEGIES` in `js/mahjong-strategies.js` with its `id`, `name`, `bot`, a one-line `summary` and a few `details` paragraphs for the Strategies sheet.
3. Write its playbook here.
4. Play it against the others (below).

The coach speaks for any strategy through `MahjongCoach.forStrategy(bot)`. It names the plan the strategy picked, using `plan.label`, and for a tile the plan doesn't use it gives `plan.reason`.

## Competition

```bash
npm run compete -- --deals 1000
```

Strategies play each other over many deals. Each deal is played four times, with the lineup moved one seat each time, so every strategy plays every seat with the same tiles and luck mostly cancels out. The deals are split across worker threads (one per CPU core, less one).

| Option | Default | |
| --- | --- | --- |
| `--lineup a,b,c,d` | `lucky-cat,jorge-yau,lucky-cat,jorge-yau` | Strategy per seat |
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
- **Net points against** each other strategy, the patterns most common in its wins, and, for lucky-cat, how often it opened on each target.

Points per hand are noisy: one limit hand on a self-draw moves 24,576 points. At 1,000 deals (4,000 hands) a difference under about 15 points per hand is within the noise. Win and deal-in rates settle much sooner. The library is `js/mahjong-competition.js` (`runMatch`, `mergeReports`, `formatReport`) if you want to script your own comparisons.
