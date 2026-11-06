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
| League (L1, L2, ...) | `ml:league` | Only Neural Cat models: the best, exploring, against earlier bests | Discards, claims, kongs | L3: +95.7 points a hand over s5, head to head |

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

## 4. The league: `npm run ml:league`

`scripts/ml/league.js` trains against models only:

```bash
npm run ml:league -- --start ml/models/s5.json --rounds 20 --deals 50000 --keep 8
```

Each round:

1. **Generate** `--deals` hands where every seat is a model. Half the seats are the best model so far, exploring (`--temperature 150`, `--epsilon 0.05`, discards, claims and kongs alike). The rest are league members: the latest earlier bests (`--members`, default 4), with the starting model always among them, playing their best.
2. **Train** a new model from the best, on the last `--keep` rounds of data.
3. **Evaluate** it head to head against the best: two seats each, rotated through every seat, on `--eval-deals` (2,000) hands no round has played. The score is its points a hand less the best's. It's also measured against the starting model.
4. **Keep** it if it scored more than the best. It joins the league, becomes the best, and is shipped to `js/mahjong-ml-weights.js`, so the game plays it right away.

State and a log are in `ml/league/`. A stopped league picks up where it left off. A round of 50,000 hands takes about 30 minutes on an 8-core Mac, so 20 rounds take about 10 hours. One evaluation is noisy, about ±4 points a hand, so the results are confirmed on fresh deals when the league ends.

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
