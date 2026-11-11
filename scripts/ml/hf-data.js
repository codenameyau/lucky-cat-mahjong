#!/usr/bin/env node
/* Uploads Neural Cat's training data (ml/data/<set>/, from npm run
   ml:generate) to a Hugging Face dataset repo, over git, Git LFS and SSH
   (no token: the repo must already exist, and your SSH key must be on your
   Hugging Face account; Git LFS must be installed).

   Only the data in use is kept: the rounds the shipped model trained on,
   and the league's training window (the last --window rounds, the one
   being played among them). Every other set keeps just its manifest.json,
   which records how it was made (seed, opponents, model, game version), so
   it can be generated again; the dataset card lists the command. When a set
   drops out, its shards are deleted and the repo's history is squashed to
   one commit (a force push), because Hugging Face keeps every file in the
   history otherwise.

   The same sets leave ml/data/ on this machine too, to the Trash
   (scripts/ml/prune-data.js). Model weights and reports stay.

   A league round still being played has no manifest yet, so it waits.

   Training data is published only when the maintainer explicitly asks for
   it (docs/machine-learning/hugging-face.md), so nothing is uploaded
   without --publish.

   npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games --publish

   Options:
     --publish          required: upload (without it, nothing happens)
     --repo OWNER/NAME  the Hugging Face dataset repo
     --sets a,b,...     which sets (default: j0, s1-s6 and every league round)
     --window N         league rounds of training data to keep (default 8,
                        the league's --keep)
     --watch            keep uploading league rounds until the league is done
     --every SECONDS    how often to check when watching (default 300) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { keptSets, prune } = require('./prune-data.js');

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

// The command that makes a set again, from its manifest.
function rebuild(name, m) {
  const c = m.config;
  const args = ['--deals', c.deals, '--lineup', c.lineup];
  if (c.pool) args.push('--pool', c.pool.join(','));
  if (c.weights) args.push('--weights', 'ml/models/' + path.basename(c.weights));
  ['temperature', 'epsilon', 'explore', 'sample', 'seed'].forEach((k) => { if (c[k] !== undefined) args.push('--' + k, c[k]); });
  return 'node scripts/ml/generate.js ' + args.join(' ') + ' --out ml/data/' + name;
}

function describe(name, m) {
  if (name === 'j0') return 'Bootstrap: the rule strategies (Jorge Yau, Lucky Cat, Only Orphans) in every seat, read through Neural Cat\'s features.';
  if (/^s\d$/.test(name)) return 'Self-play against the rule bots: Neural Cat (exploring) with Jorge Yau, Lucky Cat and Only Orphans. Discards only.';
  return 'League round ' + name.slice(7) + ': every seat a Neural Cat model, the best so far exploring against earlier bests. Discards, claims and kongs.';
}

function card(repo, sets, kept) {
  const first = sets.length ? JSON.parse(fs.readFileSync(path.join(DATA, sets[0], 'manifest.json'), 'utf8')) : null;
  const rows = sets.map((n) => {
    const m = JSON.parse(fs.readFileSync(path.join(DATA, n, 'manifest.json'), 'utf8'));
    return '| `data/' + n + '/` | ' + m.config.deals.toLocaleString('en-US') + ' | ' + m.samples.toLocaleString('en-US') + ' | ' +
      (kept(n) ? 'Yes' : 'Manifest only') + ' | ' + describe(n, m) + ' |';
  });
  const gone = sets.filter((n) => !kept(n)).map((n) => {
    const m = JSON.parse(fs.readFileSync(path.join(DATA, n, 'manifest.json'), 'utf8'));
    return '- `' + n + '` (game ' + m.gameVersion + '): `' + rebuild(n, m) + '`';
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

**${deals.toLocaleString('en-US')} hands, ${samples.toLocaleString('en-US')} positions** played so far. Only the sets in use have their positions here: the ones the shipped model was trained on, and the league rounds the next model trains on. The rest keep their \`manifest.json\`, which says how to play them again.

## What a position is

A decision point for one seat, described as the position the choice leaves: after a discard (the 13 tiles kept and the tile thrown), after passing a claim, or after a kong before its replacement tile. About 12–30% of decisions are recorded (\`config.sample\` in each manifest).

Only what that seat could see goes into the features: its own hand, every discard, every shown meld, counts of unseen tiles. Never the wall, another hand, or which tile a concealed kong is. The label is how the hand really ended.

## Sets

| Folder | Hands | Positions | Data here | What was played |
| --- | ---: | ---: | --- | --- |
${rows.join('\n')}
${gone.length ? `
## Playing a removed set again

From the [game's repo](https://github.com/codenameyau/lucky-cat-mahjong), with the models from [the model repo](https://huggingface.co/codenameyau/lucky-cat-mahjong/tree/main/neural-cat/models) in \`ml/models/\`. The same seed plays the same deals; the positions match exactly only with the game at the manifest's \`gameVersion\`. The first sets (\`j0\`, \`s1\`–\`s6\`) use models that are no longer published.

${gone.join('\n')}
` : ''}
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
  const keep = keptSets(args.window);
  const kept = (n) => !keep || keep.has(n);
  const added = [], removed = [];
  sets.forEach((n) => {
    const from = path.join(DATA, n), to = path.join(dir, 'data', n);
    const m = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'));
    fs.mkdirSync(to, { recursive: true });
    if (!fs.existsSync(path.join(to, 'manifest.json'))) {
      fs.copyFileSync(path.join(from, 'manifest.json'), path.join(to, 'manifest.json'));
      if (!kept(n)) added.push(n + ' (manifest only)');
    }
    m.shards.forEach((sh) => [sh.features, sh.labels].forEach((f) => {
      const here = path.join(to, f);
      if (kept(n) && !fs.existsSync(here)) {
        fs.linkSync(path.join(from, f), here); // no second copy on disk
        if (added.indexOf(n) === -1) added.push(n);
      } else if (!kept(n) && fs.existsSync(here)) {
        fs.unlinkSync(here);
        if (removed.indexOf(n) === -1) removed.push(n);
      }
    }));
  });
  if (added.length || removed.length) push(args, dir, sets, kept, added, removed);
  // The same sets leave this machine too (to the Trash).
  const local = prune({ apply: true, window: args.window });
  if (local.moved) log('Moved to the Trash: ' + local.names.join(', '));
}

// Git LFS keeps its own copy of each shard; the copy becomes a hard link
// to the shard (itself a link into ml/data/), so the data is on disk once.
function linkLfs(dir) {
  const out = git(dir, ['lfs', 'ls-files', '-l'], true).stdout || '';
  out.split('\n').forEach((line) => {
    const m = line.match(/^([0-9a-f]{64}) [*-] (.+)$/);
    if (!m) return;
    const obj = path.join(dir, '.git', 'lfs', 'objects', m[1].slice(0, 2), m[1].slice(2, 4), m[1]);
    const file = path.join(dir, m[2]);
    try {
      const a = fs.statSync(obj), b = fs.statSync(file);
      if (a.ino === b.ino || a.size !== b.size) return;
      fs.unlinkSync(obj);
      fs.linkSync(file, obj);
    } catch (err) { /* missing on one side: leave it */ }
  });
}

function push(args, dir, sets, kept, added, removed) {
  fs.writeFileSync(path.join(dir, 'README.md'), card(args.repo, sets, kept));
  const what = (added.length ? 'Add ' + added.join(', ') : '') + (added.length && removed.length ? '; ' : '') +
    (removed.length ? 'keep only the manifest of ' + removed.join(', ') : '');
  const said = what.charAt(0).toUpperCase() + what.slice(1);
  const msg = said + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
  const t0 = Date.now();
  if (removed.length) {
    // Hugging Face keeps every file in the history, so a set that drops out
    // only frees its space once the history is one commit.
    git(dir, ['checkout', '-q', '--orphan', 'squashed']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'Training data in use, with the manifest of every set\n\n' + said + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
    git(dir, ['branch', '-D', 'main']);
    git(dir, ['branch', '-m', 'main']);
    git(dir, ['push', '-q', '--force', 'origin', 'main']);
    // The old history's files are no longer needed here either.
    git(dir, ['reflog', 'expire', '--expire=now', '--all']);
    git(dir, ['gc', '-q', '--prune=now']);
    git(dir, ['lfs', 'prune']);
  } else {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', msg]);
    git(dir, ['push', '-q', 'origin', 'HEAD']);
  }
  linkLfs(dir);
  log(said + ' (' + Math.round((Date.now() - t0) / 1000) + 's): https://huggingface.co/datasets/' + args.repo);
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.publish) {
    console.log('Training data is published to Hugging Face only when the maintainer asks for it. Run again with --publish to upload.');
    return;
  }
  if (!a.repo || !/^[^/]+\/[^/]+$/.test(String(a.repo))) throw new Error('--repo OWNER/NAME is needed');
  const args = {
    repo: String(a.repo),
    remote: a.remote ? String(a.remote) : 'git@hf.co:datasets/' + String(a.repo), // --remote: another git URL, for testing
    sets: a.sets ? String(a.sets).split(',') : null,
    every: parseInt(a.every || 300, 10) * 1000,
    window: parseInt(a.window || 8, 10),
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
