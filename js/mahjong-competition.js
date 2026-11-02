/* Bot competition: strategies play each other over many deals, and every
   seat's results are added up by strategy.

   Each deal is played once per seat rotation (4 times when `rotate` is on):
   the same wall, with the lineup shifted one seat each time, so every
   strategy plays every seat of the same tiles and luck mostly cancels out.

   runMatch({ lineup, deals, seed, rotate, onHand }) -> Promise<report>
     lineup: four strategy ids by seat, e.g. ['lucky-cat', 'jorge-yau',
             'lucky-cat', 'jorge-yau'].
   mergeReports(a, b) adds two reports (for runs split across workers).
   formatReport(report) is the table the CLI prints (scripts/competition.js). */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var S = node ? require('./mahjong-strategies.js') : root.MahjongStrategies;

  var START = 1e9; // nobody busts, so every deal is played in full
  var LIMIT = 13;

  function emptyStats() {
    return {
      hands: 0,          // seats played
      wins: 0,
      selfDraws: 0,
      discardWins: 0,    // won off someone's discard
      robKongWins: 0,
      flowerWins: 0,
      dealIns: 0,        // threw the winning tile
      dealInPoints: 0,   // points paid for those
      selfDrawPaid: 0,   // points paid when someone else self-drew
      draws: 0,          // hands nobody won
      points: 0,         // net points
      wonPoints: 0,
      faan: 0,           // total faan of wins
      maxFaan: 0,
      limitWins: 0,      // wins of 13 faan
      concealedWins: 0,  // wins with no claimed meld
      winTurns: 0,       // own discards before the win, summed
      chows: 0,
      pungs: 0,
      kongs: 0,
      patterns: {},      // scoring item name -> wins that had it
      targets: {},       // the strategy's opening target -> seats (when it has one)
      vs: {},            // opponent strategy -> net points from them
    };
  }

  function emptyReport(lineup) {
    var by = {};
    lineup.forEach(function (id) { if (!by[id]) by[id] = emptyStats(); });
    return { lineup: lineup.slice(), deals: 0, hands: 0, draws: 0, ms: 0, strategies: by };
  }

  // Wraps an agent to count the claims it makes.
  function counting(agent, counts) {
    return {
      turn: function (game, seat, opts) {
        return agent.turn(game, seat, opts).then(function (a) {
          if (a && a.type === 'kong') counts.kongs++;
          return a;
        });
      },
      claim: function (game, seat, opts) {
        return agent.claim(game, seat, opts).then(function (d) {
          if (d && d.type === 'chow') counts.chows++;
          if (d && d.type === 'pung') counts.pungs++;
          if (d && d.type === 'kong') counts.kongs++;
          return d;
        });
      },
    };
  }

  // Plays one deal with `ids[seat]` in each seat and adds it to `report`.
  async function playDeal(report, ids, dealSeed) {
    var game = E.createGame({ seed: dealSeed, humanSeat: false, dealer: dealSeed % 4, startPoints: START });
    game.round = ((dealSeed >>> 2) % 4) + 1;
    var counts = ids.map(function () { return { chows: 0, pungs: 0, kongs: 0 }; });
    var agents = ids.map(function (id, seat) { return counting(S.createAgent(id), counts[seat]); });
    // The opening target, read at each seat's first decision.
    var targets = [null, null, null, null];
    var withTargets = agents.map(function (agent, seat) {
      var bot = S.get(ids[seat]).bot;
      if (!bot.targetFor) return agent;
      var note = function () { if (!targets[seat]) targets[seat] = bot.targetFor(game, seat).id; };
      return {
        turn: function (g, s, o) { note(); return agent.turn(g, s, o); },
        claim: function (g, s, o) { note(); return agent.claim(g, s, o); },
      };
    });
    var res = await E.runHand(game, withTargets);
    report.hands++;
    if (res.type === 'draw') report.draws++;
    for (var seat = 0; seat < 4; seat++) {
      var st = report.strategies[ids[seat]];
      var mine = res.deltas[seat];
      st.hands++;
      st.points += mine;
      st.chows += counts[seat].chows;
      st.pungs += counts[seat].pungs;
      st.kongs += counts[seat].kongs;
      if (targets[seat]) st.targets[targets[seat]] = (st.targets[targets[seat]] || 0) + 1;
      if (res.type === 'draw') { st.draws++; continue; }
      if (res.winner === seat) {
        st.wins++;
        st.wonPoints += mine;
        var f = res.score.faan;
        st.faan += f;
        st.maxFaan = Math.max(st.maxFaan, f);
        if (f >= LIMIT) st.limitWins++;
        if (res.how === 'selfDraw') st.selfDraws++;
        else if (res.how === 'discard') st.discardWins++;
        else if (res.how === 'robKong') st.robKongWins++;
        else if (res.how === 'flowers') st.flowerWins++;
        if (res.melds.every(function (m) { return m.concealed; })) st.concealedWins++;
        st.winTurns += game.hand.seats[seat].discards.length;
        (res.score.items || []).forEach(function (it) {
          st.patterns[it.name] = (st.patterns[it.name] || 0) + 1;
        });
        // Who paid this winner, by strategy.
        for (var o = 0; o < 4; o++) {
          if (o === seat || !res.deltas[o]) continue;
          var oid = ids[o];
          st.vs[oid] = (st.vs[oid] || 0) - res.deltas[o];
          var os = report.strategies[oid];
          os.vs[ids[seat]] = (os.vs[ids[seat]] || 0) + res.deltas[o];
        }
      } else if (res.payer === seat && res.how !== 'flowers') {
        st.dealIns++;
        st.dealInPoints -= mine;
      } else if (res.how === 'selfDraw' && mine < 0) {
        st.selfDrawPaid -= mine;
      }
    }
    return res;
  }

  async function runMatch(options) {
    var lineup = options.lineup;
    if (!lineup || lineup.length !== 4) throw new Error('lineup needs four strategy ids');
    lineup.forEach(function (id) { if (!S.has(id)) throw new Error('unknown strategy: ' + id); });
    var deals = options.deals || 100;
    var seed = options.seed || 1;
    var rotations = options.rotate === false ? 1 : 4;
    var report = emptyReport(lineup);
    var t0 = Date.now();
    for (var d = 0; d < deals; d++) {
      var dealSeed = (seed + d) >>> 0;
      for (var r = 0; r < rotations; r++) {
        var ids = [0, 1, 2, 3].map(function (k) { return lineup[(k + r) % 4]; });
        var res = await playDeal(report, ids, dealSeed);
        if (options.onHand) options.onHand(res, ids, report);
      }
      report.deals++;
    }
    report.ms = Date.now() - t0;
    return report;
  }

  function addInto(a, b) {
    Object.keys(b).forEach(function (k) {
      if (typeof b[k] === 'number') {
        a[k] = k === 'maxFaan' ? Math.max(a[k] || 0, b[k]) : (a[k] || 0) + b[k];
      } else if (b[k] && typeof b[k] === 'object') {
        a[k] = a[k] || {};
        addInto(a[k], b[k]);
      }
    });
    return a;
  }

  function mergeReports(a, b) {
    var out = emptyReport(a.lineup);
    ['deals', 'hands', 'draws'].forEach(function (k) { out[k] = a[k] + b[k]; });
    out.ms = Math.max(a.ms, b.ms);
    [a, b].forEach(function (r) {
      Object.keys(r.strategies).forEach(function (id) {
        out.strategies[id] = addInto(out.strategies[id] || emptyStats(), r.strategies[id]);
      });
    });
    return out;
  }

  // Rates and averages for one strategy's totals.
  function summarize(st) {
    var per = function (n, d) { return d ? n / d : 0; };
    return {
      hands: st.hands,
      pointsPerHand: per(st.points, st.hands),
      winRate: per(st.wins, st.hands),
      selfDrawRate: per(st.selfDraws, st.hands),
      selfDrawShare: per(st.selfDraws, st.wins),
      dealInRate: per(st.dealIns, st.hands),
      avgFaan: per(st.faan, st.wins),
      avgWinPoints: per(st.wonPoints, st.wins),
      avgDealInPoints: per(st.dealInPoints, st.dealIns),
      concealedWinShare: per(st.concealedWins, st.wins),
      avgWinTurn: per(st.winTurns, st.wins),
      chowsPerHand: per(st.chows, st.hands),
      pungsPerHand: per(st.pungs, st.hands),
      kongsPerHand: per(st.kongs, st.hands),
    };
  }

  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function num(x, d) { return x.toFixed(d === undefined ? 1 : d); }
  function pad(s, n) { s = String(s); return s.length >= n ? s : s + new Array(n - s.length + 1).join(' '); }
  function lpad(s, n) { s = String(s); return s.length >= n ? s : new Array(n - s.length + 1).join(' ') + s; }

  function top(obj, n) {
    return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n);
  }

  function formatReport(report) {
    var ids = Object.keys(report.strategies);
    var rows = [
      ['Points per hand', function (s, t) { return num(t.pointsPerHand); }],
      ['Net points', function (s) { return Math.round(s.points).toLocaleString('en-US'); }],
      ['Wins', function (s, t) { return s.wins + ' (' + pct(t.winRate) + ')'; }],
      ['Self-draws', function (s, t) { return s.selfDraws + ' (' + pct(t.selfDrawShare) + ' of wins)'; }],
      ['Wins off a discard', function (s) { return s.discardWins; }],
      ['Robbed kongs / flowers', function (s) { return s.robKongWins + ' / ' + s.flowerWins; }],
      ['Dealt in (gave the winning tile)', function (s, t) { return s.dealIns + ' (' + pct(t.dealInRate) + ')'; }],
      ['Points paid dealing in', function (s, t) { return Math.round(s.dealInPoints).toLocaleString('en-US') + ' (avg ' + num(t.avgDealInPoints, 0) + ')'; }],
      ['Points paid to self-draws', function (s) { return Math.round(s.selfDrawPaid).toLocaleString('en-US'); }],
      ['Average faan of a win', function (s, t) { return num(t.avgFaan, 2); }],
      ['Average points of a win', function (s, t) { return num(t.avgWinPoints, 0); }],
      ['Biggest win (faan)', function (s) { return s.maxFaan; }],
      ['Limit hands', function (s) { return s.limitWins; }],
      ['Concealed wins', function (s, t) { return s.concealedWins + ' (' + pct(t.concealedWinShare) + ' of wins)'; }],
      ['Average turn of a win', function (s, t) { return num(t.avgWinTurn); }],
      ['Chows / pungs / kongs per hand', function (s, t) { return num(t.chowsPerHand, 2) + ' / ' + num(t.pungsPerHand, 2) + ' / ' + num(t.kongsPerHand, 2); }],
    ];
    var colW = 30;
    var out = [];
    out.push('Lineup: ' + report.lineup.join(', ') + ' (rotated through every seat)');
    out.push(report.deals + ' deals, ' + report.hands + ' hands, ' + report.draws + ' drawn (' + pct(report.draws / (report.hands || 1)) + '), ' + (report.ms / 1000).toFixed(1) + 's');
    out.push('');
    out.push(pad('', 34) + ids.map(function (id) { return lpad(id, colW); }).join(''));
    rows.forEach(function (row) {
      out.push(pad(row[0], 34) + ids.map(function (id) {
        var st = report.strategies[id];
        return lpad(row[1](st, summarize(st)), colW);
      }).join(''));
    });
    ids.forEach(function (id) {
      var st = report.strategies[id];
      out.push('');
      out.push(id + ':');
      var vs = Object.keys(st.vs).map(function (o) { return o + ' ' + (st.vs[o] >= 0 ? '+' : '') + Math.round(st.vs[o]).toLocaleString('en-US'); });
      if (vs.length) out.push('  net points against: ' + vs.join(', '));
      var pats = top(st.patterns, 8).map(function (p) { return p + ' ' + st.patterns[p]; });
      if (pats.length) out.push('  most common in wins: ' + pats.join(', '));
      var tg = top(st.targets, 10).map(function (p) { return p + ' ' + st.targets[p]; });
      if (tg.length) out.push('  opening targets: ' + tg.join(', '));
    });
    return out.join('\n');
  }

  var api = {
    runMatch: runMatch,
    playDeal: playDeal,
    mergeReports: mergeReports,
    summarize: summarize,
    formatReport: formatReport,
    emptyReport: emptyReport,
  };

  if (node) module.exports = api;
  else root.MahjongCompetition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
