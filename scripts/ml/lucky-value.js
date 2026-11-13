#!/usr/bin/env node
/* Lucky Cat's new lineage: the stacked evaluation, self-taught
   (js/mahjong-lucky-cat-value.js, docs/strategies/lucky-cat.md "The value").
   Lucky Cat's policy keeps choosing which few moves are worth a look; a value
   network, learned from Lucky Cat's own games and their replays, scores the
   position each of them leaves, and the best goes. No Jorge Yau options: the
   moves are the policy's.

   node scripts/ml/lucky-value.js --round 1 --deals 80000

   A round:
     1. Data on the native simulator (lcm-sim generate-lcv): the learner is
        the champion (LC32's policy, with the round's value from round 2 on)
        exploring, at a table of itself, LC32, Neural Cat and Jorge Yau; every
        seat recorded; option replays (each of the learner's top moves played
        on from the position). ml/data/lcv-<round>, cached by its manifest.
     2. A reader (ml/train.py --heads: who is ready, whether the tile thrown
        deals in, the hand it wins with) on the round's data.
     3. Values (ml/train.py) by recipe, each packed with the champion's
        policy into a Lucky Cat weights file (ml/models/LV<round><recipe>.json).
     4. Screens on the native simulator at the game's table against the
        champion, in stages; a model behind by more than --drop SE is dropped.
   State in ml/lv/state.json, log in ml/lv/lv.log.

   Options: --round N (default: the next), --deals N (80000), --workers N
   (CPU cores), --sample P (0.12), --option-replays K (12), --options N (4),
   --stages a,b,c (4000,16000,40000), --drop X (1), --candidate X (2),
   --recipes p,t,k, --top-k K (4), --objective points|win (points),
   --win-bonus B, --win-floor F (1).

   The objective (the maintainer's call, 2026-11-10): Lucky Cat maximizes
   points and keeps a fairly high win rate. With --objective points (the
   default) a screen judges points a hand against the champion, and hands won
   are a floor: a model more than --win-floor points of win rate behind (by
   --drop SE) is dropped, and a candidate must be ahead by --candidate SE of
   points and not behind the floor by more than 1 SE. The policy recipes learn
   each move's replayed mean points plus a bonus for a sure win (--q-points).
   (Round 1's LV1a: +14.0 points a hand over LC32 with 15.5% of hands won
   against 20.5%, which the floor would drop.) --objective win (rounds 2 and 3)
   judges hands won only. */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { PYTHON } = require("./python.js");
const N = require("./native.js");
const H = require("./heads.js");
const { parseArgs } = require("./args.js");

const ROOT = path.join(__dirname, "..", "..");
const SIM = path.join(ROOT, "native", "build", "lcm-sim" + (process.platform === "win32" ? ".exe" : ""));
const DATA_SEED = 70000000;     // round r's deals: DATA_SEED + (r - 1) * 1,000,000
const SCREEN_SEED = 940000000;  // fresh deals for screens, never the benchmark deck
const LC32 = "js/mahjong-lucky-cat-weights.js";
const OUTCOMES = ["winSelf", "winDiscard", "dealIn", "otherSelf", "otherWin", "draw"];

const RECIPES = {
  // The policy itself, taught from the option replays (ml/train_lucky.py --mode q): the
  // champion's shares tilted toward the moves whose replays won more often, by --tau
  // (a share of replays won). No value: the policy plays alone, as LC32 does.
  // With --objective points, a move's replays score its mean points plus qPoints a
  // sure win, and tau is in points; with --objective win, its share of wins (winTau).
  p: { what: "the policy, tilted toward the moves that scored more replays (tau 100 points, 300 a win)", policy: true, tau: "100", qPoints: "300", winTau: "0.05" },
  t: { what: "the same, gentler (tau 300 points)", policy: true, tau: "300", qPoints: "300", winTau: "0.15" },
  k: { what: "the same, leaning on wins (tau 100 points, 1,000 a win)", policy: true, tau: "100", qPoints: "1000", winTau: "0.02" },
  a: { what: "value from option replays and real endings, with the ranking loss", args: ["--options", "--rank-weight", "1"] },
  s: { what: "the same, stacked: the value reads the reader", args: ["--options", "--rank-weight", "1"], stacked: true },
  c: { what: "value from real endings only (the control)", args: [] },
};

const { readJson, writeJson } = require("./json.js");

function shard(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(SIM, ["generate-lcv"].concat(args), { cwd: ROOT });
    let o = "", e = "";
    p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (e += d));
    p.on("exit", (c) => (c ? reject(new Error("lcm-sim generate-lcv: " + e)) : resolve(JSON.parse(o))));
  });
}

async function makeData(dir, champ, r, a, log) {
  const manifest = path.join(dir, "manifest.json");
  if (fs.existsSync(manifest)) return readJson(manifest);
  fs.mkdirSync(dir, { recursive: true });
  const deals = parseInt(a.deals || 80000, 10), workers = parseInt(a.workers || os.cpus().length, 10);
  const learner = N.nativeId("lc:" + champ);
  const ids = ["learner", N.nativeId("lc:" + LC32), N.nativeId("neural-cat"), "jorge-yau"];
  if (ids.some((x) => !x) || !learner) throw new Error("lucky-value: a player can't run on the native simulator (node scripts/ml/native.js parity, then pin)");
  // The learner twice in the pool: half the seats are it.
  const pool = ["learner", "learner", ids[1], ids[2], ids[3]], strategies = [0, 0, 1, 2, 3];
  const names = ["learner", "lc32", "neural-cat", "jorge-yau"];
  log("Round " + r + ": " + deals + " deals on the native simulator, " + path.basename(champ) + " exploring against LC32, Neural Cat and Jorge Yau");
  const per = Math.ceil(deals / workers), jobs = [];
  for (let w = 0; w < workers; w++) {
    const first = w * per, count = Math.min(per, deals - first);
    if (count <= 0) break;
    const done = path.join(dir, "shard-" + w + ".done.json");
    const key = JSON.stringify([learner, pool, first, count, a.sample || 0.12, a["option-replays"] || 12, a.options || 4]);
    jobs.push(() => {
      const was = readJson(done, null);
      if (was && was.key === key) return Promise.resolve(was.result);
      return shard(["--weights", learner.slice(3), "--seed", String(DATA_SEED + (r - 1) * 1000000 + first), "--deals", String(count), "--shard", String(w),
        "--pool", pool.join(","), "--strategies", strategies.join(","), "--out", dir, "--sample", String(a.sample || 0.12),
        "--temperature", "1", "--epsilon", "0.1", "--option-replays", String(a["option-replays"] || 12), "--options", String(a.options || 4), "--option-share", "0.1"])
        .then((result) => { writeJson(done, { key, result }); return result; });
    });
  }
  const shards = await N.pool(jobs, workers);
  const m = {
    featureVersion: "lcv1", featureSize: 416, featureDtype: "float16", labelBytes: 16,
    auxBytes: H.AUX_BYTES, hands: H.HANDS, outcomes: OUTCOMES, strategies: names, learner: "learner",
    native: "fast", champion: champ,
    options: { replays: parseInt(a["option-replays"] || 12, 10), options: parseInt(a.options || 4, 10), share: 0.1, bytes: 56 },
    shards: shards.map((s) => ({ features: "shard-" + s.index + ".features", labels: "shard-" + s.index + ".labels", aux: "shard-" + s.index + ".aux",
      options: "shard-" + s.index + ".options", optlabels: "shard-" + s.index + ".optlabels", optionRows: s.optionRows, samples: s.samples, deals: s.deals })),
    samples: shards.reduce((t, s) => t + s.samples, 0),
  };
  writeJson(manifest, m);
  // Lucky Cat's own trainer reads the policy rows (shard-N.x.f16 and the rest) through meta.json.
  writeJson(path.join(dir, "meta.json"), { featureVersion: 1, featureSize: 376, rollouts: { slots: 8 }, qPoints: true,
    policyRows: shards.reduce((t, s) => t + (s.policyRows || 0), 0) });
  log("Round " + r + ": " + m.samples + " positions, " + shards.reduce((t, s) => t + s.optionGroups, 0) + " option groups");
  return m;
}

function train(args, log) {
  const res = spawnSync(PYTHON, ["ml/train.py"].concat(args), { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const tail = (res.stdout || "").trim().split("\n").slice(-4).join(" | ");
  if (res.status) throw new Error("train.py failed: " + (res.stderr || "").slice(-1500) + tail);
  log("  " + tail.slice(0, 600));
}

// Lucky Cat's weights: the champion's policy, with this value (and its reader).
function pack(policyFile, valueFile, out, play) {
  const pol = require("./weights.js").readWeights(policyFile);
  const v = readJson(path.join(ROOT, valueFile));
  v.meta.play = play;
  const w = Object.assign({}, pol, { value: v });
  w.meta = Object.assign({}, pol.meta, { value: v.meta.name, name: path.basename(out, ".json") });
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(w));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const dir = path.join(ROOT, "ml", "lv");
  const state = readJson(path.join(dir, "state.json"), null) || { champion: LC32, rounds: [] };
  const log = (line) => { const s = new Date().toISOString().slice(0, 19).replace("T", " ") + " " + line; console.log(s); fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, "lv.log"), s + "\n"); };
  const r = parseInt(a.round || state.rounds.length + 1, 10);
  const champ = state.champion;
  const data = path.join("ml", "data", "lcv-" + r);
  await makeData(path.join(ROOT, data), champ, r, a, log);
  // The values learn from this round's data and the round before's (--window 2).
  const windowN = parseInt(a.window || 2, 10), sets = [];
  for (let k = Math.max(1, r - windowN + 1); k <= r; k++) if (fs.existsSync(path.join(ROOT, "ml", "data", "lcv-" + k, "manifest.json"))) sets.push(path.join("ml", "data", "lcv-" + k));
  const winObjective = String(a.objective || "points") === "win";
  const winFloor = parseFloat(a["win-floor"] || 1);
  const play = { topK: parseInt(a["top-k"] || 4, 10), winBonus: parseFloat(a["win-bonus"] || (winObjective ? 100000 : 300)) };
  // The ranking loss's softmax temperature, in the value's units: 3,000 points of
  // win bonus is a 3% chance to win.
  const rankTemp = winObjective ? String(0.03 * play.winBonus) : "100";
  const recipes = String(a.recipes || "p,t,k").split(",");

  // The reader: the heads on the round's data.
  const reader = path.join("ml", "models", "LVR" + r);
  if (recipes.some((k) => RECIPES[k].stacked) && !fs.existsSync(path.join(ROOT, reader + ".heads.json"))) {
    log("Round " + r + ": training the reader LVR" + r);
    train(["--data", data, "--name", "LVR" + r, "--hidden", "512,256", "--heads", "--head-weight", "0.5", "--lr", "1e-3", "--epochs", "12", "--patience", "3"], log);
  }
  const models = [];
  // The champion's policy as JSON, for --init.
  const champPolicy = path.join("ml", "models", "LV" + r + "-init.json");
  if (!fs.existsSync(path.join(ROOT, champPolicy))) {
    const w = require("./weights.js").readWeights(champ);
    const pol = Object.assign({}, w); delete pol.value;
    fs.writeFileSync(path.join(ROOT, champPolicy), JSON.stringify(pol));
  }
  for (const k of recipes) {
    const rec = RECIPES[k];
    const name = "LVv" + r + k, packed = path.join("ml", "models", "LV" + r + k + ".json");
    if (rec.policy) {
      if (!fs.existsSync(path.join(ROOT, packed))) {
        log("Round " + r + ": training LV" + r + k + " [" + rec.what + "]");
        // Rounds before the mean points were recorded (.qp.f4) can't teach the points target.
        const qSets = sets.filter((d) => { const mt = readJson(path.join(ROOT, d, "meta.json"), null); return mt && (winObjective || mt.qPoints); });
        const q = winObjective ? ["--tau", rec.winTau, "--reward-clip", "1"] : ["--tau", rec.tau, "--q-points", rec.qPoints, "--reward-clip", "4000"];
        const res = spawnSync(PYTHON, ["ml/train_lucky.py", "--mode", "q", "--data"].concat(qSets,
          ["--name", "LV" + r + k, "--init", champPolicy], q, ["--lr", "3e-4", "--epochs", "4"]), { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
        if (res.status) throw new Error("train_lucky.py failed: " + (res.stderr || "").slice(-1500) + (res.stdout || "").slice(-800));
        log("  " + (res.stdout || "").trim().split("\n").filter((l) => /epoch|choices/.test(l)).slice(-3).join(" | ").slice(0, 600));
      }
      models.push({ name: "LV" + r + k, file: packed, recipe: k, alive: true, n: 0, sum: 0, sq: 0 });
      continue;
    }
    if (!fs.existsSync(path.join(ROOT, packed))) {
      log("Round " + r + ": training " + name + " [" + rec.what + "]");
      train(["--data"].concat(rec.stacked ? [data] : sets, ["--name", name, "--hidden", "512,256"]).concat([ "--lr", "1e-3", "--epochs", "12", "--patience", "3", "--win-bonus", String(play.winBonus), "--rank-temp", rankTemp])
        .concat(rec.stacked ? ["--reader", reader + ".heads.json"] : [], rec.args), log);
      pack(champ, path.join("ml", "models", name + ".json"), packed, play);
    }
    models.push({ name: "LV" + r + k, file: packed, recipe: k, alive: true, n: 0, sum: 0, sq: 0 });
    // --narrow: also the same value with the policy's best 2 only (keeps more of its wins).
    if (a.narrow && k === "a") {
      const narrow = path.join("ml", "models", "LV" + r + "a2.json");
      if (!fs.existsSync(path.join(ROOT, narrow))) pack(champ, path.join("ml", "models", name + ".json"), narrow, { topK: 2, winBonus: play.winBonus });
      models.push({ name: "LV" + r + "a2", file: narrow, recipe: "a", alive: true, n: 0, sum: 0, sq: 0 });
    }
  }
  // Screens against the champion at the game's table.
  const stages = String(a.stages || "4000,16000,40000").split(",").map(Number);
  const drop = parseFloat(a.drop || 1), keep = parseFloat(a.candidate || 2);
  let seed = SCREEN_SEED + r * 1000000;
  for (let s = 0; s < stages.length; s++) {
    for (const m of models.filter((x) => x.alive)) {
      const json = path.join(dir, "screens", m.name + "-" + s + ".json");
      if (!fs.existsSync(json)) writeJson(json, await require("./h2h.js").headToHead("lc:" + m.file, "lc:" + champ, null, seed, stages[s], parseInt(a.workers || os.cpus().length, 10)));
      const res = readJson(json);
      m.n += stages[s]; m.sum += res.gap.points * stages[s]; m.sq += Math.pow(res.gap.standardError * stages[s], 2);
      m.gap = m.sum / m.n; m.se = Math.sqrt(m.sq) / m.n;
      // Hands won, model less champion (points of win rate), pooled the same way.
      m.wsum = (m.wsum || 0) + 100 * res.gap.wins * stages[s]; m.wsq = (m.wsq || 0) + Math.pow(100 * res.gap.winsError * stages[s], 2);
      m.wgap = m.wsum / m.n; m.wse = Math.sqrt(m.wsq) / m.n;
      const x = res.models;
      m.last = x;
      if (winObjective ? m.wgap < -drop * m.wse : m.gap < -drop * m.se || m.wgap < -winFloor - drop * m.wse) m.alive = false;
      log("Round " + r + " stage " + (s + 1) + ": " + m.name + " hands won " + (m.wgap >= 0 ? "+" : "") + m.wgap.toFixed(2) + " ± " + m.wse.toFixed(2) +
        " points of win rate, " + (m.gap >= 0 ? "+" : "") + m.gap.toFixed(1) + " ± " + m.se.toFixed(1) + " points a hand over " + m.n +
        " deals | won " + (100 * x[0].wins).toFixed(1) + "% / " + (100 * x[1].wins).toFixed(1) + "%, dealt in " + (100 * x[0].dealIns).toFixed(1) + "% / " + (100 * x[1].dealIns).toFixed(1) +
        "%, " + x[0].averageFaan.toFixed(2) + " / " + x[1].averageFaan.toFixed(2) + " faan" + (m.alive ? "" : ": dropped"));
    }
    seed += stages[s];
  }
  const out = models.map((m) => {
    const [g, e] = winObjective ? [m.wgap, m.wse] : [m.gap, m.se];
    return { name: m.name, recipe: m.recipe, gap: m.gap, se: m.se, winGap: m.wgap, winSe: m.wse, deals: m.n, objective: winObjective ? "win" : "points",
      score: g, verdict: m.alive && g > keep * e && (winObjective || m.wgap >= -winFloor - m.wse) ? "candidate" : "not ahead" };
  });
  out.forEach((m) => log("Round " + r + ": " + m.name + " [" + RECIPES[m.recipe].what + "]: " + m.verdict + ", hands won " + (m.winGap >= 0 ? "+" : "") + m.winGap.toFixed(2) +
    " ± " + m.winSe.toFixed(2) + " points of win rate, " + (m.gap >= 0 ? "+" : "") + m.gap.toFixed(1) + " ± " + m.se.toFixed(1) + " points a hand"));
  const best = out.filter((m) => m.verdict === "candidate").sort((p, q) => q.score - p.score)[0];
  if (best) { state.champion = path.join("ml", "models", best.name + ".json"); log("Round " + r + ": " + best.name + " is the new champion (the bar: node scripts/ml/bench.js judge lc:" + state.champion + " --lineage lucky-cat)"); }
  state.rounds[r - 1] = { round: r, data, champion: champ, models: out };
  writeJson(path.join(dir, "state.json"), state);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
