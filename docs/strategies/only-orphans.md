# only-orphans: one hand, every hand

This is the playbook for the **only-orphans** strategy (`js/mahjong-only-orphans.js`). It goes for Thirteen Orphans on every hand and plays as long as that has a real chance. After that, it finishes on a hand made from the same 1s, 9s and honors. Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

It only uses what its seat can see, and it plays on the shared foundation in `js/mahjong-bot.js`, so it defends like the other bots and keeps the shared rules, like never throwing a lone dragon nobody has shown.

## Thirteen Orphans

From the first discard:

- Every tile that isn't a 1, a 9 or an honor goes first.
- Spare copies of 1s, 9s and honors go next. One pair is kept, since the hand needs it.
- Nothing is claimed, and no kong is declared. It still takes a win.

## When it gives up

It stops playing Thirteen Orphans in any of these cases:

- **A tile it needs has run out.** All four copies of a missing 1, 9 or honor are on the table.
- **The odds are too low.** After its first six discards, it gives up if its chance of finishing falls under about 1 in 1,000.

The odds are worked out a go-around at a time from the copies still unseen and the tiles left in the wall. Each missing kind and the pair is one step. Once the hand is ready, its wait can also come from any of three discards.

| Kinds still missing, plus the pair | 84 left | 60 left | 45 left | 32 left | 20 left |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 | 1.4% | 0.57% | 0.14% | 0.01% | 0% |
| 6 | 3.3% | 1.6% | 0.58% | 0.12% | 0% |
| 5 | 7.2% | 4.3% | 2.1% | 0.74% | 0% |
| 4 | 15% | 11% | 6.3% | 3.3% | 0.48% |
| 3 | 30% | 24% | 17% | 12% | 4.3% |

These are estimates. They don't count the chance that someone else wins first, so the real odds are lower.

The check runs again every turn and keeps no memory, so a good draw can bring the hand back to Thirteen Orphans if it's still alive and hasn't declared a meld.

## The hands it pivots to

Each turn it weighs these and plays the one with the best odds for what it pays:

| Hand | Made of | Claims |
| --- | --- | --- |
| Mixed Orphans | Triplets of 1s, 9s and honors | Pungs and kongs of those tiles |
| All Terminals | Triplets of 1s and 9s | Pungs and kongs of those tiles |
| All Honors | Triplets of honors | Pungs and kongs of those tiles |
| Seven Pairs with Mixed Orphans | Pairs of 1s, 9s and honors | None |
| Seven Pairs in All Terminals | Pairs of 1s and 9s | None |
| Seven Pairs in All Honors | Pairs of honors | None |

A limit hand counts for more than Mixed Orphans, but `valuePower` 0.5 keeps it from being chosen from many steps further away.

It never chows. It stays on these hands even when too few draws are left to fill one, and then safety decides the discard. The usual hands are only a fallback if none of these can be made, which its own claims shouldn't allow.

## Defense

Defense is shared with the other bots (see [lucky-cat.md](lucky-cat.md#defense)). While it folds, tiles other than 1s, 9s and honors still go first, the safest of them first.

## How it does

This is a character, not the strongest bot. In a check of 300 hands, one only-orphans seat against three lucky-cat bots won 7 hands (2.3%), 4 of them Thirteen Orphans. Five of the seven wins were limit hands or close to it. On average it gave up Thirteen Orphans around its ninth discard, and in about 1 hand in 7 it never did.
