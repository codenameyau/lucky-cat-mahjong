# Hand patterns: what each strategy wins with

How often each scoring pattern appears in the hands each strategy wins, over **40,000 games**: 10,000 for each strategy. The game plays each learned strategy's model as of game 0.61.9: Neural Cat NC10, Lucky Cat LC34 and Only Orphans OW1.

## Contents

- [How it was measured](#how-it-was-measured)
- [Games and wins](#games-and-wins)
- [Hand patterns](#hand-patterns)
- [Sets of honors](#sets-of-honors)
- [Bonuses](#bonuses)
- [Each strategy](#each-strategy)
- [What it shows](#what-it-shows)
- [Reproducing it](#reproducing-it)

## How it was measured

- **Each strategy plays a table of four copies of itself.** Every lineage is measured only against its own kind, the same rule its training follows, so no strategy's numbers depend on another's style. Comparing them at one table together is a later phase.
- **10,000 games a strategy**, deal seeds 7,100,001 to 7,110,000, the same deals for every strategy. A game here is one hand of mahjong, played to a win or a draw.
- **Engine:** the game's own JS engine and scoring (`npm run compete`), full-spicy payouts, and the contradiction check on, as in the game.
- **What a pattern count means:** a winning hand usually scores several patterns at once (for example Half Flush + Dragon Triplet + Self-Draw). Each pattern's count is the number of winning hands that scored it, and its percentage is its share of that strategy's wins. **The percentages add up to more than 100%.**
- **Patterns are grouped** into hand patterns (what the hand is), sets of honors (a pung or kong of a dragon or a scoring wind), and bonuses (how it was won, and flowers). The faan column is what the pattern adds (`js/points.js`). A hand needs 3 faan to win, and 13 is the limit.

## Games and wins

| Strategy | Model | Games played | Seats played (4 a game) | Wins | Win rate (a seat's share of games won) | Average faan a win | Limit hands (% of wins) | Games with no winner |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Jorge Yau](jorge-yau.md) | Rules only | 10,000 | 40,000 | 6,644 | 16.6% | 5.14 | 136 (2.0%) | 3,356 (33.6%) |
| [Neural Cat](neural-cat.md) | NC10 | 10,000 | 40,000 | 6,765 | 16.9% | 5.76 | 226 (3.3%) | 3,235 (32.4%) |
| [Lucky Cat](lucky-cat.md) | LC34 | 10,000 | 40,000 | 8,939 | 22.3% | 5.57 | 40 (0.4%) | 1,061 (10.6%) |
| [Only Orphans](only-orphans.md) | OW1 | 10,000 | 40,000 | 1,537 | 3.8% | 7.74 | 302 (19.6%) | 8,463 (84.6%) |
| **All four** | | **40,000** | **160,000** | **23,885** | **14.9%** | 5.64 | 704 (2.9%) | 16,115 (40.3%) |

A game has one winner or none, so a strategy's wins plus its games with no winner make its games played.

## Hand patterns

What the winning hand is. Most of the time a hand scores one of these and sometimes two (a Full Flush that is also All Triplets).

| Pattern | Faan | What it is | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Half Flush** | 3 | One suit plus honors | 9,358 | 39.2% | 1,742 | 26.2% | 1,994 | 29.5% | 5,499 | 61.5% | 123 | 8.0% |
| **Full Flush** | 7 | Every tile from one suit | 4,324 | 18.1% | 1,036 | 15.6% | 1,685 | 24.9% | 1,603 | 17.9% | 0 | 0.0% |
| **All Triplets** | 3 | Four pungs and a pair | 3,772 | 15.8% | 982 | 14.8% | 719 | 10.6% | 2,071 | 23.2% | 0 | 0.0% |
| **Seven Pairs** | 4 | Seven different pairs | 2,810 | 11.8% | 820 | 12.3% | 754 | 11.1% | 251 | 2.8% | 985 | 64.1% |
| **All Sequences** | 1 | Four chows and a pair (no pungs) | 2,758 | 11.5% | 1,005 | 15.1% | 1,507 | 22.3% | 242 | 2.7% | 4 | 0.3% |
| **Chicken Hand** | 0 | A complete hand with no other hand pattern | 806 | 3.4% | 509 | 7.7% | 244 | 3.6% | 51 | 0.6% | 2 | 0.1% |
| **Concealed Triplets** | 10 | All pungs, none claimed | 653 | 2.7% | 87 | 1.3% | 199 | 2.9% | 52 | 0.6% | 315 | 20.5% |
| **Thirteen Orphans** | Limit (13) | One of each 1, 9, wind and dragon, plus a pair of any of them | 454 | 1.9% | 92 | 1.4% | 167 | 2.5% | 0 | 0.0% | 195 | 12.7% |
| **Mixed Orphans** | 1 | Only 1s, 9s and honors (on top of its other patterns) | 271 | 1.1% | 98 | 1.5% | 47 | 0.7% | 49 | 0.5% | 77 | 5.0% |
| **Small Three Dragons** | 5 | Two dragon pungs and a pair of the third | 68 | 0.3% | 16 | 0.2% | 19 | 0.3% | 30 | 0.3% | 3 | 0.2% |
| **All Honors** | 10 | Every tile a wind or dragon | 40 | 0.2% | 12 | 0.2% | 7 | 0.1% | 18 | 0.2% | 3 | 0.2% |
| **Big Three Dragons** | 8 | Pungs of all three dragons | 32 | 0.1% | 5 | 0.1% | 8 | 0.1% | 17 | 0.2% | 2 | 0.1% |
| **Small Four Winds** | 6 | Three wind pungs and a pair of the fourth | 10 | 0.0% | 2 | 0.0% | 4 | 0.1% | 4 | 0.0% | 0 | 0.0% |
| **All Terminals** | 10 | Every tile a 1 or a 9 | 4 | 0.0% | 2 | 0.0% | 2 | 0.0% | 0 | 0.0% | 0 | 0.0% |
| **Big Four Winds** | Limit (13) | Pungs of all four winds | 4 | 0.0% | 3 | 0.0% | 0 | 0.0% | 0 | 0.0% | 1 | 0.1% |
| **Nine Gates** | Limit (13) | 1112345678999 of one suit, plus any tile of it | 2 | 0.0% | 2 | 0.0% | 0 | 0.0% | 0 | 0.0% | 0 | 0.0% |

## Sets of honors

A pung or kong of a dragon or a scoring wind, each worth faan on its own, on top of the hand pattern.

| Pattern | Faan | What it is | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Dragon Triplet** | 1 each | A pung of a dragon | 5,743 | 24.0% | 1,444 | 21.7% | 1,111 | 16.4% | 3,052 | 34.1% | 136 | 8.8% |
| **Seat Wind** | 1 | A pung of the seat's own wind | 1,585 | 6.6% | 394 | 5.9% | 315 | 4.7% | 829 | 9.3% | 47 | 3.1% |
| **Round Wind** | 1 | A pung of the round's wind | 1,577 | 6.6% | 394 | 5.9% | 294 | 4.3% | 854 | 9.6% | 35 | 2.3% |
| **Seat and Round Wind** | 2 | A pung of a wind that is both the seat's and the round's | 595 | 2.5% | 176 | 2.6% | 119 | 1.8% | 290 | 3.2% | 10 | 0.7% |
| **Dragon Quad** | 1 each | A kong of a dragon | 390 | 1.6% | 37 | 0.6% | 27 | 0.4% | 322 | 3.6% | 4 | 0.3% |

## Bonuses

How the hand was won, and the flowers and seasons it holds.

| Pattern | Faan | What it is | **All four: wins** | **% of all wins** | Jorge Yau: wins | % | Neural Cat: wins | % | Lucky Cat: wins | % | Only Orphans: wins | % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Self-Draw** | 1 | Winning on a tile drawn from the wall | 7,305 | 30.6% | 2,420 | 36.4% | 2,169 | 32.1% | 1,982 | 22.2% | 734 | 47.8% |
| **Seat Flower** | 1 | The flower that matches the seat | 5,176 | 21.7% | 1,544 | 23.2% | 1,458 | 21.6% | 1,803 | 20.2% | 371 | 24.1% |
| **Seat Season** | 1 | The season that matches the seat | 5,016 | 21.0% | 1,522 | 22.9% | 1,420 | 21.0% | 1,745 | 19.5% | 329 | 21.4% |
| **No Flowers** | 1 | No flowers or seasons | 4,565 | 19.1% | 1,274 | 19.2% | 1,346 | 19.9% | 1,700 | 19.0% | 245 | 15.9% |
| **Concealed** | 1 | No claimed meld, winning off a discard | 3,955 | 16.6% | 2,186 | 32.9% | 1,542 | 22.8% | 186 | 2.1% | 41 | 2.7% |
| **Win on Last Tile** | 1 | Winning on the last tile of the wall | 398 | 1.7% | 152 | 2.3% | 98 | 1.4% | 90 | 1.0% | 58 | 3.8% |
| **Win by Kong** | 1 | Winning on the replacement tile after a kong | 118 | 0.5% | 30 | 0.5% | 22 | 0.3% | 65 | 0.7% | 1 | 0.1% |
| **Seven Robbing One** | 5 | Seven of the eight flowers and seasons, robbing the eighth | 62 | 0.3% | 15 | 0.2% | 12 | 0.2% | 11 | 0.1% | 24 | 1.6% |
| **Four Seasons** | 2 | All four seasons | 57 | 0.2% | 21 | 0.3% | 20 | 0.3% | 13 | 0.1% | 3 | 0.2% |
| **Four Flowers** | 2 | All four flowers | 51 | 0.2% | 19 | 0.3% | 17 | 0.3% | 12 | 0.1% | 3 | 0.2% |
| **Robbing the Kong** | 1 | Winning on the tile another player adds to a pung | 34 | 0.1% | 9 | 0.1% | 6 | 0.1% | 19 | 0.2% | 0 | 0.0% |
| **Earthly Hand** | Limit (13) | A player wins on the dealer's first discard | 3 | 0.0% | 0 | 0.0% | 1 | 0.0% | 1 | 0.0% | 1 | 0.1% |
| **Win by Double Kong** | 8 | Winning on the replacement after two kongs in a row | 2 | 0.0% | 1 | 0.0% | 1 | 0.0% | 0 | 0.0% | 0 | 0.0% |

## Each strategy

Every pattern a strategy won with, most common first.

### Jorge Yau (Rules only)

10,000 games, 6,644 wins (a win rate of 16.6% a seat), 5.14 faan a win on average, 136 limit hands (2.0% of wins), 36.2% of wins self-drawn, 47.9% with no claimed meld. [Its playbook](jorge-yau.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Self-Draw | 1 | 2,420 | 36.4% |
| Concealed | 1 | 2,186 | 32.9% |
| Half Flush | 3 | 1,742 | 26.2% |
| Seat Flower | 1 | 1,544 | 23.2% |
| Seat Season | 1 | 1,522 | 22.9% |
| Dragon Triplet | 1 each | 1,444 | 21.7% |
| No Flowers | 1 | 1,274 | 19.2% |
| Full Flush | 7 | 1,036 | 15.6% |
| All Sequences | 1 | 1,005 | 15.1% |
| All Triplets | 3 | 982 | 14.8% |
| Seven Pairs | 4 | 820 | 12.3% |
| Chicken Hand | 0 | 509 | 7.7% |
| Round Wind | 1 | 394 | 5.9% |
| Seat Wind | 1 | 394 | 5.9% |
| Seat and Round Wind | 2 | 176 | 2.6% |
| Win on Last Tile | 1 | 152 | 2.3% |
| Mixed Orphans | 1 | 98 | 1.5% |
| Thirteen Orphans | Limit (13) | 92 | 1.4% |
| Concealed Triplets | 10 | 87 | 1.3% |
| Dragon Quad | 1 each | 37 | 0.6% |
| Win by Kong | 1 | 30 | 0.5% |
| Four Seasons | 2 | 21 | 0.3% |
| Four Flowers | 2 | 19 | 0.3% |
| Small Three Dragons | 5 | 16 | 0.2% |
| Seven Robbing One | 5 | 15 | 0.2% |
| All Honors | 10 | 12 | 0.2% |
| Robbing the Kong | 1 | 9 | 0.1% |
| Big Three Dragons | 8 | 5 | 0.1% |
| Big Four Winds | Limit (13) | 3 | 0.0% |
| All Terminals | 10 | 2 | 0.0% |
| Nine Gates | Limit (13) | 2 | 0.0% |
| Small Four Winds | 6 | 2 | 0.0% |
| Win by Double Kong | 8 | 1 | 0.0% |

### Neural Cat (NC10)

10,000 games, 6,765 wins (a win rate of 16.9% a seat), 5.76 faan a win on average, 226 limit hands (3.3% of wins), 31.9% of wins self-drawn, 39.3% with no claimed meld. [Its playbook](neural-cat.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Self-Draw | 1 | 2,169 | 32.1% |
| Half Flush | 3 | 1,994 | 29.5% |
| Full Flush | 7 | 1,685 | 24.9% |
| Concealed | 1 | 1,542 | 22.8% |
| All Sequences | 1 | 1,507 | 22.3% |
| Seat Flower | 1 | 1,458 | 21.6% |
| Seat Season | 1 | 1,420 | 21.0% |
| No Flowers | 1 | 1,346 | 19.9% |
| Dragon Triplet | 1 each | 1,111 | 16.4% |
| Seven Pairs | 4 | 754 | 11.1% |
| All Triplets | 3 | 719 | 10.6% |
| Seat Wind | 1 | 315 | 4.7% |
| Round Wind | 1 | 294 | 4.3% |
| Chicken Hand | 0 | 244 | 3.6% |
| Concealed Triplets | 10 | 199 | 2.9% |
| Thirteen Orphans | Limit (13) | 167 | 2.5% |
| Seat and Round Wind | 2 | 119 | 1.8% |
| Win on Last Tile | 1 | 98 | 1.4% |
| Mixed Orphans | 1 | 47 | 0.7% |
| Dragon Quad | 1 each | 27 | 0.4% |
| Win by Kong | 1 | 22 | 0.3% |
| Four Seasons | 2 | 20 | 0.3% |
| Small Three Dragons | 5 | 19 | 0.3% |
| Four Flowers | 2 | 17 | 0.3% |
| Seven Robbing One | 5 | 12 | 0.2% |
| Big Three Dragons | 8 | 8 | 0.1% |
| All Honors | 10 | 7 | 0.1% |
| Robbing the Kong | 1 | 6 | 0.1% |
| Small Four Winds | 6 | 4 | 0.1% |
| All Terminals | 10 | 2 | 0.0% |
| Earthly Hand | Limit (13) | 1 | 0.0% |
| Win by Double Kong | 8 | 1 | 0.0% |

### Lucky Cat (LC34)

10,000 games, 8,939 wins (a win rate of 22.3% a seat), 5.57 faan a win on average, 40 limit hands (0.4% of wins), 22.0% of wins self-drawn, 5.4% with no claimed meld. [Its playbook](lucky-cat.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Half Flush | 3 | 5,499 | 61.5% |
| Dragon Triplet | 1 each | 3,052 | 34.1% |
| All Triplets | 3 | 2,071 | 23.2% |
| Self-Draw | 1 | 1,982 | 22.2% |
| Seat Flower | 1 | 1,803 | 20.2% |
| Seat Season | 1 | 1,745 | 19.5% |
| No Flowers | 1 | 1,700 | 19.0% |
| Full Flush | 7 | 1,603 | 17.9% |
| Round Wind | 1 | 854 | 9.6% |
| Seat Wind | 1 | 829 | 9.3% |
| Dragon Quad | 1 each | 322 | 3.6% |
| Seat and Round Wind | 2 | 290 | 3.2% |
| Seven Pairs | 4 | 251 | 2.8% |
| All Sequences | 1 | 242 | 2.7% |
| Concealed | 1 | 186 | 2.1% |
| Win on Last Tile | 1 | 90 | 1.0% |
| Win by Kong | 1 | 65 | 0.7% |
| Concealed Triplets | 10 | 52 | 0.6% |
| Chicken Hand | 0 | 51 | 0.6% |
| Mixed Orphans | 1 | 49 | 0.5% |
| Small Three Dragons | 5 | 30 | 0.3% |
| Robbing the Kong | 1 | 19 | 0.2% |
| All Honors | 10 | 18 | 0.2% |
| Big Three Dragons | 8 | 17 | 0.2% |
| Four Seasons | 2 | 13 | 0.1% |
| Four Flowers | 2 | 12 | 0.1% |
| Seven Robbing One | 5 | 11 | 0.1% |
| Small Four Winds | 6 | 4 | 0.0% |
| Earthly Hand | Limit (13) | 1 | 0.0% |

### Only Orphans (OW1)

10,000 games, 1,537 wins (a win rate of 3.8% a seat), 7.74 faan a win on average, 302 limit hands (19.6% of wins), 46.2% of wins self-drawn, 99.9% with no claimed meld. [Its playbook](only-orphans.md).

| Pattern | Faan | Wins | % of its wins |
| --- | --- | ---: | ---: |
| Seven Pairs | 4 | 985 | 64.1% |
| Self-Draw | 1 | 734 | 47.8% |
| Seat Flower | 1 | 371 | 24.1% |
| Seat Season | 1 | 329 | 21.4% |
| Concealed Triplets | 10 | 315 | 20.5% |
| No Flowers | 1 | 245 | 15.9% |
| Thirteen Orphans | Limit (13) | 195 | 12.7% |
| Dragon Triplet | 1 each | 136 | 8.8% |
| Half Flush | 3 | 123 | 8.0% |
| Mixed Orphans | 1 | 77 | 5.0% |
| Win on Last Tile | 1 | 58 | 3.8% |
| Seat Wind | 1 | 47 | 3.1% |
| Concealed | 1 | 41 | 2.7% |
| Round Wind | 1 | 35 | 2.3% |
| Seven Robbing One | 5 | 24 | 1.6% |
| Seat and Round Wind | 2 | 10 | 0.7% |
| All Sequences | 1 | 4 | 0.3% |
| Dragon Quad | 1 each | 4 | 0.3% |
| All Honors | 10 | 3 | 0.2% |
| Four Flowers | 2 | 3 | 0.2% |
| Four Seasons | 2 | 3 | 0.2% |
| Small Three Dragons | 5 | 3 | 0.2% |
| Big Three Dragons | 8 | 2 | 0.1% |
| Chicken Hand | 0 | 2 | 0.1% |
| Big Four Winds | Limit (13) | 1 | 0.1% |
| Earthly Hand | Limit (13) | 1 | 0.1% |
| Win by Kong | 1 | 1 | 0.1% |

## What it shows

- **Lucky Cat wins the most, with Half Flush and dragons.** It wins 22.3% of its seats, and 61.5% of its wins are Half Flush, 34.1% have a dragon pung and 23.2% are All Triplets. Only 2.1% of its wins are concealed: it claims freely to finish fast, which fits its aim of the most hands won.
- **Neural Cat and Jorge Yau win about as often, Neural Cat more with flushes and sequences.** Neural Cat builds on Jorge Yau's hand reading. Their win rates are within noise of each other (16.9% against 16.6%), but Neural Cat's wins are bigger (5.76 faan against 5.14), with more Full Flushes (24.9% against 15.6%) and All Sequences (22.3% against 15.1%), and far fewer Chicken Hands (3.6% against 7.7%).
- **Only Orphans wins rarely and big.** It wins 3.8% of its seats, and 84.6% of its games end with no winner. Its wins are Seven Pairs (64.1%), Concealed Triplets (20.5%) and Thirteen Orphans (12.7%), with 19.6% of them limit hands: its aim is the biggest hands.
- **Self-draws.** Only Orphans self-draws 47.8% of its wins, since it claims almost nothing; Lucky Cat 22.2%.
- **Flowers are luck.** Seat Flower, Seat Season and No Flowers each come up in about a fifth of every strategy's wins, as the deal hands them out.
- **At a table of itself.** These numbers are each strategy against three copies of itself. Against the other strategies, at the game's mixed tables, every rate would differ: a fast table leaves less time for big hands.

## Reproducing it

```bash
npm run compete -- --lineup jorge-yau,jorge-yau,jorge-yau,jorge-yau --deals 10000 --seed 7100001 --json jorge-yau.json
npm run compete -- --lineup neural-cat,neural-cat,neural-cat,neural-cat --deals 10000 --seed 7100001 --json neural-cat.json
npm run compete -- --lineup lucky-cat,lucky-cat,lucky-cat,lucky-cat --deals 10000 --seed 7100001 --json lucky-cat.json
npm run compete -- --lineup only-orphans,only-orphans,only-orphans,only-orphans --deals 10000 --seed 7100001 --json only-orphans.json
```

Each report's `strategies.<id>.patterns` counts the winning hands that scored each pattern. `npm run compete` plays each deal four times, once with each seat rotation; with the same strategy in every seat those four are the same game, so the counts above are each report's divided by four.
