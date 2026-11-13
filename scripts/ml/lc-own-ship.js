#!/usr/bin/env node
/* The fixed ship table (the orchestrator, 2026-11-11): candidates paired against lc32 with lc32, lc31
   and lc30 in the other seats, never newer generations, on the same fresh exact deals, plus every
   candidate against every other on those deals.

   node scripts/ml/lc-own-ship.js --cands ml/models/LO9d.json,ml/models/LO2a.json --seed S --runs 80000,80000 */
"use strict";
const path = require("node:path");
const O = require("./lc-own.js");
const a = process.argv.slice(2), arg = (k, d) => (a.includes("--" + k) ? a[a.indexOf("--" + k) + 1] : d);
const cands = arg("cands").split(","), seed = parseInt(arg("seed"), 10), runs = arg("runs", "80000,80000").split(",").map(Number);
const TABLE = ["lc32", "lc31", "lc30"].map((m) => "ml/models/" + m + ".json");
const fmt = (x, d = 1) => (x >= 0 ? "+" : "") + x.toFixed(d);
(async () => {
  const ids = [O.nid("ml/models/lc32.json")].concat(cands.map(O.nid));
  let blocks = ids.map(() => []), from = 0;
  for (const n of runs) {
    const res = await O.playDeck(ids, TABLE, seed, from, from + n, { exact: true });
    res.forEach((b, k) => { blocks[k] = blocks[k].concat(b); });
    from += n;
  }
  const names = ["lc32"].concat(cands.map((f) => path.basename(f, ".json")));
  const out = {};
  for (let i = 1; i < ids.length; i++) for (let j = 0; j < i; j++) {
    const p = O.paired(blocks[i], blocks[j]), me = O.summarize(blocks[i]), ch = O.summarize(blocks[j]);
    out[names[i] + "|" + names[j]] = { pair: p, me, ch };
    console.log(names[i] + " against " + names[j] + ": " + fmt(p.gap) + " ± " + p.se.toFixed(1) + " points a hand (half spicy " + fmt(p.halfGap, 2) + " ± " + p.halfSe.toFixed(2) +
      "), hands won " + fmt(p.winGap, 2) + " ± " + p.winSe.toFixed(2) + " (" + (100 * me.winRate).toFixed(2) + "% vs " + (100 * ch.winRate).toFixed(2) + "%), deal-ins " +
      fmt(p.dealInGap, 2) + " ± " + p.dealInSe.toFixed(2) + ", average win " + Math.round(me.avgWin) + " vs " + Math.round(ch.avgWin) + ", " + p.deals + " deals");
  }
  require("node:fs").writeFileSync(path.join(O.OUT, "ship-fixed-" + seed + ".json"), JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e.stack); process.exit(1); });
