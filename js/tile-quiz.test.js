'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const quiz = require('./tile-quiz.js');
const art = require('./tile-quiz-art.js');

const ORPHANS = [
  'bamboo-1', 'bamboo-9', 'character-1', 'character-9', 'dot-1', 'dot-9',
  'green-dragon', 'red-dragon', 'white-dragon',
  'east-wind', 'south-wind', 'west-wind', 'north-wind',
];
const FLOWERS_AND_SEASONS = ['spring', 'summer', 'autumn', 'winter', 'plum', 'orchid', 'chrysanthemum', 'bamboo-flower'];

function eachAnswerCombo(fn) {
  const n = quiz.QUESTIONS.length;
  const total = 4 ** n;
  for (let k = 0; k < total; k++) {
    const answers = [];
    let x = k;
    for (let i = 0; i < n; i++) {
      answers.push(x % 4);
      x = Math.floor(x / 4);
    }
    fn(answers);
  }
}

describe('tile quiz data', () => {
  it('has the 13 orphans, 8 flowers and seasons, and the blank tile', () => {
    const ids = quiz.TILES.map((t) => t.id).sort();
    assert.deepEqual(ids, [...ORPHANS, ...FLOWERS_AND_SEASONS, 'blank'].sort());
  });

  it('gives every tile artwork, copy, and a valid bestie', () => {
    quiz.TILES.forEach((t) => {
      assert.ok(art.ids.includes(t.id), `${t.id} art`);
      assert.match(art.render(t.id), /^<svg[\s\S]*<\/svg>$/);
      assert.ok(t.name && t.title && t.tagline && t.description, `${t.id} copy`);
      assert.equal(t.why.length, 3);
      assert.ok(quiz.getTile(t.bestie), `${t.id} bestie`);
      assert.notEqual(t.bestie, t.id);
    });
  });

  it('only awards tiles that exist', () => {
    quiz.QUESTIONS.forEach((q) => {
      assert.equal(q.options.length, 4);
      q.options.forEach((o) => o.tiles.forEach((id) => assert.ok(quiz.getTile(id), id)));
    });
  });
});

describe('scoreAnswers', () => {
  it('is deterministic', () => {
    const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
    assert.equal(quiz.scoreAnswers(answers), quiz.scoreAnswers(answers.slice()));
  });

  it('can land on every tile, and no tile hogs the results', () => {
    const counts = {};
    let total = 0;
    eachAnswerCombo((answers) => {
      const id = quiz.scoreAnswers(answers);
      counts[id] = (counts[id] || 0) + 1;
      total += 1;
    });
    quiz.TILES.forEach((t) => {
      const share = (counts[t.id] || 0) / total;
      assert.ok(share > 0.025 && share < 0.08, `${t.id}: ${(share * 100).toFixed(2)}%`);
    });
  });
});

describe('profile helpers', () => {
  it('normalizes Instagram handles and links', () => {
    assert.equal(quiz.normalizeInstagram('luckycat.mahjong'), '@luckycat.mahjong');
    assert.equal(quiz.normalizeInstagram(' @@luckycat.mahjong '), '@luckycat.mahjong');
    assert.equal(quiz.normalizeInstagram('https://www.instagram.com/luckycat.mahjong/?hl=en'), '@luckycat.mahjong');
    assert.equal(quiz.normalizeInstagram('instagram.com/luckycat.mahjong'), '@luckycat.mahjong');
    assert.equal(quiz.normalizeInstagram(''), '');
  });

  it('validates zip codes', () => {
    assert.ok(quiz.isValidZip('10001'));
    assert.ok(quiz.isValidZip('10001-1234'));
    assert.ok(!quiz.isValidZip('1000'));
    assert.ok(!quiz.isValidZip('abcde'));
  });

  it('requires every field', () => {
    const errors = quiz.validateProfile({ name: ' ', instagram: '', zip: '1', skill: 'Expert' });
    assert.deepEqual(Object.keys(errors).sort(), ['instagram', 'name', 'skill', 'zip']);
    assert.deepEqual(quiz.validateProfile({ name: 'Mei', instagram: 'mei', zip: '11201', skill: 'Beginner' }), {});
  });

  it('encodes the Google Form body with the form entry IDs', () => {
    const body = new URLSearchParams(quiz.buildFormBody(
      { name: 'Mei Lin', instagram: 'mei.lin', zip: '11201', skill: 'Advanced' },
      quiz.getTile('red-dragon'),
    ));
    assert.equal(body.get(quiz.FORM_FIELDS.name), 'Mei Lin');
    assert.equal(body.get(quiz.FORM_FIELDS.instagram), '@mei.lin');
    assert.equal(body.get(quiz.FORM_FIELDS.zip), '11201');
    assert.equal(body.get(quiz.FORM_FIELDS.skill), 'Advanced');
    assert.equal(body.get(quiz.FORM_FIELDS.result), 'Red Dragon');
  });

  it('sends a result that matches a Result dropdown option for every tile', () => {
    // Copied from the Google Form's "Result" dropdown; Google rejects submissions with any other value.
    const formOptions = [
      '1 Bamboo', '9 Bamboo', '1 Character', '9 Character', '1 Dot', '9 Dot',
      'Green Dragon', 'Red Dragon', 'White Dragon', 'East Wind', 'South Wind', 'West Wind', 'North Wind',
      'Spring', 'Summer', 'Autumn', 'Winter', 'Plum Blossom', 'Orchid', 'Chrysanthemum', 'Bamboo', 'Blank Tile',
    ];
    const profile = { name: 'Mei', instagram: 'mei', zip: '11201', skill: 'Beginner' };
    quiz.TILES.forEach((t) => {
      const body = new URLSearchParams(quiz.buildFormBody(profile, t));
      assert.ok(formOptions.includes(body.get(quiz.FORM_FIELDS.result)), t.id);
    });
  });
});

describe('shareUrl', () => {
  it('replaces any existing query or hash with the tile', () => {
    assert.equal(
      quiz.shareUrl('https://luckycatmahjong.com/which-mahjong-tiles-are-you/?tile=dot-1#x', 'blank'),
      'https://luckycatmahjong.com/which-mahjong-tiles-are-you/?tile=blank',
    );
  });
});
