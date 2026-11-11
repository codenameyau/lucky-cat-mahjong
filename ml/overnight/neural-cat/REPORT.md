# Neural Cat overnight report

## Status (updated 2026-11-11 07:15 UTC)

- **Champion:** NC9 (the shipped model; `ml/models/pool/NC9.json`). No generation has passed any bar yet.
- **Rounds done:** 2 confirmed (R1, R2: nothing kept); R3 (structural arms) screened, its confirmation running.
- **Last result:** R3 screen (40,000 deals): faan label smoothing 0.1 (R3smooth) wins **+3.4 ± 0.16 pp** more hands (19.4% vs 16.1%) with points level (-3.9 ± 6.2) and deal-ins level: a Pareto (hands won) generation candidate. EMA +6.6 ± 4.4 and the distilled student +5.3 ± 4.6 (+0.7 ± 0.11 pp hands won) lead on points. All screen leads are shared-luck draws (critique 2): expected lead of the best of 9 from luck alone is about 1.5 SE (about 6.5 points), so the shrunken estimates are about 0 for EMA and the student.
- **Now:** confirming R3ema, R3smooth and R3dist on 150,000 fresh exact deals (seed 3,000,362,000; ETA about 08:20 UTC). Then R5: Neural Cat learns option differences from **common-random-number option replays** (the orchestrator's R4 method; ported from Lucky Cat: `lcm-sim generate-nc --crn`, built and run on 100 deals; the advantage loss in `ml/nc_multi.py`, tested). R4's GPU-only arms (faan smoothing 0.03, 0.05, 0.1 seed 2, EMA seed 2, a second distilled student) are trained and join R5's screen.
- **topK 7:** R2s1 (soup + topK 7) dealt in 10.84% vs 10.32% at its confirmation; in the same screen the soup alone dealt in 10.58% and with topK 7 10.90%: topK 7 adds about 0.3 pp deal-ins. topK stays 6.
- **Bars:** generation = on fresh exact deals, points or hands won up >= 2 SE, the other not down > 1 SE, deal-ins not up > 1 SE. Ship candidate = points up >= 3 SE against NC9 on pooled fresh exact deals (confirmation plus a second fresh run), hands won not down > 1 SE.
- **Blockers:** none. The CRN port is a small C++ change to the option replays only (the shard rows are untouched); the exact build still needs relinking once the running confirmation releases it, then the native tests.

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
- Confirmation (exact, fresh, 150,000 deals from seed 3,000,362,000, the three that might pass a bar: R3ema, R3smooth, R3dist, the champion played once for all three): running.
