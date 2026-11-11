# Lucky Cat overnight: own-lineage table

## Status

*Updated 2026-11-11 03:25 local.* Rounds done: 4.

- **Champion: G3 = LO4h** (`ml/models/LO4h.json`, variance-aware target: vnorm 1, bonus 150, trained from G2). Against G2 on 160,000 fresh exact deals: points **+1.4 ± 0.8**, hands won **+0.22 ± 0.04 (5.5 SE)**, deal-ins −0.05 ± 0.04, average win 306 vs 304. It meets the generation bar on hands won, but not the points milestone (1.75 SE). Its ship check against lc32 isn't run yet.
- **G2 = LO2a** (`ml/models/LO2a.json`), the lineage's first points gain. Against G1 on 160,000 fresh exact deals: **+2.2 ± 0.9 points a hand (2.4 SE)**, hands won +0.07 ± 0.05, deal-ins level (−0.00 ± 0.05), average win 301 vs 295. It meets the generation bar and the points milestone. Fair-play shuffle check (`scripts/ml/fair-play.js`): **pass**.
- **G1 = LO1b:** hands won +0.23 ± 0.07 against lc32 (generation bar only).
- **SHIP CANDIDATE: G2 against lc32**, on two fresh exact runs of 80,000 deals each (seeds 801,264,000 and 801,344,000), pooled to 160,000 deals: **+5.9 ± 1.1 points a hand (5.5 SE)**, hands won **+0.35 ± 0.05** (22.1% vs 21.8%), deal-ins level (+0.00 ± 0.06), average win about 310 vs 289. The two runs alone: +6.3 ± 1.5 and +5.5 ± 1.5 points. It clears the 3 SE ship bar, and fair play passes.
- **Running now:**
  - **Round 5** (full CRN replays, data from G3). Round 4 kept nothing; its arms were: a control (tau 30, bonus 150), bonus 75, bonus 225, EMA, the LO1d retry (lr 1e-3, warm-up, cosine, EMA), gradient noise with two seeds, and the variance-aware target.
- **Table pool:** G3, G2, G1, lc32.
- **Blockers:** none.

## Bars

- **Generation (in-lineage):** on fresh exact paired deals against the lineage's current champion, points a hand or hands won is up 2 SE, the other is not down more than 1 SE, and deal-ins are not up more than 1 SE.
- **Points milestone:** a generation whose points are up 2 SE.
- **Ship candidate (orchestrator, 2026-11-11):** against lc32 itself, on two fresh exact runs pooled (never screen deals), points up 3 SE and hands won not down more than 1 SE. The loop runs this check for every generation with a points milestone (`shipCheck` in `lc-own-loop.js`).

So far: **G1 (LO1b)** met the generation bar on hands won (+0.23 ± 0.07 against lc32), with no points milestone. **G2 (LO2a)** met the generation bar and the points milestone against G1 (+2.2 ± 0.9). It also met the **ship bar** against lc32: +5.9 ± 1.1 points (5.5 SE) and +0.35 ± 0.05 hands won, on 160,000 pooled fresh exact deals.

## Setup

- Table: only older Lucky Cat generations. lc20 to lc32 come from the git history of `js/mahjong-lucky-cat-weights.js` (`ml/models/lc20.json` to `lc32.json`). lc20 to lc29 are 256-128 networks; lc30 to lc32 are 512-256.
- Judging: candidate and lc32 each play every seat of the same deals at the same three-seat table of older generations (`lcm-sim play`, paired deal by deal). Points a hand, hands won, deal-ins and average win are reported for both.
- Bar (from the brief): +2 SE in points on 40,000+ fresh paired deals, on the exact build, and hands won not more than 1 SE lower. Seeds come from a counter and are never reused.

## Speed: before and after (10 workers, machine shared with two other agents)

"Before" is the pre-existing pipeline: `lucky-value.js` data (independent replays, 12 per option, option share 0.1), one `train_lucky.py --mode q` process per arm, and `h2h.js` screens that play both models for every arm. Each stage was measured here, then scaled to the same statistical power as round 2.

| Stage (round 2's size) | Before | After | Speed-up | How |
| --- | ---: | ---: | ---: | --- |
| Data at equal information | about 1,820 s (98.5 groups/s, 0.167 information per group) | 1,020 s (122 groups/s, 0.24 per group) | 1.8x | CRN: 2.37x less noise in the options' differences (measured with two salts); share 0.5 |
| Data, value-truncated replays (round 3) | | 368 s | 2.8x more on top | **turned off**: it hurt play |
| Training, 8 arms | about 416 s (52 s per arm, measured) | 27 to 38 s | 11x to 15x | one process, data on the GPU once |
| Screen, 7 arms | about 1,560 s (640,000 deal-models) | 975 s (400,000) | 1.6x | champion played once per deck, cache, pruning at 1 SE |
| Confirmation, 160,000 deals | 1,051 s | 1,051 s | 1x | (statistical: can't be cut) |
| **Round, end to end** | **about 4,850 s** | **about 3,080 s** | **1.6x** | |

**This is not the 10x asked for.** Two stages set the floor:
- **Confirmation.** It needs 160,000 deals for an SE of about 1 point.
- **The replays in the data.** Every option is played to the end of the hand, eight times.

The one 10x-class lever, value-truncated replays, made the data 2.8x faster but taught worse play (round 3). Remaining ideas:
- A much better value at the truncation point.
- Fewer, better-chosen arms: the screen's cost grows with the number of arms.
- Reusing a round's data across rounds while the head stays put.

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

### Round 2 (champion G1 = LO1b; data own-2: 24,000 deals, G1 exploring, CRN, halving 4+4, one random extra option, 124,801 choices; trained on own-1 + own-2)

Screened against G1 in three stages (8,000, then 24,000, then 48,000 fresh deals; dropped at 1 SE behind in points or hands won).

| Arm | Recipe | Points | Hands won | Deal-ins | Avg win | Deals |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| LO2a | tau 30, bonus 150 | +3.8 ± 1.3 | +0.11 ± 0.07 | +0.01 ± 0.07 | 298 vs 288 | 80,000 |
| LO2b | tau 30, bonus 0 | +6.2 ± 2.0 | −0.30 ± 0.10 | −0.01 ± 0.11 | 310 vs 286 | 32,000 (dropped on wins) |
| LO2c | tau 30, bonus 150, refreshed reference | +4.1 ± 4.8 | −0.46 ± 0.25 | +0.12 ± 0.25 | 302 vs 284 | 8,000 (dropped) |
| LO2d | vnorm 1, bonus 150 | +2.0 ± 1.1 | +0.16 ± 0.06 | −0.05 ± 0.06 | 294 vs 288 | 80,000 |
| LO2e | vnorm 2, bonus 0 | +1.8 ± 3.8 | −0.29 ± 0.19 | +0.16 ± 0.20 | 299 vs 284 | 8,000 (dropped) |
| LO2f | tau 30, bonus 300, seed 2 | +1.4 ± 1.3 | +0.28 ± 0.07 | +0.05 ± 0.07 | 289 vs 288 | 80,000 |
| LO2g | noise 0.02, then tau 30, bonus 150 | +5.5 ± 2.0 | −0.12 ± 0.11 | −0.14 ± 0.11 | 303 vs 286 | 32,000 (dropped) |

**Confirmation (LO2a against G1, 160,000 fresh deals, exact build):** **+2.2 ± 0.9 points a hand**, hands won 22.18% vs 22.11% (+0.07 ± 0.05), deal-ins 16.77% vs 16.77%, average win 301 vs 295. **Generation 2, points milestone.** Fair play: pass.

Times: data 1,184 s (halving and the extra option made it slower than round 1's 1,020 s), training 27 s for 7 arms, screen 975 s (400,000 deal-models), confirmation 1,051 s.

**Reading.**
- **The win bonus sets the trade.** At 300 the arm gains hands won (+0.28) but no points. At 0 it gains points but loses hands won. At 150 it gains both, which is the Pareto step.
- **The screen's points were inflated again.** LO2a screened at +3.8 and confirmed at +2.2, the same direction as round 1.
- **Halving with a fifth option slowed the data down.** Both are off from round 3.

### Round 3 (champion G2 = LO2a; data own-3: 24,000 deals, G2 exploring, replays truncated at the seat's 3rd own move and scored by a fresh value)

The value LOV3 was trained on 476,602 of G2's positions (25 s for data and training). Its expected points correlate with the hand's real points at r = 0.12, and its best epoch was 3. Data took **368 s, against 1,020 s for full replays (2.8x faster)**, with about 84% of replays truncated. Training: 8 arms in 38 s on own-2 + own-3.

| Arm | Recipe | Held-out CE (init) | Points | Hands won | Deal-ins | Avg win | Deals |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| LO3a | control: tau 30, bonus 150 | 1.3790 (1.3772) | −9.1 ± 4.1 | +0.16 ± 0.21 | +0.61 ± 0.21 | 297 vs 323 | 8,000 |
| LO3b | bonus 75 | 1.3798 (1.3782) | −7.8 ± 4.2 | +0.05 ± 0.20 | +0.41 ± 0.21 | 305 vs 323 | 8,000 |
| LO3c | bonus 225 | 1.3807 (1.3786) | −8.8 ± 4.1 | +0.28 ± 0.21 | +0.55 ± 0.21 | 286 vs 323 | 8,000 |
| LO3d | control + EMA | 1.3757 (1.3772) | −3.7 ± 2.7 | +0.24 ± 0.15 | +0.26 ± 0.15 | 306 vs 323 | 8,000 |
| LO3e | lr 1e-3, warm-up, cosine, EMA, tau 300, refreshed reference | 1.3869 (1.3749) | +3.4 ± 2.1 | −0.13 ± 0.11 | +0.08 ± 0.11 | 314 vs 300 | 32,000 (dropped on wins) |
| LO3f | control + grad noise, seed 1 | 1.3790 (1.3772) | −9.1 ± 4.3 | +0.18 ± 0.20 | +0.58 ± 0.21 | 295 vs 323 | 8,000 |
| LO3g | control + grad noise, seed 2 | 1.3803 (1.3789) | +1.3 ± 1.2 | −0.04 ± 0.06 | **+0.29 ± 0.07** | 304 vs 296 | 80,000 |
| LO3h | vnorm 1, bonus 150 | 1.3445 (1.3461) | −5.4 ± 3.4 | +0.15 ± 0.18 | +0.34 ± 0.18 | 299 vs 323 | 8,000 |

Nothing passed. The head stayed at G2, and there was no confirmation.

**Critique: the value-scored truncated replays hurt, so they are off for round 4.**
- **Every arm dealt in more**, by 0.3 to 0.6 points (the one that went the distance: +0.29 ± 0.07, 4 SE), and won smaller hands.
- **The value can't see what the full replay saw.** A replay that stops three moves in is scored by a value that explains about 1.4% of a hand's points (r = 0.12). That value can't tell a safe hand from one walking into a deal-in, or a hand building toward a big win. So the options it prefers are the ones that look good now and cost later.
- **The 2.8x faster data was worth less than full replays.** With full CRN replays (rounds 1 and 2) every q arm moved the right way.
- **Changes for round 4:** full CRN replays again, and own-3 left out of training. Round 4 retries the same structural arms, since round 3 couldn't judge them. To make truncation work, the value would need to be far better at the truncation point (the hidden tiles as training targets, or bootstrapping from full replays). That isn't tried yet.

### Round 4 (champion G2; data own-4: 24,000 deals, G2 exploring, full CRN replays, 124,763 choices in 1,099 s; trained on own-2 + own-4 in 38 s)

| Arm | Recipe | Points | Hands won | Deal-ins | Avg win | Deals |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| LO4a | control: tau 30, bonus 150 | +0.7 ± 1.3 | −0.11 ± 0.07 | +0.17 ± 0.07 | 310 vs 303 | 80,000 (dropped) |
| LO4b | bonus 75 | +3.2 ± 2.2 | −0.26 ± 0.11 | +0.26 ± 0.11 | 323 vs 312 | 32,000 (dropped) |
| LO4c | bonus 225 | +1.4 ± 1.3 | +0.02 ± 0.07 | +0.16 ± 0.07 | 306 vs 303 | 80,000 |
| LO4d | control + EMA | −0.2 ± 1.0 | −0.08 ± 0.05 | +0.10 ± 0.05 | 303 vs 303 | 80,000 (dropped) |
| LO4e | lr 1e-3 + warm-up + cosine + EMA | +1.2 ± 4.7 | −0.44 ± 0.23 | +0.31 ± 0.23 | 323 vs 304 | 8,000 (dropped) |
| LO4f | control + grad noise, seed 1 | +1.0 ± 1.3 | −0.08 ± 0.07 | +0.16 ± 0.07 | 309 vs 303 | 80,000 (dropped) |
| LO4g | control + grad noise, seed 2 | −0.2 ± 1.3 | −0.11 ± 0.07 | +0.20 ± 0.07 | 307 vs 303 | 80,000 (dropped) |
| LO4h | vnorm 1, bonus 150 | +0.3 ± 1.1 | **+0.19 ± 0.06** | +0.06 ± 0.06 | 301 vs 303 | 80,000 |

**The loop's advance rule picked LO4c** (points +1.4 > 1 SE, hands won level), so it was confirmed against G2 on 160,000 fresh exact deals: **−1.3 ± 0.9 points**, hands won −0.02 ± 0.05, deal-ins +0.08 ± 0.05. Not a generation.

**Reading.**
- **The gains shrink after two generations.** The control recipe that made G2 is now level: KL 0.007 a step, so each step is small.
- **The structural arms helped nothing in play, two rounds running.** EMA, gradient noise (two seeds each round) and the large warm-up step all came out level or worse. They are dropped from round 5.
- **The variance-aware arm (vnorm) is the one Pareto-shaped result:** hands won +0.19 ± 0.06 (3.2 SE) with points level and deal-ins level.
- **The advance rule ignored deal-ins and ranked by points alone, so it chose LO4c,** which deals in more (+0.16 ± 0.07). It is fixed for round 5:
  - an arm advances on a Pareto-shaped screen result (points up 1 SE with hands won not down, or hands won up 2 SE with points not down), with deal-ins not up more than 1 SE;
  - arms are ranked by the sum of the two z-scores;
  - a failed confirmation sends the head back to the champion.
- **What happens now:** LO4h is being confirmed on 160,000 fresh exact deals against G2 (`--confirm`). Then round 5 runs: two seeds of the control, tau 20, 6 epochs, two seeds of vnorm, and vnorm 1.5 with bonus 100, trained on three rounds of data.

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
