# Hand patterns: what each strategy wins with

Which scoring patterns win hands, how often, and for how much, for each of the four strategies, from **100,000 full games** with Jorge Yau, Neural Cat, Lucky Cat and Only Orphans at one table: **1,949,960 hands**, 1,301,137 won.

A **hand** is one hand of mahjong, which ends in a win or a draw. A **game** is every hand played until all four rounds are done: each player deals in turn in each round, and a dealer who wins deals again, so a game has at least 16 hands (19.5 on average here).

## Contents

- [How it was measured](#how-it-was-measured)
- [Games, hands and wins](#games-hands-and-wins)
- [Points and games won](#points-and-games-won)
- [Win rate and expected faan of each hand pattern](#win-rate-and-expected-faan-of-each-hand-pattern): [by win rate](#sorted-by-win-rate), [by expected faan](#sorted-by-expected-faan)
- [Hand patterns by strategy](#hand-patterns-by-strategy)
- [Sets of honors and bonuses](#sets-of-honors-and-bonuses)
- [Wins by total faan](#wins-by-total-faan)
- [Full hands: every pattern of a win, with its faan](#full-hands-every-pattern-of-a-win-with-its-faan)
- [What it shows](#what-it-shows)
- [The dataset](#the-dataset)
- [Reproducing it](#reproducing-it)

## How it was measured

- **The table:** the four strategies the game ships, one seat each: Jorge Yau (rules only), Neural Cat NC10, Lucky Cat LC34 and Only Orphans OW1. The seats rotate every game, so each strategy sits in every seat, and deals first, equally often.
- **100,000 full games**, game seeds 8,000,001 to 8,100,000. Every hand of every game is played, all four rounds.
- **Rules:** the game's own: a 3-faan minimum to win, a 13-faan limit, full-spicy payouts. A self-draw is paid by all three opponents, and a win on a discard only by the player who threw it. Players start with enough points that nobody goes bust, so every game runs all four rounds.
- **Engines:** games 1 to 30,000 were played by the game's JS engine, and the rest by the native C++ simulator's exact build. On a 400-game check the two matched on 7,804 of 7,805 hands.
- **Counting:** a win usually scores several patterns at once, for example Half Flush + Dragon Triplet + Self-Draw, so a pattern's count is the number of wins that scored it. **Hand patterns** say what the hand is. **Sets of honors** are a pung or kong of dragons or a scoring wind. **Bonuses** are how the hand was won, and flowers.
- **Uncertainty:** ± is one standard error. For points, it's over games, since one game's hands aren't independent.

## Games, hands and wins

Every strategy sat in all 1,949,960 hands, one seat each. 648,823 hands (33.3%) ended with no winner. Every game had at least one winner.

| Strategy | Model | Hands won | Win rate per hand | Hands won per game | Average faan a win | Limit hands (% of wins) | Self-drawn (% of wins) | Concealed (% of wins) | Dealt in (per hand) | Win rate as dealer |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jorge Yau | Rules only | 389,856 | 19.99% ± 0.03 | 3.90 | 5.19 | 6,740 (1.7%) | 33.1% | 41.2% | 10.60% | 21.1% |
| Neural Cat | NC10 | 370,904 | 19.02% ± 0.03 | 3.71 | 5.80 | 13,812 (3.7%) | 29.6% | 39.5% | 10.30% | 19.4% |
| Lucky Cat | LC34 | 437,088 | 22.42% ± 0.03 | 4.37 | 5.56 | 1,879 (0.4%) | 25.2% | 7.5% | 12.36% | 23.5% |
| Only Orphans | OW1 | 103,289 | 5.30% ± 0.02 | 1.03 | 7.29 | 18,300 (17.7%) | 24.0% | 97.7% | 14.26% | 5.6% |
| **All** | | 1,301,137 | 66.73% (of hands) | 13.01 | 5.66 | 40,731 (3.1%) | 28.7% | 33.9% | | |

A strategy's win rate is the share of all hands it won. Dealt in is the share of hands it paid off a discard.

## Points and games won

| Strategy | Net points a hand | Games finished on top |
| --- | ---: | ---: |
| Neural Cat | +61.8 ± 1.1 | 34,531 (34.5%) |
| Only Orphans | +48.4 ± 1.1 | 20,345 (20.3%) |
| Jorge Yau | −35.9 ± 0.9 | 21,343 (21.3%) |
| Lucky Cat | −74.2 ± 0.8 | 24,056 (24.1%) |

Net points a hand is what a seat won less what it paid, averaged over every hand it sat in. Games finished on top is the share of games a strategy ended with the most points; a tie counts for each.

## Win rate and expected faan of each hand pattern

- **Win rate per hand:** the share of all 1,949,960 hands that ended in a win scoring that pattern. The data record how hands ended, not what a seat was aiming for, so this is how often the table finished the pattern, not how often a seat that went for it finished it.
- **Expected faan of the win:** the average total faan of the wins that scored it, every other pattern of the win included. **Points a win** is what the winner collected on average. Points double with each faan (8 at 3 faan, 8,192 at the 13-faan limit), so a pattern's few biggest wins drive its average. Half Flush runs up to limit hands, while Seven Pairs rarely goes past 7 faan, so Half Flush pays more a win on average for about the same faan.
- A win can score more than one hand pattern, so the shares of wins add up to more than 100%. At this many hands, standard errors are under 0.07 points of a percent for a win rate, and under 0.02 faan for the common patterns.

### Sorted by win rate

| Pattern | Its own faan | Wins with it | Win rate per hand | Share of wins | Expected faan of the win | Points a win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Half Flush | 3 | 461,142 | 23.65% | 35.4% | 4.99 | 284 |
| Full Flush | 7 | 269,568 | 13.82% | 20.7% | 8.26 | 792 |
| All Triplets | 3 | 197,087 | 10.11% | 15.1% | 5.92 | 656 |
| Seven Pairs | 4 | 167,874 | 8.61% | 12.9% | 5.14 | 104 |
| All Sequences | 1 | 158,526 | 8.13% | 12.2% | 5.00 | 316 |
| Chicken Hand | 0 | 40,605 | 2.08% | 3.1% | 3.06 | 27 |
| Concealed Triplets | 10 | 35,415 | 1.82% | 2.7% | 11.76 | 7,058 |
| Thirteen Orphans | 13 | 26,121 | 1.34% | 2.0% | 13.00 | 12,353 |
| Mixed Orphans | 1 | 15,722 | 0.81% | 1.2% | 7.56 | 1,941 |
| Small Three Dragons | 5 | 3,126 | 0.16% | 0.2% | 10.54 | 5,907 |
| All Honors | 10 | 2,098 | 0.11% | 0.2% | 12.93 | 11,773 |
| Big Three Dragons | 8 | 1,103 | 0.057% | 0.1% | 12.50 | 10,258 |
| Small Four Winds | 6 | 402 | 0.021% | 0.0% | 12.61 | 10,585 |
| All Terminals | 10 | 215 | 0.011% | 0.0% | 10.99 | 4,315 |
| Big Four Winds | 13 | 109 | 0.006% | 0.0% | 13.00 | 11,950 |
| Nine Gates | 13 | 101 | 0.005% | 0.0% | 13.00 | 11,923 |
| Four Quads | 13 | 2 | 0.000% | 0.0% | 13.00 | 16,384 |

### Sorted by expected faan

| Pattern | Its own faan | Wins with it | Win rate per hand | Share of wins | Expected faan of the win | Points a win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Thirteen Orphans | 13 | 26,121 | 1.34% | 2.0% | 13.00 | 12,353 |
| Big Four Winds | 13 | 109 | 0.006% | 0.0% | 13.00 | 11,950 |
| Nine Gates | 13 | 101 | 0.005% | 0.0% | 13.00 | 11,923 |
| Four Quads | 13 | 2 | 0.000% | 0.0% | 13.00 | 16,384 |
| All Honors | 10 | 2,098 | 0.11% | 0.2% | 12.93 | 11,773 |
| Small Four Winds | 6 | 402 | 0.021% | 0.0% | 12.61 | 10,585 |
| Big Three Dragons | 8 | 1,103 | 0.057% | 0.1% | 12.50 | 10,258 |
| Concealed Triplets | 10 | 35,415 | 1.82% | 2.7% | 11.76 | 7,058 |
| All Terminals | 10 | 215 | 0.011% | 0.0% | 10.99 | 4,315 |
| Small Three Dragons | 5 | 3,126 | 0.16% | 0.2% | 10.54 | 5,907 |
| Full Flush | 7 | 269,568 | 13.82% | 20.7% | 8.26 | 792 |
| Mixed Orphans | 1 | 15,722 | 0.81% | 1.2% | 7.56 | 1,941 |
| All Triplets | 3 | 197,087 | 10.11% | 15.1% | 5.92 | 656 |
| Seven Pairs | 4 | 167,874 | 8.61% | 12.9% | 5.14 | 104 |
| All Sequences | 1 | 158,526 | 8.13% | 12.2% | 5.00 | 316 |
| Half Flush | 3 | 461,142 | 23.65% | 35.4% | 4.99 | 284 |
| Chicken Hand | 0 | 40,605 | 2.08% | 3.1% | 3.06 | 27 |

## Hand patterns by strategy

Each strategy's share of its own wins that scored each hand pattern.

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Half Flush | 3 | 26.5% | 28.5% | 55.5% | 9.2% |
| Full Flush | 7 | 18.0% | 26.4% | 23.3% | 0.0% |
| All Triplets | 3 | 16.6% | 10.7% | 20.9% | 1.6% |
| Seven Pairs | 4 | 10.2% | 11.0% | 3.7% | 69.0% |
| All Sequences | 1 | 15.4% | 22.2% | 3.7% | 0.1% |
| Chicken Hand | 0 | 6.5% | 3.4% | 0.6% | 0.1% |
| Concealed Triplets | 10 | 1.1% | 2.8% | 1.0% | 15.7% |
| Thirteen Orphans | 13 | 1.3% | 2.5% | 0.0% | 11.7% |
| Mixed Orphans | 1 | 1.5% | 0.7% | 0.3% | 5.7% |
| Small Three Dragons | 5 | 0.3% | 0.3% | 0.2% | 0.3% |
| All Honors | 10 | 0.1% | 0.2% | 0.1% | 0.7% |
| Big Three Dragons | 8 | 0.1% | 0.1% | 0.0% | 0.2% |
| Small Four Winds | 6 | 0.0% | 0.0% | 0.0% | 0.1% |
| All Terminals | 10 | 0.0% | 0.0% | 0.0% | 0.1% |
| Big Four Winds | 13 | 0.0% | 0.0% | 0.0% | 0.0% |
| Nine Gates | 13 | 0.0% | 0.0% | 0.0% | 0.0% |
| Four Quads | 13 | 0.0% | 0.0% | 0.0% | 0.0% |

## Sets of honors and bonuses

The same for the sets of honors and the bonuses.

### Sets of honors

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dragon Triplet | 1 | 25.1% | 17.3% | 20.8% | 9.1% |
| Seat Wind | 1 | 5.7% | 4.0% | 7.9% | 2.7% |
| Round Wind | 1 | 5.4% | 3.9% | 7.1% | 2.7% |
| Seat and Round Wind | 2 | 2.5% | 1.7% | 2.5% | 1.0% |
| Dragon Quad | 1 | 0.9% | 0.5% | 1.2% | 0.4% |

### Bonuses

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Self-Draw | 1 | 33.3% | 29.7% | 25.3% | 24.7% |
| Seat Season | 1 | 23.0% | 21.6% | 20.2% | 22.4% |
| Seat Flower | 1 | 23.0% | 21.5% | 20.1% | 22.5% |
| No Flowers | 1 | 20.1% | 19.2% | 17.9% | 17.4% |
| Concealed | 1 | 28.6% | 23.2% | 3.0% | 1.3% |
| Win on Last Tile | 1 | 2.2% | 1.9% | 2.0% | 1.4% |
| Win by Kong | 1 | 0.5% | 0.2% | 0.6% | 0.1% |
| Four Seasons | 2 | 0.3% | 0.3% | 0.2% | 0.3% |
| Four Flowers | 2 | 0.3% | 0.2% | 0.2% | 0.3% |
| Seven Robbing One | 5 | 0.2% | 0.2% | 0.1% | 0.7% |
| Robbing the Kong | 1 | 0.1% | 0.2% | 0.0% | 0.1% |
| Win by Double Kong | 8 | 0.0% | 0.0% | 0.0% | 0.0% |
| Eight Immortals Crossing the Sea | 13 | 0.0% | 0.0% | 0.0% | 0.0% |
| Earthly Hand | 13 | 0.0% | 0.0% | 0.0% | 0.0% |
| Heavenly Hand | 13 | 0.0% | 0.0% | 0.0% | 0.0% |

## Wins by total faan

| Total faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans | All |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 29.2% | 25.2% | 13.4% | 0.3% | 20.4% |
| 4 | 20.8% | 19.4% | 26.5% | 18.0% | 22.1% |
| 5 | 17.1% | 14.0% | 20.8% | 31.4% | 18.6% |
| 6 | 7.3% | 5.0% | 8.2% | 12.6% | 7.4% |
| 7 | 7.3% | 7.7% | 9.5% | 4.5% | 7.9% |
| 8 | 9.0% | 11.7% | 12.0% | 3.1% | 10.3% |
| 9 | 4.4% | 7.0% | 5.6% | 1.1% | 5.3% |
| 10 | 1.6% | 2.9% | 1.8% | 2.1% | 2.1% |
| 11 | 1.1% | 2.2% | 1.2% | 4.7% | 1.7% |
| 12 | 0.5% | 1.3% | 0.5% | 4.6% | 1.1% |
| 13 (limit) | 1.7% | 3.7% | 0.4% | 17.7% | 3.1% |

Each strategy's wins at each total faan, as a share of its wins.

## Full hands: every pattern of a win, with its faan

The most common complete wins: every pattern a win scored, with its total. Patterns that score twice show ×2.

### All four strategies

| Full hand (every pattern, = total faan) | Wins | % of wins |
| --- | ---: | ---: |
| Full Flush = 7 | 67,949 | 5.2% |
| Half Flush = 3 | 67,680 | 5.2% |
| Seven Pairs = 4 | 48,284 | 3.7% |
| Dragon Triplet + Half Flush = 4 | 37,916 | 2.9% |
| Full Flush + No Flowers = 8 | 26,764 | 2.1% |
| Half Flush + No Flowers = 4 | 26,115 | 2.0% |
| All Sequences + Concealed + Self-Draw = 3 | 25,864 | 2.0% |
| Full Flush + Seat Season = 8 | 23,984 | 1.8% |
| Full Flush + Seat Flower = 8 | 23,612 | 1.8% |
| All Triplets = 3 | 23,324 | 1.8% |
| All Sequences + Concealed + No Flowers = 3 | 23,197 | 1.8% |
| No Flowers + Seven Pairs = 5 | 21,163 | 1.6% |
| Half Flush + Seat Season = 4 | 20,846 | 1.6% |
| Half Flush + Seat Flower = 4 | 20,841 | 1.6% |
| Half Flush + Self-Draw = 4 | 20,027 | 1.5% |
| Full Flush + Self-Draw = 8 | 19,760 | 1.5% |
| Seat Flower + Seven Pairs = 5 | 17,358 | 1.3% |
| Seat Season + Seven Pairs = 5 | 17,114 | 1.3% |
| All Sequences + Concealed + Seat Season = 3 | 16,737 | 1.3% |
| All Sequences + Concealed + Seat Flower = 3 | 16,655 | 1.3% |

### Jorge Yau (Rules only)

| Full hand (every pattern, = total faan) | Wins | % of wins |
| --- | ---: | ---: |
| Full Flush = 7 | 18,743 | 4.8% |
| All Sequences + Concealed + Self-Draw = 3 | 13,214 | 3.4% |
| Half Flush = 3 | 12,227 | 3.1% |
| Seven Pairs = 4 | 11,741 | 3.0% |
| All Sequences + Concealed + No Flowers = 3 | 10,601 | 2.7% |
| Dragon Triplet + Half Flush = 4 | 10,019 | 2.6% |
| All Sequences + Concealed + Seat Season = 3 | 7,523 | 1.9% |
| All Sequences + Concealed + Seat Flower = 3 | 7,514 | 1.9% |
| Chicken Hand + Concealed + No Flowers + Self-Draw = 3 | 7,274 | 1.9% |
| Full Flush + No Flowers = 8 | 7,137 | 1.8% |
| Full Flush + Seat Season = 8 | 6,585 | 1.7% |
| Full Flush + Seat Flower = 8 | 6,472 | 1.7% |

### Neural Cat (NC10)

| Full hand (every pattern, = total faan) | Wins | % of wins |
| --- | ---: | ---: |
| Full Flush = 7 | 21,832 | 5.9% |
| Half Flush = 3 | 17,361 | 4.7% |
| Seven Pairs = 4 | 12,996 | 3.5% |
| All Sequences + Concealed + Self-Draw = 3 | 12,533 | 3.4% |
| All Sequences + Concealed + No Flowers = 3 | 12,386 | 3.3% |
| Dragon Triplet + Half Flush = 4 | 11,274 | 3.0% |
| All Sequences + Concealed + Seat Season = 3 | 9,091 | 2.5% |
| All Sequences + Concealed + Seat Flower = 3 | 9,028 | 2.4% |
| Full Flush + No Flowers = 8 | 8,986 | 2.4% |
| Full Flush + Seat Season = 8 | 7,757 | 2.1% |
| Full Flush + Seat Flower = 8 | 7,722 | 2.1% |
| All Sequences + Full Flush = 8 | 7,243 | 2.0% |

### Lucky Cat (LC34)

| Full hand (every pattern, = total faan) | Wins | % of wins |
| --- | ---: | ---: |
| Half Flush = 3 | 38,092 | 8.7% |
| Full Flush = 7 | 27,374 | 6.3% |
| Dragon Triplet + Half Flush = 4 | 16,623 | 3.8% |
| Half Flush + No Flowers = 4 | 15,959 | 3.7% |
| Half Flush + Seat Flower = 4 | 12,871 | 2.9% |
| Half Flush + Seat Season = 4 | 12,838 | 2.9% |
| All Triplets = 3 | 12,637 | 2.9% |
| Half Flush + Self-Draw = 4 | 11,331 | 2.6% |
| Full Flush + No Flowers = 8 | 10,641 | 2.4% |
| Full Flush + Seat Season = 8 | 9,642 | 2.2% |
| Full Flush + Seat Flower = 8 | 9,418 | 2.2% |
| Full Flush + Self-Draw = 8 | 8,026 | 1.8% |

### Only Orphans (OW1)

| Full hand (every pattern, = total faan) | Wins | % of wins |
| --- | ---: | ---: |
| Seven Pairs = 4 | 18,463 | 17.9% |
| No Flowers + Seven Pairs = 5 | 8,976 | 8.7% |
| Seat Flower + Seven Pairs = 5 | 7,994 | 7.7% |
| Seat Season + Seven Pairs = 5 | 7,770 | 7.5% |
| Self-Draw + Seven Pairs = 5 | 6,086 | 5.9% |
| Thirteen Orphans = 13 | 4,089 | 4.0% |
| No Flowers + Self-Draw + Seven Pairs = 6 | 2,755 | 2.7% |
| Seat Season + Self-Draw + Seven Pairs = 6 | 2,701 | 2.6% |
| Seat Flower + Self-Draw + Seven Pairs = 6 | 2,645 | 2.6% |
| Seat Flower + Seat Season + Seven Pairs = 6 | 2,529 | 2.4% |
| Half Flush + Seven Pairs = 7 | 2,051 | 2.0% |
| Concealed Triplets = 10 | 1,750 | 1.7% |

## What it shows

- **Points a hand decide who finishes on top, not hands won.** Neural Cat +61.8, Only Orphans +48.4, Jorge Yau −35.9, Lucky Cat −74.2 points a hand; games on top: Neural Cat 34.5%, Lucky Cat 24.1%, Jorge Yau 21.3%, Only Orphans 20.3%.
- **Hands won, most first:** Lucky Cat 22.4%, Jorge Yau 20.0%, Neural Cat 19.0%, Only Orphans 5.3%. Lucky Cat wins the most hands but averages 5.56 faan a win; Only Orphans wins the fewest at 7.29.
- **Half Flush is the most common winning hand** (23.6% of all hands, 5.0 faan). **Full Flush** wins 13.8% of hands at 8.3 faan, for 2.8 times the points a win.
- **Self-draws:** 28.7% of wins are self-drawn and pay three times over; the rest are paid by the one player who threw the tile.
- **33.3% of hands end with no winner**, and every game had at least one win.

## The dataset

Every hand of this run, one row a hand, is on Hugging Face at [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games) as `hand-results/mixed-100k.parquet`, 1,949,960 rows.

```python
from datasets import load_dataset
hands = load_dataset("codenameyau/lucky-cat-mahjong-games", "mixed-100k")["train"]
```

| Column | What it holds |
| --- | --- |
| `table` | `mixed`: all four strategies, one seat each |
| `game_seed` | The game's seed; with the seats it replays the whole game |
| `hand_in_game` | The hand's number in its game, from 1 |
| `round` | The round: 1 East, 2 South, 3 West, 4 North |
| `dealer_seat`, `dealer_repeat` | The dealer's seat (0 to 3), and how many times in a row it has kept the deal |
| `seat0_strategy` to `seat3_strategy` | The strategy in each seat |
| `result` | `win` or `draw` |
| `winner_seat`, `winner_strategy`, `winner_is_dealer` | Who won (empty on a draw), its strategy, and 1 if it was the dealer |
| `how` | `selfDraw`, `discard`, `robKong` or `flowers` |
| `payer_seat`, `payer_strategy` | Who dealt in (empty on a self-draw) |
| `winning_tile` | The tile that completed the hand: `c1`-`c9` characters, `d1`-`d9` dots, `b1`-`b9` bamboo, `we`/`ws`/`ww`/`wn` winds, `dr`/`dg`/`dw` dragons |
| `faan`, `limit` | The hand's total faan, and 1 if it is a limit hand (13) |
| `base_points`, `winner_points` | The full-spicy payout for that faan, and the points the winner collected (three times it on a self-draw) |
| `claimed_melds`, `concealed` | Melds claimed from discards, and 1 if none were |
| `winner_discards` | The winner's own discards before the win (how fast it won) |
| `wall_left` | Tiles left in the wall when the hand ended |
| `pattern_count`, `patterns` | How many patterns the hand scored, and each with its faan, e.g. `Half Flush (3); Dragon Triplet (1)` |
| `full_hand` | Every pattern of the win with the total faan, as in the tables above |

## Reproducing it

```bash
node scripts/hand-patterns.js --lineup jorge-yau,neural-cat,lucky-cat,only-orphans --games 100000 --seed 8000001 --parquet ml/data/hand-patterns/data/mixed-100k.parquet
```

`scripts/hand-patterns.js` plays full games in JS and writes every hand as a row: Parquet with `--parquet` (needs Python with `pyarrow`), CSV with `--csv`. The native simulator plays the same games about 21 times faster a core (`native/build/lcm-sim-exact games --lineup <native ids> --names jorge-yau,neural-cat,lucky-cat,only-orphans --seed 8000001 --from A --to B`, split across processes), writing the same rows. `ml/data/` is gitignored.
