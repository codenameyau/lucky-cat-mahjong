/* Hong Kong Mahjong Points (Faan) — tile data, reference rendering, and a
   hybrid scoring calculator. Pure vanilla JS, no dependencies. */

(function () {
  'use strict';

  var TILE_BASE = '../tiles/';

  /* ------------------------------------------------------------------ *
   * 1. Tile dataset (42 tiles)
   *    suit: 'm' = characters, 'p' = circles, 's' = bamboo, 'z' = honors
   *    z value mapping (honors): 1 E, 2 S, 3 W, 4 N, 5 White, 6 Green, 7 Red
   * ------------------------------------------------------------------ */

  var NUM_SUITS = [
    { key: 'm', label: 'Characters', cn: '萬', word: 'characters', offset: 7 },
    { key: 'p', label: 'Circles', cn: '筒', word: 'circles', offset: 16 },
    { key: 's', label: 'Bamboo', cn: '索', word: 'bamboos', offset: 25 },
  ];

  var WORD_NUMBERS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  var CN_NUMBERS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  var TILES = [];

  NUM_SUITS.forEach(function (s) {
    for (var v = 1; v <= 9; v++) {
      TILES.push({
        id: s.key + v,
        file: pad2(s.offset + v) + '-' + s.word + '-' + v + '.svg',
        group: s.key,
        suit: s.key,
        val: v,
        name: WORD_NUMBERS[v] + ' ' + (s.label === 'Characters' ? 'Character' : s.label === 'Circles' ? 'Circle' : 'Bamboo'),
        marking: CN_NUMBERS[v] + s.cn,
      });
    }
  });

  // Winds (honors z 1-4)
  [
    { id: 'we', file: '04-east-wind.svg', z: 1, name: 'East Wind', marking: '東' },
    { id: 'ws', file: '05-south-wind.svg', z: 2, name: 'South Wind', marking: '南' },
    { id: 'ww', file: '06-west-wind.svg', z: 3, name: 'West Wind', marking: '西' },
    { id: 'wn', file: '07-north-wind.svg', z: 4, name: 'North Wind', marking: '北' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'winds', suit: 'z', val: t.z, name: t.name, marking: t.marking });
  });

  // Dragons (honors z 5-7)
  [
    { id: 'dr', file: '03-red-dragon.svg', z: 7, name: 'Red Dragon', marking: '中' },
    { id: 'dg', file: '02-green-dragon.svg', z: 6, name: 'Green Dragon', marking: '發' },
    { id: 'dw', file: '01-white-dragon.svg', z: 5, name: 'White Dragon', marking: '白' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'dragons', suit: 'z', val: t.z, name: t.name, marking: t.marking });
  });

  // Flowers (the four gentlemen) and Seasons — bonus tiles, do not form melds
  [
    { id: 'f1', file: '39-plum.svg', name: 'Plum', marking: '梅' },
    { id: 'f2', file: '40-orchid.svg', name: 'Orchid', marking: '蘭' },
    { id: 'f3', file: '41-chrysanthemum.svg', name: 'Chrysanthemum', marking: '菊' },
    { id: 'f4', file: '42-bamboo.svg', name: 'Bamboo (Flower)', marking: '竹' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'flowers', suit: 'f', name: t.name, marking: t.marking });
  });
  [
    { id: 'se1', file: '35-spring.svg', name: 'Spring', marking: '春' },
    { id: 'se2', file: '36-summer.svg', name: 'Summer', marking: '夏' },
    { id: 'se3', file: '37-autumn.svg', name: 'Autumn', marking: '秋' },
    { id: 'se4', file: '38-winter.svg', name: 'Winter', marking: '冬' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'seasons', suit: 'f', name: t.name, marking: t.marking });
  });

  var TILE_BY_ID = {};
  TILES.forEach(function (t) { TILE_BY_ID[t.id] = t; });

  function tileIdFromSuitVal(suit, val) {
    if (suit === 'z') {
      return ['we', 'ws', 'ww', 'wn', 'dw', 'dg', 'dr'][val - 1];
    }
    return suit + val;
  }

  /* ------------------------------------------------------------------ *
   * 2. Rendering helpers
   * ------------------------------------------------------------------ */

  function tileImg(tile, opts) {
    opts = opts || {};
    var alt = tile.name + ' (' + tile.marking + ')';
    var lazy = opts.eager ? '' : ' loading="lazy"';
    return '<span class="tile-face">' +
      '<img src="' + TILE_BASE + tile.file + '" alt="' + alt + '" width="100" height="140"' + lazy + ' decoding="async">' +
      '</span>';
  }

  function tileFigure(tile) {
    return '<figure class="tile">' +
      tileImg(tile) +
      '<figcaption class="tile-cap">' +
      '<span class="tile-cap-name">' + tile.name + '</span>' +
      '<span class="tile-cap-mark">' + tile.marking + '</span>' +
      '</figcaption>' +
      '</figure>';
  }

  function renderReference() {
    var host = document.getElementById('tile-reference');
    if (!host) return;

    var groups = [
      { title: 'Characters (萬 / Wàn)', desc: 'The “ten-thousands” suit. Numbered 1–9; the top character is the number, the bottom is 萬.', ids: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'] },
      { title: 'Circles (筒 / Tóng)', desc: 'Also called dots or coins. Count the circles — that is the tile’s number, 1–9.', ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] },
      { title: 'Bamboo (索 / Sok)', desc: 'Also called sticks. Count the bamboo sticks for the number. The 1 Bamboo is usually a bird.', ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] },
      { title: 'Winds (風)', desc: 'Honor tiles: East, South, West, North. They never form sequences — only pairs or triplets.', ids: ['we', 'ws', 'ww', 'wn'] },
      { title: 'Dragons (三元牌)', desc: 'Honor tiles: Red (中), Green (發), White (白). A triplet of dragons is always worth points.', ids: ['dr', 'dg', 'dw'] },
      { title: 'Flowers & Seasons (花 / 季)', desc: 'Bonus tiles set aside when drawn and replaced. They never form part of the 14-tile hand but can add bonus points.', ids: ['f1', 'f2', 'f3', 'f4', 'se1', 'se2', 'se3', 'se4'] },
    ];

    host.innerHTML = groups.map(function (g) {
      return '<div class="tile-group">' +
        '<h3 class="tile-group-title">' + g.title + '</h3>' +
        '<p class="tile-group-desc">' + g.desc + '</p>' +
        '<div class="tile-grid">' + g.ids.map(function (id) { return tileFigure(TILE_BY_ID[id]); }).join('') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ------------------------------------------------------------------ *
   * 3. Scoring constants
   * ------------------------------------------------------------------ */

  var LIMIT = 13; // limit (full) hand ceiling in faan
  var MIN_FAAN = 3; // common minimum faan to declare a win (house rules vary)

  var FAAN = {
    chicken: 0,
    allSequences: 1,
    allTriplets: 3,
    sevenPairs: 4,
    halfFlush: 3,
    fullFlush: 7,
    allHonors: 10,
    smallDragons: 5,
    greatDragons: 8,
    smallWinds: 8,
    greatWinds: LIMIT,
    thirteenOrphans: LIMIT,
    nineGates: LIMIT,
    allKongs: LIMIT,
    dragonPung: 1,
    yakuWind: 1,
    selfDraw: 1,
    concealed: 1,
    lastTile: 1,
    robKong: 1,
    kongBloom: 1,
    doubleKong: 8,
    noFlowers: 1,
    seatFlower: 1,
    seatSeason: 1,
    allFlowers: 2,
    allSeasons: 2,
  };

  var FLOWER_IDS = ['f1', 'f2', 'f3', 'f4'];
  var SEASON_IDS = ['se1', 'se2', 'se3', 'se4'];

  // Faan -> base points payout (classic "3 faan to win" doubling, capped at limit).
  var PAYOUT = { 3: 8, 4: 16, 5: 32, 6: 64, 7: 128, 8: 256, 9: 512, 10: 1024, 11: 2048, 12: 4096, 13: 8192 };

  function faanToPoints(faan) {
    if (faan < MIN_FAAN) return null;
    if (faan > LIMIT) faan = LIMIT;
    return PAYOUT[faan];
  }

  /* ------------------------------------------------------------------ *
   * 4. Hand model
   * ------------------------------------------------------------------ */

  var hand = []; // array of suited/honor tile ids (max 18)
  var flowers = []; // array of flower/season tile ids

  function handCounts() {
    var c = { m: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0] };
    hand.forEach(function (id) {
      var t = TILE_BY_ID[id];
      c[t.suit][t.val] += 1;
    });
    return c;
  }

  function tileCount(id) {
    var n = 0;
    hand.forEach(function (x) { if (x === id) n++; });
    return n;
  }

  /* ------------------------------------------------------------------ *
   * 5. Hand decomposition (enumerate all 4-meld + pair parses)
   * ------------------------------------------------------------------ */

  function cloneCounts(c) {
    return { m: c.m.slice(), p: c.p.slice(), s: c.s.slice(), z: c.z.slice() };
  }

  // Returns array of meld-lists that fully consume `c` (each meld = {type,suit,val}).
  function decomposeAll(c) {
    var suits = ['m', 'p', 's', 'z'];
    var suit = null, v = -1;
    for (var si = 0; si < suits.length && suit === null; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var i = 1; i <= max; i++) {
        if (c[su][i] > 0) { suit = su; v = i; break; }
      }
    }
    if (suit === null) return [[]]; // empty -> one (empty) decomposition

    var out = [];
    var rest;

    // Kong (4 of a kind)
    if (c[suit][v] >= 4) {
      c[suit][v] -= 4;
      rest = decomposeAll(c);
      for (var k = 0; k < rest.length; k++) out.push([{ type: 'kong', suit: suit, val: v }].concat(rest[k]));
      c[suit][v] += 4;
    }
    // Pung (triplet)
    if (c[suit][v] >= 3) {
      c[suit][v] -= 3;
      rest = decomposeAll(c);
      for (var p = 0; p < rest.length; p++) out.push([{ type: 'pung', suit: suit, val: v }].concat(rest[p]));
      c[suit][v] += 3;
    }
    // Chow (sequence) — number suits only
    if (suit !== 'z' && v <= 7 && c[suit][v] > 0 && c[suit][v + 1] > 0 && c[suit][v + 2] > 0) {
      c[suit][v]--; c[suit][v + 1]--; c[suit][v + 2]--;
      rest = decomposeAll(c);
      for (var ch = 0; ch < rest.length; ch++) out.push([{ type: 'chow', suit: suit, val: v }].concat(rest[ch]));
      c[suit][v]++; c[suit][v + 1]++; c[suit][v + 2]++;
    }
    return out;
  }

  function winningParses(c) {
    var parses = [];
    var suits = ['m', 'p', 's', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var v = 1; v <= max; v++) {
        if (c[su][v] >= 2) {
          var cc = cloneCounts(c);
          cc[su][v] -= 2;
          var decs = decomposeAll(cc);
          for (var d = 0; d < decs.length; d++) {
            if (decs[d].length === 4) {
              parses.push({ melds: decs[d], pair: { suit: su, val: v } });
            }
          }
        }
      }
    }
    return parses;
  }

  /* ------------------------------------------------------------------ *
   * 6. Special hands (checked before normal decomposition)
   * ------------------------------------------------------------------ */

  var TERMINALS = { m: [1, 9], p: [1, 9], s: [1, 9] };

  function isThirteenOrphans(c) {
    // 1 & 9 of each suit + all 7 honors, exactly one of them doubled (14 tiles)
    var needed = [['m', 1], ['m', 9], ['p', 1], ['p', 9], ['s', 1], ['s', 9], ['z', 1], ['z', 2], ['z', 3], ['z', 4], ['z', 5], ['z', 6], ['z', 7]];
    var total = 0, pairs = 0;
    // any non-terminal/non-honor tile disqualifies
    var allowed = {};
    needed.forEach(function (n) { allowed[n[0] + n[1]] = true; });
    var suits = ['m', 'p', 's', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      for (var v = 1; v < c[su].length; v++) {
        var n = c[su][v];
        if (n === 0) continue;
        if (!allowed[su + v]) return false;
        total += n;
        if (n >= 2) pairs += 1;
      }
    }
    for (var i = 0; i < needed.length; i++) {
      if (c[needed[i][0]][needed[i][1]] < 1) return false;
    }
    return total === 14 && pairs === 1;
  }

  function isNineGates(c) {
    // pure one number suit, pattern 1112345678999 + one extra of any 1-9
    var numSuits = ['m', 'p', 's'];
    if (c.z.reduce(function (a, b) { return a + b; }, 0) !== 0) return false;
    var active = numSuits.filter(function (su) { return c[su].reduce(function (a, b) { return a + b; }, 0) > 0; });
    if (active.length !== 1) return false;
    var su2 = active[0];
    var arr = c[su2];
    if (arr.reduce(function (a, b) { return a + b; }, 0) !== 14) return false;
    var base = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
    var extra = 0;
    for (var v = 1; v <= 9; v++) {
      var diff = arr[v] - base[v];
      if (diff < 0) return false;
      extra += diff;
    }
    return extra === 1;
  }

  function isSevenPairs(c) {
    var total = 0;
    var pairs = 0;
    var suits = ['m', 'p', 's', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var v = 1; v <= max; v++) {
        var n = c[su][v];
        if (n === 0) continue;
        if (n !== 2) return false;
        total += n;
        pairs += 1;
      }
    }
    return total === 14 && pairs === 7;
  }

  function sevenPairTileIds(c) {
    var ids = [];
    var suits = ['m', 'p', 's', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var v = 1; v <= max; v++) {
        if (c[su][v] === 2) ids.push({ suit: su, val: v });
      }
    }
    var order = { m: 0, p: 1, s: 2, z: 3 };
    ids.sort(function (a, b) {
      if (order[a.suit] !== order[b.suit]) return order[a.suit] - order[b.suit];
      return a.val - b.val;
    });
    return ids.map(function (p) {
      var id = tileIdFromSuitVal(p.suit, p.val);
      return [id, id];
    }).reduce(function (acc, pair) { return acc.concat(pair); }, []);
  }

  /* ------------------------------------------------------------------ *
   * 7. Global hand features
   * ------------------------------------------------------------------ */

  function suitProfile(c) {
    var numSuits = ['m', 'p', 's'];
    var used = numSuits.filter(function (su) { return c[su].reduce(function (a, b) { return a + b; }, 0) > 0; });
    var honors = c.z.reduce(function (a, b) { return a + b; }, 0) > 0;
    return { numSuits: used, honors: honors };
  }

  /* ------------------------------------------------------------------ *
   * 8. Evaluate a single parse -> list of {name, cn, faan}
   * ------------------------------------------------------------------ */

  function evalParse(parse, profile, ctx) {
    var items = [];
    var melds = parse.melds;
    var pair = parse.pair;

    function isTriplet(m) { return m.type === 'pung' || m.type === 'kong'; }
    var triplets = melds.filter(isTriplet);
    var chows = melds.filter(function (m) { return m.type === 'chow'; });
    var kongs = melds.filter(function (m) { return m.type === 'kong'; });

    var dragonPungs = triplets.filter(function (m) { return m.suit === 'z' && m.val >= 5; });
    var dragonPair = pair.suit === 'z' && pair.val >= 5;
    var windPungs = triplets.filter(function (m) { return m.suit === 'z' && m.val <= 4; });
    var windPair = pair.suit === 'z' && pair.val <= 4;

    var pairIsYaku = dragonPair ||
      (windPair && (pair.val === ctx.seat || pair.val === ctx.round));

    // --- Suit composition ---
    if (profile.numSuits.length === 0 && profile.honors) {
      items.push({ name: 'All Honors', cn: '字一色', faan: FAAN.allHonors });
    } else if (profile.numSuits.length === 1 && !profile.honors) {
      items.push({ name: 'Full Flush', cn: '清一色', faan: FAAN.fullFlush });
    } else if (profile.numSuits.length === 1 && profile.honors) {
      items.push({ name: 'Half Flush', cn: '混一色', faan: FAAN.halfFlush });
    }

    // --- Meld shape ---
    var allTriplets = triplets.length === 4;
    var allChows = chows.length === 4;
    if (allTriplets && !(profile.numSuits.length === 0 && profile.honors)) {
      items.push({ name: 'All Triplets', cn: '對對糊', faan: FAAN.allTriplets });
    }
    if (kongs.length === 4) {
      items.push({ name: 'Four Kongs', cn: '十八羅漢', faan: FAAN.allKongs });
    }
    if (allChows && !pairIsYaku && !profile.honors) {
      items.push({ name: 'All Sequences', cn: '平糊', faan: FAAN.allSequences });
    }

    // --- Dragons ---
    if (dragonPungs.length === 3) {
      items.push({ name: 'Great Three Dragons', cn: '大三元', faan: FAAN.greatDragons });
    } else if (dragonPungs.length === 2 && dragonPair) {
      items.push({ name: 'Small Three Dragons', cn: '小三元', faan: FAAN.smallDragons });
    } else {
      dragonPungs.forEach(function (m) {
        var t = TILES.filter(function (x) { return x.suit === 'z' && x.val === m.val; })[0];
        var kind = m.type === 'kong' ? 'Kong' : 'Pung';
        items.push({ name: 'Dragon ' + kind + ' (' + t.name + ')', cn: '箭刻', faan: FAAN.dragonPung });
      });
    }

    // --- Winds ---
    if (windPungs.length === 4) {
      items.push({ name: 'Great Four Winds', cn: '大四喜', faan: FAAN.greatWinds });
    } else if (windPungs.length === 3 && windPair) {
      items.push({ name: 'Small Four Winds', cn: '小四喜', faan: FAAN.smallWinds });
    } else {
      windPungs.forEach(function (m) {
        var kind = m.type === 'kong' ? 'Kong' : 'Pung';
        if (m.val === ctx.seat && m.val === ctx.round && ctx.seat > 0) {
          items.push({ name: 'Double Wind ' + kind, cn: '門風圈風', faan: FAAN.yakuWind * 2 });
        } else {
          if (m.val === ctx.seat && ctx.seat > 0) items.push({ name: 'Seat Wind ' + kind, cn: '門風', faan: FAAN.yakuWind });
          if (m.val === ctx.round && ctx.round > 0) items.push({ name: 'Table Wind ' + kind, cn: '圈風', faan: FAAN.yakuWind });
        }
      });
    }

    return items;
  }

  function sumFaan(items) {
    return items.reduce(function (a, b) { return a + b.faan; }, 0);
  }

  /* ------------------------------------------------------------------ *
   * 9. Situational faan from the checkboxes / selects
   * ------------------------------------------------------------------ */

  function flowerBonusItems(seat) {
    var items = [];
    function on(id) { var el = document.getElementById(id); return el && el.checked; }
    function hasBonus(id) { return flowers.indexOf(id) !== -1; }

    if (on('opt-no-flowers')) {
      items.push({ name: 'No Flowers', cn: '無花', faan: FAAN.noFlowers });
      return items;
    }
    if (!flowers.length) return items;

    var allFlowers = FLOWER_IDS.every(hasBonus);
    var allSeasons = SEASON_IDS.every(hasBonus);

    if (allFlowers) {
      items.push({ name: 'All Flowers', cn: '四花齊', faan: FAAN.allFlowers });
    } else if (seat > 0 && hasBonus(FLOWER_IDS[seat - 1])) {
      items.push({ name: 'Seat Flower', cn: '正花', faan: FAAN.seatFlower });
    }

    if (allSeasons) {
      items.push({ name: 'All Seasons', cn: '四季齊', faan: FAAN.allSeasons });
    } else if (seat > 0 && hasBonus(SEASON_IDS[seat - 1])) {
      items.push({ name: 'Seat Season', cn: '正花', faan: FAAN.seatSeason });
    }

    return items;
  }

  function situationalItems() {
    var items = [];
    function on(id) { var el = document.getElementById(id); return el && el.checked; }
    var ctx = ctxFromUI();

    if (on('opt-selfdraw')) items.push({ name: 'Self-Draw', cn: '自摸', faan: FAAN.selfDraw });
    if (on('opt-concealed')) items.push({ name: 'Fully Concealed', cn: '門前清', faan: FAAN.concealed });
    if (on('opt-lasttile')) items.push({ name: 'Win on Last Tile', cn: '海底撈月', faan: FAAN.lastTile });
    if (on('opt-robkong')) items.push({ name: 'Robbing the Kong', cn: '搶槓', faan: FAAN.robKong });
    if (on('opt-double-kong')) {
      items.push({ name: 'Win on Double Kong', cn: '槓上槓', faan: FAAN.doubleKong });
    } else if (on('opt-kongbloom')) {
      items.push({ name: 'Win on Kong Replacement', cn: '槓上開花', faan: FAAN.kongBloom });
    }

    items = items.concat(flowerBonusItems(ctx.seat));
    return items;
  }

  function ctxFromUI() {
    var seat = parseInt((document.getElementById('opt-seat') || {}).value || '1', 10);
    var round = parseInt((document.getElementById('opt-round') || {}).value || '1', 10);
    return { seat: seat, round: round };
  }

  /* ------------------------------------------------------------------ *
   * 10. Top-level evaluation
   * ------------------------------------------------------------------ */

  function evaluate() {
    var c = handCounts();
    var total = hand.length;
    var ctx = ctxFromUI();
    var profile = suitProfile(c);

    var result = { valid: false, items: [], faan: 0, points: null, message: '' };

    if (total === 0) {
      result.message = 'Add tiles to your hand to see its score.';
      return result;
    }

    // Special hands first
    if (isThirteenOrphans(c)) {
      result.valid = true;
      result.items = [{ name: 'Thirteen Orphans', cn: '十三么', faan: FAAN.thirteenOrphans }];
    } else if (isNineGates(c)) {
      result.valid = true;
      result.items = [{ name: 'Nine Gates', cn: '九蓮寶燈', faan: FAAN.nineGates }];
    } else if (isSevenPairs(c)) {
      result.valid = true;
      result.items = [{ name: 'Seven Pairs', cn: '七對子', faan: FAAN.sevenPairs }];
    } else {
      var parses = winningParses(c);
      if (parses.length === 0) {
        result.message = 'Not a complete winning hand yet. A standard hand needs four sets (sequences or triplets) plus one pair, or seven pairs — that is 14 tiles (15–17 if you have kongs).';
        // Still show a flush hint if everything is one suit
        if (total >= 2 && profile.numSuits.length === 1 && !profile.honors) {
          result.message += ' (So far every tile is one suit — heading toward a Full Flush 清一色.)';
        }
        return result;
      }
      // pick the parse with the highest faan
      var best = null, bestItems = null, bestFaan = -1;
      for (var i = 0; i < parses.length; i++) {
        var its = evalParse(parses[i], profile, ctx);
        var f = sumFaan(its);
        if (f > bestFaan) { bestFaan = f; best = parses[i]; bestItems = its; }
      }
      result.valid = true;
      result.items = bestItems;
    }

    // Situational add-ons
    result.items = result.items.concat(situationalItems());

    // Chicken hand: a valid win with zero pattern faan
    if (result.valid && sumFaan(result.items) === 0) {
      result.items.push({ name: 'Chicken Hand', cn: '雞糊', faan: FAAN.chicken });
    }

    var faan = sumFaan(result.items);
    if (faan > LIMIT) faan = LIMIT;
    result.faan = faan;
    result.points = faanToPoints(faan);
    return result;
  }

  /* ------------------------------------------------------------------ *
   * 11. Calculator UI
   * ------------------------------------------------------------------ */

  function renderPalette() {
    var host = document.getElementById('calc-palette');
    if (!host) return;

    var groups = [
      { title: 'Characters 萬', ids: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'] },
      { title: 'Circles 筒', ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] },
      { title: 'Bamboo 索', ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] },
      { title: 'Winds 風', ids: ['we', 'ws', 'ww', 'wn'] },
      { title: 'Dragons 三元', ids: ['dr', 'dg', 'dw'] },
      { title: 'Flowers & Seasons 花季', ids: ['f1', 'f2', 'f3', 'f4', 'se1', 'se2', 'se3', 'se4'] },
    ];

    host.innerHTML = groups.map(function (g) {
      return '<div class="palette-group">' +
        '<h4 class="palette-title">' + g.title + '</h4>' +
        '<div class="palette-row">' + g.ids.map(function (id) {
          var t = TILE_BY_ID[id];
          return '<button type="button" class="palette-tile" data-id="' + id + '" aria-label="Add ' + t.name + '">' +
            tileImg(t) +
            '<span class="palette-mark">' + t.marking + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '</div>';
    }).join('');

    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.palette-tile') : null;
      if (!btn) return;
      addTile(btn.getAttribute('data-id'));
    });
  }

  function addTile(id) {
    var t = TILE_BY_ID[id];
    if (!t) return;
    if (t.suit === 'f') {
      if (flowers.indexOf(id) !== -1) return; // one of each bonus tile
      if (flowers.length >= 8) return;
      flowers.push(id);
    } else {
      if (tileCount(id) >= 4) return;
      if (hand.length >= 18) return;
      hand.push(id);
    }
    update();
  }

  function removeTile(id, isFlower) {
    if (isFlower) {
      var fi = flowers.indexOf(id);
      if (fi !== -1) flowers.splice(fi, 1);
    } else {
      var hi = hand.indexOf(id);
      if (hi !== -1) hand.splice(hi, 1);
    }
    update();
  }

  function meldToTileIds(meld) {
    if (meld.type === 'chow') {
      var s = meld.suit;
      return [
        tileIdFromSuitVal(s, meld.val),
        tileIdFromSuitVal(s, meld.val + 1),
        tileIdFromSuitVal(s, meld.val + 2),
      ];
    }
    var id = tileIdFromSuitVal(meld.suit, meld.val);
    var n = meld.type === 'kong' ? 4 : 3;
    var ids = [];
    for (var i = 0; i < n; i++) ids.push(id);
    return ids;
  }

  function sortMeldsForDisplay(melds) {
    var suitOrder = { m: 0, p: 1, s: 2, z: 3 };
    var typeOrder = { chow: 0, pung: 1, kong: 2 };
    return melds.slice().sort(function (a, b) {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      if (a.val !== b.val) return a.val - b.val;
      return typeOrder[a.type] - typeOrder[b.type];
    });
  }

  function bestWinningParse(c) {
    var parses = winningParses(c);
    if (!parses.length) return null;
    var ctx = ctxFromUI();
    var profile = suitProfile(c);
    var best = parses[0];
    var bestFaan = -1;
    for (var i = 0; i < parses.length; i++) {
      var f = sumFaan(evalParse(parses[i], profile, ctx));
      if (f > bestFaan) { bestFaan = f; best = parses[i]; }
    }
    return best;
  }

  function orderHandForDisplay(handIds) {
    if (!handIds.length) return [];

    var c = handCounts();
    if (isSevenPairs(c)) return sevenPairTileIds(c);

    var parse = bestWinningParse(c);
    if (parse) {
      var ordered = [];
      sortMeldsForDisplay(parse.melds).forEach(function (m) {
        meldToTileIds(m).forEach(function (id) { ordered.push(id); });
      });
      var pairId = tileIdFromSuitVal(parse.pair.suit, parse.pair.val);
      ordered.push(pairId, pairId);
      return ordered;
    }

    var counts = {};
    handIds.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    var pairCandidates = Object.keys(counts).filter(function (id) { return counts[id] === 2; });
    if (pairCandidates.length === 1) {
      var pairId2 = pairCandidates[0];
      var rest = handIds.filter(function (id) { return id !== pairId2; });
      var order = { m: 0, p: 1, s: 2, z: 3 };
      rest.sort(function (a, b) {
        var ta = TILE_BY_ID[a], tb = TILE_BY_ID[b];
        if (order[ta.suit] !== order[tb.suit]) return order[ta.suit] - order[tb.suit];
        return ta.val - tb.val;
      });
      return rest.concat([pairId2, pairId2]);
    }

    var order = { m: 0, p: 1, s: 2, z: 3 };
    return handIds.slice().sort(function (a, b) {
      var ta = TILE_BY_ID[a], tb = TILE_BY_ID[b];
      if (order[ta.suit] !== order[tb.suit]) return order[ta.suit] - order[tb.suit];
      return ta.val - tb.val;
    });
  }

  function renderHand() {
    var host = document.getElementById('calc-hand');
    if (!host) return;

    var sorted = orderHandForDisplay(hand);

    var countLabel = hand.length + ' tile' + (hand.length === 1 ? '' : 's');
    var pieces = sorted.map(function (id) {
      var t = TILE_BY_ID[id];
      return '<button type="button" class="hand-tile" data-id="' + id + '" data-flower="0" aria-label="Remove ' + t.name + '">' + tileImg(t) + '</button>';
    });
    var flowerPieces = flowers.map(function (id) {
      var t = TILE_BY_ID[id];
      return '<button type="button" class="hand-tile is-flower" data-id="' + id + '" data-flower="1" aria-label="Remove ' + t.name + '">' + tileImg(t) + '</button>';
    });

    var html = '<div class="hand-meta"><span>' + countLabel + '</span>';
    if (flowers.length) html += '<span class="hand-meta-flowers">+ ' + flowers.length + ' flower/season</span>';
    html += '</div>';

    if (!hand.length && !flowers.length) {
      html += '<p class="hand-empty">Tap tiles below to build a 14-tile winning hand.</p>';
    } else {
      html += '<div class="hand-tiles">' + pieces.join('') + flowerPieces.join('') + '</div>';
    }
    host.innerHTML = html;
  }

  function renderResult(res) {
    var host = document.getElementById('calc-result');
    if (!host) return;

    if (!res.valid) {
      host.innerHTML = '<p class="result-note">' + res.message + '</p>';
      return;
    }

    var rows = res.items.map(function (it) {
      var label = it.faan >= LIMIT ? 'Limit' : it.faan + ' faan';
      return '<li class="result-item"><span class="result-name">' + it.name + ' (' + it.cn + ')</span>' +
        '<span class="result-faan">' + label + '</span></li>';
    }).join('');

    var totalLabel = res.faan >= LIMIT ? 'Limit hand (' + LIMIT + ' faan)' : res.faan + ' faan';
    var payout;
    if (res.points === null) {
      payout = '<p class="result-payout result-below">Below the common ' + MIN_FAAN + '-faan minimum to win — many tables would not allow this hand to go out (詐糊). House rules vary.</p>';
    } else {
      var selfDraw = document.getElementById('opt-selfdraw') && document.getElementById('opt-selfdraw').checked;
      var payNote = selfDraw
        ? 'Each opponent pays ' + res.points
        : 'The discarder pays ' + res.points;
      payout = '<p class="result-payout">Worth <strong>' + res.points + ' base points</strong> ' +
        '<span class="result-payout-note">' + payNote + '</span></p>';
    }

    host.innerHTML = '<ul class="result-list">' + rows + '</ul>' +
      '<div class="result-total"><span>Total</span><strong>' + totalLabel + '</strong></div>' +
      payout;
  }

  function update() {
    renderHand();
    renderResult(evaluate());
  }

  function resetHand() {
    hand = [];
    flowers = [];
    resetOptions();
    update();
  }

  function resetOptions() {
    document.querySelectorAll('#calc-options input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
  }

  function loadExample(which) {
    hand = [];
    flowers = [];
    resetOptions();

    if (which === 'sequence') {
      // All sequences (1) + self-draw (1) + fully concealed (1) = 3 faan; all three suits
      hand = ['m2', 'm3', 'm4', 'p5', 'p6', 'p7', 's4', 's5', 's6', 's7', 's8', 's9', 'p2', 'p2'];
      document.getElementById('opt-selfdraw').checked = true;
      document.getElementById('opt-concealed').checked = true;
    } else if (which === 'halfflush') {
      // One suit mixed with a dragon pair = 3 faan
      hand = ['m2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm7', 'm8', 'm9', 'm3', 'm3', 'm3', 'dr', 'dr'];
    } else if (which === 'fullflush') {
      hand = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's8', 's8', 's8', 's5', 's5'];
    } else if (which === 'alltriplets') {
      hand = ['m2', 'm2', 'm2', 'p5', 'p5', 'p5', 's8', 's8', 's8', 'ws', 'ws', 'ws', 'p2', 'p2'];
    } else if (which === 'sevenpairs') {
      // Seven distinct pairs = 4 faan
      hand = ['m2', 'm2', 'p4', 'p4', 's6', 's6', 'm8', 'm8', 'p9', 'p9', 's1', 's1', 'we', 'we'];
    } else if (which === 'thirteen') {
      hand = ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr'];
    }
    update();
  }

  function bindCalcControls() {
    var hostHand = document.getElementById('calc-hand');
    if (hostHand) {
      hostHand.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.hand-tile') : null;
        if (!btn) return;
        removeTile(btn.getAttribute('data-id'), btn.getAttribute('data-flower') === '1');
      });
    }
    var opts = document.getElementById('calc-options');
    if (opts) opts.addEventListener('change', function () { renderResult(evaluate()); });

    var reset = document.getElementById('calc-reset');
    if (reset) reset.addEventListener('click', resetHand);

    document.querySelectorAll('[data-example]').forEach(function (b) {
      b.addEventListener('click', function () { loadExample(b.getAttribute('data-example')); });
    });
  }

  /* ------------------------------------------------------------------ *
   * 12. Init
   * ------------------------------------------------------------------ */

  function init() {
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    renderReference();
    renderPalette();
    bindCalcControls();
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
