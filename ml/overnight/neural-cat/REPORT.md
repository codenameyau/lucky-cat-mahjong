# Neural Cat overnight report

## Status (updated 2026-11-11 05:20)

- **Champion:** NC9 (the shipped model, the lab's N14c; `ml/models/pool/NC9.json`, from `js/mahjong-ml-weights.js` at 2d0cb33).
- **Rounds done:** 1 screened (R1), its confirmation running now.
- **Last result (R1 screen, 40,000 fast deals, paired against NC9 at a table of NC9, NC8, NC5):** all five fine-tunes of NC9 on 200,000 deals of fresh every-seat data are ahead: R1a +9.4 ± 4.4 (z 2.15), R1c +8.6 ± 4.6, R1e +7.3 ± 4.4, R1b +5.5 ± 4.4, R1d +4.3 ± 4.6 (recipe mean about +7). Weight-noise mutations and play-setting changes: none ahead (best topK 7 at +2.9 ± 2.8).
- **Now:** confirming R1a, then R1c, on 40,000 fresh deals each on the exact build (bar: points >= 2 SE, hands won not down by more than 1 SE).
- **Built:** `scripts/ml/nc-overnight.js` (the loop), `ml/nc_multi.py` (several arms in one GPU pass), `lcm-sim play --per-deal` (per-deal results, so any number of models share one paired screen and every model's results are cached by content). Committed 1018891.
- **Blockers:** none. Note: a 40,000-deal screen at this all-Neural-Cat table has SE about 4.4 points a hand for a retrained arm (sd about 900 a deal), not 2.6; small mutations and play settings have SE 1.6 to 2.9 because most deals play identically.

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
- Confirmation: running.
