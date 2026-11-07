#!/usr/bin/env node
/* Keeps only the training data in use. A set in ml/data/ stays while it is
   one the shipped model trained on, or in the league's training window (the
   last --window rounds, the one being played among them). Every other set
   goes to the Trash (~/.Trash), so a mistake can still be undone; emptying
   the Trash frees the space. Model weights (ml/models/) and reports
   (ml/league/, ml/tune/, ml/pairs/) are never touched, and a removed set's
   manifest stays on Hugging Face with the command that plays it again
   (scripts/ml/hf-data.js).

   The league prunes after every round (scripts/ml/league.js), and so does
   the Hugging Face uploader.

   node scripts/ml/prune-data.js            what would go, without moving anything
   node scripts/ml/prune-data.js --apply    move it to the Trash

   Options:
     --window N   league rounds of training data to keep (default 8, the league's --keep)
     --data DIR   the data folder (default ml/data)
     --league DIR the league's folder, for state.json (default ml/league) */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return null; }
}

// The sets whose data stays, or null with no league (keep everything).
function keptSets(window, leagueDir) {
  const state = readJson(path.join(leagueDir || path.join(ROOT, 'ml', 'league'), 'state.json'));
  if (!state) return null;
  const keep = new Set();
  const best = readJson(path.join(ROOT, state.best));
  ((best && best.meta && best.meta.data) || []).forEach((d) => keep.add(path.basename(d)));
  const playing = state.rounds.length + 1;
  for (let r = Math.max(1, playing - window + 1); r <= playing; r++) keep.add('league-' + r);
  return keep;
}

// Neural Cat's sets in `dataDir` that are no longer in use. Only its league
// and lab rounds (league-<n>, lab-<n>) are ever candidates: the bootstrap and
// self-play sets (j0, s1-s6) and other strategies' data (orphans-<n>) are
// never touched.
function unused(dataDir, keep) {
  if (!keep || !fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir).filter((n) => /^(league|lab)-\d+$/.test(n) &&
    fs.statSync(path.join(dataDir, n)).isDirectory() && !keep.has(n));
}

// Moves them to the Trash. Returns the names moved; with no Trash folder
// (not macOS), nothing moves and the caller is told why.
function prune(opts) {
  opts = opts || {};
  const dataDir = opts.data || path.join(ROOT, 'ml', 'data');
  // opts.keep: the caller's own set of names to keep (the lab's), instead of the league's.
  const gone = unused(dataDir, opts.keep || keptSets(opts.window || 8, opts.league));
  if (!opts.apply || !gone.length) return { names: gone, moved: false };
  const trash = path.join(os.homedir(), '.Trash');
  if (!fs.existsSync(trash)) return { names: gone, moved: false, reason: 'no ~/.Trash folder here: delete them yourself' };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  gone.forEach((n) => fs.renameSync(path.join(dataDir, n), path.join(trash, 'lucky-cat-mahjong-' + n + '-' + stamp)));
  return { names: gone, moved: true };
}

module.exports = { keptSets, unused, prune };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf('--' + k); return i === -1 ? undefined : argv[i + 1]; };
  const res = prune({
    apply: argv.indexOf('--apply') !== -1,
    window: parseInt(arg('window') || 8, 10),
    data: arg('data') ? path.resolve(arg('data')) : undefined,
    league: arg('league') ? path.resolve(arg('league')) : undefined,
  });
  if (!res.names.length) console.log('Nothing to prune.');
  else console.log((res.moved ? 'Moved to the Trash: ' : res.reason ? 'Not moved (' + res.reason + '): ' : 'Would move to the Trash (run with --apply): ') + res.names.join(', '));
}
