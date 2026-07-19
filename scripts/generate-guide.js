#!/usr/bin/env node
/*
 * Lucky Cat Mahjong — printable rules booklet generator.
 *
 * Renders a branded Hong Kong mahjong rules booklet to a 2-page landscape
 * US Letter PDF. Print double-sided (flip on long edge) and fold once down
 * the middle to get a 4-panel booklet that reads 1 -> 2 -> 3 -> 4.
 *
 *   Sheet 1 (outside):  [ Page 4: Scoring | Page 1: Cover   ]
 *   Sheet 2 (inside):   [ Page 2: Setup   | Page 3: Concepts ]
 *
 * Usage:
 *   node scripts/generate-guide.js [output.pdf]
 *   PREVIEW=1 node scripts/generate-guide.js   # also writes PNG previews
 */

'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const TILES_DIR = path.join(ROOT, 'tiles');
const ASSETS_DIR = path.join(ROOT, 'assets');

const OUTPUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ASSETS_DIR, 'lucky-cat-mahjong-rules.pdf');

/* ------------------------------------------------------------------ *
 * Asset loading
 * ------------------------------------------------------------------ */

function dataUri(file, mime) {
  const buf = fs.readFileSync(file);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function dataUriBuf(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const SITE = readJson(path.join(ROOT, 'data', 'site.json'));
const WEBSITE = fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();

const LOGO_URI = dataUri(path.join(ROOT, 'logo.png'), 'image/png');
const QR_URI = dataUri(
  path.join(ASSETS_DIR, 'lucky-cat-mahjong-qr-code-branded.png'),
  'image/png'
);
const FONT_URI = dataUri(
  path.join(ROOT, 'fonts', 'kn-yuanmo-sc.ttf'),
  'font/ttf'
);

/* ------------------------------------------------------------------ *
 * Tile id -> file map (mirrors js/points.js)
 * ------------------------------------------------------------------ */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

const TILE_FILES = {};
[['c', 7, 'characters'], ['d', 16, 'circles'], ['b', 25, 'bamboos']].forEach(
  function (entry) {
    const key = entry[0], off = entry[1], word = entry[2];
    for (let v = 1; v <= 9; v++) {
      TILE_FILES[key + v] = pad2(off + v) + '-' + word + '-' + v + '.svg';
    }
  }
);
Object.assign(TILE_FILES, {
  we: '04-east-wind.svg', ws: '05-south-wind.svg',
  ww: '06-west-wind.svg', wn: '07-north-wind.svg',
  dr: '03-red-dragon.svg', dg: '02-green-dragon.svg', dw: '01-white-dragon.svg',
  f1: '39-plum.svg', f2: '40-orchid.svg', f3: '41-chrysanthemum.svg', f4: '42-bamboo.svg',
  s1: '35-spring.svg', s2: '36-summer.svg', s3: '37-autumn.svg', s4: '38-winter.svg',
});

/*
 * Pre-rasterize each tile into an ivory 5:7 face PNG (like .tile-face in the
 * points calculator). SVG viewBoxes have large empty margins — trim() removes
 * them so the markings fill the face the way they do on screen.
 */
const TILE_FACE_W = 140; // px @ ~2x for crisp print
const TILE_FACE_H = Math.round(TILE_FACE_W * 7 / 5); // 196
const TILE_IVORY = { r: 253, g: 249, b: 242 }; // #FDF9F2 — lighter ivory
const tileCache = {};

async function tileUri(id) {
  if (tileCache[id]) return tileCache[id];
  const file = TILE_FILES[id];
  if (!file) throw new Error('Unknown tile id: ' + id);

  const svgPath = path.join(TILES_DIR, file);
  // Match points calculator padding (~9%/8%/6%/8%) → art ≈ 84% × 85% of face.
  // Slightly tighter than calculator CSS padding so markings read at print size.
  const artW = Math.round(TILE_FACE_W * 0.88);
  const artH = Math.round(TILE_FACE_H * 0.88);
  const art = await sharp(svgPath, { density: 400 })
    .resize(artW, artH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const face = await sharp({
    create: {
      width: TILE_FACE_W,
      height: TILE_FACE_H,
      channels: 3,
      background: TILE_IVORY,
    },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toBuffer();

  const uri = dataUriBuf(face, 'image/png');
  tileCache[id] = uri;
  return uri;
}

function tile(id, cls) {
  const uri = tileCache[id];
  if (!uri) throw new Error('Tile not pre-rendered: ' + id + ' (call prepareTiles first)');
  return `<span class="tile-face ${cls || ''}"><img src="${uri}" alt=""></span>`;
}

function meldRow(groups, cls) {
  return `<span class="meld-row">${groups
    .map(function (g) {
      return `<span class="meld">${g.map(function (id) { return tile(id, cls); }).join('')}</span>`;
    })
    .join('')}</span>`;
}

async function prepareTiles(ids) {
  const unique = Array.from(new Set(ids));
  await Promise.all(unique.map(function (id) { return tileUri(id); }));
}

/** One of each unique tile in the Hong Kong set. */
const TILE_SET_ROWS = [
  { label: 'Characters', ids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] },
  { label: 'Circles', ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'] },
  { label: 'Bamboos', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'] },
  { label: 'Honors', ids: ['we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr'] },
  { label: 'Flowers & Seasons', ids: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] },
];

/* ------------------------------------------------------------------ *
 * Content data
 * ------------------------------------------------------------------ */

const ABOUT_PARAS = SITE.about.body.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
const IG_HANDLE = SITE.instagram.handle;

// Three dice totals (3–18). Count counter-clockwise from East as 1.
const DICE_SEATS = [
  { seat: 'East', totals: [5, 9, 13, 17] },
  { seat: 'South', totals: [6, 10, 14, 18] },
  { seat: 'West', totals: [3, 7, 11, 15] },
  { seat: 'North', totals: [4, 8, 12, 16] },
];

/*
 * Scoring hierarchy. Upgrades REPLACE their parent (do not stack).
 * Stackable bonuses add on top of the pattern score.
 * Matches js/points.js evaluation rules.
 */
const BONUS_TREE = [
  { name: 'Self-Draw', faan: '1', note: 'draw the winning tile from the wall' },
  { name: 'Concealed', faan: '1', note: 'no claimed discards except the winning tile' },
  { name: 'Win on Last Tile', faan: '1', note: 'win on the last tile of the wall' },
  { name: 'Win by Kong', faan: '1', note: 'win on a replacement tile after a kong' },
  { name: 'Robbing the Kong', faan: '1', note: 'win on a tile used to form a kong' },
  { name: 'Win by Double Kong', faan: '8', note: 'win on a tile from a kong, which itself was from a kong' },
  { name: 'Heavenly Hand', faan: 'Limit', note: 'dealer wins on their initial 14-tile hand' },
  { name: 'Earthly Hand', faan: 'Limit', note: 'win on dealer’s first discard' },
];

const HONORS_TREE = [
  { name: 'Dragons', faan: '1 each', note: 'dragon triplet or quad' },
  { name: 'Seat Wind', faan: '1', note: 'wind triplet or quad' },
  { name: 'Round Wind', faan: '1', note: 'wind triplet or quad' },
];

const FLOWER_TREE = [
  { name: 'No Flowers', faan: '1', note: 'no flower or season tiles' },
  { name: 'Seat Flower', faan: '1', note: 'flower matching your seat' },
  { name: 'Seat Season', faan: '1', note: 'season matching your seat' },
  { name: 'Four Flowers', faan: '2', note: 'stacks with seat flower' },
  { name: 'Four Seasons', faan: '2', note: 'stacks with seat season' },
  { name: 'Seven Robbing One', faan: '5', note: 'seven flowers and seasons; can rob the remaining tile from another player when drawn; auto-win' },
  { name: 'Eight Immortals Crossing Sea', faan: 'Limit', note: 'eight flowers and seasons; auto-win' },
];

const EXAMPLE_HANDS = [
  {
    name: 'Chicken Hand', faan: '0 faan',
    note: 'Mixed suits, sequences, and triplets',
    groups: [['c2', 'c3', 'c4'], ['d5', 'd5', 'd5'], ['b7', 'b8', 'b9'], ['we', 'we', 'we'], ['d2', 'd2']],
  },
  {
    name: 'All Sequences', faan: '1 faan',
    note: 'Four sequences and a pair',
    groups: [['c2', 'c3', 'c4'], ['d5', 'd6', 'd7'], ['b4', 'b5', 'b6'], ['b7', 'b8', 'b9'], ['d2', 'd2']],
  },
  {
    name: 'All Triplets', faan: '3 faan',
    note: 'Four triplets/quads plus a pair',
    groups: [['c2', 'c2', 'c2'], ['d5', 'd5', 'd5'], ['b8', 'b8', 'b8'], ['ws', 'ws', 'ws'], ['d2', 'd2']],
  },
  {
    name: 'Half Flush', faan: '3 faan',
    note: 'One suit plus honors',
    groups: [['c2', 'c3', 'c4'], ['c5', 'c6', 'c7'], ['c7', 'c8', 'c9'], ['c3', 'c3', 'c3'], ['dr', 'dr']],
  },
  {
    name: 'Mixed Terminals', faan: '4 faan',
    note: '1s, 9s, and honors only',
    groups: [['c1', 'c1', 'c1'], ['c9', 'c9', 'c9'], ['d1', 'd1', 'd1'], ['we', 'we', 'we'], ['b9', 'b9']],
  },
  {
    name: 'Seven Pairs', faan: '4 faan',
    note: 'Seven unique pairs',
    groups: [['c1', 'c1'], ['d2', 'd2'], ['b3', 'b3'], ['c5', 'c5'], ['d7', 'd7'], ['we', 'we'], ['dr', 'dr']],
  },
  {
    name: 'Small Three Dragons', faan: '5 faan',
    note: 'Two dragon triplets/quads and a dragon pair',
    groups: [['dg', 'dg', 'dg'], ['dw', 'dw', 'dw'], ['dr', 'dr'], ['c2', 'c3', 'c4'], ['b5', 'b5', 'b5']],
  },
  {
    name: 'Small Four Winds', faan: '6 faan',
    note: 'Three wind triplets/quads and a wind pair',
    groups: [['we', 'we', 'we'], ['ws', 'ws', 'ws'], ['ww', 'ww', 'ww'], ['wn', 'wn'], ['c5', 'c5', 'c5']],
  },
  {
    name: 'Full Flush', faan: '7 faan',
    note: 'All one suit, no honors',
    groups: [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6'], ['b7', 'b8', 'b9'], ['b8', 'b8', 'b8'], ['b5', 'b5']],
  },
  {
    name: 'Big Three Dragons', faan: '8 faan',
    note: 'A triplet/quad of each dragon',
    groups: [['dg', 'dg', 'dg'], ['dw', 'dw', 'dw'], ['dr', 'dr', 'dr'], ['c2', 'c3', 'c4'], ['b5', 'b5']],
  },
  {
    name: 'All Honors', faan: '10 faan',
    note: 'Only wind and dragon tiles',
    groups: [['we', 'we', 'we'], ['ws', 'ws', 'ws'], ['dg', 'dg', 'dg'], ['dr', 'dr', 'dr'], ['dw', 'dw']],
  },
  {
    name: 'All Terminals', faan: '10 faan',
    note: 'Only 1s and 9s',
    groups: [['c1', 'c1', 'c1'], ['c9', 'c9', 'c9'], ['d1', 'd1', 'd1'], ['b9', 'b9', 'b9'], ['d9', 'd9']],
  },
  {
    name: 'Big Four Winds', faan: 'Limit',
    note: 'A triplet/quad of each wind, plus a pair',
    groups: [['we', 'we', 'we'], ['ws', 'ws', 'ws'], ['ww', 'ww', 'ww'], ['wn', 'wn', 'wn'], ['dr', 'dr']],
  },
  {
    name: 'Thirteen Orphans', faan: 'Limit',
    note: 'One of each terminal and honor, plus one duplicate',
    groups: [['c1', 'c9', 'd1'], ['d9', 'b1', 'b9'], ['we', 'ws', 'ww'], ['wn', 'dg', 'dw'], ['dr', 'dr']],
  },
  {
    name: 'Nine Gates', faan: 'Limit',
    note: 'One suit of 1112345678999 plus one extra',
    groups: [['c1', 'c1', 'c1'], ['c2', 'c3', 'c4'], ['c5', 'c5'], ['c6', 'c7', 'c8'], ['c9', 'c9', 'c9']],
  },
  {
    name: 'Four Quads', faan: 'Limit',
    note: 'Four kongs plus a pair',
    groups: [['c1', 'c1', 'c1', 'c1'], ['d5', 'd5', 'd5', 'd5'], ['b8', 'b8', 'b8', 'b8'], ['we', 'we', 'we', 'we'], ['dr', 'dr']],
  },
];

/* ------------------------------------------------------------------ *
 * HTML helpers
 * ------------------------------------------------------------------ */

function treeRows(nodes, depth) {
  depth = depth || 0;
  return nodes.map(function (n) {
    const indent = depth > 0
      ? `<span class="tree-branch">${'└ '}</span>`
      : '';
    const note = n.note ? `<span class="tree-note"> — ${n.note}</span>` : '';
    const row = `<tr class="depth-${depth}">
      <td class="fn depth-${depth}">${indent}<span class="fname">${n.name}</span>${note}</td>
      <td class="fv">${n.faan}</td>
    </tr>`;
    const kids = n.children ? treeRows(n.children, depth + 1) : '';
    return row + kids;
  }).join('');
}

function faanTree(title, nodes, legend) {
  return `<div class="score-block">
    <h4>${title}</h4>
    ${legend ? `<p class="tree-legend">${legend}</p>` : ''}
    <table class="faan"><tbody>${treeRows(nodes)}</tbody></table>
  </div>`;
}

function exampleHand(h) {
  const tiles = h.groups.reduce(function (all, g) { return all.concat(g); }, [])
    .map(function (id) { return tile(id, 'tile-ex'); })
    .join('');
  return `<div class="example">
    <div class="example-head">
      <div class="example-title">
        <span class="example-name">${h.name}</span>
        <span class="example-faan">${h.faan}</span>
      </div>
      <div class="example-note">${h.note}</div>
    </div>
    <span class="meld-row example-tiles">${tiles}</span>
  </div>`;
}

function diceSeatsTableHtml() {
  const rows = DICE_SEATS.map(function (d) {
    const cells = d.totals.map(function (n) {
      return `<td class="dice-n">${n}</td>`;
    }).join('');
    return `<tr><td class="dice-seat">${d.seat}</td>${cells}</tr>`;
  }).join('');
  return `<div class="dice-seats-wrap">
    <table class="dice-seats">
      <thead><tr><th class="dice-seat">Seat</th><th colspan="4">Dice totals wall</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function tileSetHtml() {
  const setRows = TILE_SET_ROWS.map(function (row) {
    return `<div class="tile-set-row">
      <span class="tile-set-lbl">${row.label}</span>
      <span class="tile-set-tiles">${row.ids.map(function (id) { return tile(id, 'tile-sm'); }).join('')}</span>
    </div>`;
  }).join('');
  return `<div class="tile-set">
    <h3 class="tile-set-head">The Tiles</h3>
    ${setRows}
  </div>`;
}

const BONUS_TILES = [
  { id: 'f1', name: 'Plum' },
  { id: 'f2', name: 'Orchid' },
  { id: 'f3', name: 'Chrysanthemum' },
  { id: 'f4', name: 'Bamboo' },
  { id: 's1', name: 'Spring' },
  { id: 's2', name: 'Summer' },
  { id: 's3', name: 'Autumn' },
  { id: 's4', name: 'Winter' },
];

function bonusTilesHtml() {
  return `<div class="bonus-tiles">
    ${BONUS_TILES.map(function (t) {
      return `<span class="bonus-tile">${tile(t.id, 'tile-sm')}<span class="bonus-name">${t.name}</span></span>`;
    }).join('')}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function coverPanel() {
  // Keep About Us readable — use first paragraph mainly if both are long
  const aboutHtml = ABOUT_PARAS.map(function (p) { return `<p>${p}</p>`; }).join('');
  return `<section class="panel cover">
    <div class="cover-top">
      <img class="cover-logo" src="${LOGO_URI}" alt="Lucky Cat Mahjong logo">
      <h1 class="cover-title">Lucky Cat Mahjong</h1>
      <p class="cover-tag">Hong Kong Mahjong Guide</p>
      <div class="cover-rule"></div>
    </div>

    <div class="about card">
      <h2>About Us</h2>
      ${aboutHtml}
    </div>

    <div class="involved card">
      <h2>How to Get Involved</h2>
      <div class="involve-block">
        <h3>Support Our Cause</h3>
        <p>Our mission is to use mahjong as a powerful tool for building social connection and connecting with Asian culture by making it accessible to all. Our core values are <strong>RICE</strong>—Respect, Integrity, Community, and Empathy. Support us by telling your friends, teaching newcomers, buying merch, and bringing mahjong sets to our free community events.</p>
      </div>
      <div class="involve-block">
        <h3>Volunteer</h3>
        <p>Contact us to volunteer at our events! We always need people to help greet attendees, teach newcomers, bring mahjong sets, and carry out event logistics. Our volunteers get free entry to paid events, and our most dedicated and consistent volunteers will be recognized on our website and get the opportunity to attend exclusive events.</p>
      </div>
    </div>

    <div class="cover-bottom">
      <img class="qr" src="${QR_URI}" alt="QR code to ${WEBSITE}">
      <div class="cover-contact">
        <p class="scan">Scan for our online points calculator</p>
        <p class="url">${WEBSITE}</p>
        <p class="ig">Follow us on Instagram<br><strong>@${IG_HANDLE}</strong></p>
      </div>
    </div>
  </section>`;
}

function setupPanel() {
  return `<section class="panel setup-panel">
    <header class="p-head"><span class="p-kicker">Page 2</span><h2>Setting Up &amp; Basic Play</h2></header>

    <div class="p-body">
      <div class="block">
        <h3>The Objective</h3>
        <p>Be the first to complete <strong>four melds and one pair</strong> (14 tiles), drawing from the wall or claiming discards. The minimum hand value to win is 3 faan.</p>
      </div>

      <div class="block">
        ${tileSetHtml()}
      </div>

      <div class="block">
        <h3>1. Build the Walls</h3>
        <p>Shuffle all 144 tiles face down. Builds four walls of <strong>18 tiles long and 2 tiles high</strong> (36 tiles each). Then push the walls closer together into a square.</p>
      </div>

      <div class="block">
        <h3>2. Roll the Dice for the Break</h3>
        <p>The dealer (East) rolls three dice. Sums the total and go counter-clockwise that many times around the walls starting with East as 1 to determine which wall to break. Then count the same dice total from that wall going clockwise to make the break.</p>
        ${diceSeatsTableHtml()}
      </div>

      <div class="block">
        <h3>3. Deal the Tiles</h3>
        <p>Deal tiles in groups of four going counter-clockwise, while drawing clockwise until everyone has <strong>13 tiles</strong> and the dealer has <strong>14 tiles</strong>. Everyone draws replacement tiles from the end of the wall for revealing bonus tiles, starting with the dealer. The dealer starts by discarding a tile.</p>
      </div>

      <div class="block">
        <h3>4. The Flow of Play</h3>
        <p>Take turns playing counter-clockwise (East → South → West → North). Draw clockwise from the wall. Between turns you may claim a discarded tile instead of drawing to complete a meld by exposing it. End your turn by discarding a tile.</p>
      </div>
    </div>
  </section>`;
}

function conceptsPanel() {
  return `<section class="panel">
    <header class="p-head"><span class="p-kicker">Page 3</span><h2>Core Concepts</h2></header>

    <div class="p-body">
      <div class="block">
        <h3>What Is a Meld?</h3>
        <p>A <strong>meld</strong> is a legal set of tiles that counts toward your winning hand. In Hong Kong mahjong you typically need <strong>four melds plus one pair</strong>. Melds can stay hidden in your hand (concealed) or be laid face-up after you claim a discarded tile (exposed).</p>
      </div>

      <div class="block">
        <h3>The Melds</h3>
        <div class="concept-list">
          <div class="concept-row">
            <div class="concept-tiles">${meldRow([['c2', 'c3', 'c4']], 'tile-sm')}</div>
            <div class="concept-text">
              <div class="concept-name">Chi <span class="concept-role">Sequence</span></div>
              Three tiles in a consecutive run of one suit (e.g. 2-3-4 Characters). Only claimable from the player on your left.
            </div>
          </div>
          <div class="concept-row">
            <div class="concept-tiles">${meldRow([['d5', 'd5', 'd5']], 'tile-sm')}</div>
            <div class="concept-text">
              <div class="concept-name">Pung <span class="concept-role">Triplet</span></div>
              Three identical tiles. You may claim a matching discard from any player. Has priority over a chi.
            </div>
          </div>
          <div class="concept-row">
            <div class="concept-tiles">${meldRow([['b8', 'b8', 'b8', 'b8']], 'tile-sm')}</div>
            <div class="concept-text">
              <div class="concept-name">Kong <span class="concept-role">Quad</span></div>
              Four identical tiles. Claim a discard to make an exposed kong, or declare a concealed kong or add it to an exposed meld when you draw the fourth yourself. After either, draw a replacement tile from the end of the wall. Has priority over a pung.
            </div>
          </div>
          <div class="concept-row">
            <div class="concept-tiles">${meldRow([['dr', 'dr']], 'tile-sm')}</div>
            <div class="concept-text">
              <div class="concept-name">Pair <span class="concept-role">The Eyes</span></div>
              Two identical tiles that complete the hand. Every winning hand needs exactly one pair.
            </div>
          </div>
        </div>
      </div>

      <div class="block">
        <h3>Winning on the Last Tile</h3>
        <p>You can win by <strong>self-drawing</strong> the last tile you need from the wall, or by <strong>claiming</strong> that tile from anyone’s discard. A win has the highest priority over chi, pung, and kong. If more than one player needs the same discard to win, the next player in the turn order wins.</p>
      </div>

      <div class="block">
        <h3>Concealed vs. Exposed</h3>
        <p>A hand is <strong>concealed</strong> if you never claim a discard tile (except the winning tile). Concealed hands and self-draws earn bonus faan. Claiming discards <strong>exposes</strong> those melds face-up on the table for everyone to see.</p>
      </div>

      <div class="block">
        <h3>Flowers &amp; Seasons</h3>
        <p>Eight <strong>bonus tiles</strong>. They never form melds and are not part of your hand. Set them aside when drawn and take a replacement tile from the end of the wall.</p>
        ${bonusTilesHtml()}
      </div>
    </div>
  </section>`;
}

function scoringPanel() {
  return `<section class="panel score-panel">
    <header class="p-head"><span class="p-kicker">Page 4</span><h2>Scoring — Faan</h2></header>

    <div class="p-body">
      <p class="score-intro">Most tables have a <strong>3-faan</strong> minimum to win, with an upper limit of <strong>13 faan</strong>. Faan do not stack with their constituents. Use this guide as a learning aid, not a referee. House rules vary.</p>

      <div class="score-cols">
        <div class="score-col">
          ${faanTree('Bonus &amp; Situational', BONUS_TREE)}
        </div>
        <div class="score-col">
          ${faanTree('Flowers &amp; Seasons', FLOWER_TREE)}
          ${faanTree('Honors', HONORS_TREE)}
        </div>
      </div>

      <div class="examples">
        <h4>All Hand Patterns</h4>
        <div class="examples-grid">
          ${EXAMPLE_HANDS.map(exampleHand).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const CSS = `
  @font-face {
    font-family: "KN Yuanmo SC";
    src: url("${FONT_URI}") format("truetype");
    font-weight: 400; font-style: normal;
  }
  :root {
    --primary: #C41E3A;
    --secondary: #F4A020;
    --accent: #05693A;
    --bg: #FFFFFF;
    --surface: #FFFFFF;
    --tile: #FDF9F2;
    --text: #111111;
    --muted: #3A3A3A;
    --heading: "KN Yuanmo SC", sans-serif;
    --body: "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: var(--body); color: var(--text); -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  @page { size: 11in 8.5in; margin: 0; }

  .sheet {
    width: 11in; height: 8.5in;
    display: flex;
    background: var(--bg);
    overflow: hidden;
    page-break-after: always;
  }
  .sheet:last-child { page-break-after: auto; }

  .panel {
    width: 5.5in; height: 8.5in;
    padding: 0.34in 0.36in;
    display: flex; flex-direction: column;
    background: var(--bg);
    position: relative;
    overflow: hidden;
  }
  /* Faint fold guide */
  .panel:first-child {
    border-right: 1px dashed rgba(196, 30, 58, 0.12);
  }

  h1, h2, h3, h4 {
    font-family: var(--heading); color: var(--primary); line-height: 1.15;
  }

  /* ---------------- Cover ---------------- */
  .cover { text-align: center; justify-content: space-between; gap: 0.12in; }
  .cover-top { display: flex; flex-direction: column; align-items: center; }
  .cover-logo { width: 1.55in; height: auto; }
  .cover-title { font-size: 24pt; margin-top: 0.08in; color: var(--primary); letter-spacing: 0.5px; }
  .cover-tag { font-size: 11pt; color: var(--accent); font-family: var(--heading); margin-top: 0.1in; }
  .cover-rule { width: 1.2in; height: 3px; background: var(--secondary); border-radius: 2px; margin: 0.12in auto 0; }

  .card {
    text-align: left;
    background: #fff;
    border: 1px solid rgba(196, 30, 58, 0.14);
    border-radius: 10px;
    padding: 0.12in 0.14in 0.11in;
  }
  .card h2 { font-size: 10.5pt; margin: 0 0 0.08in; }
  .card p { font-size: 8pt; line-height: 1.35; color: var(--text); margin: 0 0 0.06in; }
  .card p:last-child { margin-bottom: 0; }
  .about { background: #FDF6F7; }
  .involved { background: #f3faf5; border-color: rgba(5, 105, 58, 0.18); }
  .involved h2 { color: var(--accent); }
  .involve-block { margin: 0 0 0.075in; }
  .involve-block:last-child { margin-bottom: 0; }
  .involve-block h3 {
    font-size: 8pt; color: var(--accent); margin: 0 0 0.03in; line-height: 1.2;
  }
  .involve-block p { margin: 0; font-size: 7.8pt; line-height: 1.33; }

  .cover-bottom {
    display: flex;
    align-items: center;
    gap: 0.14in;
    justify-content: center;
  }
  .qr {
    width: 0.78in;
    height: 0.78in;
    border-radius: 6px;
    border: 1px solid rgba(196, 30, 58, 0.14);
    object-fit: contain;
  }
  .cover-contact { text-align: left; }
  .scan { font-size: 7.5pt; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .url { font-size: 11pt; font-family: var(--heading); color: var(--primary); margin: 0.02in 0 0.05in; }
  .ig { font-size: 8.5pt; color: var(--text); line-height: 1.3; }
  .ig strong { color: var(--accent); font-size: 10pt; }

  /* ---------------- Interior page shell ---------------- */
  .p-head {
    border-bottom: 2px solid var(--primary);
    padding-bottom: 0.1in;
    margin-bottom: 0.16in;
  }
  .p-kicker {
    display: block;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--secondary);
    font-weight: 700;
    margin: 0 0 0.05in;
    line-height: 1.2;
  }
  .p-head h2 { font-size: 17pt; margin: 0; }
  .p-body { flex: 1; display: flex; flex-direction: column; }
  .block { margin: 0 0 0.15in; }
  .block:last-child { margin-bottom: 0; }
  .block h3 {
    font-size: 10.5pt;
    color: var(--accent);
    margin: 0 0 0.07in;
    line-height: 1.2;
  }
  .block p { font-size: 8.5pt; line-height: 1.38; color: var(--text); margin: 0; }
  strong { font-weight: 700; }

  /* Tiles — pre-rasterized white PNG faces. Keep modest on print pages. */
  .tile-face {
    display: inline-block;
    width: 0.32in;
    line-height: 0;
    margin: 0 0.4px;
    vertical-align: top;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.05in;
    overflow: hidden;
    background: var(--tile);
    flex-shrink: 0;
  }
  .tile-face img {
    display: block;
    width: 100%;
    height: auto;
  }
  .tile-sm { width: 0.26in; border-radius: 0.042in; }
  .tile-xs { width: 0.22in; border-radius: 0.036in; }
  .tile-ex { width: 0.21in; border-radius: 0.035in; }
  .meld-row { display: inline-flex; align-items: center; flex-wrap: nowrap; gap: 0.03in; }
  .meld { display: inline-flex; gap: 0; }

  /* Setup page */
  .setup-panel .block { margin-bottom: 0.1in; }
  .setup-panel .p-body { gap: 0; }
  .dice-seats-wrap {
    width: 100%;
    max-width: 3.05in;
    margin: 0.08in 0 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(5, 105, 58, 0.18);
    background: #fff;
  }
  .dice-seats {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 7.75pt;
    background: #fff;
  }
  .dice-seats th,
  .dice-seats td {
    border: 1px solid rgba(5, 105, 58, 0.18);
    padding: 0.03in 0.05in;
    line-height: 1.2;
    background: #fff;
  }
  .dice-seats tr:first-child th { border-top: none; }
  .dice-seats tr:last-child td { border-bottom: none; }
  .dice-seats tr th:first-child,
  .dice-seats tr td:first-child { border-left: none; }
  .dice-seats tr th:last-child,
  .dice-seats tr td:last-child { border-right: none; }
  .dice-seats th {
    font-family: var(--heading);
    font-size: 7.25pt;
    color: var(--accent);
    text-align: center;
    background: #f3faf5;
  }
  .dice-seats .dice-seat {
    color: var(--text);
    white-space: nowrap;
    width: 1.05in;
    text-align: left;
  }
  .dice-seats th.dice-seat { color: var(--accent); }
  .dice-seats .dice-n {
    width: 0.45in;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .tile-set { margin: 0; }
  .tile-set-head {
    font-family: var(--heading); font-size: 10.5pt; color: var(--accent);
    margin: 0 0 0.04in; line-height: 1.2;
  }
  .tile-set-row {
    display: flex; align-items: center; gap: 0.05in;
    margin-bottom: 0.025in;
  }
  .tile-set-lbl {
    flex: 0 0 1.05in; font-size: 7.5pt; font-family: var(--heading);
    color: var(--muted); line-height: 1.1;
  }
  .tile-set-tiles { display: inline-flex; flex-wrap: nowrap; gap: 0.03in; }
  .tile-set-tiles .tile-face { width: 0.26in; margin: 0; }

  /* Concepts */
  .concept-list { display: flex; flex-direction: column; gap: 0.09in; margin: 0.02in 0 0; }
  .concept-row {
    display: grid;
    grid-template-columns: 1.15in 1fr;
    align-items: center;
    column-gap: 0.08in;
  }
  .concept-tiles { display: flex; align-items: center; }
  .concept-text { font-size: 8.5pt; line-height: 1.34; color: var(--text); }
  .concept-name {
    font-family: var(--heading); font-size: 9.5pt; color: var(--primary);
    margin: 0 0 0.02in; line-height: 1.2;
  }
  .concept-role {
    font-size: 8pt; color: var(--accent); font-weight: 400;
    margin-left: 0.04in;
  }

  .bonus-tiles {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    width: 100%;
    margin: 0.08in 0 0;
  }
  .bonus-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 0.34in;
    padding-bottom: 0.24in;
  }
  .bonus-tile .tile-face { width: 0.34in; border-radius: 0.05in; }
  .bonus-name {
    position: absolute;
    top: calc(0.34in * 7 / 5 + 0.03in);
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: 0.62in;
    font-size: 6.5pt;
    line-height: 1.15;
    color: var(--muted);
    text-align: center;
  }

  /* Scoring — denser layout so example hands fit the panel */
  .score-panel { padding: 0.22in 0.28in; }
  .score-panel .p-head { margin-bottom: 0.07in; padding-bottom: 0.05in; }
  .score-panel .p-kicker { margin-bottom: 0.02in; }
  .score-panel .p-head h2 { font-size: 14.5pt; }
  .score-intro { font-size: 7.2pt; line-height: 1.28; margin: 0 0 0.05in; }
  .score-cols { display: flex; gap: 0.1in; }
  .score-col { flex: 1; min-width: 0; }
  .score-block { margin: 0 0 0.05in; }
  .score-block:last-child { margin-bottom: 0; }
  .score-block h4 {
    font-size: 8pt; color: var(--accent);
    margin: 0 0 0.03in;
    border-bottom: 1px solid var(--secondary);
    padding-bottom: 0.02in;
    line-height: 1.2;
  }
  table.faan { width: 100%; border-collapse: collapse; }
  table.faan td {
    font-size: 6.6pt; padding: 0.3px 1px; border-bottom: 1px solid rgba(0,0,0,0.05);
    line-height: 1.18; vertical-align: baseline;
  }
  table.faan .fn { color: var(--text); }
  table.faan .fn.depth-1 { padding-left: 0.07in; }
  table.faan .fname { white-space: nowrap; font-weight: 700; }
  table.faan .tree-branch { color: var(--muted); font-family: var(--heading); }
  table.faan .tree-note { font-size: 7pt; color: var(--muted); font-style: italic; white-space: normal; }
  table.faan .fv {
    text-align: right; font-family: var(--heading); color: var(--primary);
    white-space: nowrap; width: 0.42in; vertical-align: baseline;
  }

  .examples { margin: 0.055in 0 0; }
  .examples h4 {
    font-size: 8pt; color: var(--accent);
    margin: 0 0 0.035in;
    border-bottom: 1px solid var(--secondary);
    padding-bottom: 0.02in;
    line-height: 1.2;
  }
  .examples-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 0.1in;
    row-gap: 0.09in;
  }
  .example { margin: 0; min-width: 0; padding-bottom: 0.02in; }
  .example-head { margin: 0 0 0.02in; }
  .example-title {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 0.04in;
  }
  .example-name { font-size: 6.8pt; font-family: var(--heading); color: var(--text); font-weight: 700; }
  .example-faan { font-size: 6.8pt; font-family: var(--heading); color: var(--primary); flex-shrink: 0; }
  .example-note {
    font-size: 6.5pt; color: var(--muted); font-family: var(--body, sans-serif);
    font-weight: 400; font-style: italic; line-height: 1.2; margin-top: 0.01in;
  }
  .example-tiles.meld-row {
    display: flex;
    flex-wrap: wrap; /* 14 fit one row; Four Quads (18) wraps the rest */
    align-items: flex-start;
    column-gap: 0.8%;
    row-gap: 0.015in;
    width: 100%;
  }
  .example-tiles .tile-face.tile-ex {
    margin: 0;
    box-sizing: border-box;
    /* 14×6.4% + 13×0.8% gaps = 100% */
    flex: 0 0 6.4%;
    width: 6.4%;
    min-width: 0;
    border-radius: 0.028in;
  }
`;

/* ------------------------------------------------------------------ *
 * Document assembly + render
 * ------------------------------------------------------------------ */

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${CSS}</style>
</head>
<body>
  <div class="sheet" id="sheet-outside">
    ${scoringPanel()}
    ${coverPanel()}
  </div>
  <div class="sheet" id="sheet-inside">
    ${setupPanel()}
    ${conceptsPanel()}
  </div>
</body>
</html>`;
}

function collectTileIds() {
  const ids = [];
  EXAMPLE_HANDS.forEach(function (h) {
    h.groups.forEach(function (g) { g.forEach(function (id) { ids.push(id); }); });
  });
  TILE_SET_ROWS.forEach(function (row) {
    row.ids.forEach(function (id) { ids.push(id); });
  });
  // Concepts page examples
  ['c2', 'c3', 'c4', 'd5', 'b8', 'dr',
    'f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'].forEach(function (id) { ids.push(id); });
  return ids;
}

async function main() {
  process.stdout.write('Rasterizing tile faces… ');
  await prepareTiles(collectTileIds());
  console.log(Object.keys(tileCache).length + ' tiles');

  const html = buildHtml();

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    await page.pdf({
      path: OUTPUT,
      width: '11in',
      height: '8.5in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    if (process.env.PREVIEW) {
      await page.setViewport({ width: 1056, height: 816, deviceScaleFactor: 2 });
      const sheets = await page.$$('.sheet');
      for (let i = 0; i < sheets.length; i++) {
        const out = OUTPUT.replace(/\.pdf$/i, '') + `-preview-${i + 1}.png`;
        await sheets[i].screenshot({ path: out });
        console.log('Preview written: ' + out);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('Booklet PDF written: ' + OUTPUT);
  console.log('Print double-sided, flip on the LONG edge, then fold once down the middle.');
  console.log('  Sheet 1 (outside): Page 4 | Page 1   ·   Sheet 2 (inside): Page 2 | Page 3');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
