# Fair play

A model that could see the wall or another player's hand would play brilliantly and teach nothing. The rule is the same for every strategy, learned or not: **a seat decides only on what that seat could see at a real table.**

## What a seat can see

| Visible | Hidden |
| --- | --- |
| Its own hand and melds | Every other player's hand |
| Every discard, and which were claimed | The wall, and the order of its tiles |
| Every exposed meld | Which tile another player's concealed kong is (only that they have one) |
| Every player's flowers | The game's seed and random number generator |
| How many tiles are left in the wall | The move log, and the tile another player just drew |

The game object holds all of it, so the rule is kept by how the code reads it, and checked by a test.

## How the code keeps to it

- **Unseen counts** come from `E.unseenCounts(game, seat)`: four of each tile minus the seat's hand, the pond and every exposed meld. Other players' concealed kongs aren't counted, because their tiles can't be seen.
- **Opponent reads** go through `shownMelds(s)` in `js/mahjong-bot.js`, never `s.melds`. A concealed kong counts as a meld (the table can see four face-down tiles), but its tile isn't read for suits, flushes, scoring honors or threat faan.
- **Features** for opponents count only shown melds, plus how many melds each has. The seat's own hand and melds are read in full.
- **The coach** reads opponents the same way: a flush or All Triplets is called "almost certain" only from shown melds, and never when a concealed kong could change it.
- **Labels** in training data are how each hand really ended. That's the only thing from the future a model learns from, and only in training: at the table it sees the present, like a player.

## The test

`js/mahjong-fair-play.test.js` runs with `npm test`. At real positions from whole hands, it makes every decision twice:

1. On a copy of the game.
2. On a copy where every tile the seat can't see is shuffled among the hidden places: the other hands and the wall, keeping each hand's size. Another player's concealed kong becomes a different kind of tile whose four copies were all hidden. And the hidden records become traps: reading the game's seed, its random number generator, the move log, the move trace, or another player's drawn tile throws an error.

Everything the decision says must come out exactly the same: the action, every candidate's score, every expected-points read, the claim and kong choices, and the coach's whole hint. The test covers:

- Neural Cat as played in the game, with the coach, at about 1 in 3 turns and every claim choice over three hands.
- Neural Cat in fast mode, as in simulations.
- Every table strategy (Jorge Yau, Lucky Cat, Only Orphans).
- Training features, for discards and for waiting positions.
- A direct concealed-kong case for every strategy: seat 1 declares a concealed kong, and its tile is changed.

### Checking the checker

A test that never fails proves nothing, so it also plants cheats and requires each one to be caught: a strategy that reads the next player's hand, the top of the wall, the seed, or the move log. Every one fails the check.

### What it found

When it was first run, Only Orphans' scores changed when hidden tiles moved. A tripwire on every hidden array traced it to the shared foundation: `opponentThreats`, `readCollecting`, `leftRead`, `afterRead` and `valueSlope` read the tile of an opponent's concealed kong. It affected every strategy, and only showed up when a concealed kong was on the table. Every opponent read now goes through `shownMelds`, and the coach's opponent reads were fixed the same way. The test checks that for every strategy.

## Adding a strategy or a feature

- Read opponents through `shownMelds`, `E.unseenCounts` and the pond, never through their `hand` or concealed melds.
- Don't read `game.seed`, `game.rng`, `game.hand.moves`, `game.hand.trace` or `game.hand.wall` (its length, through `ctx.wallLeft`, is fine).
- Run `npm test`. A new strategy in `S.ids()` is covered by the fair-play test automatically.
