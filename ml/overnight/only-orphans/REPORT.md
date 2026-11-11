# Only Orphans overnight: report

## Status

- **Champion (lineage loop):** **ON1** (`ml/models/ON1.json`): OS2c1 fine-tuned with the faan targets clipped at 10, playing win bonus 600. Against OS2c1 on 40,000 fresh exact deals: points +1.9 ± 3.2 a hand, hands won +0.72 ± 0.05 pp (5.06% to 4.34%), deal-ins +0.00 ± 0.04 pp. **It meets the Pareto rule, so it is a new generation. It does not meet the ship bar** (points up 3 SE on pooled fresh deals).
- **Rounds done:** R0, round 1, R1b, C0, the structural arms, R2, R3, C1.
- **Last result:** C1 (above). N2cap1, the same network at win bonus 800, won even more hands (+0.83 pp) but dealt in +0.05 ± 0.04 pp more, so it met no bar.
- **Now:** round 2 from ON1. Data `oon-2` (ON1 exploring against OS2c1 and the older generations), fine-tunes with the cap (two recipes x 2 seeds), win bonus 400 and 800, then a screen and a confirmation.
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

Measured on this shared machine, which three agents use at once (about 30 simulation workers between them). I used 10 workers.

| Stage | Before | After | How |
| --- | --- | --- | --- |
| Simulator, all-Only-Orphans table, one core (fast build) | 39 hands/s (master's build) | 52 hands/s (1.32x) | `groupShanten` reuses its buffer; `finishOdds` keeps the triplets, seven pairs and orphans shanten as counts (O(1) a tile, exact). Parity holds on all-Only-Orphans and mixed tables; generate parity is byte for byte |
| Data, 100,000 deals, 10 workers | 277 s | 253 s (1.10x, under a different load) | the faster simulator; generate.js keeps finished shards by key |
| The champion's side of a screen | played again with every arm (8 hands a deal for each arm) | played once a deck for all arms and cached (4 hands a deal for each arm, plus 4 shared) | per-deal rows (`lcm-sim play --rows`, `lcm-sim shadow --rows`), cached by model, table, deals, build and binary |
| Arms that rarely play differently | every hand played | only the hands where the arm chose otherwise: claim-margin arms 0.4% of hands (C0: 1,392 of 320,000), win-bonus arms about 30%, networks about 100% | `lcm-sim shadow` (exact on both builds: its rows are identical to play's) |
| Losing arms | 4,000 + 16,000 + 40,000 deals unless 1 SE behind | 8,000 deals, then only the best 4 (ranked by the Pareto rule) go on to 40,000 | staged screen with a top-4 cut |
| Training one arm | about 20 s | about 20 s (40 s on two rounds of data) | not the bottleneck |

**End to end, measured on round 1** (14 arms): 1,621 s and 615,000 hands played: 160,000 for the champion and 455,000 for the arms (the shadow skipped 53% of the arms' hands). The old way (frontier-model.js) replays the champion with each arm and screens in 4,000/16,000/40,000-deal stages with the 1 SE drop, which would have dropped one arm here. For the same 14 arms that is about 6.3 million hands on a simulator 1.32x slower, about 21,900 s. **That is about a 13.5x speed-up end to end for a screening round.** It breaks down into three factors:

- 1.32x from the simulator.
- About 3.1x from the per-hand caching and the shadow. Taking the same arms to the same depth would be 1.92 million hands the old way, about 4.1x slower counting the simulator.
- About 3.3x from the stage cut.

Confirmations: a low-divergence arm on 80,000 exact deals costs the champion's 320,000 hands plus 0.4%, about 2.6x faster counting the simulator. A network costs about 1.3x less, because it plays differently on every hand. Data and training are a small part of a round: about 4 and 2 minutes, against 25 for the screen.

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

### Side screen R1b (deck seed 1,590,000,000, 8,000 deals, stopped after stage 1)

| Arm | Gap, points a hand | Wins gap (pp) |
| --- | ---: | ---: |
| N1c1 + win bonus 1100, claim margin 100 | −3.1 ± 6.6 | −0.26 ± 0.10 |
| N1a3 (recipe a, seed 3) | −5.1 ± 6.6 | −0.46 ± 0.11 |
| N1d1 (lr 3e-4, 16 epochs) | −8.2 ± 6.7 | −0.43 ± 0.11 |
| N1c1 + win bonus 1400 / 1800 | −10.3 ± 6.3 / −12.6 ± 6.5 | −0.11 / +0.05 |
| N1b1 + win bonus 1100 / 1400 / 1800 | −10.9 / −14.0 / −17.0 (± 7.3 to 7.5) | −0.27 / −0.12 / +0.04 |
| N1a1 + win bonus 1100 / 1400 / 1800 | −12.1 / −14.7 / −16.2 (± 6.7 to 6.9) | −0.19 / −0.01 / +0.11 |
| N1a2 / N1d0 | −13.9 ± 6.7 / −14.4 ± 7.1 | −0.50 / −0.45 |

OS2c1 on this deck: 17.9 points a hand, wins 4.41%.

### Critique 1: one deck's luck moved every network together; the wins are the real signal

- **The arms on one deck are not independent.** On round 1's deck the six fine-tunes were all ahead (+3 to +15, mean +7.9); on R1b's deck the four more of the same recipes were all behind (−5 to −14, mean −10.4), and the same networks with a bigger win bonus too. The paired gap is the arm's hands less the champion's on the same deals, and a fine-tuned network plays differently from OS2c1 on almost every hand (the shadow replayed 100% of their hands), so every arm's gap carries the same term: how lucky OS2c1 was on that deck's diverging hands (OS2c1 scored 11.8 a hand on one deck and 17.9 on the other). "All six ahead" was one draw of that term, not six pieces of evidence. The best-of-N on one deck is worse than the brief's warning says: N arms share the luck instead of averaging it out.
- **What is well measured is the hands won.** Every fine-tune, on both decks, wins 0.2 to 0.5 percentage points fewer hands than OS2c1 (each 2 to 5 standard errors) and deals in a little less. That is not noise. Trained on this table's games (90% draws, opponents that rarely finish), the value network moves toward big hands and safety. A bigger win bonus buys the wins back but costs about 3 to 4 points a hand per 300 of bonus, so no win bonus gives both.
- **Points a hand is dominated by rare big wins.** With 4.4% of hands won at about 3,600 points each, a 40,000-deal paired screen of a network that changes most hands has a standard error of about ±3 points a hand, while the effects worth having are +2 to +5. A setting that changes few decisions (claim margin) has ±0.4.

**What changes:**
1. Retraining on this table's data alone is set aside: it moves the model the wrong way on wins, robustly. Instead, low-divergence changes, whose paired standard errors are small enough to see a real +1: claim margin (100 is ahead on two decks: +1.0 ± 0.5 on 24,000, +0.7 ± 0.4 on 40,000), small win-bonus steps combined with it, and blends (OS2c1 moved a quarter or half of the way toward the fine-tunes' average, a "soup", which averages out seed noise and changes fewer decisions).
2. A recipe is judged across decks, not by its luckiest seed on one deck; arms are compared with each other on the same deck (their shared term cancels) before one goes to a fresh confirmation.
3. Confirmations of low-divergence arms are cheap through the shadow on the exact build, so they get 80,000 deals (standard error about ±0.3).

Confirmation C0 (running): claim margin 100 on 80,000 fresh deals from seed 2,500,000,000, exact build.

### Confirmation C0: claim margin 100 is not better (80,000 fresh deals, exact build)

S1cmp50 (OS2c1 with claim margin 100) against OS2c1 on 80,000 fresh deals from seed 2,500,000,000, exact build: **+0.0 ± 0.2 points a hand**, wins −0.00 ± 0.00 pp, deal-ins −0.00 pp (OS2c1: 6.8 a hand, wins 4.38%, deal-ins 1.70%, average win 3,598). Bar met: none. The screens' +1.0 ± 0.5 and +0.7 ± 0.4 were the screen winner's luck, as the brief warns. Cost: 1,058 s, the shadow replayed 1,392 of 320,000 hands (0.4%): a confirmation of a low-divergence arm costs the champion's games and little else.

### Rules from the orchestrator (from this point)

- New generation (joins the pool, makes the next data): the Pareto rule on fresh exact deals: points a hand or hands won up at least 2 SE, the other not down more than 1 SE, deal-ins not up more than 1 SE.
- Ship candidate: points a hand up at least 3 SE against OS2c1 on pooled fresh exact deals (the confirmation and a second fresh run, never screen deals), hands won not down more than 1 SE.
- Fine-tunes are compared at equal hands won: each with the win bonus that brings its wins level with OS2c1 (from R1b, about 1400 for the recipe-a fine-tunes).

## Structural arms

All on `oon-1`, from OS2c1, lr 3e-4, 8 epochs, patience 3, each against the control trained the same way (seeds 5 and 6). Held-out loss (outcome + 0.5 x each faan head, on 5% of deals held out):

| Arm | Held-out loss | Outcome loss | Notes |
| --- | ---: | ---: | --- |
| control N2ctl0 / N2ctl1 | 1.9318 / 1.9315 | | |
| A1 clipping at 1.0 (N2clip0) | 1.9320 | | pre-clip gradient norm: median 0.85 to 0.93, 99th percentile 1.17 to 1.31, max 1.86 (first epoch) then under 1.5. No heavy-tailed spikes: the cap only rescales ordinary steps (over it on 12 to 28% of steps). No effect: dropped. |
| A2 EMA 0.999 (N2ema0) | 1.9315 | | no effect |
| A3 warm-up 5% at lr 1e-3 (N2warm0) | 1.9446 | | lr 1e-3 without it (N1b0/N1b1): 1.9447 / 1.9390; no help |
| A4 faan targets clipped at 10 (N2cap0 / N2cap1) | 1.6291 / 1.6301 (on capped targets) | 0.4303 / 0.4304 | not comparable on the loss (the faan heads are scored on capped targets); judged by play |
| A5 gradient noise 0.01 (N2gn0 / N2gn1) | 1.9284 / 1.9289 | | 0.17% below the control on both seeds: the only arm that moves the loss |
| B6 residual + LayerNorm teacher, 768 x 4 blocks, from scratch, lr 1e-3, clip, warm-up | 1.9940 (best epoch 3) | 0.4335 | over-fits from epoch 3: the win-faan head's held-out loss climbs from 1.33 to 2.08 while its training loss halves |
| B6 teacher 512 x 4, dropout 0.3, weight decay 1e-2 | 1.9846 (epoch 4) | 0.4351 | same |

Notes on A4 for Only Orphans: the trainer has no points regression to put a Huber loss on. Every target is a class (the hand's ending, the faan won, the faan paid) under cross-entropy, so the loss is already bounded. The heavy tail is in what the value reads from those classes (the payout doubles with each faan). Clipping the faan targets at 10 is the matching robust-target arm.

Reading B6: the teacher has 5.2M parameters against the shipped 0.18M, and it is worse on held-out data, with or without strong regularisation. **Capacity is not the bottleneck here; the number of wins is.** Only 2.4% of the 1.18M positions belong to a hand the seat won (about 28,000), so the faan heads over-fit long before the outcome head has learned anything new. B6 is not distilled. The next lever is more data, not a bigger network.

Play results for the structural arms (each at win bonus 1400 and claim margin 100, to compare at about equal hands won, with N2ctl0 also at its trained settings): screen R2 (deck seed 1,502,000,000), running.

### Screen R2 (deck seed 1,502,000,000, 8,000 deals, fast build; stopped after stage 1 to follow A4)

OS2c1 on this deck: 17.4 points a hand, wins 4.28%, deal-ins 1.61%, average win 3,805. "L" = win bonus 1400 and claim margin 100 (about level wins for a fine-tune).

| Arm | Points gap | Wins gap (pp) | Deal-ins gap (pp) | Average win |
| --- | ---: | ---: | ---: | ---: |
| N2ctl0 (control, trained settings) | +4.9 ± 6.6 | −0.27 ± 0.11 | −0.19 | 4,050 |
| N2ctl0L / N2ctl1L (control, L) | +1.4 ± 6.7 / −3.0 ± 6.6 | +0.09 / −0.06 (± 0.11) | −0.15 / −0.06 | 3,628 / 3,750 |
| N2clip0L (A1) | +4.7 ± 6.9 | +0.04 ± 0.11 | −0.17 | 3,724 |
| N2ema0L (A2) | −2.7 ± 6.7 | −0.05 ± 0.11 | −0.13 | 3,609 |
| **N2cap0L / N2cap1L (A4, faan cap 10)** | −3.8 ± 7.1 / −3.7 ± 7.2 | **+1.07 / +1.11 (± 0.12)** | +0.15 / +0.09 | 2,993 / 2,946 |
| N2gn0L / N2gn1L (A5) | −2.2 ± 6.8 / +1.7 ± 6.9 | −0.02 / +0.10 (± 0.11) | −0.08 / −0.19 | 3,614 / 3,581 |
| soup 25% / 50% toward the six fine-tunes, claim margin 100 | −1.0 ± 5.1 / −1.4 ± 6.0 | +0.00 / −0.25 | −0.01 | |
| claim margin 75 | +0.9 ± 0.5 | +0.00 | | |
| claim margin 100 + win bonus 900 / 850 | +0.2 ± 1.8 / +0.8 ± 1.2 | +0.03 / +0.00 | | |

Reading: at about level wins, the fine-tunes are level with OS2c1 on points (mean of the five plain-recipe L arms +0.4); clipping, EMA and gradient noise don't separate from the control in play. **The faan-target cap (A4) is the one arm that moves play: +1.1 percentage points of hands won (5.34% against 4.28%, 9 standard errors) on both seeds**, smaller wins (about 2,970 points against 3,805), points within one standard error, deal-ins up 0.1 to 0.15 pp. It values a limit hand like a 10-faan hand, so it takes the faster, smaller wins. As screened it carried win bonus 1400; it should give back wins for points at a lower win bonus. Next: screen R3, the cap at its trained settings (win bonus 800) and at 600 and 400, and caps 8, 9 and 11.

### Screen R3: the faan cap (deck seed 1,503,000,000, 8,000 deals, fast build; stopped after stage 1)

OS2c1 on this deck: 1.9 points a hand, wins 4.32%, deal-ins 1.69%, average win 3,504. Every cap arm is from OS2c1, lr 3e-4, 8 epochs on `oon-1`; "w600" etc. = win bonus (OS2c1's is 800), claim margin 50 throughout.

| Arm | Points gap | Wins gap (pp) | Deal-ins gap (pp) | Average win |
| --- | ---: | ---: | ---: | ---: |
| N2ctl0 (control, no cap) | −2.0 ± 6.7 | −0.42 ± 0.11 | −0.12 ± 0.08 | 3,861 |
| N2cap0 / N2cap1 (cap 10) | −3.1 ± 6.9 / +3.2 ± 7.0 | +0.84 / +0.84 (± 0.12) | +0.15 / +0.01 | 2,909 / 2,977 |
| cap 10, win bonus 600: cap0 / cap1 | +0.4 ± 6.8 / +6.5 ± 7.1 | +0.69 / +0.66 | +0.09 / −0.04 | 3,014 / 3,128 |
| cap 10, win bonus 400: cap0 / cap1 | −0.6 ± 6.8 / +2.8 ± 6.9 | +0.55 / +0.44 | −0.01 / −0.03 | 3,066 / 3,234 |
| cap 9, two seeds | −3.0 ± 6.7 / −7.2 ± 6.9 | +1.02 / +0.98 | +0.22 / +0.24 | 2,819 / 2,916 |
| cap 8 | −0.2 ± 6.6 | +1.08 | +0.24 | 2,839 |
| cap 11, two seeds | −6.1 ± 6.9 / −2.8 ± 7.0 | +0.53 / +0.57 | +0.01 / +0.08 | 3,046 / 3,044 |

Reading: the cap is a dial, the same on two decks. The lower the cap, the more hands won (+0.55 at 11, +0.84 at 10, +1.0 at 8 and 9) and the smaller each win. Below 10 the deal-ins rise by 0.2 pp (3 SE). A lower win bonus gives some of the extra wins back for bigger hands. Points stay within one standard error everywhere: the screen can't see a points gain smaller than ±7. Under the Pareto rule (wins up 2 SE, points not down 1 SE, deal-ins not up 1 SE), cap 10 with seed 1 at win bonus 800 or 600 is the cleanest. Seed 0 deals in more (+0.15 and +0.09). So recipes go by the mean of seeds, and seeds 2 and 3 of cap 10 are trained for that.

Confirmation C1 (running): N2cap1 (cap 10, win bonus 800) and N2cap1w600 on the same 40,000 fresh deals from seed 2,501,000,000, exact build, each judged by the Pareto rule on its own (two candidates on one deck: a small multiplicity, noted).

### Confirmation C1: ON1, the first new generation (40,000 fresh deals, exact build)

40,000 fresh deals from seed 2,501,000,000, exact build. OS2c1: 6.7 points a hand, wins 4.34%, deal-ins 1.69%, average win 3,661.

| Arm | Points gap | Wins gap (pp) | Deal-ins gap (pp) | Points a hand | Wins | Deal-ins | Average win | Bar met |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| N2cap1 (cap 10, win bonus 800) | −0.3 ± 3.3 | +0.83 ± 0.05 | +0.05 ± 0.04 | 6.5 | 5.17% | 1.74% | 3,095 | none (deal-ins up 1.25 SE) |
| **N2cap1w600 = ON1** (cap 10, win bonus 600) | **+1.9 ± 3.2** | **+0.72 ± 0.05** | **+0.00 ± 0.04** | 8.7 | 5.06% | 1.69% | 3,167 | **Pareto rule (wins +14 SE, points +0.6 SE, deal-ins level): a new generation.** Not the ship bar (points +0.6 SE, needs +3 SE pooled) |

1,463 s (the shadow replayed 100% of these networks' hands: they play differently on nearly every hand).

**ON1** (`ml/models/ON1.json`): OS2c1 fine-tuned on `oon-1` (100,000 deals against the older generations) at lr 3e-4 for 8 epochs, seed 6, with the faan targets clipped at 10, playing win bonus 600 and claim margin 50. Against OS2c1 it wins 17% more hands (5.06% to 4.34%) at a smaller average win (3,167 to 3,661), with as many deal-ins and points level or a little up. It joins the pool, becomes the loop's champion and makes the next data (round 2: `oon-2`, ON1 exploring against OS2c1 and the older generations).
