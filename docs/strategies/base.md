# base: the fundamentals

This is the playbook for the **base** strategy (`js/mahjong-bot.js`). It's the shared foundation every other strategy builds on, played with no hooks of its own. Its rules for sticking to a plan apply to all of them.

It only uses what its seat can see.

## Stick to a plan

1. **Keep options open early.** For its first 3 discards, a hand isn't committed to anything. It throws what leaves the most hands possible, and the coach doesn't call a change of aim a pivot.
2. **Commit.** From the fourth discard, the hand it's on is the plan.
3. **Pivot only with a reason.** There are three:
   - **The plan is gone.** A meld or the tiles on the table rule it out.
   - **More points.** The new hand is worth at least 1 more faan, is no more than 1 step further from ready, and rates at least 10% higher.
   - **The plan is hopeless.** No tile would help it, there aren't the draws left to fill it, or another hand is at least 2 tiles closer with at least 3 times the odds.
4. **Stay on the new plan.** Coming back to a hand it left needs 2 more faan and no extra steps, unless the current plan has become hopeless.

Getting closer to a different hand of the same value isn't a reason, and neither is a small change in the odds. A claim that leaves the plan needs one of the same reasons, unless it makes the hand ready to win.

Hands built from the same tiles count as one plan: a Half Flush and a Full Flush in one suit, All Triplets and Concealed Triplets, a plain hand and Concealed Straights, the hands of 1s, 9s and honors, and the Seven Pairs hands. Moving between those refines the hand, so it's free and isn't called a pivot.

## Keep the hand versatile

Between close discards, it adds 12% of the value of the two best other plans those tiles could still become. So it keeps a discard that leaves a backup alive, and when it has to pivot there's somewhere to go.

## The other strategies

- **lucky-cat, no-defense:** the committed plan stays in the running whatever else their hand reads suggest. Lucky Cat's special hands need a justified pivot too. A No Defense lock replaces the plan.
- **jorge-yau:** past its first 3 discards, its target holds until it's dead, a player before it collects that suit, or a limit hand appears. The rules apply between the hands that target lists.
- **only-orphans:** once it gives up on Thirteen Orphans, it doesn't come back.

A saved game replays its moves, so the bots come back on the same plans. The coach's record for your own hand isn't saved, so after a reload it commits again from what you hold.
