// The coach's words, for every strategy's coach and the playback notes:
// each hint, piece of feedback or note fits four lines on a phone (at most
// 400 characters, the action and the detail together), and says "meld",
// never "set", "eyes" for the pair a hand wins with, and what a plus or
// minus number counts ("-9 points" or "-9 score", never "-9").

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./mahjong-engine.js");
const S = require("./mahjong-strategies.js");
const C = require("./mahjong-coach.js");
const A = require("./mahjong-analysis.js");

const MAX = 400;
const clean = (s) => String(s || "").replace(/[\u0001\u0002]/g, "");
const words = (h) => [h.action].concat(h.tips || []).map(clean).filter(Boolean).join(" ");

function checkText(t, where) {
  assert.ok(t.length <= MAX, where + " is " + t.length + " characters: " + t);
  assert.doesNotMatch(t, /\bsets?\b/i, where + " says \"set\": " + t);
  assert.doesNotMatch(t, /\bas the pair\b|\bthe pair you win\b/i, where + " should say \"eyes\": " + t);
  // Holding many pairs is good (one is the eyes, the rest can become pungs).
  assert.doesNotMatch(t, /too many pairs|one pair too many/i, where + " calls pairs a problem: " + t);
  // A plus or minus number always says what it counts: "-9 points" or "-9 score", never "-9".
  assert.doesNotMatch(t, /(?:[+\u2212]|(?:^|\s)-)\d[\d,.]*(?![\d,.]*(?:\s+points?\b|\s+score\b|\s+faan\b|%))/, where + " has a number with no unit: " + t);
}

describe("coach text", () => {
  it("fits every hint and piece of feedback in 400 characters, in the right words, for every strategy", async () => {
    let seen = 0;
    for (const id of S.ids()) {
      const bot = S.get(id).bot;
      const coach = C.forStrategy(bot);
      const check = (h, what) => { if (h && (h.action || (h.tips && h.tips.length))) { seen++; checkText(words(h), id + " " + what); } };
      for (let d = 0; d < 2; d++) {
        const me = {
          turn(g, s, o) {
            const h = coach.turnHint(g, s, o);
            check(h, "turn hint");
            if (h && h.tile) {
              check(C.discardFeedback(h, h.tile), "discard feedback");
              const other = g.hand.seats[s].hand.find((t) => t !== h.tile);
              if (other) check(C.discardFeedback(h, other), "discard feedback");
            }
            return Promise.resolve(bot.chooseTurnAction(g, s, o));
          },
          claim(g, s, o) {
            const h = coach.claimHint(g, s, o);
            check(h, "claim hint");
            const d2 = bot.chooseClaim(g, s, o);
            check(C.claimFeedback(h, d2), "claim feedback");
            check(C.claimFeedback(h, { type: "pass" }), "claim feedback");
            return Promise.resolve(d2);
          },
        };
        const game = E.createGame({ seed: 9100 + d, humanSeat: false, dealer: d % 4 });
        await E.runHand(game, [me, S.createAgent("jorge-yau"), S.createAgent("lucky-cat"), S.createAgent("neural-cat")], {});
      }
    }
    assert.ok(seen > 200, "only " + seen + " hints checked");
  });

  it("fits every playback note in 400 characters, in the right words", async () => {
    let seen = 0;
    for (let d = 0; d < 4; d++) {
      const game = E.createGame({ seed: 9200 + d, humanSeat: false, dealer: d % 4 });
      await E.runHand(game, ["neural-cat", "jorge-yau", "lucky-cat", "only-orphans"].map((id) => S.createAgent(id)), {});
      A.analyze(E.parsePlayback(E.playbackText(game, { seat: 0 }))).forEach((n) => {
        seen++;
        checkText([n.action, n.detail].filter(Boolean).join(" "), "playback note");
      });
    }
    assert.ok(seen > 20);
  });

  it("Simple names the hand it is going for and its faan, from the plan, in one sentence", () => {
    let named = 0, total = 0;
    for (const id of S.ids()) {
      const simple = C.forStrategy(S.get(id).bot, { detail: "simple" });
      const detailed = C.forStrategy(S.get(id).bot, { detail: "detailed" });
      for (const seed of [3, 9, 41, 77]) {
        const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
        E.startHand && E.startHand(game);
        const h = simple.turnHint(game, 0, E.turnOptions(game, 0));
        if (!h || h.kind === "win") continue;
        total++;
        const w = words(h);
        checkText(w, id + " simple");
        if (!h.aim) continue;
        named++;
        const said = C.aimSentence(h.aim);
        assert.match(said, /^Go for .+, (about \d+ faan( \+\d+ for bonuses)?|the 13 faan limit)(, short of the \d+ faan minimum)?\.( You need \d+ more tiles? to win\.)?$/, said);
        assert.ok(w.endsWith(said), id + " " + seed + ": " + w);
        assert.equal(h.tips.length, 1, "Simple stays one tip");
        assert.ok((w.match(/going for|go for/gi) || []).length <= 1, id + " " + seed + " says \"go for\" once: " + w);
        // Detailed and Complex stay as they were.
        const d = detailed.turnHint(game, 0, E.turnOptions(game, 0));
        assert.ok(!words(d).includes(said), "Detailed has no aim sentence: " + words(d));
        // Feedback (and so the playback's coach notes) says it too.
        const other = h.candidates[h.candidates.length - 1].tile;
        const fb = C.shapeFeedback(C.discardFeedback(h, other), h, "simple");
        if (fb) {
          assert.ok(words(fb).endsWith(said), words(fb));
          assert.ok((words(fb).match(/going for|go for/gi) || []).length <= 1, "feedback says \"go for\" once: " + words(fb));
        }
      }
    }
    assert.ok(named >= total - 2 && named > 10, named + " of " + total + " named a hand");
    assert.equal(C.aimSentence({ name: "a chicken hand", faan: 1, min: 3 }), "Go for a chicken hand, about 1 faan, short of the 3 faan minimum.");
    assert.equal(C.aimSentence({ name: "All Triplets", faan: 4, min: 3 }), "Go for All Triplets, about 4 faan.");
    assert.equal(C.aimSentence(null), "");
    assert.equal(C.aimSentence({ name: "Thirteen Orphans", faan: 13, left: 6, have: 8 }), "Go for Thirteen Orphans, the 13 faan limit. You need 6 more tiles to win.");
    assert.equal(C.aimSentence({ name: "All Triplets", faan: 3, left: 1, have: 13 }), "Go for All Triplets, about 3 faan. You need 1 more tile to win.");
  });


  it("Simple says how many tiles the hand needs and how many remain, for every strategy and every pattern", () => {
    // A winning hand is 14 tiles, so the two numbers always add up to 14.
    const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    const patterns = new Set();
    let orphans = 0, pairs = 0;
    for (const id of S.ids()) {
      const simple = C.forStrategy(S.get(id).bot, { detail: "simple" });
      for (let seed = 1; seed <= 120; seed++) {
        const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
        E.startHand && E.startHand(game);
        const h = simple.turnHint(game, 0, E.turnOptions(game, 0));
        if (!h || !h.aim || !h.tile) continue;
        const a = h.aim;
        assert.ok(Number.isInteger(a.have) && Number.isInteger(a.left), id + " " + seed + " says no tile counts");
        assert.equal(a.have + a.left, 14, id + " " + seed + ": " + a.name);
        const w = words(h);
        assert.ok(w.endsWith("You need " + a.left + " more tile" + (a.left === 1 ? "" : "s") + " to win."), w);
        assert.doesNotMatch(w, /You have \d+ tiles?/, "it never says how many tiles you hold");
        assert.ok(w.length <= MAX, w);
        patterns.add(a.name);
        // Counted by hand for two patterns, from the hand after the discard.
        const seat = game.hand.seats[0];
        if (seat.melds && seat.melds.length) continue;
        const c = new Array(34).fill(0);
        seat.hand.forEach((t) => c[E.tileIndex(t)]++);
        c[E.tileIndex(h.tile)]--;
        if (a.name === "Thirteen Orphans") {
          const kinds = ORPHANS.filter((i) => c[i] > 0).length;
          assert.equal(a.have, kinds + (ORPHANS.some((i) => c[i] > 1) ? 1 : 0), id + " " + seed + " orphans");
          orphans++;
        } else if (a.name === "Seven Pairs") {
          assert.equal(a.have, Math.min(7, c.filter((n) => n > 0).length) + Math.min(7, c.filter((n) => n > 1).length), id + " " + seed + " pairs");
          pairs++;
        }
      }
    }
    assert.ok(patterns.size >= 10, "patterns covered: " + [...patterns].join(", "));
    assert.ok(orphans > 10 && pairs > 10, orphans + " orphans and " + pairs + " pairs hands counted");
  });

  it("Detailed and Complex say the tile counts after \"Go for\" too, on turns and claims", () => {
    let said = 0, go = 0;
    for (const id of S.ids()) {
      for (const detail of ["detailed", "complex"]) {
        const coach = C.forStrategy(S.get(id).bot, { detail });
        for (let seed = 1; seed <= 40; seed++) {
          const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
          E.startHand && E.startHand(game);
          const hints = [coach.turnHint(game, 0, E.turnOptions(game, 0))];
          const tile = game.hand.seats[1].hand[0];
          hints.push(coach.claimHint(game, 0, E.claimOptions(game, 0, tile, 3, false)));
          for (const h of hints) {
            if (!h) continue;
            const w = words(h);
            checkText(w, id + " " + detail);
            if (!/Go for /.test(w)) continue;
            go++;
            const m = w.match(/Go for [^.]+\. You need (\d+) more tiles? to win\./);
            if (!m) continue;
            said++;
            assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= 14, w);
          }
        }
      }
    }
    // Only a hint that would run past 400 characters leaves the counts out.
    assert.ok(go > 100 && said >= go * 0.97, said + " of " + go);
  });

  it("cuts a long hint to whole tips, keeping the action and the model line", () => {
    const long = "This tip is long enough that a few of them will not fit together in one hint. ";
    const h = C.fit({ action: "Discard Red Dragon.", tips: [long, long + long, long, "The model expects +40 score from this discard.", long], model: "The model expects +40 score from this discard." });
    assert.ok(words(h).length <= MAX);
    assert.equal(h.action, "Discard Red Dragon.");
    assert.equal(h.tips[0], long);
    assert.ok(h.tips.indexOf("The model expects +40 score from this discard.") !== -1);
  });
});
