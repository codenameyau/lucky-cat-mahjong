# Frontier training: phase 1

Phase 1 of the [frontier plan](suphx-plan.md) is built. It has four parts:
- **Features v2:** who threw what, and engine facts per discard.
- **The hidden tiles as training targets**, through auxiliary heads, never as inputs.
- **A round driver for both lineages.**
- **The bar:** every round's best arm must clear [the benchmark](benchmark.md) before it becomes a generation.

```bash
npm run ml:suphx -- --lineage lucky-cat --rounds 4
npm run ml:suphx -- --lineage sphinx --rounds 10
```

## Contents

- [Features v2](#features-v2)
- [The hidden tiles as targets](#the-hidden-tiles-as-targets)
- [Data for the two lineages](#data-for-the-two-lineages)
- [The round driver](#the-round-driver)
- [Native-scale rounds (from 2026-11-09)](#native-scale-rounds-from-2026-11-09)
- [Disk space](#disk-space)
- [Not done yet](#not-done-yet)

## Features v2

`js/mahjong-frontier-net.js` keeps Lucky Cat's 376 features first and adds 478 more, for 854 in all:

| Group | Size | What it says |
| --- | --- | --- |
| piles | 3 × 3 × 34 | Each other player's own discards, claimed ones included, split by when: their last 3, the 3 before, and earlier. Lucky Cat's v1 pond pools every discard, so it can't know a tile is safe against one player and live against another. |
| afterClaim | 3 × 34 | The tile each player threw right after each of their claims: what the meld made them give up. |
| shantenAfter | 34 | For each tile kind held, on its own turn: how far from ready the hand is after discarding it (`E.shanten`). |
| wavesAfter | 34 | For each discard that leaves the hand ready: the live copies of its winning tiles (`E.winningTiles`, counted over tiles the seat hasn't seen). |
| now | 2 | Shanten and live waits of the hand as it is (claims read these). |

Shanten and waits are the engine's rules of the game, not a bot's opinion: nothing comes from `js/mahjong-bot.js`, and Jorge Yau's foundation is never called. "Live" counts only tiles the seat hasn't seen, so the wall and the other hands never enter. `js/mahjong-frontier-net.test.js` checks this:
- the encoding is unchanged when every hidden tile is shuffled;
- a v2 Lucky Cat passes the fair-play shuffle check at real positions.

The cost is about 0.1 ms a decision.

The network is Lucky Cat's: the same MLP and the same 74 outputs, read by its own forward pass. `LC.create({ weights, net: F2 })` plays a v2 model. The game doesn't load features v2 yet: a frontier model plays in the lab until it earns a place.

**lc32, widened.** `F2.widen(lc32)` gives lc32 the new inputs with their weights at zero, so it plays exactly as lc32 does. The test checks the logits match to the bit. That's how the Lucky Cat lineage starts phase 1: it fine-tunes from lc32, and what it learns to read in the new columns is new.

## The hidden tiles as targets

`ml/train_lucky.py --aux W` adds an auxiliary head (training only, never exported) on the last hidden layer. It predicts, from public inputs only:
- whether each other player is ready;
- the tiles each one waits on;
- how far each is from ready;
- the live tiles left in the wall by kind;
- whether each tile held would deal in right now.

The targets are the oracle's (`scripts/ml/oracle.js`), recorded beside every choice by `lucky.js generate --oracle`. The network is graded on reading the table at every move, from the first hand, with no train/test shift: the hidden tiles are what it learns to predict, never what it reads.

It trains together with the per-move deal-in teacher of phase 0 (`--mode oracle`) and, for Sphinx, `--imitate-wins W`, which imitates the moves of hands it won (with `--imitate-points`, each won hand's moves weighted by its points, so a big win teaches more than a cheap one). At the end it reports held-out AUCs.

**Probe** (3,000 deals of lc32-v2 at the game's table, 33,295 choices, 4 epochs from lc32-v2):

| Aux weight | Deal-in AUC | Ready AUC | Waits AUC (when ready) | KL from lc32 | Points its shares would pay now (lc32: 4.02) |
| --- | --- | --- | --- | --- | --- |
| 0 (teacher only) | — | — | — | 0.0009 | 3.71 |
| 0.05 | 0.616 | 0.654 | 0.495 | 0.009 | 3.72 |
| 0.2 | 0.742 | 0.790 | 0.497 | 0.020 | 3.78 |
| 1 | **0.781** | 0.825 | 0.501 | 0.057 | 3.30 |

What it says:
- **The table is readable from public inputs.** At weight 1, the deal-in head clears the plan's phase-1 bar (AUC ≥ 0.75) on the first small data set.
- **Which tiles an opponent waits on isn't learned yet.** AUC is 0.50: only about 2,400 ready positions, about 1.6 winning tiles each. It needs far more data, or it needs phase 2's tile-structured network.
- **Weight trades reading for distance from lc32.** The Lucky Cat lineage cares about staying close to lc32; Sphinx doesn't. So Lucky Cat's arms run at 0.2 and 1, and the benchmark decides.

None of this is a table result yet: no frontier model has played its screen.

## Data for the two lineages

`lucky.js generate --features v2` (the default for a v2 model) records v2 rows. With `--oracle`, each row also carries the 312 hidden-tile labels, for 1,166 values a row.

`--sample-won P` keeps every move of a hand the learner won with chance P, and every other move at `--sample`. Sphinx's first rounds are self-play among random players, who win 0.33% of their seats (53 hands in 4,000 deals). Sampling them like the rest would lose the few wins the network learns from.

## The round driver

`scripts/ml/frontier.js --lineage <name>` runs rounds. Each round goes:
1. **Generate.** The champion plays with the hidden tiles recorded.
2. **Train** three arms.
3. **Screen** each arm against the champion: 10,000 fresh paired deals at the benchmark table.
4. **Judge** the best arm with a gap of at least 1 standard error, through all five stages of the bar (`bench.js judge --vs champion --promote`).

Only a pass makes a new champion, recorded in `bench/lineages.json` with its Table Score. State and log are in `ml/frontier/<lineage>/`.

| | Lucky Cat | Sphinx |
| --- | --- | --- |
| Starts from | lc32 widened to v2 (`lc32v2`) | `sp0`: zero weights, random play |
| Data a round | 20,000 deals, one seat at the game's table (Neural Cat, Jorge Yau, Neural Cat), half the choices | 50,000 deals of self-play among its last four generations for 2 rounds, then 2 seats against them, Jorge Yau and Neural Cat; every won hand kept, 2–10% of the rest |
| Arms | From round 2: teacher + aux 0.2 at lr 3e-4 for 4 epochs (the control, round 1's best); the same at lr 1e-3 for 8 epochs; and that with a sharper teacher (danger-tau 50). Round 1 ran aux 0.2, aux 1, and danger-tau 50, all at lr 3e-4 for 4 epochs. All are fine-tuned from the champion | Imitate its wins + teacher + aux 1; imitate harder (3) + aux 0.3; a fresh 512, 256 network on the same data |
| The bar | Its win rate is kept (`keepWinRate`) | No win-rate rule |

With the [native simulator](native.md) built, the round runs natively as a hybrid: its data and screens on the fast build, its judgment on the exact build (every hand as the JS plays it). A round of Lucky Cat is about 15 seconds of data, a few minutes of training, about 4 minutes of screens, and a judgment about 19 minutes when an arm passes. In JS the same round took 13 minutes of data and 1.5 hours of screening, and a judgment 1–6 hours.

The judgment takes the round's own screen (`judge --screened`), so the best arm doesn't have to pass a second, independent 10,000-deal screen before it qualifies.

## Native-scale rounds (from 2026-11-09)

With the [native simulator](native.md), a round's data costs seconds instead of minutes, so the rounds are rescaled. That answers two things rounds 1–3 left open: the heads read better with more data (waits AUC 0.52 → 0.61 over 3 rounds), and a 10,000-deal screen couldn't see a +3-point arm.

| | Lucky Cat (from round 4) | Sphinx v2 (restarted) |
| --- | --- | --- |
| Data a round | 100,000 deals (5x), one seat at the game's table, half the choices; the last 2 rounds kept | 100,000 deals, one seat at the game's table from round 1 (later with its last 2 generations in the pool); every won hand kept, 10% of the rest |
| Screen | 40,000 deals (one standard error about 2.5 points a hand) | 40,000 deals against its current generation |
| Arms | Rounds 4–6: a: teacher + aux 0.2, lr 1e-3, 8 epochs (LV3b's recipe); b: the same with aux 0.05; c: returns (`--mode pg`, hidden-tile critic) + teacher 0.5 + aux 0.05. From round 7: aux 0.05, alone, with progress 100 and fold 2, and with progress 50 and fold 2 (see below) | All with progress and fold: a: imitate wins + teacher + aux 1 (v1's recipe, now at the table); b: teacher + aux 1, no imitation (defence first); c: imitate 0.3 + harder progress (200) and fold (4). Rounds 4–6: every arm built on b (no imitation), and every arm lost to random play. **From round 7, more aggressive than defensive** (the maintainer's call): no fold, a softer deal-in teacher (danger-tau 300), progress, and wins imitated by their points (`--imitate-points`): a: progress 150 + imitate 0.2; b: progress 200, no imitation; c: progress 100 + imitate 0.3. **From round 10, offence alone** (imitating wins made it reckless): no imitation, no fold; a: danger-tau 150, progress 200; b: danger-tau 200, progress 200; c: danger-tau 200, progress 100 |
| Judgment | `--screened`, then qualify and replicate on the exact build | the same, without the win-rate rule |

**Why Sphinx restarted.** v1 played its first rounds in self-play among random players. The deal-in teacher learned what random opponents punish, and every arm lost about 43 points a hand to random play at the benchmark table. v2 learns at the table it's judged at, from its first round. v1's log and state are kept in `ml/frontier/sphinx-v1/`.

**Memory.** `train_lucky.py` keeps the data in float16, as the shards store it, and widens one batch at a time. Two native-scale rounds (about 2.2 million rows of 1,166 values) fit in about 5 GB.

A round of Lucky Cat now takes about a minute of data, about 8 minutes of training, 10 minutes of screens, and a judgment of about 20 minutes on the exact build when an arm passes.

## Learning from losses: the loss-aware teacher (from 2026-11-09)

The deal-in teacher (`--mode oracle`) pushes down each discard by what it would pay right now. Two options widen what it teaches, so that losses and silly mistakes count as much as wins:

- **`--progress P`: discards that set the hand back.** For each tile held, the shanten after discarding it (features v2 already record it, inputs 784–817) against the best discard available. A discard that is worse costs P for each step it sets the hand back, scaled by the hand's prospects, so a hand close to ready is protected most.
- **`--fold F`: when to fold.** Prospects come from the best shanten (1 when ready, 0.8 one away, 0.5 two away, 0.25 further) times the wall left. With poor prospects, a discard's deal-in cost is multiplied by up to 1 + F, so a hand that can't win soon is pushed hardest to play safe.

Both read only the seat's own hand and the wall count it can see; neither adds an input. The trainer reports the share of the policy on set-back discards, against the champion's.

**lc32 throws a set-back discard in 19.5% of its choices** (215,135 of 1.1 million, round 5's data). Probes on that data, each screened on 40,000 deals against lc32v2:

| Probe | Settings | Set-back share | Gap (points a hand) | Hands won | Dealt in | Average win |
| --- | --- | --- | --- | --- | --- | --- |
| LP0 | the teacher alone (the control) | 19.5% | +1.8 ± 2.5 | 24.41% | 12.90% | 178 |
| LP1 | progress 100 | 17.1% | +2.5 ± 2.8 | 24.95% | | 167 |
| LP2 | progress 100, fold 2 | 17.2% | +2.3 ± 2.8 | 24.98% | 12.67% | 162 |
| LP3 | progress 200, fold 4 | 14.1% | −1.9 ± 3.1 | 23.95% | | 139 |

What it says:
- **A moderate weight helps a little:** LP1 and LP2 win half a point more hands than the control and deal in less, but their wins are smaller, so points move by under one standard error.
- **Pushed hard, it costs points:** LP3 sets the hand back least, but its wins shrink to 139 points. Some set-back discards are right: breaking a fast hand to keep a valuable one.
- **Changed:** from round 7, Lucky Cat's arms are the best recipe of rounds 4–6 (teacher + aux 0.05), that with progress 100 and fold 2, and that with a gentler progress 50.
- **Changed again from round 10:** rounds 7–9 screened +2.4 ± 0.9 on average and kept nothing ([frontier plan §11](suphx-plan.md)). Lucky Cat now keeps 4 rounds of data instead of 2. Its arms are progress 50 with fold 2 (the control), fold 2 alone, and progress 50 with fold 2 at lr 5e-4 for 16 epochs. Sphinx's arms all drop the imitation of its own wins: the no-imitation teacher, the same pushed twice as hard (progress 200, fold 4), and the same at lr 3e-4 for 12 epochs.

## Disk space

A native-scale round writes about 2.5 GB of data, so the round driver manages the disk itself (`scripts/ml/disk.js`). It deletes **permanently**, by rules that only remove what can never be read again:

- **A round's data leaves with its training window.** Once a lineage's data falls outside the last `keep` rounds (2 at native scale), it's deleted at once. Its seed and the model that played it are in the lineage's state, so it could be played again.
- **Orphaned frontier data goes at the start of each round.** That's a `lv-<n>` or `sp-<n>` set no lineage's `state.json` lists, such as a crashed run's, a smoke run's, or an archived lineage's. It must be at least 6 hours old, so a set still being written by another run is never caught.
- **Room before each round.** The round needs its expected size (the last round's, scaled to its deals) plus 10 GB. If the disk is short, the oldest kept rounds go first, always keeping the newest. If that still isn't enough, the round stops with a message instead of filling the disk.
- **Converted weights are a cache.** `native/build/cache/*.lcmw` files are made again whenever they're needed, so those unused for 14 days go, as does anything past 1 GB (oldest first).

Never touched: model weights (`ml/models/`), logs and reports, the benchmark, and data that isn't a frontier round. Other labs prune their own data (`scripts/ml/prune-data.js`, to the Trash). `scripts/ml/disk.test.js` checks the rules on temporary folders.

## Not done yet

- **The phase-1 bar on the table:** ≥ +25 points a hand over the phase-0 champion and deal-ins at the table ≤ 11%. Rounds 4–6 moved points by at most about +5 a hand.
- **Value-guided exploration, the distributional value and the policy-iteration step** are phase 3. The tile-structured network is phase 2.
