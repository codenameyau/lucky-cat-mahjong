# Lucky Cat: handoff for the futures rounds

Written 2026-11-08 for the machine that takes over Lucky Cat's training. Start from `master` (0.57.8). The shipped models are Lucky Cat lc32 and Neural Cat NC8 (N10c).

## The goal

**Keep Lucky Cat's win rate and score more points.** lc32 wins about 23% of hands head to head and about 29% against lc20, at 15.6 discards a win. But its wins are small (4 to 5 faan, about 150 to 170 points) and it deals in on about 17.6% of hands. At the game's table (one seat against two Neural Cats and Jorge Yau), a Neural Cat win is worth about 1,800 points. So one deal-in to a big hand costs about ten of Lucky Cat's wins. Most of the points to gain are in **dealing in less to big hands**, not in going for bigger hands itself.

## Why it plays this way

lc20 to lc32 learned by imitating the moves of hands it won, the quicker the win the more, with only 8% more weight for each faan above 3. lc31 and lc32 also trained down moves that dealt in. It has never been taught what a single move costs when someone else wins big.

## What's been tried (details in [lucky-cat.md](../docs/strategies/lucky-cat.md) and [iterations.md](../docs/machine-learning/iterations.md))

| Models | Idea | Result |
| --- | --- | --- |
| LP (from LC20) | Points first, every move credited with its hand's points (`awr`) | LP2b +4.0 ± 2.3 points a hand over LC20 at the same win rate. It never shipped, because it started from LC20 |
| LP (from lc32) | Points first, head to head | Beat lc32 head to head, but not at the game's table |
| LT | Points first, at the game's table | Nothing held. A whole hand's points are mostly luck, and the critic explained under 1% of them |
| LR | Replays: each move's next-best options replayed on the same wall | Nothing held. On a known wall, a move is judged by tiles the player can't see |
| **LF** | **Replays on 4 reshuffled futures of the wall still to be drawn, every move on the same 4** | **Built (commits `55c1c04`, `1442300`), not run yet. This handoff** |

## How the LF rounds work

- **Data (`lucky.js generate --rollouts 2 --alts 2 --futures 4`):** lc32 plays its best in one seat at the game's table: Neural Cat, Jorge Yau, Neural Cat (`LC_TABLE`). At up to 2 of its choices a hand (3 in bold mode), the wall still to be drawn is shuffled 4 ways. Its move and its 2 next-best moves each play those same 4 futures, and each move's mean points are recorded. That mean is what the move is worth from what the player could know. Round size: 20,000 deals, into `ml/data/lcfut-<n>`.
- **Training (`ml/train_lucky.py --mode q`):** the target is the champion's shares times exp(advantage / tau). The arms are `q`, `q-2`, `q-all`, `q-soft` (tau 200), `q-sharp` (tau 50), and bold `q-bold`.
- **Judge (`lucky.js eval --table ...`):** candidate and champion each take every seat in turn on the same deals. Candidates are screened on 15,000 deals, then the best two play 40,000. One is kept only if its points a hand beat lc32's by the **full** paired margin (about two standard errors) and J = points + 0.5 × wins is ahead.
- **Names:** models `LF<round><letter>`, shipped as LC33, LC34, ... State and log: `ml/lab-lucky-cat/`.

## Commands

Set up Python once (`python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt`, or `ml\setup-windows.ps1` on Windows with an NVIDIA GPU). Then:

```bash
# A small check first: it runs every step on a few deals and ships nothing (not timed yet).
npm run ml:lab -- --strategy lucky-cat --rounds 1 --deals 500 --quick-deals 500 --full-deals 1000 --dry --dir ml/lab-lucky-cat-check

# The real rounds. They start from lc32 (the shipped weights). A stopped lab picks up where it left off.
npm run ml:lab -- --strategy lucky-cat --rounds 10 --workers <cores - 1>

# Where it stands: the champion and every arm's results.
npm run ml:lab -- --strategy lucky-cat report

# Replay a champion on fresh deals before trusting it.
npm run ml:lab -- --strategy lucky-cat bench --model ml/models/<name>.json --against lc32,jorge-yau --deals 20000
```

One round is about 20,000 replayed deals plus six training arms and 15,000 + 40,000 judging deals: plan on an hour or more on 8 cores. On a new machine there is no `ml/lucky/` league state and no `ml/models/lc*.json`, so the lab starts from the shipped weights with no earlier selves. That is how it's meant to run (the table has no earlier selves since lc32).

## What to check each round (keep the win rate)

The keep rule is points first. A candidate can lose a point or two of win rate and still be kept if its points go up. The goal here is to keep the win rate, so **before shipping, check that the champion's hands won are no lower than lc32's by more than one standard error (about ±0.4 points of win rate on 40,000 deals).** Hand by hand, also look at:

- **Deal-ins:** this is where the points should come from. Expect them to fall first.
- **Average win and faan a win:** a rise means it learned bigger hands too.
- **Discards per win:** it should stay near 15.6. If it climbs, it is getting slower.

## When a model ships

The lab writes `js/mahjong-lucky-cat-weights.js` and uploads the model to the Hugging Face model repo's `lucky-cat/` folder (`--no-upload` skips that). **Never upload training data** (`ml:hf-data`) unless the maintainer asks. Then, by hand, in one PR:

1. Bump the game version in all four places: `GAME_VERSION` (`js/mahjong-engine.js`), `VERSION` (twice, `js/offline-cache.js`) and the assertion in `js/mahjong-strategies.test.js`.
2. Document the iteration in `docs/strategies/lucky-cat.md` (a row in the lab table, and what the bot now does differently) and `docs/machine-learning/iterations.md` (the thinking: what was tried, what held and why).
3. Update Lucky Cat's summary in `js/mahjong-strategies.js` if how it plays has changed.
4. Run `npm test` until it passes.
5. Delete training data no model uses. Keep the weights, docs and reports.

Keep adding milestones to the same PR as commits until it's merged.

## If LF stalls (two or three rounds with nothing kept)

Write the critique in `iterations.md` first, then try, in this order:

1. **A critic that sees every tile (training only).** The LP and LT rounds failed because the critic explained under 1% of a hand's points: it saw only what the seat sees, so its baseline was close to the average. A value network that also reads every concealed hand and the wall would explain much more of the luck. Subtract it from each move's points, and what's left is closer to the move's own worth. The policy (the shipped network) still reads only its seat. `js/mahjong-fair-play.test.js` must still pass, since the critic is never shipped. This is the asymmetric actor-critic: the critic gets privileged information, the actor does not.
2. **More futures, fewer choices.** 8 futures at 1 choice a hand halves the futures' noise for the same cost.
3. **A deal-in weight in the target.** Weight replayed moves that avoided a deal-in to a hand of 6 faan or more above the rest.
4. **More weight for bigger wins** in the imitation rounds: from 8% a faan above 3 to about 25 to 30%. LP2b suggests this gains a few points a hand at most.

Don't give the playing network itself hidden tiles. The LR rounds showed what happens: a policy that learns from tiles it can't see learns luck.
