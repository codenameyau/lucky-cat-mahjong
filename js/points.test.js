'use strict';

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const { createScoringApi } = require('./points.harness.js');

const SITUATIONAL = new Set([
  'Self-Draw',
  'Fully Concealed',
  'Win on Last Tile',
  'Robbing the Kong',
  'Win by Kong',
  'Win by Double Kong',
  'No Flowers',
  'Seat Flower',
  'Seat Season',
  'All Flowers',
  'All Seasons',
  'Chicken Hand',
]);

const HANDS = {
  fourWinds: ['we', 'we', 'we', 'ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'wn', 'wn', 'wn', 'dr', 'dr'],
  fourWindsMixedPair: ['we', 'we', 'we', 'ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'wn', 'wn', 'wn', 'c5', 'c5'],
  allTerminals: ['c1', 'c1', 'c1', 'c9', 'c9', 'c9', 'd1', 'd1', 'd1', 'd9', 'd9', 'd9', 'b1', 'b1'],
  thirteenOrphans: ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr'],
  nineGates: ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c5', 'c6', 'c7', 'c8', 'c9', 'c9', 'c9'],
  fourQuads: [
    'c1', 'c1', 'c1', 'c1',
    'c2', 'c2', 'c2', 'c2',
    'c3', 'c3', 'c3', 'c3',
    'c4', 'c4', 'c4', 'c4',
    'c5', 'c5',
  ],
  allHonors: ['ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'wn', 'wn'],
  allTriplets: ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'b8', 'ws', 'ws', 'ws', 'd2', 'd2'],
  chicken: ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'd8', 'd8', 'd8', 'b7', 'b8', 'b9', 'c5', 'c5'],
};

function patternItems(result) {
  return result.items.filter(function (item) { return !SITUATIONAL.has(item.name); });
}

function patternNames(result) {
  return patternItems(result).map(function (item) { return String(item.name); });
}

function assertPatternNames(result, expected) {
  var names = patternNames(result);
  assert.equal(names.length, expected.length, 'pattern count: ' + names.join(', '));
  for (var i = 0; i < expected.length; i++) {
    assert.equal(names[i], expected[i]);
  }
}

function faanFor(result, name) {
  var item = result.items.find(function (entry) { return entry.name === name; });
  return item ? item.faan : null;
}

describe('Hong Kong mahjong scoring', function () {
  /** @type {ReturnType<typeof createScoringApi>} */
  let api;

  beforeEach(function () {
    api = createScoringApi();
    api.resetOptions();
    api.setOption('opt-no-flowers', false);
  });

  describe('limit hand no-stacking', function () {
    it('scores Big Four Winds without structural constituents', function () {
      api.setHand(HANDS.fourWindsMixedPair);
      var result = api.evaluate();

      assert.equal(result.valid, true);
      assertPatternNames(result, ['Big Four Winds']);
      assert.equal(result.faan, 13);
    });

    it('scores All Terminals without All Triplets', function () {
      api.setHand(HANDS.allTerminals);
      var result = api.evaluate();

      assertPatternNames(result, ['All Terminals']);
      assert.equal(result.faan, 13);
    });

    it('scores Thirteen Orphans as a single limit pattern', function () {
      api.setHand(HANDS.thirteenOrphans);
      var result = api.evaluate();

      assertPatternNames(result, ['Thirteen Orphans']);
      assert.equal(result.faan, 13);
    });

    it('scores Nine Gates as a single limit pattern', function () {
      api.setHand(HANDS.nineGates);
      var result = api.evaluate();

      assertPatternNames(result, ['Nine Gates']);
      assert.equal(result.faan, 13);
    });

    it('scores Four Quads without All Triplets or Full Flush', function () {
      api.setHand(HANDS.fourQuads);
      var result = api.evaluate();

      assertPatternNames(result, ['Four Quads']);
      assert.equal(result.faan, 13);
    });
  });

  describe('stackable limit-hand achievements', function () {
    it('stacks All Honors with Big Four Winds', function () {
      api.setHand(HANDS.fourWinds);
      var result = api.evaluate();

      assertPatternNames(result, ['All Honors', 'Big Four Winds']);
    });

    it('stacks Concealed Triplets with Big Four Winds when concealed', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.fourWinds);
      var result = api.evaluate();

      assertPatternNames(result, ['All Honors', 'Concealed Triplets', 'Big Four Winds']);
    });

    it('stacks Concealed Triplets with All Terminals when concealed', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.allTerminals);
      var result = api.evaluate();

      assertPatternNames(result, ['All Terminals', 'Concealed Triplets']);
    });

    it('stacks Concealed Triplets with Four Quads when concealed', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.fourQuads);
      var result = api.evaluate();

      assertPatternNames(result, ['Concealed Triplets', 'Four Quads']);
    });
  });

  describe('All Honors stacking rules', function () {
    it('does not stack All Honors with All Triplets', function () {
      api.setHand(HANDS.allHonors);
      var result = api.evaluate();

      assert.ok(patternNames(result).includes('All Honors'));
      assert.ok(!patternNames(result).includes('All Triplets'));
    });

    it('stacks All Honors with Concealed Triplets when concealed', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.allHonors);
      var result = api.evaluate();

      assertPatternNames(result, ['All Honors', 'Concealed Triplets', 'Dragon Triplet']);
    });
  });

  describe('dragon triplet display', function () {
    it('combines multiple dragon triplets into one stacked line item', function () {
      api.setHand(HANDS.allHonors);
      var result = api.evaluate();

      assert.equal(patternNames(result).filter(function (name) { return name === 'Dragon Triplet'; }).length, 1);
      assert.equal(faanFor(result, 'Dragon Triplet'), 2);
    });
  });

  describe('situational faan', function () {
    it('scores Win by Double Kong at 8 faan', function () {
      api.setHand(HANDS.chicken);
      api.setOption('opt-double-kong', true);
      var result = api.evaluate();

      assert.equal(faanFor(result, 'Win by Double Kong'), 8);
    });

    it('does not stack Fully Concealed with Concealed Triplets', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.allTriplets);
      var result = api.evaluate();

      assert.ok(result.items.some(function (item) { return item.name === 'Concealed Triplets'; }));
      assert.ok(!result.items.some(function (item) { return item.name === 'Fully Concealed'; }));
    });
  });

  describe('basic scoring', function () {
    it('scores a standard All Triplets hand', function () {
      api.setHand(HANDS.allTriplets);
      var result = api.evaluate();

      assertPatternNames(result, ['All Triplets']);
      assert.equal(result.faan, 3);
      assert.equal(result.points, 8);
    });

    it('rejects incomplete hands', function () {
      api.setHand(['c1', 'c2', 'c3']);
      var result = api.evaluate();

      assert.equal(result.valid, false);
    });
  });
});
