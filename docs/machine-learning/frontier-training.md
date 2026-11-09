# Frontier training: phase 1

Phase 1 of the [frontier plan](frontier-plan.md) is built. It has four parts:
- **Features v2:** who threw what, and engine facts per discard.
- **The hidden tiles as training targets**, through auxiliary heads, never as inputs.
- **A round driver for both lineages.**
- **The bar:** every round's best arm must clear [the benchmark](benchmark.md) before it becomes a generation.

```bash
npm run ml:frontier -- --lineage lucky-cat --rounds 4
npm run ml:frontier -- --lineage sphinx --rounds 10
```

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

It trains together with the per-move deal-in teacher of phase 0 (`--mode oracle`) and, for Sphinx, `--imitate-wins W`, which imitates the moves of hands it won. At the end it reports held-out AUCs.

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
| Arms | a: teacher + aux 0.2, lr 1e-3, 8 epochs (LV3b's recipe); b: the same with aux 0.05; c: returns (`--mode pg`, hidden-tile critic) + teacher 0.5 + aux 0.05 | a: imitate wins + teacher + aux 1 (v1's recipe, now at the table); b: teacher + aux 1, no imitation (defence first); c: imitate 0.3 + a sharper teacher |
| Judgment | `--screened`, then qualify and replicate on the exact build | the same, without the win-rate rule |

**Why Sphinx restarted.** v1 played its first rounds in self-play among random players. The deal-in teacher learned what random opponents punish, and every arm lost about 43 points a hand to random play at the benchmark table. v2 learns at the table it's judged at, from its first round. v1's log and state are kept in `ml/frontier/sphinx-v1/`.

**Memory.** `train_lucky.py` keeps the data in float16, as the shards store it, and widens one batch at a time. Two native-scale rounds (about 2.2 million rows of 1,166 values) fit in about 5 GB.

A round of Lucky Cat now takes about a minute of data, about 8 minutes of training, 10 minutes of screens, and a judgment of about 20 minutes on the exact build when an arm passes.

## Not done yet

- **No frontier round has run at full size:** the machine is training Neural Cat. They are queued after it, and after lc32's Table Score.
- **The phase-1 bar on the table:** ≥ +25 points a hand over the phase-0 champion and deal-ins at the table ≤ 11%. Unknown until the rounds run.
- **Value-guided exploration, the distributional value and the policy-iteration step** are phase 3. The tile-structured network is phase 2.
