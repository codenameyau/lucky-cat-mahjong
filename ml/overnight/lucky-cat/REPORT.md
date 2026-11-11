# Lucky Cat overnight: own-lineage table

## Status

*Updated 2026-11-11 00:45 local.*

- **Generation 1 (G1) = LO1b**, by the orchestrator's Pareto rule. On 80,000 fresh exact-build deals against lc32: hands won **+0.23 ± 0.07** (3.3 SE), points +0.1 ± 1.4, deal-ins 16.72% vs 16.69%. It is not a points milestone, so it is not a ship candidate. Lineage champion and data-maker: `ml/models/LO1b.json`. Table pool: G1, lc32, lc31, lc30.
- **Rounds done:** 1. **Round 2 is running** (data from G1, 7 arms). Recipe changes from round 1:
  - Successive halving: 4 replays for each option, then 4 more only for options within 150 points of the best.
  - One random extra legal move added to each choice's replayed set.
  - Win bonus 0 or 150.
  - A variance-aware target: advantage over its CRN SE.
  - Noise then fine-tune (sigma 0.02).
  - The head is on: policy iteration.
  - Confirmations use 160,000 deals when the screen gap is under 4.
- **New rule in the loop:** a generation is a Pareto step on fresh exact deals. One of points or hands won is up 2 SE, the other is not down more than 1 SE, and deal-ins are not up more than 1 SE (paired per-deal deal-ins are now dumped). Points up 2 SE is flagged as a milestone.
- **Next (built and tested on a tiny round, starts at round 3):** truncated replays scored by a value.
  - Each round trains a fresh value (`ml/train.py`, 416 seat-view features, 28 outcome heads) on 20,000 of the head's own games.
  - A replay then stops at the seat's 3rd own move and scores the position by the value.
  - Measured on 100 deals: the same data in 19.5 s against 44.4 s for full replays (2.3x at truncate 4), with 80% of replays truncated.
- **Speed:** data 1.8x information a second from CRN, about 2.3x more from truncation (to be measured at scale); training 31x (one process); screens play the champion once per deck. Details below.
- **Blockers:** none.

## Bars

- **Generation (in-lineage):** on fresh exact paired deals against the lineage's current champion, points a hand or hands won is up 2 SE, the other is not down more than 1 SE, and deal-ins are not up more than 1 SE.
- **Points milestone:** a generation whose points are up 2 SE.
- **Ship candidate (orchestrator, 2026-11-11):** against lc32 itself, on two fresh exact runs pooled (never screen deals), points up 3 SE and hands won not down more than 1 SE. The loop runs this check for every generation with a points milestone (`shipCheck` in `lc-own-loop.js`).

So far: **G1 (LO1b)** met the generation bar on hands won (+0.23 ± 0.07 against lc32). It did not reach a points milestone or the ship bar.

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

## Structural arms (from the maintainer's list)

Built into `ml/lc_own_train.py` as arm options:
- `gradClip`: global-norm clipping, with pre-clip gradient norms logged (median, 99th percentile, max).
- `ema`: weight averaging; the averaged weights are evaluated and exported.
- `warmup` and `cosine`: learning-rate schedule.
- `gradNoise`: Gaussian gradient noise, annealed to 0.
- `teacher`: a residual + LayerNorm teacher (pre-norm blocks, Kaiming init), distilled into the shipped shape with `alpha`.

Every arm now logs held-out cross-entropy against the same fixed target: init's shares tilted by the replays.

**Offline check** (data own-1 + own-2, 249,317 choices, from G1, tau 30, win bonus 150, 4 epochs; held-out CE; init's CE on this target is 1.41530):

| Arm | Held-out CE | KL from init | Note |
| --- | ---: | ---: | --- |
| control | 1.40664 | 0.0139 | grad norm median 0.149, p99 0.174, max 0.177 |
| + gradClip 0.5 | 1.40664 | 0.0139 | never bites: 0.0% of steps clipped |
| + ema 0.999 | 1.40743 | 0.0030 | a smaller step |
| + gradNoise 0.01 | 1.40657 | 0.0139 | |
| teacher 768 x 4, from scratch, 12 epochs | 1.448 at epoch 4, then 1.590 | | overfits; worse than the champion it would replace |
| student distilled from that teacher (alpha 0.5) | 1.40919 | 0.0170 | worse than the control |
| LO1d retry: lr 1e-3, tau 300, refreshed reference, 8 epochs, warm-up 5%, cosine, clip 0.5, ema | 1.405 (its own target; init 1.386) | 0.031 | clip never bites (p99 0.073) |

**Reading.**
- **Clipping does nothing here.** The loss is a cross-entropy to a softmax target, so the advantage is bounded inside the target. The gradient's 99th percentile (0.17) is a third of the smallest cap. I'm dropping clipping.
- **The teacher is no evidence of a capacity limit.** Trained from scratch on 250,000 choices, it overfits and never reaches the champion-shaped network's held-out loss. So more capacity isn't the bottleneck at this data size. I won't spend more on B6 for the policy unless far more data accumulates.
- **What goes to play.** EMA, warm-up for the big step, and gradient noise go to round 3 as play arms next to a control, because their effects are small offline.
