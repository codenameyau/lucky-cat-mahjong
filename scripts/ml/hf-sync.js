#!/usr/bin/env node
/* Uploads Neural Cat's league models to a Hugging Face model repo, over git
   and SSH (no token: the repo must already exist, and your SSH key must be
   on your Hugging Face account).

   Every model that became the league's best goes up as its own commit:
   models/<name>.json, neural-cat.json (the best so far, the one the game
   ships), all in neural-cat/, and Neural Cat's section of README.md (the
   model card, with the results so far; other sections are left alone).

   npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong
   npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong --watch

   Options:
     --repo OWNER/NAME  the Hugging Face model repo
     --state FILE       the league's state (default ml/league/state.json)
     --watch            keep checking for new bests until the league is done
     --every SECONDS    how often to check when watching (default 120)
     --folder NAME      the folder in the repo (default neural-cat) */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

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
    cwd: dir, encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=20 -o BatchMode=yes' }),
  });
  if (res.status !== 0 && !quiet) throw new Error('git ' + args.join(' ') + ' failed:\n' + (res.stderr || res.stdout));
  return res;
}

function log(line) {
  console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + line);
}

const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);
const pct = (p) => (100 * (p || 0)).toFixed(1) + '%';

// The README is shared with other models in the repo: Neural Cat's part sits
// between these markers, and the rest is left as it is.
const START = '<!-- neural-cat:start -->';
const END = '<!-- neural-cat:end -->';
const HEADER = `---
tags:
  - mahjong
  - hong-kong-mahjong
  - game-ai
  - self-play
  - reinforcement-learning
---

# Lucky Cat Mahjong models

The learned strategies of [Lucky Cat Mahjong](https://github.com/codenameyau/lucky-cat-mahjong), a Hong Kong mahjong game with a coach. Each model has its own folder.

`;

// The card's front matter names the dataset, so Hugging Face links the two.
function withDataset(text) {
  if (!/^---\n/.test(text) || /\ndatasets:\n/.test(text.split('\n---')[0])) return text;
  return text.replace(/^---\n/, '---\ndatasets:\n  - codenameyau/lucky-cat-mahjong-games\n');
}

function readme(old, section) {
  return withDataset(readmeText(old, section));
}

function readmeText(old, section) {
  const part = START + '\n' + section.trim() + '\n' + END;
  if (old && old.indexOf(START) !== -1 && old.indexOf(END) !== -1) {
    return old.slice(0, old.indexOf(START)) + part + old.slice(old.indexOf(END) + END.length);
  }
  return (old && old.trim() ? old.trimEnd() + '\n\n' : HEADER) + part + '\n';
}


// How a model did in its evaluation against the best before it: the same
// deals, so the two are measured against each other (ml/league/eval-<name>-vs-best.json).
function headToHead(state, r) {
  const where = path.join(ROOT, 'ml', 'league', 'eval-' + r.name + '-vs-best.json');
  if (!fs.existsSync(where)) return null;
  const report = JSON.parse(fs.readFileSync(where, 'utf8')).report;
  const find = (model) => report.strategies[Object.keys(report.strategies).find((k) => k.endsWith(path.basename(model)))];
  const a = find(r.model);
  const b = find(r.against);
  if (!a || !b) return null;
  const read = (x) => ({
    hands: x.hands, wins: x.wins, dealIns: x.dealIns, limits: x.limitWins, concealed: x.concealedWins,
    avgWin: x.wins ? x.wonPoints / x.wins : 0, winRate: x.wins / x.hands, dealInRate: x.dealIns / x.hands,
  });
  return { deals: report.deals, mine: read(a), theirs: read(b) };
}

function readMeta(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).meta || {}; } catch (err) { return {}; }
}

// What the newest bests improved (the last two), from their evaluations and
// training details, newest first.
function latestBest(state) {
  return state.rounds.filter((x) => x.kept && x.vsBest && x.against !== state.anchor).slice(-2).reverse()
    .map((r) => improved(state, r)).join('\n');
}

function improved(state, r) {
  const prev = path.basename(r.against, '.json');
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const mine = readMeta(r.model);
  const before = readMeta(r.against);
  const lines = [];
  const margin = r.vsBest.margin;
  const clear = margin ? Math.abs(r.vsBest.score) > margin : null;
  lines.push('- **Head to head:** ' + signed(r.vsBest.score) + ' points a hand against ' + prev + (margin ? ' (± ' + margin.toFixed(0) + ', 95%)' : '') +
    (clear === false ? ', within the noise of one evaluation' : clear ? ', a lead beyond the noise' : '') + '.');
  const h = headToHead(state, r);
  if (h) {
    const m = h.mine, t = h.theirs;
    const change = (a, b) => (b ? (a >= b ? '+' : '−') + Math.abs(100 * (a - b) / b).toFixed(0) + '%' : '');
    lines.push('- **Where the points come from** (' + num(h.deals) + ' new deals, ' + r.name + ' against ' + prev + ' on the same hands): its average win pays ' + num(m.avgWin) +
      ' points against ' + num(t.avgWin) + ' (' + change(m.avgWin, t.avgWin) + '), it wins ' + pct(m.winRate) + ' of hands against ' + pct(t.winRate) +
      ', deals in on ' + pct(m.dealInRate) + ' against ' + pct(t.dealInRate) + ', and wins a limit hand ' + num(m.limits) + ' times against ' + num(t.limits) + '.');
  }
  if (mine.valOutcomeAcc) {
    lines.push('- **How well it reads a hand:** on positions it was not trained on it names how the hand ends ' + pct(mine.valOutcomeAcc) + ' of the time' +
      (before.valOutcomeAcc ? ' (' + prev + ': ' + pct(before.valOutcomeAcc) : '') +
      (before.valOutcomeAcc && state.anchor ? ', s5: ' + pct(readMeta(state.anchor).valOutcomeAcc) : '') + (before.valOutcomeAcc ? ')' : '') +
      ', and its outcome loss is ' + (mine.valOutcomeLoss || 0).toFixed(3) + (before.valOutcomeLoss ? ' (' + prev + ': ' + before.valOutcomeLoss.toFixed(3) + ')' : '') + '.');
  }
  if (mine.samples) {
    lines.push('- **Trained on** ' + num(mine.samples) + ' positions from ' + (mine.data ? mine.data.length : '') + ' league rounds' +
      (before.samples ? ' (' + prev + ': ' + num(before.samples) + ')' : '') + ', starting from ' + prev + '.');
  }
  return '### What ' + r.name + ' improved\n\n' + lines.join('\n') + '\n';
}

function modelCard(repo, state, uploaded) {
  const best = path.basename(state.best, '.json');
  // The name the game shows (NC1, NC2, ...), when the shipped weights are this model.
  let shipped = null;
  try { shipped = require(path.join(ROOT, 'js', 'mahjong-ml-weights.js')).meta; } catch (err) { shipped = null; }
  const release = shipped && shipped.trainedName === best && shipped.name !== best ? shipped.name : null;
  const kept = state.rounds.filter((r) => r.kept);
  const score = (e) => (e ? signed(e.score) + ' points' + (e.margin ? ' \u00b1 ' + e.margin.toFixed(0) : '') : '\u2014');
  const rows = state.rounds.map((r) => '| ' + r.name + ' | ' + path.basename(r.against, '.json') + ' | ' + score(r.vsBest) +
    ' | ' + score(r.vsAnchor) + ' | ' + pct(r.vsBest.winRate) + ' | ' + pct(r.vsBest.dealInRate) + ' | ' +
    Math.round(r.vsBest.avgWinPoints || 0).toLocaleString('en-US') + ' points | ' + (r.kept ? 'yes' : 'no') + ' |');
  const done = state.rounds.length;
  return `## Neural Cat (\`neural-cat/\`)

Neural Cat is a learned strategy in the game. A small neural network scores each choice a player has (which tile to discard, whether to claim a pung, chow or kong, whether to declare a kong) in expected points, and the choice worth the most is played. Wins that come often and wins that pay big are weighed on the same scale.

**Current best: \`${best}\`**${release ? ', called ' + release + ' in the game,' : ''} (\`neural-cat/neural-cat.json\`), after ${done} league round${done === 1 ? '' : 's'} (${state.deals.toLocaleString('en-US')} simulated hands).

### How it plays

- It reads the position through Jorge Yau's hand reading (the target hand, steps from ready, live tiles, deal-in risk) and describes the position each choice leaves as 568 numbers in seven groups: tiles kept, tile thrown, what the table shows, the wall and seat, speed, hand value and safety.
- The network (568 → 256 → 128 → 28, ReLU) predicts how the hand ends: win by self-draw or off a discard, deal in, someone else self-draws or wins, or a draw, and the faan of the win collected and of the hand paid for.
- Those make one number, expected points on the full-spicy payout table. It picks among Jorge Yau's three best discards, and overrules Jorge Yau's claim or kong call when its own pick is worth more.

**It plays fair.** It sees only what its seat can see: its own hand, every discard, every shown meld, how many tiles are left. Never the wall, another player's hand, or which tile a concealed kong is. A test in the game's repo makes every decision twice, once with every hidden tile shuffled, and fails if anything changes.

### Training

1. **Bootstrap**: trained on hands played by the rule-based strategies (Jorge Yau, Lucky Cat, Only Orphans).
2. **Self-play against the rule bots** (s1 to s6, discards only): s5 was kept.
3. **League**: every seat is a Neural Cat model, never a rule bot. Half the seats are the best model so far, exploring; the rest are earlier best models, s5 always among them. Each round plays 50,000 new hands, trains a new model from the best on the last 400,000 hands, and plays it head to head against the best (two seats each, every seat rotation, 2,000 new deals). It becomes the best only if it scores more points a hand.

The data is public: [codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games). Trained with PyTorch on an Apple GPU. Each position is labelled with how its hand really ended: the only thing from the future it learns from, and only in training.

${latestBest(state)}
### League results

Points a hand (the model's points a hand less its opponent's), with a 95% margin where measured, against the best model of its round, and against s5 (the model that shipped before the league), on the same deals:

| Model | Played against | vs best | vs s5 | Wins | Deal-ins | Average win | Kept |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}

### Files

- \`neural-cat/neural-cat.json\`: the current best, as the game loads it.
- \`neural-cat/models/<name>.json\`: every model that became the best${kept.length ? ' (' + kept.map((r) => r.name).join(', ') + ')' : ''}, and \`s5.json\`, the starting point.

Each file is JSON: \`featureVersion\`, \`featureSize\` (568), \`dtype\` (\`f16\`), \`meta\` (training details) and \`layers\`, each with \`rows\`, \`cols\` and base64 little-endian float16 weights \`w\` (rows × cols, row-major) and biases \`b\`. The game's \`js/mahjong-ml-model.js\` runs them, and \`js/mahjong-ml-features.js\` builds the inputs; a model needs features of the same \`featureVersion\`.
`;
}

function sync(args) {
  const state = JSON.parse(fs.readFileSync(args.state, 'utf8'));
  const name = args.repo.split('/')[1];
  const dir = path.join(args.dir, name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(path.dirname(dir), ['clone', args.remote, name]);
  } else {
    git(dir, ['pull', '--ff-only'], true);
  }
  const home = path.join(dir, args.folder);
  fs.mkdirSync(path.join(home, 'models'), { recursive: true });
  const kept = state.rounds.filter((r) => r.kept);
  const have = (r) => fs.existsSync(path.join(home, 'models', r.name + '.json'));
  const anchor = path.join(home, 'models', path.basename(state.anchor));
  const firstTime = !fs.existsSync(anchor);
  const missing = kept.filter((r) => !have(r));
  // Each new best is its own commit, in order.
  // No new best: the card is still refreshed (a round that wasn't kept, new wording).
  const steps = missing.length ? missing : [null];
  steps.forEach((r) => {
    if (!fs.existsSync(anchor)) fs.copyFileSync(path.join(ROOT, state.anchor), anchor);
    const upTo = r ? state.rounds.slice(0, state.rounds.indexOf(r) + 1) : state.rounds.filter((x) => !x.kept || have(x));
    const view = Object.assign({}, state, {
      rounds: upTo,
      best: r ? r.model : (upTo.filter((x) => x.kept).pop() || { model: state.anchor }).model,
      deals: upTo.reduce((n, x) => n + (x.deals || 0), 0),
    });
    if (r) fs.copyFileSync(path.join(ROOT, r.model), path.join(home, 'models', r.name + '.json'));
    fs.copyFileSync(path.join(ROOT, view.best), path.join(home, 'neural-cat.json'));
    const card = path.join(dir, 'README.md');
    fs.writeFileSync(card, readme(fs.existsSync(card) ? fs.readFileSync(card, 'utf8') : '', modelCard(args.repo, view, upTo)));
    git(dir, ['add', '-A']);
    if (git(dir, ['diff', '--cached', '--quiet'], true).status === 0) return;
    const msg = r
      ? 'Add ' + r.name + ', the new best: ' + signed(r.vsBest.score) + ' points a hand against ' + path.basename(r.against, '.json') +
        (r.against === state.anchor || !r.vsAnchor ? '' : ', ' + signed(r.vsAnchor.score) + ' against ' + path.basename(state.anchor, '.json'))
      : firstTime ? 'Add Neural Cat s5 and the model card' : 'Update the model card';
    git(dir, ['commit', '-q', '-m', msg + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
    git(dir, ['push', '-q', 'origin', 'HEAD']);
    log('Pushed ' + (r ? r.name : firstTime ? 's5' : 'the model card') + ' to https://huggingface.co/' + args.repo);
  });
  return state;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.repo || !/^[^/]+\/[^/]+$/.test(String(a.repo))) throw new Error('--repo OWNER/NAME is needed');
  const args = {
    repo: String(a.repo),
    folder: String(a.folder || 'neural-cat'),
    remote: a.remote ? String(a.remote) : 'git@hf.co:' + String(a.repo), // --remote: another git URL, for testing
    dir: path.resolve(String(a.dir || path.join(ROOT, 'ml', 'hf'))),
    state: path.resolve(String(a.state || path.join(ROOT, 'ml', 'league', 'state.json'))),
    every: parseInt(a.every || 120, 10) * 1000,
  };
  const leagueLog = path.join(path.dirname(args.state), 'league.log');
  const finished = () => fs.existsSync(leagueLog) && /\b(Done: |FAILED: )/.test(fs.readFileSync(leagueLog, 'utf8').split('\n').slice(-40).join('\n'));
  sync(args);
  if (!a.watch) return;
  const tick = () => {
    try { sync(args); } catch (err) { log('Upload failed, trying again next time: ' + err.message.split('\n')[0]); }
    if (finished()) { sync(args); log('The league is done.'); return; }
    setTimeout(tick, args.every);
  };
  setTimeout(tick, args.every);
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.message); process.exit(1); }
}

module.exports = { modelCard, latestBest, headToHead };
