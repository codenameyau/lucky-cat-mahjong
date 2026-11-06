#!/usr/bin/env node
/* Uploads Neural Cat's training data (ml/data/<set>/, from npm run
   ml:generate) to a Hugging Face dataset repo, over git, Git LFS and SSH
   (no token: the repo must already exist, and your SSH key must be on your
   Hugging Face account; Git LFS must be installed).

   Each finished set (one with a manifest.json) goes up as its own commit:
   data/<set>/manifest.json and its shards, with README.md (the dataset card).
   A league round still being played has no manifest yet, so it waits.

   npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games
   npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games --watch

   Options:
     --repo OWNER/NAME  the Hugging Face dataset repo
     --sets a,b,...     which sets (default: j0, s1-s6 and every league round)
     --watch            keep uploading league rounds until the league is done
     --every SECONDS    how often to check when watching (default 300) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'ml', 'data');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function git(dir, args, quiet) {
  const res = spawnSync('git', args, {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=20 -o BatchMode=yes', GIT_LFS_SKIP_SMUDGE: '1' }),
  });
  if (res.status !== 0 && !quiet) throw new Error('git ' + args.join(' ') + ' failed:\n' + (res.stderr || res.stdout).slice(-1500));
  return res;
}

function log(line) {
  console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + line);
}

// Which sets, in training order: the bootstrap, the rounds against the rule
// bots, then the league.
function defaultSets() {
  const names = fs.existsSync(DATA) ? fs.readdirSync(DATA) : [];
  const league = names.filter((n) => /^league-\d+$/.test(n)).sort((a, b) => parseInt(a.slice(7), 10) - parseInt(b.slice(7), 10));
  return ['j0', 's1', 's2', 's3', 's4', 's5', 's6'].filter((n) => names.indexOf(n) !== -1).concat(league);
}

function describe(name, m) {
  if (name === 'j0') return 'Bootstrap: the rule strategies (Jorge Yau, Lucky Cat, Only Orphans) in every seat, read through Neural Cat\'s features.';
  if (/^s\d$/.test(name)) return 'Self-play against the rule bots: Neural Cat (exploring) with Jorge Yau, Lucky Cat and Only Orphans. Discards only.';
  return 'League round ' + name.slice(7) + ': every seat a Neural Cat model, the best so far exploring against earlier bests. Discards, claims and kongs.';
}

function card(repo, sets) {
  const first = sets.length ? JSON.parse(fs.readFileSync(path.join(DATA, sets[0], 'manifest.json'), 'utf8')) : null;
  const rows = sets.map((n) => {
    const m = JSON.parse(fs.readFileSync(path.join(DATA, n, 'manifest.json'), 'utf8'));
    return '| `data/' + n + '/` | ' + m.config.deals.toLocaleString('en-US') + ' | ' + m.samples.toLocaleString('en-US') + ' | ' + describe(n, m) + ' |';
  });
  const deals = sets.reduce((s, n) => s + JSON.parse(fs.readFileSync(path.join(DATA, n, 'manifest.json'), 'utf8')).config.deals, 0);
  const samples = sets.reduce((s, n) => s + JSON.parse(fs.readFileSync(path.join(DATA, n, 'manifest.json'), 'utf8')).samples, 0);
  const groups = first ? Object.keys(first.groups).map((g) => '`' + g + '` ' + first.groups[g].start + '–' + (first.groups[g].end - 1)).join(', ') : '';
  return `---
tags:
  - mahjong
  - hong-kong-mahjong
  - game-ai
  - self-play
  - reinforcement-learning
pretty_name: Lucky Cat Mahjong training games
---

# Lucky Cat Mahjong training games

The data [Neural Cat](https://huggingface.co/codenameyau/lucky-cat-mahjong) is trained on: positions from simulated Hong Kong mahjong hands played in [Lucky Cat Mahjong](https://github.com/codenameyau/lucky-cat-mahjong), each labelled with how that hand ended for the player.

**${deals.toLocaleString('en-US')} hands, ${samples.toLocaleString('en-US')} positions** so far.

## What a position is

A decision point for one seat, described as the position the choice leaves: after a discard (the 13 tiles kept and the tile thrown), after passing a claim, or after a kong before its replacement tile. About 12–30% of decisions are recorded (\`config.sample\` in each manifest).

Only what that seat could see goes into the features: its own hand, every discard, every shown meld, counts of unseen tiles. Never the wall, another hand, or which tile a concealed kong is. The label is how the hand really ended.

## Sets

| Folder | Hands | Positions | What was played |
| --- | ---: | ---: | --- |
${rows.join('\n')}

## Format

Each folder has \`manifest.json\` and, per worker, \`shard-N.features\` and \`shard-N.labels\`:

- **features**: little-endian float16, ${first ? first.featureSize : 568} per position (feature version ${first ? first.featureVersion : 2}), in groups ${groups}. \`manifest.json\` lists them as \`groups\`; \`js/mahjong-ml-features.js\` in the game builds them.
- **labels**: 16 bytes per position: \`outcome\` (u8: 0 win by self-draw, 1 win off a discard, 2 dealt in, 3 someone else self-drew, 4 someone else won off a discard, 5 draw), \`winFaan\` (u8, 3–13 when the seat won), \`payFaan\` (u8, when it paid), \`turn\`, \`seat\`, \`strategy\` (u8, an index into the manifest's \`strategies\`), \`wallLeft\`, \`explored\` (u8 bits: 1 a random choice, 2 a position waiting for a tile), then \`delta\` (f32, the seat's points for the hand) and \`dealSeed\` (u32).

\`\`\`python
import json, numpy as np
d = 'data/league-1'
m = json.load(open(f'{d}/manifest.json'))
labels = np.dtype([('outcome', 'u1'), ('winFaan', 'u1'), ('payFaan', 'u1'), ('turn', 'u1'), ('seat', 'u1'),
                   ('strategy', 'u1'), ('wallLeft', 'u1'), ('explored', 'u1'), ('delta', '<f4'), ('dealSeed', '<u4')])
for s in m['shards']:
    x = np.fromfile(f"{d}/{s['features']}", dtype='<f2').reshape(-1, m['featureSize'])
    y = np.fromfile(f"{d}/{s['labels']}", dtype=labels)
\`\`\`

\`ml/train.py\` in the game's repo trains on these folders directly. Hold out whole deals (by \`dealSeed\`) for validation: positions from the same hand are close to each other.
`;
}

function sync(args) {
  const name = args.repo.split('/')[1];
  const dir = path.join(ROOT, 'ml', 'hf', 'datasets', name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(path.dirname(dir), ['clone', args.remote, name]);
    git(dir, ['lfs', 'install', '--local']);
  } else {
    git(dir, ['pull', '--ff-only'], true);
  }
  git(dir, ['lfs', 'track', '*.features', '*.labels']);
  const sets = (args.sets || defaultSets()).filter((n) => fs.existsSync(path.join(DATA, n, 'manifest.json')));
  const up = (n) => fs.existsSync(path.join(dir, 'data', n, 'manifest.json'));
  sets.filter((n) => !up(n)).forEach((n) => {
    const from = path.join(DATA, n), to = path.join(dir, 'data', n);
    fs.mkdirSync(to, { recursive: true });
    const m = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'));
    m.shards.forEach((s) => [s.features, s.labels].forEach((f) => {
      if (!fs.existsSync(path.join(to, f))) fs.linkSync(path.join(from, f), path.join(to, f)); // no second copy on disk
    }));
    fs.copyFileSync(path.join(from, 'manifest.json'), path.join(to, 'manifest.json'));
    const done = sets.filter((x) => up(x) || x === n);
    fs.writeFileSync(path.join(dir, 'README.md'), card(args.repo, done));
    git(dir, ['add', '-A']);
    const mb = m.shards.reduce((s, sh) => s + fs.statSync(path.join(from, sh.features)).size + fs.statSync(path.join(from, sh.labels)).size, 0) / 1e6;
    git(dir, ['commit', '-q', '-m', 'Add ' + n + ': ' + m.config.deals.toLocaleString('en-US') + ' hands, ' + m.samples.toLocaleString('en-US') +
      ' positions\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
    const t0 = Date.now();
    git(dir, ['push', '-q', 'origin', 'HEAD']);
    log('Pushed ' + n + ' (' + Math.round(mb) + ' MB in ' + Math.round((Date.now() - t0) / 1000) + 's) to https://huggingface.co/datasets/' + args.repo);
  });
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.repo || !/^[^/]+\/[^/]+$/.test(String(a.repo))) throw new Error('--repo OWNER/NAME is needed');
  const args = {
    repo: String(a.repo),
    remote: a.remote ? String(a.remote) : 'git@hf.co:datasets/' + String(a.repo), // --remote: another git URL, for testing
    sets: a.sets ? String(a.sets).split(',') : null,
    every: parseInt(a.every || 300, 10) * 1000,
  };
  const leagueLog = path.join(ROOT, 'ml', 'league', 'league.log');
  const finished = () => fs.existsSync(leagueLog) && /\b(Done: |FAILED: )/.test(fs.readFileSync(leagueLog, 'utf8').split('\n').slice(-40).join('\n'));
  sync(args);
  if (!a.watch) return;
  const tick = () => {
    try { sync(args); } catch (err) { log('Upload failed, trying again next time: ' + err.message.split('\n')[0]); }
    if (finished()) { try { sync(args); } catch (err) { log('Upload failed: ' + err.message.split('\n')[0]); } log('The league is done.'); return; }
    setTimeout(tick, args.every);
  };
  setTimeout(tick, args.every);
}

try { main(); } catch (err) { console.error(err.message); process.exit(1); }
