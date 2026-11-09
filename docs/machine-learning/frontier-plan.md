# Lucky Cat as the frontier Hong Kong mahjong player: the plan

Written 2026-11-08. Suphx ([Li et al. 2020](https://arxiv.org/abs/2003.13590)) was built for Japanese riichi mahjong. This page takes it apart against Hong Kong rules and this engine, argues the design through four rounds of critique, and ends in a plan with phases, numbers to hit, and the point at which each phase is dropped. The Suphx teacher already in the lab ([iterations](iterations.md#suphx-for-lucky-cat-an-oracle-teacher-not-an-oracle-critic)) is phase 0 of this plan.

Everything here must keep two promises: the shipped model reads only what its seat can see (`js/mahjong-fair-play.test.js`), and it runs in plain JS in the browser in a few milliseconds a move.

## Where it stands (2026-11-09)

| Phase | State |
| --- | --- |
| Benchmark (§9) | **Built.** `npm run ml:bench`: the frozen table (NC8, Jorge Yau, NC8 at 0.57.9), the 40,000-deal deck, the Table Score, and `judge` for the five-stage bar ([benchmark](benchmark.md)) |
| Native simulator | **Built.** The engine and the table's players in C++ (`native/`, [native simulator](native.md)), playing every hand exactly as the JS does: data and judging 8–10x faster |
| 0 Suphx teacher | Built as the lab's `lucky-cat-suphx`. It is folded into phase 1 as the per-move deal-in teacher every arm trains with |
| 1 Features v2, labels as targets | **Built and training.** `npm run ml:frontier` ([frontier training](frontier-training.md)). Lucky Cat rounds 1–3 kept nothing (9 arms, best LV1a, which failed the bar); lc32v2 is still champion. Returns-trained probes (PG2, PG3) passed the screen and failed to qualify. Sphinx paused after round 1 (its recipe lost 43 points a hand to random play) |
| 2 Structured network | Designed (§4); not built. Starts when the phase-1 MLP stops improving |
| 3 Value, policy iteration, league, pipeline | Designed (§4, §5, §6); not built |
| 3b Search as a teacher | **Deferred.** A Monte Carlo search with perfect beliefs added nothing measurable (§11); revisit only once the value heads exist |
| 4 Search at play (optional) | **Dropped.** 1–1.5 s a move breaks the browser promise, and search measured no gain (§11) |

What each phase has taught is in [§11 Learnings](#11-learnings).

This table is updated as phases move. The full record of every round is `ml/frontier/<lineage>/frontier.log`. Kept generations go in `bench/lineages.json` and their Table Scores in `bench/scores.json`.

## 1. What Suphx is, and what Hong Kong mahjong changes

| Suphx | Why it's there in riichi | In Hong Kong mahjong, in this engine |
| --- | --- | --- |
| **Five networks**: discard, riichi, chow, pung, kong | Riichi is a declaration with its own payoff | No riichi. One network with action heads (what Lucky Cat has) is simpler and lets the heads share what they learn |
| **Global reward prediction**: a GRU predicts the game's final placement from the round's state, and each round's reward is the change in that prediction | A riichi game is 8+ rounds and the prize is placement (uma/oka), so a round's points mean different things in different positions | Points settle every hand and there is no placement bonus. Points a hand is the right objective; the predictor is dead weight. **Drop it** |
| **Oracle guiding**: train with every hidden tile as input, drop those inputs out to zero | Hidden information is large and learning is slow without it | Same hidden information. But probed here, a critic with every tile in view explained about 0% of a hand's points. The hidden tiles pay off **per move** (what does this discard pay right now?), not per hand. **Keep the idea, change where it's applied** (§3) |
| **Run-time policy adaptation**: at the start of a round, simulate with the private hand fixed and fine-tune the policy | Cheap on a server | Not in a browser bot's turn. **Replace with a search option the browser can afford** (§5, §7 phase 4) |
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

## 3. The argument, in four rounds

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
- **Cost.** Items 2–4 are a new feature version, a new network with a JS forward and parity tests, and new training code: weeks, not a lab round. Answer: phase it (§7). Each phase ships on its own or is dropped on its own.
- **Lucky Cat's identity.** It is "a network that taught itself"; engine facts as inputs blur that. Answer: shanten, waits and faan are rules of the game, as the tile counts are. The rule bots' *plans and preferences* stay out. Jorge Yau's foundation is never called.
- **Afterstate value needs a lot of data.** Neural Cat trains on 50,000 deals a round and every seat. Answer: the oracle rounds record 1 learner seat and half its choices (300 MB a round). Record all four seats' outcomes for the value heads (small: outcome, faan, seat) and sample the policy rows. The engine does about 20 deals a second a worker with replays, about 60 without; a day on 8 workers is 1–4 million hands.
- **Overfitting the table.** A champion trained and judged against two Neural Cats and Jorge Yau can learn their tells. Answer: the league (item 6), plus a held-out opponent never trained against (an older Neural Cat release) in the shipping check.
- **Browser cost.** Attention over 35 tokens at width 96 for 4 layers is about 11 million multiply-adds; the current MLP is about 130,000. Answer: measured budget of 10 ms a move on a phone, with the width and depth set by that measurement, not by taste.
- **Search.** The strongest riichi programs don't search at play time either; Suphx's adaptation is offline-ish. Answer: search is the last phase and optional, a "thinks longer" setting.


### Round 4: the plan itself critiqued

Read back, the plan above has seven weak points. Each gets a fix below, and the sections after this one are written with the fixes in.

1. **Phases 0 and 1 polish the wrong thing.** Section 2 says the biggest gap is the inputs (no per-player piles), yet phases 0 and 1 train the old inputs harder, and phase 1's work is thrown away when phase 2 changes them. *Fix:* separate inputs from architecture. Features v2 on the **current MLP** is cheap (a longer input vector, no new JS forward) and is where the information is; it becomes phase 1. The structured network becomes phase 2 and is built only if the MLP on v2 plateaus. A network that can't see who threw what cannot learn defence, whatever the signal.
2. **It can never leave lc32.** Every phase distills from the champion with a KL leash. lc32 was trained to win fast and small; a leash keeps every successor in that basin. Suphx's single biggest ingredient was a supervised start from strong play (millions of human games), and this plan has none. *Fix:* **a second lineage that owes lc32 nothing.** Sphinx (§9) trains from random weights on the new architecture and the full pipeline, under the same benchmark, so the plan is never hostage to lc32's habits. Suphx's own answer, a supervised start from strong play (Neural Cat's choices on millions of positions are free to generate), is held in reserve as Sphinx-W: allowed only if Sphinx stalls, flagged, and judged separately, so neither lineage copies anyone unless it has to.
3. **"Every legal move in one forward pass by conditioning on the move token" is hand-waving.** An exact afterstate value means one pass per legal discard, as Neural Cat does: 14 × 11 million multiply-adds is 150 million a turn, far past the browser budget. *Fix:* the **per-tile tokens already give per-discard outputs**. Token *i* carries the policy logit for discarding tile *i* and its distributional Q (outcome × faan) for that discard; the global token carries the claim and kong heads. One pass, every move valued. This is the DQN form of the value, chosen for cost; Neural Cat's exact afterstate pass is the yardstick it is checked against offline.
4. **The data numbers were guessed.** "20 deals a second a worker with replays, 60 without" was not measured. Measured: with the hidden tiles recorded, 5,000 deals took 280 s on 5 workers, about **3.6 deals a second a worker**; the danger row (a win check per held tile per opponent per choice) is most of the cost. On 8 workers that is about 2.5 million deals a day, enough, but every budget below uses the measured figure.
5. **Exploration is undirected.** Sampling the policy at a temperature spreads probability over bad tiles as much as over promising lines; a policy that never tries a flush never learns what a flush is worth, and in Hong Kong scoring the big hands are the points. *Fix:* **value-guided exploration** in data generation: sample moves in proportion to exp(Q / tau) from the value head (Boltzmann over Q), not from the policy. Exploration then goes where the value says the points might be, and the entropy target keeps it from collapsing.
6. **Judging is slow and the north star is vague.** 40,000 deals in every seat is 320,000 hands a candidate, and "frontier" has no number. *Fix:* **sequential testing** (SPRT, as chess engines use): judge in blocks of 5,000 deals and stop as soon as the paired gap is clearly past the bar or clearly short of it; most candidates resolve in 10,000–15,000. And one north-star metric: **points a hand at the game's table against two Neural Cat NC8 and Jorge Yau.** lc32 is at −98.7. Zero is parity with the strongest model in the game; above zero, Lucky Cat is the strongest player at its own table. A **benchmark** (§9): one frozen table, one fixed deck, one number per model (the Table Score), and a bar of two standard errors, replicated, before anything becomes the next generation.
7. **The lab is a loop of rounds, not a pipeline.** Generate, train, judge, one after another on one machine, so the GPU idles while the engine plays and the engine idles while the GPU trains. *Fix:* §6 below separates the two, with a replay buffer across rounds.

*What this round changes.* Phase 1 is now features v2 on the MLP (the warm start is held in reserve, §9); phase 2 is the structured network with per-tile heads; phase 3 adds value-guided exploration and sequential judging; and the north star is written down.

## 4. The target architecture

Inputs, per decision (feature version 2):
- 34 tile tokens, each with: own copies (one-hot 0–4), own meld copies, copies in each opponent's pile with recency buckets (last 3 discards, last 6, earlier), discarded right after a claim by that opponent, copies in shown melds by opponent, unseen copies, the tile on offer, and the engine facts for discarding it (legal; shanten after; live completing tiles after, bucketed; faan the hand would hold).
- A global token: seat and round winds, dealer, wall left, flowers by seat, each opponent's melds and claims and discard count, mode (turn or claim), who offered.
- Suit structure: tokens carry suit and rank embeddings; attention is unrestricted (honors and suits attend freely), with a local 1-D convolution within each suit before the first attention layer.

Heads:
- **Policy**: 74 logits (as now), masked to legal moves.
- **Per-move distributional value**: from tile token *i*, 6 outcome logits + 11 win-faan + 11 pay-faan (Neural Cat's heads) for discarding tile *i*; from the global token, the same for each claim and kong option. One pass values every legal move. Offline it is checked against Neural Cat's exact afterstate pass; at play the one pass is what the budget allows.
- **Auxiliary (oracle-supervised, training only; cheap to keep at play for the coach)**: per opponent ready (3), per opponent per tile completes-their-hand (3 × 34), per opponent steps from ready (3), wall counts (34), and the exact cost of each own discard now (34).

Size target: 4 layers, width 96, 4 heads; about 11 million multiply-adds a move; weights about 400 KB in float16. Measured on a mid-range phone before the width is fixed.

**Before any of that: features v2 on the current MLP** (phase 1). The same inputs flattened (about 34 × 20 tile channels plus the global features, around 800 values), the current two hidden layers, the current 74 outputs plus the auxiliary heads. No new JS forward, no parity work beyond the feature encoder. If this alone takes the deal-in rate at the table under 11% and clears its bar, the structured network waits until the MLP plateaus.

**The warm start, held in reserve.** Neural Cat and Jorge Yau could play the game's table with every position and move recorded (several million a day), and a new network trained to imitate them before the value and policy steps take over, as Suphx did with human games. Section 9 keeps both lineages free of it: Lucky Cat never copied anyone and Sphinx learns from the ground up. It stays in the plan as the fallback variant Sphinx-W, allowed only if Sphinx stalls, and judged separately.

## 5. Four model families, and the job each one gets

Four families come up for game-playing bots. None of them is the plan on its own; each has a job in it, and two of them are already here under other names.

### Heuristic-based models

**What they are here.** Jorge Yau, Lucky Cat Classic and the rule-based Only Orphans: hand-written reads of the table (steps from ready, live tiles, plans, threats, feeding) and a discard order. Neural Cat is a hybrid: it chooses among Jorge Yau's top three or four discards with a learned value, and that is why it scores more points than anything else in the game.

**Strengths.** No data needed, every move explainable (the coach's words come from them), fast, and they encode decades of Hong Kong mahjong knowledge: when a half flush is on, which honor to keep, when to fold.

**Ceiling.** Exactly the designer's knowledge. Lucky Cat passed them on hands won by lc20, with a million hands of self-play, and they can't learn from their mistakes.

**Jobs in the plan.**
- *Scaffolding for the network.* Engine facts (shanten, live waits, faan now, patterns still reachable) are the heuristics' inputs made available to the network, without the heuristics' conclusions (phase 2).
- *Opponents and a yardstick.* Jorge Yau and Lucky Cat Classic stay in the league pool and the shipping check: a model that loses to a rule bot has learned something narrow.
- *The rollout policy for search.* A search needs a fast policy to play out futures; Lucky Cat Classic plays a hand in about a millisecond, the network in about ten.
- *The warm start, in reserve.* Neural Cat's and Jorge Yau's choices could be a supervised start for a new network, the way Tenhou's players were Suphx's. §9 keeps it out of both lineages unless Sphinx stalls (Sphinx-W).
- *Not the decider.* A rule that overrides the network ("never discard into four shown sets") is tempting after a bad deal-in and would hide what the network failed to learn. Fix the training, not the output.

### Monte-Carlo Tree Search

**The fit.** MCTS as AlphaZero uses it needs the full state. Mahjong hides 3 hands and the wall, and the tree at one decision branches into 14 discards × 3 opponents' claims × the draw. The forms that work in hidden-information games are **determinization** (sample worlds consistent with what the seat knows, search each as if it were open, average) and **information-set MCTS** (one tree over what the seat knows, worlds sampled as the tree is walked). Both are heavy; neither top riichi program searches at play time.

**Where it earns its cost here.** The engine is deterministic and fast, and the auxiliary heads (§4) give exactly the beliefs a determinizer needs: for each tile, the chance it sits in each opponent's hand or in the wall, and whether each opponent is ready. Sample 16–64 worlds from those beliefs, play each candidate move out with the fast policy on the same worlds (shared luck, as the futures replays do), and average points.

**Two jobs.**
- *Offline, as a teacher (phase 3b): expert iteration.* Search is a policy-improvement operator: its choice at a position is better than the network's. Run it at training time on the champion's recorded choices, with 64 worlds and the network as rollout policy, and distill its move distribution into the policy head alongside the value targets. This is AlphaZero's loop with determinization in place of a perfect-information tree. It replaces the one-shot "next-best moves on 4 futures" replays with a search that also considers moves the champion ranked low. Cost: about 64 × 14 × 11 ms ≈ 10 s a searched choice, so a few choices a hand on a few thousand hands a round, aimed at the choices the value head is least sure of.
- *Online, optional (phase 4): "thinks longer".* The same search in a Web Worker with 16–32 worlds and Lucky Cat Classic as rollout policy, 1–1.5 s a move. It is strongest exactly where networks are weakest: a late, ready hand against a shown big hand, where one discard decides 2,000 points.

**Risk.** Determinized search is overconfident: it plays as if it will learn the hidden tiles after its move (the "strategy fusion" problem). Mahjong is forgiving here because one move rarely gathers information, but it is why the plan keeps search as a teacher and an option rather than the player.

### Deep Q-learning

**What it is here already.** A discard leaves a deterministic position, so Q(state, discard) is the value of that **afterstate**. Neural Cat is an afterstate value model trained on Monte Carlo outcomes: that is Q-learning's object without its bootstrapping. The plan's value head (§4, item 4) is the same object for Lucky Cat.

**What DQN's machinery adds, and what to leave.**
- *Distributional Q (C51, QR-DQN).* Take it: it is the categorical outcome × faan head, and in a scoring system where one hand is worth a thousand, the distribution is the only learnable target.
- *Temporal-difference bootstrapping.* Mostly leave it. Within one hand the return is known at the end (a few dozen moves), and Monte Carlo targets are unbiased in a four-player hidden-information game where the "next state" depends on three opponents' policies. Use an n-step mix (TD(λ) with λ near 0.9) only if the value head's correlation with realized points stalls below 0.25 on held-out hands.
- *A target network and double-Q.* Needed with bootstrapping; otherwise unneeded.
- *Prioritized replay.* Take it, in the form that matters here: sample training rows in proportion to |advantage|, so the rare big hands and the deal-ins that decide the points are seen often, with importance weights to keep the estimate honest.
- *Epsilon-greedy exploration.* Replace with sampling from the policy at a temperature (what the lab does) and the entropy target: epsilon-greedy throws away a random tile, which in mahjong is a free deal-in.

**Job in the plan.** The value head is a distributional afterstate Q trained by Monte Carlo with prioritized sampling; it grades every legal move at every choice for the policy update, and gives the coach its "expected points and chance to win" line, as Neural Cat's does.

### Deep policy gradient

**What was tried.** Suphx's method, PPO with entropy regularization on the hand's points, ran here as the LP and LT rounds. With a critic that explained under 1% of the reward, each round moved the policy a KL of 0.0005–0.005 from the champion: a refit, not an improvement. Policy gradient is not wrong; its signal was.

**What changes it.**
- *The baseline.* The distributional afterstate Q is the critic; the advantage of a move is its Q less the policy's average Q at that choice, computed for every legal move, not only the one played. This is the variance reduction the scalar critic couldn't give.
- *The update.* Regularized policy iteration (MPO or advantage-weighted regression, Suphx's PPO is a cousin): the target distribution is the champion's shares times exp(advantage / tau), fitted with a KL leash. The step size is set by the evidence (tau and the leash), so a round with little signal moves little and a round with much moves much, which is what the plateaued PPO rounds lacked.
- *Counterfactuals where the value is unsure.* The futures replays and, in phase 3b, search give exact advantages for the hardest choices.
- *Entropy.* Suphx's adaptive entropy target, kept (built in phase 0 as `--target-entropy`).

**Job in the plan.** Policy gradient in its regularized form is the policy update itself, in phase 3, with the value head as its critic.

### Where each one sits

| Family | Job | Phase | Expected gain | Cost | Risk |
| --- | --- | --- | --- | --- | --- |
| Heuristic | Engine facts as inputs; league opponents; rollout policy | 2, 3, 4 | Indirect, large (Suphx's look-ahead features) | Low | Blurring "the network decides" if their *choices* leak in |
| MCTS (determinized) | Offline teacher by expert iteration; optional online search | 3b, 4 | +10 to +40 a hand where one discard decides a big hand | High compute offline; 1–1.5 s a move online | Overconfidence from determinization |
| DQN family | Distributional afterstate value with prioritized sampling | 3 | The critic that makes the policy update work; the coach's numbers | Medium | TD bootstrapping against three moving opponents (so Monte Carlo first) |
| Policy gradient (regularized) | The policy update | 3 | Carries the value's gains into play | Low once the value exists | Refitting the champion if the signal is weak (the leash and tau) |

### On TensorFlow

The training code is PyTorch (`ml/train.py`, `ml/train_lucky.py`), and the models run in the game as weights read by plain JS, not by a framework. Which framework trains them changes nothing about how strong they get; the signal, the inputs and the network do. Moving training to TensorFlow would mean rewriting two trainers and their parity checks for no gain in play, so the plan keeps PyTorch unless there is another reason (a machine or a team that needs it).

Where TensorFlow does matter is **TensorFlow.js in the browser**. The structured network of phase 2 has a 10 ms budget in hand-written JS. If the width that beats the MLP can't meet it, TensorFlow.js (or ONNX Runtime Web) runs the same weights on WebGL or WebAssembly several times faster, at the price of a 1–2 MB library the page must load offline (the game is a PWA, so it would join `js/offline-cache.js`). That is the fallback for phase 2's kill criterion, and phase 4's online search would need it too.

## 6. The training pipeline

The lab today is a loop: generate 20,000–50,000 deals, train a few arms, judge, repeat, all on one machine in turn. For phases 1 to 3 it becomes a pipeline with three parts that run at once, on one machine or two (one generates and judges, the one with the GPU trains):

- **Generation** runs continuously with the current champion (value-guided exploration, Round 4 point 5) and the league pool, writing shards to a **replay buffer** of the last N rounds with each row's behaviour probability, so older rows are reweighted rather than thrown away. Measured cost: 3.6 deals a second a worker with the hidden tiles recorded in the first probe, and 8.7 in phase 1's first full round (20,000 deals in 5.5 minutes on 7 workers): 2.5 to 6 million deals a day on 8 workers.
- **Training** pulls from the buffer: the auxiliary losses on every row, the value heads on every row (Monte Carlo targets, prioritized by |advantage| with importance weights), the policy loss on the exp(advantage / tau) target with the KL leash. Several arms a round, as now; the bandit over arms, as now.
- **Judging** runs as candidates appear: the table test with sequential stopping (blocks of 5,000 deals, stop when the paired gap is clearly past or short of the bar, 40,000 at most), then the replication and the round robin of §9 for any candidate that passes. A kept model ships, joins the pool, and gets its Table Score.

Everything stays reproducible: seeds per round as now, every evaluation written to JSON, the lab log the record. The oracle features and the warm-start data never leave `ml/data/` (no dataset uploads).

## 7. Phases, numbers and kill criteria

Each phase has a result it must show on 40,000 fresh deals at the game's table (candidate and champion in every seat on the same deals, points first, win rate within one standard error), and a reason to stop.

| Phase | What | Must show | Dropped if |
| --- | --- | --- | --- |
| **0** Suphx teacher (built, `--strategy lucky-cat-suphx`) | Per-move danger teacher, distilled into lc32 | ≥ +10 points a hand over lc32, win rate held | Three rounds without a kept model |
| **1** Features v2 on the MLP, labels as targets (built: `npm run ml:frontier`, [frontier training](frontier-training.md)) | Per-player ordered piles and engine facts flattened into the current MLP; oracle-supervised auxiliary heads; two lineages (§9): Lucky Cat fine-tuned from lc32, Sphinx from scratch | Deal-in head AUC ≥ 0.75 on held-out hands; ≥ +25 over the phase-0 champion; deal-ins at the table ≤ 11% | Heads below AUC 0.65 after 2 million deals: the labels aren't learnable from public information at this size (go to phase 2); or no start beats lc32 after four rounds |
| **2** Structured network | Tile tokens with per-tile policy and value heads, JS forward, parity and fair-play tests, 10 ms budget on a phone | ≥ +20 over the phase-1 champion; the waits head (which tiles a ready opponent waits on) at AUC ≥ 0.70, where the phase-1 MLP reads 0.52 | Can't meet 10 ms on a phone at a width that beats the MLP, even on TensorFlow.js or ONNX Runtime Web; or the MLP on v2 is still improving (then it isn't needed yet) |
| **3** Distributional value, policy iteration, league, pipeline | Per-move value heads trained by Monte Carlo with prioritized sampling; exp(advantage / tau) targets with a KL leash; value-guided exploration; futures replays at uncertain choices; league pool; the five-stage bar of §9 | ≥ +40 over the phase-2 champion; no loss against any pool member; expected-points correlation with realized points ≥ 0.25 on held-out hands; **north star: points a hand at the game's table ≥ 0** | Two full rounds without a kept model after the value heads reach that correlation |
| **3b** Search as a teacher | Determinized search (worlds sampled from the auxiliary heads' beliefs, the network as rollout policy) at the choices the value is least sure of; its move distribution distilled into the policy | ≥ +15 over the phase-3 champion | Search agrees with the value head's best move more than 95% of the time: nothing left to teach |
| **4** Search at play (optional) | Sample opponent hands from the auxiliary heads' beliefs, roll out a few dozen futures per candidate move in a worker; a "thinks longer" setting | ≥ +20 over the phase-3 champion at ≤ 1.5 s a move | Gain under one standard error at 1.5 s |

Numbers are chosen to be clear on 40,000 deals: one standard error there is about 3.5 points a hand, so every bar is at least three of them. The bars add to about +110 over lc32, which is what parity with Neural Cat at its own table (the north star, 0 from −98.7) needs.

Documentation rule, unchanged: every model that ships gets its iteration written up (the thinking, what the bot does differently), the Lucky Cat playbook updated, the game version bumped.

## 8. Fair play, phase by phase

The shipped model must never read another hand or the wall. Each phase uses hidden information somewhere in training, so each one says exactly where it stops, and what proves it ([fair play](fair-play.md)):

| Phase | Hidden information used | Where it stops | What proves it |
| --- | --- | --- | --- |
| 0 | What each discard would pay now, as a teacher's push on the champion's shares | The public network is fitted to the teacher; it never sees the labels | `ship.js` refuses oracle models; `oracle.test.js`; the shipped weights read exactly `N.SIZE` inputs |
| 1 | The same, plus the hidden tiles as **auxiliary targets** (ready, waits, wall) | Targets only. The heads are predictions from public inputs | The fair-play shuffle test on the new encoder (every table strategy is covered automatically); the auxiliary heads' outputs must not change when hidden tiles are shuffled |
| 2 | Same as phase 1 | Same | Parity tests for the JS forward; the fair-play test on the structured network |
| 3 | Same, plus futures replays and value-guided exploration **in data generation** | Replays reshuffle the wall to score moves offline; nothing of it is an input. Exploration samples from the public value head | The fair-play test; the replay buffer holds no hidden-tile inputs for the policy |
| 3b | Determinized search as a **teacher**, with worlds sampled from the auxiliary heads' beliefs | The search runs offline; the shipped policy is distilled from its move distribution | The search's worlds are built from the seat's view only, checked by running it on a hidden-shuffled copy |
| 4 | Search **at play**, worlds sampled from beliefs | The search must construct its worlds from the public view and the model's beliefs, never from `game.hand` | The fair-play shuffle test applied to the search's decision: unchanged when hidden tiles move, and it throws if it touches a trapped record |

`guided` (oracle guiding, Suphx's own method) is the one arm whose training-time model reads hidden tiles; it is written without those inputs (`--public`) and cannot ship otherwise. If a phase cannot show its proof, it does not ship, whatever its score.

## 9. The benchmark, and the bar for the next generation

Everything above says "better". This section says how that is measured, by one number anyone can reproduce, and how strict the bar is before a model becomes the next generation. **Built** as `scripts/ml/bench.js` with the benchmark pinned in `bench/`; how to run it is in [the benchmark](benchmark.md).

### The benchmark table

- **Opponents, frozen.** Two Neural Cat NC8 (N10c) and Jorge Yau as of game version 0.57.9, in the seats of the game's table: Neural Cat, Jorge Yau, Neural Cat. Their weights, their code and the engine's rules they call are pinned by file and SHA-256 at commit `dd881a5` in `bench/benchmark.json` and read from git history; a fingerprint of 24 deals on today's engine must match too, so a rules change shows. The game's shipped Neural Cat will keep changing; the benchmark's does not, so a score from this month and one from next year mean the same thing. A new benchmark version (new opponents) gets a new name, and every model is scored again on it.
- **The deals.** The benchmark deck: 40,000 fixed deals, seeds 900,000,000 to 900,039,999, dealer rotating (first planned at 90,000,000, which the Only Orphans lab ranks on). The same deck for every model, so two scores are comparable to the deal.
- **The design.** The model takes every seat in turn on every deal (`bench.js score`), 160,000 hands. Points a hand is averaged over them. Paired comparisons between two models are made deal by deal on the same deck, which removes the luck of the deal from the difference and is what makes the standard error small.

### The score

**Table Score** = points a hand at the benchmark table over the deck, reported with its standard error (deal by deal, about ±3.5 at 40,000 deals), alongside hands won, deal-ins, average win and average faan. It is one number, it is in the units the game is scored in, and it is reproducible to the decimal from the deck and the pinned files.

Every shipped model's Table Score goes in the playbook's results table and on the Hugging Face model card. The reference points on it today: lc32 −98.7 (2,000 deals, provisional until it runs the full deck), Neural Cat NC8 by definition about 0 in its own seat, and the north star for Lucky Cat is a Table Score above 0.

### The bar: two standard errors, twice

A candidate becomes the **next generation** of its lineage only by passing every one of these (`bench.js judge`; fair play, the cheapest, runs first). Each stage plays fresh deals (new seeds, never the benchmark deck, so a model can't learn the deck):

1. **Screen.** 10,000 fresh paired deals at the benchmark table against the current generation. Arms whose gap is under one standard error stop here.
2. **Qualify.** 40,000 fresh paired deals. The gap in points a hand must be **at least two standard errors** (about +7 at this size), and hands won must be within one standard error of the current generation's (the Lucky Cat lineage keeps its win rate).
3. **Replicate.** Another 40,000 fresh paired deals, new seeds. The gap must be at least two standard errors **again**. One two-sigma result among several arms a round is a 2% coin; two in a row on independent deals is a 0.05% one.
4. **No regression.** For every earlier generation of its lineage and every league opponent (10,000 paired deals each), the candidate and the current generation each play at a table of three of that opponent: the candidate may not do worse there than the current generation by more than one standard error. (Head to head would be the wrong test: lc32 itself loses to Jorge Yau at a table.) A model that beats the champion by learning Neural Cat's tells and loses to Jorge Yau has learned something narrow, and does not ship.
5. **Fair play.** The shuffle test and the shipping checks (§8) pass.

Then it scores the benchmark deck for its Table Score, ships, joins the league pool, and its iteration is written up. A candidate that fails any stage is recorded in the lab log with its numbers and does not come back; the next round trains from the current generation, not from it.

This is stricter than the lab today (one 20,000–40,000-deal judge at one or two standard errors), and deliberately so: the lab's history has several "kept" models that were level on a second look (LL6c, LL8a, LR3a). Fewer, surer steps.

### Two lineages

Two models train on this plan, under the same benchmark and the same bar, so the question "is it the architecture or the history?" has an answer.

| | **Lucky Cat** | **Sphinx** |
| --- | --- | --- |
| Starts from | lc32, the network that taught itself from random play through the league and the lab | Zero. Random weights, nothing imitated |
| Inputs and network | Its own 376 features and MLP until phases 1 and 2 earn their place as fine-tunes of it (a wider first layer for v2, the structured network distilled from it) | Features v2 and the structured network from its first generation |
| Learns by | Its own methods carried on: imitation of wins, deal-ins pushed down, the Suphx teacher, the futures replays, then the phase-3 value and policy steps as fine-tunes | The full pipeline from the start: auxiliary labels, the distributional value, regularized policy iteration, value-guided exploration, the league, the search teacher |
| Warm start from other bots | None. It is the lineage that never copied anyone | None. "From the ground up" means it too learns only from play. (If Sphinx has not passed its tenth generation's bar within four rounds, a warm start from Neural Cat is allowed as a flagged variant, Sphinx-W, judged separately) |
| Names | `LS`, `LF`, ... models; releases lc33, lc34, ... | `SP<round><letter>` models; releases sphinx1, sphinx2, ... (`ml/lab-sphinx/`, data `sphinx-<n>`) |
| In the game | The Lucky Cat strategy, as now | A new strategy, Sphinx, on the Strategies sheet once it beats lc32's Table Score by two standard errors; before that, a lab strategy only |
| Generation bar | The five stages above, against its own previous generation | The same five stages, against its own previous generation. Early generations clear it easily (its first opponent is random play); the bar bites once it is strong |

Both play the same benchmark deck, so their Table Scores compare directly. Each is also scored head to head against the other at the benchmark table every generation, and the plan's frontier claim belongs to whichever has the higher Table Score with intervals that don't overlap at two standard errors. If after phase 3 Sphinx is ahead, Lucky Cat's playbook says so; if Lucky Cat is ahead, the history was worth more than the architecture, and that is worth knowing too.

## 10. What this plan would make Lucky Cat

Two networks that decide every move themselves, one that carries its own history on and one that starts from nothing, both of which read the table the way a strong player does because it was graded on reading it, that values hands by their whole distribution of outcomes in a scoring system where one hand can be worth a thousand, and that fold exactly when the risk says so. Lucky Cat should win as often as lc32 and lose far fewer points doing it; Sphinx should show what the architecture is worth on its own. Whether either becomes the strongest Hong Kong mahjong player anywhere is not something a plan can promise; the Table Score on the benchmark deck is what would show it, and the bar of two standard errors, twice, is what makes each generation a step that holds.

## 11. Learnings

What building and training each phase has taught, written up when each phase (or a major step in one) finishes. It's the record a review of the framework starts from. Each entry has three parts:
- **what we saw**;
- **the evidence** (numbers, sizes, where they came from);
- **what it changed**, or the question it leaves open.

Negative results are kept as carefully as positive ones.

### Phase 0: the Suphx teacher (2026-11-08)

- **A critic that sees every hidden tile doesn't explain a hand's points.**
  - *Evidence:* on 108,559 choices, the critic with the hidden tiles explained −1.2% of the variance of the hand's points, against −1.4% without them. It got worse with more epochs.
  - *Changed:* we dropped Suphx's oracle critic. The hidden tiles pay off **per move** (what this discard pays right now), not per hand. Hong Kong's exponential payouts (8 × 2^(faan − 3)) make a hand's points a heavy-tailed target that no critic regresses well.
- **A per-move teacher works where the critic didn't.**
  - *Evidence:* distilling a teacher that pushes down each discard by what it would pay now cut the points the policy's shares would pay from 3.38 to 2.91 a choice, at a KL of 0.0004. At the table: +14.8 ± 6.7 points a hand over lc32 on 2,000 deals, wins level (24.89% vs 24.96%), deal-ins 13.04% vs 13.38%.
  - *Changed:* the teacher is the base every phase-1 arm trains with.
- **Only 4.2% of choices hold a discard that deals in now.**
  - *Evidence:* the oracle's danger row, across the probe data.
  - *Open:* most deal-ins are set up two or three discards earlier, and the teacher says nothing there. Phase 3's value heads are meant to reach those choices.

### The benchmark (2026-11-08)

- **"No regression" can't mean "doesn't lose head to head."**
  - *Evidence:* lc32 itself loses to Jorge Yau at a table, and so does any early Sphinx, so the first draft of `judge` could never pass anything.
  - *Changed:* the stage now seats the candidate and the current generation each at a table of three of every rival, and compares them on the same deals. It catches a model that beats the champion by learning one opponent's tells.
- **Seed ranges collide unless someone checks.**
  - *Evidence:* the plan's deck (seeds from 90,000,000) is where the Only Orphans lab ranks its models.
  - *Changed:* the deck moved to 900,000,000, and fresh deals start at 910,000,000. No training uses nine-digit seeds. A test keeps the deck and the fresh blocks apart.
- **Freezing opponents by commit, not by copy, is enough, but CI needs the full history.**
  - *Evidence:* the 8 pinned files come from `git show dd881a5:…`. A depth-1 checkout can't read them.
  - *Changed:* CI fetches the whole history.
  - *Open:* there's no fallback (such as Hugging Face) if the history is ever rewritten.
- **A fingerprint catches what hashes can't.**
  - *Evidence:* the hashes pin the frozen files, but the candidate plays on today's engine. The 24-deal fingerprint replays the frozen players on today's engine and must match.
  - *Changed:* every command refuses to score on a drifted table, so a rules change forces a new benchmark version rather than silently moving every score.
- **The win-rate rule does what it is for.**
  - *Evidence:* in a dry run, Neural Cat beat lc32 by 2.2 standard errors on points but won fewer hands (−7.75 ± 1.85 percentage points), and failed the Lucky Cat lineage's qualify stage. In the Sphinx lineage, which has no win-rate rule, it passed every stage.
- **Real judgments are expensive.**
  - *Evidence:* about a million hands, some six hours on seven workers. A full Table Score is about an hour.
  - *Changed:* sequential stopping in qualify and replicate (blocks of 10,000, stop at ≥ 4 or ≤ 0 standard errors).
  - *Open:* how often stopping early changes a verdict, measured on real judgments.

### Phase 1: features v2 and the hidden tiles as targets (in progress)

Lucky Cat round 1: 20,000 deals of lc32 widened to features v2, at the game's table, 221,717 choices.

- **The table can be read from public information.**
  - *Evidence:* the auxiliary heads predict which held tile would deal in now at a held-out AUC of 0.87–0.89, and whether each opponent is ready at 0.85–0.88. The phase-1 bar is 0.75. A 3,000-deal probe (33,295 choices) gave 0.78, so they improve with data.
  - *Changed:* nothing yet. The next question is whether reading better shows at the table.
- **Which tiles an opponent waits on isn't learned.**
  - *Evidence:* the waits AUC (when the opponent is ready) is 0.50–0.53 at every weight and data size so far.
  - *Changed:* this is the most direct evidence for phase 2. A wait is a shape within one suit, which a flat MLP over 34-tile vectors must learn tile by tile. Phase 2's bar now includes a waits AUC of at least 0.70.
- **The auxiliary weight trades reading the table against the policy.**
  - *Evidence (round 1 screens, 10,000 deals each against lc32):*
    - Weight 1 read best (deal-in AUC 0.886) but gave up 0.6 percentage points of hands won (24.05% vs 24.63%), at −1.3 ± 5.9 points.
    - Weight 0.2 held the win rate (24.71% vs 24.68%), lowered deal-ins (12.73% vs 13.01%), and scored **+7.6 ± 5.0**.
  - *Changed:* the weight is a dial per lineage: low for Lucky Cat, which must keep its win rate, and high for Sphinx.
  - *Open:* a schedule, high early and low late, might get both.
- **On the small probe, the weight pulled the policy far from lc32 (KL 0.057 at weight 1). On ten times the data it barely did (KL 0.010).**
  - *Evidence:* the probe against round 1.
  - *Changed:* probe results on 3,000 deals aren't a guide to a full round's dynamics. Arms are now chosen on round data.
- **The policy moves very little in a round.**
  - *Evidence:* KL 0.004–0.01 from lc32 at lr 3e-4, 4 epochs.
  - *Open:* this keeps lc32's strengths but caps what a round can show. If the screens stay near one standard error, the next arms train longer or at a higher rate.
- **The screen is noisy at ±5 points: two nearly identical models differed by 10.**
  - *Evidence:* LV1a and LV1c had the same weight, KL 0.004 from lc32 each, and the same AUCs (0.874 and 0.873). Only the teacher's tau differed. They screened at +7.6 and −2.7.
  - *Changed:* a single screen is a coin with a ±5-point edge, which is why the bar qualifies and replicates on 40,000 deals each.
  - *Open:* whether to screen two seeds of each arm before spending a judgment.
- **Round 1's verdict: nothing kept. LV1a failed the bar at the judgment's own screen.**
  - *Evidence:* LV1a screened at +7.6 ± 5.0 points a hand over lc32 in the round (1.54 SE). On the judgment's fresh 10,000 deals it was +4.3 ± 5.0 (0.86 SE, and the screen needs 1). Hands won were level both times (24.35% vs 24.34%), and deal-ins were lower both times (12.52% vs 12.75%). Pooled, the two screens are about +6.0 ± 3.5: likely a real gain of a few points a hand, too small to clear a 1-SE screen reliably.
  - *Changed:* the bar did its job. A small, uncertain gain doesn't become a generation, and LV1a doesn't come back. Round 1 also showed the policy barely moving (KL 0.004), so from round 2 two of the three arms train at lr 1e-3 for 8 epochs instead of 3e-4 for 4, to move further on what the heads read. Arm a stays as the control.
  - *Open:* the driver's screen and the judgment's screen are two independent 10,000-deal screens, so a candidate must pass 1 SE twice before it qualifies. For an effect near +5 points (about 1 SE at that size), each screen is close to a coin flip, and two in a row reject most real small gains. Worth weighing in review: pool the two screens, size the screen to the effect the phase expects, or accept that the bar only admits steps of about +8 or more.
- **Data is cheaper than budgeted.**
  - *Evidence:* 20,000 deals with the hidden tiles recorded took 5.5 minutes on 7 workers, about 8.7 deals a second a worker, against 3.6 in the first probe.
  - *Changed:* phase 3's volumes cost less than §6 assumed.
- **A random Sphinx wins 0.25–0.4% of its seats in self-play.**
  - *Evidence:* 53 wins in 4,000 deals, and 20 in 2,000.
  - *Changed:* `--sample-won` keeps every move of a won hand, so the few wins aren't sampled away.
  - *Open:* on the tiny smoke data (4,722 rows), Sphinx's AUCs came out below 0.5. To be checked on the first full round: if they stay below 0.5, it's a bug.
  - *Checked (Sphinx round 1, 50,000 deals, 119,332 choices):* not a bug. Ready AUC is 0.86–0.95 and deal-in 0.51–0.74 across the arms, so the smoke result was too little data. Waits stay below chance (0.46–0.48): with random opponents, almost nobody is ready, so there are too few examples to learn from.

Lucky Cat rounds 2 and 3: the retuned arms, 20,000 new deals a round, trained on every round so far (443,000 choices in round 2, 665,000 in round 3).

- **With more data and a higher learning rate, the heads read the table much better.**
  - *Evidence:* at lr 1e-3 for 8 epochs, deal-in AUC went from 0.874 (round 1) to 0.916, then 0.917. Ready went from 0.850 to 0.926, then 0.923. **Waits went from 0.518 to 0.585, then 0.610**, the first time it has moved off chance. Wall count error fell from 0.72 to 0.67 copies. The control arm (lr 3e-4, 4 epochs) only reached 0.880, 0.884 and 0.536 on the same data.
  - *Changed:* waits are learnable by the flat MLP after all, slowly. Phase 2 still has to beat this curve, not just 0.5.
- **Reading the table better didn't change the result at the table.**
  - *Evidence (10,000-deal screens against lc32):*
    - Round 2: LV2a +1.9 ± 4.9, LV2b −7.9 ± 5.3, LV2c +2.0 ± 5.4.
    - Round 3: LV3a −0.6 ± 4.9, LV3b +4.4 ± 5.2 (0.84 SE), LV3c −6.7 ± 5.2.
    
    None reached 1 SE, so nothing was judged. Hands won stayed within 0.3 percentage points of lc32 in every screen (24.4–24.8%). Deal-ins were 0.1–0.5 points lower in all six (12.4–12.8% against 12.6–13.0%), small but consistent.
  - *Changed:* nothing kept. lc32v2 is still the champion after 3 rounds and 9 arms.
- **How well an arm reads doesn't predict how it screens, so the gap isn't in the reading.**
  - *Evidence:* LV2b and LV3b had the same recipe and the best heads (deal-in about 0.917, waits 0.585 and 0.610), and they screened at −7.9 and +4.4. LV3c read almost as well (0.915, 0.608) and screened at −6.7. The policy stayed close to lc32 throughout: KL 0.003–0.008.
  - *Open, and the most important finding of phase 1 so far:* the heads only shape the shared trunk. The policy is still trained to copy the champion's moves, nudged by the per-move deal-in teacher, so nothing in its loss rewards acting on a better read. Phase 1's "labels as targets" seems to buy representation, not play. Options for review:
    - bring forward phase 3's value heads and policy-iteration step, so the policy is trained on returns;
    - feed the heads' predictions to the policy as inputs, so it can condition on them;
    - weight the teacher by the heads' own danger estimate.
- **The screen's noise is about the size of the effects being tested.**
  - *Evidence:* the nine Lucky Cat screens of rounds 1–3 ranged from −7.9 to +7.6, at about ±5.1 each. Their mean is −0.4, which is consistent with no effect at all.
  - *Open:* a 10,000-deal screen can't separate a +3-point arm from zero. Either screen on 40,000 deals (about an hour each), or stop running more fine-tuning rounds of this recipe until the policy loss changes.
- **Sphinx round 1: imitating its own wins made it win five times as often, and lose more points at the table.**
  - *Evidence:* SP1a won 1.51% of its seats at the benchmark table against sp0's 0.31%, but dealt in 15.17% against 10.45%, with cheaper wins (78 points against 243). That's −43.3 ± 6.8 points a hand (−6.35 SE). Its first data took 178 s for 50,000 deals, with 616 wins.
  - *Open:* the round is still screening its other arms. Imitating wins from random self-play teaches it to race for cheap hands, and nothing teaches it defence yet. The table rounds (from round 3) and the teacher's weight will tell whether that turns around.
  - *Then:* every arm of round 1 lost to random play (SP1a −43.3, SP1b −46.3, SP1c −45.1, each about −6.5 SE), and round 2's first arm repeated it (SP2a −43.5). Sphinx is paused: this recipe can't start a lineage at a table where deal-ins decide the points.

### Pruning, and the native simulator (2026-11-09)

What the frontier rounds were spending time on that they shouldn't, and the C++ simulator that now plays their hands.

- **Monte Carlo search would have nothing to teach yet.**
  - *Evidence:* at 2 of lc32's least sure choices a hand (1,600 choices, 800 deals at the game's table), its top 3 moves were each replayed on 8 reshuffles of the wall still to be drawn, with the other hands as dealt: a search that knows the hidden hands, so an upper bound. A 4-world search picked a different move 46% of the time, and on the 4 held-out futures it gained **+7.8 ± 8.4 points a choice**: not distinguishable from zero. Scored on its own futures it looked like +79, which is the winner's curse, not a gain. Each searched choice cost 24 full replays.
  - *Changed:* phase 3b (search as a teacher) is deferred until the value heads exist to aim it, and phase 4 (search at play) is dropped: 1–1.5 s a move breaks the plan's browser promise, and the measured gain is nil. Monte Carlo *targets* (the value heads learning from how hands ended) stay: that is how Neural Cat learns.
  - *Open:* with the native simulator a 64-world search costs about what a 4-world one did in JS; worth one more measurement once the policy is stronger.
- **The judgment played the round's screen a second time, and the second screen rejected most real gains.**
  - *Evidence:* LV1a screened at +7.6 ± 5.0 in its round and +4.3 ± 5.0 at the judgment's own screen (0.86 SE, failed). For a gain near 1 SE, two 1-SE screens in a row pass about a third of the time.
  - *Changed:* `bench.js judge --screened FILE` takes the round's screen as the judgment's (same pair of models, fresh deals, enough of them); qualify and replicate still play fresh deals at 2 SE each, which is what pays for picking the best of a round's arms. `frontier.js` passes it.
- **Sphinx's wide arm started from random weights every round.**
  - *Evidence:* arm c (512, 256) ignored the champion, so from round 2 it would have thrown away every generation the lineage earned.
  - *Changed:* it trains fresh only while the champion is random play, and is skipped after (from the champion it is arm a again).
- **Moving the policy by what hands scored, with the heads reading the table, passed the screen, then failed to qualify.**
  - *Evidence:* three probes from lc32v2 on rounds 1–3's data (665,226 choices), `--mode pg` with the hidden-tile critic, screened on 10,000 deals: returns alone (PG1) −0.7 ± 5.7; returns with the heads at 0.2 (PG2) **+8.1 ± 6.4 (1.27 SE)**, though the heads pulled the policy past the 0.03 leash in one epoch; with the deal-in teacher at 0.5 too (PG3) **+5.7 ± 5.2 (1.09 SE)**, KL 0.007. The critic explained −4.7% of the reward: the advantage is still almost the raw points.
  - *Then:* on the bar's fresh deals both fell to nothing. PG2 qualified at **−2.4 ± 6.4** and gave up hands won (−0.85 percentage points, −3.3 SE); PG3 at **−2.6 ± 5.5**, hands won level. Each was stopped after its first 10,000 deals. Twelve arms screened so far (nine Lucky Cat rounds' and three probes) are centred on zero, and the two that passed 1 SE are what the best of twelve noisy screens looks like.
  - *Changed:* `train_lucky.py` lets `--aux` train with `--mode pg` and adds `--teach W`. Nothing kept: with a critic that explains none of the reward, the returns are luck, as phase 0 found. Phase 3's value heads (an advantage per move, not per hand) are what this needs, not more rounds of the same signal.
  - *Open:* the heads and the returns are at very different scales (the surrogate is about 0.02, the aux loss about 1): a weight of 0.2 is a large push. Weights 0.02–0.05 are the next arms.
- **The JS simulator, not the training, set the pace, and a C++ port of it plays exactly the same hands 8–10x faster.**
  - *Evidence:* a round's 20,000 deals of data took 330 s and a 10,000-deal screen about 16 minutes in JS, against seconds of training. Profiling the benchmark table in JS: 31% shanten, 30% Jorge Yau's reads, 18% the networks. Ported (`native/`): the engine, scoring, Jorge Yau, Neural Cat, Lucky Cat (features v1 and v2) and the oracle's labels. `scripts/ml/native.js parity` plays the same seeded hands in both and diffs every action: 1,000 hands each of Jorge Yau, Neural Cat with Jorge Yau, and Lucky Cat at the benchmark table, identical; `bench.js compare` gives byte-identical JSON; `lucky.js generate` writes byte-identical shards (Lucky Cat's and Sphinx's settings, with and without the oracle). Speed on 7 workers: data 587 deals a second (9.7x), the benchmark table 82 deals a second (7.9x); the engine alone 26.7x and shanten 217x on one core.
  - *What it took to be exact:* no fused multiply-adds (JS has none); V8's own `Math.exp` and `Math.log`, which are fdlibm built by clang **with** fused multiply-adds (both the C library's and plain fdlibm differ from V8 on about 1 input in 2,000); V8's `Array.prototype.sort`, which under 8 elements is binary insertion with no run detected, and from 8 a run then binary insertion (measured on 60,000 inconsistent comparators; the foundation's discard comparator is inconsistent, so any other sort changes moves); float32 stores wherever the JS has a Float32Array.
  - *Changed:* `bench.js` and `lucky.js` use the native simulator whenever every player can run there (`native/ported.json` pins the exact JS it matches; anything else falls back to the JS), so the frontier rounds, screens and judgments run on it.
  - *Open:* the floor now is the networks: one Neural Cat forward pass is 12.9 µs and lc32's 26.3 µs, about 200 a hand, and they must stay float32 in the JS's order to give the same moves. 100x at the same results is not on offer on a CPU; a cross-pass decision cache would save about 14% of a compare (9.5% of hands are identical between candidate and champion, the mean shared prefix 28%). Beyond that the choice is between exactness and speed (float32 SIMD, batching on a GPU), and the benchmark's promise is exactness.
