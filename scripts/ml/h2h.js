/* A head to head on the native simulator's fast build (lcm-sim play): two
   models each take every seat of the same deals against the same table, and
   the gap (the first less the second) is taken deal by deal, as
   bench.js compare reports it. Used by the frontier's round driver
   (scripts/ml/frontier-model.js) for its screens and by its report
   (scripts/ml/frontier-report.js).

   headToHead(a, b, table, seed, deals, workers) -> Promise<{ seed, deals, table,
     models: [{ points, wins, dealIns, averageWin, averageFaan, selfDraws }] x 2,
     gap: { points, standardError, deals, wins, winsError } }>
   a, b and the table's three are ids as scripts/ml/native.js nativeId reads them
   (nc:<file>, lc:<file>, oo:<file>, neural-cat, jorge-yau, only-orphans: the
   shipped Only Orphans). */

'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const N = require('./native.js');

const ROOT = path.join(__dirname, '..', '..');
const SIM = path.join(ROOT, 'native', 'build', 'lcm-sim' + (process.platform === 'win32' ? '.exe' : ''));
// The game's table: the shipped Neural Cat, Jorge Yau and Lucky Cat.
const GAME_TABLE = ['neural-cat', 'jorge-yau', 'lc:js/mahjong-lucky-cat-weights.js'];

function headToHead(a, b, table, seed, deals, workers) {
  const ids = [a, b].concat(table || GAME_TABLE).map((id) => N.nativeId(id));
  if (ids.some((x) => !x)) return Promise.reject(new Error("h2h: a player can't run on the native simulator (make -C native; node scripts/ml/native.js parity, then pin)"));
  const step = Math.ceil(deals / workers), jobs = [];
  for (let f = 0; f < deals; f += step) {
    jobs.push(new Promise((res, rej) => {
      const p = spawn(SIM, ['play', '--models', ids[0] + ',' + ids[1], '--table', ids.slice(2).join(','),
        '--seed', String(seed), '--from', String(f), '--to', String(Math.min(deals, f + step))], { cwd: ROOT });
      let o = '', e = '';
      p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
      p.on('exit', (c) => (c ? rej(new Error('lcm-sim play: ' + e)) : res(JSON.parse(o))));
    }));
  }
  return Promise.all(jobs).then((outs) => {
    const sum = (k, m) => outs.reduce((t, o) => t + o.out[m][k], 0);
    const pair = (k) => outs.reduce((t, o) => t + o.pair[k], 0);
    const n = pair('n'), mean = pair('sum') / n, wins = pair('win') / n;
    const model = (m) => ({
      points: sum('points', m) / sum('seats', m), wins: sum('wins', m) / sum('seats', m), dealIns: sum('dealIns', m) / sum('seats', m),
      averageWin: sum('winPoints', m) / Math.max(1, sum('wins', m)), averageFaan: sum('winFaan', m) / Math.max(1, sum('wins', m)),
      selfDraws: sum('selfDraws', m) / Math.max(1, sum('wins', m)),
    });
    return {
      seed, deals: n, table: table || GAME_TABLE, simulator: 'native-fast', models: [model(0), model(1)],
      gap: {
        points: mean, standardError: Math.sqrt(Math.max(0, pair('sq') / n - mean * mean) / n), deals: n,
        wins, winsError: Math.sqrt(Math.max(0, pair('winSq') / n - wins * wins) / n),
      },
    };
  });
}

module.exports = { headToHead, GAME_TABLE };
