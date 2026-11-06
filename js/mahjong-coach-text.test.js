// The coach's words, for every strategy's coach and the playback notes:
// each hint, piece of feedback or note fits four lines on a phone (at most
// 400 characters, the action and the detail together), and says "meld",
// never "set", "eyes" for the pair a hand wins with, and what a plus or
// minus number counts ("-9 points" or "-9 score", never "-9").

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./mahjong-engine.js');
const S = require('./mahjong-strategies.js');
const C = require('./mahjong-coach.js');
const A = require('./mahjong-analysis.js');

const MAX = 400;
const clean = (s) => String(s || '').replace(/[\u0001\u0002]/g, '');
const words = (h) => [h.action].concat(h.tips || []).map(clean).filter(Boolean).join(' ');

function checkText(t, where) {
  assert.ok(t.length <= MAX, where + ' is ' + t.length + ' characters: ' + t);
  assert.doesNotMatch(t, /\bsets?\b/i, where + ' says "set": ' + t);
  assert.doesNotMatch(t, /\bas the pair\b|\bthe pair you win\b/i, where + ' should say "eyes": ' + t);
  // A plus or minus number always says what it counts: "-9 points" or "-9 score", never "-9".
  assert.doesNotMatch(t, /(?:[+\u2212]|(?:^|\s)-)\d[\d,.]*(?![\d,.]*(?:\s+points?\b|\s+score\b|\s+faan\b|%))/, where + ' has a number with no unit: ' + t);
}

describe('coach text', () => {
  it('fits every hint and piece of feedback in 400 characters, in the right words, for every strategy', async () => {
    let seen = 0;
    for (const id of S.ids()) {
      const bot = S.get(id).bot;
      const coach = C.forStrategy(bot);
      const check = (h, what) => { if (h && (h.action || (h.tips && h.tips.length))) { seen++; checkText(words(h), id + ' ' + what); } };
      for (let d = 0; d < 2; d++) {
        const me = {
          turn(g, s, o) {
            const h = coach.turnHint(g, s, o);
            check(h, 'turn hint');
            if (h && h.tile) {
              check(C.discardFeedback(h, h.tile), 'discard feedback');
              const other = g.hand.seats[s].hand.find((t) => t !== h.tile);
              if (other) check(C.discardFeedback(h, other), 'discard feedback');
            }
            return Promise.resolve(bot.chooseTurnAction(g, s, o));
          },
          claim(g, s, o) {
            const h = coach.claimHint(g, s, o);
            check(h, 'claim hint');
            const d2 = bot.chooseClaim(g, s, o);
            check(C.claimFeedback(h, d2), 'claim feedback');
            check(C.claimFeedback(h, { type: 'pass' }), 'claim feedback');
            return Promise.resolve(d2);
          },
        };
        const game = E.createGame({ seed: 9100 + d, humanSeat: false, dealer: d % 4 });
        await E.runHand(game, [me, S.createAgent('jorge-yau'), S.createAgent('lucky-cat'), S.createAgent('neural-cat')], {});
      }
    }
    assert.ok(seen > 200, 'only ' + seen + ' hints checked');
  });

  it('fits every playback note in 400 characters, in the right words', async () => {
    let seen = 0;
    for (let d = 0; d < 4; d++) {
      const game = E.createGame({ seed: 9200 + d, humanSeat: false, dealer: d % 4 });
      await E.runHand(game, ['neural-cat', 'jorge-yau', 'lucky-cat', 'only-orphans'].map((id) => S.createAgent(id)), {});
      A.analyze(E.parsePlayback(E.playbackText(game, { seat: 0 }))).forEach((n) => {
        seen++;
        checkText([n.action, n.detail].filter(Boolean).join(' '), 'playback note');
      });
    }
    assert.ok(seen > 20);
  });

  it('cuts a long hint to whole tips, keeping the action and the model line', () => {
    const long = 'This tip is long enough that a few of them will not fit together in one hint. ';
    const h = C.fit({ action: 'Discard Red Dragon.', tips: [long, long + long, long, 'The model expects +40 score on average from this discard.', long], model: 'The model expects +40 score on average from this discard.' });
    assert.ok(words(h).length <= MAX);
    assert.equal(h.action, 'Discard Red Dragon.');
    assert.equal(h.tips[0], long);
    assert.ok(h.tips.indexOf('The model expects +40 score on average from this discard.') !== -1);
  });
});
