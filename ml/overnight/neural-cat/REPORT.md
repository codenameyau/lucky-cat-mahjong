# Neural Cat overnight report

## Phase 3 status (final, 2026-11-11 19:20 UTC; stopped on the maintainer's wrap-up)

- **Champion: NC10 = SC1 = G2** (`ml/models/pool/G2.json`), unchanged. Nothing in phase 3 beats it: every candidate against NC10 on fresh exact deals is level.
- **What phase 3 measured (details in "Phase 3" at the end):**
  1. **Claims by replay: no oracle gain.** 20,000 deals, 20,181 NC10 seat-hands, 86,693 claims, every option x 32 CRN replays of every unseen tile. The replays' best beats NC10's choice by 2 SE in 1.4% of claims (noise level); the cross-fitted oracle **-93.2 ± 2.9** points a hand (only NC10's own options -27.2 ± 2.0; switching only at 2 SE -5.0 ± 0.7). CRN does nothing at a claim (a call changes whose turn it is: paired variance 98% of unpaired). Not trained. The one replay hint, a lean toward passing (+2.1 ± 0.8 at b = +25 in the replays), was tested at the table as a play setting (`passBias`, `chowBias`, native only) and only trades hands won for size (b = +25: -0.3 ± 1.8 points, -1.1 pp hands won).
  2. **Near-tie discards: a hint, unverified.** 1,065 NC10 seat-hands (10.1 near ties, within 5, a seat-hand), up to 3 options x 64 CRN replays of the wall. Cross-fitted oracle -16.2 ± 14.2; among NC10's scored options +19.0 ± 12.1; **switching only at 2 SE +17.7 ± 5.6 (z 3.2)**. But these replays keep the others' real hands (part of that is hidden information), and it is one short run. The control variate (the learner's expected points at the seat's next decision) leaves 98% of the variance: not useful. Not trained.
  3. **Cheap checks (screen against NC10, then fresh exact confirmation):** the third seed of SC1's recipe (R10g3) and a pay-head step of 0.02 on G1 (P3p02), the only two ahead on the screen, are level on 150,000 fresh exact deals (seed 3,001,742,000): R10g3 **-0.8 ± 1.7** points, hands won -0.2 ± 0.04 pp; P3p02 **+0.1 ± 1.7**, -0.1 ± 0.04 pp. Pay step 0.05 (-7.0 ± 4.6), the two-stage win-then-pay job from NC9 (-5.7 ± 5.1) and SC1's two steps with another G1 (-3.7 ± 4.9) screened behind and were dropped.
  4. **Verdict:** by item 4 of the brief, NC10 is at the edge of what this network and its options can do at this table for claims, for retraining recipes and for play settings. The one open lead is near-tie discards (item 2): re-measure it with every unseen tile reshuffled (`--option-unseen`) on 4,000+ deals; only if the cautious oracle stays several points a hand above 0 is it worth training an advantage term on those rows.
- **Objective (the maintainer, via the orchestrator):** Neural Cat is the balanced lineage. Generation: points or hands won up 2 SE on fresh exact deals, the other not down more than 1 SE. Ship candidate against NC10: points up 3 SE with hands won not down more than 1 SE, **or** hands won up 3 SE with points up at least 1 SE (`judge()` in nc-overnight.js flags both as "SHIP BAR").
- **Own lineage only (the maintainer's ruling), confirmed:** every run in phase 3 seats only Neural Cat generations in the other seats; nothing ran at the benchmark table (it seats Jorge Yau) or any mixed table. Evaluation table: NC9, NC8, NC5. Data pool: G2 (= NC10), G1, NC9, NC8, NC7, NC5, NC3 (`ml/models/pool/`). Measurements: NC10 at the evaluation table's mix (each seat drawn from NC10, NC9, NC8, NC5). (The "+7.4 ± 3.4 at the benchmark table" for SC1 below was the orchestrator's ship check, not a run of this loop.)
- **Tools added:** `lcm-sim generate-nc --option-claims-only --option-learner-only --option-unseen --option-near-tie X` and a per-replay file `shard-N.optrep`; option labels carry the learner's value and expected points of each option (bytes 24 to 31, 54). `scripts/ml/nc-measure.js` runs a measurement; `ml/nc_oracle.py` reads it. `meta.play.passBias` / `chowBias` (native only, off by default; parity unchanged). nc-overnight.js: explicit data windows (`data.dirs`) and the balanced ship bar.
- **Running:** nothing. **Blockers:** none.

## Status (updated 2026-11-11 16:30 UTC; phase 2 done for this session)

- **Shipped as NC10 (PR #251): SC1 = G2** (`ml/models/pool/SC1.json`, same file as `G2.json`). Against NC9 on 200,000 pooled fresh exact deals: **+8.1 ± 2.0 points a hand, +1.08 ± 0.05 pp hands won**, deal-ins +0.24 pp; at the benchmark table (the orchestrator's run) +7.4 ± 3.4. The ship anchor is now SC1.
- **Phase 2 results:**
  - (a) **The recipe, not the seed:** SC1's recipe with seed 2 (R10g2) is **+7.0 ± 2.4** points and +1.0 ± 0.05 pp hands won against NC9 on 150,000 fresh exact deals.
  - (b, c) **One step from NC9 is not enough:** the best one-step two-head smoothing (R10w2p3, win head 0.02, pay head 0.03) is +2.0 ± 2.3 points and +1.1 pp hands won against NC9: the G1 step then a pay-head step is worth about 5 points more.
  - (d) **No compounding:** a fresh generation of data from G2 and G2 fine-tuned on it (R11c) is +0.1 ± 2.0 against G2; a second pay-head step or a win-head step on G2 screened level or down.
  - (e) **Half spicy for Neural Cat** is the faan-head reshaping: faan targets softened 20% toward their half-spicy worth behave like a strong win-head smoothing (+1.2 pp hands won, points +2.1 ± 4.5 on the screen); 50% overshoots.
- **No new candidate beats SC1.** Nothing running.
- **Blockers:** none.

## Speed: before (the lab today) and after (this loop)

Measured on this machine with 10 workers, shared with two other agents.

| Stage | Lab today (JS) | This loop (native) | Speed-up |
| --- | --- | --- | --- |
| Data, 1,000 deals, same pool and settings | 21.2 s (47 deals/s) | 0.85 s (1,183 deals/s; 1,090 to 1,600 in the round) | about 25x |
| Play (screen) hands a second | 62 (competition.js head to head, 500 deals) | about 1,190 in the R1 screen (15 models, contended) | about 19x |
| A screen of n candidates | each candidate plays the champion separately | the champion plays once for all n (lcm-sim play takes many models; each independent, checked) | a further (2n)/(n+1): 1.9x at n = 14 |
| Train | train.py one process an arm: 16 s for 4 epochs on 2.2M rows | nc_multi.py: 5 arms, 4 epochs, 86 s including load and parity checks | about 1x (training was never the bottleneck) |
| Pruning | none in the screen (6,000 then 20,000) | looks every 10,000 deals, drops arms 2 SE behind (3 of 14 dropped in R1) | about 1.1x in R1 |

End to end for one lab-sized round (50,000 deals of data, 3 arms trained, 5 candidates screened on 6,000 deals and 2 on 20,000, head to head, 4 hands a deal): JS about 1,060 s data + 150 s training + 4,500 s evaluation = about 95 minutes; this loop's tools on the same work: about 45 s + 90 s + (5 x 6,000 + 2 x 20,000) x 4 hands / 1,190 a second = about 235 s, about 6 minutes, about 15x. With batching the champion, about 20x. R1 itself did more (14 candidates, 40,000 deals each, then 2 x 40,000 exact) in about 45 minutes.

## Setup

- Pool of past Neural Cat generations (`ml/models/pool/`, from git history of `js/mahjong-ml-weights.js`):
  NC9 (512-256, topK 6, winBonus 300), NC8 (256-128, topK 4, winBonus 300), NC7 (NC5's weights, topK 4, winBonus 300), NC5 (topK 3, winBonus 150), NC3 (topK 3, winBonus 0). New champions join the pool.
- Evaluation table: the candidate in one seat, NC9, NC8 and NC5 in the other three; candidate and champion each play every seat of the same deals (paired). Seeds from 3,000,000,000 up, a counter in the state, never reused; data seeds from 1,300,000,000.
- Data: the champion exploring (temperature 150, epsilon 0.05) in 4 of 9 pool slots, the pool in the rest, every seat recorded, sample 0.12, native fast build: about 550,000 rows per 50,000 deals.

## Rounds

### R1 (champion NC9)

- Data: 5 sets of 50,000 deals (nco-1 to nco-5); arms trained on the last 4 (2.2M rows).
- Arms: fine-tune NC9 at lr 1e-4 (seeds 1, 2), 3e-4 (seeds 1, 2), 1e-4 with the learner's rows weighted 2x; 4 epochs each, all best at epoch 4. Weight noise at sigma 0.01 and 0.03 of each layer's spread (2 seeds each). Play: topK 7, topK 5, winBonus 250, 400, claimMargin 25.
- Screen (fast, 40,000 deals, seed 3,000,002,000), points a hand against NC9, then hands won, deal-ins, average win:

| Candidate | Points | Wins | Deal-ins | Avg win | Deals |
| --- | ---: | --- | --- | --- | ---: |
| R1a ft 1e-4 s1 | +9.4 ± 4.4 | 16.11% vs 16.17% | 10.41% vs 10.36% | 960 vs 898 | 40,000 |
| R1c ft 3e-4 s1 | +8.6 ± 4.6 | 16.53% vs 16.17% | 10.23% vs 10.36% | 931 vs 898 | 40,000 |
| R1e ft 1e-4 learner x2 | +7.3 ± 4.4 | 15.65% vs 16.17% | 10.48% vs 10.36% | 988 vs 898 | 40,000 |
| R1b ft 1e-4 s2 | +5.5 ± 4.4 | 16.09% vs 16.17% | 10.37% vs 10.36% | 941 vs 898 | 40,000 |
| R1d ft 3e-4 s2 | +4.3 ± 4.6 | 16.45% vs 16.17% | 10.35% vs 10.36% | 926 vs 898 | 40,000 |
| R1p0 topK 7 | +2.9 ± 2.8 | 16.20% vs 16.17% | 10.65% vs 10.36% | 936 vs 898 | 40,000 |
| R1m0 noise 0.01 s1 | -1.6 ± 1.9 | 16.11% vs 16.17% | 10.33% vs 10.36% | 901 vs 898 | 40,000 |
| R1p2 winBonus 250 | -1.8 ± 1.6 | 15.48% vs 16.17% | 10.40% vs 10.36% | 930 vs 898 | 40,000 |
| R1m2 noise 0.03 s1 | -2.3 ± 2.9 | 16.09% vs 16.17% | 10.28% vs 10.36% | 902 vs 898 | 40,000 |
| R1m1 noise 0.01 s2 | -2.9 ± 1.9 | 16.14% vs 16.17% | 10.41% vs 10.36% | 898 vs 898 | 40,000 |
| R1m3 noise 0.03 s2 | -3.1 ± 2.8 | 16.13% vs 16.17% | 10.33% vs 10.36% | 892 vs 898 | 40,000 |
| R1p4 claimMargin 25 | -5.2 ± 2.7 | 16.23% vs 16.27% | 10.39% vs 10.28% | 853 vs 863 | 20,000 (dropped) |
| R1p3 winBonus 400 | -5.6 ± 2.8 | 17.39% vs 16.27% | 10.32% vs 10.28% | 776 vs 863 | 20,000 (dropped) |
| R1p1 topK 5 | -11.3 ± 5.5 | 15.96% vs 16.05% | 10.04% vs 10.27% | 788 vs 828 | 10,000 (dropped) |

- Timings: data 31 s (50,000 deals), training 86 s (5 arms), screen 1,787 s (2,120 model-pieces of 250 deals played; the champion once for all 14).
- Confirmation (exact, fresh, 40,000 deals each): R1a **-0.3 ± 4.4** (wins 16.03% vs 16.27%, deal-ins 10.29% vs 10.31%, average win 980 vs 955), fail; R1c **-7.8 ± 4.5** (wins 16.37% vs 16.22%, deal-ins 10.55% vs 10.29%, average win 906 vs 941), fail. 611 s and 597 s each (exact build, about 520 hands a second). Round total 3,112 s.

#### Critique after R1

- **The screen's leaders were inflated twice over.** Best of 14 is biased upward, and every candidate shares the champion's results on the same deals, so the champion's bad luck on those deals lifted all five fine-tunes at once. Their recipe mean (+7) was not five pieces of evidence; it was largely one. Fix: judge only on fresh deals, confirm on more deals (100,000, SE about 2.8) and rank recipes by fresh results, not by screen means.
- **Where the variance is.** On R1a's 40,000 confirmation deals, 16% of deals were played identically by both models, and the 6.7% of deals whose difference exceeded 2,000 points carried 88% of the variance (limit hands). A retrained network diverges from the champion in most deals, so its paired SE is about 4.4 per 40,000 deals at this table (sd about 890 a deal). An effect of +5 needs about 125,000 deals to reach 2 SE.
- **Mutations:** weight noise at 0.01 to 0.03 of a layer's spread is a small random step in a 430,000-dimensional space; all four lost slightly (-1.6 to -3.1 ± 2 to 3). Kept as a minor arm, smaller and on the last layer only.

### R2 (champion NC9)

- Data: 4 new sets of 50,000 deals (nco-6, nco-7 at temperature 150 / epsilon 0.05; nco-8, nco-9 at 75 / 0.02), 37 to 42 s each. Arms on the last 8 sets (4.39M rows, kept off the GPU): fine-tune lr 1e-4 seeds 1 to 3, lr 5e-5 for 6 epochs; soups (mean weights) of the four, plain and with topK 7; noise 0.005 (all layers) and 0.02 (last layer); output bias of the deal-in logit +0.1 and -0.1. Training 171 s for 4 arms in one pass.
- Held-out loss (the 8 sets' held-out deals, outcome + half of each faan head): NC9 3.0630; R2a 2.9847; R2s0 (soup) 2.9853; R2d 2.9870.
- Screen (fast, seed 3,000,122,000):

| Candidate | Points | Wins | Deal-ins | Avg win | Deals |
| --- | ---: | --- | --- | --- | ---: |
| R2s1 soup + topK 7 | +11.6 ± 3.7 | 16.15% vs 16.10% | 10.90% vs 10.40% | 991 vs 919 | 60,000 |
| R2s0 soup | +9.5 ± 3.6 | 16.19% vs 16.10% | 10.58% vs 10.40% | 966 vs 919 | 60,000 |
| R2d lr 5e-5 | +8.7 ± 3.6 | 16.09% vs 16.10% | 10.48% vs 10.40% | 959 vs 919 | 60,000 |
| R2a lr 1e-4 s1 | +8.1 ± 3.6 | 16.29% vs 16.10% | 10.54% vs 10.40% | 955 vs 919 | 60,000 |
| R2b lr 1e-4 s2 | +7.5 ± 3.6 | 16.38% vs 16.10% | 10.58% vs 10.40% | 936 vs 919 | 60,000 |
| R2c lr 1e-4 s3 | +5.1 ± 3.6 | 16.29% vs 16.10% | 10.57% vs 10.40% | 940 vs 919 | 60,000 |
| R2m0 noise 0.005 | +1.4 ± 1.4 | 16.15% vs 16.15% | 10.37% vs 10.36% | 924 vs 916 | 40,000 (dropped) |
| R2b1 deal-in logit -0.1 | +1.0 ± 1.0 | 16.26% vs 16.15% | 10.42% vs 10.36% | 915 vs 916 | 40,000 (dropped) |
| R2m1 noise 0.02 last layer | +0.5 ± 1.1 | 16.17% vs 16.15% | 10.37% vs 10.36% | 913 vs 916 | 40,000 (dropped) |
| R2b0 deal-in logit +0.1 | +0.4 ± 1.7 | 16.21% vs 16.27% | 10.24% vs 10.28% | 908 vs 905 | 20,000 (dropped) |

- Confirmation (exact, fresh, seed 3,000,182,000): R2s1 **-0.1 ± 2.8** over 100,000 deals, wins 16.12% vs 16.15% (-0.0 ± 0.07 pp), deal-ins 10.84% vs 10.32%, average win 959 vs 903: fails. 1,594 s. Screen 1,941 s; round 3,706 s.
- Check of the build: R1a on 40,000 fresh deals on the fast build: -1.2 ± 4.4 (its screen said +9.4, its exact confirmation -0.3). The fast build is not the cause.

#### Critique 2 (after two rounds with nothing kept)

- **The screens agree with each other, not with fresh deals.** In all three screens every retrained candidate was ahead (+4 to +12), and all three leaders confirmed at about 0. The retrained candidates make largely the same changed decisions (they share NC9's start and the same data), so on a given set of deals they win or lose together: their screen results are one draw, not five, and the best of them is that draw plus selection. Pruning and ranking on a shared screen can't tell them apart. Consequence: the screen is now only a filter for the clearly bad; the decision is the fresh confirmation, sized for SE about 2.3 (150,000 deals).
- **Better prediction is not better play, again.** Fine-tuning cuts the held-out loss from 3.063 (NC9) to 2.985, about 40 times the spread between seeds, and play is unchanged (0 ± 3). The loss is spread over every seat's positions and the level of each value; the choice depends only on the differences between the 6 options at one position, which the data shows only through the moves actually made.
- **Capacity is not the limit (B6).** A residual pre-LayerNorm teacher, 768 wide, 4 blocks, 9.9M parameters (23 times NC9), trained from scratch on the same 4.39M rows with AdamW, clipping at 1.0, 5% warm-up and cosine decay, reached a best held-out loss of 2.9866 (outcome 1.2235, win faan 1.4046, pay faan 2.1216, epoch 4 of 8; its win-faan head overfits after that), against 2.9847 for the champion-shaped fine-tune R2a (outcome 1.2238). No gain beyond seed noise, so by the maintainer's rule the residual port (B7) is not worth doing; one distilled student (R3dist) is screened anyway because it costs nothing more.
- **Mutations and small play changes** are measurable to about ± 1 to 1.5 at 40,000 deals (most deals play identically) and every one has been within 1.5 points of NC9: NC9 sits near a local optimum of its play settings and output biases.

## Structural arms (R3)

All fine-tune NC9 on the same 8 sets (nco-2 to nco-9) for 4 epochs, seed 1, against the control R2a (lr 1e-4, no option), unless noted. Held-out loss on the same held-out deals (lower is better; seed-to-seed spread of the control recipe about 0.0003).

| Arm | Change | Held-out loss | Note |
| --- | --- | ---: | --- |
| R2a (control) | none | 2.98471 | |
| R3clip (A1) | clip global grad norm at 1.0 | 2.98481 | pre-clip norm median 0.40, p99 0.45, max 0.52 in every epoch: **the clip never bites**; drop it for these fine-tunes. (The from-scratch teacher's p99 was 20 in its first epoch, so clipping matters only from scratch.) |
| R3ema (A2) | EMA of weights, 0.999 a step | 2.98504 | same as the control, as were the soups (2.9853) |
| R3smooth (A4) | label smoothing 0.1 on both faan heads | 3.00696 | not comparable: the held-out loss is on hard labels, which smoothing pays for by design; judged by play |
| R3noise1, R3noise2 (A5) | gradient noise 0.01 x RMS, annealed | 2.98486, 2.98491 | same as the control |
| R3fast (A3 control) | lr 1e-3 | 2.97875 | better loss than lr 1e-4 |
| R3warm (A3) | lr 1e-3 with 5% linear warm-up | 2.97832 | warm-up adds 0.0004 over its control |
| R3dist (B6) | distil the teacher T1 (half the loss on its softmaxes) | 2.98410 | 0.0006 better than the control |
| T1 teacher (B6) | residual + LayerNorm, 9.9M parameters, from scratch | 2.98661 | no better than the shipped shape fine-tuned |

Play (screen, fast, 40,000 deals from seed 3,000,322,000, paired against NC9; the arms share these deals, so **arm minus control on the same deals** is the useful comparison, the shared luck cancelling):

| Arm | Points vs NC9 | Arm - control (points) | Hands won vs NC9 | Deal-ins | Avg win | Deals |
| --- | ---: | ---: | --- | --- | --- | ---: |
| R2a (control) | +2.0 ± 4.4 | 0 | 16.41% vs 16.18% | 10.45% vs 10.48% | 934 vs 926 | 40,000 |
| R3ema (A2) | +6.6 ± 4.4 | +4.6 | 16.46% vs 16.18% (+0.3 ± 0.10 pp) | 10.57% | 960 | 40,000 |
| R3dist (B6 student) | +5.3 ± 4.6 | +3.3 | **16.92%** vs 16.18% (+0.7 ± 0.11 pp) | 10.96% | 951 | 40,000 |
| R3noise2 (A5) | +3.0 ± 4.4 | +1.0 | 16.47% vs 16.18% | 10.52% | 947 | 40,000 |
| R3clip (A1) | +0.8 ± 4.4 | -1.2 | 16.41% vs 16.18% | 10.54% | 934 | 40,000 |
| R3noise1 (A5) | -0.3 ± 4.5 | -2.3 | 16.29% vs 16.18% | 10.62% | 957 | 40,000 (dropped) |
| R3fast (lr 1e-3) | -1.1 ± 4.6 | -3.1 | 16.70% vs 16.18% | 10.84% | 905 | 40,000 (dropped) |
| R3warm (A3) | -1.4 ± 4.6 | -3.4 | 16.33% vs 16.18% | 11.02% | 929 | 40,000 (dropped) |
| R3smooth (A4) | -3.9 ± 6.2 | | **19.41%** vs 16.06% (**+3.4 ± 0.16 pp**) | 10.38% vs 10.50% | 720 vs 932 | 20,000 (dropped) |

- **A4 changes the style a lot:** label smoothing 0.1 on the faan heads flattens the predicted faan of a win and of a loss, which raises the value of every chance to win (and of every chance to pay) relative to the hand's size: it wins 3.4 more hands in 100 (z about 21) with much smaller wins (720 points against 932) and slightly fewer deal-ins, and points about level (-3.9 ± 6.2). Under the Pareto rule (hands won up 2 SE, points not down more than 1 SE, deal-ins not up) it is a generation candidate. The points-first pruning dropped it at 20,000 deals; it is confirmed anyway.
- **A1:** clipping never bit (p99 gradient norm 0.45 against a cap of 1.0), and play matches the control (-1.2 ± about 2): dropped.
- **A3:** warm-up at lr 1e-3 changed nothing measurable against lr 1e-3 without it (-0.3); both are below the lr 1e-4 control.
- Confirmation (exact, fresh, 150,000 deals from seed 3,000,362,000, the three that might pass a bar, the champion played once for all three; 4,772 s):

| Arm | Points vs NC9 | Hands won | Deal-ins | Avg win | Bar met |
| --- | ---: | --- | --- | --- | --- |
| R3ema (A2, EMA) | **+4.3 ± 2.3** (z 1.83) | 16.23% vs 16.24% (-0.0 ± 0.05 pp) | 10.57% vs 10.27% (+0.30 ± 0.05 pp) | 950 vs 931 | none (points short of 2 SE; deal-ins up 6 SE) |
| R3smooth (A4, faan smoothing 0.1) | **-7.9 ± 2.3** | **19.62% vs 16.24% (+3.4 ± 0.06 pp)** | 10.30% vs 10.27% (+0.03 ± 0.05) | 705 vs 931 | none (points down 3.4 SE) |
| R3dist (B6 student) | +3.6 ± 2.4 | 16.81% vs 16.24% (+0.6 ± 0.06 pp) | 10.96% vs 10.27% (+0.69 ± 0.05 pp) | 911 vs 931 | none (hands won up 10 SE and points level, but deal-ins up 14 SE) |

- **What the structural arms say.** EMA is the best points result of the night (+4.3 ± 2.3, shrunken screen lead +6.6 → confirmed +4.3: the screen was about right here), but it deals in 0.3 pp more. Faan smoothing is a strong style lever: it trades a quarter of the average win for 3.4 more wins in 100 and loses points; smaller smoothing (0.03, 0.05) is in R5 to look for a point on that curve with points level. The distilled student wins more and deals in a lot more. Every retrained arm so far deals in more than NC9 (0.3 to 0.7 pp): fine-tuning on outcomes makes Neural Cat more aggressive, and the deal-in rule is the binding constraint with an SE of 0.05 pp.

### R5: learning option differences from common-random-number replays (the orchestrator's R4 method)

- **Port:** `lcm-sim generate-nc --crn` (`native/src/generate_nc.cpp`): every option of a group replayed on the same wall shuffles, seeded by (deal, group, replay), as Lucky Cat's `generate-lcv --crn`; `generate.js --crn` passes it through. The shard rows are untouched (only the option files change); both builds relinked, native tests pass.
- **Data:** nco-10, 20,000 deals of NC9 data (every seat), half the recorded decisions replayed: 111,974 groups, 583,240 option rows, 6 discards (or the claim options) a group, 8 replays each. **2,085 s** (10 deals a second against 1,200 without replays: the replays are 99% of the cost).
- **Loss:** the outcome heads as before, plus an advantage term on 256 groups a step: the network's expected points of each option less the group's mean, against the replays' mean points less theirs (Huber at 200 points; or a listwise softmax at tau 100). Arms: weight 1 (seeds 1, 2), weight 3, listwise, and win bonus 150 on two of them; control R5c0 (same window, no advantage term).
- **Offline check on held-out groups** (5,549, the replays' mean points of each model's pick less a random option's): NC9 +44.2 ± 5.6, NC3 +41.9, R5c0 +40.6, R5a1 +43.5, R5a1b +40.6, R5a3 +41.4, R5r1 +39.1. The advantage term didn't make picks better on groups it hadn't seen; and NC3, tens of points a hand behind NC9 at the table, is only 2 points behind here: the replays' means (within-group spread 163 points, 8 replays) are too noisy to rank NC's close options.
- **Screen (fast, 40,000 deals, seed 3,000,512,000):**

| Candidate | Points | Wins | Deal-ins | Avg win | Deals |
| --- | ---: | --- | --- | --- | ---: |
| R5c0 control | +8.3 ± 4.6 | 16.24% vs 16.09% | 10.65% vs 10.38% | 962 vs 920 | 40,000 |
| R4sm03 faan smoothing 0.03 | +7.0 ± 4.4 | **17.71% vs 16.09% (+1.6 ± 0.11 pp)** | 10.44% vs 10.38% | 856 vs 920 | 40,000 |
| R4dist2 student, seed 2 | -0.1 ± 6.6 | 16.78% vs 16.05% | 10.98% vs 10.41% | 931 vs 955 | 20,000 (dropped) |
| R5a1 adv w1 s1 | -2.6 ± 6.6 | | | | 20,000 (dropped) |
| R5a1b adv w1 s2 | -5.9 ± 6.5 | | | | 20,000 (dropped) |
| R5a3 adv w3 | -10.0 ± 6.5 | | | | 20,000 (dropped) |
| R5r1 listwise tau 100 | **-29.8 ± 6.3** | | | | 20,000 (dropped) |
| R5q0 adv w1 + winBonus 150 | -3.8 ± 6.5 | | | | 20,000 (dropped) |
| R5q1 adv w3 + winBonus 150 | -6.4 ± 6.5 | | | | 20,000 (dropped) |
| R4sm05 faan smoothing 0.05 | -3.5 ± 6.3 | | | | 20,000 (dropped) |

- **Verdict on the method for Neural Cat:** every advantage arm is behind its control on the same deals (by 5 to 16 points; listwise by 33, as the frontier's ranking loss was), and none picks better offline. Lucky Cat's gain came from a policy whose choices among many moves were far from optimal; Neural Cat already chooses among Jorge Yau's best 6 with a value net, and the replays can't resolve differences that small. Stopped after one round.
- **Faan smoothing at 0.03 looks like the useful point on the A4 curve:** +1.6 pp hands won with points not down and deal-ins about level. Confirming it, with the control, on their own fresh decks.

### Confirmations after R5

| Candidate | Deals (fresh, exact) | Points vs NC9 | Hands won | Deal-ins | Avg win | Bar met |
| --- | ---: | ---: | --- | --- | --- | --- |
| R4sm03 (faan smoothing 0.03) | 150,000 (seed 3,000,552,000) | +0.6 ± 2.3 | 17.61% vs 16.19% (+1.4 ± 0.05 pp) | 10.44% vs 10.34% (+0.10 ± 0.05 pp) | 833 vs 915 | at first none (deal-ins up 2 SE under the 1 SE rule); under the revised rule (0.25 pp or 1 SE) **Generation 1 (G1)**, not a ship candidate |

(R5's own confirmation of R5c0 was stopped after 3 minutes, before any result, to spend the deals on R4sm03; its deals were reused for R4sm03, unseen.)

### Fast against exact, deal by deal

R1a and NC9 on R1a's confirmation deals (seed 3,000,042,000, 40,000 deals), played again on the fast build: 39,995 of 40,000 deals identical for each model; R1a 15.52 against 15.56 points a hand, NC9 15.83 against 15.84; the gap -0.3 ± 4.4 on both builds. The fast build carries no bias toward newer weights.

## Half spicy

How: `meta.play.spicyBlend` b makes each faan's worth (1 - b) x full spicy + b x half spicy (`js/points.js` halfSpicyPoints) when Neural Cat turns its faan heads into expected points (native only; off by default, so every pinned player plays as before; parity rechecked on 200 hands). Every hand of a screen or confirmation is also re-scored on the half-spicy table (`lcm-sim play --per-deal-half`; payments are linear in the hand's points, so each delta scales by half / full for the hand's faan; the tables match `js/points.js` for faan 3 to 13). Neural Cat's targets are how the hand ends and the faan, not points, so "training on half spicy" for it means only the play setting and data played under it; the faan smoothing arms are the training-side analogue (they flatten the faan heads).

S8 frontier screen (fast, 40,000 deals from seed 3,000,702,000, paired against NC9; full-spicy points, hands won, deal-ins, average win, then half-spicy points a hand and the candidate's own half-spicy points a hand; NC9 scores about 1.0 a hand on half spicy, about 15.8 on full):

| Candidate | Full-spicy points | Hands won | Deal-ins | Avg win | Half-spicy points | Deals |
| --- | ---: | --- | --- | --- | ---: | ---: |
| R6sm04 smoothing 0.04 | +1.3 ± 4.4 | 17.85% vs 16.10% (+1.7 ± 0.11) | 10.37% vs 10.27% | 807 vs 892 | **+1.2 ± 0.25** | 40,000 |
| R7sm01 smoothing 0.01 | -0.0 ± 4.3 | 16.83% (+0.7 ± 0.10) | 10.57% | 851 | +0.9 ± 0.25 | 40,000 |
| R6sm02 smoothing 0.02 | -0.4 ± 4.4 | 17.14% (+1.0 ± 0.11) | 10.48% | 829 | +0.9 ± 0.25 | 40,000 |
| R6sm03e smoothing 0.03 + EMA | -0.5 ± 4.3 | 17.59% (+1.5 ± 0.11) | 10.37% | 801 | +1.0 ± 0.25 | 40,000 |
| R6sm03b smoothing 0.03 seed 2 | -0.8 ± 4.3 | 17.51% (+1.4 ± 0.11) | 10.44% | 804 | +0.9 ± 0.25 | 40,000 |
| R4sm03d15 smoothing 0.03, deal-in logit +0.15 | -1.6 ± 4.3 | 17.45% (+1.3 ± 0.11) | **10.11%** | 799 | +0.9 ± 0.25 | 40,000 |
| R6sm02w250 smoothing 0.02, win bonus 250 | -1.7 ± 4.4 | 16.42% (+0.3 ± 0.10) | 10.40% | 870 | +0.7 ± 0.25 | 40,000 |
| R4sm03w250 smoothing 0.03, win bonus 250 | -1.8 ± 4.3 | 16.85% (+0.7 ± 0.11) | 10.19% | 843 | +0.8 ± 0.25 | 40,000 |
| H4 half-spicy blend 0.25 (NC9's weights) | -2.2 ± 1.9 | 17.22% (+1.1 ± 0.06) | 10.33% | 817 | +0.3 ± 0.12 | 40,000 |
| H3 blend 0.5, win bonus 150 | -1.3 ± 1.7 | 16.14% (-0.0 ± 0.05) | 10.15% vs 10.12% | 906 vs 920 | +0.0 ± 0.11 | 20,000 (dropped) |
| R4sm03w200 smoothing 0.03, win bonus 200 | -4.3 ± 6.2 | 16.03% (-0.1) | 10.07% | 886 | +0.5 ± 0.36 | 20,000 (dropped) |
| R3emaB4 EMA, deal-in logit +0.4 | -3.2 ± 6.2 | 15.84% (-0.3) | 10.14% | 908 | +0.6 ± 0.35 | 20,000 (dropped) |
| R3emaB2 EMA, deal-in logit +0.2 | -4.8 ± 6.3 | 15.94% (-0.2) | 10.30% | 905 | +0.6 ± 0.36 | 20,000 (dropped) |
| H1 half-spicy blend 0.5 | **-9.8 ± 4.1** | 18.78% (+2.6 ± 0.12) | 10.54% | 728 | +0.4 ± 0.24 | 20,000 (dropped) |
| H2 half-spicy blend 1.0 | **-57.3 ± 5.8** | 25.62% (+9.5 ± 0.17) | 10.75% | 348 | +0.3 ± 0.34 | 20,000 (dropped) |

- **The half-spicy play setting is a trade, not a gain, on full spicy:** each step toward half spicy buys hands won with full-spicy points (blend 1.0 wins 9.5 more hands in 100 and gives up 57 points a hand), and it barely helps on half spicy itself (+0.3 to +0.4). Its standard errors are 2 to 3 times smaller (most deals play the same), as expected.
- **Faan smoothing is the better lever on both tables:** at the same hands won it keeps full-spicy points level, and it beats NC9 on half-spicy points by 3 to 5 SE, which the half-spicy play setting does not. Smoothing changes the faan heads' calibration as a whole, not just the payout weights; the screens can't separate smoothing 0.01 to 0.04 on full-spicy points (all within ± 4.4).
- **Lowering the win bonus does take back deal-ins** (win bonus 250: 10.19%; deal-in logit +0.15: 10.11%) but gives back hands won faster than it saves points.
- **Next under this heading:** data played by a half-spicy-setting learner, and a curriculum, are not run: the play setting lost on full spicy, so they are low priority beside G1's own generation.

### R8: G1's generation (champion G1)

- Data: nco-11 and nco-12, 2 x 50,000 deals, G1 exploring against G1, NC9, NC8, NC7, NC5, NC3 (49 s and 52 s). Arms from G1 on the last 8 sets (nco-5 to nco-12): a control (no smoothing), smoothing 0.03 seeds 1 and 2, smoothing 0.03 with EMA, smoothing 0.015, and the soup of the three 0.03 arms. Training 240 s.
- Screen (fast, 40,000 deals from seed 3,000,742,000, paired against **G1**):

| Candidate | Points vs G1 | Hands won | Deal-ins | Avg win | Half-spicy points | Deals |
| --- | ---: | --- | --- | --- | ---: | ---: |
| R8se smoothing 0.03 + EMA | -1.9 ± 3.9 | 18.19% vs 17.66% (+0.5 ± 0.09) | 10.54% vs 10.42% | 812 vs 850 | -0.0 ± 0.22 | 40,000 |
| R8s2 smoothing 0.03 s2 | -2.7 ± 3.9 | 18.23% (+0.6 ± 0.09) | 10.55% | 802 | -0.0 ± 0.22 | 40,000 |
| R8s1 smoothing 0.03 s1 | -3.8 ± 3.9 | 18.21% (+0.5 ± 0.09) | 10.63% | 812 | -0.1 ± 0.22 | 40,000 |
| R8s0 soup | -4.2 ± 3.9 | 18.19% (+0.5 ± 0.09) | 10.64% | 803 | -0.2 ± 0.22 | 40,000 |
| R8s15 smoothing 0.015 | -0.7 ± 5.5 | 17.68% vs 17.72% (-0.0 ± 0.13) | 10.63% vs 10.54% | 859 vs 877 | -0.1 ± 0.32 | 20,000 (dropped) |
| R8c control (no smoothing) | -4.9 ± 6.0 | 17.15% (-0.6 ± 0.14) | 10.63% | 880 | -0.3 ± 0.34 | 20,000 (dropped) |

- Nothing reached the confirmation threshold (points z 0.5): G1 stays. Smoothing again on top of G1 buys another +0.5 pp hands won with points slightly down; the no-smoothing control gives G1's extra wins back. The smoothing lever is spent after one step.

### R9: one faan head smoothed (champion G1)

- Arms on the same 8 sets: smoothing 0.03 on the pay head only (R9pay) or the win head only (R9win), from G1, and the same two from NC9 (R9n9pay, R9n9win); smoothing 0.03 on both with EMA (R8se, reused from R8's cache, and R9ema2, seed 2) and their soup (R9s0). Training 249 s.
- Screen (fast, 40,000 deals from seed 3,000,782,000, paired against **G1**; the shrunken lead of the best of 7 is about its lead less 1.5 SE):

| Candidate | Points vs G1 | Hands won | Deal-ins | Avg win | Half-spicy points |
| --- | ---: | --- | --- | --- | ---: |
| R9pay pay head 0.03, from G1 | +8.3 ± 4.0 (shrunken about +2) | 17.12% vs 17.51% (-0.4 ± 0.10) | 10.53% vs 10.39% | 909 vs 837 | +0.2 ± 0.23 |
| R8se both heads + EMA | +6.6 ± 3.8 | 18.19% (+0.7 ± 0.09) | 10.39% | 829 | +0.5 ± 0.22 |
| R9n9pay pay head, from NC9 | +6.2 ± 4.2 | 16.54% (-1.0 ± 0.10) | 10.48% | 940 | +0.0 ± 0.24 |
| R9n9win win head, from NC9 | +6.1 ± 3.8 | 17.69% (+0.2 ± 0.09) | 10.56% | 870 | +0.2 ± 0.22 |
| R9ema2 both + EMA seed 2 | +4.4 ± 3.8 | 18.17% (+0.7 ± 0.09) | 10.54% | 835 | +0.3 ± 0.22 |
| R9win win head, from G1 | +4.0 ± 3.8 | 18.30% (+0.8 ± 0.09) | 10.62% | 822 | +0.4 ± 0.22 |
| R9s0 soup of the two EMA arms | +3.1 ± 3.8 | 18.23% (+0.7 ± 0.09) | 10.45% | 823 | +0.3 ± 0.22 |

- R8se was -1.9 ± 3.9 against G1 on R8's deals and +6.6 ± 3.8 here: the same model, 8.5 points apart on two fresh 40,000-deal decks (1.6 SE of the difference). That is the screen noise every lead above has to be read against.
- **Which head does what:** smoothing the win head makes Neural Cat more eager (more, smaller wins); smoothing the pay head alone does the opposite (fewer, bigger wins), since a flatter pay head prices every chance of paying higher. G1's hands-won gain comes from the win head.
- **Confirmation (exact, fresh, 150,000 deals from seed 3,000,822,000, against G1; 2,458 s):** R9pay **+4.5 ± 2.1** full-spicy points a hand (z 2.15), hands won 17.22% vs 17.62% (**-0.4 ± 0.05 pp**), deal-ins 10.50% vs 10.38% (+0.11 ± 0.05 pp), average win 892 vs 844; half spicy +0.1 ± 0.12. **Points up 2 SE (the points milestone's size), but hands won down 8 SE, so not a generation under the Pareto rule.** Its screen lead (+8.3, shrunken about +2) held at +4.5: the first retrained points gain to survive a fresh confirmation at 2 SE.
- Against NC9 it should be about G1's +0.6 plus +4.5, with hands won about +1.0 pp: so it is checked against NC9 for the ship bar on two fresh exact runs of 100,000 deals each (pooled 200,000; seeds from 3,000,972,000).

### Ship check of R9pay (SC1) against NC9

| Run | Deals (fresh, exact) | Points vs NC9 | Hands won | Deal-ins | Avg win | Half-spicy points |
| --- | ---: | ---: | --- | --- | --- | ---: |
| 1 (seed 3,000,972,000) | 100,000 | +8.6 ± 2.9 | 17.20% vs 16.11% (+1.1 ± 0.07) | 10.53% vs 10.28% (+0.25 ± 0.06) | 903 vs 914 | +1.3 ± 0.16 |
| 2 (seed 3,001,072,000) | 100,000 | +7.6 ± 2.9 | 17.26% vs 16.18% (+1.1 ± 0.07) | 10.48% vs 10.25% (+0.23 ± 0.06) | 903 vs 916 | +1.2 ± 0.16 |
| **Pooled** | **200,000** | **+8.1 ± 2.0 (4.0 SE)** | **17.23% vs 16.15% (+1.08 ± 0.05)** | 10.51% vs 10.27% (+0.24 ± 0.04) | 903 vs 915 | **+1.23 ± 0.12** |

Bars met: **ship candidate** (points up 4.0 SE against NC9, hands won up); against NC9 also a generation (both runs PASS the Pareto rule); against G1, points milestone only (hands won down). Better on both payout tables (full +8.1, half +1.2). Pooling: `ml/overnight/neural-cat/work/pool.js` reads the two runs' cached per-deal rows (it reproduces run 1 alone exactly).

## Final critique and what to run next

- **What worked:** reshaping the faan heads, not more outcome regression. Smoothing both faan heads (G1) moved the style (more, smaller wins) with points level; smoothing the pay head on top (SC1) bought the points back and more, keeping most of G1's extra wins: in total +8.1 points and +1.1 pp hands won over NC9. The value net's faan heads are overconfident in the tail; a flatter pay head prices the risk of paying more cautiously, a flatter win head prices small wins higher.
- **What didn't:** fine-tuning on more of the champion's own outcomes (prediction better, play level: R1, R2, R5c0), weight noise and output-bias mutations (all within ± 1.5), the half-spicy play setting (a trade on full spicy), CRN option replays with an advantage loss (worse than its control; replays too noisy to rank NC's close options), a 23x bigger residual teacher (same held-out loss: capacity is not the limit), clipping (never bites), warm-up, gradient noise.
- **Evaluation:** a shared 40,000-deal screen of correlated arms is one draw (R8se: -1.9 then +6.6 on two decks); only fresh confirmations of 150,000+ deals decide. The fast build is unbiased (39,995 of 40,000 deals identical).
- **Next experiments, in order:** (1) a second seed of SC1's recipe (pay smoothing 0.03 from G1) and pay smoothing 0.02 / 0.05, to check the recipe, not the draw; (2) SC1 as the learner for the next data (its own generation), pay and win smoothing tuned separately; (3) the same pay-head smoothing straight from NC9 (R9n9pay screened +6.2 ± 4.2 against G1 with fewer wins) to see whether G1's step is needed; (4) a JS port of `spicyBlend` only if a blend ever wins (none did).

## Phase 2 (after SC1 became G2)

### R10: is it the recipe or the seed, and do we need G1's step? (all on SC1's data window, nco-5 to nco-12)

Screen (fast, 40,000 deals from seed 3,001,172,000, paired against **NC9**, 8 workers; held-out loss on the same held-out deals in the last column):

| Arm | Recipe | Points vs NC9 | Hands won | Deal-ins | Avg win | Half-spicy | Held-out loss |
| --- | --- | ---: | --- | --- | --- | ---: | ---: |
| R10w2p3 | from NC9, win head 0.02, pay head 0.03 | **+9.4 ± 4.5** | 17.43% vs 16.25% (+1.18 ± 0.11) | 10.40% vs 10.34% | 871 vs 908 | +1.1 ± 0.25 | 3.0091 |
| R9n9pay | from NC9, pay head 0.03 | +8.6 ± 4.5 | 16.57% (+0.32 ± 0.10) | 10.46% | 938 | +1.0 ± 0.26 | |
| R10n02 | from NC9, pay head 0.02 | +7.3 ± 4.5 | 16.55% (+0.30 ± 0.10) | 10.47% | 934 | +0.8 ± 0.26 | 3.0073 |
| R10w2p5 | from NC9, win 0.02, pay 0.05 | +6.6 ± 4.5 | 17.42% (+1.17 ± 0.11) | 10.46% | 875 | +1.1 ± 0.26 | 3.0097 |
| R10w1p3 | from NC9, win 0.01, pay 0.03 | +5.8 ± 4.5 | 16.97% (+0.72 ± 0.11) | 10.45% | 898 | +0.9 ± 0.26 | 3.0082 |
| R10n05 | from NC9, pay head 0.05 | +4.9 ± 4.5 | 16.63% (+0.38 ± 0.10) | 10.42% | 906 | +0.8 ± 0.26 | 3.0082 |
| R10h2 | from NC9, faan targets 20% toward their half-spicy worth | +2.1 ± 4.5 | 17.47% (+1.22 ± 0.11) | 10.60% | 860 | +0.9 ± 0.26 | 3.0430 |
| R10g3 | SC1's recipe (from G1, pay 0.03), seed 3 | +0.4 ± 4.6 | 17.09% (+0.84 ± 0.11) | 10.51% | 871 | +0.7 ± 0.26 | 3.0019 |
| R10g2 | SC1's recipe, seed 2 | -0.2 ± 4.5 | 17.17% (+0.92 ± 0.11) | 10.56% | 873 | +0.7 ± 0.26 | 3.0019 |
| R10s0 | soup of SC1, R10g2, R10g3 | -0.3 ± 4.5 | 17.18% (+0.93 ± 0.11) | 10.54% | 861 | +0.7 ± 0.26 | |
| R10h5 | half-spicy targets, 50% | -6.2 ± 4.5 | 19.15% (+2.90 ± 0.11) | 10.81% | 738 | +1.0 ± 0.26 | 3.1452 |

- **Reading it carefully:** every arm shares NC9's games here, so the *differences between arms* are the informative part. On this deck the arms made straight from NC9 with both heads lightly smoothed sit 6 to 9 points above SC1's own recipe re-run from G1 (seeds 2 and 3 and their soup at about 0, with hands won +0.9 pp). Either SC1's +8.1 had seed luck in it, or the G1 step is not needed and NC9 plus a light two-head smoothing (win 0.02, pay 0.03) gets the same in one step. Confirmations decide (SC1 itself is not on this deck).
- **Half-spicy targets (e):** moving 20% of each faan target toward its half-spicy worth behaves like a strong win-head smoothing: +1.2 pp hands won with points level (+2.1 ± 4.5); at 50% it goes too far (-6.2, wins +2.9 pp, average win 738). So for Neural Cat the half-spicy idea is the same lever as the faan smoothing, and the hand-tuned smoothing points sit a little better on the frontier.
- **R10w2p3 confirmed against NC9** (150,000 fresh exact deals, seed 3,001,212,000, 2,925 s): points **+2.0 ± 2.3**, hands won **+1.1 ± 0.05 pp** (17.35% vs 16.23%), deal-ins +0.07 ± 0.05 pp, average win 849 vs 900; half spicy +0.9 ± 0.13. A generation-sized step against NC9 by hands won (like G1), **not** SC1's points (+8.1). One light two-head step from NC9 does not reach the two-step SC1; its screen lead (+9.4, shrunken about +2.7) was mostly the draw.
- **R10g2 (SC1's recipe, seed 2) confirmed against NC9** (150,000 fresh exact deals, seed 3,001,362,000, 2,819 s): points **+7.0 ± 2.4** (z 2.97), hands won **+1.0 ± 0.05 pp** (17.23% vs 16.25%), deal-ins +0.23 ± 0.05 pp, average win 918 vs 930; half spicy +1.2 ± 0.13. **The recipe, not SC1's seed, is what gains:** two seeds now give +8.1 ± 2.0 and +7.0 ± 2.4 points over NC9 with +1.0 to +1.1 pp hands won (mean about +7.6). Its screen on R10's deck said -0.2 ± 4.5: the screen was the outlier. And the two-step route (G1's two-head smoothing, then a pay-head step) beats the one-step light smoothing from NC9 (R10w2p3, +2.0 ± 2.3) by about 5 points.

### R11: G2's own generation (experiment d: does it compound?)

- Data: nco-13 and nco-14, 2 x 50,000 deals, G2 exploring against G2, G1, NC9, NC8, NC7, NC5, NC3 (63 s and 60 s on 8 workers). Arms from G2 on nco-7 to nco-14: control (no smoothing), pay head 0.03 (seeds 1, 2), win head 0.02, win 0.02 + pay 0.03.
- Screen (fast, 40,000 deals from seed 3,001,512,000, paired against **G2**):

| Arm | Points vs G2 | Hands won | Deal-ins | Avg win | Half-spicy | Deals |
| --- | ---: | --- | --- | --- | ---: | ---: |
| R11c control | +4.6 ± 3.8 | 17.18% vs 17.16% (+0.0 ± 0.09) | 10.53% vs 10.49% | 914 vs 884 | +0.1 ± 0.22 | 40,000 |
| R11wp win 0.02 + pay 0.03 | -0.5 ± 3.9 | 18.08% (+0.9 ± 0.09) | 10.41% | 835 | +0.2 ± 0.22 | 40,000 |
| R11w win 0.02 | -3.5 ± 4.0 | 18.03% (+0.9 ± 0.09) | 10.55% | 825 | -0.2 ± 0.23 | 40,000 |
| R11p2 pay 0.03 s2 | -1.3 ± 5.5 | 17.20% vs 17.21% (-0.0 ± 0.12) | 10.71% vs 10.55% | 898 vs 880 | -0.3 ± 0.31 | 20,000 (dropped) |
| R11p pay 0.03 s1 | -1.6 ± 5.3 | 17.08% (-0.1 ± 0.12) | 10.56% | 891 | -0.4 ± 0.31 | 20,000 (dropped) |

- A second pay-head step on G2 does nothing measurable; a win-head step again trades size for more wins with points down. Early sign: the head-reshaping is a one- or two-step lever, not a compounding one. - **R11c confirmed against G2** (150,000 fresh exact deals, seed 3,001,552,000, 2,827 s): points **+0.1 ± 2.0**, hands won -0.1 ± 0.05 pp, deal-ins +0.10 ± 0.04 pp, average win 900 vs 900; half spicy -0.0 ± 0.11. Plain fine-tuning on G2's own data adds nothing, as it added nothing to NC9 (R1, R2). **Answer to (d): it does not compound.** The head reshaping gave two steps (G1: style, SC1: points) and then stops; new data from the stronger model doesn't by itself move it.

## Phase 3: new sources of information (champion NC10 = G2)

### P3.1 Claims by replay: measured, no oracle gain

- **How:** 20,000 deals (data seeds 1,300,670,000 up) of NC10 playing its best at the evaluation table's mix (each seat drawn from NC10, NC9, NC8, NC5; 20,181 NC10 seat-hands). At **every** claim NC10's seats were offered with a choice (86,693 claims, 4.3 a seat-hand: 39,616 with a pung on offer, 47,077 a chow only, 2,690 a kong), every legal option (pass, each pung/chow with NC10's discard after it, the kong) was forced and the hand played on 32 times on common reshuffles of **every tile the seat hasn't seen** (the live wall and the others' concealed tiles; fair). 3,579 s on 10 workers (`scripts/ml/nc-measure.js --kind claims --unseen`; `ml/nc_oracle.py`).
- **Check:** NC10's pick is the top value of what it weighs in 100.0% of the 36,788 claims where it weighs two or more options (in the other 49,905 it weighs only passing: the foundation's contradiction check rules the call out).
- **How often the replays disagree:** the replays' best option beats NC10's choice by 2 SE of the paired gap in **1.4%** of claims (1.8% with a pung on offer, 1.1% chow, 1.5% kong): about what noise alone gives.
- **The oracle (points a hand, per NC10 seat-hand; cross-fitted: the best option picked on 16 replays, its gap to NC10's choice measured on the other 16):**

| Oracle | All claims | Pung on offer | Chow only | Kong on offer |
| --- | ---: | ---: | ---: | ---: |
| follows the replays, any legal option | **-93.2 ± 2.9** | -42.7 ± 2.3 | -50.4 ± 1.8 | -5.6 ± 0.7 |
| only among the options NC10 weighs | -27.2 ± 2.0 | -15.1 ± 1.6 | -12.1 ± 1.1 | -1.6 ± 0.6 |
| switches only when its half says 2 SE | -5.0 ± 0.7 | -3.8 ± 0.7 | -1.3 ± 0.3 | -0.4 ± 0.2 |
| (in-sample best, inflated by selection) | (+183.4 ± 2.1) | | | |

- **Why:** common random numbers do almost nothing at a claim: a call changes whose turn it is, so the same reshuffle deals different tiles to everyone; the paired gap's variance is 98% of the unpaired (2.35M against 2.39M points^2, sd about 1,530 a replay against a median within-option sd of 114: limit hands). With 32 replays the SE of one claim's gap is about 270 points, far above the true gaps; NC10's choices are better than anything the replays can pick, and even a 2 SE switch rule loses 5 points a hand (heavy tails make 2 SE false positives common).
- **A claim correction instead (no selection inside a claim):** passing's value moved by b, each b's gain on all 32 replays: b = -25: -7.5 ± 0.8; -10: -2.4 ± 0.5; +10: +1.0 ± 0.5; **+25: +2.1 ± 0.8**; +50: +1.9 ± 1.0; +100: -1.9 ± 1.3; the best b chosen on half the deals and measured on the other half: +1.6. A small lean toward passing might be worth about 2 points in the replays' world (random hands for the others, which deal in and win less than real ones), so it is tested where it counts: as a play setting (`meta.play.passBias`, `chowBias`; native only, 0 by default, parity unchanged) screened at the table against NC10 (P3 screen 1). Training the network on these claim rows is **not** run: the measure-first rule says no (oracle far below 2 points a hand).

### P3 screen 1: cheap checks and claim settings against NC10 (fast, 40,000 deals from eval seed 3,001,702,000, 1,498 s)

Paired against **NC10 (G2)** at NC9, NC8, NC5. Points a hand (full spicy), hands won, deal-ins, average win, half-spicy points.

| Candidate | Recipe | Points vs NC10 | Hands won | Deal-ins | Avg win | Half spicy | Deals |
| --- | --- | ---: | --- | --- | --- | ---: | ---: |
| R10g3 | SC1's recipe, third seed (G1 + pay 0.03) | +5.0 ± 3.3 | 16.96% vs 17.20% (-0.2 ± 0.08) | 10.49% vs 10.42% | 912 vs 889 | +0.1 ± 0.19 | 40,000 |
| P3p02 | G1 + pay head 0.02 | +3.1 ± 3.3 | 17.01% (-0.2 ± 0.08) | 10.50% | 914 | +0.0 ± 0.19 | 40,000 |
| P3cbm25 | NC10, chow bias -25 | +1.7 ± 1.2 | 16.80% (**-0.4 ± 0.05**) | 10.29% | 914 | -0.2 ± 0.09 | 40,000 |
| P3pb25c | NC10, pass bias +25, chow bias -25 | +0.2 ± 1.9 | 15.64% (**-1.6 ± 0.07**) | 10.06% | 965 | -0.9 ± 0.13 | 40,000 |
| P3pb25 | NC10, pass bias +25 | -0.3 ± 1.8 | 16.08% (-1.1 ± 0.06) | 10.13% | 946 | -0.6 ± 0.12 | 40,000 (dropped) |
| P3pb50 | NC10, pass bias +50 | -0.1 ± 2.9 | 14.93% (-2.3 ± 0.10) | 9.97% | 992 | -1.2 ± 0.20 | 20,000 (dropped) |
| P3pb10 | NC10, pass bias +10 | -0.5 ± 1.6 | 16.84% (-0.4 ± 0.06) | 10.30% | 881 | -0.2 ± 0.11 | 20,000 (dropped) |
| P3fp | NC9 -> both heads 0.03 (seed 2) -> pay 0.03: SC1's two steps with another G1 | -3.7 ± 4.9 | 16.92% (-0.3 ± 0.12) | 10.53% | 871 | -0.3 ± 0.29 | 20,000 (dropped) |
| P3wp | NC9 -> win head 0.03 -> pay 0.03 (one two-stage job) | -5.7 ± 5.1 | 17.19% (-0.0 ± 0.12) | 10.62% | 848 | -0.4 ± 0.29 | 20,000 (dropped) |
| P3p05 | G1 + pay head 0.05 | -7.0 ± 4.6 | 17.11% (-0.1 ± 0.11) | 10.37% | 869 | -0.4 ± 0.27 | 20,000 (dropped) |

- **The claim settings at the table:** leaning toward passing does what the replays said only in style: fewer calls, fewer deal-ins (10.42% to 10.06-10.30%), bigger wins, and **fewer hands won** (-0.4 to -2.3 pp), with points level (all within ± 2). The +2 points the replays' world promised for b = +25 is not there at the real table (-0.3 ± 1.8). Under the balanced bars every claim setting fails (hands won down 6 to 23 SE for at most +1.7 points). Claims are at NC10's edge too.
- **Two-stage from NC9 in one run (P3wp):** behind (-5.7 ± 5.1), hands won level: a win-head step alone is not G1's both-head step, and the combination does not reach SC1. SC1's two steps re-run with a different first step (P3fp) are also behind: SC1's gain needs G1 itself, or is partly G1's draw.
- **The pay-head step size on G1:** 0.02 +3.1 ± 3.3, 0.03 (R10g3, a third seed) +5.0 ± 3.3, 0.05 -7.0 ± 4.6: 0.03 stays the point. R10g3 and P3p02 are the only arms ahead of NC10 and are confirmed on fresh exact deals (150,000, both in one run).

### P3.2 Near-tie discards with many replays: measured on 1,065 seat-hands (cut short by the wrap-up)

- **How:** 1,100 deals (data seeds 1,300,690,000 up, plus the 100-deal test from seed 11) of NC10 at the table's mix: 1,065 NC10 seat-hands. At every discard where NC10's best two values are within **5** (expected points plus the win bonus x p(win)), the discards within 5 of the best (at most 3) were forced and each played on **64** times on common reshuffles of the **wall** (the others' hands as they are: hidden tiles used as the outcome, never as an input; the fair-target form, but an oracle that follows it uses what the others hold). 3,336 s on 2 workers for 1,000 deals (0.15 deals a second a worker: near ties are common, so this is the expensive measurement).
- **Near ties are frequent:** 10.1 a seat-hand (10,733 groups); NC10's discard is its top value in 91.3% of them (the tie order and the foundation's consistency check move the rest).
- **How often the replays disagree:** the best option beats NC10's by 2 SE in 2.7% of the near ties.
- **The oracle (cross-fitted, 32 replays to pick, 32 to measure), points a hand per NC10 seat-hand:** any of the tied options **-16.2 ± 14.2**; among the options NC10 scored +19.0 ± 12.1; **switching only when the picking half says 2 SE: +17.7 ± 5.6 (z 3.2)**; (in-sample best +440, selection only).
- **The control variate does not work:** the learner's expected points at the seat's next decision leave 98% of the paired-gap variance (the variance is in how the hand ends: limit hands), and centring it on each option's own value biases it (its "oracle" +104 ± 18 is that bias, not information). Reported raw only.
- **Reading:** unlike claims (where every oracle lost), the cautious near-tie oracle gains about 18 points a hand at 3 SE: some near-tie discards are wrong by hundreds of points and 64 wall-only replays find them. Two cautions before it is worth training on: (1) the replays keep the others' real hands, so part of the gain is hidden information no fair policy can have (the claims measurement with every unseen tile reshuffled found nothing; the near-tie one wasn't run that way); (2) 1,065 seat-hands, one measurement, cut short. **Not trained** (the maintainer's wrap-up came first).

### P3 confirmation: R10g3 and P3p02 against NC10 (exact, fresh, 150,000 deals from eval seed 3,001,742,000, 3,974 s)

| Candidate | Points vs NC10 | Hands won | Deal-ins | Avg win | Half spicy | Bar met |
| --- | ---: | --- | --- | --- | ---: | --- |
| R10g3 (SC1's recipe, seed 3) | -0.8 ± 1.7 | 17.06% vs 17.28% (-0.2 ± 0.04 pp) | 10.51% vs 10.49% (+0.02 ± 0.04) | 903 vs 887 | -0.1 ± 0.10 | none |
| P3p02 (G1 + pay head 0.02) | +0.1 ± 1.7 | 17.16% vs 17.28% (-0.1 ± 0.04 pp) | 10.55% vs 10.49% (+0.05 ± 0.04) | 896 vs 887 | -0.0 ± 0.10 | none |

- Both level with NC10 (their screen leads +5.0 and +3.1 were the screen's draw). SC1's recipe now has three seeds: against NC9 +8.1 ± 2.0 (SC1) and +7.0 ± 2.4 (seed 2); seed 3 is NC10's level (-0.8 ± 1.7 against NC10 = SC1), so the recipe holds and no seed of it beats the one shipped.
