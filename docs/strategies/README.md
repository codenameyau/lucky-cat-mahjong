# Bot strategies

Every bot at the Play Mahjong table plays a named strategy, and the coach follows one too. The **Strategies** button in the top bar describes each strategy and assigns them: one per bot seat, and one for the coach's tips and feedback.

| Strategy | File | Playbook |
| --- | --- | --- |
| `lucky-cat` | `js/mahjong-lucky-cat.js` | [lucky-cat.md](lucky-cat.md) |
| `claude-cat` | `js/mahjong-bot.js` | [claude-cat.md](claude-cat.md) |

## Which strategy plays where

- Picks are saved in `localStorage` under `lcm-play-strategies`, as `{ "seats": { "1": id, "2": id, "3": id }, "coach": id }`. Seat 1 is on your right, 2 across, 3 on your left.
- A bot seat with nothing saved plays a random strategy, picked again each game. "Random each game" in the sheet clears the saved pick.
- The coach (tips and feedback) defaults to `lucky-cat`.
- A change takes effect on the bot's next move, in the game you're playing.
- Each bot's name on the table shows its strategy: "Mei · Lucky Cat".

## Adding a strategy

All strategies share the engine in `js/mahjong-bot.js`: shanten, live tiles, the exact score of every wait, the threat model and the claim options. A strategy changes how that engine decides through hooks:

```js
var bot = MahjongBot.createStrategy({
  id: 'my-cat',
  hooks: {
    context: function (ctx, game, seat) { /* add your own reads to ctx */ },
    plans: function (c, ctx) { /* the hands to aim for; MahjongBot.basePlans(c, ctx) is claude-cat's list */ },
    priority: function (game, ctx, counts, candidate, bestShanten) { /* discard group, lower first; null = claude-cat's */ },
    claim: function (found, ctx, game, seat, opts) { /* { type: 'pass' | 'pung' | 'kong' | 'chow', ... }; null = claude-cat's */ },
    // also: readyValue, threats, waitChance, extraLoss, defense
  },
  tuning: { defenseScale: 1.5 },
});
```

Every hook is optional, and a strategy with none plays exactly like claude-cat. The hooks are listed in section 9 of `js/mahjong-bot.js`. Each strategy keeps its own copy of the tuning knobs (`bot.setTuning`), so changing one never changes another.

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
| `--lineup a,b,c,d` | `lucky-cat,claude-cat,lucky-cat,claude-cat` | Strategy per seat |
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
