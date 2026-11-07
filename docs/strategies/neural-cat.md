# Neural Cat

`neural-cat` (`js/mahjong-ml.js`) is a learned strategy. It has no playbook of rules. A model trained on simulated deals picks the discard, and whether to claim or kong. Choose it on the Strategies sheet for a seat or the coach, like any other strategy.

This is the strategy's playbook: how it plays and every result. How the whole AI layer is built (features, the network, decisions, training, the league, fair play and Hugging Face) is in [docs/machine-learning](../machine-learning/README.md).

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

## Claims and kongs

A claim is weighed in the same points. When a tile is on offer, each choice is a position:

- **Pass**: the hand as it is, waiting for the next tile.
- **Pung or chow**: the hand after the call and the best discard after it (Jorge Yau's best three, as on any turn).
- **Kong**: the hand with the kong, before its replacement tile.

On your own turn, each kong you can declare (concealed, or added to a pung) is weighed against the best discard the same way. A position waiting for a tile has no discard of its own, so `encodeWaiting` (`js/mahjong-ml-features.js`) reads it with the seat's last discard in the discard group, a tile no one can claim any more. Training data holds these positions too, so the model learns what passing and kongs are worth.

Jorge Yau's call is the default. The model's pick replaces it when it's worth `CLAIM_MARGIN` points more (`js/mahjong-ml.js`, 0 now). `decideClaim(...).found.ml` and `kongChoice(...)` list every choice with its read, the model's `pick` and Jorge Yau's (`foundation`), and the coach says the points for the top choices, and when the rules would have called it differently. `create({ claims: false })` leaves claims and kongs to Jorge Yau.

## Fair play

The model sees what its seat can see and nothing else: its own hand, every discard, every shown meld, how many tiles are left in the wall. Never the wall's tiles, another player's hand, or which tile another player's concealed kong is. The outcome a training position is labelled with is the only thing from the future it learns from, and only in training.

`js/mahjong-fair-play.test.js` (run by `npm test`) checks this for Neural Cat and every table strategy. At real positions from whole hands it makes every decision twice: once on a copy of the game, and once on a copy where every tile the seat can't see is shuffled (the other hands, the wall, the other players' concealed kongs). On that copy the seed, the random number generator, the move log and anyone else's drawn tile throw if read. Every decision, and every number behind it, must come out the same, for discards, claims, kongs, the coach's hints and the training features. The test also plants cheats (peeking at the next hand, the wall, the seed, the move log) and checks each one is caught.

That test found the shared foundation reading which tile an opponent's concealed kong was, when sizing up their hand. Every strategy now reads an opponent's melds through `shownMelds` (`js/mahjong-bot.js`), and the coach does the same.

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
- Both are public on Hugging Face. The models are at [codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong) (`neural-cat/`), and every training set at [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games). `npm run ml:hf` and `npm run ml:hf-data` upload them over SSH (`--watch` keeps uploading as the league runs).

A change to the features (`FEATURE_VERSION`, `SIZE`) needs new data and a new model: the model refuses weights built for another size.

### Self-play and the league

`npm run ml:loop` trained the first models (s1 to s6) against Jorge Yau and Lucky Cat. `npm run ml:league` trains against other Neural Cat models only:

```bash
npm run ml:league -- --start ml/models/s5.json --rounds 10 --deals 100000
```

Each round plays new deals where every seat is a model. Half the seats are the best model so far, exploring: `--temperature` among close choices, and an occasional random discard or claim. The rest are league members, earlier models that beat the best of their round, with s5 always among them, playing their best. A new model is trained from the best on the last four rounds' data and plays the best head to head: two seats each, every seat rotation, on 2,000 deals the league hasn't played. If it scores more points a hand, it joins the league, becomes the best and is shipped. Each round also measures it against s5.

Simulations play in fast mode (`create({ fast: true })`): the same choices, but only the discards the model picks from are read, and the explanation is skipped. With a sparse first layer in the model and a cache of whole-hand shanten in the engine, a model-only table plays about 4.5 deals a second per core. `npm run compete` takes `ml:<file>` as a player, and `--ml-options` for neural-cat (e.g. `'{"claims":false}'`).

## Results

### League (claims and kongs, against other models)

Every seat is a Neural Cat model. Each round trains a model from the best so far on the last four rounds' hands, then plays it head to head against the best before it (two seats each, every seat rotation, on deals no round has played). The score is the model's points a hand less its opponent's, with a 95% margin where measured. A model is kept only if it scores more. The league is still running, so this is the state after round 7; the [model card](https://huggingface.co/codenameyau/lucky-cat-mahjong) is rebuilt from the same results on every upload.

| Model | Played against | vs best | vs s5 | Wins | Deal-ins | Average win | Kept |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| L1 | s5 | +62.5 points | +62.5 points | 9.3% | 6.2% | 1,675 points | yes |
| L2 | L1 | +28.3 points | +68.4 points | 8.6% | 5.4% | 1,672 points | yes |
| L3 | L2 | +16.4 points | +95.7 points | 8.5% | 5.6% | 1,537 points | yes |
| L4 | L3 | +14.8 points | +0.0 points | 8.7% | 5.6% | 1,808 points | yes |
| L5 | L4 | −3.5 points | +0.3 points | 8.6% | 5.5% | 1,708 points | no |
| L6 | L4 | +7.9 points ± 30 | not measured | 8.3% | 5.4% | 1,781 points | yes |
| L7 | L6 | +41.1 points ± 33 | not measured | 8.1% | 5.1% | 2,069 points | yes, shipped |

Rounds 1 to 5 used 2,000-deal evaluations, which swing by about ±50 points a hand, so only L1's gain over s5 is clearly more than noise there. Rounds 6 and 7 used 6,000 deals (about ±30).

#### What L7 improved

The game now ships NC1, which is L17 (shipped models are named NC1, NC2 and so on; see [release names](../machine-learning/model.md)). At the time of writing, L7 was the model the game shipped. It replaces L3, which shipped before it. Against L6, its direct predecessor, on 6,000 new deals (each deal played from every seat, L7 and L6 two seats each):

| | L7 | L6 |
| --- | ---: | ---: |
| Points a hand (L7 less L6) | **+41.1 ± 33** | |
| Average win | **2,069 points** | 1,682 points |
| Hands won | 8.1% | 8.2% |
| Deal-ins | **5.1%** | 5.4% |
| Limit hands won | **400** | 340 |

- **Bigger wins, not more of them.** L7 wins about as often as L6 but each win pays 23% more, and it wins 18% more limit hands. Its edge comes from choosing the high-value hand over the quick one, the tradeoff the expected-points score exists to make.
- **A little safer.** It deals in on 5.1% of hands against 5.4%.
- **A better read of the hand.** On positions held out of training it names how the hand ends correctly 73.3% of the time, against 73.0% for L6, 70.6% for L3 and 68.6% for s5, and its outcome loss falls from 0.905 to 0.896.
- **More data.** It trained on 3,994,461 positions from seven league rounds, against 1,692,560 from three for L3.

How much to trust it: +41.1 is only just beyond its ±33 margin, and L6's own win over L4 (+7.9 ± 30) was within noise, so each step is small. The steady gains are in the held-out accuracy, which rises with almost every model (s5 68.6%, L3 70.6%, L4 71.8%, L5 72.6%, L6 73.0%, L7 73.3%), and the average win. L7 was not measured against s5 or the rule bots, so there is no number yet for how far it is ahead of L3 head to head. L7's weights ship in `js/mahjong-ml-weights.js`, and the model and its results are on [Hugging Face](https://huggingface.co/codenameyau/lucky-cat-mahjong).

**Pairs.** Keeping a pair that can still become a pung over a single (the `keepPairs` knob) was tested against Jorge Yau without it, on the same 6,000 deals × 4 seat rotations. It won as often (about 15%) but with smaller hands (about 340 points a win against 430), and came out behind: throwing honors to keep pairs, −14.8 ± 17.6 points a hand; throwing only number tiles, −19.8 ± 17.6. Neither is a sure loss, but neither is a gain. Neural Cat with it was even (+2.2 ± 41.8). The knob stays off. Neural Cat sees how many pairs and sets it holds (the `value` features), so it keeps pairs where the hands it learned from say they pay.

**Honors.** Jorge Yau with the honor order against Jorge Yau without it, on 6,000 deals × 4 rotations: +2.0 ± 17.7 points a hand, the same wins, deal-ins and size of win. It's a tie-break between honors held the same way, so it rarely changes a discard; it's on because it's the right order to keep honors in, and the coach can teach it.

### Self-play against the rule bots (discards only)

Each round plays the same evaluation deals (1,500 × 4 seat rotations, from deal 900000) at a table of `neural-cat, jorge-yau, lucky-cat, jorge-yau`. The score is Neural Cat's points per hand less Jorge Yau's on those deals. A round's model is kept only if it beats the best so far.

| Model | Trained from | Score | Neural Cat | Jorge Yau | Wins | Deal-ins | Kept |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| j0 | bootstrap, rule bots' data | +17.1 points | | | | | start |
| s1 | j0 | +61.4 points | +46.6 points | −14.8 points | 10.0% | 7.3% | yes |
| s2 | s1 | +34.6 points | +30.0 points | −4.6 points | 10.1% | 7.6% | no |
| s3 | s1 | +52.3 points | +38.3 points | −14.0 points | 9.1% | 7.9% | no |
| s4 | s1 | +42.5 points | +33.1 points | −9.4 points | 9.7% | 8.1% | no |
| s5 | s1 | +76.0 points | +53.9 points | −22.1 points | 10.4% | 7.5% | yes, shipped |
| s6 | s5 | +50.2 points | +36.4 points | −13.8 points | 9.7% | 7.2% | no |

Keeping the best of several noisy scores flatters the winner, so the top three were replayed on fresh deals (1,500 × 4 rotations, from deal 1300000):

| Model | Score | Neural Cat | Jorge Yau | Lucky Cat | Wins | Deal-ins | Average win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| s5 | +48.5 points | +38.4 points | −10.0 points | −18.4 points | 10.7% | 7.6% | 731 points |
| s1 | +22.3 points | +18.5 points | −3.8 points | −11.0 points | 10.1% | 7.2% | 705 points |
| s3 | +7.9 points | +14.8 points | +6.9 points | −28.6 points | 9.4% | 7.3% | 666 points |

s5 is the shipped model (1.86M training positions, `js/mahjong-ml-weights.js`). Neural Cat wins less often than Jorge Yau (about 10.5% of hands against about 14%), but its wins are worth about two and a half times as much (731 points against 292), and it comes out ahead on points. The score is noisy: about ±40 points per hand on one evaluation.

Run more rounds with `npm run ml:loop -- --rounds 4`. It picks up from `ml/loop/state.json`.
