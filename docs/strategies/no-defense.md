# no-defense: all attack

This is the playbook for the **no-defense** strategy (`js/mahjong-no-defense.js`). It plays to win as fast as its tiles allow, and for more when the opening hand offers it. It never folds, and it takes no account of what a discard might feed.

It only uses what its seat can see, and it plays on the shared foundation in `js/mahjong-bot.js`. It still reads the player before it to choose between close flushes, since that decides which tiles will come. It doesn't read the player after it, because that read is only about not feeding them.

## Discards

Without a lock, from first to go to last to go:

1. A lone honor with the other three copies on the table, discarded or in a meld. It can never be used.
2. A discard that leaves the hand able to win for the minimum, whatever the tile.
3. Number tiles that cost no step toward ready.
4. Lone honors, with the fewest copies left going first and honors that score going last.
5. Number tiles that cost a step.
6. A lone dragon with all three other copies unseen.
7. Honor pairs, then honor sets.

Honors wait behind everything that costs nothing, but a lone honor goes before a number tile that would cost a step. Keeping it there would slow the hand down.

## Locking onto a big hand

On any of its first 8 turns, it checks for 8 tiles of a hand worth 7 faan or more. Melds count as 3 tiles.

| Hand | Tiles that count |
| --- | --- |
| Full Flush, or Nine Gates | One suit |
| Thirteen Orphans | One of each kind, plus one pair |
| All Honors, as sets or pairs | Honors |
| All Terminals, as sets or pairs | 1s and 9s |
| Mixed Orphans, as sets or pairs, when it's worth 7 | 1s, 9s and honors |
| Four Winds | Winds |
| Three Dragons, when it's worth 7 | Dragons |

If more than one qualifies, it takes the highest of faan less 1.25 for each step away. Half Flush and Seven Pairs alone are worth less than 7, so they don't lock.

Once locked, other number tiles go first, then honors outside the hand. The hand's own tiles go only when nothing else is left. A win that's offered is always taken, even on a smaller hand than the one it locked onto. The exceptions to keeping the tiles:

- A lone honor with no copies left still goes first, unless the hand is Thirteen Orphans, which needs it.
- On a hand of sets, a lone tile with no copies left goes along with the tiles outside the hand.

The lock ends only when the hand can't be won: it has fewer than 8 of the tiles, a meld rules it out, no tile would help, or the wall is too short. It can lock again on a later turn only within the first 8. A saved game replays the bots' turns, so they come back on the same lock. The coach's read of your own hand isn't saved, so after a reload it's read again from your tiles, and past turn 8 that can differ.

## Claims

Without a lock, it takes any chow, pung or kong that brings the hand closer and can still reach 3 faan. With a lock, it claims only that hand's tiles, and only when that brings the hand closer. Thirteen Orphans and hands of pairs claim nothing but a win.
