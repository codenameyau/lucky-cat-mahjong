# Frontier work: history and decisions

A record of the frontier work so far (from 2026-11-08): what was built, every decision taken and why, and what would make each one worth revisiting. The design itself is the [frontier plan](frontier-plan.md). What each step taught, with its evidence, is its §11 Learnings. This page is the short version: the order things happened in, and the choices.

## Where it stands (2026-11-09)

| | State |
| --- | --- |
| **Lucky Cat lineage** | Generation 1 is still lc32 (as `lc32v2`, lc32 widened to features v2). 6 rounds and 18 arms of phase 1 (3 at native scale), 3 policy-gradient probes and 4 loss-aware teacher probes. LV6b (+5.1 at its screen) is being judged |
| **Sphinx lineage** | v1 paused after every arm lost about 43 points a hand to random play. v2 restarts at the benchmark table, with the loss-aware teacher, queued after Lucky Cat's round 6. No generation yet |
| **Benchmark** | `hk-table-v1`, frozen: two Neural Cat NC8 and Jorge Yau at 0.57.9, a 40,000-deal deck, the five-stage bar |
| **Phases** | 0 built and folded into 1. 1 built and training. 2 and 3 designed, not built. 3b (search as a teacher) and 4 (search at play) deferred |
| **Simulation** | The native C++ simulator runs every round, as a hybrid: training data and screens on the fast build, judgments and Table Scores on the exact build |
| **Speed** | A round's data (20,000 deals with the hidden-tile labels): 330 s in JS, 12.9 s now. A 2,000-deal compare: about 200 s in JS, 9.9 s now (15.5 s on the exact build) |

## Timeline

1. **The frontier plan** (2026-11-08). Suphx, taken apart against Hong Kong rules, argued through four rounds of critique, ending in phases with bars to pass and reasons to stop. Two lineages: Lucky Cat (from lc32) and Sphinx (from random weights).
2. **Phase 0, the Suphx teacher.** Built as the lab's `lucky-cat-suphx`: the hidden tiles say which discards would deal in now, and a teacher pushes them down. It became the per-move teacher every phase-1 arm trains with.
3. **The benchmark.** A frozen table pinned by SHA-256 and a fingerprint, a fixed deck, the Table Score, and `bench.js judge` for the bar. Its PR was merged as #202.
4. **Phase 1 built.** Features v2 (854 inputs), auxiliary heads that learn the hidden tiles as targets, and the round driver `npm run ml:frontier`.
5. **Lucky Cat rounds 1–3.** 9 arms: the best (LV1a, +7.6 at its screen) failed the judgment's own screen at +4.3. The heads learned to read the table (deal-in AUC 0.87 → 0.92, waits 0.52 → 0.61), but play didn't change: the nine screens averaged −0.4 points a hand.
6. **Sphinx rounds 1–2.** Imitating its own rare wins in self-play made it win five times as often and deal in far more: SP1a, SP1b, SP1c and SP2a each lost about 43 points a hand to random play.
7. **Policy-gradient probes** (PG1–PG3). Training on what hands scored, with the heads and the teacher. PG2 and PG3 passed the screen (+8.1, +5.7), then failed to qualify (−2.4, −2.6).
8. **Pruning.** Monte Carlo search was measured and deferred until phase 3; the judgment's second screen and Sphinx's restarting arm were removed; Sphinx was paused.
9. **The native simulator.** The engine and the benchmark table's players ported to C++, bit-exact with the JS. Then three optimization rounds and a fast build, and finally the hybrid (PR #208). Phase 1 and rounds 1–3 were merged as #205.
10. **Native-scale rounds** (100,000 deals a round, 40,000-deal screens). Lucky Cat rounds 4–6: LV4b screened +4.7 and failed qualify (−10.3); LV6b screened +5.1 (2.00 SE) and went to a judgment.
11. **The loss-aware teacher.** lc32 sets its own hand back in 19.5% of its choices. `--progress` and `--fold` teach against that and against dealing in with poor prospects; probes gained about +2.4 points a hand at a moderate weight.

## Decisions

Each with why, and the evidence. Dates are when it was decided.

### The benchmark

| Decision | Why | Evidence |
| --- | --- | --- |
| **One frozen table, one fixed deck, one number** (2026-11-08) | A score from this month and one from next year must mean the same thing. The game's Neural Cat keeps changing; the benchmark's never does | [benchmark](benchmark.md) |
| **The deck at seeds 900,000,000 onward** | The first choice (90,000,000) overlapped the Only Orphans lab's ranking seeds | |
| **Two standard errors, twice** (qualify, then replicate on fresh deals) | The lab's history has several "kept" models that were level on a second look (LL6c, LL8a, LR3a). Fewer, surer steps | Plan §9 |
| **No regression measured at a table of three of each rival, not head to head** | lc32 itself loses to Jorge Yau head to head, so a head-to-head stage could never be passed. Instead the candidate and the current generation each play a table of the rival, and the candidate may not do worse | Plan §9 |
| **Sequential stopping in qualify and replicate** (blocks of 10,000, stop early at +4 or ≤ 0 SE) | Most candidates are decided long before 40,000 deals | Plan Round 4, point 6 |
| **The judgment reuses the round's screen** (`--screened`) (2026-11-09) | A second, independent 1-SE screen rejected most real gains near 1 SE. For such a gain, two in a row pass about a third of the time. Qualify and replicate still pay for picking the best of a round's arms | LV1a: +7.6, then +4.3 |

### Training

| Decision | Why | Evidence |
| --- | --- | --- |
| **The hidden tiles as targets, never as inputs** | No train/test shift: what a model is graded on reading, it can never read. The shipped model sees only its seat | Fair-play test; [fair play](fair-play.md) |
| **The auxiliary weight is low (0.2) for Lucky Cat** | Weight 1 read best but gave up hands won; 0.2 held the win rate | Round 1: LV1b −1.3 and 0.6 points fewer hands won |
| **More data and a higher rate from round 2** (lr 1e-3, 8 epochs) | Round 1 barely moved the policy (KL 0.004) | Waits AUC 0.52 → 0.61 by round 3 |
| **`--aux` with `--mode pg`, and `--teach`** (2026-11-09) | The heads only shape the shared layers; nothing in an imitation loss rewards acting on a better read | PG probes: passed the screen, failed to qualify |
| **No more rounds of the same signal** | Twelve arms screened, centred on zero. The critic explains none of the reward, so training on hand returns is luck. Phase 3's per-move value is what this needs | §11 |
| **Sphinx paused** (2026-11-09) | Its recipe (imitate its own wins from random self-play) loses about 43 points a hand to random play. It learns to race for cheap hands, and nothing teaches it defence | SP1a −43.3, SP1b −46.3, SP1c −45.1, SP2a −43.5 |
| **The rounds delete their own data, permanently** (2026-11-09) | A native-scale round writes about 2.5 GB. Deleted: data once it leaves the training window, frontier data no lineage lists (once 6 hours old), the oldest kept rounds when the next wouldn't fit (never the newest), and converted weights unused for 14 days or past 1 GB. Never: weights, reports, the benchmark, other labs' data | Frontier training, Disk space |
| **The teacher learns from losses: `--progress` and `--fold`** (2026-11-09) | Losing points and dealing in are lessons as important as winning, and so are discards that set one's own hand back. lc32 throws one in 19.5% of its choices | Probes LP0–LP3 on round 5's data: progress 100 (with or without fold 2) about +2.4 and half a point more hands won; progress 200 with fold 4 −1.9 |
| **The returns arm dropped from Lucky Cat's rounds** (from round 7) | Training on what hands scored screened near zero again in rounds 4–6 (−1.2, +2.4, +0.4), after PG1–PG3 | §11 |
| **Sphinx's wide arm trains fresh only while the champion is random** | From the second generation on, starting from scratch each round would throw away every generation it had earned | |

### Search

| Decision | Why | Evidence |
| --- | --- | --- |
| **Phase 3b (search as a teacher) deferred** (2026-11-09) | A 4-world Monte Carlo search that knew every hidden hand (an upper bound) gained nothing measurable on held-out futures; scored on its own futures it looked like +79, which is the winner's curse | +7.8 ± 8.4 points a choice, 1,600 choices |
| **Phase 4 (search at play) dropped, then deferred** (both 2026-11-09) | First dropped: 1–1.5 s a move breaks the browser promise, and the measured gain was nil. Then deferred on review: the test was too small to rule out a real gain (4 worlds against phase 4's 16–32, a ±8.4-point error), it sampled choices across the whole hand rather than the decisive late ones, and its futures were played by lc32, a weak policy. Phase 4 was always an opt-in "thinks longer" setting, so the browser promise holds for the default player | The re-test: once phase 3 exists, a 32–64-world search at decisive late-hand choices, with phase 3's value and policy playing the futures; it ships as an opt-in "thinks longer" setting only at ≥ +20 points a hand within 1.5 s a move |
| **Monte Carlo *targets* kept** | Learning a value from how hands ended is how Neural Cat learns, and phase 3's value heads do the same | |

### The native simulator

| Decision | Why | Evidence |
| --- | --- | --- |
| **Port the engine and the table's players to C++** (2026-11-09) | Playing hands, not training, set the pace: a round's data took 330 s and a screen about 16 minutes, against seconds of training | JS profile: 31% shanten, 30% Jorge Yau's reads, 18% networks |
| **Bit-exact first** | An exact port can be checked action by action against the JS, which turns every porting bug into a first differing line | It found the one real bug: V8's sort |
| **What exact took** | V8's own `exp` and `log` (fdlibm, built with fused multiply-adds), V8's sort (binary insertion under 8 elements), no fused multiply-adds elsewhere, float32 stores where the JS has Float32Arrays | 1,000,000 inputs each; 60,000 comparators; 39,000 hands identical |
| **Pin the JS the port matches** (`native/ported.json`) | A change to the JS must never silently change what a native run measures. A stale port falls back to the JS, slower but right | |
| **Weights in both forms** (JSON and `.lcmw`) | Training and the game keep JSON; the simulator reads float32 arrays. The numbers are the same, so a model trained on native data plays in the game unchanged | Trained on native data, played in the JS engine, passed fair play |
| **Three optimization rounds, none reaching 10x** | The floor is the bots' own work (about 14 discards × 10 plans a turn for Jorge Yau, and Neural Cat's network on the best 4), and neither can be skipped without changing how they play. Networks in int8 or float16 would change moves far more often than last-bit rounding | One core 148 → 308 → 371 → 384 hands a second |
| **Two things removed** | A cache of forward passes never paid for hashing its inputs; weights widened to double made it slower | |
| **A fast build beside the exact one** | Float math free to fuse and vectorize changes a move only when two tie to the last bit, which is rare | 1,000 deals identical between builds; a few flips in a 20,000-deal round |
| **The hybrid** (2026-11-09, the maintainer's call, after measuring fast-only) | Training data and screens get the speed; the benchmark's verdicts and scores stay reproducible to the decimal against the JS. A round with a judgment takes about 23 minutes this way, against about 16 fast everywhere | Compare 9.9 s fast, 15.5 s exact; data 12.9 s fast, 20 s exact |
| **Every result records its simulator** | So a number is never compared across builds without knowing it | `simulator`: `native-fast`, `native-exact` or `js` |

## Important potential issue

**The fast build is not bit-exact with the JS.** A decision between two moves tied to the last bit can go the other way. That hand then plays out differently, and the rest of its chunk's random stream with it.
- **Contained:** under the hybrid only training data and screens play on the fast build. The action-level check covers the exact build. Both builds share every line except the arithmetic, and a test checks that the fast build plays the exact build's hands.
- **Revisit:** if a screen's verdict ever sits right at 1 SE, or a result must reproduce to the decimal, use `bench.js compare --exact`.

Details are in the [frontier plan](frontier-plan.md) §6b.

## What would reopen each decision

- **Search (3b and 4):** once phase 3 exists, a 32–64-world search at decisive late-hand choices, with phase 3's value and policy playing the futures; it ships as an opt-in "thinks longer" setting only at ≥ +20 points a hand within 1.5 s a move. As a teacher (3b), the same search at the choices the value is least sure of. The native simulator makes 64 worlds cost less than 4 did in JS.
- **Sphinx:** restart with a recipe that learns defence: the per-move deal-in teacher at full weight, joining the table earlier, or the per-move value of phase 3.
- **More Lucky Cat rounds of the same recipe:** only with a new signal (phase 3's value), or screens of 40,000 deals that can see a +3-point gain.
- **Exactness:** if a screen and its judgment disagree near the bar, replay the screen with `--exact`.
- **Speed:** more cores (the BOSGAME P6 runs the simulator as it is; a Linux build needs its parity check run there first, because the C library's `pow` may differ).
