# Hand patterns: what each strategy wins with

How often each scoring pattern appears in the hands each strategy wins, from five experiments of 1,000 full games each: each strategy at a table of four copies of itself (4,000 games, 76,199 hands), and all four strategies at one table (1,000 games, 19,499 hands). Every hand is in the dataset [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games) on Hugging Face. The game plays each learned strategy's model as of game 0.61.9: Neural Cat NC10, Lucky Cat LC34 and Only Orphans OW1.

A **hand** is one hand of mahjong, which ends in a win or a draw. A **game** is every hand played until all four rounds are done: each player deals in turn in each round, and a dealer who wins deals again, so a game is at least 16 hands.

## Contents

- [How it was measured](#how-it-was-measured)
- [Games, hands and wins](#games-hands-and-wins)
- [Wins by total faan](#wins-by-total-faan)
- [Full hands: every pattern of a win, with its faan](#full-hands-every-pattern-of-a-win-with-its-faan)
- [The breakdown, pattern by pattern](#the-breakdown-pattern-by-pattern): [hand patterns](#hand-patterns), [sets of honors](#sets-of-honors), [bonuses](#bonuses)
- [Each strategy](#each-strategy)
- [What it shows](#what-it-shows)
- [All four at one table](#all-four-at-one-table)
- [Win rate and expected faan of each hand pattern](#win-rate-and-expected-faan-of-each-hand-pattern): [by win rate](#sorted-by-win-rate), [by expected faan](#sorted-by-expected-faan)
- [The dataset](#the-dataset)
- [Reproducing it](#reproducing-it)

## How it was measured

- **Four experiments of each strategy at a table of four copies of itself**, so each one's numbers come from its own style alone (the tables up to [What it shows](#what-it-shows)); and a fifth with **all four at one table** ([below](#all-four-at-one-table)).
- **1,000 full games a strategy**, game seeds 7,200,001 to 7,201,000, the same for every strategy. Every hand of every game is played, all four rounds.
- **Engine:** the game's own JS engine and scoring, full-spicy payouts, and the contradiction check on, as in the game.
- **Win rates are a seat's.** With four copies of the same strategy at the table, every hand that has a winner is won by that strategy, so the rates below are one seat's: its share of the hands, and how many hands it wins in a game.
- **What a pattern count means:** a winning hand usually scores several patterns at once (for example Half Flush + Dragon Triplet + Self-Draw). Each pattern's count is the number of winning hands that scored it, and its percentage is its share of that strategy's wins. **The percentages add up to more than 100%.**
- **Patterns are grouped** into hand patterns (what the hand is), sets of honors (a pung or kong of a dragon or a scoring wind), and bonuses (how it was won, and flowers). The faan column is what the pattern adds (`js/points.js`). A hand needs 3 faan to win, and 13 is the limit.

## Games, hands and wins

| Strategy | Model | Games played | Hands played | Hands a game | Hands won | Win rate per hand (a seat) | Hands won per game (a seat) | Hands with no winner | Games with no winner | Average faan a win | Limit hands (% of wins) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Jorge Yau](jorge-yau.md) | Rules only | 1,000 | 19,298 | 19.3 | 12,758 | 16.5% | 3.19 | 6,540 (33.9%) | 0 (0.0%) | 5.15 | 271 (2.1%) |
| [Neural Cat](neural-cat.md) | NC10 | 1,000 | 19,245 | 19.2 | 13,106 | 17.0% | 3.28 | 6,139 (31.9%) | 0 (0.0%) | 5.75 | 458 (3.5%) |
| [Lucky Cat](lucky-cat.md) | LC34 | 1,000 | 20,987 | 21.0 | 18,738 | 22.3% | 4.68 | 2,249 (10.7%) | 0 (0.0%) | 5.56 | 76 (0.4%) |
| [Only Orphans](only-orphans.md) | OW1 | 1,000 | 16,669 | 16.7 | 2,528 | 3.8% | 0.63 | 14,141 (84.8%) | 69 (6.9%) | 7.78 | 521 (20.6%) |
| **All four** | | **4,000** | **76,199** | 19.0 | **47,130** | 15.5% | 2.95 | 29,069 (38.1%) | 69 (1.7%) | 5.62 | 1,326 (2.8%) |

Every hand has one winner or none, so a strategy's hands won plus its hands with no winner make its hands played. A game with no winner is one in which every hand was drawn.

## Wins by total faan

Every win counted once, by the faan its whole hand scores (every pattern added up; 13 is the limit, so a limit hand counts as 13).

| Total faan | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 9,139 | 19.4% | 3,770 | 29.6% | 3,395 | 25.9% | 1,966 | 10.5% | 8 | 0.3% |
| 4 | 10,469 | 22.2% | 2,743 | 21.5% | 2,555 | 19.5% | 4,862 | 25.9% | 309 | 12.2% |
| 5 | 9,296 | 19.7% | 2,223 | 17.4% | 1,798 | 13.7% | 4,603 | 24.6% | 672 | 26.6% |
| 6 | 4,162 | 8.8% | 1,023 | 8.0% | 688 | 5.2% | 2,007 | 10.7% | 444 | 17.6% |
| 7 | 3,558 | 7.5% | 841 | 6.6% | 934 | 7.1% | 1,647 | 8.8% | 136 | 5.4% |
| 8 | 4,475 | 9.5% | 944 | 7.4% | 1,488 | 11.4% | 1,986 | 10.6% | 57 | 2.3% |
| 9 | 2,526 | 5.4% | 512 | 4.0% | 988 | 7.5% | 988 | 5.3% | 38 | 1.5% |
| 10 | 957 | 2.0% | 207 | 1.6% | 369 | 2.8% | 323 | 1.7% | 58 | 2.3% |
| 11 | 751 | 1.6% | 133 | 1.0% | 273 | 2.1% | 198 | 1.1% | 147 | 5.8% |
| 12 | 471 | 1.0% | 91 | 0.7% | 160 | 1.2% | 82 | 0.4% | 138 | 5.5% |
| 13 (limit) | 1,326 | 2.8% | 271 | 2.1% | 458 | 3.5% | 76 | 0.4% | 521 | 20.6% |

## Full hands: every pattern of a win, with its faan

A win's full hand is every pattern it scored together, with the faan they add up to: for example "Dragon Triplet + Half Flush + Self-Draw = 5". "x2" means a pattern scored twice (two dragon pungs). These are the 25 most common full hands, overall and for each strategy.

### All four strategies

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Half Flush | 3 | 2,148 | 4.6% |
| 2 | Full Flush | 7 | 2,136 | 4.5% |
| 3 | Dragon Triplet + Half Flush | 4 | 1,723 | 3.7% |
| 4 | Seven Pairs | 4 | 1,395 | 3.0% |
| 5 | All Sequences + Concealed + Self-Draw | 3 | 968 | 2.1% |
| 6 | Half Flush + No Flowers | 4 | 924 | 2.0% |
| 7 | Full Flush + No Flowers | 8 | 878 | 1.9% |
| 8 | All Triplets | 3 | 783 | 1.7% |
| 9 | All Sequences + Concealed + No Flowers | 3 | 744 | 1.6% |
| 10 | Full Flush + Seat Season | 8 | 726 | 1.5% |
| 11 | Full Flush + Seat Flower | 8 | 705 | 1.5% |
| 12 | Dragon Triplet + Half Flush + No Flowers | 5 | 688 | 1.5% |
| 13 | Half Flush + Seat Flower | 4 | 684 | 1.5% |
| 14 | Half Flush + Seat Season | 4 | 677 | 1.4% |
| 15 | Full Flush + Self-Draw | 8 | 669 | 1.4% |
| 16 | Half Flush + Self-Draw | 4 | 663 | 1.4% |
| 17 | Self-Draw + Seven Pairs | 5 | 626 | 1.3% |
| 18 | No Flowers + Seven Pairs | 5 | 552 | 1.2% |
| 19 | All Sequences + Concealed + Seat Flower | 3 | 544 | 1.2% |
| 20 | All Sequences + Concealed + Seat Season | 3 | 540 | 1.1% |
| 21 | Dragon Triplet + Half Flush + Seat Season | 5 | 540 | 1.1% |
| 22 | Dragon Triplet + Half Flush + Seat Flower | 5 | 536 | 1.1% |
| 23 | All Sequences + Full Flush | 8 | 516 | 1.1% |
| 24 | All Triplets + Dragon Triplet | 4 | 513 | 1.1% |
| 25 | Dragon Triplet + Half Flush + Self-Draw | 5 | 499 | 1.1% |

1,715 different full hands in all; these 25 cover 45.4% of the wins.

### Jorge Yau (Rules only), full hands

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Full Flush | 7 | 472 | 3.7% |
| 2 | All Sequences + Concealed + Self-Draw | 3 | 467 | 3.7% |
| 3 | Seven Pairs | 4 | 456 | 3.6% |
| 4 | All Sequences + Concealed + No Flowers | 3 | 343 | 2.7% |
| 5 | Half Flush | 3 | 318 | 2.5% |
| 6 | Chicken Hand + Concealed + No Flowers + Self-Draw | 3 | 304 | 2.4% |
| 7 | Chicken Hand + Concealed + Seat Season + Self-Draw | 3 | 228 | 1.8% |
| 8 | Dragon Triplet + Half Flush | 4 | 224 | 1.8% |
| 9 | All Sequences + Concealed + Seat Flower | 3 | 223 | 1.7% |
| 10 | All Sequences + Concealed + Seat Season | 3 | 221 | 1.7% |
| 11 | Chicken Hand + Concealed + Seat Flower + Self-Draw | 3 | 216 | 1.7% |
| 12 | No Flowers + Seven Pairs | 5 | 186 | 1.5% |
| 13 | All Triplets | 3 | 182 | 1.4% |
| 14 | Full Flush + No Flowers | 8 | 179 | 1.4% |
| 15 | Full Flush + Self-Draw | 8 | 175 | 1.4% |
| 16 | Self-Draw + Seven Pairs | 5 | 175 | 1.4% |
| 17 | Full Flush + Seat Season | 8 | 169 | 1.3% |
| 18 | Seat Flower + Seven Pairs | 5 | 167 | 1.3% |
| 19 | Half Flush + No Flowers | 4 | 166 | 1.3% |
| 20 | Concealed + Dragon Triplet + Self-Draw | 3 | 156 | 1.2% |
| 21 | Half Flush + Self-Draw | 4 | 152 | 1.2% |
| 22 | Seat Season + Seven Pairs | 5 | 151 | 1.2% |
| 23 | Half Flush + Seat Season | 4 | 149 | 1.2% |
| 24 | Full Flush + Seat Flower | 8 | 138 | 1.1% |
| 25 | All Triplets + Dragon Triplet | 4 | 134 | 1.1% |

979 different full hands in all; these 25 cover 45.1% of the wins.

### Neural Cat (NC10), full hands

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Full Flush | 7 | 722 | 5.5% |
| 2 | Half Flush | 3 | 653 | 5.0% |
| 3 | All Sequences + Concealed + Self-Draw | 3 | 500 | 3.8% |
| 4 | Seven Pairs | 4 | 451 | 3.4% |
| 5 | All Sequences + Concealed + No Flowers | 3 | 389 | 3.0% |
| 6 | Dragon Triplet + Half Flush | 4 | 329 | 2.5% |
| 7 | All Sequences + Concealed + Seat Flower | 3 | 319 | 2.4% |
| 8 | All Sequences + Concealed + Seat Season | 3 | 317 | 2.4% |
| 9 | Full Flush + No Flowers | 8 | 295 | 2.3% |
| 10 | All Sequences + Full Flush | 8 | 282 | 2.2% |
| 11 | Full Flush + Self-Draw | 8 | 252 | 1.9% |
| 12 | Full Flush + Seat Flower | 8 | 243 | 1.9% |
| 13 | Full Flush + Seat Season | 8 | 235 | 1.8% |
| 14 | Half Flush + Self-Draw | 4 | 210 | 1.6% |
| 15 | Half Flush + No Flowers | 4 | 204 | 1.6% |
| 16 | All Triplets | 3 | 190 | 1.4% |
| 17 | No Flowers + Seven Pairs | 5 | 185 | 1.4% |
| 18 | Seat Season + Seven Pairs | 5 | 151 | 1.2% |
| 19 | Seat Flower + Seven Pairs | 5 | 144 | 1.1% |
| 20 | Half Flush + Seat Flower | 4 | 141 | 1.1% |
| 21 | Self-Draw + Seven Pairs | 5 | 136 | 1.0% |
| 22 | All Sequences + Full Flush + No Flowers | 9 | 133 | 1.0% |
| 23 | Half Flush + Seat Season | 4 | 127 | 1.0% |
| 24 | Chicken Hand + Concealed + No Flowers + Self-Draw | 3 | 126 | 1.0% |
| 25 | All Sequences + Full Flush + Seat Flower | 9 | 121 | 0.9% |

849 different full hands in all; these 25 cover 52.3% of the wins.

### Lucky Cat (LC34), full hands

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Half Flush | 3 | 1,177 | 6.3% |
| 2 | Dragon Triplet + Half Flush | 4 | 1,170 | 6.2% |
| 3 | Full Flush | 7 | 942 | 5.0% |
| 4 | Half Flush + No Flowers | 4 | 554 | 3.0% |
| 5 | Dragon Triplet + Half Flush + No Flowers | 5 | 504 | 2.7% |
| 6 | All Triplets | 3 | 411 | 2.2% |
| 7 | Half Flush + Seat Flower | 4 | 409 | 2.2% |
| 8 | Full Flush + No Flowers | 8 | 404 | 2.2% |
| 9 | Half Flush + Seat Season | 4 | 401 | 2.1% |
| 10 | Dragon Triplet + Half Flush + Seat Flower | 5 | 382 | 2.0% |
| 11 | Dragon Triplet + Half Flush + Seat Season | 5 | 378 | 2.0% |
| 12 | All Triplets + Dragon Triplet | 4 | 328 | 1.8% |
| 13 | Full Flush + Seat Flower | 8 | 324 | 1.7% |
| 14 | Full Flush + Seat Season | 8 | 322 | 1.7% |
| 15 | Half Flush + Self-Draw | 4 | 301 | 1.6% |
| 16 | Dragon Triplet + Half Flush + Self-Draw | 5 | 293 | 1.6% |
| 17 | Half Flush + Seat Wind | 4 | 289 | 1.5% |
| 18 | Half Flush + Round Wind | 4 | 253 | 1.4% |
| 19 | Full Flush + Self-Draw | 8 | 242 | 1.3% |
| 20 | All Triplets + No Flowers | 4 | 183 | 1.0% |
| 21 | Seven Pairs | 4 | 183 | 1.0% |
| 22 | All Sequences + Full Flush | 8 | 173 | 0.9% |
| 23 | All Triplets + Seat Season | 4 | 140 | 0.7% |
| 24 | Dragon Triplet + Half Flush + No Flowers + Self-Draw | 6 | 137 | 0.7% |
| 25 | All Triplets + Dragon Triplet + Half Flush | 7 | 136 | 0.7% |

1,055 different full hands in all; these 25 cover 53.6% of the wins.

### Only Orphans (OW1), full hands

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Seven Pairs | 4 | 305 | 12.1% |
| 2 | Self-Draw + Seven Pairs | 5 | 271 | 10.7% |
| 3 | Seat Flower + Seven Pairs | 5 | 128 | 5.1% |
| 4 | Seat Season + Seven Pairs | 5 | 124 | 4.9% |
| 5 | Seat Flower + Self-Draw + Seven Pairs | 6 | 112 | 4.4% |
| 6 | Seat Season + Self-Draw + Seven Pairs | 6 | 110 | 4.4% |
| 7 | No Flowers + Self-Draw + Seven Pairs | 6 | 109 | 4.3% |
| 8 | No Flowers + Seven Pairs | 5 | 104 | 4.1% |
| 9 | Self-Draw + Thirteen Orphans | 13 | 92 | 3.6% |
| 10 | Thirteen Orphans | 13 | 60 | 2.4% |
| 11 | Concealed Triplets | 10 | 50 | 2.0% |
| 12 | Seat Flower + Seat Season + Self-Draw + Seven Pairs | 7 | 36 | 1.4% |
| 13 | Seat Flower + Seat Season + Seven Pairs | 6 | 36 | 1.4% |
| 14 | Concealed Triplets + Seat Flower | 11 | 33 | 1.3% |
| 15 | Concealed Triplets + Dragon Triplet | 11 | 32 | 1.3% |
| 16 | Mixed Orphans + Seven Pairs | 5 | 32 | 1.3% |
| 17 | Half Flush + Seven Pairs | 7 | 31 | 1.2% |
| 18 | Seat Season + Self-Draw + Thirteen Orphans | 13 | 30 | 1.2% |
| 19 | No Flowers + Thirteen Orphans | 13 | 27 | 1.1% |
| 20 | Concealed Triplets + Seat Season | 11 | 26 | 1.0% |
| 21 | Concealed + Self-Draw + Seven Robbing One | 7 | 24 | 0.9% |
| 22 | Mixed Orphans + Self-Draw + Seven Pairs | 6 | 24 | 0.9% |
| 23 | Seat Flower + Self-Draw + Thirteen Orphans | 13 | 23 | 0.9% |
| 24 | Half Flush + Self-Draw + Seven Pairs | 8 | 22 | 0.9% |
| 25 | Seat Flower + Thirteen Orphans | 13 | 20 | 0.8% |

238 different full hands in all; these 25 cover 73.6% of the wins.

## The breakdown, pattern by pattern

The same wins, counted pattern by pattern: how many winning hands scored each pattern, whatever else they scored. A win with three patterns counts once under each, so the percentages add up to more than 100%.

### Hand patterns

What the winning hand is. Most of the time a hand scores one of these and sometimes two (a Full Flush that is also All Triplets).

| Pattern | Faan | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Half Flush** | 3 | 18,534 | 39.3% | 3,385 | 26.5% | 3,719 | 28.4% | 11,219 | 59.9% | 211 | 8.3% |
| **Full Flush** | 7 | 8,740 | 18.5% | 1,896 | 14.9% | 3,424 | 26.1% | 3,415 | 18.2% | 5 | 0.2% |
| **All Triplets** | 3 | 7,710 | 16.4% | 1,919 | 15.0% | 1,368 | 10.4% | 4,419 | 23.6% | 4 | 0.2% |
| **All Sequences** | 1 | 5,466 | 11.6% | 1,901 | 14.9% | 3,020 | 23.0% | 538 | 2.9% | 7 | 0.3% |
| **Seven Pairs** | 4 | 5,188 | 11.0% | 1,610 | 12.6% | 1,439 | 11.0% | 517 | 2.8% | 1,622 | 64.2% |
| **Chicken Hand** | 0 | 1,525 | 3.2% | 961 | 7.5% | 445 | 3.4% | 116 | 0.6% | 3 | 0.1% |
| **Concealed Triplets** | 10 | 1,133 | 2.4% | 162 | 1.3% | 343 | 2.6% | 110 | 0.6% | 518 | 20.5% |
| **Thirteen Orphans** | Limit (13) | 831 | 1.8% | 199 | 1.6% | 303 | 2.3% | 0 | 0.0% | 329 | 13.0% |
| **Mixed Orphans** | 1 | 502 | 1.1% | 198 | 1.6% | 87 | 0.7% | 88 | 0.5% | 129 | 5.1% |
| **Small Three Dragons** | 5 | 151 | 0.3% | 36 | 0.3% | 38 | 0.3% | 74 | 0.4% | 3 | 0.1% |
| **All Honors** | 10 | 86 | 0.2% | 20 | 0.2% | 23 | 0.2% | 36 | 0.2% | 7 | 0.3% |
| **Big Three Dragons** | 8 | 48 | 0.1% | 9 | 0.1% | 15 | 0.1% | 24 | 0.1% | 0 | 0.0% |
| **Small Four Winds** | 6 | 18 | 0.0% | 4 | 0.0% | 8 | 0.1% | 6 | 0.0% | 0 | 0.0% |
| **All Terminals** | 10 | 11 | 0.0% | 3 | 0.0% | 2 | 0.0% | 2 | 0.0% | 4 | 0.2% |
| **Big Four Winds** | Limit (13) | 6 | 0.0% | 2 | 0.0% | 0 | 0.0% | 3 | 0.0% | 1 | 0.0% |
| **Nine Gates** | Limit (13) | 5 | 0.0% | 2 | 0.0% | 3 | 0.0% | 0 | 0.0% | 0 | 0.0% |

### Sets of honors

A pung or kong of a dragon or a scoring wind, each worth faan on its own, on top of the hand pattern.

| Pattern | Faan | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Dragon Triplet** | 1 each | 11,559 | 24.5% | 2,888 | 22.6% | 2,065 | 15.8% | 6,376 | 34.0% | 230 | 9.1% |
| **Seat Wind** | 1 | 3,260 | 6.9% | 849 | 6.7% | 594 | 4.5% | 1,742 | 9.3% | 75 | 3.0% |
| **Round Wind** | 1 | 3,121 | 6.6% | 772 | 6.1% | 580 | 4.4% | 1,706 | 9.1% | 63 | 2.5% |
| **Seat and Round Wind** | 2 | 1,267 | 2.7% | 349 | 2.7% | 242 | 1.8% | 656 | 3.5% | 20 | 0.8% |
| **Dragon Quad** | 1 each | 816 | 1.7% | 77 | 0.6% | 56 | 0.4% | 673 | 3.6% | 10 | 0.4% |

### Bonuses

How the hand was won, and the flowers and seasons it holds.

| Pattern | Faan | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Self-Draw** | 1 | 14,287 | 30.3% | 4,740 | 37.2% | 4,218 | 32.2% | 4,199 | 22.4% | 1,130 | 44.7% |
| **Seat Flower** | 1 | 10,134 | 21.5% | 3,025 | 23.7% | 2,795 | 21.3% | 3,735 | 19.9% | 579 | 22.9% |
| **Seat Season** | 1 | 10,119 | 21.5% | 3,029 | 23.7% | 2,810 | 21.4% | 3,716 | 19.8% | 564 | 22.3% |
| **No Flowers** | 1 | 8,984 | 19.1% | 2,503 | 19.6% | 2,540 | 19.4% | 3,551 | 19.0% | 390 | 15.4% |
| **Concealed** | 1 | 7,618 | 16.2% | 4,170 | 32.7% | 3,002 | 22.9% | 398 | 2.1% | 48 | 1.9% |
| **Win on Last Tile** | 1 | 733 | 1.6% | 284 | 2.2% | 180 | 1.4% | 176 | 0.9% | 93 | 3.7% |
| **Win by Kong** | 1 | 246 | 0.5% | 64 | 0.5% | 34 | 0.3% | 146 | 0.8% | 2 | 0.1% |
| **Four Flowers** | 2 | 96 | 0.2% | 23 | 0.2% | 29 | 0.2% | 37 | 0.2% | 7 | 0.3% |
| **Four Seasons** | 2 | 96 | 0.2% | 31 | 0.2% | 30 | 0.2% | 26 | 0.1% | 9 | 0.4% |
| **Seven Robbing One** | 5 | 81 | 0.2% | 17 | 0.1% | 20 | 0.2% | 20 | 0.1% | 24 | 0.9% |
| **Robbing the Kong** | 1 | 44 | 0.1% | 10 | 0.1% | 12 | 0.1% | 22 | 0.1% | 0 | 0.0% |
| **Win by Double Kong** | 8 | 4 | 0.0% | 0 | 0.0% | 1 | 0.0% | 3 | 0.0% | 0 | 0.0% |
| **Eight Immortals Crossing the Sea** | Limit (13) | 1 | 0.0% | 0 | 0.0% | 0 | 0.0% | 0 | 0.0% | 1 | 0.0% |

## Each strategy

Every pattern a strategy won with, most common first (the breakdown; its full hands are [above](#full-hands-every-pattern-of-a-win-with-its-faan)).

### Jorge Yau (Rules only)

1,000 games, 19,298 hands, 12,758 hands won: a seat wins 16.5% of the hands, 3.19 hands a game. Its wins average 5.15 faan; 271 are limit hands (2.1%), 37.0% are self-drawn, and 48.1% have no claimed meld. [Its playbook](jorge-yau.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Self-Draw | 1 | 4,740 | 37.2% |
| Concealed | 1 | 4,170 | 32.7% |
| Half Flush | 3 | 3,385 | 26.5% |
| Seat Season | 1 | 3,029 | 23.7% |
| Seat Flower | 1 | 3,025 | 23.7% |
| Dragon Triplet | 1 each | 2,888 | 22.6% |
| No Flowers | 1 | 2,503 | 19.6% |
| All Triplets | 3 | 1,919 | 15.0% |
| All Sequences | 1 | 1,901 | 14.9% |
| Full Flush | 7 | 1,896 | 14.9% |
| Seven Pairs | 4 | 1,610 | 12.6% |
| Chicken Hand | 0 | 961 | 7.5% |
| Seat Wind | 1 | 849 | 6.7% |
| Round Wind | 1 | 772 | 6.1% |
| Seat and Round Wind | 2 | 349 | 2.7% |
| Win on Last Tile | 1 | 284 | 2.2% |
| Thirteen Orphans | Limit (13) | 199 | 1.6% |
| Mixed Orphans | 1 | 198 | 1.6% |
| Concealed Triplets | 10 | 162 | 1.3% |
| Dragon Quad | 1 each | 77 | 0.6% |
| Win by Kong | 1 | 64 | 0.5% |
| Small Three Dragons | 5 | 36 | 0.3% |
| Four Seasons | 2 | 31 | 0.2% |
| Four Flowers | 2 | 23 | 0.2% |
| All Honors | 10 | 20 | 0.2% |
| Seven Robbing One | 5 | 17 | 0.1% |
| Robbing the Kong | 1 | 10 | 0.1% |
| Big Three Dragons | 8 | 9 | 0.1% |
| Small Four Winds | 6 | 4 | 0.0% |
| All Terminals | 10 | 3 | 0.0% |
| Big Four Winds | Limit (13) | 2 | 0.0% |
| Nine Gates | Limit (13) | 2 | 0.0% |

### Neural Cat (NC10)

1,000 games, 19,245 hands, 13,106 hands won: a seat wins 17.0% of the hands, 3.28 hands a game. Its wins average 5.75 faan; 458 are limit hands (3.5%), 32.0% are self-drawn, and 38.8% have no claimed meld. [Its playbook](neural-cat.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Self-Draw | 1 | 4,218 | 32.2% |
| Half Flush | 3 | 3,719 | 28.4% |
| Full Flush | 7 | 3,424 | 26.1% |
| All Sequences | 1 | 3,020 | 23.0% |
| Concealed | 1 | 3,002 | 22.9% |
| Seat Season | 1 | 2,810 | 21.4% |
| Seat Flower | 1 | 2,795 | 21.3% |
| No Flowers | 1 | 2,540 | 19.4% |
| Dragon Triplet | 1 each | 2,065 | 15.8% |
| Seven Pairs | 4 | 1,439 | 11.0% |
| All Triplets | 3 | 1,368 | 10.4% |
| Seat Wind | 1 | 594 | 4.5% |
| Round Wind | 1 | 580 | 4.4% |
| Chicken Hand | 0 | 445 | 3.4% |
| Concealed Triplets | 10 | 343 | 2.6% |
| Thirteen Orphans | Limit (13) | 303 | 2.3% |
| Seat and Round Wind | 2 | 242 | 1.8% |
| Win on Last Tile | 1 | 180 | 1.4% |
| Mixed Orphans | 1 | 87 | 0.7% |
| Dragon Quad | 1 each | 56 | 0.4% |
| Small Three Dragons | 5 | 38 | 0.3% |
| Win by Kong | 1 | 34 | 0.3% |
| Four Seasons | 2 | 30 | 0.2% |
| Four Flowers | 2 | 29 | 0.2% |
| All Honors | 10 | 23 | 0.2% |
| Seven Robbing One | 5 | 20 | 0.2% |
| Big Three Dragons | 8 | 15 | 0.1% |
| Robbing the Kong | 1 | 12 | 0.1% |
| Small Four Winds | 6 | 8 | 0.1% |
| Nine Gates | Limit (13) | 3 | 0.0% |
| All Terminals | 10 | 2 | 0.0% |
| Win by Double Kong | 8 | 1 | 0.0% |

### Lucky Cat (LC34)

1,000 games, 20,987 hands, 18,738 hands won: a seat wins 22.3% of the hands, 4.68 hands a game. Its wins average 5.56 faan; 76 are limit hands (0.4%), 22.3% are self-drawn, and 5.4% have no claimed meld. [Its playbook](lucky-cat.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Half Flush | 3 | 11,219 | 59.9% |
| Dragon Triplet | 1 each | 6,376 | 34.0% |
| All Triplets | 3 | 4,419 | 23.6% |
| Self-Draw | 1 | 4,199 | 22.4% |
| Seat Flower | 1 | 3,735 | 19.9% |
| Seat Season | 1 | 3,716 | 19.8% |
| No Flowers | 1 | 3,551 | 19.0% |
| Full Flush | 7 | 3,415 | 18.2% |
| Seat Wind | 1 | 1,742 | 9.3% |
| Round Wind | 1 | 1,706 | 9.1% |
| Dragon Quad | 1 each | 673 | 3.6% |
| Seat and Round Wind | 2 | 656 | 3.5% |
| All Sequences | 1 | 538 | 2.9% |
| Seven Pairs | 4 | 517 | 2.8% |
| Concealed | 1 | 398 | 2.1% |
| Win on Last Tile | 1 | 176 | 0.9% |
| Win by Kong | 1 | 146 | 0.8% |
| Chicken Hand | 0 | 116 | 0.6% |
| Concealed Triplets | 10 | 110 | 0.6% |
| Mixed Orphans | 1 | 88 | 0.5% |
| Small Three Dragons | 5 | 74 | 0.4% |
| Four Flowers | 2 | 37 | 0.2% |
| All Honors | 10 | 36 | 0.2% |
| Four Seasons | 2 | 26 | 0.1% |
| Big Three Dragons | 8 | 24 | 0.1% |
| Robbing the Kong | 1 | 22 | 0.1% |
| Seven Robbing One | 5 | 20 | 0.1% |
| Small Four Winds | 6 | 6 | 0.0% |
| Big Four Winds | Limit (13) | 3 | 0.0% |
| Win by Double Kong | 8 | 3 | 0.0% |
| All Terminals | 10 | 2 | 0.0% |

### Only Orphans (OW1)

1,000 games, 16,669 hands, 2,528 hands won: a seat wins 3.8% of the hands, 0.63 hands a game. Its wins average 7.78 faan; 521 are limit hands (20.6%), 43.7% are self-drawn, and 99.6% have no claimed meld. [Its playbook](only-orphans.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Seven Pairs | 4 | 1,622 | 64.2% |
| Self-Draw | 1 | 1,130 | 44.7% |
| Seat Flower | 1 | 579 | 22.9% |
| Seat Season | 1 | 564 | 22.3% |
| Concealed Triplets | 10 | 518 | 20.5% |
| No Flowers | 1 | 390 | 15.4% |
| Thirteen Orphans | Limit (13) | 329 | 13.0% |
| Dragon Triplet | 1 each | 230 | 9.1% |
| Half Flush | 3 | 211 | 8.3% |
| Mixed Orphans | 1 | 129 | 5.1% |
| Win on Last Tile | 1 | 93 | 3.7% |
| Seat Wind | 1 | 75 | 3.0% |
| Round Wind | 1 | 63 | 2.5% |
| Concealed | 1 | 48 | 1.9% |
| Seven Robbing One | 5 | 24 | 0.9% |
| Seat and Round Wind | 2 | 20 | 0.8% |
| Dragon Quad | 1 each | 10 | 0.4% |
| Four Seasons | 2 | 9 | 0.4% |
| All Honors | 10 | 7 | 0.3% |
| All Sequences | 1 | 7 | 0.3% |
| Four Flowers | 2 | 7 | 0.3% |
| Full Flush | 7 | 5 | 0.2% |
| All Terminals | 10 | 4 | 0.2% |
| All Triplets | 3 | 4 | 0.2% |
| Chicken Hand | 0 | 3 | 0.1% |
| Small Three Dragons | 5 | 3 | 0.1% |
| Win by Kong | 1 | 2 | 0.1% |
| Big Four Winds | Limit (13) | 1 | 0.0% |
| Eight Immortals Crossing the Sea | Limit (13) | 1 | 0.0% |

## What it shows

- **Lucky Cat wins the most hands, with Half Flush and dragons.** A seat wins 22.3% of the hands, 4.68 a game. 59.9% of its wins are Half Flush, 34.0% have a dragon pung and 23.6% are All Triplets. Only 2.1% of its wins are concealed: it claims freely to finish fast, which fits its aim of the most hands won.
- **Neural Cat and Jorge Yau win about as often; Neural Cat's wins are bigger.** Neural Cat builds on Jorge Yau's hand reading. A seat wins 17.0% of the hands against 16.5%, but Neural Cat's wins average 5.75 faan against 5.15, with more Full Flushes (26.1% against 14.9%) and All Sequences (23.0% against 14.9%), and fewer Chicken Hands (3.4% against 7.5%).
- **Only Orphans wins rarely and big.** A seat wins 3.8% of the hands, 0.63 a game, and 84.8% of its hands end with no winner. Its wins are Seven Pairs (64.2%), Concealed Triplets (20.5%) and Thirteen Orphans (13.0%), and 20.6% of them are limit hands: its aim is the biggest hands.
- **Self-draws.** Only Orphans self-draws 44.7% of its wins, since it claims almost nothing; Lucky Cat 22.4%.
- **Flowers are luck.** Seat Flower, Seat Season and No Flowers each come up in about a fifth of every strategy's wins, as the deal hands them out.
- **At a table of itself.** These numbers are each strategy against three copies of itself. Against the other strategies, at the game's mixed tables, every rate would differ: a fast table leaves less time for big hands.


## All four at one table

The fifth experiment: Jorge Yau, Neural Cat, Lucky Cat and Only Orphans at one table, one seat each, for 1,000 full games (seeds 7,300,001 to 7,301,000). The seats rotate each game, so every strategy sits in every seat, and deals first, equally often. A game has 19.5 hands on average: 19,499 hands in all, 13,060 won, and 6,439 (33.0%) with no winner.

| Strategy | Model | Hands played | Hands won | Win rate per hand | Hands won per game | Average faan a win | Limit hands (% of wins) | Dealt in (per hand) | Net points a hand | Games finished on top |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jorge Yau | Rules only | 19,499 | 3,840 | 19.7% | 3.84 | 5.13 | 50 (1.3%) | 10.4% | -60.3 | 209 (20.9%) |
| Neural Cat | NC10 | 19,499 | 3,796 | 19.5% | 3.80 | 5.86 | 168 (4.4%) | 10.4% | +96.1 | 358 (35.8%) |
| Lucky Cat | LC34 | 19,499 | 4,437 | 22.8% | 4.44 | 5.56 | 21 (0.5%) | 12.4% | -79.9 | 248 (24.8%) |
| Only Orphans | OW1 | 19,499 | 987 | 5.1% | 0.99 | 7.23 | 170 (17.2%) | 14.5% | +44.1 | 186 (18.6%) |

"Games finished on top" is the share of games a strategy ended with the most points after all four rounds (a tie counts for each). Net points a hand is what the seat won less what it paid, over every hand it sat in.

### Full hands at one table

#### Jorge Yau (Rules only)

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Full Flush | 7 | 173 | 4.5% |
| 2 | All Sequences + Concealed + Self-Draw | 3 | 140 | 3.6% |
| 3 | Seven Pairs | 4 | 122 | 3.2% |
| 4 | Half Flush | 3 | 120 | 3.1% |
| 5 | All Sequences + Concealed + No Flowers | 3 | 113 | 2.9% |
| 6 | Dragon Triplet + Half Flush | 4 | 112 | 2.9% |
| 7 | All Sequences + Concealed + Seat Flower | 3 | 75 | 2.0% |
| 8 | All Triplets + Dragon Triplet | 4 | 72 | 1.9% |
| 9 | Chicken Hand + Concealed + No Flowers + Self-Draw | 3 | 68 | 1.8% |
| 10 | Chicken Hand + Concealed + Seat Flower + Self-Draw | 3 | 65 | 1.7% |
| 11 | Full Flush + No Flowers | 8 | 63 | 1.6% |
| 12 | Full Flush + Self-Draw | 8 | 63 | 1.6% |
| 13 | All Sequences + Concealed + Seat Season | 3 | 60 | 1.6% |
| 14 | Half Flush + No Flowers | 4 | 55 | 1.4% |
| 15 | All Triplets | 3 | 54 | 1.4% |

539 different full hands in all; these 15 cover 35.3% of the wins.

#### Neural Cat (NC10)

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Full Flush | 7 | 224 | 5.9% |
| 2 | Half Flush | 3 | 180 | 4.7% |
| 3 | All Sequences + Concealed + Self-Draw | 3 | 138 | 3.6% |
| 4 | Seven Pairs | 4 | 125 | 3.3% |
| 5 | Dragon Triplet + Half Flush | 4 | 110 | 2.9% |
| 6 | All Sequences + Concealed + No Flowers | 3 | 106 | 2.8% |
| 7 | Full Flush + No Flowers | 8 | 97 | 2.6% |
| 8 | Full Flush + Seat Flower | 8 | 92 | 2.4% |
| 9 | All Sequences + Concealed + Seat Season | 3 | 90 | 2.4% |
| 10 | All Sequences + Concealed + Seat Flower | 3 | 88 | 2.3% |
| 11 | Full Flush + Seat Season | 8 | 88 | 2.3% |
| 12 | All Sequences + Full Flush | 8 | 69 | 1.8% |
| 13 | Full Flush + Self-Draw | 8 | 62 | 1.6% |
| 14 | Half Flush + Self-Draw | 4 | 60 | 1.6% |
| 15 | No Flowers + Seven Pairs | 5 | 60 | 1.6% |

485 different full hands in all; these 15 cover 41.9% of the wins.

#### Lucky Cat (LC34)

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Half Flush | 3 | 372 | 8.4% |
| 2 | Full Flush | 7 | 274 | 6.2% |
| 3 | Dragon Triplet + Half Flush | 4 | 175 | 3.9% |
| 4 | Half Flush + No Flowers | 4 | 162 | 3.7% |
| 5 | Half Flush + Seat Flower | 4 | 146 | 3.3% |
| 6 | Half Flush + Self-Draw | 4 | 144 | 3.2% |
| 7 | Half Flush + Seat Season | 4 | 120 | 2.7% |
| 8 | Full Flush + No Flowers | 8 | 116 | 2.6% |
| 9 | All Triplets | 3 | 107 | 2.4% |
| 10 | Full Flush + Seat Flower | 8 | 94 | 2.1% |
| 11 | Full Flush + Seat Season | 8 | 90 | 2.0% |
| 12 | Dragon Triplet + Half Flush + No Flowers | 5 | 70 | 1.6% |
| 13 | Full Flush + Self-Draw | 8 | 66 | 1.5% |
| 14 | Half Flush + Seat Wind | 4 | 66 | 1.5% |
| 15 | Seven Pairs | 4 | 59 | 1.3% |

489 different full hands in all; these 15 cover 46.5% of the wins.

#### Only Orphans (OW1)

| # | Full hand (every pattern it scored) | Total faan | Wins | % of wins |
| ---: | --- | ---: | ---: | ---: |
| 1 | Seven Pairs | 4 | 184 | 18.6% |
| 2 | Seat Season + Seven Pairs | 5 | 81 | 8.2% |
| 3 | No Flowers + Seven Pairs | 5 | 79 | 8.0% |
| 4 | Self-Draw + Seven Pairs | 5 | 71 | 7.2% |
| 5 | Seat Flower + Seven Pairs | 5 | 65 | 6.6% |
| 6 | Thirteen Orphans | 13 | 44 | 4.5% |
| 7 | Seat Flower + Self-Draw + Seven Pairs | 6 | 30 | 3.0% |
| 8 | Seat Flower + Seat Season + Seven Pairs | 6 | 28 | 2.8% |
| 9 | No Flowers + Self-Draw + Seven Pairs | 6 | 27 | 2.7% |
| 10 | Half Flush + Seven Pairs | 7 | 25 | 2.5% |
| 11 | Seat Season + Self-Draw + Seven Pairs | 6 | 23 | 2.3% |
| 12 | Concealed Triplets | 10 | 21 | 2.1% |
| 13 | Seat Season + Thirteen Orphans | 13 | 15 | 1.5% |
| 14 | Mixed Orphans + Seven Pairs | 5 | 12 | 1.2% |
| 15 | Concealed Triplets + Dragon Triplet | 11 | 11 | 1.1% |

145 different full hands in all; these 15 cover 72.5% of the wins.

### Hand patterns: at a table of itself against at one table

Each strategy's share of its wins with each hand pattern, at a table of four copies of itself and at the table of all four.

| Pattern | Faan | Jorge Yau: alone | together | Neural Cat: alone | together | Lucky Cat: alone | together | Only Orphans: alone | together |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Half Flush | 3 | 26.5% | 27.0% | 28.4% | 28.5% | 59.9% | 56.3% | 8.3% | 9.1% |
| Full Flush | 7 | 14.9% | 17.3% | 26.1% | 26.2% | 18.2% | 22.9% | 0.2% | 0.1% |
| All Triplets | 3 | 15.0% | 17.2% | 10.4% | 10.5% | 23.6% | 20.2% | 0.2% | 1.8% |
| All Sequences | 1 | 14.9% | 15.6% | 23.0% | 21.1% | 2.9% | 3.7% | 0.3% | 0.1% |
| Seven Pairs | 4 | 12.6% | 10.7% | 11.0% | 11.4% | 2.8% | 3.8% | 64.2% | 69.5% |
| Chicken Hand | 0 | 7.5% | 6.3% | 3.4% | 3.6% | 0.6% | 0.6% | 0.1% | 0.0% |
| Concealed Triplets | 10 | 1.3% | 0.9% | 2.6% | 3.1% | 0.6% | 1.1% | 20.5% | 15.6% |
| Thirteen Orphans | Limit (13) | 1.6% | 1.0% | 2.3% | 2.8% | 0.0% | 0.0% | 13.0% | 11.2% |
| Mixed Orphans | 1 | 1.6% | 1.6% | 0.7% | 0.4% | 0.5% | 0.2% | 5.1% | 5.6% |
| Small Three Dragons | 5 | 0.3% | 0.3% | 0.3% | 0.2% | 0.4% | 0.2% | 0.1% | 0.4% |
| All Honors | 10 | 0.2% | 0.1% | 0.2% | 0.2% | 0.2% | 0.0% | 0.3% | 0.5% |
| Big Three Dragons | 8 | 0.1% | 0.1% | 0.1% | 0.1% | 0.1% | 0.0% | 0.0% | 0.4% |
| Small Four Winds | 6 | 0.0% | 0.0% | 0.1% | 0.1% | 0.0% | 0.0% | 0.0% | 0.0% |
| All Terminals | 10 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.2% | 0.1% |
| Nine Gates | Limit (13) | 0.0% | 0.0% | 0.0% | 0.1% | 0.0% | 0.0% | 0.0% | 0.0% |
| Big Four Winds | Limit (13) | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

### Wins by total faan at one table

| Total faan | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 1,113 | 29.0% | 931 | 24.5% | 563 | 12.7% | 3 | 0.3% |
| 4 | 845 | 22.0% | 719 | 18.9% | 1,202 | 27.1% | 185 | 18.7% |
| 5 | 675 | 17.6% | 557 | 14.7% | 913 | 20.6% | 309 | 31.3% |
| 6 | 257 | 6.7% | 185 | 4.9% | 390 | 8.8% | 126 | 12.8% |
| 7 | 279 | 7.3% | 296 | 7.8% | 414 | 9.3% | 41 | 4.2% |
| 8 | 324 | 8.4% | 462 | 12.2% | 532 | 12.0% | 24 | 2.4% |
| 9 | 177 | 4.6% | 223 | 5.9% | 261 | 5.9% | 18 | 1.8% |
| 10 | 59 | 1.5% | 118 | 3.1% | 74 | 1.7% | 26 | 2.6% |
| 11 | 37 | 1.0% | 87 | 2.3% | 46 | 1.0% | 42 | 4.3% |
| 12 | 24 | 0.6% | 50 | 1.3% | 21 | 0.5% | 43 | 4.4% |
| 13 (limit) | 50 | 1.3% | 168 | 4.4% | 21 | 0.5% | 170 | 17.2% |

### What the table of all four shows

- **Points a hand, best first:** Neural Cat +96.1, Only Orphans +44.1, Jorge Yau -60.3, Lucky Cat -79.9.
- **Hands won:** Lucky Cat wins 22.8% of its hands, Neural Cat 19.5%, Jorge Yau 19.7% and Only Orphans 5.1%. Faan a win: Only Orphans 7.23, Neural Cat 5.86, Lucky Cat 5.56, Jorge Yau 5.13.
- **Games finished on top:** Jorge Yau 20.9%, Neural Cat 35.8%, Lucky Cat 24.8%, Only Orphans 18.6%.
- **Winning the most hands doesn't win the most points.** Lucky Cat wins the most hands (22.8%) but loses the most points a hand (-79.9): its wins are small and it deals in most often after Only Orphans (12.4% of its hands). Neural Cat wins about as many hands as Jorge Yau but bigger ones (5.86 faan against 5.13), and that is the difference between +96.1 and -60.3 points a hand.
- **Points a hand mostly decide who finishes a game on top.** Neural Cat leads both. Only Orphans is second on points a hand but last on games on top: its points come in a few very big wins, so most games pass without one.
- **A faster table finishes fewer slow, big hands.** Compare each strategy's patterns alone and together in the table above.

## Win rate and expected faan of each hand pattern

From the first 20,000 games of the 100,000-game run (all four strategies at one table, seeds from 8,000,001): 389,806 hands, 259,873 won.

- **Win rate per hand** is the share of all hands that ended in a win scoring that pattern (± one standard error). The dataset records only how hands ended, not which hand a seat was aiming for. So this is how often the table finished the pattern, not how often a seat that went for it finished it.
- **Expected faan of the win** is the average total faan of the wins that scored the pattern, with every other pattern counted in (± one standard error). **Points a win** is what the winner collected on average.
- Only hand patterns are counted here, not sets of honors or bonuses. A win can score more than one, so the shares of wins add up to more than 100%.

### Sorted by win rate

| Pattern | Its own faan | Wins with it | Win rate per hand | Share of wins | Expected faan of the win | Points a win | Self-drawn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Half Flush | 3 | 92,011 | 23.60% ± 0.068% | 35.4% | 4.99 ± 0.01 | 287 | 24% |
| Full Flush | 7 | 54,040 | 13.86% ± 0.055% | 20.8% | 8.26 ± 0.00 | 787 | 23% |
| All Triplets | 3 | 39,393 | 10.11% ± 0.048% | 15.2% | 5.93 ± 0.01 | 652 | 25% |
| Seven Pairs | 4 | 33,275 | 8.54% ± 0.045% | 12.8% | 5.14 ± 0.01 | 104 | 25% |
| All Sequences | 1 | 31,820 | 8.16% ± 0.044% | 12.2% | 5.00 ± 0.02 | 313 | 36% |
| Chicken Hand | 0 | 8,068 | 2.07% ± 0.023% | 3.1% | 3.06 ± 0.00 | 27 | 83% |
| Concealed Triplets | 10 | 7,165 | 1.84% ± 0.022% | 2.8% | 11.76 ± 0.01 | 7,046 | 23% |
| Thirteen Orphans | 13 | 5,262 | 1.35% ± 0.018% | 2.0% | 13.00 ± 0.00 | 12,205 | 24% |
| Mixed Orphans | 1 | 3,136 | 0.80% ± 0.014% | 1.2% | 7.59 ± 0.05 | 2,001 | 26% |
| Small Three Dragons | 5 | 657 | 0.17% ± 0.007% | 0.3% | 10.47 ± 0.09 | 5,623 | 25% |
| All Honors | 10 | 403 | 0.10% ± 0.005% | 0.2% | 12.95 ± 0.01 | 11,912 | 24% |
| Big Three Dragons | 8 | 205 | 0.053% ± 0.004% | 0.1% | 12.55 ± 0.07 | 9,863 | 20% |
| Small Four Winds | 6 | 85 | 0.022% ± 0.002% | 0.0% | 12.55 ± 0.11 | 10,758 | 25% |
| All Terminals | 10 | 40 | 0.010% ± 0.002% | 0.0% | 11.05 ± 0.13 | 4,864 | 33% |
| Big Four Winds | 13 | 17 | 0.004% ± 0.001% | 0.0% | 13.00 ± 0.00 | 11,083 | 18% |
| Nine Gates | 13 | 16 | 0.004% ± 0.001% | 0.0% | 13.00 ± 0.00 | 11,264 | 19% |

### Sorted by expected faan

| Pattern | Its own faan | Wins with it | Win rate per hand | Share of wins | Expected faan of the win | Points a win | Self-drawn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Thirteen Orphans | 13 | 5,262 | 1.35% ± 0.018% | 2.0% | 13.00 ± 0.00 | 12,205 | 24% |
| Big Four Winds | 13 | 17 | 0.004% ± 0.001% | 0.0% | 13.00 ± 0.00 | 11,083 | 18% |
| Nine Gates | 13 | 16 | 0.004% ± 0.001% | 0.0% | 13.00 ± 0.00 | 11,264 | 19% |
| All Honors | 10 | 403 | 0.10% ± 0.005% | 0.2% | 12.95 ± 0.01 | 11,912 | 24% |
| Small Four Winds | 6 | 85 | 0.022% ± 0.002% | 0.0% | 12.55 ± 0.11 | 10,758 | 25% |
| Big Three Dragons | 8 | 205 | 0.053% ± 0.004% | 0.1% | 12.55 ± 0.07 | 9,863 | 20% |
| Concealed Triplets | 10 | 7,165 | 1.84% ± 0.022% | 2.8% | 11.76 ± 0.01 | 7,046 | 23% |
| All Terminals | 10 | 40 | 0.010% ± 0.002% | 0.0% | 11.05 ± 0.13 | 4,864 | 33% |
| Small Three Dragons | 5 | 657 | 0.17% ± 0.007% | 0.3% | 10.47 ± 0.09 | 5,623 | 25% |
| Full Flush | 7 | 54,040 | 13.86% ± 0.055% | 20.8% | 8.26 ± 0.00 | 787 | 23% |
| Mixed Orphans | 1 | 3,136 | 0.80% ± 0.014% | 1.2% | 7.59 ± 0.05 | 2,001 | 26% |
| All Triplets | 3 | 39,393 | 10.11% ± 0.048% | 15.2% | 5.93 ± 0.01 | 652 | 25% |
| Seven Pairs | 4 | 33,275 | 8.54% ± 0.045% | 12.8% | 5.14 ± 0.01 | 104 | 25% |
| All Sequences | 1 | 31,820 | 8.16% ± 0.044% | 12.2% | 5.00 ± 0.02 | 313 | 36% |
| Half Flush | 3 | 92,011 | 23.60% ± 0.068% | 35.4% | 4.99 ± 0.01 | 287 | 24% |
| Chicken Hand | 0 | 8,068 | 2.07% ± 0.023% | 3.1% | 3.06 ± 0.00 | 27 | 83% |

## The dataset

Every hand of all five experiments, one row a hand, is on Hugging Face: [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games), in `hand-results/`:

| File | Table | Games | Hands |
| --- | --- | ---: | ---: |
| `hand-results/self-jorge-yau.parquet` | Four Jorge Yau | 1,000 | 19,298 |
| `hand-results/self-neural-cat.parquet` | Four Neural Cat | 1,000 | 19,245 |
| `hand-results/self-lucky-cat.parquet` | Four Lucky Cat | 1,000 | 20,987 |
| `hand-results/self-only-orphans.parquet` | Four Only Orphans | 1,000 | 16,669 |
| `hand-results/mixed.parquet` | All four, one seat each | 1,000 | 19,499 |
| `hand-results/mixed-100k.parquet` | All four, one seat each (a 100,000-game run, uploaded as it grows) | 30,000 so far | 584,625 so far |

```python
from datasets import load_dataset
hands = load_dataset("codenameyau/lucky-cat-mahjong-games", "hand-results")["train"]
```

The columns:

| Column | What it holds |
| --- | --- |
| `table` | `self:<strategy>` (four copies of one strategy) or `mixed` |
| `game_seed` | The game's seed; with the table it replays the whole game |
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
| `base_points`, `winner_points` | The full-spicy base payout for that faan, and the points the winner collected |
| `claimed_melds`, `concealed` | Melds claimed from discards, and 1 if none were |
| `winner_discards` | The winner's own discards before the win (how fast it won) |
| `wall_left` | Tiles left in the wall when the hand ended |
| `pattern_count`, `patterns` | How many patterns the hand scored, and each with its faan, e.g. `Half Flush (3); Dragon Triplet (1)` |
| `full_hand` | Every pattern of the win with the total faan, as in the tables above |

## Reproducing it

```bash
node scripts/hand-patterns.js --strategy jorge-yau --games 1000 --seed 7200001 --parquet ml/data/hand-patterns/data/self-jorge-yau.parquet
node scripts/hand-patterns.js --strategy neural-cat --games 1000 --seed 7200001 --parquet ml/data/hand-patterns/data/self-neural-cat.parquet
node scripts/hand-patterns.js --strategy lucky-cat --games 1000 --seed 7200001 --parquet ml/data/hand-patterns/data/self-lucky-cat.parquet
node scripts/hand-patterns.js --strategy only-orphans --games 1000 --seed 7200001 --parquet ml/data/hand-patterns/data/self-only-orphans.parquet
node scripts/hand-patterns.js --lineup jorge-yau,neural-cat,lucky-cat,only-orphans --games 1000 --seed 7300001 --parquet ml/data/hand-patterns/data/mixed.parquet
```

`scripts/hand-patterns.js` plays full games and writes every hand as a row in Parquet (`--parquet`, which needs Python with `pyarrow`; `--csv` writes the same rows as CSV) and the counts as JSON (`--json`: the games and hands, the hands with no winner, and for each strategy its wins, patterns, full hands and wins by faan). `ml/data/` is gitignored, so the files stay local until they're uploaded.
