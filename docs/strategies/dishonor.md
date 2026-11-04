# dishonor: honors out first

This is the playbook for the **dishonor** strategy (`js/mahjong-dishonor.js`). It throws every honor first, then plays one of two hands. Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

It only uses what its seat can see, and it plays on the shared foundation in `js/mahjong-bot.js` for scoring and defense.

## Honors first

Every honor goes before any other tile: dragons, pairs and scoring winds included, even while folding. **This strategy deliberately breaks the shared rules** about keeping pairs, keeping dragons and never throwing a lone dragon nobody has shown.

The one exception is a discard that leaves the hand ready to win for the minimum. Then that discard comes first, even if it keeps an honor pair as the hand's pair.

## Concealed Straights

With no suit at 7 tiles, it plays runs only and claims nothing, not even a dragon pung. Concealed and All Sequences make 2 faan. A self-draw or a flower makes 3.

It still takes a win off a discard when the hand has the 3 faan for it, because that's as fast as a self-draw.

## Full Flush

Once one suit has 7 or more tiles, on the opening hand or later, the hand locks into that suit. If two suits qualify, it takes the one closer to ready.

- **Discards:** honors go first, then the other two suits, then spare tiles of its own suit.
- **Claims:** it takes the chow, pung or kong in its suit that brings it closest to ready, and passes anything that doesn't. It claims nothing in another suit.
- **Kongs:** it declares a kong only in its own suit, and only when that doesn't slow the hand.

There's no way back. Its tiles of that suit stay, so the lock holds to the end of the hand.

## Defense

Defense is shared with the other bots (see [lucky-cat.md](lucky-cat.md#defense)), but it only decides among the tiles left after honors and, when locked, other suits.

## How it does

In the four-strategy competition (see [the results](README.md#results-with-all-four-strategies)), it won 15.6% of hands, second to lucky-cat, but scored last at about -44 points a hand. It wins small (4.9 faan on average, no limit hands) and deals in the most (8.6% of hands), because it throws fresh honors whatever the table shows.

