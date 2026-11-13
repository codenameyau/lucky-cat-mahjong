#!/usr/bin/env node
/* Paired evaluation: one strategy's seat, deal by deal, so two versions of
   it (even two versions of the code) can be compared on the same deals with
   the error of the difference, not of each score alone.

   run: plays `--deals` deals from `--seed`, each from every seat rotation
   (the competition's deals), and writes what the first strategy of the
   lineup scored on each deal (summed over the four rotations), its wins,
   points won and deal-ins.

     node scripts/ml/paired.js run --lineup oo:ml/models/O5.json,neural-cat,jorge-yau,lucky-cat \
       --deals 20000 --seed 93000000 --workers 3 --out ml/paired/O5.json [--root DIR]

   --rotations 1 plays each deal once, the strategy in the first seat (the
   dealer moves with the deal), for a quarter of the time.

   --root runs another copy of the game's code (a snapshot of the old
   version, say): its js/ and scripts/ml/baselines/.

   compare: the difference between two runs on the deals both have played
   (a run in progress too), per hand, with its 95% margin.

     node scripts/ml/paired.js compare ml/paired/new.json ml/paired/old.json */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function load(root, lineup) {
  const S = require(path.join(root, "js", "mahjong-strategies.js"));
  const reg = require(path.join(root, "scripts", "ml", "baselines", "register.js"));
  reg.addBaselines();
  reg.addOrphanModels(lineup);
  const ML = require(path.join(root, "js", "mahjong-ml.js"));
  lineup.filter((id) => /^ml:/.test(id) && !S.has(id)).forEach((id) => {
    const weights = JSON.parse(fs.readFileSync(path.resolve(id.slice(3)), "utf8"));
    S.addLab({ id, name: id, bot: ML.create({ id, weights, fast: true }) });
  });
  return require(path.join(root, "js", "mahjong-competition.js"));
}

if (!isMainThread) {
  const { root, lineup, deals, seed, rotations } = workerData;
  const C = load(root, lineup);
  const me = lineup[0];
  let row = null, batch = [], d = 0;
  C.runMatch({
    lineup, deals, seed, rotate: rotations !== 1,
    onHand(res, ids) {
      if (!row) row = [seed + d, 0, 0, 0, 0, 0, 0];
      const seat = ids.indexOf(me);
      row[6]++;
      row[1] += res.deltas[seat];
      if (res.type !== "draw" && res.winner === seat) { row[2]++; row[3] += res.deltas[seat]; row[5] += res.score.faan; }
      else if (res.type !== "draw" && res.payer === seat && res.how !== "flowers") row[4]++;
      if (row[6] === rotations) {
        batch.push(row.slice(0, 6));
        row = null;
        d++;
        if (batch.length === 25) { parentPort.postMessage({ rows: batch }); batch = []; }
      }
    },
  }).then(() => parentPort.postMessage({ rows: batch, done: true }));
  return;
}

// A row is one deal: [seed, points, wins, points won, deal-ins, faan won],
// summed over its four seat rotations. The file is written as deals finish,
// so a run can be compared while it plays.
async function runAll(a) {
  const root = path.resolve(String(a.root || path.join(__dirname, "..", "..")));
  const lineup = String(a.lineup).split(",");
  const deals = parseInt(a.deals || 1000, 10);
  const seed = parseInt(a.seed || 93000000, 10);
  const workers = Math.max(1, Math.min(deals, parseInt(a.workers || Math.max(1, os.cpus().length - 1), 10)));
  const per = Math.ceil(deals / workers);
  const rotations = parseInt(a.rotations || 4, 10) === 1 ? 1 : 4;
  const file = path.resolve(String(a.out));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const t0 = Date.now();
  const rows = [];
  const save = (done) => {
    const out = { lineup, seed, deals, rotations, root, done: !!done, ms: Date.now() - t0, rows: rows.slice().sort((x, y) => x[0] - y[0]) };
    fs.writeFileSync(file + ".tmp", JSON.stringify(out));
    fs.renameSync(file + ".tmp", file);
    return out;
  };
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const first = w * per;
    const count = Math.min(per, deals - first);
    if (count <= 0) break;
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: { root, lineup, deals: count, seed: seed + first, rotations } });
      worker.on("message", (m) => {
        rows.push(...m.rows);
        if (m.done) resolve(); else save(false);
      });
      worker.once("error", reject);
    }));
  }
  await Promise.all(jobs);
  const out = save(true);
  const s = stats(out);
  console.log(lineup[0] + ": " + s.pointsPerHand.toFixed(1) + " ± " + s.margin.toFixed(1) + " points a hand, wins " + (100 * s.winRate).toFixed(2) + "%, average win " + Math.round(s.avgWin) +
    ", deal-ins " + (100 * s.dealInRate).toFixed(2) + "% (" + deals + " deals, " + Math.round(out.ms / 1000) + " s)");
}

function stats(run) {
  const n = run.rows.length;
  const k = run.rotations || 4; // hands a deal
  let p = 0, p2 = 0, w = 0, won = 0, d = 0, f = 0;
  run.rows.forEach((r) => { p += r[1]; p2 += r[1] * r[1]; w += r[2]; won += r[3]; d += r[4]; f += r[5]; });
  const mean = p / n; // points a deal (k hands)
  const sd = Math.sqrt(Math.max(0, p2 / n - mean * mean));
  return {
    deals: n, pointsPerHand: mean / k, margin: 1.96 * sd / Math.sqrt(n) / k,
    winRate: w / (k * n), avgWin: w ? won / w : 0, avgFaan: w ? f / w : 0, dealInRate: d / (k * n),
  };
}

// The two runs on the deals both have played.
function compare(fileA, fileB) {
  const A = JSON.parse(fs.readFileSync(fileA, "utf8"));
  const B = JSON.parse(fs.readFileSync(fileB, "utf8"));
  const bySeed = new Map(B.rows.map((r) => [r[0], r]));
  const a = [], b = [];
  A.rows.forEach((r) => { if (bySeed.has(r[0])) { a.push(r); b.push(bySeed.get(r[0])); } });
  const n = a.length;
  if (!n) throw new Error("no deals in common");
  const k = A.rotations || 4;
  if ((B.rotations || 4) !== k) throw new Error("not the same seat rotations");
  let s = 0, s2 = 0, ws = 0, ws2 = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i][1] - b[i][1]) / k;
    s += d; s2 += d * d;
    const dw = (a[i][2] - b[i][2]) / k;
    ws += dw; ws2 += dw * dw;
  }
  const mean = s / n;
  const margin = 1.96 * Math.sqrt(Math.max(0, s2 / n - mean * mean) / n);
  const wmean = ws / n;
  const wmargin = 1.96 * Math.sqrt(Math.max(0, ws2 / n - wmean * wmean) / n);
  return { a: stats({ rows: a, rotations: k }), b: stats({ rows: b, rotations: k }), points: mean, margin, wins: wmean, winMargin: wmargin, deals: n };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  if (cmd === "run") runAll(a).catch((err) => { console.error(err.stack || err); process.exit(1); });
  else if (cmd === "compare") {
    const r = compare(a._[1], a._[2]);
    const line = (name, s) => name + ": " + s.pointsPerHand.toFixed(1) + " ± " + s.margin.toFixed(1) + " points a hand, wins " + (100 * s.winRate).toFixed(2) + "%, average win " + Math.round(s.avgWin) + " (" + s.avgFaan.toFixed(2) + " faan), deal-ins " + (100 * s.dealInRate).toFixed(2) + "%";
    console.log(line(a._[1], r.a));
    console.log(line(a._[2], r.b));
    console.log("difference: " + (r.points >= 0 ? "+" : "") + r.points.toFixed(1) + " ± " + r.margin.toFixed(1) + " points a hand (paired, 95%), wins " +
      (r.wins >= 0 ? "+" : "") + (100 * r.wins).toFixed(2) + " ± " + (100 * r.winMargin).toFixed(2) + " points, " + r.deals + " deals");
  } else {
    console.error("usage: paired.js run|compare (see the top of the file)");
    process.exit(1);
  }
}

module.exports = { stats, compare };
