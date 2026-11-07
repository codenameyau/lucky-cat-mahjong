'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unused } = require('./prune-data.js');

test('prune only ever picks Neural Cat league and lab rounds that are not kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  ['league-1', 'league-2', 'league-3', 'lab-1', 'lab-2', 'orphans-1', 'j0', 's5', 'my-set'].forEach((n) => fs.mkdirSync(path.join(dir, n)));
  fs.writeFileSync(path.join(dir, 'league-9'), ''); // a file, not a set
  assert.deepStrictEqual(unused(dir, new Set(['league-3', 'lab-2'])).sort(), ['lab-1', 'league-1', 'league-2']);
  assert.deepStrictEqual(unused(dir, null), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
