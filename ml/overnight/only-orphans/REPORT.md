# Only Orphans overnight: report

## Status

- **Champion:** OS2c1 (the shipped model, `js/mahjong-only-orphans-weights.js`). Nothing has beaten it yet.
- **Rounds done:** 0.
- **Last result:** none yet.
- **Now:** building the native loop (`scripts/ml/oo-night.js`): an evaluation table of older Only Orphans generations only, per-deal result rows from `lcm-sim play --rows` so the champion's side of every screen is played once and cached, staged screens with early drops, cached data and models.
- **Blockers:** none.

## Setup

- Worktree `C:\Users\coden\Workspace\lcm-train-oo`, branch `train/only-orphans-overnight`, from master e8be11c.
- The pool of older generations, copied to `ml/models/`: OT11d, OT7c, OT6e, OT5e, OT4a, OT2d, OT1a (and OL2c). Distinct networks among them: OT7c = OT11d's weights (OT11d plays win bonus 800), OT4a = OT5e = OT6e's weights (win bonus 300, 450, 500), OT1a = OT2d's weights (claim margin 0, 50), OL2c. OS2c1 is OT11d fine-tuned.
- Limits: 10 simulation workers, one GPU job at a time.

## Log

- First measurements: an all-Only-Orphans table plays 47 hands a second on one core (fast build), against 266 for four Jorge Yau seats. Instrumented profile: 62% of the time is the target system's `readWorths` -> `finishOdds` (1M calls for 200 deals), whose cost is the shanten calls inside it.
