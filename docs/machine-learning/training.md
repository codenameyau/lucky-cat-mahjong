# Training

Training has three parts. Node.js simulates hands and records positions with how each hand ended. PyTorch fits the network to them. Competitions decide whether a new model is better. Each step has its own command.

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
| Lab (N1a, N1b, ...) | `ml:lab` | Earlier champions, s5, Jorge Yau, LC20 and Lucky Cat Classic | Discards, claims, kongs, and how it plays (`meta.play`) | Today's framework: see [the lab](#4-the-lab-npm-run-mllab) |
| Lucky Cat lab (LF1a, ...) | `ml:lab -- --strategy lucky-cat` | The game's table: Neural Cat, Jorge Yau, Neural Cat | Its choices, each replayed with its next-best moves on 4 reshuffled futures, by the mean points each scored | lc32 is in the game (from the earlier, hands-won lab). The futures rounds start from it ([handoff](../../ml/LUCKY_CAT_HANDOFF.md)) |

The full results, round by round, are in the [playbook](../strategies/neural-cat.md#results) and on the [model card](https://huggingface.co/codenameyau/lucky-cat-mahjong).

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

### Data format

Each set is a folder with `manifest.json` and, per worker, `shard-N.features` and `shard-N.labels`:

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

`scripts/ml/lab.js` is how Neural Cat is trained now. It replaced the league, which stopped improving after L7 ([why](iterations.md#the-plateau-where-neural-cat-stands)): the league trained one model the same way every round, kept it on any score above 0 (a coin flip at ±30 points a hand), and only played copies of itself. The lab runs experiments, keeps only clear gains, and learns which experiments pay.

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
   - **Bold arms join:** for Neural Cat and Only Orphans, a much wider network (768, 384), `topK+3` and `winBonus+300`; for Lucky Cat, a slow fine-tune on the last 14 rounds. They're marked `*` in `npm run ml:lab -- report`.
   - **The champion explores more** in the round's deals: temperature 300 and epsilon 0.1 (Lucky Cat: sampling temperature 1.5).
   - **Close calls get more deals:** a candidate ahead but within the noise on 20,000 deals plays 30,000 more and is judged on all 50,000, each run weighted by its precision.

   After `--stop-after` (6) rounds with no new champion, the lab stops and logs what it tried, rather than spending the night on the same search. The next lever then is new features, which need a person to design them.
6. **Ship.** A new champion ships at once (named NC2, NC3, ... by `scripts/ml/ship.js`), its weights go to the Hugging Face model repo (`--no-upload` skips that), and data no model uses goes to the Trash.

State, every evaluation and a log are in `ml/lab/`. A stopped lab picks up where it left off. `--dry`, `--quick-deals`, `--full-deals`, `--extra-deals` and `--prefix` run a small check of the lab without shipping or pruning.

### The lab for Only Orphans and Lucky Cat: `--strategy`

The same lab trains the learned Only Orphans and Lucky Cat's network, with the same experiments, the same two-step judging and the same rule: a champion is replaced only by a clear gain on 20,000 fresh deals.

```bash
npm run ml:lab -- --strategy only-orphans --rounds 10   # starts from the model in the game (or --start FILE)
npm run ml:lab -- --strategy lucky-cat --rounds 10      # starts from the model in the game, lc32
```

| | Neural Cat | Only Orphans | Lucky Cat |
| --- | --- | --- | --- |
| Starts from | The league's best (NC1) | The model in the game | The model in the game (lc32) |
| Plays against | Its last three champions, s5, Jorge Yau, Lucky Cat, Lucky Cat Classic | Neural Cat, Jorge Yau and Lucky Cat (the table the game seats it at), and its last two champions | The game's table: one seat against Neural Cat (two in three) and Jorge Yau, exploring at temperature 0.5 (`--temperature`); no earlier selves since LC32, when two learner seats and its own champions taught it to beat its own kind |
| Records | Every seat's decisions (`--sample 0.12`) | Only its own seats (`--record only-orphans`, `--sample 0.25`) | Replays over reshuffled futures: the champion plays its best in one seat; at up to 2 of its real choices a hand the wall still to be drawn is reshuffled 4 ways, and its move and its 2 next-best moves each play those same 4 futures; each move's mean points are recorded (`scripts/ml/lucky.js generate --rollouts 2 --alts 2 --futures 4`, 20,000 deals a round) |
| Trains with | `ml/train.py` | `ml/train.py` | `ml/train_lucky.py` |
| Training arms | All six above | All six above | Move by move (`ml/train_lucky.py --mode q`): the champion's shares tilted toward the moves that scored more on the replays: `q` (1 set), `q-2`, `q-all` (4 sets), `q-soft` (tau 200), `q-sharp` (tau 50), bold `q-bold`; the whole-hand points-first arms (`pg`, `awr`, [below](#lucky-cat-points-first)) are retired, since at the table a hand's points were too noisy to learn from |
| Play arms | All of them | `winBonus` and `claimMargin` (it already picks among every allowed discard) | None (it plays its biggest share) |
| Judged on | Head to head, two seats each: J = points + 5 × wins | One seat each against Neural Cat, Jorge Yau and Lucky Cat, on the same deals: the same J | At the game's table (`lucky.js eval --table neural-cat,jorge-yau,neural-cat`): candidate and champion each take every seat in turn on the same deals, 40,000 of them, points first: J = points + 0.5 × wins, and kept only if its points a hand beat the champion's by more than their paired standard error |
| Baseline | | The rule-based Only Orphans plays the same deals every round | |
| Data | `ml/data/lab-<n>` (and the league's `league-<n>`) | `ml/data/ootgt-<n>`, only its own under the targets (the fixed-family rounds were `oolab-<n>` and the league's `orphans-<n>`) | `ml/data/lcfut-<n>` (replays over reshuffled futures; the one-wall replays were `lcroll-<n>`, the whole-hand table rounds `lctab-<n>`, the head-to-head rounds `lcpts-<n>`, and the league's `lc<n>` hold only wins) |
| Models | `N<round><letter>` | `OT<round><letter>` (OL<round><letter> before the targets) | `LF<round><letter>`, shipped as LC33, LC34, ... (the one-wall replays were `LR<round><letter>`, none shipped; the whole-hand table rounds `LT<round><letter>`, none shipped; the head-to-head points-first rounds were `LP<round><letter>`, none shipped; LC21–LC32 came from the hands-won lab, `LL<round><letter>`) |
| State | `ml/lab/` | `ml/lab-only-orphans/` | `ml/lab-lucky-cat/` |

A new champion ships at once to `js/mahjong-only-orphans-weights.js` or `js/mahjong-lucky-cat-weights.js`, and goes to the Hugging Face model repo's `only-orphans/` or `lucky-cat/` folder (`--no-upload` skips that, `--dry` ships nothing). Only Neural Cat's data is pruned.

#### Lucky Cat: points first

LC20 learned by imitating the moves of the hands it won, the quicker the win the more, and hands it lost taught it nothing. So it learned fast, cheap wins, and nothing about what a deal-in costs. The lab now trains it on points first, wins second:

1. **Every hand counts.** `lucky.js generate --returns` records the champion's real choices (two or more legal moves; half of them) in every hand its seats play, with the points that seat scored in the hand, how it ended, and the share the move was played with.
2. **The reward is the hand's points**, clipped at ±4,000 so one limit hand doesn't swamp a round (`--reward-clip`), plus `--win-bonus` points for a win (0 unless an arm sets it).
3. **The advantage** is the reward less a critic's value of the position: a value network in `ml/train_lucky.py`, not shipped, fitted on half the hands and scoring the other half. One hand's points are mostly luck, and in practice the critic explains well under 1% of their variance, so the advantage is close to the hand's points less the average.
4. **The update** (`--mode pg`) is a clipped policy gradient (PPO): moves in hands that did better than usual get more likely, moves in hands that did worse (deal-ins above all) less, each move's change against the share it was played with clipped at 1 ± 0.2, with a small entropy bonus, stopping once the policy has moved 0.03 (KL divergence) from the champion's. `--mode awr` imitates every move weighted by exp(advantage), at most 20. Shares are read at the temperature the data was played at.
5. **The judge** is points first: J = points a hand + 0.5 × hands won (percentage points), so a point of win rate is worth half a point a hand, about a tenth of a 20,000-deal evaluation's standard error. A candidate is kept only if its points a hand beat the champion's by more than their paired standard error (deal by deal, `lucky.js eval`) and J is ahead too.

The arms vary the update and its data: `pg` (the last round), `pg-2` and `pg-all` (2 and 4 rounds), `pg-fast` (a bigger step, 1e-3, KL up to 0.08), `pg-sqrt` (the square root of the points), `pg-clip` (points clipped at ±1,000), `pg-wins` (100 points more for a win) and `awr`. The bandit picks among them as for Neural Cat.

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

The learned [Only Orphans](../strategies/only-orphans.md) is trained the same way, by `scripts/ml/orphans.js`: a bootstrap round from the rule-based bot, then rounds of the best model exploring against Neural Cat, Jorge Yau, Lucky Cat and earlier Only Orphans models. Each round is ranked against the best model and against the rule-based bot (`scripts/ml/baselines/only-orphans-rules.js`), on the same deals. `--learner only-orphans` on `ml:generate` reads every position through its foundation, and `oo:<file>` seats one of its models. Progress is written to [only-orphans-training.md](../strategies/only-orphans-training.md) after every round.

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
