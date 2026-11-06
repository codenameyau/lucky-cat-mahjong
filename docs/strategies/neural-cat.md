# Neural Cat

`neural-cat` (`js/mahjong-ml.js`) is a learned strategy. It has no playbook of rules. A model trained on simulated deals picks the discard. Choose it on the Strategies sheet for a seat or the coach, like any other strategy.

## How it chooses

1. It plays Jorge Yau's hooks and tuning on the shared foundation (`js/mahjong-bot.js`), which list every discard in Jorge Yau's order and read each one: steps from ready, live tiles, the best plan and its faan, the backup plans, and the deal-in risk of the tile. With `topK: 1` it plays exactly like Jorge Yau.
2. `js/mahjong-ml-features.js` describes the position each discard leaves as 568 numbers in seven groups:

   | Group | What it holds |
   | --- | --- |
   | `hand` | the 13 tiles kept, your melds, flowers |
   | `discard` | the tile thrown and what kind of tile it is |
   | `table` | unseen copies, and each opponent's discards, melds and threat read |
   | `context` | the wall, the turn, the winds, the dealer |
   | `speed` | steps from ready on each shape, live tiles, the waits |
   | `value` | the best plan, its faan, what a ready hand scores |
   | `safety` | how likely the tile wins for each opponent |

   Only what the seat can see goes in. Never the wall, never another hand.
3. The network (`js/mahjong-ml-model.js`, 568 → 256 → 128 → 28) predicts how the hand ends: win by self-draw, win off a discard, deal in, someone else self-draws, someone else wins, or a draw, and the faan of the win you'd collect and of the hand you'd pay for.
4. Those make one number, expected points on the full-spicy payout table (a self-draw is paid by all three other seats). Of Jorge Yau's best three discards, the one worth the most goes. A fast cheap win and a slow big one are weighed on the same scale.

The model only reorders Jorge Yau's top three (`topK`, `TOP_K` in `js/mahjong-ml.js`). Choosing among every discard, the first model (on the plain foundation) won 3.5% of hands and dealt in 12% of the time: trained only on the bots' own choices, it couldn't yet tell close discards apart, and it didn't weigh safety.

Each candidate carries `ml`: `ev`, `pWin`, `pDealIn`, `avgWin`, `winFaan` and the outcome odds. The chosen one also carries `ml.why`: the points each feature group puts it ahead of the next best discard, found by swapping that group's features for the other discard's.

Claims and kongs are Jorge Yau's.

## Training

```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
npm run ml:generate -- --deals 20000 --lineup mix --pool jorge-yau,lucky-cat,jorge-yau,lucky-cat,only-orphans --out ml/data/r0
npm run ml:train -- --data ml/data/r0 --name r0 --ship
npm run compete -- --lineup neural-cat,jorge-yau,lucky-cat,jorge-yau --deals 1000
```

- `ml:generate` plays deals across worker threads and records about 30% of every seat's discards, whatever strategy plays it, read through neural-cat's own foundation (as in play) and labelled with how that hand ended for the seat. A rule bot's discard is swapped for a random one that costs no step toward ready 5% of the time, so the data holds choices the bots wouldn't make. With `neural-cat` in the lineup or pool it plays with exploration: `--temperature` (in points) picks among close discards by their value, and `--epsilon` throws a random one.
- `ml:train` (`ml/train.py`, PyTorch) holds out every 20th deal for validation and stops when validation loss stops improving. It writes `ml/models/<name>.json` and checks that the JS model gives the same outputs. `--ship` also writes `js/mahjong-ml-weights.js`, which the page and `npm run compete` load. `--init` starts from an earlier model.
- Data (`ml/data/`), models (`ml/models/`) and the venv aren't committed. Only the shipped weights are.

A change to the features (`FEATURE_VERSION`, `SIZE`) needs new data and a new model: the model refuses weights built for another size.

## Results

Each round plays the same evaluation deals (1,500 × 4 seat rotations, from deal 900000) at a table of `neural-cat, jorge-yau, lucky-cat, jorge-yau`. The score is Neural Cat's points per hand less Jorge Yau's on those deals. A round's model is kept only if it beats the best so far.

| Model | Trained from | Score | Neural Cat | Jorge Yau | Wins | Deal-ins | Kept |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| j0 | bootstrap, rule bots' data | +17.1 | | | | | start |
| s1 | j0 | +61.4 | +46.6 | −14.8 | 10.0% | 7.3% | yes |
| s2 | s1 | +34.6 | +30.0 | −4.6 | 10.1% | 7.6% | no |
| s3 | s1 | +52.3 | +38.3 | −14.0 | 9.1% | 7.9% | no |
| s4 | s1 | +42.5 | +33.1 | −9.4 | 9.7% | 8.1% | no |
| s5 | s1 | +76.0 | +53.9 | −22.1 | 10.4% | 7.5% | yes, shipped |
| s6 | s5 | +50.2 | +36.4 | −13.8 | 9.7% | 7.2% | no |

Keeping the best of several noisy scores flatters the winner, so the top three were replayed on fresh deals (1,500 × 4 rotations, from deal 1300000):

| Model | Score | Neural Cat | Jorge Yau | Lucky Cat | Wins | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| s5 | +48.5 | +38.4 | −10.0 | −18.4 | 10.7% | 7.6% | 731 |
| s1 | +22.3 | +18.5 | −3.8 | −11.0 | 10.1% | 7.2% | 705 |
| s3 | +7.9 | +14.8 | +6.9 | −28.6 | 9.4% | 7.3% | 666 |

s5 is the shipped model (1.86M training positions, `js/mahjong-ml-weights.js`). Neural Cat wins less often than Jorge Yau (about 10.5% of hands against about 14%), but its wins are worth about two and a half times as much (731 points against 292), and it comes out ahead on points. The score is noisy: about ±40 points per hand on one evaluation.

Run more rounds with `npm run ml:loop -- --rounds 4`. It picks up from `ml/loop/state.json`.
