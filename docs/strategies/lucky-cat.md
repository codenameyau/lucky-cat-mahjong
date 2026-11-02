# lucky-cat: how it plays

This is the playbook for the **lucky-cat** strategy (`js/mahjong-lucky-cat.js`). Any bot seat can play it, and the coach can follow it (pick it in the Strategies sheet).

lucky-cat runs on the same engine as [jorge-yau](jorge-yau.md). It counts tiles from ready and live tiles the same way, scores every wait of a ready hand exactly, and reads opponents' threat levels the same way. What changes is how it picks a hand, the order it throws tiles, when it claims, when it gives up, and how it reads the other players.

Like every bot, it only uses what its seat can see: its own hand and flowers, every open meld, the discards, and how many tiles are left in the wall.

## Picking a hand

At its first decision of the hand, lucky-cat reads the opening tiles and picks a **target**. It tries these in order and takes the first that fits. Tiles in open melds count too.

| # | The opening hand has | Target | Backups it can pivot to |
| --- | --- | --- | --- |
| 1 | 8 or more different terminals and honors | **Thirteen Orphans**. Keep 1s, 9s and honors, discard everything else | Seven Pairs of terminals and honors (Mixed Orphans on top), then All Terminals or Mixed Orphans |
| 2 | 7 or more tiles of one suit's 1112345678999 | **Nine Gates** in that suit. Discard everything else | Full Flush, then Half Flush in that suit |
| 3 | 8 or more winds | **Big or Small Four Winds**. Discard number tiles, keep every honor | All Honors |
| 4 | 8 or more 1s and 9s | **All Terminals** (sets of 1s and 9s) | Mixed Orphans with honors, All Triplets |
| 5 | 8 or more honors | **All Honors** (sets and a pair of honors) | All Triplets, then a Half Flush |
| 6 | 4 or more pairs | **Seven Pairs** | Concealed Triplets, then All Triplets |
| 7 | 8 or more tiles of one suit | **Full Flush**. Keep that suit, discard the other suits and honors. Early chows in that suit are fine | Half Flush in that suit |
| 8 | 1 to 3 sets (three or four of a kind) | **Concealed Triplets**, in the main suit and honors where it can | All Triplets or Seven Pairs, preferably in one suit with honors, then a Half Flush |
| 9 | One main suit (at least 5 tiles, twice the next suit) and 3 or more honors | **Half Flush** | Full Flush, All Triplets |
| 10 | 9 or more number tiles spread evenly over two or three suits | **Concealed All Sequences**. Honors go first | Every jorge-yau hand |
| 11 | Anything else | **A standard hand**, played like jorge-yau | |

"Different" in row 1 means kinds, not copies: Thirteen Orphans needs one of each, so a pair of East Winds counts once there. A pair still counts toward the hand's one pair. In row 8, pairs alone don't count: the hand needs a set already.

### Changing target

Each turn the current hand is read again with the same table:

- **A stronger target replaces the old one.** If a hand on Concealed Triplets reaches 4 pairs while still concealed, it moves up to Seven Pairs. A Full Flush that fills in its 1s and 9s moves up to Nine Gates.
- **A target that can no longer be made gives way** to the current read:
  - Thirteen Orphans once it claims anything, or once all four copies of a tile it still needs are on the table.
  - Nine Gates and Seven Pairs once it claims.
  - Four Winds once more than one set of number tiles is open.
  - All Terminals and All Honors after a chow.
  - Full and Half Flush once a set of another suit is open.
  - Concealed All Sequences once it claims.
- **Backups.** The target's hands are preferred over the backups (1.5 times), but the hand switches when a backup is clearly closer to a good win. A pivot on the softer targets (Concealed Triplets, Seven Pairs, Half Flush, All Sequences) also hands the discard order back to jorge-yau's. The hand keeps a target's discards only while that target's hand is the one in the lead.

Choosing a backup doesn't make it worth more. The value of a hand is still its real payout times its chance to finish, so defense weighs against the true value.

## Playing fast

When the hand already holds faan, lucky-cat plays for speed instead of size:

- a set of its own seat wind or the round wind (or a pair of it with a copy still live), or
- its own seat flower or season.

Then the softer targets lose their preference, a finished hand is valued more than a bigger one (as jorge-yau does late in the hand), and chows that get the hand within two tiles of ready are allowed. The limit-hand targets (Thirteen Orphans, Nine Gates, Four Winds, All Terminals, All Honors) and Full Flush don't change.

### Other ways to reach 3 faan

A ready hand is scored wait by wait, by discard and by self-draw, with Concealed and Self-Draw counted. On top of that, a wait that is one faan short even on a self-draw still has some value when:

- the hand can kong (a concealed pung with the fourth copy live, or an open pung it can add to). Win by Kong adds a faan.
- fewer than 17 tiles are left (more under 9). Win on the Last Tile adds a faan.

## What gets discarded first

1. **After a chow, the other suits.** A mixed hand can't reach 3 faan once a chow is open, so every tile of another suit goes first, even while folding. This is jorge-yau's rule.
2. **Tiles the target can't use.** For the limit-hand targets and the flushes, these go first even if they cost a step toward ready, because the target needs every slot: number tiles on Four Winds and All Honors, middle tiles on All Terminals, non-orphans on Thirteen Orphans, other suits and honors on Nine Gates and Full Flush. For the softer targets they go first only when they don't cost a step: other suits on a Half Flush, and honors on Concealed All Sequences.
3. **A tile someone has punged**, when the hand doesn't need it. On Nine Gates, spare copies beyond the 1112345678999 go here too.
4. **Ordinary tiles.**
5. **Pairs.** On Seven Pairs a pair is kept longest. On Concealed Triplets, All Terminals, All Honors and Four Winds every pair waits, and a pung waits longer. On Concealed Triplets a single of a suit other than its main one goes in group 2 above, so the hand drifts toward one suit and honors.
6. **Honors that can still become a set** (fewer than two copies out): a single waits like a pair, and a dragon or scoring wind waits longer, all hand long. Other winds wait like this only early, while more than 60 tiles are left. Concealed All Sequences drops honors instead.

## Claims

**Stay concealed.** Concealed is a faan, and it hides the hand.

- **Seven Pairs, Thirteen Orphans, Nine Gates and Concealed All Sequences claim nothing.** The one exception: Concealed All Sequences will pung a dragon or scoring wind once it is three or more tiles from ready.
- **Pungs are fine early.** A pung keeps the hand open to a Half Flush in any suit. A pung or kong is taken when the hand is at least as good afterwards.
- **Dragons and scoring winds are always punged.** On Four Winds, All Honors and All Terminals, any honor is punged. The exception is a ready hand that the pung would leave slower and worth less.
- **Chows are rare.** A chow must leave the hand closer to ready and still able to reach 3 faan, and it must also:
  - make the hand ready for 3 faan or more, or
  - build the Full or Half Flush the hand is going for in that suit (within two tiles of ready, early or late), or
  - be on a fast hand (within two tiles of ready), or
  - be late (fewer than 48 tiles left, or after the ninth discard) and leave the hand one tile from ready.

  It never chows into a suit it holds fewer than five tiles of (counting the chow), and the chow has to beat passing by 15%.

## Reading the other players

Every opponent's discards say which hand they are likely on, and so which tiles they need:

- **A flush.** After six discards, a suit they've thrown almost none of (10% or less) while throwing at least two of each other suit is the suit they want. Its tiles are more dangerous to throw (1.8×), and the other suits are safer (0.6×). With a meld down, this also counts as a flush for their threat level.
- **Honors.** No honors thrown in seven or more discards: they're keeping them. Live honors are more dangerous (1.6×).
- **A hand of runs.** Their first discards were all terminals and honors: middle tiles 3 to 7 are more dangerous (1.3×), and honors safer (0.6×).

This adds to jorge-yau's reads: tiles thrown since their last meld, dead honors, suji, kabe, their melds, and how late it is. See [jorge-yau.md](jorge-yau.md#defense).

## Not feeding the table

Beyond dealing in, a discard can hand someone a claim:

- **Chow tiles to the next player.** A number tile the next player could chow is a little riskier. More so in a suit they've chowed or are collecting, less so if they've thrown its neighbors, and not at all in a suit they're clearly not collecting.
- **Fresh honors.** A dragon or a scoring wind that nobody has shown yet may give someone a pung worth a faan. Any other fresh wind is a smaller risk.

These count a little all hand and fully once fewer than 40 tiles are left.

## When to give up

With fewer than 40 tiles left and the hand still two or more tiles from ready, a win is unlikely. lucky-cat stops building:

- Safety counts 1.6 times more on top of jorge-yau's late fold, and the target's discard order only breaks ties.
- The concealed hands may claim again (a claim can still sneak out a cheap win).
- Feeding chows and fresh honors counts in full.

One tile from ready with fewer than 20 tiles left, safety counts 1.3 times more.

## Knobs

`MahjongLuckyCat.setTuning({ ... })` changes these, so the competition can compare settings:

| Knob | Default | |
| --- | --- | --- |
| `targetWeight` | 1.5 | How strongly the target's hands are preferred over the backups |
| `giveUpWall` | 40 | Tiles left below which a slow hand stops building |
| `giveUpDefense` | 1.6 | Extra weight on safety then |
| `feed` | 1 | Weight on feeding chows and fresh honors |
| `reads` | true | Read opponents' hands from their discards |
| `skip` | [] | Targets to leave out of the read (to measure each one) |
| `ownClaims`, `ownDiscards` | true | false uses jorge-yau's claims or discard order |

## Results

Two lucky-cat bots against two jorge-yau bots, 2,000 deals each played in all four seat rotations (8,000 hands, `npm run compete -- --deals 2000 --seed 20261101`):

| | lucky-cat | jorge-yau |
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

lucky-cat wins less often, but its wins are bigger and more often concealed, and it deals in a little less. Points per hand are noisy at this size (one limit self-draw is 24,576 points), and other seed sets came out between about −13 and +14 points per hand. So read this as "about even on points, with a different style". The win rate, deal-in rate and hand sizes hold steady from run to run.

On the way, two choices were measured and changed:

- **Preferring a target doesn't inflate its value.** With the target's value multiplied by 1.5, the bot defended too little and lost about 80 points a hand. Now the weight only chooses which hand to build.
- **The softer targets give the discard order back once the hand has pivoted.** Keeping every pair for All Triplets while another hand was ahead cost several wins in a hundred.

Concealed All Sequences is the most common opening target, and Concealed Triplets is about one in ten. When row 8 read 1 to 3 pairs, about 80% of hands aimed for All Triplets. Points came out about the same (+12.7 per hand), but the hands it built were less varied.
