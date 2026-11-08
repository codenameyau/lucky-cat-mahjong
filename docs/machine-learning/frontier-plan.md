# Lucky Cat as the frontier Hong Kong mahjong player: the plan

Written 2026-11-08. Suphx ([Li et al. 2020](https://arxiv.org/abs/2003.13590)) was built for Japanese riichi mahjong. This page takes it apart against Hong Kong rules and this engine, argues the design through three rounds of critique, and ends in a plan with phases, numbers to hit, and the point at which each phase is dropped. The Suphx teacher already in the lab ([iterations](iterations.md#suphx-for-lucky-cat-an-oracle-teacher-not-an-oracle-critic)) is phase 0 of this plan.

Everything here must keep two promises: the shipped model reads only what its seat can see (`js/mahjong-fair-play.test.js`), and it runs in plain JS in the browser in a few milliseconds a move.

## 1. What Suphx is, and what Hong Kong mahjong changes

| Suphx | Why it's there in riichi | In Hong Kong mahjong, in this engine |
| --- | --- | --- |
| **Five networks**: discard, riichi, chow, pung, kong | Riichi is a declaration with its own payoff | No riichi. One network with action heads (what Lucky Cat has) is simpler and lets the heads share what they learn |
| **Global reward prediction**: a GRU predicts the game's final placement from the round's state, and each round's reward is the change in that prediction | A riichi game is 8+ rounds and the prize is placement (uma/oka), so a round's points mean different things in different positions | Points settle every hand and there is no placement bonus. Points a hand is the right objective; the predictor is dead weight. **Drop it** |
| **Oracle guiding**: train with every hidden tile as input, drop those inputs out to zero | Hidden information is large and learning is slow without it | Same hidden information. But probed here, a critic with every tile in view explained about 0% of a hand's points. The hidden tiles pay off **per move** (what does this discard pay right now?), not per hand. **Keep the idea, change where it's applied** (§3) |
| **Run-time policy adaptation**: at the start of a round, simulate with the private hand fixed and fine-tune the policy | Cheap on a server | Not in a browser bot's turn. **Replace with a search option the browser can afford** (§5, phase 4) |
| **Deep residual CNN over 34-tile channels**, with hand-crafted look-ahead features (what each discard leads to, from a search of the hand) | Tile adjacency within a suit is where chows live; look-ahead is expert knowledge the net needn't rediscover | Lucky Cat is a flat 376-256-128 MLP with no look-ahead features. This is the biggest gap (§2, §4) |
| **Supervised start from millions of human games on Tenhou**, then policy gradient with entropy regularization, distributed self-play | Human data exists | No human data. Lucky Cat started at random and needed a million hands to learn what the rule bots knew. But the engine is deterministic and fast, and the rule bots encode expert knowledge: facts from the engine can be inputs, and the bots can be opponents, without Lucky Cat copying their opinions |

Two rules of Hong Kong scoring change the learning problem more than any of this:

- **Payout is exponential in faan**: 8 × 2^(faan − 3), from 8 at 3 faan to 8,192 at the 13-faan limit, and a self-draw collects from all three. One limit hand is worth a thousand 3-faan hands. The variance of points a hand is enormous and dominated by rare hands, which is why every points-first critic here explained under 1% of it. A scalar point reward is the wrong learning target; the **distribution** (how the hand ends, and at what faan) is learnable, and expected points follow from it analytically. Neural Cat already learns this way and is the reason it scores more points.
- **On a discard win, only the discarder pays.** Deal-ins are the whole defensive game: there is no shared payment, no tenpai fee, no riichi stick. At the game's table, lc32 deals in on 13–18% of hands and a Neural Cat win is worth about 1,800 points, so one deal-in costs ten of Lucky Cat's wins. **Deal-in avoidance is the single largest lever** for a bot that already wins often.

## 2. What Lucky Cat lacks today

Reading `js/mahjong-lucky-cat-net.js`'s layout against what a strong human sees:

- **No per-player discards.** `pond` is every discard pooled; `players` has only each opponent's discard counts by suit. The network cannot know *who* threw a tile, so it cannot know a tile is safe against one opponent (they discarded it, so they can't be waiting on it by the standard shapes a human reads) and dangerous against another. Every defensive read starts from exactly that.
- **No order or recency.** When a tile was thrown, and what an opponent threw right after claiming, say more than how many.
- **No engine facts.** Shanten after each discard, the tiles that would complete the hand and how many are live, the faan the hand would score now, which scoring patterns are still reachable: the engine computes all of these exactly and Suphx fed their riichi equivalents in as look-ahead features. Lucky Cat rediscovers them, badly, from counts.
- **A flat MLP** over 34-tile vectors has no notion that 3 Bamboo sits between 2 and 4. Chows, runs and suit structure are learned one weight at a time.
- **One scalar signal.** It has learned from wins (imitation), from the hand's points (policy gradient), and from replays. Never from a dense, exact, per-move target.

## 3. The argument, in three rounds

### Round 1: port Suphx as it is

*Proposal.* Record every hidden tile, train an oracle policy with those inputs, anneal the oracle inputs to zero, then run policy gradient on the hand's points with a critic that also sees the hidden tiles, judged at the game's table.

*Critique.*
- The hidden-tile critic was probed on 108,559 choices: −1.2% of the variance explained, against −1.4% without the tiles. The oracle doesn't fix the reward; the reward is the problem (§1).
- Oracle inputs to the policy create a train/test shift the annealing must heal. The one-wall replays (LR1–LR3) already showed what a policy that learns from tiles it can't see learns: luck. Annealing makes it gentler, not different in kind.
- Policy gradient on 20,000 deals a round moves the policy a KL of 0.0005–0.005: it is mostly re-fitting the champion. Suphx had orders of magnitude more self-play and a strong supervised start.

*What survives.* Recording the hidden tiles. Judging at the table. Entropy regularization.

### Round 2: use the hidden tiles per move, not per hand

*Proposal.* The oracle labels what each discard would pay *right now* (the engine's own win check). A teacher pushes those discards down by their cost; the public network is distilled to the teacher. This is the lab's `lucky-cat-suphx` (phase 0). First check: +14.8 ± 6.7 points a hand over lc32 at the table on 2,000 deals, same win rate, deal-ins 13.0% vs 13.4%.

*Critique.*
- **It only sees the last moment.** A discard that deals in right now is 4.2% of choices. Most deal-ins are set up two or three discards earlier, when the dangerous tile could have gone safely, or when a tile fed an opponent's set. The teacher says nothing there.
- **It teaches what to avoid, not what to do.** Nothing in it makes wins bigger or faster.
- **It inherits Lucky Cat's blindness.** The network must infer danger from a pooled pond. However good the teacher, a student that can't see who discarded what tops out early.
- **The labels could be richer at no cost.** The oracle knows whether each opponent is ready, on which tiles, how far from ready, and what's in the wall. Using it only as a push on the policy wastes most of it.

*What survives.* Exact per-move labels from the engine. Distillation with a KL leash, so the champion's strengths aren't lost.

### Round 3: privileged labels as targets, a structured network, a distributional value

*Proposal.*
1. **Auxiliary heads supervised by the oracle.** For each opponent: ready or not; for each tile, would it complete their hand; how far from ready. For the wall: tiles left by kind. These are exact labels with no train/test shift: the hidden tiles are **targets, never inputs**. The network learns to read the table the way a strong player does because it is graded on it, every move, from the first hand. This is the step past Suphx: oracle guiding as prediction, not as input.
2. **Inputs that contain the game.** Per-player discard piles with order and "after a claim" marks, melds with the tile claimed and from whom, and engine facts per legal discard: shanten after it, live tiles that complete the hand after it, the faan the hand scores now and the best pattern still reachable. Facts, not the rule bots' choices.
3. **A tile-structured network.** Tokens for the 34 tile kinds (plus a global token), a few layers of attention or 1-D convolution within suits, then the heads. Chows become local, and "the same tile in four piles" becomes one token's channels. Sized so a move costs about 10 ms in plain JS.
4. **A distributional afterstate value.** A discard leaves a deterministic position; a claim leaves one too. Value that position as a distribution over how the hand ends (win by self-draw, win off a discard, deal in, another seat wins, draw) and the faan paid or won, exactly as Neural Cat does. Expected points fall out of the distribution; the heavy tail is in the table, not in the regression. Trained on every hand of every seat played, won or lost.
5. **Policy improvement that keeps the leash.** The policy target each round is the champion's shares reweighted by exp(advantage / tau), where the advantage comes from the afterstate value (every legal move, every choice) sharpened by counterfactual replays on reshuffled futures at the choices the value is least sure of (what the LF lab builds). Suphx's PPO moved too little per round here; regularized policy iteration moves exactly as far as the evidence says.
6. **A league, not a fixed table.** Data comes from a pool: the champion, its last champions, Neural Cat (several releases), Jorge Yau, Lucky Cat Classic, Only Orphans. Judging has two parts: the game's table (what players meet) and a round robin against the pool. Shipping needs a gain at the table and no loss anywhere in the pool.

*Critique.*
- **Cost.** Items 2–4 are a new feature version, a new network with a JS forward and parity tests, and new training code: weeks, not a lab round. Answer: phase it (§5). Each phase ships on its own or is dropped on its own.
- **Lucky Cat's identity.** It is "a network that taught itself"; engine facts as inputs blur that. Answer: shanten, waits and faan are rules of the game, as the tile counts are. The rule bots' *plans and preferences* stay out. Jorge Yau's foundation is never called.
- **Afterstate value needs a lot of data.** Neural Cat trains on 50,000 deals a round and every seat. Answer: the oracle rounds record 1 learner seat and half its choices (300 MB a round). Record all four seats' outcomes for the value heads (small: outcome, faan, seat) and sample the policy rows. The engine does about 20 deals a second a worker with replays, about 60 without; a day on 8 workers is 1–4 million hands.
- **Overfitting the table.** A champion trained and judged against two Neural Cats and Jorge Yau can learn their tells. Answer: the league (item 6), plus a held-out opponent never trained against (an older Neural Cat release) in the shipping check.
- **Browser cost.** Attention over 35 tokens at width 96 for 4 layers is about 11 million multiply-adds; the current MLP is about 130,000. Answer: measured budget of 10 ms a move on a phone, with the width and depth set by that measurement, not by taste.
- **Search.** The strongest riichi programs don't search at play time either; Suphx's adaptation is offline-ish. Answer: search is the last phase and optional, a "thinks longer" setting.

## 4. The target architecture

Inputs, per decision (feature version 2):
- 34 tile tokens, each with: own copies (one-hot 0–4), own meld copies, copies in each opponent's pile with recency buckets (last 3 discards, last 6, earlier), discarded right after a claim by that opponent, copies in shown melds by opponent, unseen copies, the tile on offer, and the engine facts for discarding it (legal; shanten after; live completing tiles after, bucketed; faan the hand would hold).
- A global token: seat and round winds, dealer, wall left, flowers by seat, each opponent's melds and claims and discard count, mode (turn or claim), who offered.
- Suit structure: tokens carry suit and rank embeddings; attention is unrestricted (honors and suits attend freely), with a local 1-D convolution within each suit before the first attention layer.

Heads:
- **Policy**: 74 logits (as now), masked to legal moves.
- **Afterstate value**: for the position after each legal own move, 6 outcome logits + 11 win-faan + 11 pay-faan (Neural Cat's heads). Evaluated for every legal move in one forward pass by conditioning on the move token.
- **Auxiliary (oracle-supervised, training only; cheap to keep at play for the coach)**: per opponent ready (3), per opponent per tile completes-their-hand (3 × 34), per opponent steps from ready (3), wall counts (34), and the exact cost of each own discard now (34).

Size target: 4 layers, width 96, 4 heads; about 11 million multiply-adds a move; weights about 400 KB in float16. Measured on a mid-range phone before the width is fixed.

## 5. Phases, numbers and kill criteria

Each phase has a result it must show on 40,000 fresh deals at the game's table (candidate and champion in every seat on the same deals, points first, win rate within one standard error), and a reason to stop.

| Phase | What | Must show | Dropped if |
| --- | --- | --- | --- |
| **0** Suphx teacher (built, `--strategy lucky-cat-suphx`) | Per-move danger teacher, distilled | ≥ +10 points a hand over lc32, win rate held | Three rounds without a kept model |
| **1** Labels as targets | Oracle-supervised auxiliary heads on the current MLP and features; distill policy from the champion with the teacher | Deal-in head AUC ≥ 0.80 on held-out hands; ≥ +10 over the phase-0 champion | Heads below AUC 0.70: the inputs can't carry it (go to phase 2 first) |
| **2** Features v2 + structured net | Per-player ordered piles, engine facts, tile tokens, JS forward, parity and fair-play tests, 10 ms budget | Same training as phase 1 but ≥ +25 over its champion; deal-ins at the table ≤ 11% | Can't meet 10 ms on a phone at a width that beats the MLP |
| **3** Distributional value + policy iteration + league | Afterstate value heads; exp(advantage / tau) targets with futures replays at uncertain choices; league pool; two-part judging | ≥ +40 over the phase-2 champion; no loss against any pool member; expected-points correlation with realized points ≥ 0.25 on held-out hands | Two full rounds without a kept model after the value heads reach that correlation |
| **4** Search (optional) | At play, sample opponent hands from the auxiliary heads' beliefs, roll out a few dozen futures per candidate move in a worker; a "thinks longer" setting | ≥ +20 over the phase-3 champion at ≤ 1.5 s a move | Gain under one standard error at 1.5 s |

Numbers are chosen to be clear on 40,000 deals: one standard error there is about 3.5 points a hand, so every bar is at least three of them.

Documentation rule, unchanged: every model that ships gets its iteration written up (the thinking, what the bot does differently), the Lucky Cat playbook updated, the game version bumped.

## 6. What this plan would make Lucky Cat

A network that still decides every move itself, that reads the table the way a strong player does because it was graded on reading it, that values hands by their whole distribution of outcomes in a scoring system where one hand can be worth a thousand, and that folds exactly when the risk says so. It should win as often as lc32 and lose far fewer points doing it. Whether it becomes the strongest Hong Kong mahjong player anywhere is not something a plan can promise; the evaluation suite in phase 3 is what would show it, and the phases are built so each one earns the next.
