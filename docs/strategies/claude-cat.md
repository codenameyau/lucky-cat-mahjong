# claude-cat: how the coach and the bots play

This is the playbook for the **claude-cat** strategy (`js/mahjong-bot.js`), the original bot logic. Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet). The coach says the choice in plain words. The bots play it. The other strategies are listed in [the strategies README](README.md).

Both only use what that seat can see: its own hand and flowers, every open meld, the discard pond, and how many tiles are left in the wall. They do not see the other hands or the tiles still in the wall.

A winning hand needs at least 3 faan. On a self-draw, every opponent pays. On a discard, only the player who threw the winning tile pays.

## Playing for points, not wins

The goal is the most points over many hands, not the most wins. Payouts double with every faan (3 faan pays 8, 7 faan pays 128, 10 faan pays 1,024), so a hand is valued at its real payout. A 7-faan hand is worth 16 three-faan wins, and a big hand you might deal into costs that much too.

Three things follow:

- **Bigger hands are worth building.** A concealed hand, a flush, or a dragon set adds a faan, and each faan doubles the payout. Staying concealed is often worth more than a chow that gets you one tile closer.
- **Defense counts more.** The risk of dealing in is weighed 1.5 times as heavily as before, because the hands you would pay for are the big ones.
- **Fold when you're unlikely to win.** With fewer than 45 tiles left and the hand still two or more tiles from ready, safety is weighed 1.5 times more again.

This was chosen by simulation. Each strategy played thousands of paired deals in one seat against three of the previous bots, with the previous bot playing the same deals in that seat for comparison. Across three rounds (25,000 hands for the main setting), valuing hands by their payout scored about 13 to 17 more points per hand than the old compressed scale, with about 20% fewer wins and 14% fewer deal-ins. Extra defense and the late fold added a little more and dealt in least, so they were kept.

## Hands they aim for

For each possible discard they score the hand that would be left, and they keep the hand that is closest to a win worth playing. Early in the hand, a bigger hand is worth building. Later, or when someone is showing a big hand, finishing first matters more.

The hands, in the order they come up:

- **A standard hand.** Four sets and a pair. A concealed hand is worth an extra faan.
- **Concealed All Sequences.** A concealed hand of runs, with no honors and no claims (not while the hand holds a set of honors, which can't be thrown away). The concealed faan plus All Sequences is most of the way to 3, and flowers make up the rest. A pung of a dragon, or of your own wind, or of the round wind, is still taken. Any other claim is passed.
- **Half flush.** One suit plus honors, once that suit (with honors, counting sets already made) makes up most of the hand and no meld is in another suit. Worth 3 faan on top of whatever the honors add.
- **Full flush.** One suit only, once that suit already makes up most of the hand and there is no honor meld. Worth 7 faan.
- **All Triplets.** Sets and pairs, no chows, once the hand already has several of them.
- **Concealed Triplets.** No melds yet, and at least two pungs already in hand.
- **Seven Pairs.** See below. Worth 4 faan, plus a flush when the pairs are all one suit (3 with honors, 7 without). The hand must stay concealed.
- **Thirteen Orphans.** When the concealed hand already holds nine different terminals and honors (or eight and a pair), and none of the missing ones is used up. Worth a limit, 13 faan. Nothing is claimed, and every other tile is discarded first.
- **Nine Gates.** When one suit already holds eleven tiles of the pattern 1112345678999 (three 1s, one each of 2 through 8, three 9s). Tiles beyond those counts, and every tile of another suit, do not count. Worth a limit, 13 faan. The hand stays concealed, and anything outside that suit is discarded first.
- **A chicken hand** built on dragon and wind sets, when nothing above is close. It still needs another faan from flowers or from a dragon or wind pung.

A ready hand is scored exactly. Each wait is checked against the real faan table, including waits that only win on a self-draw and waits that can never reach 3 faan.

## What gets discarded first

When several discards are legal, they are taken in this order. A later group is used only when nothing in an earlier group can be thrown without leaving the hand further from ready. Keeping a pair or a dragon never costs a step: if every tile in an earlier group would slow the hand down, a tile from a later group that doesn't goes first.

While the hand is folding (see Defense), safety decides instead, and this order only breaks ties between equally safe tiles. The one exception is group 1 below: after a chow, tiles of other suits still go first. Breaking a safe pair is the right play then.

1. **Tiles from a suit you no longer need.** Once the hand is clearly going for one suit (at least 8 of its tiles in that suit and at least 10 counting honors, with sets already made counting), every number tile of the other two suits is thrown first. After you chow, a mixed hand cannot reach 3 faan, so the hand commits to the chow's suit (honors can stay, for a half flush). Every tile of another suit is thrown first, including pairs, every time, whatever faan the hand already has from flowers or honor sets. Even while folding, these go first (the safest of them first). The only exception is when the open melds already cover two number suits, since no flush is possible then.
2. **A tile someone has already Punged or Konged**, when the hand does not need it. See below.
3. **Ordinary tiles.** Singles and the spare tile from a triplet, chosen by which one leaves the hand closest to a good win.
4. **Pairs.** A pair is kept until the tiles above are gone. Keeping it leaves a later pung, a chow, or Seven Pairs open.
5. **A dragon that none of the table has shown yet.** This is kept even longer than a normal pair.

**Honors early in the hand.** While more than 60 tiles are left in the wall, an honor that can still become a set (fewer than two copies on the table) is one of the hand's most valuable tiles. A single one waits like a pair (group 4). A dragon, or your own or the round's wind, waits longer still (group 5), and a pair of them longest. Honors are only let go early once two copies are out, or when the hand is on Seven Pairs, which only needs its pairs.

One hand changes this order:

- **All Triplets** (or Concealed Triplets) keeps every pair and every pung. Both wait behind any single, and a finished pung waits behind a pair. Within each group, the tile with the fewest copies left (not yet seen by you) goes first, and the tiles with the most left are kept, because they're the ones that can still become sets. A risky tile still waits. Near the end of the hand, safety comes first and then how many are left.

## Pairs

A pair is two concealed copies of the same tile, not three. Three is a pung. The spare from a pung can be thrown. The pair itself waits.

The exception is the chow above. Once the hand is committed to one suit, pairs in the other suits are discarded with those suits, because they can no longer be used.

## Dragons

Red, Green, and White Dragon are kept until at least one copy of that dragon is already on the table, either in the pond or in an open meld. Until then they are not a discard if anything else can be thrown.

After one copy is visible, a dragon is considered like any other tile. A pair of them is still kept under the pair rule. A single dragon is let go once two copies are already out, because it can no longer become a pung. Winds follow that same "two are out" rule. Dragons do not: one visible copy is enough to consider discarding a dragon, and two visible copies is when a single dragon is given up.

While the hand is going for Seven Pairs, a single dragon can be thrown after the other singles. A dragon pair is still kept.

## A punged tile

Once any player has an open pung or kong of a tile, nobody can pung the last copy or wait on it as a pair.

For an honor, that makes it completely safe: an honor can only be won as a pung or a pair. A number tile is safer but not safe, because it can still finish someone's chow. The last Five Bamboo can still complete a 4-6 or a 6-7.

If throwing that tile leaves the hand as close to ready as the best other discard, and it is not itself a pair the hand is keeping, it is the first discard.

## Thirteen Orphans

The hand switches to Thirteen Orphans when it is concealed and already holds nine different terminals and honors. One and nine of each suit, and all seven honors, are those tiles. A pair of any of them also counts once, so eight different ones and a pair is enough too. A third copy does not count, because the hand only needs one pair. Nine means the hand is at most four tiles from ready.

It is dropped if any terminal or honor the hand still lacks has all four copies on the table, because it can never be finished.

Every tile that is not a terminal or an honor is discarded first. No chow, pung, or kong is taken. An open meld makes the hand impossible.

Eight different tiles without a pair is not enough.

## Nine Gates

Nine Gates is 1112345678999 in one suit, plus any one extra tile of that suit. The hand switches to it when one suit already contains eleven of those tiles: up to three 1s, one each of 2 through 8, and up to three 9s. A second 5 does not count, because the pattern only needs one. A fourth 1 does not count either.

Short of eleven, the same tiles make a Full Flush (7 faan), which can still claim and doesn't have to throw spare copies. Going for Nine Gates earlier gives that up for a hand that is rarely finished.

The suit with the most of those tiles is the one to build, once it has reached eleven. Tiles of the other suits, honors, and spare copies are discarded first. No claim is taken. An open meld makes Nine Gates impossible.

Ten of the pattern is not enough.

If one hand qualifies for more than one of Seven Pairs, Thirteen Orphans, and Nine Gates, they play whichever of those is closer to ready.

## Seven Pairs

The hand switches to Seven Pairs when all of these are true:

- More than four concealed pairs. Five or more tiles that you hold exactly two of.
- No pung or kong in the hand. Three or four of a kind is a set, not a pair, and the hand stays on sets.
- No open meld. A chow, pung, or kong makes Seven Pairs impossible.

Shedding one tile from a pung you currently hold does not count. The hand you have right now has to already be pairs. The next turn, if that pung is gone and five pairs remain, Seven Pairs starts then.

On this plan every pair is kept, nothing is claimed, and singles are discarded first. When the pairs are all in one suit (with or without honors), the hand is also worth the flush, and the bot counts that.

## After you chow

A chow gives up the concealed-hand faan and shows what you are doing, so it is taken only when it does real work:

- it makes the hand ready for a win of at least 3 faan, or
- it builds the flush the hand is already collecting and leaves you within two tiles of ready (within one tile while more than 60 tiles are left in the wall, since early on there's still time to draw the tile instead), or
- it is late in the hand (around the ninth discard, or under 48 tiles left in the wall) and it still leaves you within two tiles of ready.

A chow that does not get you closer is passed. A Concealed All Sequences hand is not chowed or punged, except for a dragon or a wind that scores.

Once the chow is down, tiles outside that suit are thrown first, as described above.

## Dragons, winds, and kongs as claims

A pung of a dragon, or of your own wind, or of the round wind, is always taken, unless the hand is on Seven Pairs, Thirteen Orphans, or Nine Gates (a set cannot be part of those hands). The one other exception is a hand that is already ready, when the pung would leave it further from ready and worth less than waiting. Then it is weighed like any other claim.

A kong is fine at any point in the hand, early or late. It draws a free replacement tile, so it is taken whenever the hand is no worse for it. A kong of a dragon or a scoring wind is taken like the pung above. Early chows are the ones to avoid (see After you chow). A concealed kong is declared when it does not break the hand. A kong draws a replacement tile.

Other pungs and chows are taken only when the hand afterwards is clearly better than passing.

## Defense

Each opponent is read as Low, Medium, High, or Extreme from how many melds they have, whether those melds are one suit, and how late the hand is. Three open melds is Extreme. Two melds in one suit is at least High. After many discards, even a quiet hand may be ready, but that read stops at High unless the melds themselves are Extreme.

Defense takes over when someone is High or Extreme and this hand is still two or more tiles from ready, or when fewer than 16 tiles are left in the wall and the hand is not already ready for a big win (5 faan or more). It also gets more weight once fewer than 45 tiles are left and the hand is still two or more tiles from ready (see Playing for points). The dealer pushes a little harder than the other seats.

Against one opponent, a tile is safer in this order:

1. An honor that anyone has already punged or konged. This one is safe against the whole table. (A punged number tile only loses its pung and pair waits. It can still finish a chow.)
2. A tile they have thrown since their last meld. Their current hand did not want it.
3. An honor with three or more copies already visible. It is dead.
4. A tile whose suji they have thrown. If they threw the 2, the 5 is safer, and the same three-away step in the other direction.
5. A tile blocked by a neighbor whose four copies are all visible.
6. A tile they threw earlier in the hand.
7. Everything else. A fresh honor, or a middle tile of the suit they are collecting, is the most dangerous.

A flush read makes their suit more dangerous and the other two suits safer. Near the end of the hand (fewer than 32 tiles left), a suit an opponent has chowed in is more dangerous too: they're building in it. A wait with three or more copies already visible is worth little. A wait with only one copy left is treated as nearly dead.

## What the coach adds

The coach does not choose for itself. It says the bot's decision in four parts: what to do and why, how far the hand is from ready and which hand it is building, how dangerous the opponents look, and which tile goes next if the draw does not help.

It only says "Play safe" on the last wall, when a win is unlikely: fewer than 16 tiles left and the hand not ready, or fewer than 36 left and two or more tiles from ready. A safe pick earlier in the hand is explained like any other discard, and the threats line says who is dangerous.

**Feedback on** does not tell you the tile first. After you discard or claim, it compares that move with the one above and says whether it was the coach's choice, close, slow, or risky. **Coach off** leaves the bar in place and asks you to turn the coach on.
