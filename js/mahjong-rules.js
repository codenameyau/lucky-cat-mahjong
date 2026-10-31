/* The Rules sheet on the Play page: every hand, its faan, and an example.

   Grouped like the Points Guide on the site. Faan values are read from the
   scoring table (points.js) so the sheet can't drift from how hands score,
   and js/mahjong-rules.test.js scores every example to check that it really
   is the hand it illustrates.

   An example is a winning hand in sets, `open` lists the sets that were
   claimed (the rest are concealed), and `flags` are how it was won. Unless
   it says otherwise you sit South in the East round. */

(function (root) {
  'use strict';

  var SOUTH = 2;
  var EAST = 1;
  // A plain hand of runs, the base for the situational examples.
  var RUNS = [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b4', 'b5', 'b6'], ['b7', 'b8', 'b9'], ['d2', 'd2']];
  var KONG_RUNS = [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b4', 'b5', 'b6'], ['dw', 'dw', 'dw', 'dw'], ['d2', 'd2']];

  function rule(name, cn, key, desc, example) {
    return { name: name, cn: cn, key: key, desc: desc, example: example };
  }

  var RULES = [
    { title: 'Hand Patterns', families: [
      { title: 'Basics', rows: [
        rule('Chicken Hand', '雞糊', 'chicken', 'Four sets and a pair, nothing else', {
          sets: [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['d8', 'd8', 'd8'], ['b7', 'b8', 'b9'], ['c5', 'c5']], open: [2],
          flowers: ['f1'], note: 'Mixed suits, runs and a set, with one set claimed.',
        }),
        rule('All Sequences', '平糊', 'allSequences', 'Four chows and a pair, no honors', { sets: RUNS }),
        rule('Seven Pairs', '七對子', 'sevenPairs', 'Seven different pairs, concealed', {
          sets: [['c2', 'c2'], ['d4', 'd4'], ['b6', 'b6'], ['c8', 'c8'], ['d9', 'd9'], ['b1', 'b1'], ['we', 'we']],
        }),
        rule('All Honors', '字一色', 'allHonors', 'Only winds and dragons', {
          sets: [['we', 'we', 'we'], ['ww', 'ww', 'ww'], ['dr', 'dr', 'dr'], ['dg', 'dg', 'dg'], ['wn', 'wn']], open: [0],
        }),
      ] },
      { title: 'Triplets', rows: [
        rule('All Triplets', '對對糊', 'allTriplets', 'Four pungs or kongs and a pair', {
          sets: [['c2', 'c2', 'c2'], ['d5', 'd5', 'd5'], ['b8', 'b8', 'b8'], ['ws', 'ws', 'ws'], ['d2', 'd2']], open: [0],
        }),
        rule('Concealed Triplets', '坎坎糊', 'allConcealedTriplets', 'Four concealed pungs and a pair', {
          sets: [['c2', 'c2', 'c2'], ['d5', 'd5', 'd5'], ['b8', 'b8', 'b8'], ['ws', 'ws', 'ws'], ['d2', 'd2']],
          flags: { selfDraw: true }, note: 'Nothing claimed.',
        }),
        rule('Four Quads', '十八羅漢', 'allKongs', 'Four kongs and a pair', {
          sets: [['c2', 'c2', 'c2', 'c2'], ['d5', 'd5', 'd5', 'd5'], ['b8', 'b8', 'b8', 'b8'], ['ws', 'ws', 'ws', 'ws'], ['d2', 'd2']], open: [0, 1, 2, 3],
        }),
      ] },
      { title: 'Flushes', rows: [
        rule('Half Flush', '混一色', 'halfFlush', 'One suit plus honors', {
          sets: [['c2', 'c3', 'c4'], ['c5', 'c6', 'c7'], ['c7', 'c8', 'c9'], ['c3', 'c3', 'c3'], ['dr', 'dr']],
        }),
        rule('Full Flush', '清一色', 'fullFlush', 'One suit only', {
          sets: [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6'], ['b7', 'b8', 'b9'], ['b8', 'b8', 'b8'], ['b5', 'b5']],
        }),
        rule('Nine Gates', '九蓮寶燈', 'nineGates', '1112345678999 in one suit, plus one', {
          sets: [['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c5', 'c6', 'c7', 'c8', 'c9', 'c9', 'c9']],
          note: 'The extra Five could have been any Character.',
        }),
      ] },
      { title: 'Terminals', rows: [
        rule('Mixed Orphans', '混老頭', 'mixedOrphans', 'Only 1s, 9s and honors', {
          sets: [['c1', 'c1', 'c1'], ['d9', 'd9', 'd9'], ['we', 'we', 'we'], ['dr', 'dr', 'dr'], ['b1', 'b1']], open: [0],
        }),
        rule('All Terminals', '清老頭', 'allTerminals', 'Only 1s and 9s', {
          sets: [['c1', 'c1', 'c1'], ['c9', 'c9', 'c9'], ['d1', 'd1', 'd1'], ['d9', 'd9', 'd9'], ['b1', 'b1']], open: [0],
        }),
        rule('Thirteen Orphans', '十三么', 'thirteenOrphans', 'Every 1, 9 and honor, plus a pair', {
          sets: [['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr']],
        }),
      ] },
      { title: 'Dragons', rows: [
        rule('Dragon Set', '箭刻', 'dragonPung', 'Each pung or kong of a dragon', {
          sets: [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b4', 'b5', 'b6'], ['dr', 'dr', 'dr'], ['c8', 'c8']], open: [3],
        }),
        rule('Small Three Dragons', '小三元', 'smallDragons', 'Two dragon sets and a dragon pair', {
          sets: [['dr', 'dr', 'dr'], ['dg', 'dg', 'dg'], ['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['dw', 'dw']], open: [0],
        }),
        rule('Big Three Dragons', '大三元', 'greatDragons', 'A set of every dragon', {
          sets: [['dr', 'dr', 'dr'], ['dg', 'dg', 'dg'], ['dw', 'dw', 'dw'], ['c2', 'c3', 'c4'], ['d5', 'd5']], open: [0],
        }),
      ] },
      { title: 'Winds', rows: [
        rule('Seat or Round Wind', '門風 / 圈風', 'yakuWind', 'Each set of your wind or the round\'s', {
          sets: [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b4', 'b5', 'b6'], ['ws', 'ws', 'ws'], ['c8', 'c8']], open: [3],
          note: 'South is your seat wind.',
        }),
        rule('Small Four Winds', '小四喜', 'smallWinds', 'Three wind sets and a wind pair', {
          sets: [['we', 'we', 'we'], ['ws', 'ws', 'ws'], ['ww', 'ww', 'ww'], ['c2', 'c3', 'c4'], ['wn', 'wn']], open: [0],
        }),
        rule('Big Four Winds', '大四喜', 'greatWinds', 'A set of every wind', {
          sets: [['we', 'we', 'we'], ['ws', 'ws', 'ws'], ['ww', 'ww', 'ww'], ['wn', 'wn', 'wn'], ['c8', 'c8']], open: [0],
        }),
      ] },
    ] },
    // No hover preview here: these are about how a hand is won, not its tiles.
    { title: 'Situational', preview: false, families: [
      { rows: [
        rule('Self-Draw', '自摸', 'selfDraw', 'You draw the winning tile', {
          sets: RUNS, open: [0], flags: { selfDraw: true }, note: 'You drew the last Two Circle from the wall.',
        }),
        rule('Concealed', '門前清', 'concealed', 'No claimed sets', {
          sets: RUNS, note: 'Nothing claimed before the winning tile.',
        }),
        rule('Win on Last Tile', '海底撈月', 'lastTile', 'Win on the wall\'s last tile', {
          sets: RUNS, open: [0], flags: { selfDraw: true, lastTile: true }, note: 'The Two Circle was the last tile in the wall.',
        }),
        rule('Robbing the Kong', '搶槓', 'robKong', 'Win on a tile added to a kong', {
          sets: RUNS, open: [0], flags: { robKong: true }, note: 'Someone added a Two Circle to their pung, and you took it.',
        }),
        rule('Win by Kong', '槓上開花', 'kongWin', 'Win on a kong\'s replacement tile', {
          sets: KONG_RUNS, open: [0, 3], flags: { selfDraw: true, kongWin: true }, note: 'Your White Dragon kong drew the Two Circle.',
        }),
        rule('Win by Double Kong', '槓上槓', 'doubleKong', 'Win after two kongs in a row', {
          sets: [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b8', 'b8', 'b8', 'b8'], ['dw', 'dw', 'dw', 'dw'], ['d2', 'd2']], open: [0, 2, 3],
          flags: { selfDraw: true, doubleKong: true }, note: 'The first kong\'s tile made a second kong, and that one drew the win.',
        }),
        rule('Heavenly Hand', '天糊', 'thirteenOrphans', 'The dealer wins on the deal', {
          sets: RUNS, seat: EAST, flags: { selfDraw: true, heavenly: true }, note: 'You are the dealer and your first 14 tiles already win.',
        }),
        rule('Earthly Hand', '地糊', 'thirteenOrphans', 'Win on the dealer\'s first discard', {
          sets: RUNS, flags: { earthly: true }, note: 'The dealer\'s very first discard finishes your hand.',
        }),
      ] },
    ] },
    { title: 'Flowers & Seasons', families: [
      { rows: [
        rule('No Flowers', '無花', 'noFlowers', 'No flowers or seasons', { sets: RUNS, open: [0], flowers: [] }),
        rule('Seat Flower', '正花', 'seatFlower', 'Your own flower', {
          sets: RUNS, open: [0], flowers: ['f2', 's3'], note: 'Orchid is South\'s flower.',
        }),
        rule('Seat Season', '正季', 'seatSeason', 'Your own season', {
          sets: RUNS, open: [0], flowers: ['s2', 'f4'], note: 'Summer is South\'s season.',
        }),
        rule('Four Flowers', '四花齊', 'allFlowers', 'All four flowers, in place of the seat one', {
          sets: RUNS, open: [0], flowers: ['f1', 'f2', 'f3', 'f4'],
        }),
        rule('Four Seasons', '四季齊', 'allSeasons', 'All four seasons, in place of the seat one', {
          sets: RUNS, open: [0], flowers: ['s1', 's2', 's3', 's4'],
        }),
        rule('Seven Robbing One', '七搶一', 'sevenFlowers', 'Seven flowers and seasons', {
          sets: [], flowers: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3'], note: 'Seven bonus tiles win on their own.',
        }),
        rule('Eight Immortals', '八仙過海', 'eightFlowers', 'All eight flowers and seasons', {
          sets: [], flowers: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'], note: 'All eight win on their own.',
        }),
      ] },
    ] },
  ];

  // The pattern name points.js gives each faan key, for checking examples.
  var SCORED_AS = {
    chicken: 'Chicken Hand', allSequences: 'All Sequences', sevenPairs: 'Seven Pairs', allHonors: 'All Honors',
    allTriplets: 'All Triplets', allConcealedTriplets: 'Concealed Triplets', allKongs: 'Four Quads',
    halfFlush: 'Half Flush', fullFlush: 'Full Flush', nineGates: 'Nine Gates',
    mixedOrphans: 'Mixed Orphans', allTerminals: 'All Terminals', thirteenOrphans: 'Thirteen Orphans',
    dragonPung: 'Dragon Triplet', smallDragons: 'Small Three Dragons', greatDragons: 'Big Three Dragons',
    yakuWind: 'Seat Wind', smallWinds: 'Small Four Winds', greatWinds: 'Big Four Winds',
    selfDraw: 'Self-Draw', concealed: 'Concealed', lastTile: 'Win on Last Tile', robKong: 'Robbing the Kong',
    kongWin: 'Win by Kong', doubleKong: 'Win by Double Kong',
    noFlowers: 'No Flowers', seatFlower: 'Seat Flower', seatSeason: 'Seat Season',
    allFlowers: 'Four Flowers', allSeasons: 'Four Seasons',
    sevenFlowers: 'Seven Robbing One', eightFlowers: 'Eight Immortals Crossing the Sea',
  };

  // What an example looks like to the scorer: concealed tiles, claimed
  // melds, flowers, seat, round and how it was won.
  function scoringInput(example) {
    var open = example.open || [];
    var concealed = [];
    var melds = [];
    example.sets.forEach(function (set, k) {
      if (open.indexOf(k) === -1) { concealed = concealed.concat(set); return; }
      var type = set.length === 4 ? 'kong' : set[0] === set[1] ? 'pung' : 'chow';
      melds.push({ type: type, tile: set[0], concealed: false });
    });
    var input = {
      concealed: concealed, melds: melds, flowers: example.flowers || [],
      seat: example.seat || SOUTH, round: example.round || EAST, spicy: 'full',
    };
    var flags = example.flags || {};
    Object.keys(flags).forEach(function (k) { input[k] = flags[k]; });
    return input;
  }

  var api = { RULES: RULES, SCORED_AS: SCORED_AS, scoringInput: scoringInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MahjongRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
