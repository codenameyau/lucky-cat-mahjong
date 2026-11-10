# jorge-yau: how it plays

This is the playbook for the **jorge-yau** strategy (`js/mahjong-jorge-yau.js`). Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

jorge-yau also holds what the old no-defense strategy did (merged in 0.38.0): it attacks with no defense, keeps honors, claims anything that gets closer, and locks onto a hand worth 7 faan or more. It only plays safe late, when it is far from winning. Those parts are in [Attack, and when it plays safe](#attack-and-when-it-plays-safe) below, and where they differ from the rest of this page, they win.

jorge-yau runs on the same shared foundation as [lucky-cat](lucky-cat.md) (`js/mahjong-bot.js`). It counts tiles from ready and live tiles the same way, scores every wait of a ready hand exactly, and reads opponents' threat levels the same way. What changes is how it picks a hand, the order it throws tiles, when it claims, when it gives up, and how it reads the other players.

Like every bot, it only uses what its seat can see: its own hand and flowers, every open meld, the discards, and how many tiles are left in the wall.

## Picking a hand

At its first decision of the hand, jorge-yau reads the opening tiles and picks a **target**. It tries these in order and takes the first that fits. Tiles in open melds count too.

| # | The opening hand has | Target | Backups it can pivot to |
| --- | --- | --- | --- |
| 1 | 8 or more different terminals and honors | **Thirteen Orphans**. Keep 1s, 9s and honors, discard everything else | Seven Pairs or All Triplets, both with Mixed Orphans |
| 2 | 7 or more tiles of one suit's 1112345678999 | **Nine Gates** in that suit. Discard everything else | Full Flush, then Half Flush in that suit |
| 3 | 8 or more winds | **Big Four Winds**. Discard number tiles, keep every honor | Small Four Winds |
| 4 | A pair or more of every dragon | **Big Three Dragons**. Pung all three | Small Three Dragons |
| 5 | 8 or more 1s and 9s | **All Terminals** (sets of 1s and 9s) | Mixed Orphans with honors, All Triplets |
| 6 | 8 or more honors | **All Honors** (sets and a pair of honors) | Half Flush or All Triplets |
| 7 | 4 or more pairs | **Seven Pairs** | All Triplets |
| 8 | 8 or more tiles of one suit | **Full Flush**. Keep that suit, discard the other suits and honors. Early chows in that suit are fine | Half Flush in that suit |
| 9 | 1 to 3 sets (three or four of a kind) | **Concealed Triplets**, in the main suit and honors where it can | Seven Pairs, then All Triplets (preferably in one suit with honors) |
| 10 | One main suit (at least 5 tiles, twice the next suit) and 3 or more honors | **Half Flush** | Full Flush, All Triplets |
| 11 | 3 or more pairs and no set, when pairs are no slower to finish than runs | **All Triplets**. Pung the pairs, open or concealed | Concealed Triplets, then Seven Pairs |
| 12 | 9 or more number tiles spread evenly over two or three suits | **Concealed Straights**. Honors go first | Every lucky-cat hand |
| 13 | Anything else | **A standard hand**, played like lucky-cat | |

"Different" in row 1 means kinds, not copies: Thirteen Orphans needs one of each, so a pair of East Winds counts once there. A pair still counts toward the hand's one pair. In row 9, pairs alone don't count: the hand needs a set already.

A flush target (Full Flush, Half Flush or Nine Gates) is never set in the suit the player on your left is collecting when another of your suits is about even with it (six or more, within a tile). The next target that fits is taken instead, and a held flush target in that suit gives way once their discards show it. When two suits are within a tile, the one they're throwing is the main suit. See [the shared rules](README.md#adding-a-strategy).

### Changing target

Each turn the current hand is read again with the same table:

- **A stronger target replaces the old one.** If a hand on Concealed Triplets reaches 4 pairs while still concealed, it moves up to Seven Pairs. A Full Flush that fills in its 1s and 9s moves up to Nine Gates.
- **A target that can no longer be made gives way** to the current read:
  - Thirteen Orphans once it claims anything, or once all four copies of a tile it still needs are on the table.
  - Nine Gates and Seven Pairs once it claims.
  - Four Winds once more than one set of number tiles is open, or too few winds are left to pung three.
  - Big Three Dragons once too few dragons are left for two pungs and a pair.
  - All Terminals and All Honors after a chow.
  - Full and Half Flush once a set of another suit is open.
  - All Triplets after a chow.
  - Concealed Straights once it claims.
- **Pivots.** Each target has smaller hands to pivot to, to raise the chance of winning when the bigger hand has little hope or a smaller one is ready sooner: Concealed Triplets to Seven Pairs to All Triplets; Full Flush to Half Flush; Big Four Winds to Small Four Winds; Big Three Dragons to Small Three Dragons; All Honors to Half Flush or All Triplets; and Thirteen Orphans to Seven Pairs or All Triplets with Mixed Orphans. The hand pivots when a smaller hand is ready and the target isn't, or late in the wall (20 tiles or fewer left) when the smaller hand is no further from ready. Then the target's own plans are dropped, so the hand goes for the smaller one; a ready target stays.
- **Backups.** Otherwise the target's hands are preferred over the backups (1.5 times), but the hand switches when a backup is clearly closer to a good win. A pivot on the softer targets (Concealed Triplets, Seven Pairs, Half Flush, All Sequences) also hands the discard order back to the shared one. The hand keeps a target's discards only while that target's hand is the one in the lead.

Choosing a backup doesn't make it worth more. The value of a hand is still its real payout times its chance to finish, so defense weighs against the true value.

## Playing fast

When the hand already holds faan, jorge-yau plays for speed instead of size:

- a set of its own seat wind or the round wind (or a pair of it with a copy still live), or
- its own seat flower or season.

Flowers and sets that leave the hand one faan short of the minimum (while it has only chows down), or already at it, count as a fast hand too (see [the shared rules](README.md#adding-a-strategy)).

Then the softer targets lose their preference, a finished hand is valued more than a bigger one (as lucky-cat does late in the hand), and chows that get the hand within two tiles of ready are allowed. The limit-hand targets (Thirteen Orphans, Nine Gates, Four Winds, All Terminals, All Honors) and Full Flush don't change.

### Other ways to reach 3 faan

A ready hand is scored wait by wait, by discard and by self-draw, with Concealed and Self-Draw counted. On top of that, a wait that is one faan short even on a self-draw still has some value when:

- the hand can kong (a concealed pung with the fourth copy live, or an open pung it can add to). Win by Kong adds a faan.
- fewer than 17 tiles are left (more under 9). Win on the Last Tile adds a faan.

### Bigger hands from the same tiles

The softer targets (and the default) also weigh the special hands the same tiles can still make, as the shared rules in `js/mahjong-bot.js` do: Mixed Orphans on All Triplets, All Terminals, All Honors, Small and Big Three Dragons, Small and Big Four Winds, and Seven Pairs in Mixed Orphans, All Honors or All Terminals. While one is within a step, its tiles wait behind tiles it can't use, unless no copy is left to finish them. Once one is the hand in the lead, the tiles it can't use go first even at a step's cost, as on any target. The three-step reach in the shared rules only applies to a hand with no target of its own (row 13 above).

## What gets discarded first

1. **The other suits, after a chow or with 7 or more tiles of one suit.** A mixed hand can't reach 3 faan once a chow is open, so every tile of another suit goes first, even while folding. The same goes once 7 or more of the hand's tiles (sets count) are in one suit, more than any other, unless the hand is on Seven Pairs, Thirteen Orphans, Nine Gates, All Terminals, All Honors or Four Winds, or on Concealed Straights, which throws honors first instead (keeping one honor pair, if it has one, as the hand's pair, and any dragon nobody has shown, unless throwing it leaves the hand ready). These are the shared rules every strategy follows.
2. **Tiles the target can't use.** For the limit-hand targets and the flushes, these go first even if they cost a step toward ready, because the target needs every slot: number tiles on Four Winds and All Honors, middle tiles on All Terminals, non-orphans on Thirteen Orphans, other suits and honors on Nine Gates and Full Flush. For the softer targets they go first only when they don't cost a step: other suits on a Half Flush, and honors on Concealed Straights.
3. **A single with no copy left** (every other copy is on the table or in a meld). On Seven Pairs and the hands of pairs and pungs (Concealed Triplets, All Triplets, All Terminals, All Honors, Four Winds, Three Dragons) it can never be a pair or a pung, and an honor like that can't make a run either, so it goes with these. Thirteen Orphans keeps it: it needs one of each. On those hands of pungs, a pair with no copy left can still be the eyes but never a pung, so it waits only like an ordinary pair.
4. **A tile someone has punged**, when the hand doesn't need it. On Nine Gates, spare copies beyond the 1112345678999 go here too.
5. **Ordinary tiles.** Between them the shared order decides: the discard that keeps the hand closest to ready with the most live tiles to improve it, then the tile that connects least (a single with no tile of its suit within 2 ranks, and a 1 or 9, which joins a run from one side only, before a middle tile), then the tile with the fewest copies left.
6. **Pairs.** On Seven Pairs a pair is kept longest. On Concealed Triplets, All Terminals, All Honors and Four Winds every pair waits, and a pung waits longer. On Concealed Triplets a single of a suit other than its main one goes in group 2 above, so the hand drifts toward one suit and honors.
7. **Honors that can still become a set** (fewer than two copies out): a single waits like a pair, and a dragon or scoring wind waits longer, all hand long. Other winds wait like this only early, while more than 60 tiles are left. Concealed Straights drops honors instead.

## Claims

**Stay concealed.** Concealed is a faan, and it hides the hand.

- **Dragons and scoring winds are always punged** (or konged), early or late and on any hand, unless it is going for Thirteen Orphans.
- **Early game (more than 60 tiles left in the wall): no other claims, with one exception.** A claim that leaves the hand within two tiles of ready, and still able to reach 3 faan, is taken to win quickly. A pung or kong comes first. A chow is taken only once the player before it has a read (from 6 discards, the suit they keep or the one they feed: whether they'll feed those tiles or need them), and only a chow the rules below allow.
- **From 60 tiles left, the rules below apply.**

- **Seven Pairs, Nine Gates and Concealed Straights claim nothing else**, and Thirteen Orphans claims nothing at all.
- **Pungs are fine.** A pung keeps the hand open to a Half Flush in any suit. A pung or kong is taken when the hand is at least as good afterwards.
- **On Four Winds, All Honors and All Terminals any honor is punged.**
- **Chows are rare.** A chow must leave the hand closer to ready and still able to reach 3 faan, and it must also:
  - make the hand ready for 3 faan or more, or
  - build the Full or Half Flush the hand is going for in that suit (within two tiles of ready, early or late), or
  - be on a fast hand (within two tiles of ready), or
  - be late (fewer than 48 tiles left, or after the ninth discard) and leave the hand one tile from ready.

  It never chows into a suit it holds fewer than five tiles of (counting the chow), and the chow has to beat passing by 15%.

## Attack, and when it plays safe

This section is from the no-defense strategy, which was merged into jorge-yau. It replaces the discard order, claims and defense described elsewhere on this page, except where noted.

**No defense.** It never folds and takes no account of what a discard might feed, with one exception: with fewer than 40 tiles left, still 2 or more tiles from ready and no big hand locked, it plays safe as described in "When to give up" and "Not feeding the table". A locked hand never plays safe.

**Discards.** Without a lock, from first to go to last to go:

1. A lone honor with the other three copies on the table (discarded or in a meld).
2. A discard that leaves the hand able to win for the minimum, whatever the tile.
3. Number tiles that cost no step toward ready.
4. Lone honors, the fewest copies left first. Between honors held the same way with as many left, the [honor order](#which-honor-to-keep) decides.
5. Number tiles that cost a step.
6. Honor pairs, then honor sets.
7. A lone dragon with all three other copies unseen, which goes only if throwing it leaves a hand that can win.

When the target's order would differ, this order decides, and the target's order only breaks ties.

### Which honor to keep

When two or more honors are tied as discards (as many in the hand, as many still unseen, the same steps from ready), they go in this order, first to last:

| Order | Honor | Why |
| --- | --- | --- |
| 1st | A wind worth nothing to you: neither your seat wind nor the round wind | It can't score for you |
| 2nd | A wind worth 1 faan to you: your seat wind or the round wind | It scores only for you |
| 3rd | A dragon, single, pair or set | 1 faan to anyone, so keeping it also keeps it from the others |
| Last | A wind worth 2 faan to you: your seat wind in its own round (East seat in the East round) | The most valuable honor you can hold |

The rule is `honorKeepRank` and `honorTieOrder` in the shared foundation (`js/mahjong-bot.js`), turned on by the `honorOrder` knob. Neural Cat builds on Jorge Yau, so it keeps honors the same way: the model weighs everything else, and between tied honors this order still decides. The coach says why: "West Wind is worth nothing to you, and your East Wind is worth 1 faan."

**Locking onto a big hand.** On any of its first 8 turns, it checks for 8 tiles of a hand worth 7 faan or more (melds count as 3 tiles): a Full Flush or Nine Gates (one suit), Thirteen Orphans (one of each kind plus a pair), All Honors, All Terminals or Mixed Orphans (as sets or pairs), Four Winds, or Three Dragons. If more than one qualifies it takes the most faan less 1.25 for each step away. Half Flush and Seven Pairs are worth less than 7, so they don't lock.

Once locked, other number tiles go first, then honors outside the hand, and the hand's own tiles last. A win that is offered is always taken, even on a smaller hand. The lock ends only when the hand can't be won, and it can lock again only within the first 8 turns. A saved game replays the bots' turns, so they come back on the same lock. The lock replaces the target's plans while it holds.

**Claims.** Since 0.43.0 it uses the shared claim rules (the "stay concealed" rules above). Its old rule, taking any chow, pung or kong that brings the hand closer and can still reach 3 faan, lost about 47 points a hand to them (±17, 6000 deals): it chowed six times as often and won smaller hands. Set `ownClaims: true` to bring it back, or `'lock'` to use it only on a big-hand lock (no better than the shared rules).

## Reading the other players

Every opponent's discards say which hand they are likely on, and so which tiles they need:

- **A flush.** After six discards, a suit they've thrown almost none of (10% or less) while throwing at least two of each other suit is the suit they want. Its tiles are more dangerous to throw (1.8×), and the other suits are safer (0.6×). With a meld down, this also counts as a flush for their threat level.
- **Honors.** No honors thrown in seven or more discards: they're keeping them. Live honors are more dangerous (1.6×).
- **A chow, by the player before or after it.** It settles the read at once: they need that suit to win, and they'll toss the other number suits. From the player after it, that suit is held back so it doesn't feed them. From the player before it, the other suits are the ones they'll keep throwing, so a flush in one of them leans its way and an early chow of them is allowed.
- **A hand of runs.** Their first discards were all terminals and honors: middle tiles 3 to 7 are more dangerous (1.3×), and honors safer (0.6×).

This adds to lucky-cat's reads: tiles thrown since their last meld, dead honors, suji, kabe, their melds, and how late it is. See [lucky-cat.md](lucky-cat.md#defense).

## Not feeding the table

Beyond dealing in, a discard can hand someone a claim:

- **Chow tiles to the next player.** A number tile the next player could chow is a little riskier. More so in a suit they've chowed or are collecting, less so if they've thrown its neighbors, and not at all in a suit they're clearly not collecting.
- **Fresh honors.** A dragon or a scoring wind that nobody has shown yet may give someone a pung worth a faan. Any other fresh wind is a smaller risk.

These count a little all hand and fully once fewer than 40 tiles are left.

## When to give up

With fewer than 40 tiles left and the hand still two or more tiles from ready, a win is unlikely. jorge-yau stops building:

- Safety counts 1.6 times more on top of lucky-cat's late fold, and the target's discard order only breaks ties.
- The concealed hands may claim again (a claim can still sneak out a cheap win).
- Feeding chows and fresh honors counts in full.

One tile from ready with fewer than 20 tiles left, safety counts 1.3 times more.

## Knobs

`MahjongJorgeYau.setTuning({ ... })` changes these, so the competition can compare settings:

| Knob | Default | |
| --- | --- | --- |
| `targetWeight` | 1.5 | How strongly the target's hands are preferred over the backups |
| `giveUpWall` | 40 | Tiles left below which a slow hand stops building |
| `giveUpDefense` | 1.6 | Extra weight on safety then |
| `feed` | 1 | Weight on feeding chows and fresh honors |
| `reads` | true | Read opponents' hands from their discards |
| `skip` | [] | Targets to leave out of the read (to measure each one) |
| `ownClaims` | false | true: any claim that gets closer; 'lock': that, only while locked |
| `ownDiscards` | true | false uses the shared discard order |
| `honorOrder` | true | Between tied honors, keep the ones worth most ([which honor to keep](#which-honor-to-keep)) |
| `keepPairs` | 0 | Keep a pair that can still become a pung when a number tile costs no speed; the number is how much hand value that tile may cost (0 is off) |

## Results

Two jorge-yau bots against two lucky-cat bots, 2,000 deals each played in all four seat rotations (8,000 hands, `npm run compete -- --deals 2000 --seed 20261101`):

These were measured before the shared one-suit rule moved down to 7 tiles, Concealed Straights started throwing honors first and big hands became targets, so both strategies may play a little differently now.

| | jorge-yau | lucky-cat |
| --- | --- | --- |
| Points per hand | **+13.0** | −13.0 |
| Win rate | 10.8% | 15.3% |
| Self-draw share of wins | 42.9% | 47.4% |
| Dealt in | 6.8% | 7.4% |
| Average faan of a win | 5.11 | 4.73 |
| Average points of a win | 678 | 354 |
| Limit hands | 52 | 30 |
| Concealed wins | 86% | 59% |
| Pungs per hand | 0.19 | 0.47 |

jorge-yau wins less often, but its wins are bigger and more often concealed, and it deals in a little less. Points per hand are noisy at this size (one limit self-draw is 24,576 points), and other seed sets came out between about −13 and +14 points per hand. So read this as "about even on points, with a different style". The win rate, deal-in rate and hand sizes hold steady from run to run.

On the way, two choices were measured and changed:

- **Preferring a target doesn't inflate its value.** With the target's value multiplied by 1.5, the bot defended too little and lost about 80 points a hand. Now the weight only chooses which hand to build.
- **The softer targets give the discard order back once the hand has pivoted.** Keeping every pair for All Triplets while another hand was ahead cost several wins in a hundred.

Concealed Straights is the most common opening target, and Concealed Triplets is about one in ten. When row 9 read 1 to 3 pairs, about 80% of hands aimed for All Triplets. Points came out about the same (+12.7 per hand), but the hands it built were less varied.
