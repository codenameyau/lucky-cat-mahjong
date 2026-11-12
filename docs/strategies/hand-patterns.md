# Hand patterns: what each strategy wins with

Which scoring patterns win hands, how often, and for how much, for each of the four strategies, from **100,000 full games** with Jorge Yau, Neural Cat, Lucky Cat and Only Orphans at one table: **1,949,960 hands**, 1,301,137 won.

A **hand** is one hand of mahjong, which ends in a win or a draw. A **game** is every hand played until all four rounds are done: each player deals in turn in each round, and a dealer who wins deals again, so a game has at least 16 hands (19.5 on average here).

## Contents

- [How it was measured](#how-it-was-measured)
- [Games, hands and wins](#games-hands-and-wins)
- [Points and games won](#points-and-games-won)
- [Win rate and expected faan of each hand pattern](#win-rate-and-expected-faan-of-each-hand-pattern): [by points a game](#sorted-by-points-a-game), [by faan a game](#sorted-by-faan-a-game)
- [Hand patterns by strategy](#hand-patterns-by-strategy)
- [Sets of honors and bonuses](#sets-of-honors-and-bonuses)
- [Wins by total faan](#wins-by-total-faan)
- [Wins by total points](#wins-by-total-points)
- [Full hands: every pattern of a win, with its faan](#full-hands-every-pattern-of-a-win-with-its-faan)
- [Winning tiles](#winning-tiles)
- [Turns to win](#turns-to-win)
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

| Strategy | Model | Hands won | Win rate per hand | Hands won per game | Average faan a win | Limit hands (% of wins) | Self-drawn (% of wins) | Concealed (% of wins) | Dealt in (per hand) | Won as dealer (of hands it dealt) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jorge Yau | Rules only | 389,856 | 19.99% ± 0.03 | 3.90 | 5.19 | 6,740 (1.7%) | 129,181 (33.1%) | 160,542 (41.2%) | 206,747 (10.60%) | 107,183 of 507,183 (21.1%) |
| Neural Cat | NC10 | 370,904 | 19.02% ± 0.03 | 3.71 | 5.80 | 13,812 (3.7%) | 109,650 (29.6%) | 146,489 (39.5%) | 200,923 (10.30%) | 96,319 of 496,319 (19.4%) |
| Lucky Cat | LC34 | 437,088 | 22.42% ± 0.03 | 4.37 | 5.56 | 1,879 (0.4%) | 110,115 (25.2%) | 32,751 (7.5%) | 241,047 (12.36%) | 122,848 of 522,848 (23.5%) |
| Only Orphans | OW1 | 103,289 | 5.30% ± 0.02 | 1.03 | 7.29 | 18,300 (17.7%) | 24,824 (24.0%) | 100,917 (97.7%) | 278,077 (14.26%) | 23,610 of 423,610 (5.6%) |
| **All** | | 1,301,137 | 66.73% (of hands) | 13.01 | 5.66 | 40,731 (3.1%) | 373,770 (28.7%) | 440,699 (33.9%) | | |

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

Each pattern's expected value over **every player in every game**: the 400,000 games a player sat through (100,000 games × 4 players), including every game where that player never won with it.

- **Faan a game** and **Points a game:** the faan and points a player collected in one game from wins that scored the pattern, averaged over all 400,000. A game where the player didn't win with the pattern counts as 0. The faan is the whole win's, every other pattern of it included.
- **Games a player scores it:** the share of games in which a player won at least once with the pattern.
- **Win rate per hand:** the share of all 1,949,960 hands that ended in a win scoring the pattern, by anyone.
- **Points** are what the winner collected, before anything paid elsewhere in the game. They double with each faan (8 at 3 faan, 8,192 at the 13-faan limit), so a few big wins pull the means up. **Any win** is every win, whatever its pattern: a player's total from winning, a game.
- The data record how hands ended, not what a player was aiming for. These are the values a player gets from each pattern at this table, not the odds of finishing it once going for it. A win can score more than one hand pattern, so the rows overlap.

### Sorted by points a game

| Pattern | Its own faan | Win rate per hand | Games a player scores it | Faan a game | Points a game |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Any win** |  | 1,301,137 (66.73%) | 360,930 (90.2%) | 18.40 | 2297.3 |
| Thirteen Orphans | 13 | 26,121 (1.34%) | 24,944 (6.2%) | 0.85 | 806.7 |
| Concealed Triplets | 10 | 35,415 (1.82%) | 33,410 (8.4%) | 1.04 | 624.9 |
| Full Flush | 7 | 269,568 (13.82%) | 177,995 (44.5%) | 5.57 | 533.4 |
| Half Flush | 3 | 461,142 (23.65%) | 231,981 (58.0%) | 5.75 | 327.8 |
| All Triplets | 3 | 197,087 (10.11%) | 142,635 (35.7%) | 2.92 | 323.3 |
| All Sequences | 1 | 158,526 (8.13%) | 116,795 (29.2%) | 1.98 | 125.3 |
| Mixed Orphans | 1 | 15,722 (0.81%) | 15,353 (3.8%) | 0.30 | 76.3 |
| All Honors | 10 | 2,098 (0.11%) | 2,094 (0.5%) | 0.068 | 61.7 |
| Small Three Dragons | 5 | 3,126 (0.16%) | 3,119 (0.8%) | 0.082 | 46.2 |
| Seven Pairs | 4 | 167,874 (8.61%) | 132,940 (33.2%) | 2.16 | 43.6 |
| Big Three Dragons | 8 | 1,103 (0.057%) | 1,101 (0.3%) | 0.034 | 28.3 |
| Small Four Winds | 6 | 402 (0.021%) | 402 (0.1%) | 0.013 | 10.6 |
| Big Four Winds | 13 | 109 (0.006%) | 109 (0.027%) | 0.004 | 3.3 |
| Nine Gates | 13 | 101 (0.005%) | 101 (0.025%) | 0.003 | 3.0 |
| Chicken Hand | 0 | 40,605 (2.08%) | 36,908 (9.2%) | 0.31 | 2.7 |
| All Terminals | 10 | 215 (0.011%) | 215 (0.054%) | 0.006 | 2.3 |
| Four Quads | 13 | 2 (0.000%) | 2 (0.001%) | 0.000 | 0.1 |

### Sorted by faan a game

| Pattern | Its own faan | Win rate per hand | Games a player scores it | Faan a game | Points a game |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Any win** |  | 1,301,137 (66.73%) | 360,930 (90.2%) | 18.40 | 2297.3 |
| Half Flush | 3 | 461,142 (23.65%) | 231,981 (58.0%) | 5.75 | 327.8 |
| Full Flush | 7 | 269,568 (13.82%) | 177,995 (44.5%) | 5.57 | 533.4 |
| All Triplets | 3 | 197,087 (10.11%) | 142,635 (35.7%) | 2.92 | 323.3 |
| Seven Pairs | 4 | 167,874 (8.61%) | 132,940 (33.2%) | 2.16 | 43.6 |
| All Sequences | 1 | 158,526 (8.13%) | 116,795 (29.2%) | 1.98 | 125.3 |
| Concealed Triplets | 10 | 35,415 (1.82%) | 33,410 (8.4%) | 1.04 | 624.9 |
| Thirteen Orphans | 13 | 26,121 (1.34%) | 24,944 (6.2%) | 0.85 | 806.7 |
| Chicken Hand | 0 | 40,605 (2.08%) | 36,908 (9.2%) | 0.31 | 2.7 |
| Mixed Orphans | 1 | 15,722 (0.81%) | 15,353 (3.8%) | 0.30 | 76.3 |
| Small Three Dragons | 5 | 3,126 (0.16%) | 3,119 (0.8%) | 0.082 | 46.2 |
| All Honors | 10 | 2,098 (0.11%) | 2,094 (0.5%) | 0.068 | 61.7 |
| Big Three Dragons | 8 | 1,103 (0.057%) | 1,101 (0.3%) | 0.034 | 28.3 |
| Small Four Winds | 6 | 402 (0.021%) | 402 (0.1%) | 0.013 | 10.6 |
| All Terminals | 10 | 215 (0.011%) | 215 (0.054%) | 0.006 | 2.3 |
| Big Four Winds | 13 | 109 (0.006%) | 109 (0.027%) | 0.004 | 3.3 |
| Nine Gates | 13 | 101 (0.005%) | 101 (0.025%) | 0.003 | 3.0 |
| Four Quads | 13 | 2 (0.000%) | 2 (0.001%) | 0.000 | 0.1 |

## Hand patterns by strategy

Each strategy played all 100,000 games. Games won, meaning finished with the most points: Jorge Yau 21,343 (21.3%), Neural Cat 34,531 (34.5%), Lucky Cat 24,056 (24.1%), Only Orphans 20,345 (20.3%).

For each hand pattern and strategy: the hands it won scoring the pattern (and their share of all its wins), and the **games** in which it won at least one hand with it (and their share of its 100,000 games).

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Half Flush | 3 | 103,358 wins (26.5%), 64,970 games (65.0%) | 105,691 wins (28.5%), 65,841 games (65.8%) | 242,609 wins (55.5%), 92,115 games (92.1%) | 9,484 wins (9.2%), 9,055 games (9.1%) |
| Full Flush | 7 | 70,072 wins (18.0%), 50,733 games (50.7%) | 97,835 wins (26.4%), 62,822 games (62.8%) | 101,637 wins (23.3%), 64,416 games (64.4%) | 24 wins (0.0%), 24 games (0.0%) |
| All Triplets | 3 | 64,546 wins (16.6%), 47,796 games (47.8%) | 39,552 wins (10.7%), 32,901 games (32.9%) | 91,376 wins (20.9%), 60,340 games (60.3%) | 1,613 wins (1.6%), 1,598 games (1.6%) |
| Seven Pairs | 4 | 39,747 wins (10.2%), 32,999 games (33.0%) | 40,855 wins (11.0%), 33,666 games (33.7%) | 15,994 wins (3.7%), 14,782 games (14.8%) | 71,278 wins (69.0%), 51,493 games (51.5%) |
| All Sequences | 1 | 59,865 wins (15.4%), 45,251 games (45.3%) | 82,289 wins (22.2%), 56,396 games (56.4%) | 16,234 wins (3.7%), 15,010 games (15.0%) | 138 wins (0.1%), 138 games (0.1%) |
| Chicken Hand | 0 | 25,313 wins (6.5%), 22,350 games (22.4%) | 12,573 wins (3.4%), 11,866 games (11.9%) | 2,634 wins (0.6%), 2,607 games (2.6%) | 85 wins (0.1%), 85 games (0.1%) |
| Concealed Triplets | 10 | 4,462 wins (1.1%), 4,360 games (4.4%) | 10,552 wins (2.8%), 9,986 games (10.0%) | 4,157 wins (1.0%), 4,082 games (4.1%) | 16,244 wins (15.7%), 14,982 games (15.0%) |
| Thirteen Orphans | 13 | 4,926 wins (1.3%), 4,807 games (4.8%) | 9,130 wins (2.5%), 8,714 games (8.7%) | 0 wins (0.0%), 0 games (0.0%) | 12,065 wins (11.7%), 11,423 games (11.4%) |
| Mixed Orphans | 1 | 5,973 wins (1.5%), 5,796 games (5.8%) | 2,603 wins (0.7%), 2,575 games (2.6%) | 1,239 wins (0.3%), 1,231 games (1.2%) | 5,907 wins (5.7%), 5,751 games (5.8%) |
| Small Three Dragons | 5 | 1,034 wins (0.3%), 1,031 games (1.0%) | 1,096 wins (0.3%), 1,094 games (1.1%) | 702 wins (0.2%), 700 games (0.7%) | 294 wins (0.3%), 294 games (0.3%) |
| All Honors | 10 | 413 wins (0.1%), 412 games (0.4%) | 633 wins (0.2%), 633 games (0.6%) | 355 wins (0.1%), 354 games (0.4%) | 697 wins (0.7%), 695 games (0.7%) |
| Big Three Dragons | 8 | 316 wins (0.1%), 315 games (0.3%) | 422 wins (0.1%), 421 games (0.4%) | 156 wins (0.0%), 156 games (0.2%) | 209 wins (0.2%), 209 games (0.2%) |
| Small Four Winds | 6 | 83 wins (0.0%), 83 games (0.1%) | 128 wins (0.0%), 128 games (0.1%) | 115 wins (0.0%), 115 games (0.1%) | 76 wins (0.1%), 76 games (0.1%) |
| All Terminals | 10 | 37 wins (0.0%), 37 games (0.0%) | 51 wins (0.0%), 51 games (0.1%) | 31 wins (0.0%), 31 games (0.0%) | 96 wins (0.1%), 96 games (0.1%) |
| Big Four Winds | 13 | 17 wins (0.0%), 17 games (0.0%) | 26 wins (0.0%), 26 games (0.0%) | 39 wins (0.0%), 39 games (0.0%) | 27 wins (0.0%), 27 games (0.0%) |
| Nine Gates | 13 | 55 wins (0.0%), 55 games (0.1%) | 22 wins (0.0%), 22 games (0.0%) | 24 wins (0.0%), 24 games (0.0%) | 0 wins (0.0%), 0 games (0.0%) |
| Four Quads | 13 | 1 wins (0.0%), 1 games (0.0%) | 0 wins (0.0%), 0 games (0.0%) | 1 wins (0.0%), 1 games (0.0%) | 0 wins (0.0%), 0 games (0.0%) |

### Points a game from each hand pattern, by strategy

The mean points a strategy collected in a game from wins scoring each pattern, over all 100,000 games it played, with the games it didn't win with the pattern counted as 0.

| Pattern | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: |
| Half Flush | 222.9 | 375.3 | 378.4 | 334.7 |
| Full Flush | 515.2 | 861.6 | 755.7 | 1.3 |
| All Triplets | 296.4 | 498.2 | 456.9 | 41.8 |
| Seven Pairs | 42.7 | 40.3 | 15.8 | 75.7 |
| All Sequences | 112.4 | 246.7 | 141.8 | 0.4 |
| Chicken Hand | 6.1 | 3.5 | 0.7 | 0.6 |
| Concealed Triplets | 274.2 | 758.0 | 282.4 | 1185.0 |
| Thirteen Orphans | 627.7 | 1154.3 | 0.0 | 1444.8 |
| Mixed Orphans | 59.8 | 92.3 | 36.9 | 116.1 |
| Small Three Dragons | 41.6 | 72.4 | 35.6 | 35.1 |
| All Honors | 49.2 | 75.1 | 43.8 | 78.8 |
| Big Three Dragons | 24.6 | 44.9 | 18.7 | 25.0 |
| Small Four Winds | 7.6 | 15.0 | 11.7 | 8.2 |
| All Terminals | 2.5 | 1.8 | 1.5 | 3.5 |
| Big Four Winds | 2.4 | 3.1 | 4.5 | 3.0 |
| Nine Gates | 6.0 | 3.1 | 2.9 | 0.0 |
| Four Quads | 0.1 | 0.0 | 0.2 | 0.0 |

## Sets of honors and bonuses

Each strategy's wins scoring each set of honors or bonus, and their share of its wins.

### Sets of honors

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dragon Triplet | 1 | 97,870 (25.1%) | 64,171 (17.3%) | 90,945 (20.8%) | 9,361 (9.1%) |
| Seat Wind | 1 | 22,285 (5.7%) | 15,019 (4.0%) | 34,632 (7.9%) | 2,813 (2.7%) |
| Round Wind | 1 | 21,120 (5.4%) | 14,521 (3.9%) | 30,903 (7.1%) | 2,773 (2.7%) |
| Seat and Round Wind | 2 | 9,672 (2.5%) | 6,459 (1.7%) | 11,071 (2.5%) | 1,043 (1.0%) |
| Dragon Quad | 1 | 3,481 (0.9%) | 1,690 (0.5%) | 5,210 (1.2%) | 381 (0.4%) |

### Bonuses

| Pattern | Faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| --- | ---: | ---: | ---: | ---: | ---: |
| Self-Draw | 1 | 129,772 (33.3%) | 110,293 (29.7%) | 110,701 (25.3%) | 25,534 (24.7%) |
| Seat Season | 1 | 89,476 (23.0%) | 79,953 (21.6%) | 88,134 (20.2%) | 23,186 (22.4%) |
| Seat Flower | 1 | 89,817 (23.0%) | 79,573 (21.5%) | 87,726 (20.1%) | 23,278 (22.5%) |
| No Flowers | 1 | 78,248 (20.1%) | 71,152 (19.2%) | 78,445 (17.9%) | 18,005 (17.4%) |
| Concealed | 1 | 111,569 (28.6%) | 86,117 (23.2%) | 12,976 (3.0%) | 1,333 (1.3%) |
| Win on Last Tile | 1 | 8,700 (2.2%) | 6,935 (1.9%) | 8,930 (2.0%) | 1,457 (1.4%) |
| Win by Kong | 1 | 1,798 (0.5%) | 867 (0.2%) | 2,777 (0.6%) | 114 (0.1%) |
| Four Seasons | 2 | 1,102 (0.3%) | 930 (0.3%) | 981 (0.2%) | 300 (0.3%) |
| Four Flowers | 2 | 1,030 (0.3%) | 878 (0.2%) | 863 (0.2%) | 307 (0.3%) |
| Seven Robbing One | 5 | 588 (0.2%) | 638 (0.2%) | 582 (0.1%) | 698 (0.7%) |
| Robbing the Kong | 1 | 562 (0.1%) | 662 (0.2%) | 208 (0.0%) | 114 (0.1%) |
| Win by Double Kong | 8 | 35 (0.0%) | 8 (0.0%) | 45 (0.0%) | 0 (0.0%) |
| Eight Immortals Crossing the Sea | 13 | 3 (0.0%) | 5 (0.0%) | 4 (0.0%) | 12 (0.0%) |
| Earthly Hand | 13 | 3 (0.0%) | 4 (0.0%) | 3 (0.0%) | 7 (0.0%) |
| Heavenly Hand | 13 | 1 (0.0%) | 2 (0.0%) | 1 (0.0%) | 2 (0.0%) |

## Wins by total faan

| Total faan | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans | All |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 113,700 (29.2%) | 93,399 (25.2%) | 58,376 (13.4%) | 307 (0.3%) | 265,782 (20.4%) |
| 4 | 80,987 (20.8%) | 72,045 (19.4%) | 115,717 (26.5%) | 18,619 (18.0%) | 287,368 (22.1%) |
| 5 | 66,811 (17.1%) | 51,886 (14.0%) | 91,124 (20.8%) | 32,385 (31.4%) | 242,206 (18.6%) |
| 6 | 28,489 (7.3%) | 18,363 (5.0%) | 35,825 (8.2%) | 13,011 (12.6%) | 95,688 (7.4%) |
| 7 | 28,367 (7.3%) | 28,394 (7.7%) | 41,486 (9.5%) | 4,601 (4.5%) | 102,848 (7.9%) |
| 8 | 35,147 (9.0%) | 43,480 (11.7%) | 52,634 (12.0%) | 3,195 (3.1%) | 134,456 (10.3%) |
| 9 | 17,020 (4.4%) | 25,823 (7.0%) | 24,662 (5.6%) | 1,170 (1.1%) | 68,675 (5.3%) |
| 10 | 6,337 (1.6%) | 10,690 (2.9%) | 8,058 (1.8%) | 2,183 (2.1%) | 27,268 (2.1%) |
| 11 | 4,191 (1.1%) | 8,264 (2.2%) | 5,130 (1.2%) | 4,808 (4.7%) | 22,393 (1.7%) |
| 12 | 2,067 (0.5%) | 4,748 (1.3%) | 2,197 (0.5%) | 4,710 (4.6%) | 13,722 (1.1%) |
| 13 (limit) | 6,740 (1.7%) | 13,812 (3.7%) | 1,879 (0.4%) | 18,300 (17.7%) | 40,731 (3.1%) |
| **Total** | **389,856 (100.0%)** | **370,904 (100.0%)** | **437,088 (100.0%)** | **103,289 (100.0%)** | **1,301,137 (100.0%)** |

Each strategy's wins at each total faan, and their share of its wins.

## Wins by total points

The points the winner collected from each win: the full-spicy payout for its faan, from 8 at 3 faan to 8,192 at the limit, collected three times on a self-draw (once from each opponent).

| Points | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans | All |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 65,611 (16.8%) | 63,637 (17.2%) | 53,742 (12.3%) | 182 (0.2%) | 183,172 (14.1%) |
| 16 | 61,057 (15.7%) | 53,055 (14.3%) | 99,238 (22.7%) | 18,573 (18.0%) | 231,923 (17.8%) |
| 24 | 48,089 (12.3%) | 29,762 (8.0%) | 4,634 (1.1%) | 125 (0.1%) | 82,610 (6.3%) |
| 32 | 47,654 (12.2%) | 35,164 (9.5%) | 59,568 (13.6%) | 26,260 (25.4%) | 168,646 (13.0%) |
| 48 | 19,930 (5.1%) | 18,990 (5.1%) | 16,479 (3.8%) | 46 (0.0%) | 55,445 (4.3%) |
| 64 | 13,137 (3.4%) | 7,027 (1.9%) | 15,151 (3.5%) | 4,418 (4.3%) | 39,733 (3.1%) |
| 96 | 19,157 (4.9%) | 16,722 (4.5%) | 31,556 (7.2%) | 6,125 (5.9%) | 73,560 (5.7%) |
| 128 | 23,700 (6.1%) | 25,955 (7.0%) | 35,460 (8.1%) | 3,013 (2.9%) | 88,128 (6.8%) |
| 192 | 15,352 (3.9%) | 11,336 (3.1%) | 20,674 (4.7%) | 8,593 (8.3%) | 55,955 (4.3%) |
| 256 | 28,151 (7.2%) | 36,087 (9.7%) | 41,717 (9.5%) | 2,404 (2.3%) | 108,359 (8.3%) |
| 384 | 4,667 (1.2%) | 2,439 (0.7%) | 6,026 (1.4%) | 1,588 (1.5%) | 14,720 (1.1%) |
| 512 | 8,722 (2.2%) | 15,187 (4.1%) | 12,017 (2.7%) | 425 (0.4%) | 36,351 (2.8%) |
| 768 | 6,996 (1.8%) | 7,393 (2.0%) | 10,917 (2.5%) | 791 (0.8%) | 26,097 (2.0%) |
| 1,024 | 3,639 (0.9%) | 6,255 (1.7%) | 4,195 (1.0%) | 2,045 (2.0%) | 16,134 (1.2%) |
| 1,536 | 8,298 (2.1%) | 10,636 (2.9%) | 12,645 (2.9%) | 745 (0.7%) | 32,324 (2.5%) |
| 2,048 | 3,090 (0.8%) | 6,409 (1.7%) | 3,700 (0.8%) | 4,224 (4.1%) | 17,423 (1.3%) |
| 3,072 | 2,698 (0.7%) | 4,435 (1.2%) | 3,863 (0.9%) | 138 (0.1%) | 11,134 (0.9%) |
| 4,096 | 1,152 (0.3%) | 2,810 (0.8%) | 1,026 (0.2%) | 3,409 (3.3%) | 8,397 (0.6%) |
| 6,144 | 1,101 (0.3%) | 1,855 (0.5%) | 1,430 (0.3%) | 584 (0.6%) | 4,970 (0.4%) |
| 8,192 | 4,625 (1.2%) | 9,527 (2.6%) | 1,027 (0.2%) | 13,349 (12.9%) | 28,528 (2.2%) |
| 12,288 | 915 (0.2%) | 1,938 (0.5%) | 1,171 (0.3%) | 1,301 (1.3%) | 5,325 (0.4%) |
| 24,576 | 2,115 (0.5%) | 4,285 (1.2%) | 852 (0.2%) | 4,951 (4.8%) | 12,203 (0.9%) |
| **Total wins** | **389,856 (100.0%)** | **370,904 (100.0%)** | **437,088 (100.0%)** | **103,289 (100.0%)** | **1,301,137 (100.0%)** |
| **Total points collected** | **176,317,440** | **314,857,576** | **144,756,688** | **282,982,648** | **918,914,352** |

Each strategy's wins collecting each number of points, and their share of its wins. Total points collected adds up everything its wins collected, before what it paid on other players' wins.

## Full hands: every pattern of a win, with its faan

The most common complete wins: every pattern a win scored, and its total faan. Patterns that score twice show ×2.

### All four strategies

| Full hand (every pattern) | Total faan | Wins | % of wins |
| --- | ---: | ---: | ---: |
| Full Flush | 7 | 67,949 | 5.2% |
| Half Flush | 3 | 67,680 | 5.2% |
| Seven Pairs | 4 | 48,284 | 3.7% |
| Dragon Triplet + Half Flush | 4 | 37,916 | 2.9% |
| Full Flush + No Flowers | 8 | 26,764 | 2.1% |
| Half Flush + No Flowers | 4 | 26,115 | 2.0% |
| All Sequences + Concealed + Self-Draw | 3 | 25,864 | 2.0% |
| Full Flush + Seat Season | 8 | 23,984 | 1.8% |
| Full Flush + Seat Flower | 8 | 23,612 | 1.8% |
| All Triplets | 3 | 23,324 | 1.8% |
| All Sequences + Concealed + No Flowers | 3 | 23,197 | 1.8% |
| No Flowers + Seven Pairs | 5 | 21,163 | 1.6% |
| Half Flush + Seat Season | 4 | 20,846 | 1.6% |
| Half Flush + Seat Flower | 4 | 20,841 | 1.6% |
| Half Flush + Self-Draw | 4 | 20,027 | 1.5% |
| Full Flush + Self-Draw | 8 | 19,760 | 1.5% |
| Seat Flower + Seven Pairs | 5 | 17,358 | 1.3% |
| Seat Season + Seven Pairs | 5 | 17,114 | 1.3% |
| All Sequences + Concealed + Seat Season | 3 | 16,737 | 1.3% |
| All Sequences + Concealed + Seat Flower | 3 | 16,655 | 1.3% |

### Jorge Yau (Rules only)

| Full hand (every pattern) | Total faan | Wins | % of wins |
| --- | ---: | ---: | ---: |
| Full Flush | 7 | 18,743 | 4.8% |
| All Sequences + Concealed + Self-Draw | 3 | 13,214 | 3.4% |
| Half Flush | 3 | 12,227 | 3.1% |
| Seven Pairs | 4 | 11,741 | 3.0% |
| All Sequences + Concealed + No Flowers | 3 | 10,601 | 2.7% |
| Dragon Triplet + Half Flush | 4 | 10,019 | 2.6% |
| All Sequences + Concealed + Seat Season | 3 | 7,523 | 1.9% |
| All Sequences + Concealed + Seat Flower | 3 | 7,514 | 1.9% |
| Chicken Hand + Concealed + No Flowers + Self-Draw | 3 | 7,274 | 1.9% |
| Full Flush + No Flowers | 8 | 7,137 | 1.8% |
| Full Flush + Seat Season | 8 | 6,585 | 1.7% |
| Full Flush + Seat Flower | 8 | 6,472 | 1.7% |

### Neural Cat (NC10)

| Full hand (every pattern) | Total faan | Wins | % of wins |
| --- | ---: | ---: | ---: |
| Full Flush | 7 | 21,832 | 5.9% |
| Half Flush | 3 | 17,361 | 4.7% |
| Seven Pairs | 4 | 12,996 | 3.5% |
| All Sequences + Concealed + Self-Draw | 3 | 12,533 | 3.4% |
| All Sequences + Concealed + No Flowers | 3 | 12,386 | 3.3% |
| Dragon Triplet + Half Flush | 4 | 11,274 | 3.0% |
| All Sequences + Concealed + Seat Season | 3 | 9,091 | 2.5% |
| All Sequences + Concealed + Seat Flower | 3 | 9,028 | 2.4% |
| Full Flush + No Flowers | 8 | 8,986 | 2.4% |
| Full Flush + Seat Season | 8 | 7,757 | 2.1% |
| Full Flush + Seat Flower | 8 | 7,722 | 2.1% |
| All Sequences + Full Flush | 8 | 7,243 | 2.0% |

### Lucky Cat (LC34)

| Full hand (every pattern) | Total faan | Wins | % of wins |
| --- | ---: | ---: | ---: |
| Half Flush | 3 | 38,092 | 8.7% |
| Full Flush | 7 | 27,374 | 6.3% |
| Dragon Triplet + Half Flush | 4 | 16,623 | 3.8% |
| Half Flush + No Flowers | 4 | 15,959 | 3.7% |
| Half Flush + Seat Flower | 4 | 12,871 | 2.9% |
| Half Flush + Seat Season | 4 | 12,838 | 2.9% |
| All Triplets | 3 | 12,637 | 2.9% |
| Half Flush + Self-Draw | 4 | 11,331 | 2.6% |
| Full Flush + No Flowers | 8 | 10,641 | 2.4% |
| Full Flush + Seat Season | 8 | 9,642 | 2.2% |
| Full Flush + Seat Flower | 8 | 9,418 | 2.2% |
| Full Flush + Self-Draw | 8 | 8,026 | 1.8% |

### Only Orphans (OW1)

| Full hand (every pattern) | Total faan | Wins | % of wins |
| --- | ---: | ---: | ---: |
| Seven Pairs | 4 | 18,463 | 17.9% |
| No Flowers + Seven Pairs | 5 | 8,976 | 8.7% |
| Seat Flower + Seven Pairs | 5 | 7,994 | 7.7% |
| Seat Season + Seven Pairs | 5 | 7,770 | 7.5% |
| Self-Draw + Seven Pairs | 5 | 6,086 | 5.9% |
| Thirteen Orphans | 13 | 4,089 | 4.0% |
| No Flowers + Self-Draw + Seven Pairs | 6 | 2,755 | 2.7% |
| Seat Season + Self-Draw + Seven Pairs | 6 | 2,701 | 2.6% |
| Seat Flower + Self-Draw + Seven Pairs | 6 | 2,645 | 2.6% |
| Seat Flower + Seat Season + Seven Pairs | 6 | 2,529 | 2.4% |
| Half Flush + Seven Pairs | 7 | 2,051 | 2.0% |
| Concealed Triplets | 10 | 1,750 | 1.7% |

## Winning tiles

The tile that completed each of the 1,301,137 wins, whether drawn or claimed from a discard. A win on flowers alone has no winning tile.

### The most common winning tiles

| Rank | Tile | Wins |
| ---: | --- | ---: |
| 1 | Red Dragon | 55,855 (4.29%) |
| 2 | White Dragon | 50,764 (3.90%) |
| 3 | Green Dragon | 47,410 (3.64%) |
| 4 | 7 Characters | 46,430 (3.57%) |
| 5 | 3 Characters | 44,781 (3.44%) |
| 6 | 4 Characters | 43,114 (3.31%) |
| 7 | 7 Dots | 42,976 (3.30%) |
| 8 | 5 Characters | 42,468 (3.26%) |
| 9 | 6 Dots | 42,434 (3.26%) |
| 10 | 6 Characters | 42,075 (3.23%) |
| 11 | 6 Bamboo | 41,241 (3.17%) |
| 12 | 4 Dots | 40,652 (3.12%) |
| 13 | 7 Bamboo | 40,400 (3.10%) |
| 14 | 3 Dots | 39,974 (3.07%) |
| 15 | 5 Dots | 39,737 (3.05%) |

The least common: East Wind, 27,483 (2.11%); South Wind, 29,356 (2.26%); North Wind, 29,532 (2.27%).

### By kind of tile

Per kind, and per tile of that kind, so groups of different sizes compare.

| Kind | Tiles in it | Wins | Wins per tile |
| --- | ---: | ---: | ---: |
| Characters (2 to 8) | 7 | 292,792 (22.5%) | 41,827 |
| Bamboo (2 to 8) | 7 | 265,671 (20.4%) | 37,953 |
| Dots (2 to 8) | 7 | 274,462 (21.1%) | 39,209 |
| Characters (1 or 9) | 2 | 66,046 (5.1%) | 33,023 |
| Bamboo (1 or 9) | 2 | 63,723 (4.9%) | 31,862 |
| Dots (1 or 9) | 2 | 61,992 (4.8%) | 30,996 |
| Winds | 4 | 119,886 (9.2%) | 29,972 |
| Dragons | 3 | 154,029 (11.8%) | 51,343 |
| Flowers | - | 2,536 (0.2%) | - |

"Tiles in it" is how many different tiles the kind has, each in the wall 4 times: a suit's 2 to 8 is 7 tiles, its 1 and 9 are 2, the winds 4 and the dragons 3.

### Each strategy's most common winning tiles

| Rank | Jorge Yau | Neural Cat | Lucky Cat | Only Orphans |
| ---: | --- | --- | --- | --- |
| 1 | Red Dragon: 21,163 (5.4%) | 7 Characters: 15,133 (4.1%) | 7 Characters: 17,280 (4.0%) | White Dragon: 12,557 (12.2%) |
| 2 | Green Dragon: 16,341 (4.2%) | 4 Characters: 14,425 (3.9%) | 3 Characters: 17,237 (3.9%) | Green Dragon: 11,432 (11.1%) |
| 3 | White Dragon: 16,163 (4.1%) | 3 Characters: 14,088 (3.8%) | 7 Dots: 17,061 (3.9%) | Red Dragon: 10,814 (10.5%) |
| 4 | 7 Characters: 13,533 (3.5%) | 6 Characters: 13,484 (3.6%) | 6 Dots: 17,051 (3.9%) | West Wind: 7,948 (7.7%) |
| 5 | 7 Dots: 13,221 (3.4%) | 5 Characters: 13,058 (3.5%) | 5 Characters: 16,541 (3.8%) | 1 Bamboo: 7,925 (7.7%) |
| 6 | 7 Bamboo: 13,124 (3.4%) | 6 Bamboo: 12,937 (3.5%) | 4 Dots: 16,224 (3.7%) | North Wind: 7,858 (7.6%) |
| 7 | 3 Characters: 13,075 (3.4%) | 6 Dots: 12,502 (3.4%) | 5 Dots: 15,995 (3.7%) | South Wind: 6,984 (6.8%) |
| 8 | 6 Bamboo: 12,847 (3.3%) | 7 Dots: 12,426 (3.4%) | 6 Characters: 15,955 (3.7%) | 1 Dot: 6,860 (6.6%) |

## Turns to win

**Turns** here are the winner's own discards before it won (the dataset's `winner_discards`): 12 turns means it had thrown 12 tiles when it won, by drawing the winning tile on its next turn or claiming someone else's discard. A dealer can win before discarding at all.

| Strategy | Wins | Turns: mean | Turns: median | 0 to 8 | 9 to 11 | 12 to 14 | 15 to 17 | 18 to 20 | 21 or more |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jorge Yau | 389,856 | 15.44 | 16 | 28,981 (7.4%) | 43,584 (11.2%) | 75,165 (19.3%) | 99,697 (25.6%) | 100,128 (25.7%) | 42,301 (10.9%) |
| Neural Cat | 370,904 | 15.83 | 16 | 21,212 (5.7%) | 37,255 (10.0%) | 69,592 (18.8%) | 97,291 (26.2%) | 99,916 (26.9%) | 45,638 (12.3%) |
| Lucky Cat | 437,088 | 16.63 | 17 | 10,472 (2.4%) | 33,361 (7.6%) | 76,696 (17.5%) | 117,963 (27.0%) | 128,625 (29.4%) | 69,971 (16.0%) |
| Only Orphans | 103,289 | 15.60 | 16 | 4,708 (4.6%) | 10,358 (10.0%) | 21,439 (20.8%) | 30,937 (30.0%) | 28,045 (27.2%) | 7,802 (7.6%) |
| **All** | 1,301,137 | 15.96 | 16 | 65,373 (5.0%) | 124,558 (9.6%) | 242,892 (18.7%) | 345,888 (26.6%) | 356,714 (27.4%) | 165,712 (12.7%) |

The bands are the share of each strategy's wins that took that many turns.

### What a win is worth by how long it took

All 1,301,137 wins, by the winner's turns:

| Turns | Wins | Average faan | Points a win | Self-drawn |
| --- | ---: | ---: | ---: | ---: |
| 0 to 8 | 65,373 (5.0%) | 4.10 | 161 | 23,922 (36.6%) |
| 9 to 11 | 124,558 (9.6%) | 4.77 | 338 | 40,282 (32.3%) |
| 12 to 14 | 242,892 (18.7%) | 5.27 | 508 | 71,598 (29.5%) |
| 15 to 17 | 345,888 (26.6%) | 5.71 | 714 | 97,940 (28.3%) |
| 18 to 20 | 356,714 (27.4%) | 6.10 | 957 | 102,651 (28.8%) |
| 21 or more | 165,712 (12.7%) | 6.43 | 930 | 37,377 (22.6%) |

The most common is 18 turns: 123,191 wins, 9.5% of them. The longest win took 27.

## What it shows

- **Points a hand decide who finishes on top, not hands won.** Neural Cat +61.8, Only Orphans +48.4, Jorge Yau −35.9, Lucky Cat −74.2 points a hand; games on top: Neural Cat 34.5%, Lucky Cat 24.1%, Jorge Yau 21.3%, Only Orphans 20.3%.
- **Hands won, most first:** Lucky Cat 22.4%, Jorge Yau 20.0%, Neural Cat 19.0%, Only Orphans 5.3%. Lucky Cat wins the most hands but averages 5.56 faan a win; Only Orphans wins the fewest at 7.29.
- **Half Flush is the most common winning hand** (23.6% of all hands): a player scores it in 58.0% of games, for 327.8 points a game on average. **Full Flush** wins fewer hands (13.8%) but is worth 533.4 points a game. Of all hand patterns, **Thirteen Orphans** is worth the most points a game (806.7).
- **The dragons are the most common winning tiles:** Red Dragon, White Dragon, Green Dragon, 51,343 wins each against 39,663 for a middle suit tile (2 to 8). Winds are the least common, at 29,972 each.
- **Wins take 16.0 turns on average** (the median is 16), and Lucky Cat takes the longest at 16.6. Slower wins score more faan: 0 to 8 turns averages 4.1 faan and 161 points, 21 or more averages 6.4 faan and 930 points.
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
# Native, about 21 times faster a core: build, then play the 100,000 games in 30 processes.
make -C native -j10
IDS=$(node -e "const N = require('./scripts/ml/native.js'); console.log(['jorge-yau', 'neural-cat', 'lc:js/mahjong-lucky-cat-weights.js', 'only-orphans'].map((id) => N.nativeId(id)).join(','))")
D=ml/data/hand-patterns
mkdir -p $D/parts $D/data
for j in $(seq 0 29); do
  native/build/lcm-sim-exact games --lineup "$IDS" --names jorge-yau,neural-cat,lucky-cat,only-orphans \
    --seed 8000001 --from $((j * 3334)) --to $(( j == 29 ? 100000 : (j + 1) * 3334 )) --out $D/parts/part-$(printf %02d $j).csv &
done
wait
echo "table,game_seed,hand_in_game,round,dealer_seat,dealer_repeat,seat0_strategy,seat1_strategy,seat2_strategy,seat3_strategy,result,winner_seat,winner_strategy,winner_is_dealer,how,payer_seat,payer_strategy,winning_tile,faan,limit,base_points,winner_points,claimed_melds,concealed,winner_discards,wall_left,pattern_count,patterns,full_hand" > $D/data/mixed-100k.csv
cat $D/parts/part-*.csv >> $D/data/mixed-100k.csv
python scripts/hand-results-parquet.py $D/data/mixed-100k.csv $D/data/mixed-100k.parquet

# Or in JS, the game's own engine (about 10 hours on 16 workers):
node scripts/hand-patterns.js --lineup jorge-yau,neural-cat,lucky-cat,only-orphans --games 100000 --seed 8000001 \
  --csv $D/data/mixed-100k.csv --parquet $D/data/mixed-100k.parquet

# Then this page, from the CSV:
node scripts/hand-patterns-doc.js $D/data/mixed-100k.csv docs/strategies/hand-patterns.md
```

The native simulator's `games` command plays full games and writes the same rows as `scripts/hand-patterns.js`, without the header line. On a 400-game check its exact build matched the JS on 7,804 of 7,805 hands. `scripts/hand-patterns.js` writes Parquet with `--parquet` (needs Python with `pyarrow`) and CSV with `--csv`. `ml/data/` is gitignored.
