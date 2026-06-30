'use strict';

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const { createScoringApi } = require('./points.harness.js');

const SITUATIONAL = new Set([
  'Self-Draw',
  'Concealed',
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
  fullFlush: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c2', 'c2', 'c2', 'c5', 'c5'],
  halfFlush: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'dr', 'c5', 'c5'],
  sevenPairs: ['c1', 'c1', 'd2', 'd2', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'b8', 'b8', 'dr', 'dr'],
  bigThreeDragons: ['dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'dw', 'dw', 'dw', 'c1', 'c2', 'c3', 'd5', 'd5'],
  allSequences: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd2', 'd3', 'd4', 'd5', 'd5'],
  mixedTerminals: ['c1', 'c1', 'c1', 'c9', 'c9', 'c9', 'd1', 'd1', 'd1', 'dr', 'dr', 'dr', 'd9', 'd9'],
  seatWind: ['we', 'we', 'we', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd2', 'd2'],
  plainChicken: ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b1', 'b2', 'b3', 'c8', 'c8', 'c8', 'd2', 'd2'],
  oneQuad: [
    'c2', 'c2', 'c2', 'c2',
    'd5', 'd5', 'd5',
    'b8', 'b8', 'b8',
    'c3', 'c3', 'c3',
    'd2', 'd2',
  ],
  twoQuads: [
    'c2', 'c2', 'c2', 'c2',
    'd5', 'd5', 'd5', 'd5',
    'b8', 'b8', 'b8',
    'c3', 'c3', 'c3',
    'd2', 'd2',
  ],
  threeQuads: [
    'c2', 'c2', 'c2', 'c2',
    'd5', 'd5', 'd5', 'd5',
    'b8', 'b8', 'b8', 'b8',
    'c3', 'c3', 'c3',
    'd2', 'd2',
  ],
  chickenWithQuad: [
    'c2', 'c3', 'c4',
    'd5', 'd6', 'd7',
    'b8', 'b8', 'b8', 'b8',
    'c6', 'c6', 'c6',
    'd2', 'd2',
  ],
};

function hasQuad(hand) {
  var counts = {};
  hand.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
  return Object.keys(counts).some(function (id) { return counts[id] === 4; });
}

function numberedTileIds() {
  var ids = [];
  ['c', 'd', 'b'].forEach(function (suit) {
    for (var v = 1; v <= 9; v++) ids.push(suit + v);
  });
  return ids;
}

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

    it('does not stack Concealed with Concealed Triplets', function () {
      api.setOption('opt-concealed', true);
      api.setHand(HANDS.allTriplets);
      var result = api.evaluate();

      assert.ok(result.items.some(function (item) { return item.name === 'Concealed Triplets'; }));
      assert.ok(!result.items.some(function (item) { return item.name === 'Concealed'; }));
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

    it('rejects hands with fewer than 14 tiles', function () {
      api.setHand(['c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c3', 'c4', 'c4', 'c4', 'c5']);
      var result = api.evaluate();

      assert.equal(result.valid, false);
    });

    it('accepts winning hands with one to three quads (15–17 tiles)', function () {
      assert.equal(api.isValidWinningHandIds(HANDS.oneQuad), true);
      assert.equal(api.isValidWinningHandIds(HANDS.twoQuads), true);
      assert.equal(api.isValidWinningHandIds(HANDS.threeQuads), true);

      api.setHand(HANDS.oneQuad);
      assert.equal(api.evaluate().valid, true);

      api.setHand(HANDS.twoQuads);
      assert.equal(api.evaluate().valid, true);

      api.setHand(HANDS.threeQuads);
      assert.equal(api.evaluate().valid, true);
    });

    it('rejects 15-tile hands that are not winning shapes', function () {
      assert.equal(api.isValidWinningHandIds([
        'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9',
        'd1', 'd2', 'd3', 'd4', 'd5', 'd6',
      ]), false);
    });
  });

  describe('common patterns', function () {
    it('scores Full Flush at 7 faan', function () {
      api.setHand(HANDS.fullFlush);
      var result = api.evaluate();

      assertPatternNames(result, ['Full Flush']);
      assert.equal(result.faan, 7);
      assert.equal(result.points, 128);
    });

    it('scores Half Flush with Dragon Triplet', function () {
      api.setHand(HANDS.halfFlush);
      var result = api.evaluate();

      assertPatternNames(result, ['Half Flush', 'Dragon Triplet']);
      assert.equal(result.faan, 4);
      assert.equal(result.points, 16);
    });

    it('scores Seven Pairs at 4 faan', function () {
      api.setHand(HANDS.sevenPairs);
      var result = api.evaluate();

      assertPatternNames(result, ['Seven Pairs']);
      assert.equal(result.faan, 4);
      assert.equal(result.points, 16);
    });

    it('scores Big Three Dragons at 8 faan', function () {
      api.setHand(HANDS.bigThreeDragons);
      var result = api.evaluate();

      assertPatternNames(result, ['Big Three Dragons']);
      assert.equal(result.faan, 8);
      assert.equal(result.points, 256);
    });

    it('scores All Sequences (ping hu) at 1 faan', function () {
      api.setHand(HANDS.allSequences);
      var result = api.evaluate();

      assertPatternNames(result, ['All Sequences']);
      assert.equal(result.faan, 1);
    });

    it('scores Mixed Terminals and its meld constituents', function () {
      api.setHand(HANDS.mixedTerminals);
      var result = api.evaluate();

      assert.ok(patternNames(result).includes('Mixed Terminals'));
      assert.ok(patternNames(result).includes('All Triplets'));
      assert.equal(result.faan, 8);
      assert.equal(result.points, 256);
    });

    it('labels a zero-pattern hand as Chicken Hand', function () {
      api.setHand(HANDS.plainChicken);
      var result = api.evaluate();

      assert.equal(result.valid, true);
      assert.ok(result.items.some(function (item) { return item.name === 'Chicken Hand'; }));
      assert.equal(result.faan, 0);
      assert.equal(result.points, null);
    });

    it('labels a zero-pattern 15-tile hand with a quad as Chicken Hand', function () {
      api.setHand(HANDS.chickenWithQuad);
      var result = api.evaluate();

      assert.equal(result.valid, true);
      assert.equal(HANDS.chickenWithQuad.length, 15);
      assert.ok(result.items.some(function (item) { return item.name === 'Chicken Hand'; }));
      assert.equal(result.faan, 0);
      assert.equal(result.points, null);
    });
  });

  describe('random hand generation', function () {
    it('maps meld plans to the expected tile counts', function () {
      assert.equal(api.handLengthForMeldPlan(['chow', 'chow', 'chow', 'chow']), 14);
      assert.equal(api.handLengthForMeldPlan(['chow', 'chow', 'pung', 'quad']), 15);
      assert.equal(api.handLengthForMeldPlan(['chow', 'quad', 'quad', 'quad']), 17);
      assert.equal(api.handLengthForMeldPlan(['quad', 'quad', 'quad', 'quad']), 18);
    });

    it('buildStandardHand constructs a single-quad hand with 15 tiles', function () {
      var ids = api.buildStandardHand(['chow', 'chow', 'pung', 'quad'], {
        meldPool: numberedTileIds(),
        pairPool: numberedTileIds(),
        accept: function () { return true; },
      });

      assert.ok(ids);
      assert.equal(ids.length, 15);
      assert.equal(api.isValidWinningHandIds(ids), true);
      assert.ok(hasQuad(ids));
    });

    it('randomSequenceHand returns valid all-sequences hands', function () {
      for (var i = 0; i < 30; i++) {
        var ids = api.randomSequenceHand();
        assert.ok(ids);
        assert.equal(ids.length, 14);
        assert.equal(api.isValidWinningHandIds(ids), true);
        assert.equal(api.patternFaanForIds(ids), 1);
      }
    });

    it('randomChickenHand returns valid zero-pattern hands', function () {
      for (var i = 0; i < 30; i++) {
        var ids = api.randomChickenHand();
        assert.ok(ids);
        assert.ok(ids.length === 14 || ids.length === 15);
        assert.equal(api.isValidWinningHandIds(ids), true);
        assert.equal(api.patternFaanForIds(ids), 0);

        api.setHand(ids);
        var result = api.evaluate();
        assert.ok(result.items.some(function (item) { return item.name === 'Chicken Hand'; }));
      }
    });

    it('randomStandardHand returns valid hands at or above the minimum faan', function () {
      for (var i = 0; i < 40; i++) {
        var ids = api.randomStandardHand();
        assert.ok(ids);
        assert.ok(ids.length >= 14 && ids.length <= 18);
        assert.equal(api.isValidWinningHandIds(ids), true);
        assert.ok(api.patternFaanForIds(ids) >= 3);
      }
    });

    it('randomStandardHand can produce hands with quads', function () {
      var sawQuad = false;
      for (var i = 0; i < 80; i++) {
        var ids = api.randomStandardHand();
        if (hasQuad(ids)) sawQuad = true;
      }
      assert.equal(sawQuad, true);
    });

    it('randomLimitHand can produce four-quad limit hands', function () {
      var sawFourQuads = false;
      for (var i = 0; i < 80; i++) {
        var ids = api.randomLimitHand();
        if (ids.length === 18 && hasQuad(ids) && api.patternFaanForIds(ids) === 13) {
          sawFourQuads = true;
          api.setHand(ids);
          assertPatternNames(api.evaluate(), ['Four Quads']);
        }
      }
      assert.equal(sawFourQuads, true);
    });
  });

  describe('payout and minimum faan', function () {
    it('returns null points below the 3-faan minimum', function () {
      api.setHand(HANDS.allSequences);
      api.setOption('opt-selfdraw', true);
      var result = api.evaluate();

      assert.equal(result.faan, 2);
      assert.equal(result.points, null);
    });

    it('maps faan totals to the classic payout table', function () {
      api.setHand(HANDS.halfFlush);
      var result = api.evaluate();

      assert.equal(result.faan, 4);
      assert.equal(result.points, 16);

      api.setHand(HANDS.allTriplets);
      result = api.evaluate();
      assert.equal(result.faan, 3);
      assert.equal(result.points, 8);
    });
  });

  describe('wind and flower bonuses', function () {
    it('scores Seat Wind Triplet when seat matches East in a South round', function () {
      api.setOption('opt-seat', 1);
      api.setOption('opt-round', 2);
      api.setHand(HANDS.seatWind);
      var result = api.evaluate();

      assert.ok(patternNames(result).includes('Seat Wind Triplet'));
      assert.equal(faanFor(result, 'Seat Wind Triplet'), 1);
    });

    it('scores No Flowers bonus when enabled and no bonus tiles', function () {
      api.setOption('opt-no-flowers', true);
      api.setHand(HANDS.chicken);
      var result = api.evaluate();

      assert.equal(faanFor(result, 'No Flowers'), 1);
    });

    it('scores Seat Flower when the matching flower is held', function () {
      api.setOption('opt-no-flowers', false);
      api.setOption('opt-seat', 2);
      api.setHand(HANDS.chicken, ['f2']);
      var result = api.evaluate();

      assert.equal(faanFor(result, 'Seat Flower'), 1);
    });
  });
});
