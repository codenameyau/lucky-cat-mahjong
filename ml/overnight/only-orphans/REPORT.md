# Only Orphans overnight: report

## Status

- **Champion:** OS2c1 (the shipped model). Nothing has beaten it on fresh deals yet.
- **Rounds done:** R0 (settings and noise) and round 1 (fine-tunes, settings, noise).
- **Last result:** round 1 at 40,000 deals: the fine-tuned N1a1 +6.2 ± 3.2 points a hand but wins −0.38 ± 0.05 pp (all six fine-tunes score more and win less); claim margin 100 +0.7 ± 0.4 with wins level.
- **Now:** side screen R1b: fine-tunes N1a1/N1b1/N1c1 with win bonus 1100/1400/1800 and claim margin 100, and four more fine-tunes (recipe a seeds 2-3, recipe d: lr 3e-4, 16 epochs).
- **Blockers:** none.

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

### Round 1 (screen deck seed 1,501,000,000, fast build, `lcm-sim shadow`)

Arms from OS2c1: six networks fine-tuned on `oon-1` (c: lr 1e-4, 4 epochs; a: lr 3e-4, 8 epochs; b: lr 1e-3, 8 epochs; seeds 0 and 1; each about 20 s), claim margin 100/150/200, win bonus 1000, weight noise 0.1 and 0.2 (2 seeds each). Gap to OS2c1, points a hand, paired:

| Arm | 8,000 deals | 40,000 deals | Wins gap (pp) | Deal-ins gap (pp) | Average win (OS2c1 3,596) |
| --- | ---: | ---: | ---: | ---: | ---: |
| N1a1 (lr 3e-4, seed 1) | +14.7 ± 7.1 | +6.2 ± 3.2 | −0.38 ± 0.05 | −0.17 | 3,918 |
| N1b1 (lr 1e-3, seed 1) | +9.5 ± 6.8 | cut | −0.48 ± 0.11 | −0.05 | |
| N1c1 (lr 1e-4, seed 1) | +7.2 ± 6.4 | cut | −0.47 ± 0.10 | −0.10 | |
| N1a0 | +7.1 ± 6.9 | cut | −0.34 ± 0.11 | −0.16 | |
| N1c0 | +5.5 ± 6.1 | cut | −0.43 ± 0.10 | −0.05 | |
| N1b0 | +3.3 ± 6.6 | cut | −0.18 ± 0.11 | +0.05 | |
| claim margin 100 (S1cmp50) | +1.4 ± 0.9 | +0.7 ± 0.4 | +0.00 | −0.00 | 3,605 |
| claim margin 150 | +1.5 ± 0.9 | +0.5 ± 0.4 | −0.00 | | |
| claim margin 200 | +1.8 ± 1.1 | +0.3 ± 0.5 | −0.00 | | |
| win bonus 1000 | −1.4 ± 2.4 | cut | +0.09 ± 0.05 | | |
| noise 0.1 s1, s2 | −1.3 ± 4.4, −7.2 ± 4.5 | cut, dropped | +0.06, −0.08 | | |
| noise 0.2 s1, s2 | −2.9 ± 5.1, −4.5 ± 5.3 | cut | +0.17, −0.13 | | |

OS2c1 on this deck: 10.0 points a hand, wins 4.41%, deal-ins 1.75%. Screen time 1,621 s for 14 arms (1,120 block runs); the shadow replayed 47% of the arms' hands (53% were the champion's hands, not played again).

Reading: **every one of the six fine-tuned networks scores more points than OS2c1 (mean of the six on 8,000 deals +7.9) and every one wins fewer hands** (−0.2 to −0.5 pp, 2 to 5 standard errors) and deals in less: trained on this table's games (90% draws, older generations that rarely finish), the network learns that a big hand pays and that dealing in is the risk, and plays bigger and safer. The brief's rule (hands won not down by more than one standard error) rejects all of them. No arm was confirmed (the driver picked N1a1 by z and then refused it on wins; fixed: the best is now taken among the arms that pass the wins rule, and the top-4 cut ranks them first). Claim margin 100 is a small, steady gain (+0.7 ± 0.4 at 40,000, 99.9% of deals identical).

Next: the fine-tuned networks with a larger win bonus (1100, 1400, 1800) and claim margin 100, to buy the wins back with part of the points (side screen R1b, deck seed 1,590,000,000), and more seeds of recipe a and a longer recipe d.
