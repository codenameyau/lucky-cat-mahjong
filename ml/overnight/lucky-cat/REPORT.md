# Lucky Cat overnight: own-lineage table

## Status

*Updated 2026-11-11 00:45 local.*

- **Champion:** lc32. Nothing confirmed.
- **Rounds done:** 1. Round 2 (data from lc32, 8 arms) is running in the background with the first loop version. `plan.json` has `stop: true`, so that process exits after round 2.
- **Last result:** round 1's screen winner LO1b (+4.6 ± 1.4 on the 80,000-deal screen) came out at **+0.1 ± 1.4 points a hand** on 80,000 fresh exact-build deals. Its extra hands won held: **+0.23 ± 0.07** (22.45% vs 22.22%). Not kept.
- **Next (code ready, not yet run):** restart the loop with `stop` removed and `advance: screen`. A working "head" then moves to the best screened arm and makes the next round's data (policy iteration), and it is confirmed against lc32 on fresh deals each time it moves. The data also keeps finished shards across a restart now.
- **Speed (10 workers, shared machine):** data 1.8x more information per second (CRN: 2.37x less replay noise; 122 against 98.5 groups a second). Training 9 arms in 15 s in one process, against 52 s per arm with `train_lucky.py` (31x). Screens: the champion is played once per deck (10 model-plays for 9 arms, not 18), with pruning at 1 SE. End to end, a round is about 45 min.
- **Blockers:** none.

## Setup

- Table: only older Lucky Cat generations. lc20 to lc32 come from the git history of `js/mahjong-lucky-cat-weights.js` (`ml/models/lc20.json` to `lc32.json`). lc20 to lc29 are 256-128 networks; lc30 to lc32 are 512-256.
- Judging: candidate and lc32 each play every seat of the same deals at the same three-seat table of older generations (`lcm-sim play`, paired deal by deal). Points a hand, hands won, deal-ins and average win are reported for both.
- Bar (from the brief): +2 SE in points on 40,000+ fresh paired deals, on the exact build, and hands won not more than 1 SE lower. Seeds come from a counter and are never reused.

## Rounds

All screens and confirmations: candidate and champion each in every seat of the same deals, at tables of three older generations drawn from the pool (each three-of-four in turn, blocks of 1,000 deals). ± is one standard error, paired deal by deal. Points are per hand; hands won in percentage points.

### Round 1 (champion lc32; data own-1: 24,000 deals, lc32 exploring, 124,516 choices replayed 8 times with CRN)

Arms: q = lc32's shares tilted by exp(advantage / tau), advantage = replays' mean points + bonus x win share, less the played move's. "self" = the reference refreshed each epoch (bigger steps).

| Arm | Recipe | KL from lc32 | Screen points | Screen hands won | Deal-ins | Avg win | Deals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LO1a | tau 100, bonus 300, 4 ep | 0.017 | +2.4 ± 1.2 | +0.22 ± 0.07 | 16.60 vs 16.60 | 296 vs 290 | 80,000 |
| LO1b | tau 30, bonus 300, 4 ep | 0.052 | +4.6 ± 1.4 | +0.33 ± 0.07 | 16.62 vs 16.60 | 297 vs 290 | 80,000 |
| LO1c | tau 100, self, 6 ep | 0.177 | +4.4 ± 1.5 | +0.30 ± 0.08 | 16.72 vs 16.60 | 299 vs 290 | 80,000 |
| LO1d | tau 300, self, lr 1e-3, 8 ep | 0.202 | −6.4 ± 4.8 | −0.47 ± 0.26 | 16.91 vs 16.39 | 278 vs 286 | 8,000 (dropped) |
| LO1e | tau 100, bonus 1000 | 0.035 | +2.3 ± 1.3 | **+0.47 ± 0.07** | 16.59 vs 16.60 | 290 vs 290 | 80,000 |
| LO1f | tau 50, bonus 0 | 0.022 | +2.9 ± 2.0 | −0.18 ± 0.11 | 16.72 vs 16.62 | 298 vs 287 | 32,000 (dropped on wins) |
| LO1g | noise 0.02, seed 1 | | −0.6 ± 1.0 | −0.08 ± 0.05 | | | 32,000 (dropped) |
| LO1h | noise 0.05, seed 1 | | +0.9 ± 3.2 | −0.24 ± 0.16 | | | 8,000 (dropped) |
| LO1i | noise 0.02, seed 2 | | −0.8 ± 0.6 | −0.01 ± 0.03 | | | 80,000 (dropped) |

**Confirmation (LO1b, 80,000 fresh deals, exact build):** +0.1 ± 1.4 points a hand, hands won 22.45% vs 22.22% (**+0.23 ± 0.07**), deal-ins 16.72% vs 16.69%, average win 288 vs 291. Not kept: the points didn't hold, but the extra hands won did (3.3 SE).

Times: data 1,020 s (made before the loop; cached), training 15 s for 9 arms, screen 1,277 s (560,000 deal-models, 4 hands each), confirmation 469 s.

**Reading.** Every q arm looked 2 to 5 points ahead on the screen, and the best was level on fresh deals. Part of that is the best-of-N bias. Part is structural: all arms are paired against the same champion games, so the champion's luck on that deck moves every arm's gap the same way. The extra hands won (+0.2 to +0.5) hold up.
