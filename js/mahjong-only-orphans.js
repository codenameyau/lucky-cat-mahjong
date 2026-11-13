/* Only Orphans: a learned strategy built on 1s, 9s and honors.

   What makes it Only Orphans is a few fixed rules:
     - 1s, 9s and honors are the core of every hand it plays, and it never
       chows,
     - each deal it picks a target by expected points, and reads it again
       every turn (section 1):
         Thirteen Orphans,
         triplets of 1s, 9s and honors (Mixed Orphans, All Terminals and
           All Honors as triplets: the only target that pungs),
         pairs of 1s, 9s and honors (the same hands as Seven Pairs),
         Seven Pairs of any tiles,
         Concealed Triplets of any tiles,
     - tiles the target can't use go first, even while folding: on the
       orphan targets every tile that isn't a 1, a 9 or an honor, on Seven
       Pairs and Concealed Triplets only the ones not in a pair (or pung),
     - it claims only what the target can use: a pung or kong of a 1, a 9
       or an honor on the triplets target (or when that claim makes the
       triplets target worth switching to), and on every other target
       nothing but the winning tile.
   Everything else is the model's (js/mahjong-only-orphans-weights.js),
   trained by self-play like Neural Cat (npm run ml:orphans, the lab): which
   of the allowed tiles goes, which allowed pungs and kongs to take, and when
   to play safe. It scores each choice in expected points and plays the one
   worth the most.

   It is built on the shared foundation (js/mahjong-bot.js) through
   MahjongML.create, so its features are read through these hooks. A model
   trained on them must be used with them, so changing a hook needs new data
   and a new model.

   create({ weights, model, temperature, epsilon, rng, fast }) builds another
   copy (training data, the league). The playbook and its training are in
   docs/strategies/only-orphans.md. */

(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var E = node ? require("./mahjong-engine.js") : root.MahjongEngine;
  var B = node ? require("./mahjong-bot.js") : root.MahjongBot;
  var ML = node ? require("./mahjong-ml.js") : root.MahjongML;

  var ID = "only-orphans";

  function shippedWeights() {
    if (!node) return root.MahjongOnlyOrphansWeights || null;
    try { return require("./mahjong-only-orphans-weights.js"); } catch (err) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * 1. Targets
   *    A target is worth its payout times the odds of finishing it
   *    (finishOdds: the live tiles that help at each step, the draws left,
   *    and the table). With a tile to throw, it is worth what its best
   *    discard leaves. A hand keeps its target until another is worth
   *    SWITCH times as much, or the target can't be made any more. Only
   *    what the seat can see goes in: its tiles and the unseen counts.
   * ------------------------------------------------------------------ */

  var TARGETS = ["orphans", "major-sets", "major-pairs", "pairs", "concealed-triplets"];
  var LABELS = {
    orphans: "Thirteen Orphans",
    "major-sets": "triplets of 1s, 9s and honors",
    "major-pairs": "pairs of 1s, 9s and honors",
    pairs: "Seven Pairs",
    "concealed-triplets": "Concealed Triplets",
  };
  var SWITCH = 1.3;

  // Payout relative to a 3-faan hand: each faan doubles it, up to the limit.
  function payout(f) { return Math.pow(2, Math.min(f, 13) - 3); }

  function exposed(ctx) { return ctx.melds.some(function (m) { return !m.concealed; }); }

  function alive(ctx) {
    return function (p) {
      p.committed = true;
      return p.shantenFn(p.counts, ctx.declared) !== Infinity;
    };
  }

  // Mixed Orphans, All Terminals and All Honors, as triplets or as pairs, that
  // this hand's melds and live tiles can still make.
  function setPlans(c, ctx) { return B.setUpgrades(c, ctx, true).filter(alive(ctx)); }
  function pairPlans(c, ctx) { return B.pairsUpgrades(c, ctx, true).filter(alive(ctx)); }
  function pivotPlans(c, ctx) { return setPlans(c, ctx).concat(pairPlans(c, ctx)); }

  // Seven different pairs of any tiles, nothing claimed.
  function sevenPairsPlan(c, ctx) {
    if (ctx.declared) return null;
    var p = B.makeSpecialPlan("pairs", c, ctx);
    p.committed = true;
    return p;
  }

  // Four concealed pungs of any tiles and the eyes: 10 faan, nothing claimed.
  function concealedTripletsPlan(c, ctx) {
    if (exposed(ctx) || ctx.hasChow) return null;
    return {
      id: "concealed-triplets", label: "Concealed Triplets", counts: c, shantenFn: E.tripletsShanten,
      faan: Math.min(13, B.baseFaan(ctx) + 10 + B.handYaku(ctx, c)), open: false, committed: true,
    };
  }

  // Every target's plans for a hand waiting to draw (13 tiles, less melds).
  function targetPlans(c, ctx) {
    var out = [];
    if (!ctx.declared && B.orphansAlive(c, ctx)) out.push({ target: "orphans", plan: B.makeSpecialPlan("orphans", c, ctx) });
    setPlans(c, ctx).forEach(function (p) { out.push({ target: "major-sets", plan: p }); });
    pairPlans(c, ctx).forEach(function (p) { out.push({ target: "major-pairs", plan: p }); });
    var sp = sevenPairsPlan(c, ctx);
    if (sp) out.push({ target: "pairs", plan: sp });
    var ct = concealedTripletsPlan(c, ctx);
    if (ct) out.push({ target: "concealed-triplets", plan: ct });
    return out;
  }

  // The odds of finishing a plan s steps from ready, a go-around at a time.
  // Each step's live tiles are counted on the way there: the hand takes the
  // tile with the most copies left that helps, and throws the one it needs
  // least, so a hand whose later steps need tiles with few copies left (a
  // pair's last two) is slower than one whose first step is as wide. The
  // winning tile can come from any discard, and on an open plan so can a
  // pung's third tile (CLAIMED times as likely as a draw). Every go-around
  // someone else may finish first (OTHERS, or more when the table is ready).
  var CLAIMED = 2, OTHERS = 0.025, MOST = 0.9;
  function finishOdds(p, ctx, s) {
    var fn = p.shantenFn, declared = ctx.declared;
    var counts = p.counts.slice(), unseen = ctx.unseen.slice();
    var full = 3 * (4 - declared) + 1;
    var rates = [];
    for (var k = 0; k <= s; k++) {
      var now = s - k;
      var u = B.ukeire(counts, fn, declared, unseen, now);
      if (!u.total) return 0;
      var rate = 0;
      u.tiles.forEach(function (i) {
        rate += unseen[i] / ctx.unseenTotal * (now === 0 || (p.open && counts[i] === 2) ? CLAIMED : 1);
      });
      rates.push(Math.min(MOST, rate));
      if (now === 0) break;
      // The step: the likeliest kind of help comes in (tiles held as often
      // do the same thing: a new kind, a pair, a pung), its tile with the
      // most copies left...
      var mass = [0, 0, 0, 0], pick = [-1, -1, -1, -1];
      u.tiles.forEach(function (i) {
        var n = counts[i];
        mass[n] += unseen[i];
        if (pick[n] === -1 || unseen[i] > unseen[pick[n]]) pick[n] = i;
      });
      var kind = 0;
      for (var m = 1; m < 4; m++) if (mass[m] > mass[kind]) kind = m;
      var take = pick[kind];
      counts[take]++;
      unseen[take]--;
      var held = 0;
      for (var j = 0; j < 34; j++) held += counts[j];
      if (held <= full) continue;
      // ...and the tile that keeps the hand closest, with fewest copies left, goes.
      var out = -1, outS = Infinity;
      for (var t = 0; t < 34; t++) {
        if (!counts[t] || t === take) continue;
        counts[t]--;
        var st = fn(counts, declared);
        counts[t]++;
        if (st < outS || (st === outS && unseen[t] < unseen[out])) { out = t; outS = st; }
      }
      if (out === -1) return 0;
      counts[out]--;
    }
    // Go-around by go-around: the chance each step is still to come.
    var hazard = 1 - (1 - OTHERS) * (1 - (ctx.hazard || 0));
    var at = new Array(rates.length + 1).fill(0);
    at[0] = 1;
    var won = 0;
    var turns = Math.max(1, Math.round(ctx.drawsLeft));
    for (var g = 0; g < turns; g++) {
      for (var step = rates.length - 1; step >= 0; step--) {
        var move = at[step] * rates[step];
        at[step] -= move;
        if (step === rates.length - 1) won += move; else at[step + 1] += move;
      }
      for (var q = 0; q < rates.length; q++) at[q] *= 1 - hazard;
    }
    return won;
  }

  // What a plan is worth: its payout times the odds of finishing it.
  function planWorth(p, ctx) {
    var s = p.shantenFn(p.counts, ctx.declared);
    if (s === Infinity) return 0;
    if (s < 0) return payout(p.faan);
    return payout(p.faan) * finishOdds(p, ctx, s);
  }

  // Each target's worth for this hand: { orphans: 0.4, pairs: 0.1, ... }.
  // With a tile to throw (3n + 2 tiles), the most any discard leaves.
  function targetWorths(c, ctx) {
    // The same tiles read again in the same position (a turn reads its hand
    // more than once) are worth the same.
    var key = c.join("") + "|" + ctx.declared + "|" + (exposed(ctx) ? 1 : 0);
    var seen = ctx.ooWorths || (ctx.ooWorths = {});
    if (!seen[key]) seen[key] = readWorths(c, ctx);
    return seen[key];
  }

  function readWorths(c, ctx) {
    var worth = {};
    TARGETS.forEach(function (t) { worth[t] = 0; });
    var held = 0;
    for (var i = 0; i < 34; i++) held += c[i];
    // (A plan that only keeps some tiles reads the same after any of the others goes.)
    var done = {};
    var read = function (k) {
      targetPlans(k, ctx).forEach(function (e) {
        var key = e.plan.id + ":" + e.plan.counts.join("");
        if (done[key] === undefined) done[key] = planWorth(e.plan, ctx);
        var w = done[key];
        if (w > worth[e.target]) worth[e.target] = w;
      });
    };
    if (held % 3 !== 2) { read(c); return worth; }
    for (var j = 0; j < 34; j++) {
      if (!c[j]) continue;
      var k = c.slice();
      k[j]--;
      read(k);
    }
    return worth;
  }

  // The target for these worths: `now` stays unless another is worth SWITCH
  // times as much, or `now` can't be made.
  function pickTarget(worth, now) {
    var best = null;
    TARGETS.forEach(function (t) { if (worth[t] > 0 && (!best || worth[t] > worth[best])) best = t; });
    if (!best) return now || "orphans";
    if (now && worth[now] > 0 && worth[best] < worth[now] * SWITCH) return now;
    return best;
  }

  // Each copy of the strategy (a training copy, say) keeps its own record.
  function memoKey() { return "ooTarget:" + (B.currentTuning().id || ID); }

  function isRealHand(game, seat, ctx, counts) {
    var s = game.hand.seats[seat];
    if (ctx.melds !== s.melds) return false;
    var real = E.countsOf(s.hand);
    for (var i = 0; i < 34; i++) if (real[i] !== counts[i]) return false;
    return true;
  }

  // The target for these tiles. Reading the seat's real hand records it.
  function readTarget(ctx, counts, record) {
    var s = ctx.game.hand.seats[ctx.seat];
    var key = memoKey();
    var memo = s[key] || null;
    var worth = targetWorths(counts, ctx);
    var id = pickTarget(worth, memo && memo.id);
    if (record) {
      var from = memo && memo.id !== id ? memo.id : (memo ? memo.from : null);
      var at = memo && memo.id !== id ? s.discards.length : (memo ? memo.at : null);
      s[key] = { id: id, worth: worth, from: from, at: at };
    }
    return id;
  }

  // The seat's target as last read, read now from its hand if there's none.
  function seatTarget(game, seat, ctx) {
    var s = game.hand.seats[seat];
    if (!s[memoKey()]) readTarget(ctx, E.countsOf(s.hand), true);
    return s[memoKey()].id;
  }

  /* ------------------------------------------------------------------ *
   * 2. The hands it reads
   * ------------------------------------------------------------------ */

  // On Seven Pairs or Concealed Triplets it reads that hand, and the same
  // hand in 1s, 9s and honors. Otherwise Thirteen Orphans while no meld is
  // down and no tile it needs has run out, beside the hands of 1s, 9s and
  // honors as triplets or pairs.
  function plans(c, ctx) {
    var t = ctx.ooTarget;
    var out = [];
    if (t === "pairs") {
      var sp = sevenPairsPlan(c, ctx);
      if (sp) out = [sp].concat(pairPlans(c, ctx));
    } else if (t === "concealed-triplets") {
      var ct = concealedTripletsPlan(c, ctx);
      if (ct) out = [ct].concat(setPlans(c, ctx));
    }
    if (!out.length) {
      out = !ctx.declared && B.orphansAlive(c, ctx) ? [B.makeSpecialPlan("orphans", c, ctx)] : [];
      out = out.concat(pivotPlans(c, ctx));
    }
    // (The usual hands only if a meld somehow rules all of those out.)
    return out.length ? out : B.basePlans(c, ctx);
  }

  /* ------------------------------------------------------------------ *
   * 3. The fixed rules
   * ------------------------------------------------------------------ */

  // The target as last read, for every read of this position.
  function context(ctx, game, seat) {
    ctx.ooTarget = seatTarget(game, seat, ctx);
  }

  // Its 1s, 9s and honors can't be read as going for one suit. The target is
  // read again when the seat has a tile to throw. A position being weighed
  // (a claim, a kong) keeps the target, but an exposed meld leaves only the
  // triplets target.
  function hand(ctx, counts) {
    ctx.mixedHand = true;
    if (!counts) return;
    var held = 0;
    for (var i = 0; i < 34; i++) held += counts[i];
    if (held % 3 === 2 && isRealHand(ctx.game, ctx.seat, ctx, counts)) ctx.ooTarget = readTarget(ctx, counts, true);
    else if (exposed(ctx)) ctx.ooTarget = "major-sets";
  }

  // A tile the target can't use, which must go first: on Seven Pairs one not
  // in a pair (a third copy too), on Concealed Triplets one not in a pair or
  // pung, and on the other targets any tile that isn't a 1, a 9 or an honor.
  function mustGo(ctx, counts, i) {
    if (B.isOrphanIndex(i)) return false;
    var t = ctx.ooTarget;
    if (t === "pairs") return counts[i] !== 2;
    if (t === "concealed-triplets") return counts[i] < 2;
    return true;
  }

  // Those tiles always go first, even while folding.
  function priority(game, ctx, counts, candidate) {
    return mustGo(ctx, counts, candidate.index) ? 0 : null;
  }

  function orphanTile(tile) { return B.isOrphanIndex(E.tileIndex(tile)); }

  // A kong on the triplets target (of a 1, a 9 or an honor), or a concealed
  // one on Concealed Triplets. Thirteen Orphans and the pairs hands can't use one.
  function kongFits(kong, t) {
    if (t === "major-sets") return orphanTile(kong.tile);
    if (t === "concealed-triplets") return kong.kind === "concealed";
    return false;
  }
  function kongOk(kong, ctx) { return kongFits(kong, ctx.ooTarget); }

  // It passes unless the model takes a pung or kong the target allows.
  function claim() { return { type: "pass" }; }

  var hooks = { context: context, hand: hand, plans: plans, priority: priority, kongOk: kongOk, claim: claim };
  var tuning = { valuePower: 0.5, ownPlans: true };

  // The model picks only among the discards the rules allow: the tiles the
  // target can't use while it holds any. Then any tile, but a lone dragon
  // nobody has shown only when it leaves the hand ready or nothing else is
  // left (the shared rule every bot keeps).
  function allow(candidates, ctx, counts, game) {
    var other = candidates.filter(function (x) { return mustGo(ctx, counts, x.index); });
    if (other.length) return other;
    return candidates.filter(function (x) { return x.shanten <= 0 || !B.loneDragon(game, counts, x.index); });
  }

  /* ------------------------------------------------------------------ *
   * 4. The strategy
   * ------------------------------------------------------------------ */

  function create(options) {
    options = options || {};
    var base = B.createStrategy({ id: ID + "-rules", hooks: hooks, tuning: tuning });

    // A pung or kong of a 1, a 9 or an honor: on the triplets target, or when
    // the claim makes that target worth SWITCH times the one it's on.
    function claimOk(option, opts, game, seat) {
      if (option.decision.type === "chow" || !orphanTile(opts.tile)) return false;
      var ctx = bot.buildContext(game, seat);
      var t = ctx.ooTarget;
      if (t === "major-sets") return true;
      var c = E.countsOf(game.hand.seats[seat].hand);
      var now = targetWorths(c, ctx)[t] || 0;
      var kong = option.decision.type === "kong";
      c[E.tileIndex(opts.tile)] -= kong ? 3 : 2;
      var tiles = [opts.tile, opts.tile, opts.tile].concat(kong ? [opts.tile] : []);
      var after = targetWorths(c, B.withMeld(ctx, { type: kong ? "kong" : "pung", tiles: tiles, concealed: false }))["major-sets"];
      return after > 0 && after >= now * SWITCH;
    }
    function kongAllowed(kong, game, seat) {
      return kongFits(kong, bot.buildContext(game, seat).ooTarget);
    }

    var bot = ML.create({
      id: options.id || ID,
      base: base,
      model: options.model,
      weights: options.weights,
      loadWeights: shippedWeights,
      topK: 0,
      temperature: options.temperature,
      epsilon: options.epsilon,
      rng: options.rng,
      fast: options.fast,
      allow: allow,
      claimOk: claimOk,
      kongOk: kongAllowed,
    });
    bot.base = ID;
    // The target a seat is on, as this copy last read it: { id, label, worth,
    // from, at } (from: the target it left, at: on which discard), or null.
    bot.targetOf = function (game, seat) {
      var s = game.hand.seats[seat];
      var memo = s["ooTarget:" + (bot.tuning.id || ID)];
      return memo ? { id: memo.id, label: LABELS[memo.id], worth: memo.worth, from: memo.from, at: memo.at } : null;
    };
    return bot;
  }

  var api = create();
  api.create = create;
  api.pivotPlans = pivotPlans;
  api.plans = plans;
  api.targetWorths = targetWorths;
  api.pickTarget = pickTarget;
  api.TARGETS = TARGETS;
  api.LABELS = LABELS;
  api.SWITCH = SWITCH;
  api.hasWeights = function () { return !!shippedWeights(); };

  if (node) module.exports = api;
  else root.MahjongOnlyOrphans = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
