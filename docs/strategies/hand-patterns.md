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

- **Faan a game** and **Points a game:** the faan and points a player collected in one game from wins that scored the pattern, as the mean and the median over all 400,000. A game where the player didn't win with the pattern counts as 0. The faan is the whole win's, every other pattern of it included.
- **Games a player scores it:** the share of games in which a player won at least once with the pattern. Below 50%, the median is 0: in most games a player doesn't score it at all.
- **Win rate per hand:** the share of all 1,949,960 hands that ended in a win scoring the pattern, by anyone.
- **Points** are what the winner collected, before anything paid elsewhere in the game. They double with each faan (8 at 3 faan, 8,192 at the 13-faan limit), so a few big wins pull the means up. **Any win** is every win, whatever its pattern: a player's total from winning, a game.
- The data record how hands ended, not what a player was aiming for. These are the values a player gets from each pattern at this table, not the odds of finishing it once going for it. A win can score more than one hand pattern, so the rows overlap.

### Sorted by points a game

| Pattern | Its own faan | Win rate per hand | Games a player scores it | Faan a game: mean | Faan a game: median | Points a game: mean | Points a game: median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Any win** |  | 1,301,137 (66.73%) | 360,930 (90.2%) | 18.40 | 17.00 | 2297.3 | 368 |
| Thirteen Orphans | 13 | 26,121 (1.34%) | 24,944 (6.2%) | 0.85 | 0 | 806.7 | 0 |
| Concealed Triplets | 10 | 35,415 (1.82%) | 33,410 (8.4%) | 1.04 | 0 | 624.9 | 0 |
| Full Flush | 7 | 269,568 (13.82%) | 177,995 (44.5%) | 5.57 | 0 | 533.4 | 0 |
| Half Flush | 3 | 461,142 (23.65%) | 231,981 (58.0%) | 5.75 | 4.00 | 327.8 | 16 |
| All Triplets | 3 | 197,087 (10.11%) | 142,635 (35.7%) | 2.92 | 0 | 323.3 | 0 |
| All Sequences | 1 | 158,526 (8.13%) | 116,795 (29.2%) | 1.98 | 0 | 125.3 | 0 |
| Mixed Orphans | 1 | 15,722 (0.81%) | 15,353 (3.8%) | 0.30 | 0 | 76.3 | 0 |
| All Honors | 10 | 2,098 (0.11%) | 2,094 (0.5%) | 0.068 | 0 | 61.7 | 0 |
| Small Three Dragons | 5 | 3,126 (0.16%) | 3,119 (0.8%) | 0.082 | 0 | 46.2 | 0 |
| Seven Pairs | 4 | 167,874 (8.61%) | 132,940 (33.2%) | 2.16 | 0 | 43.6 | 0 |
| Big Three Dragons | 8 | 1,103 (0.057%) | 1,101 (0.3%) | 0.034 | 0 | 28.3 | 0 |
| Small Four Winds | 6 | 402 (0.021%) | 402 (0.1%) | 0.013 | 0 | 10.6 | 0 |
| Big Four Winds | 13 | 109 (0.006%) | 109 (0.027%) | 0.004 | 0 | 3.3 | 0 |
| Nine Gates | 13 | 101 (0.005%) | 101 (0.025%) | 0.003 | 0 | 3.0 | 0 |
| Chicken Hand | 0 | 40,605 (2.08%) | 36,908 (9.2%) | 0.31 | 0 | 2.7 | 0 |
| All Terminals | 10 | 215 (0.011%) | 215 (0.054%) | 0.006 | 0 | 2.3 | 0 |
| Four Quads | 13 | 2 (0.000%) | 2 (0.001%) | 0.000 | 0 | 0.1 | 0 |

### Sorted by faan a game

| Pattern | Its own faan | Win rate per hand | Games a player scores it | Faan a game: mean | Faan a game: median | Points a game: mean | Points a game: median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Any win** |  | 1,301,137 (66.73%) | 360,930 (90.2%) | 18.40 | 17.00 | 2297.3 | 368 |
| Half Flush | 3 | 461,142 (23.65%) | 231,981 (58.0%) | 5.75 | 4.00 | 327.8 | 16 |
| Full Flush | 7 | 269,568 (13.82%) | 177,995 (44.5%) | 5.57 | 0 | 533.4 | 0 |
| All Triplets | 3 | 197,087 (10.11%) | 142,635 (35.7%) | 2.92 | 0 | 323.3 | 0 |
| Seven Pairs | 4 | 167,874 (8.61%) | 132,940 (33.2%) | 2.16 | 0 | 43.6 | 0 |
| All Sequences | 1 | 158,526 (8.13%) | 116,795 (29.2%) | 1.98 | 0 | 125.3 | 0 |
| Concealed Triplets | 10 | 35,415 (1.82%) | 33,410 (8.4%) | 1.04 | 0 | 624.9 | 0 |
| Thirteen Orphans | 13 | 26,121 (1.34%) | 24,944 (6.2%) | 0.85 | 0 | 806.7 | 0 |
| Chicken Hand | 0 | 40,605 (2.08%) | 36,908 (9.2%) | 0.31 | 0 | 2.7 | 0 |
| Mixed Orphans | 1 | 15,722 (0.81%) | 15,353 (3.8%) | 0.30 | 0 | 76.3 | 0 |
| Small Three Dragons | 5 | 3,126 (0.16%) | 3,119 (0.8%) | 0.082 | 0 | 46.2 | 0 |
| All Honors | 10 | 2,098 (0.11%) | 2,094 (0.5%) | 0.068 | 0 | 61.7 | 0 |
| Big Three Dragons | 8 | 1,103 (0.057%) | 1,101 (0.3%) | 0.034 | 0 | 28.3 | 0 |
| Small Four Winds | 6 | 402 (0.021%) | 402 (0.1%) | 0.013 | 0 | 10.6 | 0 |
| All Terminals | 10 | 215 (0.011%) | 215 (0.054%) | 0.006 | 0 | 2.3 | 0 |
| Big Four Winds | 13 | 109 (0.006%) | 109 (0.027%) | 0.004 | 0 | 3.3 | 0 |
| Nine Gates | 13 | 101 (0.005%) | 101 (0.025%) | 0.003 | 0 | 3.0 | 0 |
| Four Quads | 13 | 2 (0.000%) | 2 (0.001%) | 0.000 | 0 | 0.1 | 0 |

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

Each strategy's wins at each total faan, and their share of its wins.

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
- **Half Flush is the most common winning hand** (23.6% of all hands): a player scores it in 58.0% of games, for 327.8 points a game on average. **Full Flush** wins fewer hands (13.8%) but is worth 533.4 points a game. Of all hand patterns, **Thirteen Orphans** is worth the most points a game (806.7).
- **Medians are 0 for most patterns**, since a player scores them in fewer than half its games. Only Half Flush has a median above 0. Winning at all, with any pattern, is worth a median of 368 points a game against a mean of 2,297, because a few big wins carry the mean.
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
