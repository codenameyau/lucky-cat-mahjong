#!/usr/bin/env node
/* Review a hand from its seed, and teach the coach from it.

   npm run review -- 3764864992-EE                 every turn, following the coach
   npm run review -- 3764864992-EE --moves d1,c1   your discards first, then the coach
   npm run review -- 3764864992-EE --turn 3        the reasoning on turn 3
   npm run review -- --save game.json              the exact hand from a save file
   npm run review -- 3764864992-EE --find dr       turns where it would throw that tile

   Feedback on a turn (saved to docs/strategies/feedback.json):
   npm run review -- 3764864992-EE --moves d1 --turn 2 --keep dr --drop c1 --note "why"

   npm run review -- --check                       how the coach does on every case
   npm run review -- --check --update              mark the cases it now gets right as fixed

   Options:
     --coach ID       the strategy the coach follows (default: lucky-cat)
     --lineup a,b,c   the other three seats' strategies (default: lucky-cat)
     --tries N        how many ways --find plays the hand (default: 100)
     --left N         --find only counts the tile with at least N copies unseen */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const R = require('./review-lib.js');
const S = require('../js/mahjong-strategies.js');

const FEEDBACK = path.join(__dirname, '..', 'docs', 'strategies', 'feedback.json');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { out._.push(argv[i]); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[argv[i].slice(2)] = true;
    else { out[argv[i].slice(2)] = next; i++; }
  }
  return out;
}

const list = (text) => (typeof text === 'string' ? text.split(',').map((s) => s.trim()).filter(Boolean) : []);

function readCases() {
  return fs.existsSync(FEEDBACK) ? JSON.parse(fs.readFileSync(FEEDBACK, 'utf8')) : [];
}

function writeCases(cases) {
  fs.writeFileSync(FEEDBACK, JSON.stringify(cases, null, 2) + '\n');
}

function printCandidates(candidates) {
  console.log('    tile  group  tier  steps  left  score     plan');
  candidates.forEach((x) => {
    console.log('    ' + [x.tile.padEnd(4), String(x.group).padEnd(5), String(x.tier).padEnd(4), String(x.steps).padEnd(5),
      String(x.left).padEnd(4), x.score.toFixed(3).padEnd(8), x.plan].join('  '));
  });
}

function printTurn(t, detail) {
  if (t.kind === 'claim') {
    console.log('  Claim on ' + t.tile + ': ' + t.played + (t.said ? '. Coach: ' + t.said : ''));
    return;
  }
  const melds = t.melds.length ? '  melds ' + t.melds.join(', ') : '';
  const flowers = t.flowers.length ? '  flowers ' + t.flowers.join(' ') : '';
  console.log('\nTurn ' + t.number + '  wall ' + t.wallLeft + (t.drew ? '  drew ' + t.drew : ''));
  console.log('  ' + t.hand.join(' ') + melds + flowers);
  console.log('  Coach: ' + t.said);
  console.log('  Played: ' + t.played + (t.played === t.top ? '' : ' (the coach\'s first choice: ' + t.top + ')') + (t.folding ? '  [folding]' : ''));
  if (detail) printCandidates(t.candidates);
}

async function check(update) {
  const cases = readCases();
  let regressed = 0;
  let changed = false;
  cases.forEach((c) => {
    const res = R.checkCase(c);
    const label = res.pass ? (c.status === 'fixed' ? 'pass' : 'NOW PASSES') : (c.status === 'fixed' ? 'REGRESSED' : 'open');
    if (!res.pass && c.status === 'fixed') regressed++;
    console.log(label.padEnd(11) + c.id + '  coach: ' + res.top + '  wanted: ' +
      (c.drop.length ? c.drop.join('/') : 'not ' + c.keep.join('/')) + (c.note ? '  (' + c.note + ')' : ''));
    if (!res.pass) printCandidates(res.read.list.slice(0, 6));
    if (update && res.pass && c.status !== 'fixed') { c.status = 'fixed'; changed = true; }
  });
  if (changed) writeCases(cases);
  if (!cases.length) console.log('No feedback yet.');
  if (regressed) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) return check(args.update);

  const coach = args.coach && S.has(args.coach) ? args.coach : 'lucky-cat';
  let spec;
  if (args.save) {
    spec = R.specFromSave(JSON.parse(fs.readFileSync(args.save, 'utf8')), args.coach);
  } else {
    if (!args._[0]) throw new Error('give a hand seed, like 3764864992-EE (or --save, or --check)');
    spec = { seed: args._[0], moves: list(args.moves), coach };
    if (args.lineup) spec.lineup = list(args.lineup);
  }

  if (args.find) {
    const hits = await R.find(spec, args.find, +args.tries || 100, +args.left || 0);
    if (!hits.length) console.log('The coach never threw ' + args.find + ' first.');
    hits.forEach((t) => {
      printTurn(t, true);
      console.log('  To get here: --moves ' + t.movesSoFar.join(',') + ' --turn ' + t.number);
    });
    return;
  }

  const wanted = +args.turn || 0;
  const run = await R.replay(Object.assign({}, spec, { until: wanted || undefined }));
  const turn = wanted ? run.turns.find((t) => t.kind === 'turn' && t.number === wanted) : null;
  if (wanted && !turn) throw new Error('the hand ended before turn ' + wanted);

  console.log('Hand ' + spec.seed + ', coach ' + run.coach + ', other seats ' + (spec.lineup || ['lucky-cat', 'lucky-cat', 'lucky-cat']).join(', '));
  if (turn) printTurn(turn, true);
  else run.turns.forEach((t) => printTurn(t, false));
  if (!turn && run.result) console.log('\nResult: ' + (run.result.type === 'draw' ? 'a drawn hand' : 'seat ' + run.result.winner + ' won'));

  if (args.keep || args.drop) {
    if (!turn) throw new Error('--keep and --drop need --turn');
    const cases = readCases();
    const entry = R.caseFrom(spec, turn, { keep: list(args.keep), drop: list(args.drop), note: args.note === true ? '' : args.note });
    if (cases.some((c) => c.id === entry.id)) throw new Error('already saved: ' + entry.id);
    writeCases(cases.concat(entry));
    console.log('\nSaved feedback ' + entry.id + ' (open). Run npm run review -- --check');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
