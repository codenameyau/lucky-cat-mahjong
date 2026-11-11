# Only Orphans overnight: report

## Status

- **Phase 3 is running.** OS2c1 stays the shipped model.
- **3.1, ten times the won positions: promising.** On a 40,000-deal screen against OS2c1, W1b0 (OS2c1 fine-tuned on `oow-1` without the cap, lr 3e-4, 8 epochs) scores **+11.9 ± 3.3 points a hand** and **limit-hand wins +0.072 ± 0.016 pp** (4.5 SE), with hands won −0.17 ± 0.05 pp, deal-ins −0.07 pp and half-spicy points +0.5 ± 0.2. It is the first lever that gains points through bigger hands; the cap on the same data doesn't. **Now: confirmation C7**, W1b0 and a second seed W1b1, 80,000 fresh exact deals against OS2c1 (seed 2,514,000,000).
- **3.2, the target choice: empty.** The per-deal oracle is +15.5 in sample and −0.7 ± 1.4 out of sample on independent walls. No head is trained.
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

### Round 2, from ON1 (screen deck seed 1,504,000,000, fast build)

Data `oon-2`: ON1 exploring against OT11d, OT7c, OT6e, OT5e, OT4a, OT2d, OT1a and OS2c1, every seat recorded, 100,000 deals, 1,182,981 positions, 253 s. Fine-tunes from ON1 on `oon-1` + `oon-2` with the cap (k: lr 3e-4, 8 epochs; j: lr 1e-4, 4 epochs; two seeds each), win bonus 400 / 800, weight noise 0.02 / 0.05. Gaps against ON1:

| Arm | 8,000 deals | 40,000 deals | Wins gap (pp) | Deal-ins gap (pp) |
| --- | ---: | ---: | ---: | ---: |
| N2j1 (cap, lr 1e-4, seed 1) | +5.0 ± 4.7 | +2.7 ± 2.2 | +0.18 ± 0.04 | +0.04 ± 0.03 |
| N2k1 (cap, lr 3e-4, seed 1) | +3.9 ± 5.6 | +0.3 ± 2.6 | +0.24 ± 0.05 | +0.06 ± 0.03 |
| N2j0 | +5.7 ± 4.4 | −0.5 ± 2.2 | +0.14 ± 0.04 | +0.06 ± 0.03 |
| win bonus 800 | +2.7 ± 2.3 | −0.5 ± 1.1 | +0.13 ± 0.02 | +0.02 ± 0.01 |
| N2k0 | +5.8 ± 6.5 | cut | +0.17 ± 0.10 | +0.09 |
| win bonus 400 | +2.4 ± 2.3 | cut | −0.17 ± 0.05 | −0.00 |
| noise 0.02 s1 / s2 | +2.5 ± 2.2 / +3.1 ± 2.6 | cut | +0.05 / +0.00 | |
| noise 0.05 s1 / s2 | +2.3 ± 3.5 / +3.8 ± 3.7 | cut | +0.05 / +0.02 | |

ON1 on this deck: 10.5 points a hand, wins 5.10%, deal-ins 1.76%, average win 3,033. Screen 2,184 s (the shadow replayed 77% of the arms' hands). Every arm led on the first 8,000 deals, which is the deck's luck again (critique 1). A second pass of the cap keeps adding wins (+0.14 to +0.24 pp) with a few more deal-ins. Confirmation C2: N2j1 against ON1 on 40,000 fresh deals from seed 2,502,000,000, exact build (running).

B6 again with twice the data (`oon-1` + `oon-2`, 2.37M positions): the residual teacher (768 x 4, dropout 0.2, weight decay 1e-2) reaches held-out 1.9602 (outcome 0.4329) at epoch 3. The shipped-shape fine-tune from OS2c1 on the same data reaches 1.9303. The teacher gains from more data (1.994 to 1.960), but it starts from nothing while the fine-tune starts from OS2c1's millions of positions, and it is still 1.5% worse. Not distilled.

### Confirmation C2: ON2 (against ON1, 40,000 fresh deals, exact build)

40,000 fresh deals from seed 2,502,000,000, exact build, against ON1 (the loop's champion then): N2j1 scores 9.2 points a hand, wins 5.20%, deals in on 1.71%, average win 3,194.

| Gap to ON1 | Points | Wins (pp) | Deal-ins (pp) |
| --- | ---: | ---: | ---: |
| N2j1 = **ON2** | −1.2 ± 2.1 | +0.11 ± 0.04 (2.9 SE) | +0.03 ± 0.03 (0.9 SE) |

Bar met: **the Pareto rule** (wins up 2.9 SE, points down 0.55 SE, deal-ins up 0.93 SE, all inside the limits, the last only just), so ON2 is a new generation. It takes ON1's place as the loop's champion and joins the pool (OS2c1, ON1, ON2 and the older generations). 926 s. The two other seeds of the same recipe (N2j2, N2j3) are trained but not yet screened.

### Confirmation C3: ON1 and ON2 against OS2c1 (40,000 fresh deals, exact build)

40,000 fresh deals from seed 2,503,000,000, exact build. OS2c1: 6.5 points a hand, wins 4.36%, deal-ins 1.76%, average win 3,759.

| Model | Points gap | Wins gap (pp) | Deal-ins gap (pp) | Points a hand | Wins | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ON1 | −0.1 ± 3.1 | +0.68 ± 0.05 | −0.01 ± 0.04 | 6.4 | 5.04% | 3,301 |
| ON2 | −2.8 ± 3.1 | +0.79 ± 0.05 | +0.03 ± 0.04 | 3.7 | 5.15% | 3,194 |

**ON1 against OS2c1, pooled over C1 and C3 (80,000 fresh exact deals, no screen deals):** points **+0.9 ± 2.2** a hand (inverse-variance pooled), hands won **+0.70 ± 0.035 pp** (4.35% to 5.05%, 20 SE), deal-ins −0.005 ± 0.03 pp. Bars: **Pareto rule, yes. Ship bar (points up 3 SE pooled), no:** points are +0.4 SE.

**ON2 against OS2c1 (one fresh run):** points −2.8 ± 3.1, hands won +0.79 ± 0.05 pp, deal-ins +0.03 ± 0.04 pp. That still meets the Pareto rule against OS2c1, inside every limit, but it is a step back from ON1 on points (C2: −1.2 ± 2.1 against ON1).

### Critique 2: the Pareto rule lets points leak away one generation at a time

Each cap step adds hands won and shrinks the average win: 3,661 to 3,167 for ON1, then 3,194 for ON2 against OS2c1's 3,759 on C3's deals. On points, each step is inside one standard error of its parent (ON1 +0.6 SE, ON2 −0.55 SE), so the rule passes it, but the losses add up: ON2 is −2.8 against OS2c1. A rule judged only against the parent is a ratchet. Wins are measured to ±0.04 pp and points to ±3 a hand, so it rewards the well-measured quantity and lets the noisy one drift. That is critique "J favored wins" again, in a new form.

**What changes:** from round 3 every confirmation is **anchored to OS2c1**. The fresh deck's champion side is OS2c1. The candidate and the loop's champion are both read against it, the step from the parent comes from the same cached rows, and a candidate down more than one standard error on points against OS2c1 is not kept, whatever it does against its parent. Round 3 also has arms meant to give points back: the cap at 11 (recipe q) and a lower win bonus (500, 400).

### Round 3, from ON2 (screen deck seed 1,505,000,000, fast build)

Data `oon-3`: ON2 exploring against ON1, OS2c1 and the older generations, 100,000 deals. Fine-tunes from ON2 on `oon-1` to `oon-3` (j: cap 10, lr 1e-4, 4 epochs; q: cap 11), and win bonus 500 and 400. Gaps against ON2:

| Arm | 8,000 deals | 40,000 deals | Wins gap (pp) | Deal-ins gap (pp) | Average win (ON2 3,145) |
| --- | ---: | ---: | ---: | ---: | ---: |
| N3j0 (cap 10, seed 0) | −1.0 ± 5.0 | +3.8 ± 2.3 | +0.06 ± 0.04 | +0.01 ± 0.03 | 3,169 |
| N3j1 (cap 10, seed 1) | +1.9 ± 5.1 | +3.4 ± 2.2 | +0.07 ± 0.04 | +0.03 ± 0.03 | 3,154 |
| ON2, win bonus 400 (S3wbm200) | +5.5 ± 2.8 | +2.4 ± 1.2 | −0.22 ± 0.02 | −0.06 ± 0.02 | 3,295 |
| ON2, win bonus 500 (S3wbm100) | +3.6 ± 2.1 | +0.8 ± 0.9 | −0.07 ± 0.02 | −0.03 ± 0.01 | 3,180 |
| N3q0 / N3q1 (cap 11) | +0.3 ± 6.4 / −4.1 ± 6.4 | cut | −0.42 / −0.46 (± 0.11) | +0.06 / −0.01 | 3,370 / 3,279 |

ON2 on this deck: 8.0 points a hand, wins 5.18%, deal-ins 1.78%. Screen 1,687 s (the shadow replayed 69%). Reading: the third capped fine-tune barely moves the wins (+0.06), so the dial is near its end at cap 10. Cap 11 on top of two cap-10 generations gives back 0.4 pp of wins. A lower win bonus on ON2 trades the extra wins back for points, which is well measured here because it changes few hands (+2.4 ± 1.2 at 400). The round's driver confirms N3j0 (the best by z among arms with wins not down), anchored to OS2c1: C4 (running). The win-bonus arms and ON1 at win bonus 500 are confirmed against OS2c1 afterwards (C5), because against OS2c1, not against ON2, is where they have to be good on both counts.

### Confirmation C4: N3j0, anchored (40,000 fresh deals, exact build)

40,000 fresh deals from seed 2,504,000,000, exact build. The deck's champion side is OS2c1, which scores 2.1 points a hand here. N3j0 and ON2 are both read against it.

| Model | Against OS2c1: points | Wins (pp) | Deal-ins (pp) | Points a hand | Wins | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N3j0 | +8.1 ± 3.1 | +0.92 ± 0.05 | +0.06 ± 0.04 | 10.2 | 5.30% | 3,079 |
| ON2 | +7.5 ± 3.1 | +0.83 ± 0.05 | +0.02 ± 0.04 | 9.6 | 5.21% | 3,073 |

N3j0 against its parent ON2, from the same rows: +0.5 ± 2.3, wins +0.09 ± 0.04 (2.3 SE), deal-ins +0.05 ± 0.03 (1.7 SE). **Not kept:** deal-ins are up more than 1 SE. Each cap generation buys its wins partly with deal-ins, and this one crossed the line.

On C3's deck ON2 was −2.8 ± 3.1 against OS2c1, and here it is +7.5 ± 3.1. That gap between two fresh 40,000-deal decks is 2.3 combined standard errors, the noise this table has (critique 1). **ON2 against OS2c1, pooled over C3 and C4 (80,000 fresh exact deals):** points **+2.35 ± 2.2**, hands won **+0.81 ± 0.035 pp**, deal-ins +0.025 ± 0.028 pp. That meets the Pareto rule; the ship bar would need about +6.6.

Confirmation C5 (running): ON1, ON2, ON2 at win bonus 400 (S3wbm200) and ON1 at win bonus 500, all against OS2c1 on 40,000 fresh deals from seed 2,505,000,000, exact build. It is the third fresh run for ON1 and ON2, and the first for the two lower-bonus versions.

### ON3: N3j0 re-checked under the orchestrator's new deal-in leg

The orchestrator changed the rule: deal-ins may now rise by up to 0.25 pp or 1 SE, whichever is larger, because points already price deal-ins. Under it, N3j0 against ON2 on C4's deals has:

- hands won +0.092 ± 0.040 pp (2.3 SE: passes),
- points +0.5 ± 2.3 (not down),
- deal-ins +0.046 pp (under 0.25 pp: passes).

Against the anchor OS2c1 it is +8.1 ± 3.1 points and +0.92 ± 0.05 pp hands won on that deck. **N3j0 is kept as ON3** (`ml/models/ON3.json`, a new generation by the Pareto rule with the relaxed deal-in leg, not the ship bar). It passes the fair-play check. The driver uses the relaxed leg from now on.

### Confirmation C5: the third fresh run against OS2c1 (40,000 deals, exact build)

40,000 fresh deals from seed 2,505,000,000, exact build. OS2c1: 11.4 points a hand, wins 4.35%, deal-ins 1.73%, average win 3,595.

| Model | Points gap | Wins gap (pp) | Deal-ins gap (pp) | Points a hand | Wins | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ON1 | −1.1 ± 3.1 | +0.78 ± 0.05 | −0.01 ± 0.04 | 10.3 | 5.14% | 3,052 |
| ON2 | +2.8 ± 3.2 | +0.88 ± 0.05 | +0.01 ± 0.04 | 14.3 | 5.24% | 3,088 |
| ON2 at win bonus 400 (S3wbm200) | **+5.4 ± 3.1** | +0.67 ± 0.05 | −0.06 ± 0.04 | 16.9 | 5.02% | 3,221 |
| ON1 at win bonus 500 | +0.8 ± 3.1 | +0.68 ± 0.05 | −0.02 ± 0.04 | 12.2 | 5.04% | 3,124 |

2,368 s for four networks (the shadow replays every hand of a network).

**Pooled against OS2c1 over every fresh exact run (no screen deals):**

| Model | Runs (deals) | Points a hand | Hands won (pp) | Deal-ins (pp) | Bar |
| --- | --- | ---: | ---: | ---: | --- |
| ON1 | C1, C3, C5 (120,000) | +0.2 ± 1.8 | +0.73 ± 0.03 | −0.01 ± 0.02 | Pareto rule; ship bar no |
| ON2 | C3, C4, C5 (120,000) | +2.5 ± 1.8 | +0.83 ± 0.03 | +0.02 ± 0.02 | Pareto rule; ship bar no (1.4 SE) |
| ON3 | C4 (40,000) | +8.1 ± 3.1 | +0.92 ± 0.05 | +0.06 ± 0.04 | Pareto rule; ship bar not tested (one run) |
| ON2 at win bonus 400 | C5 (40,000) | +5.4 ± 3.1 | +0.67 ± 0.05 | −0.06 ± 0.04 | one run: 1.7 SE on points |

Reading: the cap generations win 0.7 to 0.9 pp more hands than OS2c1 (5.0 to 5.3% against 4.35%), measured to ±0.03 pp. On points they are level to slightly ahead, but the standard error is ±1.8 even on 120,000 deals. ON2 is the best measured: +2.5 ± 1.8 points and +0.83 pp hands won, with deal-ins level. A lower win bonus moves ON2 along its own frontier, toward fewer, bigger wins (+5.4 ± 3.1 points and +0.67 pp hands won on one run). That is the strongest single result on full-spicy points tonight, but it is one run, and the ship bar needs +3 SE pooled.

## Half spicy

**What was built.** `meta.play.halfSpicy` is a play setting of the native Only Orphans and Neural Cat players: the weight of the half-spicy payout in each option's expected points (0 is full spicy, as before; 0.5 is the blend; 1 is half spicy). The rows now carry each deal's half-spicy points and its limit-hand wins.

- The half-spicy points are a re-scoring. A hand's payments are linear in its points, so its half-spicy deltas are its deltas times `halfSpicyPoints(f) / fullSpicyPoints(f)` for the win's faan `f`.
- That ratio matches `js/points.js` `faanToPoints(f, {spicy})` for every faan from 3 to 16.
- With the setting at 0 the players play exactly as before: parity holds on all-Only-Orphans and mixed tables, and `npm test` passes. Shadow rows with half-spicy arms are identical to play rows on the exact build.
- The game's JS doesn't read the setting, so a model that uses it could not ship without porting it to `js/mahjong-ml.js`.

**Screen HS** (deck seed 1,506,000,000, fast build, 8,000 deals, against OS2c1). OS2c1: 10.2 full-spicy points a hand, wins 4.28%. "h50" = half-spicy weight 0.5, "h100" = 1.

| Arm | Full-spicy points gap | Half-spicy points gap | Wins gap (pp) | Deal-ins gap (pp) | Limit-hand wins (gap, pp) | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| OS2c1 h50 (arm 1, no training) | +0.3 ± 4.1 | +0.3 ± 0.2 | +0.48 ± 0.07 | +0.08 ± 0.05 | 0.744% (+0.000 ± 0.020) | 3,307 |
| OS2c1 h100 | −3.2 ± 6.4 | +0.2 ± 0.3 | +0.79 ± 0.10 | +0.31 ± 0.08 | 0.772% (+0.028) | 3,140 |
| ON2 h50 | +4.0 ± 7.2 | +0.7 ± 0.4 | +1.15 ± 0.12 | +0.09 ± 0.09 | 0.791% (+0.047) | 3,044 |
| ON3 h50 | +6.2 ± 7.4 | +0.8 ± 0.4 | +1.10 ± 0.12 | +0.08 ± 0.08 | 0.781% (+0.037) | 3,108 |
| ON3 h100 | −15.8 ± 7.2 (dropped) | −0.2 ± 0.4 | +1.21 ± 0.12 | +0.26 ± 0.09 | 0.737% (−0.006) | 2,858 |
| ON3 (full spicy) | +3.8 ± 7.1 | +0.6 ± 0.4 | +0.98 ± 0.12 | +0.04 ± 0.08 | 0.784% (+0.041) | 3,133 |
| ON2, win bonus 400 | +1.0 ± 7.4 | +0.4 ± 0.4 | +0.66 ± 0.12 | +0.03 ± 0.08 | 0.747% (+0.003) | 3,214 |

Reading:

- **The standard error is 15 to 20 times smaller in half-spicy points** (±0.2 to ±0.4 against ±4 to ±7 on the same deals): the tail is what makes full-spicy evaluation so expensive.
- **The play setting alone (arm 1) does part of what the cap did, less cleanly.** On OS2c1's own weights, the blend at 0.5 adds +0.48 pp of hands won, but deal-ins rise by +0.08 pp. The cap generation ON1 had added +0.73 pp with deal-ins level. At weight 1, deal-ins rise by +0.31 pp: the model stops valuing safety against big hands.
- **On top of the cap generations,** the blend at 0.5 adds another 0.1 to 0.2 pp of wins (ON3: +0.98 to +1.10), with deal-ins up about 0.04 pp and half-spicy points up a little. Weight 1 over-shoots: full-spicy points −15.8 ± 7.2 and deal-ins +0.26 pp.
- **Limit hands are not given up.** Every cap and blend arm wins as many limit hands as OS2c1 (0.74 to 0.79% of hands against 0.744%, within ±0.035 pp). The extra wins are small hands added on top, which is why the average win falls while the full-spicy points don't.
- **The transfer question, so far:** on half-spicy points the capped and blended models are a little ahead (+0.6 to +0.8 ± 0.4). On full-spicy points they are level within a noise of ±7. This is "better on half, level on full", with hands won up: a Pareto generation, not a demonstrated full-spicy gain.
- Arms 2 to 4 (data made under the half-spicy setting, training under it, a curriculum) are not run: no time was left after the confirmations. The faan-target cap is the target-side version of arm 3, and it is what made ON1 to ON3.

At 24,000 deals (stage 2, the best three):

| Arm | Full-spicy points gap | Half-spicy points gap | Wins gap (pp) | Deal-ins gap (pp) | Limit-hand wins (gap, pp) |
| --- | ---: | ---: | ---: | ---: | ---: |
| ON2 h50 | +3.0 ± 4.1 | +0.6 ± 0.2 | +0.99 ± 0.07 | +0.11 ± 0.05 | +0.023 ± 0.020 |
| ON3 h50 | +1.8 ± 4.2 | +0.5 ± 0.2 | +0.99 ± 0.07 | +0.12 ± 0.05 | +0.018 ± 0.020 |
| ON3 | +1.1 ± 4.1 | +0.5 ± 0.2 | +0.81 ± 0.07 | +0.02 ± 0.05 | +0.007 ± 0.020 |

On half-spicy points the cap generations are ahead of OS2c1 by about 2.5 SE, and the blend adds deal-ins without adding half-spicy points. The blend is not worth it on top of the cap.

### Confirmation C6: the second fresh run for ON3 and ON2 at win bonus 400 (40,000 deals, exact build)

40,000 fresh deals from seed 2,506,000,000, exact build. OS2c1: 9.2 points a hand, wins 4.33%, deal-ins 1.73%, average win 3,756.

| Model | Full-spicy points gap | Half-spicy points gap | Wins gap (pp) | Deal-ins gap (pp) | Limit-hand wins (gap, pp) |
| --- | ---: | ---: | ---: | ---: | ---: |
| ON3 | −4.9 ± 3.1 | +0.2 ± 0.2 | +0.88 ± 0.05 | +0.07 ± 0.04 | 0.786% (−0.020 ± 0.014) |
| ON2 at win bonus 400 | −3.7 ± 3.1 | +0.2 ± 0.2 | +0.68 ± 0.05 | +0.03 ± 0.04 | 0.784% (−0.021 ± 0.015) |

The single-run leads of C4 (+8.1) and C5 (+5.4) did not come back: one fresh 40,000-deal run is still ±3 points a hand.

## Final standing against OS2c1 (pooled fresh exact runs, no screen deals)

| Model | File | Runs (deals) | Full-spicy points | Hands won (pp) | Deal-ins (pp) | Bar met |
| --- | --- | --- | ---: | ---: | ---: | --- |
| **ON2** | `ml/models/ON2.json` | C3, C4, C5 (120,000) | **+2.5 ± 1.8** | **+0.83 ± 0.03** (4.35% to 5.2%) | +0.02 ± 0.02 | Pareto rule. Ship bar: no (1.4 SE) |
| ON3 | `ml/models/ON3.json` | C4, C6 (80,000) | +1.6 ± 2.2 | +0.90 ± 0.035 | +0.065 ± 0.028 | Pareto rule (relaxed deal-in leg). Ship bar: no |
| ON1 | `ml/models/ON1.json` | C1, C3, C5 (120,000) | +0.2 ± 1.8 | +0.73 ± 0.03 | −0.01 ± 0.02 | Pareto rule. Ship bar: no |
| ON2 at win bonus 400 | `ml/models/S3wbm200.json` | C5, C6 (80,000) | +0.85 ± 2.2 | +0.675 ± 0.035 | −0.015 ± 0.028 | one-off setting; no bar beyond Pareto |

**Recommendation: ON2.** It is the best measured: the most fresh deals, the biggest pooled points gain, hands won +19% (4.35% to about 5.2%), and deal-ins level. It meets the in-lineage Pareto rule against OS2c1 and against its parent. **It is not a ship candidate** under the 3 SE bar. The points are +2.5 ± 1.8, so a gain is likely, but it is not shown.

## What plateaued, and the next experiments

- **Plateaued:** fine-tuning on this table's data without the cap (all of them win 0.2 to 0.5 pp fewer hands). Play-setting steps (claim margin +0.0 ± 0.2 on 80,000 fresh deals). Weight noise, soups, clipping, EMA and warm-up (no effect on held-out loss or play). The residual teacher (worse than the fine-tuned shipped shape on held-out loss at 1.2M and 2.4M positions). A third cap generation (ON3) still adds hands won, but less each time (+0.72, then +0.11, then +0.09 pp against the parent).
- **What worked:** the faan-target cap (A4), the one change to the training target. It is a dial between hands won and win size, and it keeps the limit hands.
- **What limits every conclusion on points:** at this table a network that changes most hands has a paired standard error of about ±3 points a hand on 40,000 deals. The deck-to-deck swing of one model against OS2c1 was −2.8 to +7.5. The ship bar (+3 SE pooled) for a true gain of +3 points would need about 400,000 fresh deals.

Next experiments, in order:

1. **Judge on half-spicy points (or another bounded proxy) with full spicy as a guard.** Half spicy has standard errors 15 to 20 times smaller, so screens could compare ten times more arms. Keep full spicy as the bar, but pre-register the half-spicy gap as the screen signal.
2. **More fresh runs of ON3 and ON2 at win bonus 400** for the ship bar. Each 40,000-deal exact run takes about 25 minutes for two networks with the shadow.
3. **Arms 2 to 4 of half spicy:** data made under the half-spicy setting, and training under it then a short full-spicy fine-tune, compared with the cap at matched hands won.
4. **Port `halfSpicy` (and the cap needs nothing: it is in the weights) to `js/mahjong-ml.js`** if a half-spicy-play model is wanted in the game. The cap generations ON1 to ON3 need no JS change: they are plain weights with a win bonus.
5. **The evaluation table:** add OS2c1 and ON1/ON2 to the table once they are older generations of the shipped model, so the next lineage plays its own recent past.
6. **A variance-reduced points estimator:** replay each diverging deal several times with the hidden tiles shuffled (the native `--replays` machinery), and take the paired gap over replays. This targets the deal-level luck that dominated every points measurement tonight.

# Phase 2 (the orchestrator's plan: measure points)

## 1. The variance-reduced points estimator (`lcm-sim vr`)

**How it works.** Each hand is played once by the champion with the arm read alongside it as a shadow.

- If the arm makes the same choice at every decision, the hand contributes a gap of exactly zero.
- Where the arm first chooses differently, the game just before that decision is kept. The rest of the hand is then played K times by each side from there, with the remaining wall reshuffled the same way for both (common random numbers).
- Only the wall is reshuffled. Every hand stays as it was, and given everything that has happened, the remaining wall order is exchangeable. So each replay is an unbiased draw of the hand's ending.
- Reshuffling the hidden hands as well would bias it: generate.js measured that random hands deal in far less than the real ones.
- A hand where the split comes at a robbed kong is played whole by the arm instead.

**Validation** (ON2 against OS2c1, 1,000 deals from seed 1,620,000,000, fast build). Per-deal paired gap, points a hand:

| Estimator | Mean | SD per deal | SE | Wins SD | Half-spicy SD | Compute (against shadow) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| plain (shadow) | +7.7 | 578 | ±18.3 | 0.108 | 30.2 | 1x |
| vr, K = 1 | −13.8 | 644 | ±20.4 | 0.106 | 32.8 | about 1.9x |
| vr, K = 4 | +8.2 | 342 | ±10.8 | 0.054 | 17.2 | 4.3x |

The means agree: vr4 − plain is +0.5 ± 21.5 on the same deals. The variance ratio is 2.86 at K = 4, against 4.3x the compute, so **the efficiency is 0.66: worse than plain deals.**

The decomposition explains why. The per-deal variance is about 18,000 (the hand's state at the split) plus 396,000 / K (the wall after it). The split comes early: an arm that is a different network chooses differently on almost every hand, mostly in its first few discards. So a replay costs nearly a whole hand, and buying wall replays is no cheaper than buying fresh deals. The optimum is about K = 3.4 at an efficiency of about 0.67.

**Not used for judgments.** It would pay only for arms that diverge late, or if continuations were cheaper than hands. The 5x the orchestrator hoped for isn't there.

## 3. The game's table: ON2 against OS2c1 (60,000 fresh deals, exact build)

The table is the shipped Neural Cat NC9 twice and Jorge Yau (`neural-cat, jorge-yau, neural-cat`, as the game seats them around one Only Orphans seat; `oo-night.js --game-table`). ON2 and OS2c1 each take every seat of the same 60,000 deals from seed 2,507,000,000.

| | OS2c1 | ON2 | Gap |
| --- | ---: | ---: | ---: |
| Points a hand (full spicy) | 15.6 | 11.1 | **−4.5 ± 3.8** (−1.2 SE) |
| Points a hand (half spicy) | | −4.6 | +0.3 ± 0.2 |
| Hands won | 5.69% | 6.19% | **+0.51 ± 0.06 pp** |
| Deal-ins | 12.24% | 11.74% | **−0.50 ± 0.08 pp** |
| Average win | 2,406 | 2,093 | |
| Limit-hand wins | 0.864% | 0.787% | **−0.077 ± 0.021 pp** (3.7 SE fewer) |

Reading: at the game's table ON2 still wins more hands and deals in less. **But it finishes fewer limit hands (−0.08 pp, 3.7 SE)**, which it didn't against the older generations. Its full-spicy points are −4.5 ± 3.8, inconclusive but on the wrong side. Against faster opponents, small wins taken early cost limit hands that would have come later. The orchestrator's draft rule says "not worse at the game's table". On this run ON2 is not shown to be worse, but it is not shown to be level either. The limit-hand loss is real.

## 2. ON2's ship check (plain fresh exact deals, older-generations table)

`scripts/ml/oo-ship.js` adds fresh 40,000-deal exact decks (seeds 2,508,000,000 onwards from the counter) to the three earlier confirmations (C3, C4, C5). It stops when the pooled points gap passes 3 SE, or when the gap's upper bound (+2 SE) falls under +1. It stopped at **360,000 pooled fresh deals (9 runs) on the upper bound**:

| Pooled deals | Full-spicy points | Hands won (pp) | Deal-ins (pp) | Half-spicy points (new runs only) |
| ---: | ---: | ---: | ---: | ---: |
| 120,000 | +2.62 ± 1.80 | +0.833 ± 0.030 | +0.021 ± 0.021 | |
| 200,000 | +1.38 ± 1.41 | +0.844 ± 0.023 | +0.030 ± 0.016 | +0.40 ± 0.12 |
| 280,000 | +0.04 ± 1.19 | +0.834 ± 0.020 | +0.039 ± 0.014 | +0.34 ± 0.08 |
| **360,000** | **−1.39 ± 1.05** | **+0.824 ± 0.017** | **+0.050 ± 0.012** | **+0.25 ± 0.07** (240,000 deals) |

**Verdict on ON2 against OS2c1 at the older-generations table:**

- **Hands won: +0.82 pp, 48 SE**, about a fifth more hands won.
- **Full-spicy points: −1.4 ± 1.0 a hand.** That is level to slightly behind, and it rules out a gain bigger than about +0.7.
- **Deal-ins: +0.05 pp** (4 SE, but well under the 0.25 pp allowance).
- **Half-spicy points: +0.25 ± 0.07**, ahead by 3.6 SE.

ON2 is a trade, not a gain. It is better on the half-spicy table and in hands won, and level to slightly worse on the game's default full-spicy table.

The orchestrator's draft rule:

- hands won up 3 SE: met;
- full-spicy points not below −1 SE on 200,000+ deals: **not met** (−1.32 SE at 360,000);
- not worse at the game's table: open (−1.2 SE on points, limit hands −3.7 SE).

The early runs flattered it (+2.6 at 120,000), which is the winner's curse again. ON2 was chosen as the champion partly on those runs.

## 4. Half-spicy arms 2 to 4 (screen HS2, deck seed 1,507,000,000, fast build, against ON2)

Data `oon-h1`: ON2 exploring with the half-spicy play setting at blend 0.5 (HN2h50), against OS2c1, ON1 and the older generations. 100,000 deals, 1.18M positions. Every arm is a fine-tune from ON2 with the faan cap (lr 1e-4, 4 epochs), two seeds:

- **Arm 2 (P4hNH):** trained on `oon-h1` + `oon-2` + `oon-1`, played at blend 0.5.
- **Arm 3 (P4hN):** the same networks, played on full spicy.
- **Arm 4 (P4cN), the curriculum:** arm 2's network fine-tuned for 2 more epochs on `oon-3` (full-spicy data), played on full spicy.
- **Control (N3j1):** the same recipe on `oon-1` to `oon-3` (all full-spicy data).

The pre-registered proxy is the half-spicy points gap against ON2.

| Arm | 8,000 deals: half-spicy gap | full-spicy gap | wins (pp) | deal-ins (pp) | 24,000 deals: half-spicy gap | full-spicy gap | wins | deal-ins |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arm 2, seed 0 / 1 | −0.3 ± 0.3 / −0.3 ± 0.3 | −6.9 ± 5.5 / −4.2 ± 5.4 | +0.22 / +0.18 | +0.17 / +0.15 | — / −0.1 ± 0.2 | — / −2.0 ± 3.0 | +0.09 ± 0.05 | +0.13 ± 0.04 |
| arm 3, seed 0 / 1 | −0.3 ± 0.3 / −0.3 ± 0.3 | −6.0 ± 5.1 / −4.5 ± 5.3 | +0.05 / +0.06 | +0.07 / +0.03 | cut | | | |
| arm 4, seed 0 / 1 | −0.0 ± 0.3 / −0.2 ± 0.3 | +0.7 ± 5.6 / −3.9 ± 5.7 | +0.08 / +0.09 | −0.04 / +0.03 | +0.1 ± 0.2 / −0.1 ± 0.2 | +2.8 ± 3.1 / −1.6 ± 3.1 | +0.02 / +0.02 | −0.04 / +0.00 |
| control N3j1 | −0.9 ± 0.3 | −16.1 ± 5.6 | −0.03 | +0.12 | cut | | | |

ON2 on this deck: 8.8 full-spicy points a hand, wins 5.19%, deal-ins 1.78%.

Reading:

- **Does half-spicy training transfer? Not measurably here.** On the pre-registered proxy, no arm is ahead of ON2: the best is the curriculum seed 0 at +0.1 ± 0.2.
- Played at the half-spicy setting (arm 2), the half-trained network wins a little more (+0.1 to +0.2 pp) but deals in more (+0.13 to +0.17 pp), and its half-spicy points don't rise.
- Played on full spicy (arm 3), the same networks are level with ON2 on both tables.
- The curriculum (arm 4) is level with ON2 on everything, with deal-ins level.
- Against the full-data control on the same deck, all six half-trained arms are ahead (half spicy +0.6 to +0.9, full spicy +9 to +16 on 8,000 deals). But the control is one seed, and its −16 on full spicy is far outside what this recipe gave on other decks (N3j0: +0.5 against ON2 on C4). I read that as the control's bad luck, not evidence for half spicy.
- Nothing here goes to a confirmation. Half-spicy training, at this scale (one round of 100,000 deals), neither helps nor hurts ON2.

# Phase 3 (the orchestrator's plan: aim at points, that is, limit hands)

## 3.1 Ten times the won positions

**Data `oow-1`** (seeds from 1,310,000,000): 1,000,000 deals of OS2c1 exploring (temperature 150, epsilon 0.05) at the older-generations table. Every position is recorded, then sampled:

- every position of the seat that won the hand is kept;
- every other position is kept with chance q = 0.03 (`generate.js --native --other-share 0.03`, a generator of its own, so the deals are as without it).

The result is 5,212,380 positions, 6.0 GB, in 3,586 s. 45.2% of the rows come from won hands, about 2.4 million, against about 28,000 in `oon-1`. Recording every position costs only 1.45x the time.

**Training** (`ml/train.py --other-share 0.03`): the outcome loss weighs the other rows by 1/q, so the outcome head learns the natural frequencies. The faan heads learn only from won and paying rows, so their targets need no weight.

Calibration, checked on 400,000 unsampled positions of `oon-3`:

| Outcome | Self-draw win | Win off a discard | Deal-in | Another's self-draw | Another's win | Draw |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Predicted (W1a0, mean) | 0.98% | 1.48% | 1.45% | 2.96% | 2.89% | 90.25% |
| Happened | 1.02% | 1.58% | 1.58% | 3.16% | 3.14% | 89.52% |

The head is calibrated to within about a tenth of each rate. `oon-3` was played by ON2, which finishes more often, so a small shortfall is expected.

| Arm (from OS2c1, OS2c1's settings) | Recipe | Held-out loss | Win-faan held-out loss |
| --- | --- | ---: | ---: |
| W1a0 / W1a1 | no cap, lr 1e-4, 4 epochs, seeds 60 / 61 | 1.9427 / 1.9428 | 1.202 |
| W1b0 | no cap, lr 3e-4, 8 epochs | 1.9195 | |
| W1k0 | faan cap 10, lr 1e-4, 4 epochs | 1.6255 (capped targets) | 0.939 |

The screen against OS2c1 follows the target measurement, because both need the 10 workers.

## 3.2 The target choice: first measurement (pinned targets)

In a first version of `lcm-sim targets`, each target was **pinned for the whole hand**. On 1,570 deals × 32 common-wall replays (OS2c1, older-generations table):

- every pinned target lost to the rules by 46 to 88 points a hand;
- pinning even the rules' own first pick lost −48.8 ± 5.7;
- limit-hand wins fell by 0.2 to 0.5 pp.

**Switching targets during the hand is worth about 50 points a hand.** The rules give up a target that dies and move to one that pays 1.3x more, and that is most of what Only Orphans' targets are worth.

This was not the question asked. The tool now forces the target **at the first decision only**, and the rules carry on from it with their usual switching. The measurement is re-running (5,000 deals, K = 32, deck seed 1,640,000,000).

### 3.2 The target choice: forced at the first decision (5,000 deals, K = 32 common-wall replays each)

OS2c1 sits in seat d mod 4 of each deal, at the older-generations table, on deck seed 1,640,000,000. At the model's first turn the game is kept. The rest of the hand is played 32 times with the remaining wall reshuffled, the same 32 walls for every option:

- **the rules** (as the game plays);
- **each target forced at that first decision**, after which the rules carry on with their usual switching.

The rules' first pick is Seven Pairs in 61% of deals, Thirteen Orphans in 27%, Concealed Triplets in 8.5% and pairs of 1s, 9s and honors in 3.6%. Every target is possible at the first turn in every deal.

| Option against the rules | Points a hand | Limit-hand wins (pp) |
| --- | ---: | ---: |
| Forcing the rules' own first pick (check) | 0.0 ± 0.0 (identical games) | 0.000 |
| Thirteen Orphans forced | −1.6 ± 1.3 | +0.004 |
| Triplets of 1s, 9s and honors forced | −1.3 ± 1.3 | +0.003 |
| Pairs of 1s, 9s and honors forced | −1.1 ± 1.3 | +0.003 |
| Seven Pairs forced | −0.9 ± 0.8 | +0.006 |
| Concealed Triplets forced | +0.5 ± 1.1 | +0.001 |
| The per-deal oracle, in sample (the best of the six replayed means) | +15.5 ± 1.1 | |
| A rule by (the rules' pick, the possible targets), fitted on half the deals and scored on the other half | −1.1 ± 1.1 | |

The per-deal oracle picks something other than the rules in 15.6% of deals, and in sample it looks worth +15.5 a hand. To test that, the first 1,000 deals were replayed on 32 **independent** walls (`--salt`). The option chosen on one set of walls was scored on the other, both ways round:

- **in sample: +15.5 ± 1.7 a hand;**
- **out of sample: −0.7 ± 1.4 a hand,** limit-hand wins +0.005 pp.

**The whole oracle gain is selection noise.** Even a perfect per-deal chooser, trained on 32 replays of each option, would gain nothing. A head trained on these labels can only do worse. The first target choice is not where Only Orphans loses points. Whatever is chosen first, the rules' switching carries the hand to about the same place.

**3.2 is empty: no head is trained.**

(The earlier version, with targets pinned for the whole hand, showed what the switching is worth: about 50 points a hand.)

### 3.1 Screen W1: the won-hand fine-tunes against OS2c1 (deck seed 1,508,000,000, fast build)

OS2c1 on this deck: 11.2 points a hand, wins 4.33%, deal-ins 1.70%, average win 3,766.

| Arm | 8,000 deals | 40,000 deals | Wins (pp) | Deal-ins (pp) | Limit-hand wins (pp) | Half-spicy points | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **W1b0** (no cap, lr 3e-4, 8 epochs) | +8.3 ± 7.0 | **+11.9 ± 3.3** | −0.17 ± 0.05 | −0.07 ± 0.04 | **+0.072 ± 0.016** (0.867%) | +0.5 ± 0.2 | 4,156 |
| W1a0 (no cap, lr 1e-4) | +8.2 ± 6.5 | +8.2 ± 3.1 | −0.42 ± 0.05 | −0.19 ± 0.03 | +0.035 ± 0.014 | +0.2 ± 0.2 | 4,203 |
| W1a1 (the same, seed 61) | +2.4 ± 6.7 | cut | −0.61 ± 0.11 | −0.18 | −0.016 ± 0.031 | −0.2 ± 0.3 | 4,066 |
| W1k0 (faan cap 10) | −6.8 ± 7.6 | −2.9 ± 3.3 | +0.96 ± 0.05 | +0.17 ± 0.04 | −0.004 ± 0.015 | +0.3 ± 0.2 | 3,098 |

Reading: **this is the first lever tonight that moves the other way along the frontier, toward bigger hands, and gains points.**

- The fine-tunes without the cap win fewer hands but bigger ones, deal in less, and **finish more limit hands**: W1b0 adds +0.072 pp of limit-hand wins (0.80% to 0.87% of hands, 4.5 SE) and +11.9 ± 3.3 points a hand on the screen.
- The cap on the same data does what it always did: more small wins, more deal-ins, no limit hands gained.
- With ten times the won hands, the faan heads have enough examples of limit hands to value them. That is the orchestrator's guess, and the cap is not needed.

**Caveats:**
- This is a screen of 4 arms, so the best is biased up.
- The two lr 1e-4 seeds disagree (+8.2 and +2.4 on 8,000 deals).
- Hands won fall by 0.17 pp (3 SE), so under the Pareto rule the points leg must carry it (up 2 SE with wins not down more than 1 SE: not met as a generation on this screen).
- The ship bar is about points, and hands won must not fall more than 1 SE, so it would fail on wins as well unless the fresh deals differ.

**Confirmation C7 (running):** W1b0 and a second seed of the recipe (W1b1, seed 61), against OS2c1, on 80,000 fresh deals from seed 2,514,000,000, exact build.
