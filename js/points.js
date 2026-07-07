/* Hong Kong Mahjong Points (Faan) — tile data, reference rendering, and a
   hybrid scoring calculator. Pure vanilla JS, no dependencies. */

(function () {
  'use strict';

  var TILE_BASE = '../tiles/';
  var TILE_ENTER_MS = 380;
  var TILE_REMOVE_MS = 320;
  var TILE_FLASH_OK_MS = 340;
  var TILE_FLASH_NO_MS = 460;

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
      '<img src="' + TILE_BASE + tile.file + '" alt="' + alt + '" width="100" height="140"' + lazy + ' decoding="async" draggable="false">' +
      '</span>';
  }

  function paletteTileHtml(tile) {
    var label = tile.name + ' (' + tile.marking + ')';
    var mark = (tile.suit === 'f' || tile.suit === 's')
      ? '<span class="palette-tile-mark" aria-hidden="true">' + tile.marking + '</span>'
      : '';
    return '<button type="button" class="palette-tile" data-id="' + tile.id + '" aria-label="Add ' + label + '">' +
      tileImg(tile) + mark +
      '</button>';
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
    allConcealedTriplets: 10,
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
    allTerminals: 10,
    mixedTerminals: 4,
    dragonPung: 1,
    yakuWind: 1,
    selfDraw: 1,
    concealed: 1,
    lastTile: 1,
    robKong: 1,
    kongWin: 1,
    doubleKong: 8,
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
  var spicyMode = 'full';

  function isHalfSpicy() {
    return spicyMode === 'half';
  }

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

  function halfSpicyPoints(faan) {
    if (faan <= 4) return Math.pow(2, faan);
    if (faan % 2 === 0) return Math.pow(2, (faan + 4) / 2);
    return Math.pow(2, (faan + 3) / 2) * 1.5;
  }

  function fullSpicyPoints(faan) {
    if (PAYOUT[faan]) return PAYOUT[faan];
    if (isUnlimitedFaan() && faan > LIMIT) {
      return PAYOUT[LIMIT] * Math.pow(2, faan - LIMIT);
    }
    return null;
  }

  function faanToPoints(faan) {
    if (faan < MIN_FAAN) return null;
    var effective = capFaan(faan);
    if (isHalfSpicy()) return halfSpicyPoints(effective);
    return fullSpicyPoints(effective);
  }

  /* ------------------------------------------------------------------ *
   * 4. Hand model
   * ------------------------------------------------------------------ */

  var hand = []; // array of suited/honor tile ids (max 18)
  var flowers = []; // array of flower/season tile ids
  var handLayout = []; // display order: { id, isFlower }
  var handDrag = null;
  var HAND_DRAG_THRESHOLD = 8;
  var HAND_DRAG_EDGE_THRESHOLD = 12;
  var urlSyncEnabled = false;
  var activeExample = null;
  var pendingHandHighlight = null; // { id, isFlower } — brief add animation in hand area
  var handHighlightTimer = null;
  var HAND_URL_DELIM = '-';
  var OPT_URL_DELIM = '-';
  var OPT_QUERY_KEYS = {
    'opt-selfdraw': 'selfdraw',
    'opt-concealed': 'concealed',
    'opt-lasttile': 'lasttile',
    'opt-robkong': 'robkong',
    'opt-kongwin': 'kongwin',
    'opt-double-kong': 'doublekong',
    'opt-no-flowers': 'noflowers',
    'opt-unlimited': 'unlimited',
  };
  var KONG_WIN_OPTS = ['opt-robkong', 'opt-kongwin', 'opt-double-kong'];

  function syncHandLayoutFromArrays() {
    handLayout = [];
    hand.forEach(function (id) {
      handLayout.push({ id: id, isFlower: false });
    });
    flowers.forEach(function (id) {
      handLayout.push({ id: id, isFlower: true });
    });
  }

  function syncArraysFromHandLayout() {
    hand = [];
    flowers = [];
    handLayout.forEach(function (slot) {
      if (slot.isFlower) flowers.push(slot.id);
      else hand.push(slot.id);
    });
  }

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

  function handInLayoutOrder() {
    if (handLayout.length) {
      return handLayout.filter(function (slot) { return !slot.isFlower; }).map(function (slot) { return slot.id; });
    }
    return hand.slice();
  }

  function encodeHandForUrl() {
    return handInLayoutOrder().join(HAND_URL_DELIM);
  }
  function consumeMeldFromStart(ids) {
    if (ids.length < 3) return null;
    var t = TILE_BY_ID[ids[0]];

    if (ids.length >= 4 && ids[0] === ids[1] && ids[1] === ids[2] && ids[2] === ids[3]) {
      return {
        meld: { type: 'kong', suit: t.suit, val: t.val },
        rest: ids.slice(4),
      };
    }
    if (ids[0] === ids[1] && ids[1] === ids[2]) {
      return {
        meld: { type: 'pung', suit: t.suit, val: t.val },
        rest: ids.slice(3),
      };
    }
    if (t.suit !== 'z') {
      var t2 = TILE_BY_ID[ids[1]];
      var t3 = TILE_BY_ID[ids[2]];
      if (t2.suit === t.suit && t3.suit === t.suit &&
          t2.val === t.val + 1 && t3.val === t.val + 2) {
        return {
          meld: { type: 'chow', suit: t.suit, val: t.val },
          rest: ids.slice(3),
        };
      }
    }
    return null;
  }

  function parseLeftToRight(ids) {
    if (!ids || ids.length < 14 || ids.length > 18) return null;

    var melds = [];
    var remaining = ids.slice();
    while (remaining.length > 0) {
      if (remaining.length === 2) {
        var t0 = TILE_BY_ID[remaining[0]];
        var t1 = TILE_BY_ID[remaining[1]];
        if (melds.length === 4 && t0.suit === t1.suit && t0.val === t1.val) {
          return { melds: melds, pair: { suit: t0.suit, val: t0.val } };
        }
        return null;
      }
      var step = consumeMeldFromStart(remaining);
      if (!step) return null;
      melds.push(step.meld);
      remaining = step.rest;
    }
    return null;
  }

  function applyTerminalPatternStacking(items, c) {
    var hasFourKongs = items.some(function (i) { return i.name === 'Four Quads'; });
    if (isAllTerminals(c) && !hasFourKongs) {
      return [{ name: 'All Terminals', cn: '清老頭', faan: FAAN.allTerminals }].concat(items);
    }
    if (isMixedTerminals(c) && !hasFourKongs) {
      return [{ name: 'Mixed Terminals', cn: '混老頭', faan: FAAN.mixedTerminals }].concat(items);
    }
    return items;
  }

  function leftToRightStandardItems(c, profile, ctx, orderedIds) {
    var parse = parseLeftToRight(orderedIds);
    if (!parse) return null;
    return applyTerminalPatternStacking(evalParse(parse, profile, ctx), c);
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
    // Seven unique pairs: exactly 7 tile types, each appearing twice (no quads).
    var total = 0;
    var pairs = 0;
    var suits = ['c', 'd', 'b', 'z'];
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

  function sevenPairsWindItems(c, ctx) {
    // Wind faan requires a triplet or quad; pairs never score in seven pairs.
    var items = [];
    for (var val = 1; val <= 4; val++) {
      if (c.z[val] !== 4) continue;
      if (val === ctx.seat && val === ctx.round && ctx.seat > 0) {
        items.push({ name: 'Seat and Round Wind', cn: '門風圈風', faan: FAAN.yakuWind * 2 });
      } else {
        if (val === ctx.seat && ctx.seat > 0) {
          items.push({ name: 'Seat Wind', cn: '門風', faan: FAAN.yakuWind });
        }
        if (val === ctx.round && ctx.round > 0) {
          items.push({ name: 'Round Wind', cn: '圈風', faan: FAAN.yakuWind });
        }
      }
    }
    return items;
  }

  function sevenPairsItems(c, profile, ctx) {
    var items = [{ name: 'Seven Pairs', cn: '七對子', faan: FAAN.sevenPairs }];
    if (profile.numSuits.length === 0 && profile.honors) {
      items.push({ name: 'All Honors', cn: '字一色', faan: FAAN.allHonors });
    } else if (isAllTerminals(c)) {
      items.push({ name: 'All Terminals', cn: '清老頭', faan: FAAN.allTerminals });
    } else if (isMixedTerminals(c)) {
      items.push({ name: 'Mixed Terminals', cn: '混老頭', faan: FAAN.mixedTerminals });
    } else if (profile.numSuits.length === 1 && !profile.honors) {
      items.push({ name: 'Full Flush', cn: '清一色', faan: FAAN.fullFlush });
    } else if (profile.numSuits.length === 1 && profile.honors) {
      items.push({ name: 'Half Flush', cn: '混一色', faan: FAAN.halfFlush });
    }
    items = items.concat(sevenPairsWindItems(c, ctx));
    return items;
  }

  function bestStandardItems(c, profile, ctx) {
    var parses = winningParses(c);
    if (!parses.length) return null;

    var bestItems = null;
    var bestFaan = -1;
    for (var i = 0; i < parses.length; i++) {
      var its = evalParse(parses[i], profile, ctx);
      var f = sumFaan(its);
      if (f > bestFaan) { bestFaan = f; bestItems = its; }
    }

    var hasFourKongs = bestItems.some(function (i) { return i.name === 'Four Quads'; });
    if (isAllTerminals(c) && !hasFourKongs) {
      bestItems = [{ name: 'All Terminals', cn: '清老頭', faan: FAAN.allTerminals }].concat(bestItems);
    } else if (isMixedTerminals(c) && !hasFourKongs) {
      bestItems = [{ name: 'Mixed Terminals', cn: '混老頭', faan: FAAN.mixedTerminals }].concat(bestItems);
    }
    return bestItems;
  }

  function pickPatternItems(c, profile, ctx, orderedIds) {
    var leftToRightItems = leftToRightStandardItems(c, profile, ctx, orderedIds);
    if (leftToRightItems) return leftToRightItems;

    var standardItems = bestStandardItems(c, profile, ctx);
    var sevenItems = isSevenPairs(c) ? sevenPairsItems(c, profile, ctx) : null;

    if (standardItems && sevenItems) {
      return sumFaan(sevenItems) > sumFaan(standardItems) ? sevenItems : standardItems;
    }
    if (standardItems) return standardItems;
    if (sevenItems) return sevenItems;
    return null;
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
    } else if (allTriplets && !(profile.numSuits.length === 0 && profile.honors)) {
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
      items.push({ name: 'Big Three Dragons', cn: '大三元', faan: FAAN.greatDragons });
    } else if (dragonPungs.length === 2 && dragonPair) {
      items.push({ name: 'Small Three Dragons', cn: '小三元', faan: FAAN.smallDragons });
    } else {
      var dragonTripletCount = 0;
      var dragonQuadCount = 0;
      dragonPungs.forEach(function (m) {
        if (m.type === 'kong') dragonQuadCount++;
        else dragonTripletCount++;
      });
      if (dragonTripletCount) {
        items.push({
          name: 'Dragon Triplet',
          cn: '箭刻',
          faan: FAAN.dragonPung * dragonTripletCount,
        });
      }
      if (dragonQuadCount) {
        items.push({
          name: 'Dragon Quad',
          cn: '箭刻',
          faan: FAAN.dragonPung * dragonQuadCount,
        });
      }
    }

    // --- Winds ---
    if (windPungs.length === 4) {
      items.push({ name: 'Big Four Winds', cn: '大四喜', faan: FAAN.greatWinds });
    } else if (windPungs.length === 3 && windPair) {
      items.push({ name: 'Small Four Winds', cn: '小四喜', faan: FAAN.smallWinds });
    } else {
      windPungs.forEach(function (m) {
        if (m.val === ctx.seat && m.val === ctx.round && ctx.seat > 0) {
          items.push({ name: 'Seat and Round Wind', cn: '門風圈風', faan: FAAN.yakuWind * 2 });
        } else {
          if (m.val === ctx.seat && ctx.seat > 0) items.push({ name: 'Seat Wind', cn: '門風', faan: FAAN.yakuWind });
          if (m.val === ctx.round && ctx.round > 0) items.push({ name: 'Round Wind', cn: '圈風', faan: FAAN.yakuWind });
        }
      });
    }

    return items;
  }

  function sumFaan(items) {
    return items.reduce(function (a, b) { return a + b.faan; }, 0);
  }

  // Limit hands pay limit only — constituent patterns required to form them do not stack.
  var LIMIT_HAND_NAMES = {
    'Thirteen Orphans': true,
    'Nine Gates': true,
    'Big Four Winds': true,
    'Four Quads': true,
    'Eight Immortals Crossing the Sea': true,
  };

  // Separate achievements that still stack even when a limit hand is present.
  var LIMIT_STACKABLE = {
    'Concealed Triplets': true,
    'All Honors': true,
    'Big Four Winds': true,
    'Four Quads': true,
  };

  var LIMIT_CONSTITUENTS = {
    'Big Four Winds': [
      'All Triplets', 'Half Flush', 'Full Flush',
      'All Sequences', 'Small Four Winds', 'Small Three Dragons', 'Big Three Dragons',
      'Dragon Triplet', 'Dragon Quad',
    ],
    'Four Quads': [
      'All Triplets', 'Half Flush', 'Full Flush',
      'All Sequences', 'Small Four Winds', 'Small Three Dragons', 'Big Three Dragons',
      'Dragon Triplet', 'Dragon Quad',
    ],
    'Thirteen Orphans': [
      'Mixed Terminals', 'Seven Pairs', 'All Triplets',
      'Half Flush', 'Full Flush', 'All Sequences',
    ],
    'Nine Gates': [
      'Full Flush', 'All Triplets', 'All Sequences',
    ],
  };

  var LIMIT_PREFIX_CONSTITUENTS = {
    'Big Four Winds': ['Seat Wind ', 'Round Wind ', 'Seat and Round Wind '],
    'Four Quads': ['Seat Wind ', 'Round Wind ', 'Seat and Round Wind '],
  };

  function isLimitHandItem(item) {
    return item.faan >= LIMIT && LIMIT_HAND_NAMES[item.name];
  }

  function isConstituentOfLimitHand(item, limitName) {
    if (LIMIT_STACKABLE[item.name]) return false;
    var exact = LIMIT_CONSTITUENTS[limitName];
    if (exact) {
      for (var i = 0; i < exact.length; i++) {
        if (item.name === exact[i]) return true;
      }
    }
    var prefixes = LIMIT_PREFIX_CONSTITUENTS[limitName];
    if (prefixes) {
      for (var j = 0; j < prefixes.length; j++) {
        if (item.name.indexOf(prefixes[j]) === 0) return true;
      }
    }
    return false;
  }

  function applyInherentTripletsNoStacking(items) {
    var suppressAllTriplets = items.some(function (it) {
      return it.name === 'All Honors' || it.name === 'All Terminals';
    });
    if (!suppressAllTriplets) return items;
    return items.filter(function (it) { return it.name !== 'All Triplets'; });
  }

  function applyLimitNoStacking(items) {
    var limits = items.filter(isLimitHandItem);
    if (!limits.length) return items;
    return items.filter(function (item) {
      if (isLimitHandItem(item)) return true;
      for (var k = 0; k < limits.length; k++) {
        if (isConstituentOfLimitHand(item, limits[k].name)) return false;
      }
      return true;
    });
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
      items.push({ name: 'Four Flowers', cn: '四花齊', faan: FAAN.allFlowers });
    }
    if (seat > 0 && hasBonus(FLOWER_IDS[seat - 1])) {
      items.push({ name: 'Seat Flower', cn: '正花', faan: FAAN.seatFlower });
    }

    if (allSeasons) {
      items.push({ name: 'Four Seasons', cn: '四季齊', faan: FAAN.allSeasons });
    }
    if (seat > 0 && hasBonus(SEASON_IDS[seat - 1])) {
      items.push({ name: 'Seat Season', cn: '正花', faan: FAAN.seatSeason });
    }

    return items;
  }

  function suppressesConcealedBonus(patternItems) {
    if (!patternItems || !patternItems.length) return false;
    for (var i = 0; i < patternItems.length; i++) {
      var name = patternItems[i].name;
      if (name === 'Seven Pairs' || name === 'Concealed Triplets' || name === 'Thirteen Orphans') {
        return true;
      }
    }
    return false;
  }

  function situationalItems(earnedPatternItems) {
    var items = [];
    function on(id) { var el = document.getElementById(id); return el && el.checked; }
    var ctx = ctxFromUI();

    if (on('opt-selfdraw')) items.push({ name: 'Self-Draw', cn: '自摸', faan: FAAN.selfDraw });
    if (on('opt-concealed') && !suppressesConcealedBonus(earnedPatternItems)) {
      items.push({ name: 'Concealed', cn: '門前清', faan: FAAN.concealed });
    }
    if (on('opt-lasttile')) items.push({ name: 'Win on Last Tile', cn: '海底撈月', faan: FAAN.lastTile });
    if (on('opt-robkong')) items.push({ name: 'Robbing the Kong', cn: '搶槓', faan: FAAN.robKong });
    if (on('opt-double-kong')) {
      items.push({ name: 'Win by Double Kong', cn: '槓上槓', faan: FAAN.doubleKong });
    } else if (on('opt-kongwin')) {
      items.push({ name: 'Win by Kong', cn: '槓上開花', faan: FAAN.kongWin });
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

    var result = { valid: false, items: [], faan: 0, points: null };

    var flowerWin = flowerAutoWinItem();

    if (total === 0) {
      if (flowerWin) {
        result.valid = true;
        result.items = [flowerWin].concat(situationalItems([flowerWin]));
        result.faan = capFaan(sumFaan(result.items));
        result.points = faanToPoints(result.faan);
        return result;
      }
      return result;
    }

    var isChickenHand = false;

    // Special hands first; otherwise pick the best standard or seven-pairs score
    if (isThirteenOrphans(c)) {
      result.valid = true;
      result.items = [{ name: 'Thirteen Orphans', cn: '十三么', faan: FAAN.thirteenOrphans }];
    } else if (isNineGates(c)) {
      result.valid = true;
      result.items = [{ name: 'Nine Gates', cn: '九蓮寶燈', faan: FAAN.nineGates }];
    } else {
      var patternItems = pickPatternItems(c, profile, ctx, handInLayoutOrder());
      if (patternItems) {
        result.valid = true;
        result.items = patternItems;
        isChickenHand = sumFaan(patternItems) === 0;
      } else if (flowerWin) {
        result.valid = true;
        result.items = [flowerWin].concat(situationalItems([flowerWin]));
        result.faan = capFaan(sumFaan(result.items));
        result.points = faanToPoints(result.faan);
        return result;
      } else {
        return result;
      }
    }

    if (flowerWin) {
      result.items.push(flowerWin);
      result.valid = true;
    }

    if (isChickenHand) {
      result.items.unshift({ name: 'Chicken Hand', cn: '雞糊', faan: FAAN.chicken });
    }
    
    result.items = applyInherentTripletsNoStacking(applyLimitNoStacking(result.items));

    // Situational add-ons
    result.items = result.items.concat(situationalItems(result.items));

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
      { title: 'Bamboos', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'] },
      { title: 'Honors', ids: ['we', 'ws', 'ww', 'wn', 'dr', 'dg', 'dw'] },
      { title: 'Flowers & Seasons', ids: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] },
    ];

    host.innerHTML = groups.map(function (g) {
      return '<div class="palette-group">' +
        '<h4 class="palette-title">' + g.title + '</h4>' +
        '<div class="palette-row">' + g.ids.map(function (id) {
          return paletteTileHtml(TILE_BY_ID[id]);
        }).join('') + '</div>' +
        '</div>';
    }).join('');

    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.palette-tile') : null;
      if (!btn) return;
      var added = addTile(btn.getAttribute('data-id'));
      flashPaletteTile(btn, added);
    });
  }

  function flashPaletteTile(btn, added) {
    flashControlButton(btn, added ? 'success' : 'rejected');
  }

  function flashControlButton(btn, outcome) {
    if (!btn) return;
    var ok = outcome !== 'rejected';
    var cls = ok ? 'is-flash-success' : 'is-flash-rejected';
    btn.classList.remove('is-flash-success', 'is-flash-rejected');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        btn.classList.add(cls);
      });
    });
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(function () {
      btn.classList.remove('is-flash-success', 'is-flash-rejected');
    }, ok ? TILE_FLASH_OK_MS : TILE_FLASH_NO_MS);
  }

  function removeTileWithFlash(btn) {
    if (!btn || btn.classList.contains('is-removing')) return;
    btn.disabled = true;

    var id = btn.getAttribute('data-id');
    var isFlower = btn.getAttribute('data-flower') === '1';
    var slotIndex = handSlotIndex(btn);
    var container = btn.parentNode;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (btn.parentNode) btn.remove();
      removeTile(id, isFlower, slotIndex);
      return;
    }

    btn.classList.add('is-removing');
    var shifting = beginHandTileShiftLeft(btn, container);

    function finishRemove() {
      clearTimeout(btn._removeTimer);
      cleanupHandTileShift(btn, container, shifting);
      removeTile(id, isFlower, slotIndex);
    }

    clearTimeout(btn._removeTimer);
    btn._removeTimer = setTimeout(finishRemove, TILE_REMOVE_MS + 40);
  }

  function findReusableHandButton(existing, used, piece, preferredIndex) {
    var preferred = existing[preferredIndex];
    if (preferred && !used.has(preferred) && handTileMatches(preferred, piece.id, piece.isFlower)) {
      return preferred;
    }
    for (var j = 0; j < existing.length; j++) {
      var btn = existing[j];
      if (used.has(btn) || btn.classList.contains('is-removing') ||
          btn.classList.contains('is-dragging-absolute')) continue;
      if (handTileMatches(btn, piece.id, piece.isFlower)) return btn;
    }
    return null;
  }

  function applyHandTileState(btn, piece) {
    if (btn.classList.contains('is-removing')) return;
    btn.classList.toggle('is-flower', piece.isFlower);
    if (piece.isJustAdded) btn.classList.add('is-just-added');
    else btn.classList.remove('is-just-added');
    btn.disabled = false;
  }

  function handSlotIndex(btn) {
    return btn.parentNode ? Array.prototype.indexOf.call(btn.parentNode.children, btn) : -1;
  }

  function captureHandTileRects(container) {
    var map = new Map();
    Array.prototype.forEach.call(container.children, function (btn) {
      map.set(btn, btn.getBoundingClientRect());
    });
    return map;
  }

  function beginHandTileShiftLeft(btn, container) {
    if (!container) return [];

    var containerRect = container.getBoundingClientRect();
    var btnRect = btn.getBoundingClientRect();
    var beforeRects = captureHandTileRects(container);
    var shifting = [];

    btn.style.left = (btnRect.left - containerRect.left) + 'px';
    btn.style.top = (btnRect.top - containerRect.top) + 'px';
    btn.style.width = btnRect.width + 'px';
    container.classList.add('hand-tiles--removing');
    btn.classList.add('is-removing-absolute');

    void container.offsetWidth;

    Array.prototype.forEach.call(container.children, function (el) {
      if (el === btn || !beforeRects.has(el)) return;
      var before = beforeRects.get(el);
      var after = el.getBoundingClientRect();
      var dx = before.left - after.left;
      var dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.setProperty('--shift-x', dx + 'px');
      el.style.setProperty('--shift-y', dy + 'px');
      el.classList.add('is-shifting', 'is-shift-from');
      shifting.push(el);
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        shifting.forEach(function (el) {
          el.classList.remove('is-shift-from');
        });
      });
    });

    return shifting;
  }

  function cleanupHandTileShift(btn, container, shifting) {
    if (btn) {
      btn.style.removeProperty('left');
      btn.style.removeProperty('top');
      btn.style.removeProperty('width');
      if (btn.parentNode) btn.remove();
    }
    (shifting || []).forEach(function (el) {
      el.classList.remove('is-shifting', 'is-shift-from');
      el.style.removeProperty('--shift-x');
      el.style.removeProperty('--shift-y');
    });
    if (container) container.classList.remove('hand-tiles--removing');
  }

  function handTileClass(isFlower, isJustAdded) {
    var cls = 'hand-tile';
    if (isFlower) cls += ' is-flower';
    if (isJustAdded) cls += ' is-just-added';
    return cls;
  }

  function createHandTileButton(id, isFlower, isJustAdded) {
    var t = TILE_BY_ID[id];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = handTileClass(isFlower, false);
    btn.setAttribute('data-id', id);
    btn.setAttribute('data-flower', isFlower ? '1' : '0');
    btn.setAttribute('aria-label', t.name + ' — drag to reorder, tap to remove');
    btn.insertAdjacentHTML('beforeend', tileImg(t, { eager: true }));
    if (isJustAdded) {
      requestAnimationFrame(function () {
        btn.classList.add('is-just-added');
      });
    }
    return btn;
  }

  function handTileMatches(btn, id, isFlower) {
    return btn.getAttribute('data-id') === id &&
      (btn.getAttribute('data-flower') === '1') === isFlower;
  }

  function buildHandPieces() {
    var pieces = [];
    var highlightLayoutIndex = -1;
    if (pendingHandHighlight) {
      for (var i = handLayout.length - 1; i >= 0; i--) {
        if (handLayout[i].id === pendingHandHighlight.id &&
            handLayout[i].isFlower === pendingHandHighlight.isFlower) {
          highlightLayoutIndex = i;
          break;
        }
      }
    }
    handLayout.forEach(function (slot, index) {
      pieces.push({
        id: slot.id,
        isFlower: slot.isFlower,
        isJustAdded: index === highlightLayoutIndex,
      });
    });
    return pieces;
  }

  function updateHandMeta(meta, res) {
    var countSpan = meta.querySelector('.hand-meta-count');
    if (!countSpan) {
      countSpan = document.createElement('span');
      countSpan.className = 'hand-meta-count';
      meta.appendChild(countSpan);
    }

    var countLabel = hand.length + ' tile' + (hand.length === 1 ? '' : 's');
    if (hand.length && res && !res.valid) countLabel += ' (incomplete hand)';
    countSpan.textContent = countLabel;

    var flowersSpan = meta.querySelector('.hand-meta-flowers');
    if (flowers.length) {
      if (!flowersSpan) {
        flowersSpan = document.createElement('span');
        flowersSpan.className = 'hand-meta-flowers';
        meta.appendChild(flowersSpan);
      }
      flowersSpan.textContent = '+ ' + flowers.length + ' flower/season';
    } else if (flowersSpan) {
      flowersSpan.remove();
    }
  }

  function syncHandTiles(body, pieces) {
    var placeholderText = 'Click random, show examples, or add tiles to make a hand and see its score';

    if (!pieces.length) {
      var tiles = body.querySelector('.hand-tiles');
      if (tiles) tiles.remove();
      var ph = body.querySelector('.hand-placeholder');
      if (!ph) {
        ph = document.createElement('p');
        ph.className = 'hand-placeholder';
        ph.textContent = placeholderText;
        body.appendChild(ph);
      }
      return;
    }

    var ph = body.querySelector('.hand-placeholder');
    if (ph) ph.remove();

    var container = body.querySelector('.hand-tiles');
    if (!container) {
      container = document.createElement('div');
      container.className = 'hand-tiles';
      body.appendChild(container);
    }

    var existing = Array.prototype.slice.call(container.children);
    var used = new Set();

    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var btn = findReusableHandButton(existing, used, p, i);

      if (btn) {
        used.add(btn);
        if (!btn.classList.contains('is-removing')) {
          var at = container.children[i];
          if (at !== btn) container.insertBefore(btn, at || null);
        }
        applyHandTileState(btn, p);
      } else {
        var newBtn = createHandTileButton(p.id, p.isFlower, p.isJustAdded);
        container.insertBefore(newBtn, container.children[i] || null);
        used.add(newBtn);
      }
    }

    for (var k = 0; k < existing.length; k++) {
      if (!used.has(existing[k])) existing[k].remove();
    }
  }

  function ensureHandShell(host) {
    var meta = host.querySelector('.hand-meta');
    var body = host.querySelector('.hand-body');
    if (!meta || !body) {
      host.innerHTML = '<div class="hand-meta"></div><div class="hand-body"></div>';
      meta = host.querySelector('.hand-meta');
      body = host.querySelector('.hand-body');
    }
    return { meta: meta, body: body };
  }

  function scheduleHandHighlightClear() {
    clearTimeout(handHighlightTimer);
    handHighlightTimer = setTimeout(function () {
      pendingHandHighlight = null;
      document.querySelectorAll('.hand-tile.is-just-added').forEach(function (el) {
        el.classList.remove('is-just-added');
      });
    }, TILE_ENTER_MS + 40);
  }

  function addTile(id) {
    var t = TILE_BY_ID[id];
    if (!t) return false;
    if (t.suit === 'f' || t.suit === 's') {
      if (flowers.indexOf(id) !== -1) return false;
      if (flowers.length >= 8) return false;
      handLayout.push({ id: id, isFlower: true });
      var noFlowers = document.getElementById('opt-no-flowers');
      if (noFlowers) noFlowers.checked = false;
      pendingHandHighlight = { id: id, isFlower: true };
    } else {
      if (tileCount(id) >= 4) return false;
      if (hand.length >= 18) return false;
      handLayout.push({ id: id, isFlower: false });
      pendingHandHighlight = { id: id, isFlower: false };
    }
    syncArraysFromHandLayout();
    clearActiveExample();
    update();
    scheduleHandHighlightClear();
    return true;
  }

  function clearHandHighlight() {
    pendingHandHighlight = null;
    clearTimeout(handHighlightTimer);
  }

  function removeTile(id, isFlower, slotIndex) {
    if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < handLayout.length) {
      handLayout.splice(slotIndex, 1);
    } else {
      for (var i = 0; i < handLayout.length; i++) {
        if (handLayout[i].id === id && handLayout[i].isFlower === isFlower) {
          handLayout.splice(i, 1);
          break;
        }
      }
    }
    syncArraysFromHandLayout();
    clearActiveExample();
    clearHandHighlight();
    update();
  }

  function renderHand(res) {
    var host = document.getElementById('calc-hand');
    if (!host) return;

    var shell = ensureHandShell(host);
    updateHandMeta(shell.meta, res);
    syncHandTiles(shell.body, buildHandPieces());
  }

  function updateShareHighlight(res) {
    var btn = document.getElementById('calc-share');
    if (!btn) return;
    btn.classList.toggle('is-share-ready', !!(res && res.valid));
  }

  function renderResult(res) {
    updateShareHighlight(res);
    var host = document.getElementById('calc-result');
    if (!host) return;

    if (!res.valid) {
      host.innerHTML = '';
      return;
    }

    var rows = res.items.map(function (it) {
      return '<li class="result-item"><span class="result-name">' + it.name + ' (' + it.cn + ')</span>' +
        '<span class="result-faan">' + faanLabel(it.faan) + '</span></li>';
    }).join('');

    var totalLabel = isUnlimitedFaan() || res.faan < LIMIT
      ? res.faan + ' faan'
      : LIMIT + ' faan (limit hand)';
    var payout;
    if (res.points === null) {
      payout = '<p class="result-payout result-below">Below the ' + MIN_FAAN + '-faan minimum to win</p>';
    } else {
      payout = '<p class="result-payout"><strong>' + res.points.toLocaleString() + ' points</strong></p>';
    }

    var spicyToggle = '<div class="spicy-toggle" role="group" aria-label="Payout table">' +
      '<button type="button" class="spicy-toggle-btn' + (!isHalfSpicy() ? ' is-active' : '') + '" data-spicy="full" aria-pressed="' + (!isHalfSpicy() ? 'true' : 'false') + '">Full spicy</button>' +
      '<button type="button" class="spicy-toggle-btn' + (isHalfSpicy() ? ' is-active' : '') + '" data-spicy="half" aria-pressed="' + (isHalfSpicy() ? 'true' : 'false') + '">Half spicy</button>' +
      '</div>';

    host.innerHTML = '<ul class="result-list">' + rows + '</ul>' +
      '<div class="result-total"><span>Total</span><strong>' + totalLabel + '</strong></div>' +
      '<div class="result-footer">' + spicyToggle + payout + '</div>';
  }

  function update() {
    var res = evaluate();
    renderHand(res);
    renderResult(res);
    if (urlSyncEnabled) syncCalculatorUrl();
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

  function numberedTileIds() {
    var ids = [];
    NUMBER_SUITS.forEach(function (suit) {
      for (var v = 1; v <= 9; v++) ids.push(suit + v);
    });
    return ids;
  }

  function allChowSpecs() {
    var specs = [];
    NUMBER_SUITS.forEach(function (suit) {
      for (var start = 1; start <= 7; start++) specs.push({ suit: suit, start: start });
    });
    return specs;
  }

  function handIdsFromCounts(counts) {
    var handIds = [];
    Object.keys(counts).forEach(function (tid) {
      for (var j = 0; j < counts[tid]; j++) handIds.push(tid);
    });
    return handIds;
  }

  function handLengthForMeldPlan(meldTypes) {
    return 14 + meldTypes.filter(function (type) { return type === 'quad'; }).length;
  }

  function handBuilder() {
    var counts = {};
    return {
      count: function (id) { return counts[id] || 0; },
      canAdd: function (id, n) { return this.count(id) + n <= 4; },
      add: function (id, n) {
        for (var i = 0; i < n; i++) counts[id] = (counts[id] || 0) + 1;
      },
      remove: function (id, n) {
        counts[id] = (counts[id] || 0) - n;
        if (counts[id] <= 0) delete counts[id];
      },
      addChow: function (suit, start) {
        var ids = [suit + start, suit + (start + 1), suit + (start + 2)];
        if (!ids.every(function (id) { return this.canAdd(id, 1); }, this)) return false;
        ids.forEach(function (id) { this.add(id, 1); }, this);
        return true;
      },
      addPung: function (id) {
        if (!this.canAdd(id, 3)) return false;
        this.add(id, 3);
        return true;
      },
      addQuad: function (id) {
        if (!this.canAdd(id, 4)) return false;
        this.add(id, 4);
        return true;
      },
      addPair: function (id) {
        if (!this.canAdd(id, 2)) return false;
        this.add(id, 2);
        return true;
      },
      toIds: function () { return handIdsFromCounts(counts); },
    };
  }

  // Build 4 melds + a pair from an explicit meld template (e.g. ['chow','chow','pung','quad']).
  function buildStandardHand(meldTypes, options) {
    options = options || {};
    var meldPool = options.meldPool || PLAYABLE_IDS;
    var pairPool = options.pairPool || PLAYABLE_IDS;
    var accept = options.accept || function () { return true; };
    var expectedLen = handLengthForMeldPlan(meldTypes);

    var builder = handBuilder();
    var chowSpecs = shuffle(allChowSpecs());
    var chowIdx = 0;

    for (var m = 0; m < meldTypes.length; m++) {
      if (meldTypes[m] === 'chow') {
        var chowPlaced = false;
        while (chowIdx < chowSpecs.length) {
          var chow = chowSpecs[chowIdx++];
          if (builder.addChow(chow.suit, chow.start)) {
            chowPlaced = true;
            break;
          }
        }
        if (!chowPlaced) return null;
      } else if (meldTypes[m] === 'pung' || meldTypes[m] === 'quad') {
        var meldPlaced = false;
        var addMeld = meldTypes[m] === 'quad' ? 'addQuad' : 'addPung';
        shuffle(meldPool.slice()).some(function (id) {
          if (builder[addMeld](id)) meldPlaced = true;
          return meldPlaced;
        });
        if (!meldPlaced) return null;
      }
    }

    return shuffle(pairPool.slice()).reduce(function (found, pairId) {
      if (found) return found;
      if (!builder.addPair(pairId)) return null;
      var ids = builder.toIds();
      builder.remove(pairId, 2);
      return ids.length === expectedLen && accept(ids) ? ids : null;
    }, null);
  }

  function buildHandFromSteps(steps) {
    var builder = handBuilder();
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (step.type === 'chow' && !builder.addChow(step.suit, step.start)) return null;
      if (step.type === 'pung' && !builder.addPung(step.id)) return null;
      if (step.type === 'quad' && !builder.addQuad(step.id)) return null;
      if (step.type === 'pair' && !builder.addPair(step.id)) return null;
    }
    return builder.toIds();
  }

  var STANDARD_MELD_PLANS = [
    ['chow', 'chow', 'chow', 'chow'],
    ['chow', 'chow', 'chow', 'pung'],
    ['chow', 'chow', 'pung', 'pung'],
    ['chow', 'pung', 'pung', 'pung'],
    ['pung', 'pung', 'pung', 'pung'],
    ['chow', 'chow', 'chow', 'quad'],
    ['chow', 'chow', 'pung', 'quad'],
    ['chow', 'pung', 'pung', 'quad'],
    ['pung', 'pung', 'pung', 'quad'],
    ['chow', 'chow', 'quad', 'quad'],
    ['chow', 'pung', 'quad', 'quad'],
    ['pung', 'pung', 'quad', 'quad'],
    ['chow', 'quad', 'quad', 'quad'],
    ['pung', 'quad', 'quad', 'quad'],
    ['quad', 'quad', 'quad', 'quad'],
  ];

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

  function isFourQuads(c) {
    var total = 0;
    var suits = ['c', 'd', 'b', 'z'];
    for (var si = 0; si < suits.length; si++) {
      var su = suits[si];
      var max = su === 'z' ? 7 : 9;
      for (var v = 1; v <= max; v++) total += c[su][v];
    }
    if (total !== 18) return false;
    return winningParses(c).some(function (p) {
      return p.melds.filter(function (m) { return m.type === 'kong'; }).length === 4;
    });
  }

  function isValidWinningHandIds(ids) {
    var c = countsFromIds(ids);
    var total = ids.length;
    if (total < 14 || total > 18) return false;
    if (isFourQuads(c)) return true;
    if (total === 14) {
      if (isThirteenOrphans(c) || isNineGates(c)) return true;
      if (winningParses(c).length > 0) return true;
      return isSevenPairs(c);
    }
    return winningParses(c).length > 0;
  }

  function patternFaanForIds(ids) {
    var c = countsFromIds(ids);
    var ctx = ctxFromUI();
    var profile = suitProfile(c);

    if (isThirteenOrphans(c)) return FAAN.thirteenOrphans;
    if (isNineGates(c)) return FAAN.nineGates;

    var patternItems = pickPatternItems(c, profile, ctx, ids);
    if (patternItems) return sumFaan(applyInherentTripletsNoStacking(applyLimitNoStacking(patternItems)));

    return -1;
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

  function randomFourQuads() {
    var pool = shuffle(PLAYABLE_IDS.slice());
    var ids = [];
    pool.slice(0, 4).forEach(function (id) { ids.push(id, id, id, id); });
    ids.push(pool[4], pool[4]);
    return ids;
  }

  function randomLimitHand() {
    var builders = [
      randomThirteenOrphans,
      randomNineGates,
      randomFourWinds,
      randomFourQuads,
    ];
    return builders[rand(builders.length)]();
  }

  function randomSevenPairsHand() {
    return shuffle(PLAYABLE_IDS.slice()).slice(0, 7).reduce(function (ids, tileId) {
      return ids.concat([tileId, tileId]);
    }, []);
  }

  function randomSequenceHand() {
    return buildStandardHand(['chow', 'chow', 'chow', 'chow'], {
      pairPool: numberedTileIds(),
      accept: function (ids) { return patternFaanForIds(ids) === FAAN.allSequences; },
    }) || buildHandFromSteps([
      { type: 'chow', suit: 'c', start: 2 },
      { type: 'chow', suit: 'd', start: 3 },
      { type: 'chow', suit: 'b', start: 4 },
      { type: 'chow', suit: 'c', start: 5 },
      { type: 'pair', id: 'd7' },
    ]);
  }

  function randomChickenHand() {
    var chickenPlans = [
      ['chow', 'chow', 'chow', 'pung'],
      ['chow', 'chow', 'quad', 'pung'],
      ['chow', 'chow', 'chow', 'quad'],
    ];
    return shuffle(chickenPlans.slice()).reduce(function (found, plan) {
      if (found) return found;
      return buildStandardHand(plan, {
        meldPool: numberedTileIds(),
        pairPool: numberedTileIds(),
        accept: function (ids) { return patternFaanForIds(ids) === 0; },
      });
    }, null) || buildHandFromSteps([
      { type: 'chow', suit: 'c', start: 2 },
      { type: 'chow', suit: 'd', start: 4 },
      { type: 'chow', suit: 'b', start: 6 },
      { type: 'pung', id: 'c8' },
      { type: 'pair', id: 'd9' },
    ]);
  }

  function randomStandardHand() {
    return shuffle(STANDARD_MELD_PLANS.slice()).reduce(function (found, plan) {
      if (found) return found;
      return buildStandardHand(plan, {
        accept: function (ids) {
          return isValidWinningHandIds(ids) && patternFaanForIds(ids) >= MIN_FAAN;
        },
      });
    }, null);
  }

  function generateRandomHand() {
    hand = [];
    flowers = [];
    handLayout = [];
    clearActiveExample();
    clearHandHighlight();

    function commit(ids) {
      if (!ids || !isValidWinningHandIds(ids)) return false;
      hand = ids;
      syncHandLayoutFromArrays();
      update();
      return true;
    }

    if (Math.random() < 0.10 && commit(randomLimitHand())) return;
    if (Math.random() < 0.10 && commit(randomSequenceHand())) return;
    if (Math.random() < 0.10 && commit(randomChickenHand())) return;
    if (Math.random() < 0.07 && commit(randomSevenPairsHand())) return;
    if (commit(randomStandardHand())) return;

    loadExample('halfflush');
  }

  function resetHand() {
    hand = [];
    flowers = [];
    handLayout = [];
    var noFlowers = document.getElementById('opt-no-flowers');
    if (noFlowers) noFlowers.checked = true;
    clearActiveExample();
    clearHandHighlight();
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
    handLayout = next.map(function (id) { return { id: id, isFlower: false }; });
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
      spicyMode = 'full';
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
    var roundVal = null;
    (params.get('b') || '').split(OPT_URL_DELIM).forEach(function (key) {
      key = key.trim();
      if (!key) return;
      var seatMatch = /^seat([1-4])$/.exec(key);
      if (seatMatch) {
        seatVal = seatMatch[1];
        return;
      }
      var roundMatch = /^round([1-4])$/.exec(key);
      if (roundMatch) {
        roundVal = roundMatch[1];
        return;
      }
      selected[key] = true;
    });

    Object.keys(OPT_QUERY_KEYS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = !!selected[OPT_QUERY_KEYS[id]];
    });

    spicyMode = selected.halfspicy ? 'half' : 'full';

    if (seatVal) {
      var seat = document.getElementById('opt-seat');
      if (seat) seat.value = seatVal;
    }
    if (roundVal) {
      var round = document.getElementById('opt-round');
      if (round) round.value = roundVal;
    }
    if (selected.noflowers) flowers = [];
  }

  function encodeOptionsForUrl() {
    var parts = [];
    Object.keys(OPT_QUERY_KEYS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.checked) parts.push(OPT_QUERY_KEYS[id]);
    });
    if (isHalfSpicy()) parts.push('halfspicy');
    var seat = document.getElementById('opt-seat');
    var round = document.getElementById('opt-round');
    if (seat) parts.push('seat' + seat.value);
    if (round) parts.push('round' + round.value);
    return parts.join(OPT_URL_DELIM);
  }

  function loadCalculatorFromQuery() {
    var params = new URLSearchParams(window.location.search);
    loadHandFromQuery(params);
    loadFlowersFromQuery(params);
    loadOptionsFromQuery(params);
    syncHandLayoutFromArrays();
  }

  function buildShareUrl() {
    var url = new URL(window.location.href);
    var params = new URLSearchParams();

    var opts = encodeOptionsForUrl();
    if (opts) params.set('b', opts);

    if (hand.length) {
      params.set('h', encodeHandForUrl());
    }
    var bonus = encodeFlowersForUrl();
    if (bonus) {
      params.set('f', bonus);
    }

    url.search = params.toString();
    url.hash = '';
    return url.toString();
  }

  function syncCalculatorUrl() {
    if (typeof history === 'undefined' || !history.replaceState) return;
    var next = buildShareUrl();
    if (next === window.location.href) return;
    history.replaceState(null, '', next);
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

  function resetShareButton(btn) {
    if (!btn) return;
    clearTimeout(btn._shareResetTimer);
    btn.disabled = false;
    btn.textContent = 'Share Hand';
  }

  function shareHand() {
    var btn = document.getElementById('calc-share');
    if (!btn || btn.disabled) return;

    clearTimeout(btn._shareResetTimer);
    btn.disabled = true;

    syncCalculatorUrl();
    copyText(window.location.href).then(function () {
      flashControlButton(btn, 'success');
      btn.textContent = 'Copied Link';
      btn._shareResetTimer = setTimeout(function () { resetShareButton(btn); }, 1200);
    }).catch(function () {
      flashControlButton(btn, 'rejected');
      btn.textContent = 'Copy failed';
      btn._shareResetTimer = setTimeout(function () { resetShareButton(btn); }, 1200);
    });
  }

  function handleOptionsChange(e) {
    var target = e && e.target;
    if (target && target.type === 'checkbox') {
      var label = target.closest ? target.closest('.opt-check') : null;
      if (label) flashControlButton(label, 'success');
      if (KONG_WIN_OPTS.indexOf(target.id) !== -1 && target.checked) {
        KONG_WIN_OPTS.forEach(function (id) {
          if (id === target.id) return;
          var el = document.getElementById(id);
          if (el) el.checked = false;
        });
      }
      if (target.id === 'opt-no-flowers' && target.checked) {
        flowers = [];
        syncHandLayoutFromArrays();
      }
    }
    update();
  }

  function resetBonuses() {
    spicyMode = 'full';
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
    clearHandHighlight();

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
      // Big Three Dragons (大三元) — 8 faan
      hand = ['dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'dw', 'dw', 'dw', 'c2', 'c3', 'c4', 'd5', 'd5'];
    } else if (which === 'allhonors') {
      // All Honors (字一色) — 10 faan
      hand = ['we', 'we', 'we', 'ww', 'ww', 'ww', 'dr', 'dr', 'dr', 'dg', 'dg', 'dg', 'wn', 'wn'];
    } else if (which === 'thirteen') {
      // Thirteen Orphans (limit) — 13 faan
      hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr'];
    } else if (which === 'allterminals') {
      // All Terminals (清老頭) — 10 faan
      hand = ['c1', 'c1', 'c1', 'c9', 'c9', 'c9', 'd1', 'd1', 'd1', 'd9', 'd9', 'd9', 'b1', 'b1'];
    } else if (which === 'fourwinds') {
      // Big Four Winds (limit) — 13 faan
      hand = ['we', 'we', 'we', 'ws', 'ws', 'ws', 'ww', 'ww', 'ww', 'wn', 'wn', 'wn', 'c8', 'c8'];
    } else if (which === 'ninegates') {
      // Nine Gates (limit) — 13 faan
      hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c5', 'c6', 'c7', 'c8', 'c9', 'c9', 'c9'];
    }
    syncHandLayoutFromArrays();
    setActiveExample(which);
    update();
  }

  function readHandLayoutFromContainer(container) {
    var next = [];
    Array.prototype.forEach.call(container.children, function (el) {
      if (!el.classList.contains('hand-tile')) return;
      next.push({
        id: el.getAttribute('data-id'),
        isFlower: el.getAttribute('data-flower') === '1',
      });
    });
    return next;
  }

  function isPointInHandDropZone(container, x, y) {
    var zone = container.closest ? container.closest('.hand-body') : null;
    if (!zone) zone = container;
    var rect = zone.getBoundingClientRect();
    var pad = 10;
    return x >= rect.left - pad && x <= rect.right + pad &&
      y >= rect.top - pad && y <= rect.bottom + pad;
  }

  function bindHandDragDocumentListeners() {
    document.addEventListener('pointermove', onHandDragPointerMove);
    document.addEventListener('pointerup', onHandDragPointerEnd);
    document.addEventListener('pointercancel', onHandDragPointerEnd);
  }

  function unbindHandDragDocumentListeners() {
    document.removeEventListener('pointermove', onHandDragPointerMove);
    document.removeEventListener('pointerup', onHandDragPointerEnd);
    document.removeEventListener('pointercancel', onHandDragPointerEnd);
  }

  function onHandDragPointerMove(e) {
    if (!handDrag || handDrag.pointerId !== e.pointerId) return;
    if (!handDrag.active) {
      var dx = e.clientX - handDrag.startX;
      var dy = e.clientY - handDrag.startY;
      if (dx * dx + dy * dy < HAND_DRAG_THRESHOLD * HAND_DRAG_THRESHOLD) return;
      startHandDrag();
    }
    moveHandDrag(e);
  }

  function onHandDragPointerEnd(e) {
    if (!handDrag || handDrag.pointerId !== e.pointerId) return;
    var d = handDrag;
    unbindHandDragDocumentListeners();
    if (d.active) {
      if (!isPointInHandDropZone(d.container, e.clientX, e.clientY)) {
        moveHandPlaceholder(d.container, d.placeholder, d.originDropIndex);
      }
      finishHandDrag();
      return;
    }
    removeTileWithFlash(d.btn);
    try {
      d.btn.releasePointerCapture(d.pointerId);
    } catch (err) {}
    handDrag = null;
  }

  function collectHandDropTiles(container, skipBtn) {
    var tiles = [];
    Array.prototype.forEach.call(container.children, function (el) {
      if (el === skipBtn) return;
      tiles.push({ el: el, rect: el.getBoundingClientRect() });
    });
    return tiles;
  }

  function groupHandDropRows(tiles) {
    var rowTolerance = 8;
    var rows = [];

    tiles.forEach(function (tile) {
      var midY = tile.rect.top + tile.rect.height / 2;
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].midY - midY) <= rowTolerance) {
          row = rows[i];
          break;
        }
      }
      if (!row) {
        row = { midY: midY, tiles: [] };
        rows.push(row);
      }
      row.tiles.push(tile);
      row.midY = (row.midY * (row.tiles.length - 1) + midY) / row.tiles.length;
    });

    rows.sort(function (a, b) { return a.midY - b.midY; });
    rows.forEach(function (row) {
      row.tiles.sort(function (a, b) { return a.rect.left - b.rect.left; });
      row.top = row.tiles[0].rect.top;
      row.bottom = row.tiles[row.tiles.length - 1].rect.bottom;
      row.left = row.tiles[0].rect.left;
      row.right = row.tiles[row.tiles.length - 1].rect.right;
    });
    return rows;
  }

  function pickHandDropRow(rows, x, y, containerRect) {
    if (!rows.length) return null;
    var edge = HAND_DRAG_EDGE_THRESHOLD;

    for (var i = rows.length - 1; i >= 0; i--) {
      var trailingRow = rows[i];
      if (x >= trailingRow.right - edge &&
          x <= containerRect.right + 4 &&
          y >= trailingRow.top - 10 &&
          y <= trailingRow.bottom + 10) {
        return trailingRow;
      }
    }

    var chosen = rows[0];
    for (var j = 0; j < rows.length; j++) {
      if (y >= rows[j].top - 10) chosen = rows[j];
    }
    return chosen;
  }

  function handDropInsertBefore(container, el, placeholder) {
    if (!el) return null;
    var next = el.nextSibling;
    if (next === placeholder) return placeholder;
    return next;
  }

  function getHandDropInsertBefore(container, x, y, skipBtn, placeholder) {
    var tiles = collectHandDropTiles(container, skipBtn);
    if (!tiles.length) return null;

    var containerRect = container.getBoundingClientRect();
    var rows = groupHandDropRows(tiles);
    var row = pickHandDropRow(rows, x, y, containerRect);
    if (!row) return tiles[0].el;

    var lastTile = row.tiles[row.tiles.length - 1];
    var firstTile = row.tiles[0];
    var edge = HAND_DRAG_EDGE_THRESHOLD;

    if (x >= lastTile.rect.right - edge ||
        (x >= row.right - edge && x <= containerRect.right + 4 &&
         y >= row.top - 10 && y <= row.bottom + 10)) {
      return handDropInsertBefore(container, lastTile.el, placeholder);
    }

    if (x < firstTile.rect.left + edge) {
      if (firstTile.el.previousSibling === placeholder) return placeholder;
      return firstTile.el;
    }

    for (var i = 0; i < row.tiles.length - 1; i++) {
      var next = row.tiles[i + 1];
      if (x < next.rect.left + edge) {
        if (next.el.previousSibling === placeholder) return placeholder;
        return next.el;
      }
    }

    return handDropInsertBefore(container, lastTile.el, placeholder);
  }

  function getHandDropIndex(container, x, y, skipBtn, placeholder) {
    var insertBefore = getHandDropInsertBefore(container, x, y, skipBtn, placeholder);
    if (insertBefore === null) return container.children.length;
    if (insertBefore === placeholder) {
      return Array.prototype.indexOf.call(container.children, placeholder);
    }
    return Array.prototype.indexOf.call(container.children, insertBefore);
  }

  function moveHandPlaceholder(container, placeholder, nextIndex) {
    var ref = container.children[nextIndex] || null;
    if (ref === placeholder) return false;
    container.insertBefore(placeholder, ref);
    return true;
  }

  function clearHandDragStyles(btn) {
    if (!btn) return;
    btn.classList.remove('is-dragging', 'is-dragging-absolute');
    btn.style.removeProperty('position');
    btn.style.removeProperty('left');
    btn.style.removeProperty('top');
    btn.style.removeProperty('width');
    btn.style.removeProperty('z-index');
    btn.style.removeProperty('margin');
    btn.style.removeProperty('will-change');
    btn.style.removeProperty('pointer-events');
    btn.removeAttribute('aria-grabbed');
  }

  function startHandDrag() {
    var d = handDrag;
    d.active = true;
    var rect = d.btn.getBoundingClientRect();
    d.offsetX = d.startX - rect.left;
    d.offsetY = d.startY - rect.top;

    d.placeholder = document.createElement('span');
    d.placeholder.className = 'hand-tile-placeholder';
    d.placeholder.setAttribute('aria-hidden', 'true');
    d.placeholder.style.width = rect.width + 'px';
    d.placeholder.style.height = rect.height + 'px';
    d.container.insertBefore(d.placeholder, d.btn);
    d.originDropIndex = Array.prototype.indexOf.call(d.container.children, d.placeholder);
    d.dropIndex = d.originDropIndex;

    d.container.removeChild(d.btn);
    document.body.appendChild(d.btn);

    d.btn.style.position = 'fixed';
    d.btn.style.left = rect.left + 'px';
    d.btn.style.top = rect.top + 'px';
    d.btn.style.width = rect.width + 'px';
    d.btn.style.zIndex = '1000';
    d.btn.style.margin = '0';
    d.btn.style.pointerEvents = 'none';
    d.btn.classList.add('is-dragging', 'is-dragging-absolute');
    d.btn.setAttribute('aria-grabbed', 'true');
    d.container.classList.add('hand-tiles--dragging');
  }

  function moveHandDrag(e) {
    var d = handDrag;
    d.btn.style.left = (e.clientX - d.offsetX) + 'px';
    d.btn.style.top = (e.clientY - d.offsetY) + 'px';

    if (!isPointInHandDropZone(d.container, e.clientX, e.clientY)) {
      if (d.dropIndex !== d.originDropIndex) {
        moveHandPlaceholder(d.container, d.placeholder, d.originDropIndex);
        d.dropIndex = d.originDropIndex;
      }
      return;
    }

    var nextIndex = getHandDropIndex(d.container, e.clientX, e.clientY, d.btn, d.placeholder);
    if (nextIndex === d.dropIndex) return;
    if (moveHandPlaceholder(d.container, d.placeholder, nextIndex)) {
      d.dropIndex = nextIndex;
    }
  }

  function finishHandDrag() {
    var d = handDrag;
    unbindHandDragDocumentListeners();
    if (d.btn.parentNode === document.body) {
      document.body.removeChild(d.btn);
    }
    d.container.insertBefore(d.btn, d.placeholder);
    d.placeholder.remove();
    clearHandDragStyles(d.btn);
    d.container.classList.remove('hand-tiles--dragging');

    handLayout = readHandLayoutFromContainer(d.container);
    syncArraysFromHandLayout();
    clearActiveExample();
    try {
      d.btn.releasePointerCapture(d.pointerId);
    } catch (err) {}
    handDrag = null;

    var res = evaluate();
    var host = document.getElementById('calc-hand');
    if (host) {
      var shell = ensureHandShell(host);
      updateHandMeta(shell.meta, res);
    }
    renderResult(res);
    syncCalculatorUrl();
  }

  function bindHandTileInteraction(hostHand) {
    if (!hostHand) return;

    hostHand.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest ? e.target.closest('.hand-tile') : null;
      if (!btn || !hostHand.contains(btn)) return;
      var container = btn.parentNode;
      if (!container || !container.classList.contains('hand-tiles')) return;
      if (btn.disabled || btn.classList.contains('is-removing') || btn.classList.contains('is-shifting')) return;
      if (typeof e.button === 'number' && e.button !== 0) return;

      handDrag = {
        btn: btn,
        container: container,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        active: false,
      };
      bindHandDragDocumentListeners();
      btn.setPointerCapture(e.pointerId);
    });
  }

  function bindCalcControls() {
    var hostHand = document.getElementById('calc-hand');
    if (hostHand) {
      bindHandTileInteraction(hostHand);
    }
    var opts = document.getElementById('calc-options');
    if (opts) opts.addEventListener('change', handleOptionsChange);

    var randomBtn = document.getElementById('calc-random');
    if (randomBtn) {
      randomBtn.addEventListener('click', function () {
        generateRandomHand();
        flashControlButton(randomBtn);
      });
    }

    var reset = document.getElementById('calc-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        resetHand();
        flashControlButton(reset);
      });
    }

    var shareBtn = document.getElementById('calc-share');
    if (shareBtn) shareBtn.addEventListener('click', shareHand);

    var calcResult = document.getElementById('calc-result');
    if (calcResult) {
      calcResult.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.spicy-toggle-btn') : null;
        if (!btn || !calcResult.contains(btn)) return;
        var mode = btn.getAttribute('data-spicy');
        if (mode !== 'full' && mode !== 'half') return;
        if (spicyMode === mode) return;
        spicyMode = mode;
        update();
      });
    }

    var resetOptions = document.getElementById('calc-reset-options');
    if (resetOptions) {
      resetOptions.addEventListener('click', function () {
        resetBonuses();
        flashControlButton(resetOptions);
      });
    }

    document.querySelectorAll('[data-example]').forEach(function (b) {
      b.addEventListener('click', function () {
        loadExample(b.getAttribute('data-example'));
        flashControlButton(b);
      });
    });

    var toggleExamples = document.getElementById('calc-toggle-examples');
    var examplesPanel = document.getElementById('calc-examples');
    if (toggleExamples && examplesPanel) {
      var examplesVisibleKey = 'hk-mahjong-calc-examples-visible';

      function getStoredExamplesVisible() {
        try {
          var stored = localStorage.getItem(examplesVisibleKey);
          if (stored === 'true') return true;
          if (stored === 'false') return false;
        } catch (e) {}
        return false;
      }

      function setExamplesVisible(show) {
        examplesPanel.hidden = !show;
        examplesPanel.classList.toggle('is-hidden', !show);
        toggleExamples.textContent = show ? 'Hide Examples' : 'Show Examples';
        toggleExamples.setAttribute('aria-expanded', show ? 'true' : 'false');
        try {
          localStorage.setItem(examplesVisibleKey, show ? 'true' : 'false');
        } catch (e) {}
      }

      toggleExamples.addEventListener('click', function () {
        setExamplesVisible(examplesPanel.hidden);
      });

      setExamplesVisible(getStoredExamplesVisible());
    }
  }

  /* ------------------------------------------------------------------ *
   * 12. Init
   * ------------------------------------------------------------------ */

  function preventMobileViewportZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (eventName) {
      document.addEventListener(eventName, function (e) {
        e.preventDefault();
      });
    });
  }

  function init() {
    preventMobileViewportZoom();

    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    renderPalette();
    bindCalcControls();
    syncExampleButtons();
    loadCalculatorFromQuery();
    update();
    urlSyncEnabled = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
