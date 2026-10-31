'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const P = require('./points.js');
const R = require('./mahjong-rules.js');

describe('rules sheet', () => {
  const rows = [];
  R.RULES.forEach((section) => section.families.forEach((fam) => fam.rows.forEach((row) => rows.push(row))));

  it('gives every hand a faan from the scoring table and an example', () => {
    rows.forEach((row) => {
      assert.ok(P.FAAN[row.key] !== undefined, row.name + ' has no faan key ' + row.key);
      assert.ok(row.example, row.name + ' has no example');
    });
  });

  rows.forEach((row) => {
    it('scores the ' + row.name + ' example as ' + row.name, () => {
      const res = P.scoreHand(R.scoringInput(row.example));
      const names = res.items.map((i) => i.name);
      assert.ok(res.valid, row.name + ' example is not a winning hand');
      // The two opening-hand limits share the limit key, so check their own names.
      const want = row.name === 'Heavenly Hand' || row.name === 'Earthly Hand' ? row.name : R.SCORED_AS[row.key];
      const ok = row.key === 'yakuWind' ? names.some((n) => /Seat Wind|Round Wind/.test(n)) : names.includes(want);
      assert.ok(ok, row.name + ' example scores as ' + names.join(', '));
    });
  });
});
