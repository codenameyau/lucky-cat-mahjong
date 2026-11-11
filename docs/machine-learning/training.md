# Training

Training has three parts. Hands are simulated, on the [native simulator](native.md) (or in Node.js), and positions are recorded with how each hand ended. PyTorch fits the network to them. Paired games on fresh deals decide whether a new model is better. Each step has its own command.

**How each model is trained now:** against older models of its own lineage only, in [the lineage-only loop](#training-a-lineage-against-its-own-past) (since 2026-11-10). The lab, the league and the self-play loop below are how the earlier models were made, and their commands still work.

## Contents

- [The contradiction check in training](#the-contradiction-check-in-training)
- [Setup](#setup)
  - [Windows with an NVIDIA GPU](#windows-with-an-nvidia-gpu)
- [How the models were trained](#how-the-models-were-trained)
- [Training a lineage against its own past](#training-a-lineage-against-its-own-past)
  - [The bars](#the-bars)
  - [Lucky Cat: `scripts/ml/lc-own-loop.js`](#lucky-cat-scriptsmllc-own-loopjs)
  - [Neural Cat and Only Orphans: on their branches](#neural-cat-and-only-orphans-on-their-branches)
  - [Speed](#speed)
  - [What didn't work](#what-didnt-work)
- [1. Generate data: `npm run ml:generate`](#1-generate-data-npm-run-mlgenerate)
  - [Data format](#data-format)
- [2. Train: `npm run ml:train`](#2-train-npm-run-mltrain)
- [3. Self-play against the rule bots: `npm run ml:loop`](#3-self-play-against-the-rule-bots-npm-run-mlloop)
- [4. The lab: `npm run ml:lab`](#4-the-lab-npm-run-mllab)
  - [The lab for Only Orphans and Lucky Cat: `--strategy`](#the-lab-for-only-orphans-and-lucky-cat---strategy)
- [The league (before the lab): `npm run ml:league`](#the-league-before-the-lab-npm-run-mlleague)
- [Only Orphans: `npm run ml:orphans`](#only-orphans-npm-run-mlorphans)
- [5. Compete: `npm run compete`](#5-compete-npm-run-compete)
- [Reading the results](#reading-the-results)

## The contradiction check in training

Every model's moves go through [the contradiction check](../strategies/README.md#the-contradiction-check) in training as in play: Neural Cat's model chooses only among moves that pass it, and Lucky Cat's network has each pick checked against the shared foundation's plan. The data records the move the check settled on, so a model learns from moves that don't contradict the hand they build toward.

## Setup

```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt   # PyTorch and NumPy
```

Training uses the Apple GPU (MPS) when there is one, else CUDA, else the CPU. Simulations use every CPU core but one.

`npm run ml:check-gpu` says which GPU PyTorch sees and runs a few training steps on it.

### Windows with an NVIDIA GPU

Install [Node.js](https://nodejs.org) 24+ (`ml:generate` needs `Float16Array`), [Python](https://www.python.org/downloads/) 3.10+ (tick "Add python.exe to PATH") and the latest [NVIDIA driver](https://www.nvidia.com/Download/index.aspx). Then, from the repository root in PowerShell:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File ml\setup-windows.ps1
```

The script makes `ml\.venv` and installs PyTorch from PyTorch's CUDA index, since a plain `pip install torch` on Windows gets the CPU-only build. It reads the card's compute capability with `nvidia-smi`. A Titan RTX (Turing, 7.5) gets current PyTorch. A Titan V, Xp or X (Volta or Pascal) gets PyTorch 2.7 with CUDA 12.6, the last build that runs on them. `-Index cu128` picks the index yourself. At the end it runs `ml\check_gpu.py`, which should print the card's name.

Every `npm run ml:*` command then works as written: the scripts find `ml\.venv\Scripts\python.exe` on Windows and `ml/.venv/bin/python` elsewhere.

- **GPU** (training): a Titan has 12 to 24 GB, so `--device-bytes 8e9` keeps up to 8 GB of data on the card instead of sending it a batch at a time.
- **CPU** (simulation): `ml:generate`, `ml:league` and `compete` use every core but one. On an i9 that's the slow part, and it goes faster with more threads. Pass `--workers N` to leave cores free for other work.
- Keep the repository on a local drive. A folder synced by OneDrive slows the data writes, and antivirus scanning of `ml\data` can too. Exclude that folder if generation is slow.

## How the models were trained

| Stage | Command | Opponents | Learns | Result |
| --- | --- | --- | --- | --- |
| Bootstrap (j0) | `ml:generate`, `ml:train` | The rule strategies in every seat | Discards | A first model from the bots' own play |
| Self-play (s1–s6) | `ml:loop` | Neural Cat (exploring) with Jorge Yau, Lucky Cat and Only Orphans | Discards | s5: +48.5 points a hand over Jorge Yau on fresh deals |
| League (L1, L2, ...) | `ml:league` | Only Neural Cat models: the best, exploring, against earlier bests | Discards, claims, kongs | About +75 to +82 points a hand over s5; plateaued after L7 |
| Lab (N1a, N1b, ...) | `ml:lab` | Earlier champions, s5, Jorge Yau, LC20 and Lucky Cat Classic | Discards, claims, kongs, and how it plays (`meta.play`) | NC3 to NC9: see [the lab](#4-the-lab-npm-run-mllab) |
| Lucky Cat lab (LF1a, ...) | `ml:lab -- --strategy lucky-cat` | The game's table: Neural Cat, Jorge Yau, Neural Cat | Its choices, each replayed with its next-best moves on 4 reshuffled futures, by the mean points each scored | lc32 was in the game then (from the earlier, hands-won lab). The futures rounds started from it |
| Lucky Cat Suphx lab (LS1a, ...) | `ml:lab -- --strategy lucky-cat-suphx` | The game's table: Neural Cat, Jorge Yau, Neural Cat | Its choices, with the hidden tiles recorded beside them (training only): an oracle teacher pushes down each discard that would deal in now by what it would pay, and the public network is fitted to it; also Suphx's oracle guiding and a hidden-tile critic | Started from lc32 ([Suphx](iterations.md#suphx-for-lucky-cat-an-oracle-teacher-not-an-oracle-critic)); the line was cancelled on 2026-11-09 |
| Own lineage (LO, R and SC, ON and W models) | [the lineage-only loop](#training-a-lineage-against-its-own-past) | Only older models of the same lineage | Lucky Cat: replays of its top moves on shared walls. Neural Cat: its faan heads on softened labels. Only Orphans: won-position-rich data | **lc33, lc34, NC10 and OW1**: how each model is trained now |

The full results, round by round, are in the playbooks ([Neural Cat](../strategies/neural-cat.md#results), [Lucky Cat](../strategies/lucky-cat.md#results), [Only Orphans](../strategies/only-orphans.md)), in [iterations](iterations.md) and on the [model card](https://huggingface.co/codenameyau/lucky-cat-mahjong).

## Training a lineage against its own past

Since an overnight run on 2026-11-10 to 11, each learned strategy is trained and judged **only against older models of its own lineage**: Lucky Cats against Lucky Cats, Neural Cats against Neural Cats, Only Orphans against Only Orphans. The other seats hold the lineage's earlier generations, so a gain is a gain over the lineage's own past, a clear benchmark that doesn't move when another strategy changes. Playing the three against each other, and a championship with Jorge Yau, is a later phase; it hasn't been run.

Every loop works the same way:

1. **Data.** The champion explores against the lineage's older generations, on the native simulator's fast build. Data is cached by its settings, so a stopped run reuses what it made.
2. **Arms.** Several candidates are trained from the champion in one GPU process that loads the data once, plus play settings and weight-noise mutations that need no training.
3. **A screen** on fresh paired deals (fast build), in stages: the candidate and the champion each take every seat of the same deals, the gap is read deal by deal, and an arm clearly behind stops playing. Each model's result on a block of deals is cached, so the champion is played once for every arm.
4. **A confirmation** of the best arm on fresh deals on the exact build. Only this decides a new generation.

**Screens overstate.** A screen keeps the best of several arms, and every arm shares the champion's games, so their luck moves together. Lucky Cat's first screen leader screened at +4.6 ± 1.4 points a hand and confirmed at +0.1 ± 1.4. So every gain is confirmed on fresh deals, 160,000 when the gap is small (about ±1 point a hand for Lucky Cat). Seeds come from a counter that only goes up, so no deal is played twice.

### The bars

A new **generation** must win on fresh paired deals on the exact build, against the lineage's champion, by its lineage's aim ([what each strategy is for](../strategies/README.md#what-each-learned-strategy-is-for)):

| Lineage | Its aim | A generation needs |
| --- | --- | --- |
| Lucky Cat | The most hands won | Hands won up 2 standard errors, with points a hand and deal-ins no worse |
| Only Orphans | The biggest hands and the most points | Points a hand up 2 standard errors (hands won is reported, not a bar) |
| Neural Cat | The balance of both | Points a hand or hands won up 2 standard errors, the other not down by more than 1 |

For every lineage, deal-ins may not rise by more than 0.25 points of a percent or 1 standard error, whichever is larger. A **ship candidate** needs 3 standard errors on its aim's measure against the model in the game, on pooled fresh deals on the exact build (two runs, never screen deals).

### Lucky Cat: `scripts/ml/lc-own-loop.js`

In master since PR #251. lc33 (LO9d, generation 4) and lc34 (LO18d, generation 6) came from it.

| File | What it does |
| --- | --- |
| `scripts/ml/lc-own.js` | The pieces: replay data, staged and cached paired screens, confirmations. The table is the newest older generations (`--table-pool`, by default lc32, lc31, lc30 and lc29), each block of deals at one three-of-four of them |
| `scripts/ml/lc-own-loop.js` | The round driver. Each round reads `ml/overnight/lucky-cat/plan.json`, so the recipe can change between rounds without a restart. State in `state.json`, log in `loop.log` |
| `scripts/ml/lc-own-ship.js` | The fixed ship table: candidates paired against the shipped model, with three older generations in the other seats |
| `ml/lc_own_train.py` | Every arm of a round in one GPU process, on one load of the data (a round's 8 arms in 27 to 38 s, against about 416 s) |

```bash
npm run native:build
node scripts/ml/lc-own-loop.js --rounds 4                          # rounds from plan.json
node scripts/ml/lc-own-loop.js --confirm ml/models/<name>.json      # 160,000 fresh exact deals against the champion, first
node scripts/ml/lc-own.js screen --champ ml/models/LO18d.json --cands a.json,b.json --seed S --stages 8000,24000,48000
node scripts/ml/lc-own.js data --champ ml/models/LO18d.json --seed S --deals N --out ml/data/own-1
node scripts/ml/lc-own.js confirm --champ ml/models/LO18d.json --cand a.json --seed S --deals 80000
node scripts/ml/lc-own-ship.js --cands ml/models/<name>.json --seed S --runs 80000,80000
node scripts/ml/python.js ml/lc_own_train.py --data ml/data/own-1 ml/data/own-2 --arms arms.json
```

What it learns from, and how:

- **Replays with common random numbers (CRN).** At a share of the champion's choices, each of its top 4 moves is forced and the hand played on 8 times (16 at close choices) from there, every move on the *same* reshuffled walls, the tiles the seat hasn't seen (`lcm-sim generate-lcv --crn --policy-only`). The gap between two moves has 2.4 times less noise than with independent replays. Training (`mode q`) tilts the policy's shares toward the moves that scored more, with a bonus for each move's share of wins.
- **Blind policy iteration.** Once the steps left were about a point a hand, below what a screen can see, the loop stopped screening: each round trains one recipe, which starts the next round, and the sum of three steps is confirmed on fresh deals (and reverted if it fails). Generations 4 to 6 came this way.
- **Half-spicy or blended replay scoring.** A replay's points can be scored on the half-spicy table, which doubles every two faan above 4 instead of every one, so a move's score is far less noisy (generation 4), or half on half spicy and half on full spicy (generation 6).
- **A 3-seed weight soup.** The champion's step is trained from three seeds and the weights averaged. It is the one structural change kept (in G4 to G6).

The generations so far: G1 LO1b, G2 LO2a, G3 LO4h, G4 LO9d (lc33), G5 LO12d, G6 LO18d (lc34) ([iterations](iterations.md#lucky-cat-against-its-own-lineage-lc33-2026-11-11)). The run stopped after 24 rounds; its last candidate, LO24d, was level with G6.

Two things in the script predate the aims and are worth knowing before a run. Its built-in generation check is the two-way rule (points or hands won up 2 standard errors, the other not down by more than 1, deal-ins as above), and its ship check (`shipCheck`, and `lc-own-ship.js`) is points up 3 standard errors against lc32, at a table of lc32, lc31 and lc30. lc34's ship check was against lc33, at a table of lc33, lc32 and lc31. With no `state.json`, the loop starts from lc32.

### Neural Cat and Only Orphans: on their branches

Their loops are on pushed branches, **not in master**:

| Lineage | Branch | Tools |
| --- | --- | --- |
| Neural Cat (NC10 = SC1) | `train/neural-cat-overnight` | `scripts/ml/nc-overnight.js` (data, rounds, cached and pruned screens, confirmations, mutations), `ml/nc_multi.py` (several arms in one GPU pass; label smoothing on the faan heads is `faanSmooth`), `scripts/ml/nc-measure.js` and `ml/nc_oracle.py` (what option replays could gain, measured before training on them) |
| Only Orphans (OW1 = W1b0) | `train/only-orphans-overnight` | `scripts/ml/oo-night.js` (screens, confirmations, mutations, play settings), `scripts/ml/oo-round.js` (one round), `scripts/ml/oo-ship.js` (the ship check, in blocks until 3 standard errors), `scripts/ml/oo-fair-play.js`, `lcm-sim shadow` (candidates read beside the champion), `generate.js --other-share` (keep every position of the winner's hand and a share of the rest), and `ml/train.py --other-share`, `--calib` and `--limit-weight` |

On those branches:

```bash
node scripts/ml/nc-overnight.js round --spec spec.json        # a whole Neural Cat round
node scripts/ml/nc-overnight.js confirm --cand a.json --deals 40000
node scripts/ml/nc-overnight.js status
node scripts/ml/oo-round.js                                   # one Only Orphans round
node scripts/ml/oo-night.js confirm --arm a.json --champion ml/models/OS2c1.json --seed S --deals 40000
node scripts/ml/oo-ship.js --arm ml/models/<name>.json --prior "<earlier runs>"
```

Neural Cat's table is NC9, NC8, NC7, NC5 and NC3 in the data (with every champion the loop makes), and NC9, NC8 and NC5 in evaluation. Only Orphans' is OT11d, OT7c, OT6e, OT5e, OT4a, OT2d, OT1a and OL2c, then OS2c1 and ON1 ([iterations](iterations.md#only-orphans-against-its-own-lineage-ow1-2026-11-11)).

### Speed

Measured on the overnight run, against the tools before it:

| Lineage | What | Speed-up |
| --- | --- | --- |
| Neural Cat | Data | about 25x (47 to about 1,200 deals a second at 10 workers) |
| Neural Cat | Screens | about 19x (62 to about 1,190 hands a second) |
| Neural Cat | A lab-sized round | 95 minutes to about 6 |
| Only Orphans | A screening round, end to end | about 13.5x |
| Lucky Cat | Training | 11x to 15x (a round's 8 arms in one GPU process: 27 to 38 s, against about 416 s) |
| Lucky Cat | Data | about 1.8x at equal information (the shared walls) |
| Lucky Cat | Screens | about 1.6x (the champion played once a deck, cached and pruned) |
| Lucky Cat | End to end | about 1.6x; blind policy iteration cut a round from about 50 minutes to about 18 |

The one lever of the 10x kind tried for Lucky Cat, replays cut short and scored by a learned value, made data 2.8 times faster but taught worse play (every arm dealt in more), so it was turned off.

### What didn't work

Across the three lineages ([iterations](iterations.md#what-didnt-work-that-night) has the numbers):

- Weight noise, gradient clipping (it never bites), warm-up, averaged weights (EMA), a residual layer-normalized teacher (capacity isn't the limit) and larger steps.
- CRN option replays for Neural Cat: with 8 replays its close options can't be ranked, and replaying its claims found no oracle gain.
- Half spicy as a play setting, for Neural Cat and Only Orphans (as Lucky Cat's replay scoring it helped).
- Learning Only Orphans' target choice: no gain over the rules' pick.
- Capping Only Orphans' faan targets at 10: more small wins, no more points.
- Exploring toward big hands for Lucky Cat (continuing a flush, all-pungs or dragon plan): −4.0 points a hand on average, and still −1.7 when nearly ready.

## 1. Generate data: `npm run ml:generate`

`scripts/ml/generate.js` plays hands across worker threads. At each decision, with probability `--sample`, it records the position the choice left, read through Neural Cat's features, whatever strategy made the choice. It also records waiting positions: a passed claim, or a kong before its replacement tile. When the hand ends, every recorded position is labelled with how it ended for that seat.

```bash
npm run ml:generate -- --deals 50000 --lineup mix --pool neural-cat,ml:ml/models/s5.json \
  --weights ml/models/L3.json --temperature 150 --epsilon 0.05 --sample 0.12 --out ml/data/my-set
```

| Option | Default | What it does |
| --- | --- | --- |
| `--deals N` | 1000 | Hands to play |
| `--seed N` | 1 | The first hand's seed. Hand *k* uses seed + *k*, so a set can be replayed exactly |
| `--lineup a,b,c,d` or `mix` | `mix` | Four strategies by seat, or `mix`: each seat picks from `--pool` every hand |
| `--pool a,b,...` | every strategy | The strategies `mix` picks from. `ml:<file>` is an earlier model playing its best |
| `--weights FILE` | shipped | The weights `neural-cat` plays with |
| `--temperature T` | 100 | `neural-cat` explores among close choices by value, in points |
| `--epsilon P` | 0.05 | `neural-cat` makes a random choice this often |
| `--explore P` | 0.05 | A rule bot's discard or claim is swapped for a random one this often |
| `--sample P` | 0.3 | The chance each decision is recorded |
| `--top-k N` | 3 | `neural-cat` picks among the foundation's best N discards |
| `--workers N` | cores − 1 | Worker threads |
| `--out DIR` | `ml/data/<time>` | Where to write |
| `--native` | off | Plays on the [native simulator](native.md) (`lcm-sim generate-nc`): the same shard files, about 15 times faster. It records every seat (the default) or `--record neural-cat`, and needs `--explore 0`, a mixed lineup, and a pool of `neural-cat`, `ml:<file>`, `jorge-yau` and `lucky-cat` (with `--learner only-orphans`, `only-orphans` and `oo:<file>` too). A finished shard is reused when a stopped run is started again. `--exact` uses the exact build |

`npm run ml:generate -- parity --deals 200` plays a short run in the JS and on the native simulator's exact build and compares the files byte for byte. The native path is how the frontier model's data is made; the JS stays as the reference it is checked against ([running the models on another frontend](porting.md)).

### Data format

Each set is a folder with `manifest.json` and, per worker, `shard-N.features`, `shard-N.labels` and `shard-N.aux`:

- **Features**: little-endian float16, 568 per position ([features](features.md)).
- **Labels**: 16 bytes per position.

| Bytes | Field | Type | Meaning |
| --- | --- | --- | --- |
| 0 | `outcome` | u8 | 0 win by self-draw, 1 win off a discard, 2 dealt in, 3 someone else self-drew, 4 someone else won, 5 draw |
| 1 | `winFaan` | u8 | 3–13 when this seat won, else 0 |
| 2 | `payFaan` | u8 | 3–13 when this seat paid (dealt in or someone self-drew), else 0 |
| 3 | `turn` | u8 | The seat's discards so far |
| 4 | `seat` | u8 | 0–3 |
| 5 | `strategy` | u8 | An index into the manifest's `strategies` |
| 6 | `wallLeft` | u8 | Tiles left in the wall |
| 7 | `explored` | u8 | Bit 1: a random choice. Bit 2: a waiting position |
| 8–11 | `delta` | f32 | The seat's points for the hand |
| 12–15 | `dealSeed` | u32 | The hand's seed |

- **Aux**: 108 bytes per position, the labels of the frontier model's extra heads (`scripts/ml/heads.js`). They are targets only; the hidden tiles they are read from never reach a model's inputs.

| Bytes | Field | Meaning |
| --- | --- | --- |
| 0 | `ruleHand` | The hand the rules read for the tiles kept, an index into the manifest's `hands`; 255 unknown |
| 1 | `winHand` | The hand this seat won with; 255 if it didn't win |
| 2 | `dealNow` | The faan the tile thrown would pay right now; 0 if nobody wins on it |
| 3–5 | `steps` | Each opponent's steps from ready, 0 to 4, from the seat's right |
| 6–107 | `waits` | Each opponent's winning tiles (34 each), when it is ready |

The manifest records the feature version and size, the groups, the outcomes, the strategies, the game version, the settings and each shard's sample count. A set of 50,000 league hands at `--sample 0.12` is about 560,000 positions, about 650 MB.

## 2. Train: `npm run ml:train`

`ml/train.py` fits the network to one or more data sets:

```bash
npm run ml:train -- --data ml/data/league-1 ml/data/league-2 --name my-model --init ml/models/L3.json --lr 3e-4 --epochs 8
```

- **Loss**: cross-entropy on the outcome, plus half of the cross-entropy on the win faan (only for positions that won) and half on the pay faan (only for positions that paid).
- **Validation**: every 20th hand by seed is held out whole, so positions from the same hand never sit on both sides.
- **Stopping**: the best epoch by validation loss is kept, and training stops after `--patience` epochs without improvement.
- **Big data**: data over `--device-bytes` (3 GB) stays in memory and goes to the GPU a batch at a time.
- **Export**: writes `ml/models/<name>.json` (float16) and runs the [parity check](model.md#parity-with-pytorch). `--ship` also writes `js/mahjong-ml-weights.js`.

| Option | Default | |
| --- | --- | --- |
| `--data DIR ...` | required | Data sets to train on |
| `--name NAME` | required | Writes `ml/models/<name>.json` |
| `--init FILE` | none | Start from a model instead of random weights |
| `--hidden a,b` | 256,128 | Hidden layer sizes |
| `--epochs`, `--batch`, `--lr` | 30, 2048, 1e-3 | |
| `--weight-decay`, `--dropout` | 1e-4, 0.1 | Regularisation |
| `--patience` | 4 | Epochs without improvement before stopping |
| `--limit N` | all | Use at most N positions |
| `--device` | auto | `mps`, `cuda` (or `cuda:1` for a second GPU) or `cpu` |
| `--ship` | off | Also write the game's weights |

On an M-series GPU, an epoch over about 1.7 million positions takes about 10 seconds, so a league round's training takes a few minutes. Simulating the hands is the slow part.

## 3. Self-play against the rule bots: `npm run ml:loop`

`scripts/ml/loop.js` repeats: generate 20,000 hands with the best model exploring among the rule bots, train a new model from the best on the base data plus the last 3 rounds, then play it against Jorge Yau and Lucky Cat on the same 1,500 deals every round. If it scores more points a hand than Jorge Yau by a wider margin than the best did, it's the new best and is shipped. State is in `ml/loop/state.json`, so a stopped loop picks up where it left off. `--dir`, `--prefix` and `--data-seed` run a second loop beside the first.

## 4. The lab: `npm run ml:lab`

`scripts/ml/lab.js` is how Neural Cat was trained from NC3 to NC9; since NC10 it is trained by [the lineage-only loop](#training-a-lineage-against-its-own-past). The lab replaced the league, which stopped improving after L7 ([why](iterations.md#the-plateau-where-neural-cat-stands)): the league trained one model the same way every round, kept it on any score above 0 (a coin flip at ±30 points a hand), and only played copies of itself. The lab runs experiments, keeps only clear gains, and learns which experiments pay.

```bash
npm run ml:lab -- --rounds 10          # starts from the league's best (or --start FILE)
npm run ml:lab -- report               # every experiment's record
npm run ml:lab -- bench --model ml/models/L17.json --against s5,L7,L11 --deals 20000
```

Each round:

1. **Play** 50,000 deals. Half the seats are the champion, exploring (`--temperature 150`, `--epsilon 0.05`). The rest are its last three predecessors, s5, Jorge Yau, Lucky Cat (the LC20 network) and Lucky Cat Classic, so it learns against several styles, not only itself.
2. **Experiment.** Each round tries `--train` (3) training arms and `--play` (2) play arms:

   | Arm | What it tries |
   | --- | --- |
   | `finetune` | Fine-tune the champion on the last 8 data sets (learning rate 3e-4) |
   | `finetune-slow`, `finetune-fast` | The same at 1e-4 or 1e-3 |
   | `recent` | Fine-tune on the last 3 data sets only |
   | `wide` | A wider network (512, 256), from scratch, on the last 12 data sets |
   | `deep` | A deeper network (512, 256, 128), from scratch, on the last 12 data sets |
   | `topK+1`, `topK+2`, `topK-1` | Choose among more or fewer of Jorge Yau's discards |
   | `winBonus+50`, `winBonus+150`, `winBonus-50` | Add points for each 100% of win chance when choosing, to win more often |
   | `claimMargin+25`, `claimMargin-25` | How much a claim must beat Jorge Yau's call by |

   Play arms keep the champion's network and change only how it plays. The settings ride in the weights as `meta.play` (`{ topK, winBonus, claimMargin }`), so a shipped model plays with its own; an option passed to `create()` still overrides them. Every candidate inherits the champion's settings, and play arms are relative to them, so after a change is kept the next round explores around it.
3. **Judge** against the objective **J = points a hand + 5 × hands won (percentage points)**: the most points, with a point of win rate worth 5 points a hand. Each candidate plays the champion head to head (two seats each, every rotation) on 6,000 deals. The best two that are ahead play 20,000 fresh deals, and one is kept only if J beats the champion there by more than its standard error (about ±8 points a hand). Close calls are rejected, so the champion can't drift on noise.
4. **Learn.** Each arm keeps its tries, results and how often it was kept. The next round picks arms by an upper confidence bound: the best average J, plus a bonus for arms tried less, untried arms first. Failing arms are tried less but never ruled out.
5. **Escalate on a plateau.** After `--bold-after` (3) rounds with no new champion, the lab searches harder, and logs why:
   - **Bold arms join:** for Neural Cat and Only Orphans, a much wider network (768, 384), `topK+3` and `winBonus+300`; for Lucky Cat, `q-bold` (a big step on the last 4 rounds, tau 30). They're marked `*` in `npm run ml:lab -- report`.
   - **The champion explores more** in the round's deals: temperature 300 and epsilon 0.1 (Lucky Cat plays its best, with up to 3 replayed choices a hand instead of 2).
   - **Close calls get more deals:** a candidate ahead but within the noise on 20,000 deals plays 30,000 more and is judged on all 50,000, each run weighted by its precision.

   After `--stop-after` (6) rounds with no new champion, the lab stops and logs what it tried, rather than spending the night on the same search. The next lever then is new features, which need a person to design them.
6. **Ship.** A new champion ships at once (named NC2, NC3, ... by `scripts/ml/ship.js`), its weights go to the Hugging Face model repo (`--no-upload` skips that), and data no model uses goes to the Trash.

State, every evaluation and a log are in `ml/lab/`. A stopped lab picks up where it left off. `--dry`, `--quick-deals`, `--full-deals`, `--extra-deals` and `--prefix` run a small check of the lab without shipping or pruning.

### The lab for Only Orphans and Lucky Cat: `--strategy`

The same lab trains the learned Only Orphans and Lucky Cat's network, with the same experiments, the same two-step judging and the same rule: a champion is replaced only by a clear gain on 40,000 fresh deals.

```bash
npm run ml:lab -- --strategy only-orphans --rounds 10   # starts from the model in the game (or --start FILE)
npm run ml:lab -- --strategy lucky-cat --rounds 10      # starts from the model in the game
```

These labs made the models up to OT11d and lc32 (OS2c1 came from native rounds of `scripts/ml/frontier-model.js`); lc33, lc34 and OW1 came from [the lineage-only loop](#training-a-lineage-against-its-own-past). The table below is the labs as they last ran.

| | Neural Cat | Only Orphans | Lucky Cat |
| --- | --- | --- | --- |
| Starts from | The league's best (NC1) | The model in the game | The model in the game (lc32 when it last ran) |
| Plays against | Its last three champions, s5, Jorge Yau, Lucky Cat, Lucky Cat Classic | Neural Cat, Jorge Yau and Lucky Cat (the table the game seats it at), and its last two champions | The game's table: one seat against Neural Cat (two in three) and Jorge Yau, playing its best; no earlier selves since LC32, when two learner seats and its own champions taught it to beat its own kind |
| Records | Every seat's decisions (`--sample 0.12`) | Only its own seats (`--record only-orphans`, `--sample 0.25`) | Replays over reshuffled futures: the champion plays its best in one seat; at up to 2 of its real choices a hand the wall still to be drawn is reshuffled 4 ways, and its move and its 2 next-best moves each play those same 4 futures; each move's mean points are recorded (`scripts/ml/lucky.js generate --rollouts 2 --alts 2 --futures 4`, 20,000 deals a round) |
| Trains with | `ml/train.py` | `ml/train.py` | `ml/train_lucky.py` |
| Training arms | All six above | All six above | Move by move (`ml/train_lucky.py --mode q`): the champion's shares tilted toward the moves that scored more on the replays: `q` (1 set), `q-2`, `q-all` (4 sets), `q-soft` (tau 200), `q-sharp` (tau 50), bold `q-bold`; the whole-hand points-first arms (`pg`, `awr`, [below](#lucky-cat-points-first)) are retired, since at the table a hand's points were too noisy to learn from |
| Play arms | All of them | `winBonus` and `claimMargin` (it already picks among every allowed discard) | None (it plays its biggest share) |
| Judged on | Head to head, two seats each: J = points + 5 × wins | One seat each against Neural Cat, Jorge Yau and Lucky Cat, on the same deals: the same J | At the game's table (`lucky.js eval --table neural-cat,jorge-yau,neural-cat`): candidate and champion each take every seat in turn on the same deals, 40,000 of them, points first: J = points + 0.5 × wins, and kept only if its points a hand beat the champion's by more than twice their paired standard error and J is ahead |
| Baseline | | The rule-based Only Orphans plays the same deals every round | |
| Data | `ml/data/lab-<n>` (and the league's `league-<n>`) | `ml/data/ootgt-<n>`, only its own under the targets (the fixed-family rounds were `oolab-<n>` and the league's `orphans-<n>`) | `ml/data/lcfut-<n>` (replays over reshuffled futures; the one-wall replays were `lcroll-<n>`, the whole-hand table rounds `lctab-<n>`, the head-to-head rounds `lcpts-<n>`, and the league's `lc<n>` hold only wins) |
| Models | `N<round><letter>` | `OT<round><letter>` (OL<round><letter> before the targets) | `LF<round><letter>`, shipped as LC33, LC34, ... (the one-wall replays were `LR<round><letter>`, none shipped; the whole-hand table rounds `LT<round><letter>`, none shipped; the head-to-head points-first rounds were `LP<round><letter>`, none shipped; LC21–LC32 came from the hands-won lab, `LL<round><letter>`) |
| State | `ml/lab/` | `ml/lab-only-orphans/` | `ml/lab-lucky-cat/` |

A new champion ships at once to `js/mahjong-only-orphans-weights.js` or `js/mahjong-lucky-cat-weights.js`, and goes to the Hugging Face model repo's `only-orphans/` or `lucky-cat/` folder (`--no-upload` skips that, `--dry` ships nothing). Only Neural Cat's data is pruned.

#### Lucky Cat: points first

LC20 learned by imitating the moves of the hands it won, the quicker the win the more, and hands it lost taught it nothing. So it learned fast, cheap wins, and nothing about what a deal-in costs. From lc32 the lab tried training it on points first, wins second, on whole hands. These arms are retired (see the table above), and this is the record of how they worked:

1. **Every hand counts.** `lucky.js generate --returns` records the champion's real choices (two or more legal moves; half of them) in every hand its seats play, with the points that seat scored in the hand, how it ended, and the share the move was played with.
2. **The reward is the hand's points**, clipped at ±4,000 so one limit hand doesn't swamp a round (`--reward-clip`), plus `--win-bonus` points for a win (0 unless an arm sets it).
3. **The advantage** is the reward less a critic's value of the position: a value network in `ml/train_lucky.py`, not shipped, fitted on half the hands and scoring the other half. One hand's points are mostly luck, and in practice the critic explains well under 1% of their variance, so the advantage is close to the hand's points less the average.
4. **The update** (`--mode pg`) is a clipped policy gradient (PPO): moves in hands that did better than usual get more likely, moves in hands that did worse (deal-ins above all) less, each move's change against the share it was played with clipped at 1 ± 0.2, with a small entropy bonus, stopping once the policy has moved 0.03 (KL divergence) from the champion's. `--mode awr` imitates every move weighted by exp(advantage), at most 20. Shares are read at the temperature the data was played at.
5. **The judge** is points first: J = points a hand + 0.5 × hands won (percentage points), so a point of win rate is worth half a point a hand, about a tenth of a 20,000-deal evaluation's standard error. A candidate is kept only if its points a hand beat the champion's by more than twice their paired standard error (deal by deal, `lucky.js eval`) and J is ahead too.

The arms varied the update and its data: `pg` (the last round), `pg-2` and `pg-all` (2 and 4 rounds), `pg-fast` (a bigger step, 1e-3, KL up to 0.08), `pg-sqrt` (the square root of the points), `pg-clip` (points clipped at ±1,000), `pg-wins` (100 points more for a win) and `awr`. The modes stay in `ml/train_lucky.py`; the lab's arms are now the move-by-move ones (`--mode q`).

```bash
npm run ml:lab -- --strategy lucky-cat --rounds 4 --deals 25000 --workers 4 --dry   # trains and judges, ships nothing
npm run ml:lab -- --strategy lucky-cat bench --model ml/models/<name>.json --against lc20,jorge-yau --deals 20000
```

## The league (before the lab): `npm run ml:league`

`scripts/ml/league.js` trains against models only:

```bash
npm run ml:league -- --start ml/models/s5.json --rounds 20 --deals 50000 --keep 8
```

Each round:

1. **Generate** `--deals` hands where every seat is a model. Half the seats are the best model so far, exploring (`--temperature 150`, `--epsilon 0.05`, discards, claims and kongs alike). The rest are league members: the latest earlier bests (`--members`, default 4), with the starting model always among them, playing their best.
2. **Train** a new model from the best, on the last `--keep` rounds of data.
3. **Evaluate** it head to head against the best: two seats each, rotated through every seat, on `--eval-deals` hands no round has played. The score is its points a hand less the best's, with a 95% margin. Every `--anchor-every` rounds it's also measured against the starting model.
4. **Keep** it if it scored more than the best. It joins the league, becomes the best, and is shipped to `js/mahjong-ml-weights.js`, so the game plays it right away.

State and a log are in `ml/league/`. A stopped league picks up where it left off.

**Evaluations are noisy.** These models win only about 1 hand in 11 but win big (about 1,600 points), so one model-against-model score swings a lot: about ±50 points a hand at 2,000 deals, and ±29 at 6,000. Rounds 1–5 used 2,000; from round 6 the league uses `--eval-deals 6000 --anchor-every 5`. A new model can be kept by luck, so the best is confirmed on fresh deals, with many more hands, when the league ends.

## Only Orphans: `npm run ml:orphans`

The learned [Only Orphans](../strategies/only-orphans.md) was first trained the same way (O1 to O5), by `scripts/ml/orphans.js`; then in the lab, and since OW1 in [the lineage-only loop](#training-a-lineage-against-its-own-past). The league worked like this: a bootstrap round from the rule-based bot, then rounds of the best model exploring against Neural Cat, Jorge Yau, Lucky Cat and earlier Only Orphans models. Each round is ranked against the best model and against the rule-based bot (`scripts/ml/baselines/only-orphans-rules.js`), on the same deals. `--learner only-orphans` on `ml:generate` reads every position through its foundation, and `oo:<file>` seats one of its models. Progress is written to [only-orphans-training.md](../strategies/only-orphans-training.md) after every round.

```bash
npm run ml:orphans -- --rounds 20 --deals 50000
```

## 5. Compete: `npm run compete`

`scripts/competition.js` plays strategies against each other, each hand once per seat rotation, across worker threads:

```bash
npm run compete -- --lineup neural-cat,jorge-yau,lucky-cat,jorge-yau --deals 1000
npm run compete -- --lineup ml:ml/models/L3.json,ml:ml/models/s5.json,ml:ml/models/L3.json,ml:ml/models/s5.json --deals 2000
```

- `ml:<file>` seats Neural Cat with those weights as its own player.
- `--ml-weights FILE` changes the weights `neural-cat` plays with.
- `--ml-options '{"claims":false}'` passes other [options](decisions.md#options).
- `--json FILE` saves the full report.

Simulations play Neural Cat in fast mode: the same choices, less to explain.

## Reading the results

- **Points a hand** is the measure that matters: wins and deal-ins are means, not ends. A model that wins less often but wins bigger hands can come out well ahead.
- **Compare on the same deals**, every seat rotated. A different set of deals changes the result by more than most improvements.
- **Keeping the best of several noisy scores flatters the winner.** Confirm a winner on deals it was never measured on before trusting the margin.
