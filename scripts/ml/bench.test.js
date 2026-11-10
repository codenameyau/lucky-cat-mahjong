'use strict';

// The frontier benchmark (scripts/ml/bench.js): the table must be the one
// that was frozen, the deck must stay apart from every fresh deal, and the
// bar must say exactly what docs/machine-learning/benchmark.md says.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const B = require('./bench.js');
const LN = require('../../js/mahjong-lucky-cat-net.js');
const O = require('./oracle.js');

const bm = B.benchmark();

describe('frontier benchmark', () => {
  it('plays on the frozen table: every pinned file and the fingerprint deals match', async () => {
    const v = await B.verify(bm);
    assert.equal(v.fingerprint, bm.fingerprint.sha256);
    assert.equal(v.files, Object.keys(bm.frozen.files).length);
  });

  it('notices a drifted table', async () => {
    const drifted = JSON.parse(JSON.stringify(bm));
    drifted.fingerprint.sha256 = '0'.repeat(64);
    await assert.rejects(B.verify(drifted), /drifted/);
    const tampered = JSON.parse(JSON.stringify(bm));
    tampered.frozen.files['js/mahjong-ml-weights.js'] = '0'.repeat(64);
    await assert.rejects(B.verify(tampered), /SHA-256/);
  });

  it('keeps the deck apart from every block of fresh deals', () => {
    assert.ok(B.inDeck(bm, bm.deck.start, 1));
    assert.ok(B.inDeck(bm, bm.deck.start - 10, 11));
    assert.ok(!B.inDeck(bm, bm.deck.start + bm.deck.deals, 1000));
    assert.ok(bm.fresh.start >= bm.deck.start + bm.deck.deals, 'fresh deals start after the deck');
    for (const stage of ['screen', 'qualify', 'replicate', 'regression']) assert.ok(bm.bar[stage] <= bm.fresh.block);
  });

  it('pairs deal by deal: a model against itself is level to the point', async () => {
    const r = await B.play(['bench:jorge-yau', 'bench:jorge-yau'], bm.fresh.start - 100, 3, 0, bm);
    assert.equal(r.models[0].hands, 12);
    assert.equal(r.gap.points, 0);
    assert.equal(r.gap.standardError, 0);
  });

  it('holds the bar: one SE to screen, two to qualify and again to replicate, the win rate kept, no loss beyond one', () => {
    const bar = bm.bar;
    const g = (points, se, winRate, winSe) => ({ points, standardError: se, winRate: winRate || 0, winStandardError: winSe || 0.001 });
    assert.ok(B.stagePasses('screen', g(4, 3.9), bar).pass);
    assert.ok(!B.stagePasses('screen', g(3, 3.9), bar).pass);
    assert.ok(B.stagePasses('qualify', g(7.1, 3.5), bar).pass);
    assert.ok(!B.stagePasses('qualify', g(6.9, 3.5), bar).pass);
    assert.ok(!B.stagePasses('qualify', g(10, 3.5, -0.003, 0.002), bar, true).pass, 'Lucky Cat may not give up its win rate');
    assert.ok(B.stagePasses('qualify', g(10, 3.5, -0.003, 0.002), bar, false).pass, 'Sphinx may');
    assert.ok(B.stagePasses('qualify', g(10, 3.5, 0.01, 0.002), bar, true).pass, 'winning more is never a fail');
    assert.ok(!B.stagePasses('replicate', g(6.9, 3.5), bar).pass);
    assert.ok(B.stagePasses('qualify', g(10, 3.5, -0.009, 0.002), bar, 0.01).pass, 'Lucky Cat may give up under a point of win rate');
    assert.ok(!B.stagePasses('qualify', g(10, 3.5, -0.015, 0.002), bar, 0.01).pass, 'and no more');
    assert.ok(B.stagePasses('regression', g(-3.9, 4), bar).pass);
    assert.ok(!B.stagePasses('regression', g(-4.1, 4), bar).pass);
    assert.deepEqual([bar.screen, bar.qualify, bar.replicate, bar.regression, bar.sigma], [10000, 40000, 40000, 10000, 2]);
  });

  it('refuses a model that reads the hidden tiles before it plays a hand', async () => {
    const w = LN.zeroWeights();
    w.layers[0].cols = LN.SIZE + O.SIZE;
    w.layers = w.layers.map((l) => ({ rows: l.rows, cols: l.cols, w: [], b: Array.from(l.b) }));
    w.meta = { name: 'oracle-test', oracle: { delta: 1, size: O.SIZE, publicSize: LN.SIZE } };
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bench-')), 'm.json');
    fs.writeFileSync(file, JSON.stringify(w));
    const r = await B.fairPlay('lc:' + file);
    assert.equal(r.pass, false);
    assert.match(r.why, /oracle model/);
  });

  it('pins every generation of every lineage by SHA-256', () => {
    const all = B.lineages();
    assert.deepEqual(Object.keys(all.lineages).sort(), ['lucky-cat', 'neural-cat', 'sphinx']);
    assert.equal(all.lineages['lucky-cat'].generations[0].name, 'lc32');
    assert.equal(all.lineages['neural-cat'].generations[0].name, 'nc9');
    Object.values(all.lineages).forEach((line) => line.generations.forEach((g) => {
      const file = B.resolveFile(g.model.replace(/^(lc|nc):/, ''));
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), g.sha256, g.name);
    }));
  });
});
