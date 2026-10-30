/* Chibi mahjong tile characters for the "Which Mahjong Tile Are You?" quiz, drawn as inline SVG. */

(function (root) {
  'use strict';

  var INK = '#3B2A20';
  var FACE = '#FFFBF0';
  var NAVY = '#1F2A6B';
  var RED = '#C41E3A';
  var GREEN = '#1F8A4C';
  var BLUSH = '#FF8FA3';
  var CJK_FONT = "'KN Yuanmo SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif";

  var ART = {
    'one-bamboo': { back: '#3FA34D', symbol: 'bird', eyes: 'sparkle', mouth: 'open', arms: 'wave', acc: ['bubble'] },
    'nine-bamboo': { back: '#2E7D5B', symbol: 'bamboo9', eyes: 'dot', mouth: 'smile', arms: 'rest', acc: ['squareGlasses', 'clipboard'] },
    'one-character': { back: '#E0B23A', symbol: 'char1', eyes: 'sparkle', mouth: 'smirk', arms: 'cheer', acc: ['crown'] },
    'nine-character': { back: '#E66A9A', symbol: 'char9', eyes: 'star', mouth: 'open', arms: 'rest', acc: ['shoppingBags'] },
    'one-dot': { back: '#E8964A', symbol: 'dot1', eyes: 'happy', mouth: 'cat', arms: 'rest', acc: ['boba'] },
    'nine-dot': { back: '#5C6BC0', symbol: 'dot9', eyes: 'spiral', mouth: 'wobble', arms: 'rest', acc: ['sweat', 'thoughtCloud'] },
    'green-dragon': { back: '#1F8A4C', symbol: 'greenDragon', eyes: 'money', mouth: 'open', arms: 'rest', acc: ['moneyBag', 'coins'] },
    'red-dragon': { back: '#C41E3A', symbol: 'redDragon', eyes: 'none', mouth: 'smirk', arms: 'cheer', acc: ['shades', 'sparkles'] },
    'white-dragon': { back: '#7FA7D9', symbol: 'whiteDragon', eyes: 'calm', mouth: 'smile', arms: 'rest', acc: ['clawClip', 'sparkles'] },
    'east-wind': { back: '#F4A020', symbol: 'east', eyes: 'sparkle', mouth: 'open', arms: 'cheer', acc: ['sunHalo'] },
    'south-wind': { back: '#D99A5B', symbol: 'south', eyes: 'happy', mouth: 'tongue', arms: 'cheer', acc: ['dogEars'] },
    'west-wind': { back: '#F27C6B', symbol: 'west', eyes: 'heart', mouth: 'smile', arms: 'rest', acc: ['hearts'] },
    'north-wind': { back: '#4A7FC1', symbol: 'north', eyes: 'half', mouth: 'flat', arms: 'rest', acc: ['headphones', 'snowflake'] },
    'spring': { back: '#F49AB5', symbol: 'spring', eyes: 'sparkle', mouth: 'open', arms: 'wave', acc: ['flowerCrown'] },
    'summer': { back: '#2BB3C0', symbol: 'summer', eyes: 'wink', mouth: 'tongue', arms: 'wave', acc: ['sunHat'] },
    'autumn': { back: '#C8642E', symbol: 'autumn', eyes: 'happy', mouth: 'cat', arms: 'rest', acc: ['scarf', 'coffee'] },
    'winter': { back: '#6C8EDB', symbol: 'winter', eyes: 'sleepy', mouth: 'o', arms: 'rest', acc: ['beanie', 'zzz'] },
    'plum-blossom': { back: '#D94A6B', symbol: 'plum', eyes: 'sparkle', mouth: 'smile', arms: 'cheer', acc: ['bandaid', 'sparkles'] },
    'orchid': { back: '#A578D6', symbol: 'orchid', eyes: 'lashes', mouth: 'smile', arms: 'rest', acc: ['bow'] },
    'chrysanthemum': { back: '#D9A521', symbol: 'chrysanthemum', eyes: 'happy', mouth: 'smile', arms: 'rest', acc: ['roundGlasses', 'teacup'] },
    'bamboo': { back: '#5FA83A', symbol: 'bambooFlower', eyes: 'panda', mouth: 'cat', arms: 'rest', acc: ['pandaEars', 'bambooStick'] },
    'blank-tile': { back: '#B9B2A6', symbol: 'blank', eyes: 'dot', mouth: 'flat', arms: 'rest', acc: ['sweat', 'question'] },
  };

  var BACK_ACCESSORIES = { sunHalo: true, pandaEars: true, dogEars: true, headphonesBand: true };

  function attrs(obj) {
    return Object.keys(obj).map(function (k) { return k + '="' + obj[k] + '"'; }).join(' ');
  }

  function stroke(width) {
    return 'stroke="' + INK + '" stroke-width="' + (width || 3) + '" stroke-linejoin="round" stroke-linecap="round"';
  }

  function cjk(ch, x, y, size, color) {
    return '<text ' + attrs({ x: x, y: y, 'font-size': size, fill: color, 'text-anchor': 'middle', 'font-weight': 700 }) +
      ' font-family="' + CJK_FONT + '">' + ch + '</text>';
  }

  function heart(cx, cy, s, color) {
    var p = 'M' + cx + ' ' + (cy + 6 * s) +
      ' C' + (cx - 10 * s) + ' ' + (cy - 1 * s) + ' ' + (cx - 7 * s) + ' ' + (cy - 9 * s) + ' ' + cx + ' ' + (cy - 4 * s) +
      ' C' + (cx + 7 * s) + ' ' + (cy - 9 * s) + ' ' + (cx + 10 * s) + ' ' + (cy - 1 * s) + ' ' + cx + ' ' + (cy + 6 * s) + 'Z';
    return '<path d="' + p + '" fill="' + color + '" ' + stroke(2) + '/>';
  }

  function sparkle(cx, cy, r, color) {
    var p = 'M' + cx + ' ' + (cy - r) + ' Q' + cx + ' ' + cy + ' ' + (cx + r) + ' ' + cy +
      ' Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy + r) + ' Q' + cx + ' ' + cy + ' ' + (cx - r) + ' ' + cy +
      ' Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy - r) + 'Z';
    return '<path d="' + p + '" fill="' + color + '"/>';
  }

  function rays(cx, cy, count, inner, outer, color, width, fromDeg, toDeg) {
    var out = '';
    var start = fromDeg === undefined ? 0 : fromDeg;
    var end = toDeg === undefined ? 360 : toDeg;
    var full = end - start >= 360;
    for (var i = 0; i < count; i++) {
      var deg = start + (end - start) * (full ? i / count : i / (count - 1));
      var a = deg * Math.PI / 180;
      out += '<line ' + attrs({
        x1: (cx + Math.cos(a) * inner).toFixed(1), y1: (cy + Math.sin(a) * inner).toFixed(1),
        x2: (cx + Math.cos(a) * outer).toFixed(1), y2: (cy + Math.sin(a) * outer).toFixed(1),
        stroke: color, 'stroke-width': width, 'stroke-linecap': 'round',
      }) + '/>';
    }
    return out;
  }

  function petals(cx, cy, count, offset, rx, ry, color, sw) {
    var out = '';
    for (var i = 0; i < count; i++) {
      out += '<ellipse ' + attrs({ cx: cx, cy: cy - offset, rx: rx, ry: ry, fill: color, transform: 'rotate(' + (i * 360 / count) + ' ' + cx + ' ' + cy + ')' }) +
        ' ' + stroke(sw || 2) + '/>';
    }
    return out;
  }

  function stick(cx, top, color) {
    return '<rect ' + attrs({ x: cx - 6, y: top, width: 12, height: 26, rx: 5, fill: color }) + ' ' + stroke(2.5) + '/>' +
      '<line ' + attrs({ x1: cx - 6, y1: top + 13, x2: cx + 6, y2: top + 13, stroke: INK, 'stroke-width': 2 }) + '/>';
  }

  function coin(cx, cy, r, color) {
    return '<circle ' + attrs({ cx: cx, cy: cy, r: r, fill: color }) + ' ' + stroke(2.5) + '/>' +
      '<circle ' + attrs({ cx: cx, cy: cy, r: (r * 0.55).toFixed(1), fill: FACE }) + ' ' + stroke(2) + '/>' +
      '<circle ' + attrs({ cx: cx, cy: cy, r: (r * 0.25).toFixed(1), fill: color }) + '/>';
  }

  function cornerLabel(ch, num) {
    return cjk(ch, 64, 60, 22, NAVY) + cjk(String(num), 138, 58, 18, RED);
  }

  function snowflake(cx, cy, r, color, width) {
    var out = rays(cx, cy, 6, 0, r, color, width);
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      var bx = cx + Math.cos(a) * r * 0.6;
      var by = cy + Math.sin(a) * r * 0.6;
      [-0.7, 0.7].forEach(function (d) {
        out += '<line ' + attrs({
          x1: bx.toFixed(1), y1: by.toFixed(1),
          x2: (bx + Math.cos(a + d) * r * 0.35).toFixed(1), y2: (by + Math.sin(a + d) * r * 0.35).toFixed(1),
          stroke: color, 'stroke-width': width * 0.8, 'stroke-linecap': 'round',
        }) + '/>';
      });
    }
    return out;
  }

  var SYMBOLS = {
    bird: function () {
      return '<path d="M80 92 Q56 72 58 50 Q72 68 86 84Z" fill="' + RED + '" ' + stroke(3) + '/>' +
        '<path d="M80 98 Q54 96 48 78 Q68 84 86 90Z" fill="' + GREEN + '" ' + stroke(3) + '/>' +
        '<path d="M98 110 L96 122 M110 110 L112 122" stroke="' + RED + '" stroke-width="3.5" stroke-linecap="round"/>' +
        '<ellipse cx="104" cy="92" rx="25" ry="20" fill="#3FA34D" ' + stroke(3) + '/>' +
        '<ellipse cx="110" cy="99" rx="13" ry="9" fill="#FFE08A"/>' +
        '<path d="M92 86 Q104 78 114 92 Q102 102 92 86Z" fill="' + GREEN + '" ' + stroke(2.5) + '/>' +
        '<path d="M117 54 Q113 44 120 40 Q121 47 124 52" fill="none" stroke="' + RED + '" stroke-width="3.5" stroke-linecap="round"/>' +
        '<circle cx="121" cy="66" r="14" fill="#3FA34D" ' + stroke(3) + '/>' +
        '<circle cx="125" cy="63" r="2.8" fill="' + INK + '"/>' +
        '<path d="M134 64 L144 68 L134 72Z" fill="#F4A020" ' + stroke(2) + '/>';
    },
    bamboo9: function () {
      var out = '';
      var colors = [GREEN, RED, GREEN];
      [72, 100, 128].forEach(function (x, col) {
        [42, 72, 102].forEach(function (top) { out += stick(x, top, colors[col]); });
      });
      return out;
    },
    char1: function () { return cjk('一', 100, 70, 44, NAVY) + cjk('萬', 100, 122, 50, RED); },
    char9: function () { return cjk('九', 100, 72, 40, NAVY) + cjk('萬', 100, 122, 50, RED); },
    dot1: function () {
      return '<circle cx="100" cy="84" r="40" fill="' + GREEN + '" ' + stroke(3) + '/>' +
        '<circle cx="100" cy="84" r="31" fill="' + FACE + '" ' + stroke(2) + '/>' +
        '<circle cx="100" cy="84" r="25" fill="' + RED + '"/>' +
        petals(100, 84, 8, 14, 4, 7, FACE, 0.01) +
        '<circle cx="100" cy="84" r="6" fill="#F4A020" ' + stroke(2) + '/>';
    },
    dot9: function () {
      var out = '';
      var colors = [NAVY, RED, GREEN];
      [56, 84, 112].forEach(function (y, row) {
        [72, 100, 128].forEach(function (x) { out += coin(x, y, 11, colors[row]); });
      });
      return out;
    },
    redDragon: function () { return cjk('中', 100, 112, 74, RED); },
    greenDragon: function () { return cjk('發', 100, 112, 70, GREEN); },
    whiteDragon: function () {
      return '<rect x="66" y="44" width="68" height="80" rx="8" fill="none" stroke="#1E39CD" stroke-width="6"/>' +
        '<rect x="75" y="53" width="50" height="62" rx="4" fill="none" stroke="#1E39CD" stroke-width="2.5"/>';
    },
    east: function () { return cjk('東', 100, 110, 70, NAVY); },
    south: function () { return cjk('南', 100, 110, 70, NAVY); },
    west: function () { return cjk('西', 100, 110, 70, NAVY); },
    north: function () { return cjk('北', 100, 110, 70, NAVY); },
    spring: function () {
      return cornerLabel('春', 1) + petals(100, 94, 5, 13, 10, 13, '#FFB7C9', 2.5) +
        '<circle cx="100" cy="94" r="6" fill="#F4A020" ' + stroke(2) + '/>';
    },
    summer: function () {
      return cornerLabel('夏', 2) + rays(100, 94, 10, 21, 31, '#F4A020', 4) +
        '<circle cx="100" cy="94" r="17" fill="#FFD23F" ' + stroke(2.5) + '/>';
    },
    autumn: function () {
      return cornerLabel('秋', 3) +
        '<path d="M100 108 L100 126" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M100 66 L108 82 L122 76 L116 92 L130 98 L114 104 L118 118 L100 110 L82 118 L86 104 L70 98 L84 92 L78 76 L92 82 Z" fill="#E8743B" ' + stroke(2.5) + '/>' +
        '<path d="M100 76 L100 110" stroke="#B5482A" stroke-width="2" stroke-linecap="round"/>';
    },
    winter: function () {
      return cornerLabel('冬', 4) + snowflake(100, 94, 26, '#5AA9E6', 4) +
        '<circle cx="100" cy="94" r="5" fill="#BFE3FF" ' + stroke(2) + '/>';
    },
    plum: function () {
      var out = cornerLabel('梅', 1) + '<path d="M66 124 Q86 108 100 94 M84 112 Q78 98 82 90" fill="none" stroke="#6B4226" stroke-width="4" stroke-linecap="round"/>';
      for (var i = 0; i < 5; i++) {
        var a = (i * 72 - 90) * Math.PI / 180;
        out += '<circle cx="' + (100 + Math.cos(a) * 11).toFixed(1) + '" cy="' + (90 + Math.sin(a) * 11).toFixed(1) + '" r="9" fill="#E8476A" ' + stroke(2) + '/>';
      }
      return out + '<circle cx="100" cy="90" r="5" fill="#FFE08A" ' + stroke(1.5) + '/>' +
        '<circle cx="80" cy="88" r="5" fill="#F7A1B5" ' + stroke(1.5) + '/>';
    },
    orchid: function () {
      return cornerLabel('蘭', 2) +
        '<path d="M100 124 Q98 112 100 104" fill="none" stroke="#3FA34D" stroke-width="3.5" stroke-linecap="round"/>' +
        '<path d="M100 124 Q78 112 70 92 M100 124 Q122 112 130 96" fill="none" stroke="#3FA34D" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="100" cy="76" rx="8" ry="18" fill="#C9A0EE" ' + stroke(2.5) + '/>' +
        '<ellipse cx="100" cy="76" rx="8" ry="18" transform="rotate(-62 100 94)" fill="#C9A0EE" ' + stroke(2.5) + '/>' +
        '<ellipse cx="100" cy="76" rx="8" ry="18" transform="rotate(62 100 94)" fill="#C9A0EE" ' + stroke(2.5) + '/>' +
        '<ellipse cx="100" cy="100" rx="10" ry="8" fill="#8E5CC4" ' + stroke(2.5) + '/>' +
        '<circle cx="100" cy="93" r="4" fill="#FFD23F" ' + stroke(1.5) + '/>';
    },
    chrysanthemum: function () {
      return cornerLabel('菊', 3) + petals(100, 94, 16, 15, 4, 13, '#FFC83D', 1.5) +
        petals(100, 94, 10, 8, 3.5, 8, '#FFAA1D', 1.2) +
        '<circle cx="100" cy="94" r="6" fill="#F08A24" ' + stroke(2) + '/>';
    },
    bambooFlower: function () {
      return cornerLabel('竹', 4) +
        '<rect x="86" y="68" width="10" height="58" rx="4" fill="#3FA34D" ' + stroke(2.5) + '/>' +
        '<rect x="104" y="78" width="10" height="48" rx="4" fill="#5FB84A" ' + stroke(2.5) + '/>' +
        '<path d="M86 90 L96 90 M86 110 L96 110 M104 98 L114 98 M104 114 L114 114" stroke="' + INK + '" stroke-width="2"/>' +
        '<ellipse cx="76" cy="80" rx="12" ry="5" transform="rotate(-30 76 80)" fill="#8BD16A" ' + stroke(2) + '/>' +
        '<ellipse cx="124" cy="86" rx="12" ry="5" transform="rotate(30 124 86)" fill="#8BD16A" ' + stroke(2) + '/>' +
        '<ellipse cx="122" cy="72" rx="10" ry="4.5" transform="rotate(-20 122 72)" fill="#8BD16A" ' + stroke(2) + '/>';
    },
    blank: function () {
      return '<rect x="60" y="42" width="80" height="84" rx="12" fill="none" stroke="#E2D7C2" stroke-width="2.5" stroke-dasharray="7 7"/>';
    },
  };

  var EYE_L = 80;
  var EYE_R = 120;
  var EYE_Y = 150;

  function eye(type, x) {
    var y = EYE_Y;
    switch (type) {
      case 'sparkle':
        return '<ellipse cx="' + x + '" cy="' + y + '" rx="7" ry="9" fill="' + INK + '"/>' +
          '<circle cx="' + (x + 2.5) + '" cy="' + (y - 3.5) + '" r="3" fill="#fff"/>' +
          '<circle cx="' + (x - 2.5) + '" cy="' + (y + 3.5) + '" r="1.5" fill="#fff"/>';
      case 'happy':
        return '<path d="M' + (x - 8) + ' ' + (y + 3) + ' Q' + x + ' ' + (y - 8) + ' ' + (x + 8) + ' ' + (y + 3) + '" fill="none" ' + stroke(4) + '/>';
      case 'calm':
      case 'sleepy':
        return '<path d="M' + (x - 8) + ' ' + y + ' Q' + x + ' ' + (y + 6) + ' ' + (x + 8) + ' ' + y + '" fill="none" ' + stroke(4) + '/>';
      case 'lashes':
        return '<path d="M' + (x - 8) + ' ' + y + ' Q' + x + ' ' + (y + 6) + ' ' + (x + 8) + ' ' + y + '" fill="none" ' + stroke(4) + '/>' +
          '<path d="M' + (x - 7) + ' ' + (y + 1) + ' l-4 4 M' + x + ' ' + (y + 3) + ' l0 5 M' + (x + 7) + ' ' + (y + 1) + ' l4 4" ' + stroke(2.5) + '/>';
      case 'dot':
        return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + INK + '"/>';
      case 'half':
        return '<path d="M' + (x - 8) + ' ' + (y - 1) + ' L' + (x + 8) + ' ' + (y - 1) + '" ' + stroke(3.5) + '/>' +
          '<path d="M' + (x - 6) + ' ' + (y - 1) + ' A6 6 0 0 0 ' + (x + 6) + ' ' + (y - 1) + 'Z" fill="' + INK + '"/>';
      case 'heart':
        return heart(x, y, 1, '#FF4D6D');
      case 'money':
        return '<text x="' + x + '" y="' + (y + 8) + '" font-size="24" font-weight="800" text-anchor="middle" fill="' + GREEN + '" stroke="' + INK + '" stroke-width="1" font-family="Arial,sans-serif">$</text>';
      case 'spiral':
        return '<path d="M' + x + ' ' + y + ' m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -6 0 a5.5 5.5 0 1 1 10 0 a7 7 0 1 1 -13 0" fill="none" ' + stroke(2.5) + '/>';
      case 'star':
        return '<path d="M' + x + ' ' + (y - 10) + ' L' + (x + 3) + ' ' + (y - 3) + ' L' + (x + 10) + ' ' + (y - 3) + ' L' + (x + 4.5) + ' ' + (y + 2) +
          ' L' + (x + 6.5) + ' ' + (y + 9) + ' L' + x + ' ' + (y + 5) + ' L' + (x - 6.5) + ' ' + (y + 9) + ' L' + (x - 4.5) + ' ' + (y + 2) +
          ' L' + (x - 10) + ' ' + (y - 3) + ' L' + (x - 3) + ' ' + (y - 3) + 'Z" fill="#FFD23F" ' + stroke(2) + '/>';
      case 'panda':
        return '<ellipse cx="' + x + '" cy="' + (y + 1) + '" rx="11" ry="12" transform="rotate(' + (x < 100 ? 20 : -20) + ' ' + x + ' ' + y + ')" fill="' + INK + '"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff"/>' +
          '<circle cx="' + (x + 1) + '" cy="' + (y + 0.5) + '" r="2.5" fill="' + INK + '"/>';
      default:
        return '';
    }
  }

  function eyes(type) {
    if (type === 'none') return '';
    if (type === 'wink') return eye('sparkle', EYE_L) + eye('happy', EYE_R);
    return eye(type, EYE_L) + eye(type, EYE_R);
  }

  function mouth(type) {
    switch (type) {
      case 'smile':
        return '<path d="M93 166 Q100 174 107 166" fill="none" ' + stroke(3.5) + '/>';
      case 'open':
        return '<path d="M91 164 Q100 180 109 164 Z" fill="#7A2430" ' + stroke(3) + '/>' +
          '<path d="M95 171 Q100 168 105 171 Q100 176 95 171Z" fill="#FF8FA3"/>';
      case 'cat':
        return '<path d="M89 165 Q94.5 172 100 165 Q105.5 172 111 165" fill="none" ' + stroke(3.5) + '/>';
      case 'flat':
        return '<path d="M94 168 L106 168" ' + stroke(3.5) + '/>';
      case 'o':
        return '<ellipse cx="100" cy="168" rx="3.5" ry="4.5" fill="#7A2430" ' + stroke(2.5) + '/>';
      case 'smirk':
        return '<path d="M92 168 Q102 172 109 162" fill="none" ' + stroke(3.5) + '/>';
      case 'tongue':
        return '<path d="M91 164 Q100 176 109 164 Z" fill="#7A2430" ' + stroke(3) + '/>' +
          '<path d="M98 170 Q98 181 104 180 Q109 179 107 169Z" fill="#FF7A93" ' + stroke(2.5) + '/>';
      case 'wobble':
        return '<path d="M88 168 q3 -4 6 0 t6 0 t6 0 t6 0" fill="none" ' + stroke(3) + '/>';
      default:
        return '';
    }
  }

  function arm(cx, cy, rot, fill) {
    return '<ellipse ' + attrs({ cx: cx, cy: cy, rx: 10, ry: 16, fill: fill, transform: 'rotate(' + rot + ' ' + cx + ' ' + cy + ')' }) + ' ' + stroke(3.5) + '/>';
  }

  function arms(pose) {
    var left = pose === 'cheer' ? arm(34, 116, -35, FACE) : arm(40, 164, 25, FACE);
    var right = pose === 'cheer' || pose === 'wave' ? arm(166, 116, 35, FACE) : arm(160, 164, -25, FACE);
    return left + right;
  }

  var ACCESSORIES = {
    bubble: function () {
      return '<path d="M140 4 H186 Q196 4 196 14 V22 Q196 32 186 32 H156 L146 42 L148 32 H140 Q130 32 130 22 V14 Q130 4 140 4Z" fill="#fff" ' + stroke(2.5) + '/>' +
        '<text x="163" y="24" font-size="14" font-weight="800" text-anchor="middle" fill="' + RED + '" font-family="Arial,sans-serif">omg</text>';
    },
    squareGlasses: function () {
      return '<rect x="66" y="139" width="28" height="22" rx="6" fill="rgba(255,255,255,0.25)" ' + stroke(3) + '/>' +
        '<rect x="106" y="139" width="28" height="22" rx="6" fill="rgba(255,255,255,0.25)" ' + stroke(3) + '/>' +
        '<path d="M94 148 Q100 144 106 148" fill="none" ' + stroke(3) + '/>';
    },
    clipboard: function () {
      return '<rect x="160" y="148" width="30" height="38" rx="4" fill="#D9A066" ' + stroke(2.5) + '/>' +
        '<rect x="164" y="154" width="22" height="28" rx="2" fill="#fff" ' + stroke(1.5) + '/>' +
        '<rect x="169" y="144" width="12" height="7" rx="2" fill="#9AA0A6" ' + stroke(2) + '/>' +
        '<path d="M167 161 l2 2 l4 -4 M167 170 l2 2 l4 -4 M176 161 h7 M176 170 h7 M167 178 h16" fill="none" stroke="' + GREEN + '" stroke-width="1.8" stroke-linecap="round"/>';
    },
    crown: function () {
      return '<path d="M68 34 L72 8 L87 22 L100 2 L113 22 L128 8 L132 34 Z" fill="#FFD23F" ' + stroke(3) + '/>' +
        '<circle cx="100" cy="24" r="4" fill="' + RED + '" ' + stroke(1.5) + '/>' +
        '<circle cx="80" cy="27" r="3" fill="#5AA9E6" ' + stroke(1.5) + '/>' +
        '<circle cx="120" cy="27" r="3" fill="#3FA34D" ' + stroke(1.5) + '/>';
    },
    shoppingBags: function () {
      return '<path d="M168 156 Q168 144 175 144 Q182 144 182 156" fill="none" ' + stroke(2.5) + '/>' +
        '<rect x="162" y="154" width="26" height="30" rx="3" fill="#FF8FB1" ' + stroke(2.5) + '/>' +
        '<path d="M150 170 Q150 162 155 162 Q160 162 160 170" fill="none" ' + stroke(2.5) + '/>' +
        '<rect x="145" y="168" width="20" height="22" rx="3" fill="#FFD23F" ' + stroke(2.5) + '/>' +
        sparkle(175, 168, 5, '#fff');
    },
    boba: function () {
      return '<rect x="174" y="132" width="5" height="26" rx="2" fill="' + RED + '" ' + stroke(1.5) + ' transform="rotate(12 176 145)"/>' +
        '<path d="M158 150 L188 150 L183 190 L163 190 Z" fill="#E9C9A0" ' + stroke(2.5) + '/>' +
        '<path d="M156 150 H190" ' + stroke(3) + '/>' +
        '<circle cx="168" cy="183" r="2.6" fill="' + INK + '"/><circle cx="175" cy="185" r="2.6" fill="' + INK + '"/>' +
        '<circle cx="181" cy="182" r="2.6" fill="' + INK + '"/><circle cx="172" cy="178" r="2.6" fill="' + INK + '"/>';
    },
    sweat: function () {
      return '<path d="M150 112 Q144 124 150 128 Q156 124 150 112Z" fill="#8FD3FF" ' + stroke(2) + '/>';
    },
    thoughtCloud: function () {
      return '<circle cx="146" cy="30" r="4" fill="#fff" ' + stroke(2) + '/>' +
        '<path d="M156 22 Q150 8 164 6 Q172 -4 184 6 Q198 8 192 22 Q196 34 182 34 Q172 40 164 32 Q150 34 156 22Z" fill="#fff" ' + stroke(2.5) + '/>' +
        '<path d="M164 20 q4 -8 8 0 t8 0 q-6 6 -10 0 q-4 -4 -2 4" fill="none" stroke="' + RED + '" stroke-width="2" stroke-linecap="round"/>';
    },
    moneyBag: function () {
      return '<path d="M166 150 L172 142 L178 150" fill="#C9A35A" ' + stroke(2.5) + '/>' +
        '<path d="M166 150 Q150 166 158 184 Q172 192 186 184 Q194 166 178 150Z" fill="#E3C27A" ' + stroke(2.5) + '/>' +
        '<text x="172" y="181" font-size="18" font-weight="800" text-anchor="middle" fill="' + GREEN + '" font-family="Arial,sans-serif">$</text>';
    },
    coins: function () {
      return coin(24, 196, 9, '#FFD23F') + coin(30, 184, 9, '#FFD23F') + sparkle(160, 20, 8, '#FFD23F') + sparkle(176, 40, 5, '#FFD23F');
    },
    shades: function () {
      return '<path d="M62 142 H96 Q96 162 82 162 Q64 162 62 142Z" fill="' + INK + '"/>' +
        '<path d="M104 142 H138 Q136 162 118 162 Q104 162 104 142Z" fill="' + INK + '"/>' +
        '<path d="M58 142 H142" ' + stroke(4) + '/>' +
        '<path d="M70 147 l8 0 M112 147 l8 0" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>';
    },
    sparkles: function () {
      return sparkle(170, 22, 10, '#FFD23F') + sparkle(186, 46, 6, '#FFD23F') + sparkle(24, 40, 7, '#FFD23F');
    },
    clawClip: function () {
      return '<rect x="80" y="10" width="40" height="18" rx="8" fill="#C08552" ' + stroke(3) + '/>' +
        '<path d="M86 28 v8 M94 28 v8 M102 28 v8 M110 28 v8 M116 28 v6" ' + stroke(3) + '/>' +
        '<circle cx="92" cy="17" r="2.5" fill="#7A4E2A"/><circle cx="106" cy="20" r="2" fill="#7A4E2A"/>';
    },
    sunHalo: function () {
      return rays(100, 70, 9, 58, 76, '#FFD23F', 7, 200, 340);
    },
    dogEars: function () {
      return '<path d="M52 28 Q20 30 24 80 Q30 90 40 82 Q50 60 62 36 Z" fill="#B97A3E" ' + stroke(3) + '/>' +
        '<path d="M148 28 Q180 30 176 80 Q170 90 160 82 Q150 60 138 36 Z" fill="#B97A3E" ' + stroke(3) + '/>';
    },
    hearts: function () {
      return heart(168, 22, 1.3, '#FF6B8B') + heart(186, 46, 0.8, '#FF9BB0') + heart(28, 34, 0.9, '#FF6B8B');
    },
    headphones: function () {
      return '<path d="M42 104 Q38 6 100 6 Q162 6 158 104" fill="none" stroke="' + INK + '" stroke-width="9" stroke-linecap="round"/>' +
        '<path d="M42 104 Q38 6 100 6 Q162 6 158 104" fill="none" stroke="#5AA9E6" stroke-width="4" stroke-linecap="round"/>' +
        '<rect x="28" y="88" width="20" height="36" rx="9" fill="#5AA9E6" ' + stroke(3) + '/>' +
        '<rect x="152" y="88" width="20" height="36" rx="9" fill="#5AA9E6" ' + stroke(3) + '/>';
    },
    snowflake: function () {
      return snowflake(180, 24, 12, '#5AA9E6', 3) + snowflake(22, 52, 7, '#9CCBF2', 2.5);
    },
    flowerCrown: function () {
      var out = '<path d="M50 30 Q100 16 150 30" fill="none" stroke="#3FA34D" stroke-width="4" stroke-linecap="round"/>';
      var colors = ['#FFB7C9', '#FFD23F', '#fff', '#FF8FB1', '#FFB7C9', '#FFD23F'];
      for (var i = 0; i < 6; i++) {
        var x = 56 + i * 17.6;
        var y = 28 - Math.sin((i + 0.5) / 6 * Math.PI) * 9;
        out += petals(x, y, 5, 5, 4.5, 5.5, colors[i], 1.5) + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.5" fill="#F4A020"/>';
      }
      return out;
    },
    sunHat: function () {
      return '<ellipse cx="100" cy="28" rx="76" ry="12" fill="#F5D58A" ' + stroke(3) + '/>' +
        '<path d="M66 28 Q66 2 100 2 Q134 2 134 28 Z" fill="#F5D58A" ' + stroke(3) + '/>' +
        '<path d="M67 20 Q100 14 133 20 L134 27 Q100 21 66 27Z" fill="#FF6B8B"/>';
    },
    scarf: function () {
      return '<path d="M40 176 Q100 188 160 176 L160 194 Q100 204 40 194Z" fill="#D9573B" ' + stroke(3) + '/>' +
        '<path d="M60 190 L56 222 L72 222 L74 194Z" fill="#D9573B" ' + stroke(3) + '/>' +
        '<path d="M58 210 L72 210 M57 216 L72 216" stroke="#F2A35E" stroke-width="2.5"/>' +
        '<path d="M48 182 Q100 194 152 182" fill="none" stroke="#F2A35E" stroke-width="2.5" stroke-dasharray="5 6"/>';
    },
    coffee: function () {
      return '<path d="M166 136 q-4 -6 0 -12 M176 136 q-4 -6 0 -12" fill="none" stroke="#B8A99A" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M158 142 L190 142 L186 182 L162 182 Z" fill="#fff" ' + stroke(2.5) + '/>' +
        '<rect x="160" y="154" width="28" height="14" fill="#C8642E" ' + stroke(2) + '/>' +
        '<rect x="155" y="138" width="38" height="7" rx="3" fill="#8B5A3C" ' + stroke(2.5) + '/>';
    },
    beanie: function () {
      return '<path d="M50 34 Q50 4 100 4 Q150 4 150 34 Z" fill="#8FA9E8" ' + stroke(3) + '/>' +
        '<path d="M70 10 V30 M85 6 V30 M100 5 V30 M115 6 V30 M130 10 V30" stroke="#6C8EDB" stroke-width="2.5"/>' +
        '<rect x="44" y="26" width="112" height="16" rx="8" fill="#4A6CC0" ' + stroke(3) + '/>' +
        '<circle cx="100" cy="9" r="8" fill="#fff" ' + stroke(2.5) + '/>';
    },
    zzz: function () {
      var font = 'font-family="Arial,sans-serif" font-weight="800" fill="#6C8EDB"';
      return '<text x="164" y="64" font-size="14" ' + font + '>z</text>' +
        '<text x="174" y="48" font-size="19" ' + font + '>z</text>' +
        '<text x="182" y="28" font-size="24" ' + font + '>Z</text>';
    },
    bandaid: function () {
      return '<g transform="rotate(-20 64 168)"><rect x="52" y="163" width="24" height="10" rx="5" fill="#F2C9A0" ' + stroke(1.8) + '/>' +
        '<rect x="60" y="163" width="8" height="10" fill="#E8B486"/></g>';
    },
    bow: function () {
      return '<path d="M134 26 Q112 4 110 22 Q110 40 134 26Z" fill="#C792EA" ' + stroke(2.5) + '/>' +
        '<path d="M134 26 Q156 4 158 22 Q158 40 134 26Z" fill="#C792EA" ' + stroke(2.5) + '/>' +
        '<circle cx="134" cy="26" r="6" fill="#A578D6" ' + stroke(2.5) + '/>' +
        sparkle(172, 54, 6, '#C792EA');
    },
    roundGlasses: function () {
      return '<circle cx="80" cy="150" r="13" fill="rgba(255,255,255,0.2)" stroke="#B07D3A" stroke-width="3"/>' +
        '<circle cx="120" cy="150" r="13" fill="rgba(255,255,255,0.2)" stroke="#B07D3A" stroke-width="3"/>' +
        '<path d="M93 148 Q100 144 107 148" fill="none" stroke="#B07D3A" stroke-width="3"/>';
    },
    teacup: function () {
      return '<path d="M168 144 q-4 -6 0 -12 M178 144 q-4 -6 0 -12" fill="none" stroke="#B8A99A" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M188 158 Q198 158 196 166 Q194 172 186 170" fill="none" ' + stroke(2.5) + '/>' +
        '<path d="M156 150 H190 Q190 176 173 176 Q156 176 156 150Z" fill="#fff" ' + stroke(2.5) + '/>' +
        '<path d="M160 158 H186" stroke="#5AA9E6" stroke-width="2.5"/>' +
        '<ellipse cx="173" cy="178" rx="22" ry="5" fill="#fff" ' + stroke(2.5) + '/>';
    },
    pandaEars: function () {
      return '<circle cx="54" cy="30" r="17" fill="' + INK + '"/><circle cx="146" cy="30" r="17" fill="' + INK + '"/>';
    },
    bambooStick: function () {
      return '<rect x="164" y="112" width="11" height="82" rx="5" fill="#3FA34D" ' + stroke(2.5) + '/>' +
        '<path d="M164 138 h11 M164 166 h11" stroke="' + INK + '" stroke-width="2"/>' +
        '<ellipse cx="186" cy="124" rx="12" ry="5" transform="rotate(-30 186 124)" fill="#8BD16A" ' + stroke(2) + '/>';
    },
    question: function () {
      return '<text x="168" y="40" font-size="40" font-weight="800" fill="#9AA0A6" stroke="' + INK + '" stroke-width="1.5" font-family="Arial,sans-serif">?</text>' +
        '<text x="22" y="52" font-size="22" font-weight="800" fill="#C9C3B8" font-family="Arial,sans-serif">?</text>';
    },
  };

  function renderAccessories(list, back) {
    return list.filter(function (name) { return !!BACK_ACCESSORIES[name] === back; })
      .map(function (name) { return ACCESSORIES[name] ? ACCESSORIES[name]() : ''; })
      .join('');
  }

  function render(id, options) {
    var spec = ART[id];
    if (!spec) return '';
    var opts = options || {};
    var label = opts.label ? '<title>' + opts.label + '</title>' : '';
    var a11y = opts.label ? 'role="img" aria-label="' + opts.label + '"' : 'aria-hidden="true" focusable="false"';
    var size = opts.width ? ' width="' + opts.width + '" height="' + Math.round(opts.width * 1.25) + '"' : '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250"' + size + ' class="' + (opts.className || 'tile-art') + '" ' + a11y + '>' + label +
      '<ellipse cx="100" cy="236" rx="60" ry="8" fill="rgba(59,42,32,0.14)"/>' +
      renderAccessories(spec.acc, true) +
      arms(spec.arms) +
      '<ellipse cx="76" cy="220" rx="15" ry="10" fill="' + spec.back + '" ' + stroke(3.5) + '/>' +
      '<ellipse cx="124" cy="220" rx="15" ry="10" fill="' + spec.back + '" ' + stroke(3.5) + '/>' +
      '<rect x="40" y="34" width="120" height="180" rx="26" fill="' + spec.back + '" ' + stroke(4) + '/>' +
      '<rect x="40" y="24" width="120" height="176" rx="26" fill="' + FACE + '" ' + stroke(4) + '/>' +
      '<rect x="54" y="33" width="26" height="6" rx="3" fill="#fff"/>' +
      SYMBOLS[spec.symbol]() +
      '<ellipse cx="66" cy="164" rx="9" ry="5" fill="' + BLUSH + '" opacity="0.6"/>' +
      '<ellipse cx="134" cy="164" rx="9" ry="5" fill="' + BLUSH + '" opacity="0.6"/>' +
      eyes(spec.eyes) +
      mouth(spec.mouth) +
      renderAccessories(spec.acc, false) +
      '</svg>';
  }

  var api = { render: render, ids: Object.keys(ART), colorFor: function (id) { return ART[id] ? ART[id].back : RED; } };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LuckyCatTileArt = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
