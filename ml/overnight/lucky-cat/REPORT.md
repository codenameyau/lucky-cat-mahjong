# Lucky Cat overnight: own-lineage table

## Status

- **Champion:** lc32 (`ml/models/lc32.json`, the shipped `js/mahjong-lucky-cat-weights.js`). Nothing has beaten it yet.
- **Rounds done:** 0.
- **Last result:** none yet.
- **Doing now:** read the docs and code. Next: measure the baseline pipeline (data, training, screens at 10 workers), then build the faster loop.
- **Blockers:** none.

## Setup

- Table: only older Lucky Cat generations. lc20 to lc32 come from the git history of `js/mahjong-lucky-cat-weights.js` (`ml/models/lc20.json` to `lc32.json`). lc20 to lc29 are 256-128 networks; lc30 to lc32 are 512-256.
- Judging: candidate and lc32 each play every seat of the same deals at the same three-seat table of older generations (`lcm-sim play`, paired deal by deal). Points a hand, hands won, deal-ins and average win are reported for both.
- Bar (from the brief): +2 SE in points on 40,000+ fresh paired deals, on the exact build, and hands won not more than 1 SE lower. Seeds come from a counter and are never reused.
