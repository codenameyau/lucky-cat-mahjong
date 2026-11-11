# Neural Cat overnight report

## Status (updated 2026-11-11 10:55 UTC)

- **Champion: G1** (`ml/models/pool/G1.json`, trained as R4sm03: NC9 fine-tuned on 8 sets of every-seat data with label smoothing 0.03 on the faan heads). **Generation 1** under the orchestrator's revised rule (deal-ins may rise by up to 0.25 pp or 1 SE): against NC9 on 150,000 fresh exact deals, hands won **+1.4 ± 0.05 pp** (17.61% vs 16.19%), points **+0.6 ± 2.3** (level), deal-ins +0.10 ± 0.05 pp, average win 833 vs 915. Fair-play shuffle check (`bench.js fairPlay`): **pass**. **Not a ship candidate** (points level). It joined the pool and plays the next data.
- **Rounds done:** 5 rounds plus the frontier screen (S8). 
- **Last result (S8, 40,000 fast deals against NC9, both payout tables):** the faan-smoothing frontier dominates the half-spicy play setting: at about +1.4 pp hands won, smoothing costs -0.5 to -0.8 ± 4.3 full-spicy points; the half-spicy blend 0.25 wins +1.1 pp at -2.2 ± 1.9, blend 0.5 wins +2.6 pp at -9.8 ± 4.1, blend 1.0 +9.5 pp at **-57.3**. On half-spicy points every smoothing model beats NC9 by +0.7 to +1.2 ± 0.25 (3 to 5 SE); the half-spicy play setting itself only +0.3 to +0.4.
- **Now:** R8, G1's generation: 2 x 50,000 deals with G1 exploring against the pool (G1, NC9, NC8, NC7, NC5, NC3); fine-tunes of G1 (control, smoothing 0.03 seeds 1 and 2, with EMA, smoothing 0.015) and a soup; screen against G1 on both tables; 150,000-deal confirmations of the top 2.
- **Bars:** generation = against the current champion on fresh exact deals, full-spicy points or hands won up >= 2 SE, the other not down > 1 SE, deal-ins up at most 0.25 pp or 1 SE (the larger). Ship candidate = full-spicy points up >= 3 SE against NC9 on pooled fresh exact deals, hands won not down > 1 SE.
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
