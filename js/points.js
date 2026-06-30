/* Hong Kong Mahjong Points (Faan) — tile data, reference rendering, and a
   hybrid scoring calculator. Pure vanilla JS, no dependencies. */

(function () {
  'use strict';

  var TILE_BASE = '../tiles/';

  /* ------------------------------------------------------------------ *
   * 1. Tile dataset (42 tiles)
   *    suit: 'c' = characters, 'd' = circles, 'b' = bamboos, 's' = seasons, 'f' = flowers, 'z' = honors
   *    z value mapping (honors): 1 E, 2 S, 3 W, 4 N, 5 White, 6 Green, 7 Red
   * ------------------------------------------------------------------ */

  var NUM_SUITS = [
    { key: 'c', label: 'Characters', cn: '萬', word: 'characters', offset: 7 },
    { key: 'd', label: 'Circles', cn: '筒', word: 'circles', offset: 16 },
    { key: 'b', label: 'Bamboos', cn: '索', word: 'bamboos', offset: 25 },
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
    { id: 'f3', file: '41-chrysanthemum.svg', name: 'Chrysanthe-mum', marking: '菊' },
    { id: 'f4', file: '42-bamboo.svg', name: 'Bamboo Flower', marking: '竹' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'flowers', suit: 'f', name: t.name, marking: t.marking });
  });
  [
    { id: 's1', file: '35-spring.svg', name: 'Spring', marking: '春' },
    { id: 's2', file: '36-summer.svg', name: 'Summer', marking: '夏' },
    { id: 's3', file: '37-autumn.svg', name: 'Autumn', marking: '秋' },
    { id: 's4', file: '38-winter.svg', name: 'Winter', marking: '冬' },
  ].forEach(function (t) {
    TILES.push({ id: t.id, file: t.file, group: 'seasons', suit: 's', name: t.name, marking: t.marking });
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
      { title: 'Characters (萬 / Wàn)', desc: 'Also called ten-thousands. Numbered 1–9; the top character is the number, the bottom is 萬.', ids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] },
      { title: 'Circles (筒 / Tóng)', desc: 'Also called dots or coins. Count the circles — that is the tile’s number, 1–9.', ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'] },
      { title: 'Bamboo (索 / Sok)', desc: 'Also called sticks. Count the bamboo sticks for the number. The 1 Bamboo is usually a bird.', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'] },
      { title: 'Winds (風)', desc: 'Honor tiles: East, South, West, North. They never form sequences — only pairs or triplets or quads.', ids: ['we', 'ws', 'ww', 'wn'] },
      { title: 'Dragons (三元牌)', desc: 'Honor tiles: Red (中), Green (發), White (白). A triplet of dragons is always worth points.', ids: ['dr', 'dg', 'dw'] },
      { title: 'Flowers & Seasons (花 / 季)', desc: 'Set aside when drawn and replaced by a tile from the end of the wall. Count as bonus tiles.', ids: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] },
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
    allConcealedTriplets: 8,
    sevenPairs: 4,
    halfFlush: 3,
    fullFlush: 7,
    allHonors: 10,
    smallDragons: 5,
    greatDragons: 8,
    smallWinds: 6,
    greatWinds: LIMIT,
    thirteenOrphans: LIMIT,
    nineGates: LIMIT,
    allKongs: LIMIT,
    allTerminals: LIMIT,
    mixedTerminals: 4,
    dragonPung: 1,
    yakuWind: 1,
    selfDraw: 1,
    concealed: 1,
    lastTile: 1,
    robKong: 1,
    kongBloom: 1,
    doubleKong: 9,
    noFlowers: 1,
    seatFlower: 1,
    seatSeason: 1,
    allFlowers: 2,
    allSeasons: 2,
    sevenFlowers: 5,
    eightFlowers: LIMIT,
  };

  var FLOWER_IDS = ['f1', 'f2', 'f3', 'f4'];
  var SEASON_IDS = ['s1', 's2', 's3', 's4'];

  // Faan -> base points payout (classic "3 faan to win" doubling, capped at limit).
  var PAYOUT = { 3: 8, 4: 16, 5: 32, 6: 64, 7: 128, 8: 256, 9: 512, 10: 1024, 11: 2048, 12: 4096, 13: 8192 };

  function isUnlimitedFaan() {
    var el = document.getElementById('opt-unlimited');
    return !!(el && el.checked);
  }

  function capFaan(faan) {
    if (isUnlimitedFaan()) return faan;
    return faan > LIMIT ? LIMIT : faan;
  }

  function faanLabel(faan) {
    if (!isUnlimitedFaan() && faan >= LIMIT) return 'Limit';
    return faan + ' faan';
  }

  function faanToPoints(faan) {
    if (faan < MIN_FAAN) return null;
    var effective = capFaan(faan);
    if (PAYOUT[effective]) return PAYOUT[effective];
    if (isUnlimitedFaan() && effective > LIMIT) {
      return PAYOUT[LIMIT] * Math.pow(2, effective - LIMIT);
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 4. Hand model
   * ------------------------------------------------------------------ */

  var hand = []; // array of suited/honor tile ids (max 18)
  var flowers = []; // array of flower/season tile ids
  var activeExample = null;
  var HAND_URL_DELIM = '-';
  var OPT_URL_DELIM = '-';
  var OPT_QUERY_KEYS = {
    'opt-selfdraw': 'selfdraw',
    'opt-concealed': 'concealed',
    'opt-lasttile': 'lasttile',
    'opt-robkong': 'robkong',
    'opt-kongbloom': 'kongbloom',
    'opt-double-kong': 'doublekong',
    'opt-no-flowers': 'noflowers',
    'opt-unlimited': 'unlimited',
  };
  var KONG_WIN_OPTS = ['opt-robkong', 'opt-kongbloom', 'opt-double-kong'];

  function syncExampleButtons() {
    document.querySelectorAll('[data-example]').forEach(function (btn) {
      var on = btn.getAttribute('data-example') === activeExample;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setActiveExample(which) {
    activeExample = which;
    syncExampleButtons();
  }

  function clearActiveExample() {
    if (!activeExample) return;
    activeExample = null;
    syncExampleButtons();
  }

  function handCounts() {
    var c = { c: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0] };
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
    return { c: c.c.slice(), d: c.d.slice(), b: c.b.slice(), z: c.z.slice() };
  }

  // Returns array of meld-lists that fully consume `c` (each meld = {type,suit,val}).
  function decomposeAll(c) {
    var suits = ['c', 'd', 'b', 'z'];
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
    var suits = ['c', 'd', 'b', 'z'];
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

  function isAllTripletsHand(c) {
    var parses = winningParses(c);
    for (var i = 0; i < parses.length; i++) {
      var melds = parses[i].melds;
      if (melds.length === 4 && melds.every(function (m) { return m.type === 'pung' || m.type === 'kong'; })) {
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 6. Special hands (checked before normal decomposition)
   * ------------------------------------------------------------------ */

  function isAllTerminals(c) {
    // 清老头 — only 1s and 9s; no honors, no suited tiles (2–8)
    if (c.z.reduce(function (a, b) { return a + b; }, 0) !== 0) return false;
    var numSuits = ['c', 'd', 'b'];
    for (var si = 0; si < numSuits.length; si++) {
      var su = numSuits[si];
      for (var v = 2; v <= 8; v++) {
        if (c[su][v] > 0) return false;
      }
    }
    return numSuits.some(function (su) {
      return c[su][1] > 0 || c[su][9] > 0;
    });
  }

  function isMixedTerminals(c) {
    // 混老头 — every tile is a 1, 9, or honor; must include both terminals and honors
    var numSuits = ['c', 'd', 'b'];
    for (var si = 0; si < numSuits.length; si++) {
      var su = numSuits[si];
      for (var v = 2; v <= 8; v++) {
        if (c[su][v] > 0) return false;
      }
    }
    var hasHonor = c.z.reduce(function (a, b) { return a + b; }, 0) > 0;
    var hasTerminal = numSuits.some(function (su) {
      return c[su][1] > 0 || c[su][9] > 0;
    });
    return hasHonor && hasTerminal;
  }

  function isThirteenOrphans(c) {
    // 1 & 9 of each suit + all 7 honors, exactly one of them doubled (14 tiles)
    var needed = [['c', 1], ['c', 9], ['d', 1], ['d', 9], ['b', 1], ['b', 9], ['z', 1], ['z', 2], ['z', 3], ['z', 4], ['z', 5], ['z', 6], ['z', 7]];
    var total = 0, pairs = 0;
    // any non-terminal/non-honor tile disqualifies
    var allowed = {};
    needed.forEach(function (n) { allowed[n[0] + n[1]] = true; });
    var suits = ['c', 'd', 'b', 'z'];
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
    var numSuits = ['c', 'd', 'b'];
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
    var suits = ['c', 'd', 'b', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var v = 1; v <= max; v++) {
        var n = c[su][v];
        if (n === 0) continue;
        if (n !== 2 && n !== 4) return false;
        total += n;
        pairs += n / 2;
      }
    }
    return total === 14 && pairs === 7;
  }

  /* ------------------------------------------------------------------ *
   * 7. Global hand features
   * ------------------------------------------------------------------ */

  function suitProfile(c) {
    var numSuits = ['c', 'd', 'b'];
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
    if (allTriplets && ctx.concealed) {
      items.push({ name: 'Concealed Triplets', cn: '門清對對糊', faan: FAAN.allConcealedTriplets });
    } else if (allTriplets) {
      items.push({ name: 'All Triplets', cn: '對對糊', faan: FAAN.allTriplets });
    }
    if (kongs.length === 4) {
      items.push({ name: 'Four Quads', cn: '十八羅漢', faan: FAAN.allKongs });
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
        var kind = m.type === 'kong' ? 'Quad' : 'Triplet';
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
        var kind = m.type === 'kong' ? 'Quad' : 'Triplet';
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

  function flowerAutoWinItem() {
    var n = flowers.length;
    if (n >= 8) return { name: 'Eight Immortals Crossing the Sea', cn: '八仙過海', faan: FAAN.eightFlowers };
    if (n >= 7) return { name: 'Seven Robbing One', cn: '七搶一', faan: FAAN.sevenFlowers };
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 9. Situational faan from the checkboxes / selects
   * ------------------------------------------------------------------ */

  function flowerBonusItems(seat) {
    var items = [];
    function on(id) { var el = document.getElementById(id); return el && el.checked; }
    function hasBonus(id) { return flowers.indexOf(id) !== -1; }

    if (on('opt-no-flowers')) {
      if (!flowers.length) {
        items.push({ name: 'No Flowers', cn: '無花', faan: FAAN.noFlowers });
      }
      return items;
    }
    if (!flowers.length) return items;
    if (flowers.length >= 7) return items; // Seven Robbing One / Eight Immortals — exclusive

    var allFlowers = FLOWER_IDS.every(hasBonus);
    var allSeasons = SEASON_IDS.every(hasBonus);

    if (allFlowers) {
      items.push({ name: 'All Flowers', cn: '四花齊', faan: FAAN.allFlowers });
    }
    if (seat > 0 && hasBonus(FLOWER_IDS[seat - 1])) {
      items.push({ name: 'Seat Flower', cn: '正花', faan: FAAN.seatFlower });
    }

    if (allSeasons) {
      items.push({ name: 'All Seasons', cn: '四季齊', faan: FAAN.allSeasons });
    }
    if (seat > 0 && hasBonus(SEASON_IDS[seat - 1])) {
      items.push({ name: 'Seat Season', cn: '正花', faan: FAAN.seatSeason });
    }

    return items;
  }

  function situationalItems() {
    var items = [];
    function on(id) { var el = document.getElementById(id); return el && el.checked; }
    var ctx = ctxFromUI();

    if (on('opt-selfdraw')) items.push({ name: 'Self-Draw', cn: '自摸', faan: FAAN.selfDraw });
    if (on('opt-concealed') && !isAllTripletsHand(handCounts())) {
      items.push({ name: 'Fully Concealed', cn: '門前清', faan: FAAN.concealed });
    }
    if (on('opt-lasttile')) items.push({ name: 'Win on Last Tile', cn: '海底撈月', faan: FAAN.lastTile });
    if (on('opt-robkong')) items.push({ name: 'Robbing the Kong', cn: '搶槓', faan: FAAN.robKong });
    if (on('opt-double-kong')) {
      items.push({ name: 'Win by Double Kong', cn: '槓上槓', faan: FAAN.doubleKong });
    } else if (on('opt-kongbloom')) {
      items.push({ name: 'Win by Kong', cn: '槓上開花', faan: FAAN.kongBloom });
    }

    items = items.concat(flowerBonusItems(ctx.seat));
    return items;
  }

  function ctxFromUI() {
    var seat = parseInt((document.getElementById('opt-seat') || {}).value || '1', 10);
    var round = parseInt((document.getElementById('opt-round') || {}).value || '1', 10);
    var concealedEl = document.getElementById('opt-concealed');
    return { seat: seat, round: round, concealed: !!(concealedEl && concealedEl.checked) };
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

    var flowerWin = flowerAutoWinItem();

    if (total === 0) {
      if (flowerWin) {
        result.valid = true;
        result.items = [flowerWin].concat(situationalItems());
        result.faan = capFaan(sumFaan(result.items));
        result.points = faanToPoints(result.faan);
        return result;
      }
      if (flowers.length) {
        result.message = 'You have ' + flowers.length + ' flower/season tile' +
          (flowers.length === 1 ? '' : 's') +
          '. Collect 7 for Seven Robbing One or all 8 for an automatic win with Eight Immortals Crossing the Sea.';
      } else {
        result.message = '';
      }
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
      if (profile.numSuits.length === 0 && profile.honors) {
        result.items.push({ name: 'All Honors', cn: '字一色', faan: FAAN.allHonors });
      } else if (isAllTerminals(c)) {
        result.items.push({ name: 'All Terminals', cn: '清老頭', faan: FAAN.allTerminals });
      } else if (isMixedTerminals(c)) {
        result.items.push({ name: 'Mixed Terminals', cn: '混老頭', faan: FAAN.mixedTerminals });
      }
    } else {
      var parses = winningParses(c);
      if (parses.length === 0) {
        if (flowerWin) {
          result.valid = true;
          result.items = [flowerWin].concat(situationalItems());
          result.faan = capFaan(sumFaan(result.items));
          result.points = faanToPoints(result.faan);
          return result;
        }
        result.message = 'Not a complete winning hand yet.';
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
      var hasFourKongs = bestItems.some(function (i) { return i.name === 'Four Quads'; });
      result.items = bestItems;
      if (isAllTerminals(c) && !hasFourKongs) {
        result.items.unshift({ name: 'All Terminals', cn: '清老頭', faan: FAAN.allTerminals });
      } else if (isMixedTerminals(c) && !hasFourKongs) {
        result.items.unshift({ name: 'Mixed Terminals', cn: '混老頭', faan: FAAN.mixedTerminals });
      }
    }

    if (flowerWin) {
      result.items.push(flowerWin);
      result.valid = true;
    }

    // Situational add-ons
    result.items = result.items.concat(situationalItems());

    // Chicken hand: a valid win with zero pattern faan
    if (result.valid && sumFaan(result.items) === 0) {
      result.items.push({ name: 'Chicken Hand', cn: '雞糊', faan: FAAN.chicken });
    }

    var faan = capFaan(sumFaan(result.items));
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
      { title: 'Characters', ids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] },
      { title: 'Circles', ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'] },
      { title: 'Bamboo', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'] },
      { title: 'Winds', ids: ['we', 'ws', 'ww', 'wn'] },
      { title: 'Dragons', ids: ['dr', 'dg', 'dw'] },
      { title: 'Flowers & Seasons', ids: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] },
    ];

    host.innerHTML = groups.map(function (g) {
      return '<div class="palette-group">' +
        '<h4 class="palette-title">' + g.title + '</h4>' +
        '<div class="palette-row">' + g.ids.map(function (id) {
          var t = TILE_BY_ID[id];
          return '<button type="button" class="palette-tile" data-id="' + id + '" aria-label="Add ' + t.name + '">' +
            tileImg(t) +
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
    if (t.suit === 'f' || t.suit === 's') {
      if (flowers.indexOf(id) !== -1) return; // one of each bonus tile
      if (flowers.length >= 8) return;
      flowers.push(id);
      var noFlowers = document.getElementById('opt-no-flowers');
      if (noFlowers) noFlowers.checked = false;
    } else {
      if (tileCount(id) >= 4) return;
      if (hand.length >= 18) return;
      hand.push(id);
    }
    clearActiveExample();
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
    clearActiveExample();
    update();
  }

  function renderHand() {
    var host = document.getElementById('calc-hand');
    if (!host) return;

    var countLabel = hand.length + ' tile' + (hand.length === 1 ? '' : 's');
    var pieces = hand.map(function (id) {
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

    html += '<div class="hand-body">';
    if (!hand.length && !flowers.length) {
      html += '<p class="hand-placeholder">Click an example or add tiles to make a hand and see its score</p>';
    } else {
      html += '<div class="hand-tiles">' + pieces.join('') + flowerPieces.join('') + '</div>';
    }
    html += '</div>';
    host.innerHTML = html;
  }

  function renderResult(res) {
    var host = document.getElementById('calc-result');
    if (!host) return;

    if (!res.valid) {
      host.innerHTML = res.message
        ? '<p class="result-note">' + res.message + '</p>'
        : '';
      return;
    }

    var rows = res.items.map(function (it) {
      return '<li class="result-item"><span class="result-name">' + it.name + ' (' + it.cn + ')</span>' +
        '<span class="result-faan">' + faanLabel(it.faan) + '</span></li>';
    }).join('');

    var totalLabel = isUnlimitedFaan() || res.faan < LIMIT
      ? res.faan + ' faan'
      : 'Limit hand (' + LIMIT + ' faan)';
    var payout;
    if (res.points === null) {
      payout = '<p class="result-payout result-below">Below the ' + MIN_FAAN + '-faan minimum to win. Table rules vary.</p>';
    } else {
      var selfDraw = document.getElementById('opt-selfdraw') && document.getElementById('opt-selfdraw').checked;
       payout = '<p class="result-payout"><strong>' + res.points.toLocaleString() + ' points</strong></p>';
    }

    host.innerHTML = '<ul class="result-list">' + rows + '</ul>' +
      '<div class="result-total"><span>Total</span><strong>' + totalLabel + '</strong></div>' +
      payout;
  }

  function update() {
    renderHand();
    renderResult(evaluate());
  }

  var PLAYABLE_IDS = TILES.filter(function (t) {
    return t.suit === 'c' || t.suit === 'd' || t.suit === 'b' || t.suit === 'z';
  }).map(function (t) { return t.id; });
  var NUMBER_SUITS = ['c', 'd', 'b'];

  function rand(n) { return Math.floor(Math.random() * n); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rand(i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function countsFromIds(ids) {
    var c = {
      c: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      z: [0, 0, 0, 0, 0, 0, 0, 0],
    };
    ids.forEach(function (id) {
      var t = TILE_BY_ID[id];
      c[t.suit][t.val] += 1;
    });
    return c;
  }

  function isValidWinningHandIds(ids) {
    if (ids.length !== 14) return false;
    var c = countsFromIds(ids);
    if (isSevenPairs(c)) return true;
    return winningParses(c).length > 0;
  }

  function patternFaanForIds(ids) {
    var c = countsFromIds(ids);
    var ctx = ctxFromUI();
    var profile = suitProfile(c);

    if (isThirteenOrphans(c)) return FAAN.thirteenOrphans;
    if (isNineGates(c)) return FAAN.nineGates;
    if (isSevenPairs(c)) {
      var faan = FAAN.sevenPairs;
      if (profile.numSuits.length === 0 && profile.honors) faan += FAAN.allHonors;
      else if (isAllTerminals(c)) faan += FAAN.allTerminals;
      else if (isMixedTerminals(c)) faan += FAAN.mixedTerminals;
      return faan;
    }

    var parses = winningParses(c);
    if (!parses.length) return -1;

    var bestFaan = -1;
    var bestItems = null;
    for (var i = 0; i < parses.length; i++) {
      var its = evalParse(parses[i], profile, ctx);
      var f = sumFaan(its);
      if (f > bestFaan) { bestFaan = f; bestItems = its; }
    }

    var hasFourKongs = bestItems && bestItems.some(function (i) { return i.name === 'Four Quads'; });
    if (isAllTerminals(c) && !hasFourKongs) return bestFaan + FAAN.allTerminals;
    if (isMixedTerminals(c) && !hasFourKongs) return bestFaan + FAAN.mixedTerminals;

    return bestFaan;
  }

  function randomThirteenOrphans() {
    var base = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr'];
    var dup = base[rand(base.length)];
    return base.concat([dup]);
  }

  function randomNineGates() {
    var suit = NUMBER_SUITS[rand(3)];
    var extra = 1 + rand(9);
    var counts = { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 3 };
    counts[extra] += 1;
    var ids = [];
    for (var v = 1; v <= 9; v++) {
      for (var i = 0; i < counts[v]; i++) ids.push(suit + v);
    }
    return ids;
  }

  function randomFourWinds() {
    var winds = ['we', 'ws', 'ww', 'wn'];
    var ids = [];
    winds.forEach(function (w) { ids.push(w, w, w); });
    var pairPool = PLAYABLE_IDS.filter(function (id) { return winds.indexOf(id) === -1; });
    var pair = pairPool[rand(pairPool.length)];
    return ids.concat([pair, pair]);
  }

  function randomAllTerminals() {
    var pool = shuffle(['c1', 'c9', 'd1', 'd9', 'b1', 'b9']);
    var ids = [];
    pool.slice(0, 4).forEach(function (id) { ids.push(id, id, id); });
    ids.push(pool[4], pool[4]);
    return ids;
  }

  function randomLimitHand() {
    var builders = [randomThirteenOrphans, randomNineGates, randomFourWinds, randomAllTerminals];
    return builders[rand(builders.length)]();
  }

  function randomSevenPairsHand() {
    var pool = shuffle(PLAYABLE_IDS.slice());
    var ids = [];
    for (var i = 0; i < pool.length && ids.length < 14; i++) {
      ids.push(pool[i], pool[i]);
    }
    return ids.length === 14 ? ids : null;
  }

  function randomStandardHand() {
    var counts = {};
    function getCount(id) { return counts[id] || 0; }
    function add(id, n) {
      for (var i = 0; i < n; i++) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    var melds = 0;
    var tries = 0;
    while (melds < 4 && tries < 200) {
      tries++;
      if (Math.random() < 0.55) {
        var suit = NUMBER_SUITS[rand(3)];
        var start = 1 + rand(7);
        var ids = [suit + start, suit + (start + 1), suit + (start + 2)];
        if (ids.every(function (id) { return getCount(id) < 4; })) {
          ids.forEach(function (id) { add(id, 1); });
          melds++;
        }
      } else {
        var id = PLAYABLE_IDS[rand(PLAYABLE_IDS.length)];
        if (getCount(id) <= 1) {
          add(id, 3);
          melds++;
        }
      }
    }
    if (melds < 4) return null;

    tries = 0;
    while (tries < 100) {
      tries++;
      var pairId = PLAYABLE_IDS[rand(PLAYABLE_IDS.length)];
      if (getCount(pairId) <= 2) {
        add(pairId, 2);
        var handIds = [];
        Object.keys(counts).forEach(function (tid) {
          for (var j = 0; j < counts[tid]; j++) handIds.push(tid);
        });
        return handIds.length === 14 ? handIds : null;
      }
    }
    return null;
  }

  function generateRandomHand() {
    hand = [];
    flowers = [];
    clearActiveExample();

    if (Math.random() < 0.05) {
      var limitHand = randomLimitHand();
      if (limitHand && isValidWinningHandIds(limitHand)) {
        hand = limitHand;
        update();
        return;
      }
    }

    if (Math.random() < 0.07) {
      var sevenPairs = randomSevenPairsHand();
      if (sevenPairs) {
        hand = sevenPairs;
        update();
        return;
      }
    }

    for (var attempt = 0; attempt < 200; attempt++) {
      var candidate = randomStandardHand();
      if (candidate && isValidWinningHandIds(candidate) && patternFaanForIds(candidate) >= MIN_FAAN) {
        hand = candidate;
        update();
        return;
      }
    }
    loadExample('halfflush');
  }

  function resetHand() {
    hand = [];
    flowers = [];
    var noFlowers = document.getElementById('opt-no-flowers');
    if (noFlowers) noFlowers.checked = true;
    clearActiveExample();
    update();
  }

  function loadHandFromQuery(params) {
    params = params || new URLSearchParams(window.location.search);
    var h = params.get('h');
    if (!h) return;

    var ids = h.split(HAND_URL_DELIM);
    var next = [];
    var counts = {};
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i].trim();
      if (!id) continue;
      var t = TILE_BY_ID[id];
      if (!t || t.suit === 'f' || t.suit === 's') continue;
      counts[id] = (counts[id] || 0) + 1;
      if (counts[id] > 4) continue;
      if (next.length >= 18) break;
      next.push(id);
    }
    if (!next.length) return;

    hand = next;
    clearActiveExample();
  }

  function loadFlowersFromQuery(params) {
    params = params || new URLSearchParams(window.location.search);
    if (!params.has('f')) {
      flowers = [];
      return;
    }

    var ids = (params.get('f') || '').split(HAND_URL_DELIM);
    var next = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i].trim();
      if (!id || seen[id]) continue;
      var t = TILE_BY_ID[id];
      if (!t || (t.suit !== 'f' && t.suit !== 's')) continue;
      seen[id] = true;
      if (next.length >= 8) break;
      next.push(id);
    }
    flowers = next;
    if (next.length) {
      var noFlowers = document.getElementById('opt-no-flowers');
      if (noFlowers) noFlowers.checked = false;
    }
    clearActiveExample();
  }

  function encodeFlowersForUrl() {
    return flowers.join(HAND_URL_DELIM);
  }

  function loadOptionsFromQuery(params) {
    params = params || new URLSearchParams(window.location.search);
    if (!params.has('b')) {
      Object.keys(OPT_QUERY_KEYS).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'opt-no-flowers') {
          el.checked = flowers.length === 0;
        } else {
          el.checked = false;
        }
      });
      return;
    }

    var selected = {};
    var seatVal = null;
    var tableVal = null;
    (params.get('b') || '').split(OPT_URL_DELIM).forEach(function (key) {
      key = key.trim();
      if (!key) return;
      var seatMatch = /^seat([1-4])$/.exec(key);
      if (seatMatch) {
        seatVal = seatMatch[1];
        return;
      }
      var tableMatch = /^table([1-4])$/.exec(key);
      if (tableMatch) {
        tableVal = tableMatch[1];
        return;
      }
      selected[key] = true;
    });

    Object.keys(OPT_QUERY_KEYS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = !!selected[OPT_QUERY_KEYS[id]];
    });

    if (seatVal) {
      var seat = document.getElementById('opt-seat');
      if (seat) seat.value = seatVal;
    }
    if (tableVal) {
      var round = document.getElementById('opt-round');
      if (round) round.value = tableVal;
    }
    if (selected.noflowers) flowers = [];
  }

  function encodeOptionsForUrl() {
    var parts = [];
    Object.keys(OPT_QUERY_KEYS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.checked) parts.push(OPT_QUERY_KEYS[id]);
    });
    var seat = document.getElementById('opt-seat');
    var round = document.getElementById('opt-round');
    if (seat) parts.push('seat' + seat.value);
    if (round) parts.push('table' + round.value);
    return parts.join(OPT_URL_DELIM);
  }

  function loadCalculatorFromQuery() {
    var params = new URLSearchParams(window.location.search);
    loadHandFromQuery(params);
    loadFlowersFromQuery(params);
    loadOptionsFromQuery(params);
  }

  function buildShareUrl() {
    var url = new URL(window.location.href);
    var params = new URLSearchParams();

    var opts = encodeOptionsForUrl();
    if (opts) params.set('b', opts);

    if (hand.length) {
      params.set('h', hand.join(HAND_URL_DELIM));
    }
    var bonus = encodeFlowersForUrl();
    if (bonus) {
      params.set('f', bonus);
    }

    url.search = params.toString();
    url.hash = 'calculator';
    return url.toString();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function shareHand() {
    var btn = document.getElementById('calc-share');
    var label = btn ? btn.textContent : 'Share';
    var url = buildShareUrl();
    history.replaceState(null, '', url);
    copyText(url).then(function () {
      if (!btn) return;
      btn.textContent = 'Copied Link';
      setTimeout(function () { btn.textContent = label; }, 1500);
    }).catch(function () {
      if (!btn) return;
      btn.textContent = 'Copy failed';
      setTimeout(function () { btn.textContent = label; }, 1500);
    });
  }

  function handleOptionsChange(e) {
    var target = e && e.target;
    if (target && target.type === 'checkbox') {
      if (KONG_WIN_OPTS.indexOf(target.id) !== -1 && target.checked) {
        KONG_WIN_OPTS.forEach(function (id) {
          if (id === target.id) return;
          var el = document.getElementById(id);
          if (el) el.checked = false;
        });
      }
      if (target.id === 'opt-no-flowers' && target.checked) {
        flowers = [];
      }
    }
    update();
  }

  function resetBonuses() {
    document.querySelectorAll('#calc-options input[type="checkbox"]').forEach(function (cb) {
      cb.checked = cb.id === 'opt-no-flowers' && flowers.length === 0;
    });
    var seat = document.getElementById('opt-seat');
    var round = document.getElementById('opt-round');
    if (seat) seat.value = '1';
    if (round) round.value = '1';
    renderResult(evaluate());
  }

  function loadExample(which) {
    hand = [];
    flowers = [];

    if (which === 'chicken') {
      // Chicken (雞糊): valid win with no scoring patterns — 0 faan
      hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'd8', 'd8', 'd8', 'b7', 'b8', 'b9', 'c5', 'c5'];
    } else if (which === 'sequence') {
      // All sequences (1 faan) across three suits
      hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'd2', 'd2'];
    } else if (which === 'halfflush') {
      // One suit mixed with a dragon pair — 3 faan
      hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c7', 'c8', 'c9', 'c3', 'c3', 'c3', 'dr', 'dr'];
    } else if (which === 'alltriplets') {
      // All triplets — 3 faan
      hand = ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'b8', 'ws', 'ws', 'ws', 'd2', 'd2'];
    } else if (which === 'sevenpairs') {
      // Seven distinct pairs — 4 faan
      hand = ['c2', 'c2', 'd4', 'd4', 'b6', 'b6', 'c8', 'c8', 'd9', 'd9', 'b1', 'b1', 'we', 'we'];
    } else if (which === 'fullflush') {
      // Full flush — 7 faan
      hand = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b8', 'b8', 'b8', 'b5', 'b5'];
    } else if (which === 'threedragons') {
      // Great Three Dragons (大三元) — 8 faan
      hand = ['dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'dw', 'dw', 'dw', 'c2', 'c3', 'c4', 'd5', 'd5'];
    } else if (which === 'allhonors') {
      // All Honors (字一色) — 10 faan
      hand = ['ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'wn', 'wn'];
    } else if (which === 'thirteen') {
      // Thirteen Orphans (limit) — 13 faan
      hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr'];
    } else if (which === 'allterminals') {
      // All Terminals (limit) — 13 faan
      hand = ['c1', 'c1', 'c1', 'c9', 'c9', 'c9', 'd1', 'd1', 'd1', 'd9', 'd9', 'd9', 'b1', 'b1'];
    } else if (which === 'fourwinds') {
      // Great Four Winds (limit) — 13 faan
      hand = ['we', 'we', 'we', 'ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'wn', 'wn', 'wn', 'dr', 'dr'];
    } else if (which === 'ninegates') {
      // Nine Gates (limit) — 13 faan
      hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c5', 'c6', 'c7', 'c8', 'c9', 'c9', 'c9'];
    }
    setActiveExample(which);
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
    if (opts) opts.addEventListener('change', handleOptionsChange);

    var randomBtn = document.getElementById('calc-random');
    if (randomBtn) randomBtn.addEventListener('click', generateRandomHand);

    var reset = document.getElementById('calc-reset');
    if (reset) reset.addEventListener('click', resetHand);

    var shareBtn = document.getElementById('calc-share');
    if (shareBtn) shareBtn.addEventListener('click', shareHand);

    var resetOptions = document.getElementById('calc-reset-options');
    if (resetOptions) resetOptions.addEventListener('click', resetBonuses);

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
    syncExampleButtons();
    loadCalculatorFromQuery();
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
