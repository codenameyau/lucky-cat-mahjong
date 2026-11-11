# Only Orphans overnight: report

## Status

- **Champion:** OS2c1 (the shipped model). Nothing has beaten it on fresh deals yet.
- **Rounds done:** 1 screen round (R0, play settings and weight noise, stopped at 24,000 deals to switch to the shadow build); round 1 running.
- **Last result:** R0 at 24,000 deals: claim margin 100 +1.0 ± 0.5 points a hand (wins level), noise 0.10 −1.5 ± 2.9 (wins +0.17 ± 0.05 pp), win bonus 1000 −0.0 ± 1.6 (wins +0.14 pp), win bonus 600 +1.6 ± 1.9 (wins −0.13 ± 0.03 pp: fails the wins rule).
- **Now:** round 1: 6 networks fine-tuned on 100,000 deals against the older generations (3 recipes x 2 seeds), claim margins 100/150/200, win bonus 1000, noise 0.1 and 0.2 (2 seeds each), screened through `lcm-sim shadow`.
- **Blockers:** none. The machine is shared: simulation runs at about 23 hands a second per worker under load (about 50 when idle).

## The table and the measures

- The evaluation table: three seats of older generations, cycling every 250 deals through (OT11d, OT7c, OT6e), (OT11d, OT5e, OT2d), (OT7c, OT4a, OT1a), (OT11d, OT6e, OL2c). The candidate and OS2c1 each take every seat of the same deals; the gap is read deal by deal.
- At this table most hands are draws (about 90% of recorded positions end in a draw). OS2c1 scores about +5 to +9 points a hand, wins 4.35% of hands, deals in on 1.7%, average win about 3,700 points.
- Standard errors scale with how differently an arm plays: a claim-margin step changes almost no deals (±0.5 points a hand on 24,000 deals), a win-bonus step ±1.6 to ±1.9, weight noise 0.1 ±2.9, OT11d (a different generation) ±6.9 on 8,000 deals (about ±3.1 on 40,000).
- Keep rule (the brief's): ahead by 2 standard errors on 40,000+ fresh paired deals on the exact build, hands won not down by more than 1 standard error.

## Setup

- Worktree `C:\Users\coden\Workspace\lcm-train-oo`, branch `train/only-orphans-overnight`, from master e8be11c.
- The pool of older generations, copied to `ml/models/`: OT11d, OT7c, OT6e, OT5e, OT4a, OT2d, OT1a, OL2c. Distinct networks among them: OT7c = OT11d's weights (OT11d plays win bonus 800), OT4a = OT5e = OT6e (win bonus 300, 450, 500), OT1a = OT2d (claim margin 0, 50), OL2c. OS2c1 is OT11d fine-tuned.
- Tools: `scripts/ml/oo-night.js` (screens, confirmations, mutations, settings, the rows cache), `scripts/ml/oo-round.js` (a round). State, logs and cached rows in `ml/oo-night/` (gitignored).
- Limits: 10 simulation workers, one GPU job at a time.

## Speed

| Stage | Before (the frontier-model.js method, master's build) | After | How |
| --- | --- | --- | --- |
| Simulator, all-Only-Orphans table, one core | 39 hands/s (loaded machine) | 52 hands/s | `groupShanten` reuses its buffer; `finishOdds` keeps triplets / seven pairs / orphans shanten as counts (O(1) a tile). Exact: parity holds |
| A screen's champion side | played again for every arm (8 hands a deal an arm) | played once a deck (4 hands a deal an arm, plus 4 shared) | per-deal rows (`lcm-sim play --rows`) cached by model, table, deals, build, binary |
| Arms that rarely play differently (settings) | every hand played | only hands where the arm chose differently (claim margin +50: 0 of 120 hands; win bonus +200: 37 of 120) | `lcm-sim shadow` |
| Training one arm | ~20 s | ~20 s | not the bottleneck |
| Data, 100,000 deals | 277 s (10 workers) | (to measure on the new build) | |

(The end-to-end number is filled in below once rounds have run.)

## Log

- First measurements: an all-Only-Orphans table plays 47 hands a second on one core (fast build), against 266 for four Jorge Yau seats. Instrumented profile: 62% of the time is the target system's `readWorths` -> `finishOdds`; the shanten calls inside it are triplets (57M), seven pairs (52M) and orphans (25M) for 100 deals.
- Data round 1 (`ml/data/oon-1`): OS2c1 exploring (temperature 150, epsilon 0.05) against OT11d, OT7c, OT6e, OT5e, OT4a, OT2d, OT1a, every seat recorded, 100,000 deals, 1,182,786 positions; outcomes: win self 1.0%, win off a discard 1.4%, deal in 1.4%, other self 3.0%, other win 2.8%, draw 90.4%. 277 s.
- Training: OS2c1 fine-tuned on it, lr 1e-4, 4 epochs: 20 s (validation loss 1.947).
- R0 (no training; screen deck seed 1,500,000,000, fast build), stage 1 at 8,000 deals, then the best 4 to 24,000:

| Arm | 8,000 deals | 24,000 deals | Wins gap (pp) | Notes |
| --- | ---: | ---: | ---: | --- |
| claim margin 100 | +0.5 ± 1.0 | +1.0 ± 0.5 | +0.00 | 100% of deals identical in outcome on stage 1 |
| win bonus 600 | +5.2 ± 3.2 | +1.6 ± 1.9 | −0.13 ± 0.03 | fewer, bigger wins: fails the wins rule |
| noise 0.10 s1 | +5.3 ± 5.1 | −1.5 ± 2.9 | +0.17 ± 0.05 | |
| win bonus 1000 | +1.8 ± 2.7 | −0.0 ± 1.6 | +0.14 ± 0.03 | |
| win bonus 1200 | +0.4 ± 2.9 | cut | +0.25 | |
| noise 0.02 s1, s2 | −0.6 ± 2.4, +1.3 ± 2.5 | cut | | |
| noise 0.05 s1, s2 | −1.6 ± 3.8, −3.2 ± 3.4 | cut | | |
| claim margin 0 | −2.0 ± 1.0 | dropped | 0.00 | |
| OT11d (reference) | −6.8 ± 6.9 | cut | −1.24 ± 0.11 | OS2c1 wins far more often than OT11d here (4.35% to 3.11%) |
