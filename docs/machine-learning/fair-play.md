# Fair play

A model that could see the wall or another player's hand would play brilliantly and teach nothing. The rule is the same for every strategy, learned or not: **a seat decides only on what that seat could see at a real table.**

## Contents

- [What a seat can see](#what-a-seat-can-see)
- [How the code keeps to it](#how-the-code-keeps-to-it)
- [The test](#the-test)
  - [Checking the checker](#checking-the-checker)
  - [What it found](#what-it-found)
- [Training with the hidden tiles (Suphx), and why the game never sees them](#training-with-the-hidden-tiles-suphx-and-why-the-game-never-sees-them)
- [Adding a strategy or a feature](#adding-a-strategy-or-a-feature)

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

**In this section:** [Checking the checker](#checking-the-checker) · [What it found](#what-it-found)

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

## Training with the hidden tiles (Suphx), and why the game never sees them

Since the Suphx work, training can record what a seat *can't* see beside what it can: the other players' concealed tiles, their waits, the wall, and what each discard would pay right now (`scripts/ml/oracle.js`, `lucky.js generate --oracle`). It is used in three ways, and only the first two reach a model that ships:

- **As labels.** A hand's real ending was always the only thing from the future a model learned from. The hidden tiles are labels of the same kind: the model is graded on predicting them from what its seat can see (is that player ready, which tiles would complete their hand, what's in the wall). Predicting the hidden tiles is what a strong player does; reading them is cheating. The shipped network's inputs are unchanged.
- **As a teacher.** The oracle knows which discards would deal in right now; a teacher pushes those down in the champion's choices, and the shipped network, reading only its seat, is fitted to the teacher.
- **As inputs, in training only (oracle guiding).** A training-time model can read the hidden tiles while it learns, with those inputs faded to zero before it is written out without them. Such a model carries `meta.oracle` and a first layer wider than the seat's features.

What keeps the game honest:

- The game sets no hook: `js/mahjong-lucky-cat-ml.js` takes an optional `features` function that only `scripts/ml/lucky.js` ever passes. `scripts/ml/` is never loaded by any page or by the offline cache, and a test checks every page's `<script>` tags and the cache's list.
- `scripts/ml/ship.js` refuses any model whose first layer reads more than the seat's features or that is marked `meta.oracle`.
- `js/mahjong-fair-play.test.js` checks the shipped Lucky Cat and Neural Cat weights read exactly their seat's features, and plants a Lucky Cat that plays through the oracle hook to prove the shuffle test catches it.
- The oracle's own test (`scripts/ml/oracle.test.js`) checks it reads the hidden tiles correctly, so a label is never wrong, and that `ship` refuses an oracle model.

Any search at play (the plan's phase 4) is bound by the same test: it must build the worlds it plays out from the seat's view and the model's beliefs, never from the game's hidden state, and its decision must be unchanged when the hidden tiles are shuffled.

## Adding a strategy or a feature

- Read opponents through `shownMelds`, `E.unseenCounts` and the pond, never through their `hand` or concealed melds.
- Don't read `game.seed`, `game.rng`, `game.hand.moves`, `game.hand.trace` or `game.hand.wall` (its length, through `ctx.wallLeft`, is fine).
- Run `npm test`. A new strategy in `S.ids()` is covered by the fair-play test automatically.
