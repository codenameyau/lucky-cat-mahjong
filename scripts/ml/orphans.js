#!/usr/bin/env node
/* Trains the learned Only Orphans (js/mahjong-only-orphans.js) the way the
   Neural Cat league is trained, measured against the rule-based Only Orphans
   (scripts/ml/baselines/only-orphans-rules.js) every round.

   Round 1 (bootstrap): --deals hands where the rule-based bot sits in about
   half the seats (exploring) against Neural Cat, Jorge Yau and Lucky Cat. Its
   positions are read through the learned strategy's foundation, and O1 is
   trained on them from scratch.
   Every round after:
     1. generate: --deals hands where the best model so far, exploring, sits in
        about half the seats, against Neural Cat, Jorge Yau, Lucky Cat and up
        to --members earlier models playing their best. Only its own seats
        are recorded.
     2. train: a new model from the best, on the last --keep rounds of data.
     3. rank: the new model, the best, the model in the game and the
        rule-based baseline each take
        one seat against Neural Cat, Jorge Yau and Lucky Cat, on the same
        --eval-deals deals (each rotated through every seat, new deals every
        round). The score is points a hand less the other's.
     4. keep: it becomes the best if it scored more than the best. A best that
        also beats the baseline by more than the margin, and by more than the
        model in the game on the same deals, is a milestone: it is shipped to
        js/mahjong-only-orphans-weights.js, so the game plays it.
   After every round the progress page (docs/strategies/only-orphans-training.md)
   is written again. With --publish, every round is committed, and from the
   first milestone on it is pushed to one pull request (a new one once that
   one is merged or closed). Commits only go out when npm test passes.

   State and a log are in ml/orphans/, so a stopped run picks up where it left
   off.

   npm run ml:orphans -- --rounds 20 --deals 50000 --publish

   Options:
     --rounds N       rounds to play this run (default 1)
     --deals N        hands to generate per round (default 50000)
     --keep N         rounds of data to train on (default 8)
     --members N      earlier models at the table (default 2)
     --sample P       chance each decision is recorded (default 0.25)
     --eval-deals N   deals per ranking, x4 seat rotations (default 9000)
     --publish        commit every round and push milestones to a pull request
     --dir DIR        state and log (default ml/orphans) */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ship } = require("./ship.js");
const { PYTHON } = require("./python.js");
const { parseArgs } = require("./args.js");

const ROOT = path.join(__dirname, "..", "..");
const LEARNER = "only-orphans";
const BASELINE = "only-orphans-rules";
const OPPONENTS = ["neural-cat", "jorge-yau", "lucky-cat"];
const DATA_SEED = 50000000; // round r's deals start at DATA_SEED + r * 1,000,000
const EVAL_SEED = 90000000; // round r's ranking deals start at EVAL_SEED + r * 10,000
const DOC = path.join("docs", "strategies", "only-orphans-training.md");
const WEIGHTS = path.join("js", "mahjong-only-orphans-weights.js");
const BRANCH = "feature/only-orphans-model";

let DIR = path.join(ROOT, "ml", "orphans");

function log(line) {
  const text = new Date().toISOString().slice(0, 19).replace("T", " ") + " " + line;
  console.log(text);
  fs.appendFileSync(path.join(DIR, "orphans.log"), text + "\n");
}

function run(cmd, args, opts) {
  opts = opts || {};
  log("$ " + cmd + " " + args.join(" "));
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32" && cmd === "npm" });
  const out = (res.stdout || "") + (res.stderr || "");
  fs.appendFileSync(path.join(DIR, "orphans.log"), out + "\n");
  if (res.status !== 0 && !opts.allowFail) throw new Error(cmd + " failed:\n" + out.slice(-2000));
  return { ok: res.status === 0, out };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

// One seat against Neural Cat, Jorge Yau and Lucky Cat, rotated through
// every seat: that seat's numbers.
function seat(id, deals, seed, name) {
  const json = path.join(DIR, "eval-" + name + ".json");
  run("node", ["scripts/competition.js", "--lineup", [id].concat(OPPONENTS).join(","), "--deals", String(deals),
    "--seed", String(seed), "--json", json]);
  const r = JSON.parse(fs.readFileSync(json, "utf8"));
  const s = r.summary[id];
  const raw = r.report.strategies[id];
  const p = raw.patterns || {};
  return {
    hands: s.hands,
    pointsPerHand: s.pointsPerHand,
    margin: s.pointsMargin,
    winRate: s.winRate,
    dealInRate: s.dealInRate,
    avgWinPoints: s.avgWinPoints,
    avgFaan: s.avgFaan,
    pungsPerHand: s.pungsPerHand,
    kongsPerHand: s.kongsPerHand,
    limitWins: raw.limitWins,
    thirteenOrphans: p["Thirteen Orphans"] || 0,
    patterns: p,
  };
}

function versus(a, b) {
  return { score: a.pointsPerHand - b.pointsPerHand, margin: Math.sqrt(a.margin * a.margin + b.margin * b.margin) };
}

/* ------------------------------------------------------------------ *
 * The progress page
 * ------------------------------------------------------------------ */

const pct = (x) => (100 * (x || 0)).toFixed(1) + "%";
const num = (x) => Math.round(x || 0).toLocaleString("en-US");
const signed = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1);
const vs = (v) => v ? signed(v.score) + " ± " + v.margin.toFixed(0) : "—";

function writeDoc(state) {
  const best = state.rounds.filter((r) => r.model === state.best)[0];
  const shipped = state.rounds.filter((r) => r.model === state.shipped)[0];
  const lines = [
    "# Only Orphans: training progress",
    "",
    "Generated by `npm run ml:orphans` (`scripts/ml/orphans.js`) after every round: do not edit by hand. How the model is trained and what it plays is in [the playbook](only-orphans.md).",
    "",
    "## Where it stands",
    "",
    "- **Games played:** " + num(state.deals) + " in " + state.rounds.length + " round" + (state.rounds.length === 1 ? "" : "s") + " of " + num(state.rounds.length ? state.rounds[state.rounds.length - 1].deals : 0) + ".",
    "- **Best model:** " + (best ? "`" + best.name + "`, " + vs(best.vsBaseline) + " points a hand against the rule-based baseline on its ranking" : "none yet") + ".",
    "- **In the game:** " + (shipped ? "`" + shipped.name + "` (`js/mahjong-only-orphans-weights.js`)." : "no model shipped yet: none has beaten the rule-based baseline by more than the margin."),
    "",
    "## Every round",
    "",
    "Each model takes one seat against Neural Cat, Jorge Yau and Lucky Cat, on the same deals as the best model, the model in the game and the rule-based baseline (" + num(state.evalDeals) + " deals, each played from every seat, new deals every round; rounds 1 to 4 used 3,000). Scores are points a hand, with the 95% margin. \"Kept\" means it beat the best and became the best. A milestone is a best that also beats the baseline by more than the margin and scores more than the model in the game on the same deals: it ships to the game.",
    "",
    "The opponents are whatever the game seats: from round 4, Neural Cat NC1, Lucky Cat's network LC20 and the newer Jorge Yau (rounds 1 to 3 played the models and bots before them), so scores from different tables don't compare directly.",
    "",
    "| Round | Model | Trained on | vs best | vs baseline | Points a hand | Wins | Deal-ins | Average win | Limit hands | Thirteen Orphans | Pungs | Result |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  state.rounds.forEach((r, k) => {
    const m = r.model ? r.self : null;
    lines.push("| " + (k + 1) + " | " + r.name + " | " + num(r.samples) + " | " + vs(r.vsBest) + " | " + vs(r.vsBaseline) + " | " +
      (m ? signed(m.pointsPerHand) : "—") + " | " + (m ? pct(m.winRate) : "—") + " | " + (m ? pct(m.dealInRate) : "—") + " | " +
      (m ? num(m.avgWinPoints) : "—") + " | " + (m ? m.limitWins : "—") + " | " + (m ? m.thirteenOrphans : "—") + " | " +
      (m ? m.pungsPerHand.toFixed(2) : "—") + " | " + (r.milestone ? "**milestone, shipped**" : r.kept ? "kept" : "not kept") + " |");
  });
  const b = state.rounds.length ? state.rounds[state.rounds.length - 1].baseline : null;
  if (b) {
    lines.push("", "## The rule-based baseline", "",
      "On the latest round's ranking deals, the rule-based Only Orphans scored " + signed(b.pointsPerHand) + " points a hand ± " + b.margin.toFixed(0) +
      ", winning " + pct(b.winRate) + " of hands (" + b.limitWins + " limit hands, " + b.thirteenOrphans + " Thirteen Orphans) and dealing in on " + pct(b.dealInRate) +
      ", with an average win of " + num(b.avgWinPoints) + " points.");
  }
  fs.writeFileSync(path.join(ROOT, DOC), lines.join("\n") + "\n");
}

/* ------------------------------------------------------------------ *
 * Publishing
 * ------------------------------------------------------------------ */

function git(args, allowFail) { return run("git", args, { allowFail }); }

function prBody(state) {
  const shipped = state.rounds.filter((r) => r.model === state.shipped)[0];
  const s = shipped.self, b = shipped.baseline;
  return [
    "Only Orphans is now a learned strategy: a neural network trained by self-play decides how it plays, inside the fixed rules that make it Only Orphans (1s, 9s and honors only, no chows). The rule-based bot it replaces is kept as the baseline in `scripts/ml/baselines/` and is no longer played at the table.",
    "",
    "## The model in the game: " + shipped.name,
    "",
    "| | " + shipped.name + " | Rule-based baseline |",
    "| --- | ---: | ---: |",
    "| Points a hand | **" + signed(s.pointsPerHand) + "** | " + signed(b.pointsPerHand) + " |",
    "| Wins | " + pct(s.winRate) + " | " + pct(b.winRate) + " |",
    "| Deal-ins | " + pct(s.dealInRate) + " | " + pct(b.dealInRate) + " |",
    "| Average win | " + num(s.avgWinPoints) + " | " + num(b.avgWinPoints) + " |",
    "| Limit hands | " + s.limitWins + " | " + b.limitWins + " |",
    "| Thirteen Orphans | " + s.thirteenOrphans + " | " + b.thirteenOrphans + " |",
    "",
    "One seat each against Neural Cat, Jorge Yau and Lucky Cat, on the same " + num(state.evalDeals) + " deals, each played from every seat: " + vs(shipped.vsBaseline) + " points a hand against the baseline (95% margin).",
    "",
    "Training so far: " + num(state.deals) + " games in " + state.rounds.length + " rounds. Every round is in [docs/strategies/only-orphans-training.md](../blob/" + state.branch + "/" + DOC.replace(/\\/g, "/") + ").",
    "",
    "This pull request is updated automatically after every training round. Merging it puts " + shipped.name + " in the game; the next milestone then opens a new pull request.",
  ].join("\n");
}

function publish(state, round) {
  const files = [DOC, WEIGHTS].filter((f) => fs.existsSync(path.join(ROOT, f)));
  // Wherever the open pull request stands: merged or closed means a new branch.
  if (state.pr) {
    const view = run("gh", ["pr", "view", String(state.pr), "--json", "state", "--jq", ".state"], { allowFail: true });
    const prState = view.ok ? view.out.trim() : "OPEN";
    if (prState !== "OPEN") {
      log("Pull request #" + state.pr + " is " + prState.toLowerCase() + ": the next milestone opens a new one");
      const next = BRANCH + "-r" + round.n;
      if (prState === "MERGED") {
        git(["fetch", "origin", "master"]);
        git(["stash", "--include-untracked"]);
        git(["switch", "-c", next, "origin/master"]);
        git(["stash", "drop"], true);
        // The generated files are written again on the new branch.
        writeDoc(state);
        if (state.shipped) ship(path.join(ROOT, state.shipped), "only-orphans");
      } else {
        git(["switch", "-c", next]);
      }
      state.branch = next;
      state.pr = null;
    }
  }
  const test = run("npm", ["test"], { allowFail: true });
  if (!test.ok) { log("npm test failed: nothing committed this round"); return; }
  git(["add", "--"].concat(files));
  const staged = git(["diff", "--cached", "--quiet"], true);
  if (!staged.ok) {
    const msg = round.milestone
      ? "Only Orphans " + round.name + ": " + vs(round.vsBaseline) + " points a hand against the rule-based bot"
      : "Only Orphans round " + round.n + ": " + round.name + " " + (round.kept ? "kept" : "not kept") + " (" + vs(round.vsBest) + " against the best)";
    git(["commit", "-m", msg]);
  }
  if (!state.shipped) { log("No milestone yet: committed locally, no pull request"); return; }
  git(["push", "-u", "origin", state.branch]);
  if (!state.pr) {
    const shipped = state.rounds.filter((r) => r.model === state.shipped)[0];
    const body = path.join(DIR, "pr-body.md");
    fs.writeFileSync(body, prBody(state));
    const made = run("gh", ["pr", "create", "--base", "master", "--head", state.branch, "--title",
      "Only Orphans: a learned model (" + shipped.name + ")", "--body-file", body]);
    const m = made.out.match(/\/pull\/(\d+)/);
    if (m) state.pr = parseInt(m[1], 10);
    log("Opened pull request #" + state.pr);
  } else if (round.milestone) {
    const shipped = state.rounds.filter((r) => r.model === state.shipped)[0];
    const body = path.join(DIR, "pr-body.md");
    fs.writeFileSync(body, prBody(state));
    run("gh", ["pr", "edit", String(state.pr), "--title", "Only Orphans: a learned model (" + shipped.name + ")", "--body-file", body], { allowFail: true });
    log("Updated pull request #" + state.pr);
  }
}

/* ------------------------------------------------------------------ *
 * The rounds
 * ------------------------------------------------------------------ */

function samplesOf(dirs) {
  return dirs.reduce((a, d) => {
    const f = path.join(ROOT, d, "manifest.json");
    return a + (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).samples : 0);
  }, 0);
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.dir) DIR = path.resolve(String(a.dir));
  fs.mkdirSync(DIR, { recursive: true });
  const STATE = path.join(DIR, "state.json");
  const args = {
    rounds: parseInt(a.rounds || 1, 10),
    deals: parseInt(a.deals || 50000, 10),
    keep: parseInt(a.keep || 8, 10),
    members: parseInt(a.members || 2, 10),
    sample: parseFloat(a.sample || 0.25),
    evalDeals: parseInt(a["eval-deals"] || 9000, 10),
    publish: !!a.publish,
  };
  let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
  if (!state) {
    state = { best: null, shipped: null, members: [], rounds: [], deals: 0, evalDeals: args.evalDeals, pr: null, branch: BRANCH };
    log("Only Orphans training starts from the rule-based bot");
  }
  state.evalDeals = args.evalDeals;

  for (let k = 0; k < args.rounds; k++) {
    const n = state.rounds.length + 1;
    const name = "O" + n;
    const data = path.posix.join("ml", "data", "orphans-" + n);
    const seed = DATA_SEED + n * 1000000;
    if (!state.best) {
      // Bootstrap: the rule-based bot plays, read through the learned foundation.
      log("Round " + n + ": " + args.deals + " deals, the rule-based bot (bootstrap)");
      const pool = [BASELINE, BASELINE, BASELINE].concat(OPPONENTS);
      run("node", ["scripts/ml/generate.js", "--learner", LEARNER, "--deals", String(args.deals), "--lineup", "mix", "--pool", pool.join(","),
        "--record", BASELINE, "--explore", "0.05", "--sample", String(args.sample), "--seed", String(seed), "--out", data]);
    } else {
      const members = state.members.filter((m) => m !== state.best).slice(-args.members).map((m) => "oo:" + m);
      log("Round " + n + ": " + args.deals + " deals, the best (" + state.best + ") exploring" + (members.length ? ", with " + members.join(", ") : ""));
      const pool = [LEARNER, LEARNER, LEARNER].concat(OPPONENTS, members);
      run("node", ["scripts/ml/generate.js", "--learner", LEARNER, "--deals", String(args.deals), "--lineup", "mix", "--pool", pool.join(","),
        "--weights", state.best, "--temperature", "150", "--epsilon", "0.05", "--explore", "0", "--record", LEARNER,
        "--sample", String(args.sample), "--seed", String(seed), "--out", data]);
    }
    state.deals += args.deals;
    const recent = state.rounds.map((x) => x.data).concat([data]).slice(-args.keep);
    log("Round " + n + ": training " + name + " on " + recent.join(", "));
    const train = state.best
      ? ["--init", state.best, "--lr", "3e-4", "--epochs", "8", "--patience", "3", "--dropout", "0.2", "--weight-decay", "1e-3"]
      : ["--epochs", "30", "--patience", "4"];
    run(PYTHON, ["ml/train.py", "--data"].concat(recent, ["--name", name, "--device-bytes", "8e9"], train));
    const model = path.posix.join("ml", "models", name + ".json");

    // Rank: the new model, the best and the baseline, on the same deals.
    const evalSeed = EVAL_SEED + n * 10000;
    const self = seat("oo:" + model, args.evalDeals, evalSeed, name);
    const baseline = seat(BASELINE, args.evalDeals, evalSeed, name + "-baseline");
    const bestSeat = state.best ? seat("oo:" + state.best, args.evalDeals, evalSeed, name + "-best") : null;
    const vsBaseline = versus(self, baseline);
    const vsBest = bestSeat ? versus(self, bestSeat) : null;
    const kept = !vsBest || vsBest.score > 0;
    // The model in the game, on the same deals (it's the best's seat when
    // the best is the one shipped).
    const shippedSeat = !state.shipped ? null : state.shipped === state.best ? bestSeat
      : seat("oo:" + state.shipped, args.evalDeals, evalSeed, name + "-shipped");
    const vsShipped = shippedSeat ? versus(self, shippedSeat) : null;
    // A milestone beats the baseline by more than the margin, and scores
    // more than the model in the game on the same deals. (Comparing against
    // the shipped model's own ranking would mix tables: the opponents, and
    // so every score, change when Neural Cat, Jorge Yau or Lucky Cat do.)
    const milestone = kept && vsBaseline.score > vsBaseline.margin && (!vsShipped || vsShipped.score > 0);
    const round = { n, name, data, model, samples: samplesOf(recent), deals: args.deals, evalDeals: args.evalDeals, self, baseline, best: bestSeat, shippedSeat, vsBest, vsShipped, vsBaseline, against: state.best, kept, milestone };
    log("Round " + n + ": " + name + " " + signed(self.pointsPerHand) + " points a hand; against the best " + vs(vsBest) + ", against the rule-based bot " + vs(vsBaseline) +
      (milestone ? " -> milestone" : kept ? " -> new best" : " -> kept " + state.best));
    state.rounds.push(round);
    if (kept) {
      state.best = model;
      state.members.push(model);
    }
    if (milestone) {
      ship(path.join(ROOT, model), "only-orphans");
      state.shipped = model;
      log("Shipped " + name + " to " + WEIGHTS);
    }
    writeDoc(state);
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
    if (args.publish) {
      try { publish(state, round); } catch (err) { log("Publishing failed: " + (err.stack || err.message)); }
      fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
    }
  }
  log("Done: " + state.deals + " deals. Best: " + state.best + ", in the game: " + (state.shipped || "none"));
}

try { main(); } catch (err) { log("FAILED: " + (err.stack || err.message)); process.exit(1); }
