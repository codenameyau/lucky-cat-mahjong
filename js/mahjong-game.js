/* Play page: the Hong Kong mahjong table, drawn on a single <canvas>.
   Rendering is on demand (only while something animates or changes);
   tile faces are pre-rendered once per size into sprite canvases.
   Game rules live in mahjong-engine.js, bots and hints in mahjong-bot.js and its strategies,
   the bot strategies each seat and the coach can use in
   mahjong-strategies.js, scoring in points.js. */

(function (root) {
  'use strict';

  var E = root.MahjongEngine;
  var Coach = root.MahjongCoach;
  var Strategies = root.MahjongStrategies;
  var Lesson = root.MahjongLesson;

  var SETTINGS_KEY = 'lcm-play-settings';
  var PREFS_KEY = 'lcm-play-prefs';
  // { seats: { 1: id, 2: id, 3: id }, coach: id }. A bot seat with nothing
  // saved gets a random strategy each game.
  var STRATEGIES_KEY = 'lcm-play-strategies';
  // The one saved game on this device, signed (HMAC-SHA256). Each turn writes
  // it; Resume game reads it. Quit leaves it.
  var AUTOSAVE_KEY = 'lcm-play-autosave';
  var SEAT_SIDES = ['', 'your right', 'across', 'your left'];
  var TILE_ASPECT = 1.4;
  var TILE_GAP = 4;
  // On an upright phone: between your hand's tiles, and between the computers'
  // tiles and your own exposed tiles.
  var PHONE_HAND_GAP = 5, PHONE_TILE_GAP = 2;
  var MELD_GAP = 0.12; // extra space between exposed melds, in tile widths, on top of the tile gap
  var FLOWER_GAP = 0.05; // the same, between a player's flowers and their melds
  var OPP_ROW_GAP = 4; // on desktop, between a computer's exposed tiles and their hand
  var ACTIONS_LIFT = 6; // the Discard, Pung, Pass and other action buttons sit this far above their row's center

  var COLORS = {
    felt: '#0b5a39',
    feltLight: '#127048',
    feltDark: '#074029',
    red: '#C41E3A',
    redDark: '#8f1229',
    redLight: '#EE6A80', // the brand red, lightened to read on the dark coach bar
    gold: '#F4A020',
    goldLight: '#ffd27a',
    green: '#05693A',
    cream: '#FFF8F0',
    ink: '#1A1A1A',
    muted: '#5C5C5C',
    white: '#ffffff',
  };
  var FONT_BODY = '"Avenir Medium", "Avenir Next Medium", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  // The site's heading font (css/fonts.css), for headings, winds and banners.
  var FONT_HEAD = '"KN Yuanmo SC", ' + FONT_BODY;
  var WIND_LETTERS = ['', 'E', 'S', 'W', 'N'];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeBack(t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n)); }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function removeJson(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // Strategies saved under an older id.
  var RENAMED_STRATEGIES = { 'claude-cat': 'lucky-cat' };
  // Before 0.6.0 the lucky-cat and jorge-yau ids were the other way round.
  // Saved choices from then have no `v`; saves from then are older than
  // SWAPPED_BEFORE.
  var SWAPPED_STRATEGIES = { 'lucky-cat': 'jorge-yau', 'jorge-yau': 'lucky-cat' };
  var SWAPPED_BEFORE = [0, 6, 0];

  function swapOldIds(list) {
    return list.map(function (id) { return SWAPPED_STRATEGIES[id] || id; });
  }

  function savedBeforeSwap(version) {
    var v = String(version || '').split('.').map(Number);
    for (var k = 0; k < 3; k++) {
      if ((v[k] || 0) !== SWAPPED_BEFORE[k]) return (v[k] || 0) < SWAPPED_BEFORE[k];
    }
    return false;
  }

  // Saved strategy choices, keeping only ids that still exist.
  function readStrategies() {
    var saved = readJson(STRATEGIES_KEY, {}) || {};
    var old = saved.v !== 2;
    function current(id) {
      if (old && SWAPPED_STRATEGIES[id]) id = SWAPPED_STRATEGIES[id];
      id = RENAMED_STRATEGIES[id] || id;
      return Strategies.has(id) ? id : null;
    }
    var seats = {};
    [1, 2, 3].forEach(function (k) {
      var id = current(saved.seats && saved.seats[k]);
      if (id) seats[k] = id;
    });
    return { v: 2, seats: seats, coach: current(saved.coach) };
  }

  // This game's strategy for each bot seat (saved, or random) and the coach's.
  function pickStrategies() {
    var saved = readStrategies();
    var seats = [null];
    for (var k = 1; k <= 3; k++) seats.push(saved.seats[k] || Strategies.randomId());
    return { seats: seats, coach: saved.coach || Strategies.DEFAULT_COACH };
  }

  function track(name, params) {
    if (typeof root.gtag === 'function') root.gtag('event', name, params || {});
  }

  // The event for a click on each of the table's buttons, by button id. Coach,
  // Rules and Strategies have their own, and discards and claims aren't tracked.
  var BUTTON_EVENTS = {
    menu: 'play_menu_open',
    fullscreen: 'play_fullscreen_click',
    'show-hands': 'play_show_hands_click',
    next: 'play_next_hand_click',
    'see-results': 'play_see_results_click',
    'm-resume': 'play_menu_resume_click',
    'm-restart': 'play_menu_restart_click',
    'm-quit': 'play_menu_quit_click',
    'go-again': 'play_again_click',
    'go-quit': 'play_end_quit_click',
  };

  /* ------------------------------------------------------------------ *
   * 1. Assets and tile sprites
   * ------------------------------------------------------------------ */

  var images = {};
  var assetsReady = null;

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function loadAssets() {
    if (assetsReady) return assetsReady;
    var ids = E.TILE_IDS.concat(E.BONUS_IDS);
    var jobs = ids.map(function (id) {
      return loadImage('/tiles/' + E.HKScoring.TILE_BY_ID[id].file).then(function (img) { images[id] = img; });
    });
    jobs.push(loadImage('/logo.png').then(function (img) { images.logo = img; }));
    if (document.fonts && document.fonts.load) {
      jobs.push(Promise.race([
        document.fonts.load('16px "KN Yuanmo SC"').catch(function () {}),
        new Promise(function (resolve) { setTimeout(resolve, 1500); }),
      ]));
    }
    assetsReady = Promise.all(jobs);
    return assetsReady;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var spriteCache = {};

  // A tile sprite includes its green "depth" edge below the face, so the
  // drawn height is w * TILE_ASPECT + depth.
  function tileSprite(id, w, dpr, back) {
    var key = (back ? 'back' : id) + '|' + w.toFixed(1) + '|' + dpr;
    var hit = spriteCache[key];
    if (hit) return hit;
    var h = w * TILE_ASPECT;
    var depth = Math.max(1.5, w * 0.08);
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil((h + depth) * dpr);
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    var r = Math.max(2, w * 0.13);

    roundRect(c, 0, depth, w, h, r);
    c.fillStyle = back ? COLORS.redDark : COLORS.green;
    c.fill();

    if (back) {
      roundRect(c, 0, 0, w, h, r);
      var g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#d8344f');
      g.addColorStop(1, COLORS.red);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255, 210, 122, 0.75)';
      c.lineWidth = Math.max(0.8, w * 0.04);
      roundRect(c, w * 0.12, w * 0.12, w * 0.76, h - w * 0.24, r * 0.6);
      c.stroke();
      // Phones draw small tile backs, but on a sharp screen there are
      // still plenty of pixels for the logo.
      if (images.logo && w * dpr >= 18) {
        var lw = w * 0.62;
        var lh = lw * (images.logo.height / images.logo.width || 1);
        c.globalAlpha = 0.95;
        c.drawImage(images.logo, (w - lw) / 2, (h - lh) / 2, lw, lh);
        c.globalAlpha = 1;
      }
    } else {
      roundRect(c, 0, 0, w, h, r);
      var gf = c.createLinearGradient(0, 0, w * 0.6, h);
      gf.addColorStop(0, '#ffffff');
      gf.addColorStop(1, '#fbf1e2');
      c.fillStyle = gf;
      c.fill();
      c.strokeStyle = 'rgba(0, 0, 0, 0.14)';
      c.lineWidth = 1;
      c.stroke();
      var img = images[id];
      if (img) {
        var ix = w * 0.08, iy = h * 0.08, iw = w * 0.84, ih = h * 0.86;
        var ar = 300 / 420;
        var dw = Math.min(iw, ih * ar), dh = dw / ar;
        c.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) * 0.55, dw, dh);
      } else {
        c.fillStyle = COLORS.ink;
        c.font = 'bold ' + Math.round(w * 0.4) + 'px ' + FONT_BODY;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(id, w / 2, h / 2);
      }
    }
    // A tile drawn before its picture (or the logo) has loaded is not
    // kept, so it's redrawn properly once the image arrives.
    if (back ? images.logo : images[id]) spriteCache[key] = cv;
    return cv;
  }

  /* ------------------------------------------------------------------ *
   * 2. Sound
   *    Short recorded clips from Kenney's Casino Audio, Impact Sounds and
   *    Interface Sounds packs (CC0, kenney.nl), trimmed to mono WAV in
   *    /assets/sounds/. Nearly every sound is something physical on the
   *    table: tiles are poker chips (laid down for a discard, stacked for a
   *    claim), the big moments are mining-pick hits, and the rest are
   *    knocks on wood. Flowers keep a soft glass chime.
   * ------------------------------------------------------------------ */

  var SOUND_DIR = '/assets/sounds/';
  // Each cue plays one of its clips (picked at random, so repeats differ),
  // at `gain`, and any `then` clips [name, delay in seconds, gain, pitch]
  // after it. `vary` nudges the pitch a little each time.
  var CUES = {
    draw: { clips: ['tile-draw'], gain: 0.3, vary: true },
    // One sound for every discard: the duller chip, the closest to a
    // mahjong tile landing on the table.
    discard: { clips: ['tile-discard'], gain: 0.85 },
    // Picking up a tile: chips handled. A flower: a soft glass chime
    // (glass_001 from Kenney's Interface Sounds), the one bell on the table.
    select: { clips: ['tile-select'], gain: 0.2 },
    flower: { clips: ['flower'], gain: 0.4 },
    // Claims are big moments, and each has its own heavy hit (a different
    // impactMining clip from Kenney's Impact Sounds pack) under the chips:
    // chow: impactMining_001, the brightest, then the run's chips settle;
    chow: {
      clips: ['impact-chow'], gain: 0.9,
      then: [['tile-claim-1', 0.03, 0.7]],
    },
    // pung: impactMining_000, a fuller hit with the three tiles on top;
    pung: {
      clips: ['impact-pung'], gain: 0.95,
      then: [['tile-claim-2', 0.02, 0.75], ['tile-discard', 0.04, 0.6, 0.9]],
    },
    // kong: impactMining_002, struck twice (the second lower) while four
    // tiles stack.
    kong: {
      clips: ['impact-kong'], gain: 1,
      then: [['impact-kong', 0.12, 0.7, 0.8], ['tile-claim-2', 0.03, 0.7], ['tile-kong', 0.16, 0.6], ['tile-discard', 0.28, 0.6, 0.85]],
    },
    // Your turn: a light knock on the table.
    turn: { clips: ['turn'], gain: 0.3 },
    // A win, whoever takes it, including a self-draw: impactMining_000 (the
    // pung's hit), louder and struck again lower, then the pot's chips.
    // Bigger than a pung, same kind of hit.
    win: {
      clips: ['impact-pung'], gain: 1,
      then: [['impact-pung', 0.18, 0.8, 0.78], ['tile-claim-2', 0.08, 0.7], ['tile-kong', 0.2, 0.6]],
    },
    // Someone else's win: a medium wooden hit and their chips.
    otherwin: { clips: ['other-win'], gain: 0.55, then: [['tile-claim-1', 0.04, 0.45]] },
    // You paid for the win: poker chips, a few pushed across.
    lose: { clips: ['tile-claim-1'], gain: 0.8, then: [['tile-kong', 0.08, 0.7], ['tile-claim-1', 0.16, 0.6]] },
    // The wall ran out: the bell (impactBell_heavy_000), the whole ring.
    drawgame: { clips: ['gong'], gain: 0.7 },
    // Show hands: impactMining_003, the whole clip, untrimmed.
    flip: { clips: ['tiles-reveal'], gain: 0.9 },
    // Next hand: the same mining hit as a win (impactMining_000).
    next: { clips: ['impact-pung'], gain: 1 },
  };

  // Background music: CC BY 4.0 tracks by Kevin MacLeod (incompetech.com),
  // re-encoded to 96 kbps AAC in /assets/music/. The credit is on the play
  // page and in /assets/music/README.md.
  var MUSIC_DIR = '/assets/music/';
  // Quiet under the effects. Applied through Web Audio (see playTrack):
  // iPhones ignore an audio element's own volume and play it at full.
  var MUSIC_VOLUME = 0.18;
  var MUSIC = [
    { file: 'guzheng-city.m4a', title: 'Guzheng City' },
    { file: 'shenyang.m4a', title: 'Shenyang' },
    { file: 'ripples.m4a', title: 'Ripples' },
  ];

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function cueClips() {
    var names = {};
    Object.keys(CUES).forEach(function (k) {
      CUES[k].clips.forEach(function (n) { names[n] = true; });
      (CUES[k].then || []).forEach(function (x) { names[x[0]] = true; });
    });
    return Object.keys(names);
  }

  function createSound(enabled) {
    var ac = null;
    var out = null;
    var raw = {}; // fetched bytes, decoded once there's an audio context
    var buffers = {};
    var api = { enabled: enabled, musicEnabled: true };

    // The files are small (a quarter MB in all), so fetch them up front;
    // the browser only lets audio start after a tap, when ctx() runs.
    function fetchAll() {
      if (!root.fetch) return;
      cueClips().forEach(function (name) {
        if (raw[name] || buffers[name]) return;
        raw[name] = root.fetch(SOUND_DIR + name + '.wav')
          .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .catch(function () { return null; });
      });
    }

    function decodeAll(a) {
      Object.keys(raw).forEach(function (name) {
        var pending = raw[name];
        delete raw[name];
        pending.then(function (bytes) {
          if (!bytes) return;
          // The callback form also works in older Safari.
          a.decodeAudioData(bytes, function (buf) { buffers[name] = buf; }, function () {});
        });
      });
    }

    function ctx() {
      if (!api.enabled) return null;
      if (!ac) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        // iOS mutes Web Audio when the ring/silent switch is on, but not
        // media; 'playback' lets the effects play like the music does.
        try { if (root.navigator && root.navigator.audioSession) root.navigator.audioSession.type = 'playback'; } catch (e) {}
        ac = new AC();
        out = ac.createGain();
        out.gain.value = 0.9;
        out.connect(ac.destination);
        fetchAll();
        decodeAll(ac);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }

    function clip(a, name, at, gain, vary, pitch) {
      var buf = buffers[name];
      if (!buf) return;
      var src = a.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (pitch || 1) * (vary ? 0.95 + Math.random() * 0.1 : 1);
      var g = a.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(out);
      src.start(at);
    }

    // Background music: the tracks in MUSIC, shuffled, one after another
    // in a loop (reshuffled each time round, never the same track twice in
    // a row). It plays while sound is on and the game is open, and pauses
    // while the tab is hidden.
    var music = { el: null, order: [], at: -1, on: false };

    function nextTrack() {
      if (music.at + 1 >= music.order.length) {
        var last = music.order[music.order.length - 1];
        music.order = shuffle(MUSIC.slice());
        if (music.order.length > 1 && music.order[0] === last) music.order.push(music.order.shift());
        music.at = -1;
      }
      music.at++;
      return music.order[music.at];
    }

    function playTrack(track) {
      if (!music.el) {
        if (!root.Audio) return;
        music.el = new root.Audio();
        // Route the music through Web Audio so its volume holds on phones
        // (iOS ignores the element's volume); fall back to that volume.
        var a = ctx();
        if (a && a.createMediaElementSource) {
          var g = a.createGain();
          g.gain.value = MUSIC_VOLUME;
          a.createMediaElementSource(music.el).connect(g);
          g.connect(a.destination);
        } else {
          music.el.volume = MUSIC_VOLUME;
        }
        music.el.addEventListener('ended', function () { playTrack(nextTrack()); });
        // A track that can't load is skipped.
        music.el.addEventListener('error', function () { if (music.on) playTrack(nextTrack()); });
      }
      music.el.src = MUSIC_DIR + track.file;
      if (music.on && api.enabled && api.musicEnabled) {
        var p = music.el.play();
        if (p && p.catch) p.catch(function () {}); // waits for a tap if the browser blocks it
      }
    }

    // music(true) starts or resumes it (if sound and music are on),
    // music(false) pauses.
    api.music = function (on) {
      music.on = !!on;
      if (!music.on || !api.enabled || !api.musicEnabled) {
        if (music.el) music.el.pause();
        return;
      }
      if (!music.el || !music.el.src) { playTrack(nextTrack()); return; }
      var p = music.el.play();
      if (p && p.catch) p.catch(function () {});
    };

    // For good: the table is closing.
    api.stopMusic = function () {
      if (root.document) {
        UNLOCK_EVENTS.forEach(function (type) { root.document.removeEventListener(type, unlock, true); });
      }
      api.music(false);
      if (music.el) { music.el.removeAttribute('src'); music.el.load(); }
      music.el = null;
      music.at = music.order.length; // the next start reshuffles
    };

    api.play = function (name) {
      var cue = CUES[name];
      var a = cue && ctx();
      if (!a) return;
      var t = a.currentTime + 0.005;
      clip(a, cue.clips[Math.floor(Math.random() * cue.clips.length)], t, cue.gain, cue.vary);
      (cue.then || []).forEach(function (x) { clip(a, x[0], t + x[1], x[2], cue.vary, x[3]); });
    };

    // Browsers only start audio after a tap or key press, so music started
    // without one (the game resuming after a refresh) is silent. The first
    // tap or key then wakes the audio and plays a random song, if music
    // should be playing and isn't.
    function unlock() {
      if (ac && ac.state === 'suspended') ac.resume();
      if (!music.on || !api.enabled || !api.musicEnabled) return;
      if (music.el && !music.el.paused) return;
      playTrack(nextTrack());
    }
    var UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];
    if (root.document) {
      UNLOCK_EVENTS.forEach(function (type) { root.document.addEventListener(type, unlock, true); });
    }

    if (enabled) fetchAll();
    return api;
  }

  /* ------------------------------------------------------------------ *
   * 3. Text helpers
   * ------------------------------------------------------------------ */

  function wrapText(ctx, text, maxW) {
    var words = String(text).split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function fitFont(ctx, text, maxW, size, family, weight) {
    var s = size;
    for (; s > 8; s--) {
      ctx.font = (weight || '') + ' ' + s + 'px ' + family;
      if (ctx.measureText(text).width <= maxW) break;
    }
    return s;
  }

  /* ------------------------------------------------------------------ *
   * 4. The table app
   * ------------------------------------------------------------------ */

  // `saved` (optional) is a checked save file (MahjongEngine.checkSave) to
  // play on from.
  function createTable(canvas, liveRegion, settings, callbacks, saved) {
    var ctx = canvas.getContext('2d');
    var prefs = readJson(PREFS_KEY, { sound: true });
    var sound = createSound(prefs.sound !== false);
    sound.musicEnabled = sound.enabled;
    var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // W and H are the layout size. On short landscape screens the table is
    // laid out taller and scaled down to fit (zoom < 1); dpr then includes
    // that zoom so everything still renders sharp.
    var W = 0, H = 0, dpr = 1, zoom = 1, cssW = 0, cssH = 0;
    var MIN_LANDSCAPE_H = 520;
    var L = null;
    var game = null;
    var destroyed = false;
    var frameRequested = false;
    var anims = [];
    var particles = [];
    var banners = [];
    var flights = [];
    var regions = [];
    var hover = null;
    var historyDrag = null;
    // Face-up tiles drawn this frame (screen boxes) and the mouse position,
    // for the tile-name tooltip.
    var tileSpots = [], tipsOn = true, mouse = null, tipTile = null;
    // The computer players' name rows, for the strategy tooltip.
    var seatSpots = [], tipSeat = null;
    var lastTouch = false; // the last press was a finger: no hover, so the selected tile gets the tip

    var ui = {
      coach: settings.coach || 'on', // 'on' (advice), 'feedback' (notes on your last move) or 'off'
      feedback: null, // the coach's note on your previous move
      handSlots: [], // each hand tile's slide from where it was to where it belongs
      handSlide: 1,  // 0..1 progress of that slide
      handSig: '',   // what the hand looked like when the slots were last matched
      handLayout: '',
      restartArmed: 0, // when Restart game was first tapped in the menu
      replaying: false, // a loaded hand is being played again up to your next move
      windFlash: 0, // 1 to 0 as your wind badge flashes after copying the seed
      turnSeat: null,
      selected: -1,
      turnPrompt: null,
      claimPrompt: null,
      hint: null,
      coachLog: [], // past hints and feedback, oldest first; the live note is not listed
      coachScroll: 0,
      coachStick: true, // follow the newest note until the player scrolls up
      coachScrollMax: 0,
      notice: null,
      hide: { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null },
      botLift: null, // { seat, index } tile a bot is considering
      botDrawn: [false, false, false, false], // a bot is holding a fresh draw
      winInHand: null, // a discard win's tile, flying into the winner's hand then glowing there
      botDiscardFrom: [null, null, null, null],
      oppHand: [null, null, null, null],
      overlay: null,
      revealHands: false, // after Show hands, every concealed hand is face up
      heldSummary: null, // the results panel, while those hands stay open
      youIcon: null, // where your person icon was drawn
      headerMark: [null, null, null, null], // name row: icon and where the score sits beside it
      youHeader: null, // where your name was drawn, so See results can sit under it when there is no coach box
      coachBox: null, // the coach's bar, once drawn, so See results can sit above your avatar
      lastHandRects: [],
      meldAnchor: [null, null, null, null],
      backAnchor: [null, null, null, null],
      flowerAnchor: [null, null, null, null],
      stats: { hands: 0, wins: 0, best: null, dealIns: 0 },
      strategies: pickStrategies(),
    };

    function announce(text) {
      if (liveRegion) liveRegion.textContent = text;
    }

    // Animations: 'normal' (shown) or 'off' (skip animations and delays).
    function instantMode() { return settings.speed === 'off' || ui.replaying; }
    function speed(ms) { return reduceMotion ? 0 : ms; }

    /* ---------------- frame loop ---------------- */

    function requestRender() {
      if (frameRequested || destroyed) return;
      frameRequested = true;
      root.requestAnimationFrame(frame);
    }

    var lastFrameAt = 0; // when the last frame was drawn
    var MAX_STEP = 48; // the most an animation advances in one frame (ms)

    function frame() {
      frameRequested = false;
      if (destroyed) return;
      var t = now();
      lastFrameAt = t;
      // Animations advance by a capped step per frame, so a hitch (a slow
      // phone, a heavy turn calculation) stretches a flight out instead of
      // letting the next frame jump it to the end and skip it.
      anims = anims.filter(function (a) {
        a.elapsed += Math.min(t - a.last, MAX_STEP);
        a.last = t;
        var p = a.dur ? clamp(a.elapsed / a.dur, 0, 1) : 1;
        a.step(a.ease ? a.ease(p) : p, p);
        if (p >= 1) { a.done(); return false; }
        return true;
      });
      particles = particles.filter(function (p) { return t - p.born < p.life; });
      banners = banners.filter(function (b) { return t - b.start < b.dur; });
      if (ui.shake && t - ui.shake.start >= SHAKE_MS) ui.shake = null;
      render(t);
      if (anims.length || particles.length || banners.length || ui.shake) requestRender();
    }

    function animate(dur, step, ease) {
      if (instantMode()) {
        step(1, 1);
        requestRender();
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        if (destroyed) return;
        var a = { elapsed: 0, last: now(), dur: speed(dur), step: step, ease: ease, done: resolve };
        anims.push(a);
        requestRender();
        // Finish anyway if animation frames have really stopped (a hidden
        // tab); while frames are running the animation plays out in full.
        var guard = function () {
          var at = anims.indexOf(a);
          if (at === -1 || destroyed) return;
          var stopped = (root.document && root.document.hidden) || now() - lastFrameAt > 800;
          if (!stopped) { setTimeout(guard, 300); return; }
          anims.splice(at, 1);
          a.step(1, 1);
          a.done();
          requestRender();
        };
        setTimeout(guard, a.dur + 250);
      });
    }

    // While the menu is open the table waits, so the bots don't play on
    // behind it (and a save is the game as you left it).
    function menuOpen() {
      return !!(ui.overlay && ui.overlay.type === 'menu');
    }

    function sleep(ms) {
      if (instantMode()) return destroyed ? new Promise(function () {}) : Promise.resolve();
      return new Promise(function (resolve) {
        if (destroyed) return;
        var done = function () {
          if (destroyed) return;
          if (menuOpen()) { setTimeout(done, 150); return; }
          resolve();
        };
        setTimeout(done, reduceMotion ? Math.min(ms, 120) : speed(ms));
      });
    }

    /* ---------------- layout ---------------- */

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var deviceDpr = Math.min(root.devicePixelRatio || 1, 2.5);
      var nextZoom = rect.width > rect.height && rect.height < MIN_LANDSCAPE_H ? rect.height / MIN_LANDSCAPE_H : 1;
      if (rect.width === cssW && rect.height === cssH && deviceDpr * nextZoom === dpr) return;
      cssW = rect.width; cssH = rect.height; zoom = nextZoom;
      W = cssW / zoom; H = cssH / zoom; dpr = deviceDpr * zoom;
      canvas.width = Math.round(cssW * deviceDpr);
      canvas.height = Math.round(cssH * deviceDpr);
      spriteCache = {};
      L = computeLayout();
      requestRender();
    }

    // Every player's discards sit in rows of 8, and the tiles are sized so
    // 3 rows fit (24 discards). A longer hand adds a row and shrinks them.
    var POND_COLS = 8;
    var POND_ROWS = 3;
    var PHONE_POND_CAPACITY = 8;

    function fitPondTile(zw, zh, n, cols) {
      cols = cols || POND_COLS;
      var rows = Math.max(1, Math.ceil(n / cols));
      var byW = zw / cols - TILE_GAP;
      var byH = ((zh - 2) / rows - TILE_GAP) / TILE_ASPECT;
      return clamp(Math.min(byW, byH), 8, 56);
    }

    // Like a real table: opponents sit left, across and right, and each
    // player's tiles and discards face that player. A "frame" is a rotated
    // coordinate system for one seat: local x runs left-to-right from that
    // player's point of view, and local y grows toward their edge.
    var SEAT_ANGLE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

    function makeFrame(r, seat) {
      var o = [[r.x, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w, r.y]][seat];
      var sideways = seat % 2 === 1;
      return { a: SEAT_ANGLE[seat], ox: o[0], oy: o[1], w: sideways ? r.h : r.w, h: sideways ? r.w : r.h };
    }

    function toScreen(f, x, y) {
      var c = Math.cos(f.a), sn = Math.sin(f.a);
      return { x: f.ox + x * c - y * sn, y: f.oy + x * sn + y * c };
    }

    function enterFrame(f) {
      ctx.save();
      ctx.translate(f.ox, f.oy);
      ctx.rotate(f.a);
    }

    // Screen pose (top-left as if unrotated, width, rotation) of a tile drawn
    // at local (x, y) in frame f; used to aim flying tiles.
    function localPose(f, x, y, w) {
      var c = toScreen(f, x + w / 2, y + w * TILE_ASPECT / 2);
      return { x: c.x - w / 2, y: c.y - w * TILE_ASPECT / 2, w: w, rot: f.a };
    }

    // Three layouts:
    //   desktop: the table and your hand on the left, the coach's column on
    //     the right, and the coach's bar above your hand;
    //   phone landscape: a square table with the coach's column beside it,
    //     your hand along the whole bottom, no bar;
    //   phone portrait: the table, the coach's bar, then your hand in two
    //     rows, no column.
    // The table (the other players and the discards) is kept as close to
    // square as the screen allows; spare room goes to the coach.
    var HAND_ROW_GAP = 6;
    // A landscape phone draws your hand this much smaller than it could be,
    // so the table has more room.
    var PHONE_HAND_SCALE = 0.9;
    // A portrait phone's hand tiles are at most this wide, as a share of the
    // screen's height, so the two rows leave the table its room.
    var PORTRAIT_HAND_H = 0.05;

    // Discard areas for a pond: a cross around the center box, or (`strip`,
    // for a narrow table) top and bottom ponds across the full width with
    // the side ponds in the band between them and a slim center box.
    // `cols` tiles to a row, and enough rows to hold `capacity` discards.
    // `midFrac` is how deep the cross's top and bottom ponds are.
    function pondZones(inner, strip, cols, midFrac, capacity) {
      var rows = Math.max(1, Math.ceil((capacity || POND_COLS * POND_ROWS) / cols));
      var zones = [];
      // The top and bottom rows are a little deeper so each discard can be larger.
      var sideFrac = 0.26;
      midFrac = midFrac || 0.34;
      zones[2] = { x: inner.x + inner.w * sideFrac, y: inner.y + 2, w: inner.w * (1 - 2 * sideFrac), h: inner.h * midFrac - 2 };
      zones[0] = { x: inner.x + inner.w * sideFrac, y: inner.y + inner.h * (1 - midFrac), w: inner.w * (1 - 2 * sideFrac), h: inner.h * midFrac - 2 };
      zones[3] = { x: inner.x + 2, y: inner.y + 2, w: inner.w * sideFrac - 6, h: inner.h - 4 };
      zones[1] = { x: inner.x + inner.w * (1 - sideFrac) + 4, y: inner.y + 2, w: inner.w * sideFrac - 6, h: inner.h - 4 };
      var center = {
        x: inner.x + inner.w * sideFrac + 4, y: inner.y + inner.h * midFrac + 2,
        w: inner.w * (1 - 2 * sideFrac) - 8, h: inner.h * (1 - 2 * midFrac) - 4,
      };
      if (strip) {
        // Wide enough that the wind letter isn't tight against the sides.
        var centerW = 64;
        var sideDepth = (inner.w - centerW - 12) / 2;
        var rowsH = function (p) { return rows * (p * TILE_ASPECT + TILE_GAP) + 4; };
        var pwFit = Math.min((inner.w - 4) / cols - TILE_GAP, ((sideDepth - 2) / rows - TILE_GAP) / TILE_ASPECT);
        // The side ponds' columns run down the band between top and bottom.
        while (pwFit > 8 && inner.h - 2 * rowsH(pwFit) < cols * (pwFit + TILE_GAP) + 8) pwFit -= 0.5;
        var bandH = rowsH(pwFit);
        zones[2] = { x: inner.x + 2, y: inner.y + 2, w: inner.w - 4, h: bandH };
        zones[0] = { x: inner.x + 2, y: inner.y + inner.h - bandH - 2, w: inner.w - 4, h: bandH };
        var midY = inner.y + bandH + 6, midH = inner.h - 2 * bandH - 12;
        zones[3] = { x: inner.x + 2, y: midY, w: sideDepth, h: midH };
        zones[1] = { x: inner.x + inner.w - sideDepth - 2, y: midY, w: sideDepth, h: midH };
        center = { x: inner.x + sideDepth + 6, y: midY, w: inner.w - 2 * sideDepth - 12, h: midH };
      }
      // A little smaller than the gap between the discard areas, kept centered.
      var shrink = 0.85;
      // (The strip's center box is already as narrow as it can be.)
      if (!strip) {
        center.x += center.w * (1 - shrink) / 2;
        center.w *= shrink;
      }
      center.y += center.h * (1 - shrink) / 2;
      center.h *= shrink;
      // The middle plaque is wide in the cross; narrow it and keep it centered.
      var narrow = strip ? 1 : 0.68;
      center.x += center.w * (1 - narrow) / 2;
      center.w *= narrow;
      // The wind and the turn arrow read as a square, so the long side
      // comes in to meet the short one.
      var side = Math.min(center.w, center.h);
      center.x += (center.w - side) / 2;
      center.y += (center.h - side) / 2;
      center.w = side;
      center.h = side;
      // A little room on each side so the turn arrow sits clear of the wind.
      center.x -= 6;
      center.w += 12;
      return { zones: zones, center: center };
    }

    function computeLayout() {
      var pad = W < 600 ? 6 : 14;
      var topH = 42 + 6; // top bar plus a little breathing room below it
      // Short landscape phones are laid out taller than the screen, so W can
      // look like a desktop. The coach column follows the real screen.
      var desktop = cssW >= 980 && cssW >= cssH * 0.9;
      var landscape = !desktop && W > H;
      var phonePortrait = !desktop && !landscape;
      var handRows = phonePortrait ? 2 : 1;
      var depth = function (w) { return Math.max(2, w * 0.08); };

      // An upright phone leaves the coach's bar out with the coach off, so
      // the table gets the room. Desktop and sideways phones keep theirs.
      var coachShown = desktop || landscape || ui.coach !== 'off';

      // Your section: the table's width on desktop and on a landscape phone
      // (the board takes the left two thirds there, the coach the rest),
      // the full width on a portrait phone.
      var historyGap = desktop ? 14 : landscape && coachShown ? 8 : 0;
      var ox = 0;
      var tableW = W;
      if (desktop) tableW = Math.min(Math.round((W - historyGap - pad) * 2 / 3), Math.round(H * 1.1));
      if (landscape && coachShown) tableW = Math.round((W - historyGap - pad) * 2 / 3);
      var meX = ox, meW = phonePortrait ? W : tableW;
      // A landscape phone's side seats run the full height (their tiles in
      // one row need the length), so your section sits between them.
      var LANDSCAPE_SIDE_W = 48;
      if (landscape) {
        meX = ox + LANDSCAPE_SIDE_W + 6;
        meW = tableW - 2 * (LANDSCAPE_SIDE_W + 6);
      }

      // Hand tiles: one row of 14 across your section, or two rows of 7 on a
      // portrait phone, as wide as the screen unless that's too tall.
      // (A landscape phone sizes them for the two-thirds board even with the
      // coach off: bigger tiles there would take height from the discards.)
      var tileRowW = landscape ? Math.round((W - 8 - pad) * 2 / 3) : meW;
      var handGap = phonePortrait ? PHONE_HAND_GAP : TILE_GAP;
      var tw = phonePortrait
        ? Math.min((meW - 2 * pad - 6 - 6 * handGap) / 7, H * PORTRAIT_HAND_H)
        : clamp(((tileRowW - 2 * pad - 13 * TILE_GAP) / 14.8) * 0.88, 18, Math.min(124, H * (landscape ? 0.085 : 0.114)));
      // A landscape phone draws your hand (and so your melds) a little smaller, for the table.
      if (landscape) tw *= PHONE_HAND_SCALE;
      var th = tw * TILE_ASPECT;
      var handY = H - pad - th - depth(tw) - 4; // the bottom row
      var handTop = handY - (handRows - 1) * (th + HAND_ROW_GAP);
      // Melds and flowers: a portrait phone keeps them to a row of 14, so
      // they fit beside your name.
      var mw = phonePortrait ? (meW - 2 * pad - 19) / 14 : tw;
      var meldRowH = mw * TILE_ASPECT + 8;
      var meY = handTop - meldRowH - 6;
      var actionsH = 44;
      // Action buttons sit in the meld row, between your melds and your
      // name, so the table gets the room.
      var actionsInRow = true;
      var actionsY = meY + (meldRowH - actionsH) / 2;
      // Your section sits in its own box, like the other players', with a
      // little room above your name and melds.
      var meBoxPad = 8;
      var meBox = { x: meX + pad, y: meY - meBoxPad, w: meW - 2 * pad, h: H - Math.max(4, pad / 2) - (meY - meBoxPad) };

      // The coach's bar above your section: a fixed height on desktop (it
      // fits the action line and a four-line paragraph, and keeps its space
      // when the coach is off, so toggling it never moves the table); on a
      // portrait phone whatever is left once the table is about square.
      // Landscape phones show the coach in the column instead.
      var hintH = 0;
      var room = meBox.y - 6 - topH - 6; // table and bar together
      if (desktop) hintH = 84;
      // (Upright, the coach's bar stays shorter than your section.)
      if (phonePortrait && coachShown) hintH = clamp(room - Math.min(tableW - 2 * pad, room - 72), 72, 80);
      var hintY = meBox.y - hintH - 6;
      var bandTop = hintH ? hintY : meBox.y;
      var gap = 6;

      // The coach's column takes what's left on desktop and on a landscape phone.
      var historyW = desktop || (landscape && coachShown) ? W - pad - historyGap - tableW : 0;
      // Ponds and side seats go narrow on a phone's narrow table.
      // (A landscape phone keeps the phone sizes even when the coach is off
      // and the table spans the screen: its height is what's short.)
      var portrait = !desktop && (landscape || tableW < 700 || tableW < (bandTop - topH) * 0.9);

      // On a phone each opponent's tiles are one row (drawOpponent), so the
      // seats are only one tile deep and the discards get the room.
      // (On a phone opponents show only their points, in payout games.)
      var phoneHead = 4; // a phone shows no name or points on the computers' seats
      var sideW, topPanelH, sideHead, topHead;
      var sideRun = 0;
      if (desktop) {
        // Names are one short row. The seats are only as deep as the hand
        // and the meld row; the rest of that band belongs to the discards.
        // The across player's name sits on the exposed row, so that panel
        // has no header band.
        sideHead = 20;
        topHead = 0;
        sideRun = Math.max(40, (bandTop - gap) - topH - sideHead - 3);
        var depthUnit = TILE_ASPECT + 0.08;
        var lengthTile = clamp((sideRun - 13 * TILE_GAP) / 14.7, 8, 52);
        var tileRows = lengthTile * depthUnit * 2;
        sideW = clamp(Math.ceil(tileRows + 16), 120, 200) + 10;
        // The extra width is split by the hand and the exposed row, and the
        // across seat is made just as deep so every opponent tile matches.
        var lengthFit = (sideRun - 13 * TILE_GAP) / 14;
        var depthFit = (sideW - 16) / (2 * depthUnit);
        var oppFit = clamp(Math.min(lengthFit, depthFit), 8, 72);
        topPanelH = Math.ceil(oppFit * 2 * depthUnit + 16);
      } else {
        sideW = phonePortrait ? 46 : landscape ? LANDSCAPE_SIDE_W : portrait ? clamp(tableW * 0.16, 56, 88) : clamp(tableW * 0.16, 118, 200);
        topPanelH = 62;
        sideHead = phoneHead;
        topHead = phoneHead;
      }
      var opp = [];
      // An upright phone's player across spans the table, above the side
      // seats; sideways the side seats run the full height instead, with the
      // player across between them.
      var acrossSpans = phonePortrait;
      var sideTop = acrossSpans ? topH + topPanelH + gap : topH;
      var sideBottom = landscape ? H - Math.max(4, pad / 2) : bandTop - gap;
      opp[3] = { x: ox + pad, y: sideTop, w: sideW, h: sideBottom - sideTop };
      opp[1] = { x: ox + tableW - pad - sideW, y: sideTop, w: sideW, h: sideBottom - sideTop };
      var mid = ox + pad + sideW + gap;
      var pondW = tableW - 2 * (pad + sideW + gap);
      opp[2] = acrossSpans ? { x: ox + pad, y: topH, w: tableW - 2 * pad, h: topPanelH } : { x: mid, y: topH, w: pondW, h: topPanelH };
      [1, 3].forEach(function (k) {
        var r = opp[k];
        r.head = { x: r.x, y: r.y, w: r.w, h: sideHead };
        r.tiles = { x: r.x + 3, y: r.y + sideHead, w: r.w - 6, h: r.h - sideHead - 3 };
      });
      // Desktop: the across player's name shares the exposed-tile row, so the
      // tile area fills the panel and the hand sits on the back edge. Phones
      // keep the name along the bottom, where the seat is only one tile deep.
      opp[2].head = desktop
        ? { x: opp[2].x, y: opp[2].y, w: opp[2].w, h: 0 }
        : { x: opp[2].x, y: opp[2].y + opp[2].h - topHead, w: opp[2].w, h: topHead };
      opp[2].tiles = desktop
        ? { x: opp[2].x + 3, y: opp[2].y + 3, w: opp[2].w - 6, h: opp[2].h - 6 }
        : { x: opp[2].x + 3, y: opp[2].y + 3, w: opp[2].w - 6, h: opp[2].h - topHead - 3 };
      var oppFrames = [];
      [1, 2, 3].forEach(function (k) { oppFrames[k] = makeFrame(opp[k].tiles, k); });
      // One tile size for every opponent's concealed hand and exposed tiles.
      // Meld counts do not shrink a single seat. The narrowest seat sets it.
      var oppTile = 0;
      if (desktop) {
        var depthUnit = TILE_ASPECT + 0.08;
        var shared = 72;
        [1, 2, 3].forEach(function (k) {
          var fr = oppFrames[k];
          shared = Math.min(shared, (fr.w - 13 * TILE_GAP) / 14, (fr.h - 10) / (2 * depthUnit));
        });
        oppTile = clamp(shared, 8, 72);
      }

      var pond = { x: mid, y: topH + topPanelH + gap, w: pondW, h: Math.max(60, bandTop - (topH + topPanelH + 2 * gap)) };

      var inner = pond;

      // Each pond is planned to hold this many discards: 24 on desktop, 8 on
      // a phone so its discards draw close to twice as large. A pond that
      // runs past it re-fits them smaller (with a full pond, about the size
      // they were before).
      var maxDiscards = desktop ? POND_COLS * POND_ROWS : PHONE_POND_CAPACITY;
      if (game && game.hand) {
        game.hand.seats.forEach(function (st) { maxDiscards = Math.max(maxDiscards, st.discards.length + 1); });
      }
      // The discard areas. Desktop: a cross around the center box, 8
      // columns of 3 rows each. Phones try the cross (with deeper top and
      // bottom ponds, while the center box keeps room for the wind and the
      // tile count) and the narrow-table layout, with 8 down to 5 columns
      // (deeper rows to hold as many), and keep whichever draws the
      // discards largest.
      var options = [{ strip: portrait, cols: POND_COLS }];
      if (desktop) {
        // Top and bottom ponds are the short side. Deepen them until a
        // discard is as large as the side ponds allow, so the spare felt
        // becomes tile.
        var sideDepth = pond.w * 0.26 - 6;
        var fromSide = ((sideDepth - 2) / POND_ROWS - TILE_GAP) / TILE_ASPECT;
        var fromTopW = pond.w * (1 - 2 * 0.26) / POND_COLS - TILE_GAP;
        var target = clamp(Math.min(fromSide, fromTopW), 8, 56);
        var zh = POND_ROWS * (target * TILE_ASPECT + TILE_GAP) + 2;
        var mid = clamp((zh + 2) / Math.max(1, pond.h), 0.34, 0.42);
        options = [{ strip: false, cols: POND_COLS, mid: mid }];
      } else {
        options = [];
        [8, 7, 6, 5, 4].forEach(function (cols) {
          options.push({ strip: true, cols: cols });
          [0.34, 0.37, 0.4, 0.43, 0.46].forEach(function (m) { options.push({ strip: false, cols: cols, mid: m }); });
        });
      }
      var CENTER_MIN_H = 40;
      var best = null;
      options.forEach(function (o) {
        var z = pondZones(pond, o.strip, o.cols, o.mid, maxDiscards);
        if (!desktop && !o.strip && z.center.h < CENTER_MIN_H) return;
        var frames = z.zones.map(function (zone, k) { return makeFrame(zone, k); });
        var size = 56;
        frames.forEach(function (f) { size = Math.min(size, fitPondTile(f.w, f.h, maxDiscards, o.cols)); });
        if (!best || size > best.pw + 0.01) best = { pw: size, zones: z.zones, center: z.center, frames: frames, cols: o.cols };
      });
      var inner = pond;
      var zones = best.zones, center = best.center, zoneFrames = best.frames, pw = best.pw, pondCols = best.cols;
      // The coach's column runs from the top player's panel down to the
      // bottom of yours, so those three edges line up.
      var historyBottom = meBox.y + meBox.h;
      var history = historyW ? {
        x: ox + tableW + historyGap,
        y: opp[2].y,
        w: historyW,
        h: historyBottom - opp[2].y,
      } : null;

      return {
        pad: pad, topH: topH, portrait: portrait, ox: ox, tableW: tableW, history: history,
        desktop: desktop, landscape: landscape, phonePortrait: phonePortrait, meX: meX, meW: meW,
        tw: tw, th: th, handGap: handGap, handY: handY, handRows: handRows, mw: mw, meY: meY, meldRowH: meldRowH, meBox: meBox,
        actionsY: actionsY, actionsH: actionsH, actionsInRow: actionsInRow, hintY: hintY, hintH: hintH,
        opp: opp, oppFrames: oppFrames, oppTile: oppTile, pond: pond, inner: inner, zones: zones, zoneFrames: zoneFrames,
        center: center, pw: pw, maxDiscards: maxDiscards, pondCols: pondCols,
      };
    }

    // Discards fill rows starting next to the center, moving toward the owner.
    function pondSlotLocal(seat, idx) {
      var f = L.zoneFrames[seat];
      var pw = L.pw; // every pond's discards are the same size
      var ph = pw * TILE_ASPECT + TILE_GAP;
      var cols = L.pondCols || POND_COLS;
      var gridW = cols * (pw + TILE_GAP);
      return { x: (f.w - gridW) / 2 + (idx % cols) * (pw + TILE_GAP), y: 2 + Math.floor(idx / cols) * ph, w: pw };
    }

    // A seat's own flower or season scores, and so does every tile in a
    // complete set of four flowers or four seasons.
    function flowerGlow(list, wind, id) {
      var kind = id.charAt(0);
      if (kind !== 'f' && kind !== 's') return null;
      var set = kind === 'f' ? ['f1', 'f2', 'f3', 'f4'] : ['s1', 's2', 's3', 's4'];
      var full = set.every(function (tid) { return list.indexOf(tid) !== -1; });
      return full || id === kind + wind ? COLORS.gold : null;
    }

    function pondPose(seat, idx) {
      var l = pondSlotLocal(seat, idx);
      return localPose(L.zoneFrames[seat], l.x, l.y, l.w);
    }

    /* ---------------- drawing primitives ---------------- */

    function drawTile(id, x, y, w, opts) {
      opts = opts || {};
      var sp = tileSprite(id, w, dpr, !!opts.back);
      var h = sp.height / dpr;
      ctx.save();
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      if (opts.rot || opts.scaleX !== undefined) {
        ctx.translate(x + w / 2, y + h / 2);
        if (opts.rot) ctx.rotate(opts.rot);
        if (opts.scaleX !== undefined) ctx.scale(Math.max(0.02, opts.scaleX), 1);
        ctx.translate(-(x + w / 2), -(y + h / 2));
      }
      if (opts.shadow !== false && w >= 14) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        roundRect(ctx, x + 1, y + 2, w, h, w * 0.13);
        ctx.fill();
      }
      // A face-down tile has no tip, except your own (opts.peek: your
      // concealed kong, whose tiles you know).
      if (id && (!opts.back || opts.peek) && tipsOn) recordSpot(id, x, y, w, h);
      ctx.drawImage(sp, x, y, w, h);
      if (opts.glow) {
        ctx.strokeStyle = opts.glow;
        // Red marks a tile a claim would use. Every other highlight is a thinner yellow.
        ctx.lineWidth = opts.glow === COLORS.red ? Math.max(2, w * 0.07) : Math.max(2, w * 0.07 - 1);
        roundRect(ctx, x - 1, y - 1, w + 2, w * TILE_ASPECT + 2, w * 0.15);
        ctx.stroke();
      }
      if (opts.dim) {
        ctx.fillStyle = 'rgba(0, 0, 0, ' + opts.dim + ')';
        roundRect(ctx, x, y, w, w * TILE_ASPECT, w * 0.13);
        ctx.fill();
      }
      ctx.restore();
      return h;
    }

    function text(str, x, y, opts) {
      opts = opts || {};
      ctx.font = (opts.weight || '') + ' ' + (opts.size || 13) + 'px ' + (opts.family || FONT_BODY);
      ctx.fillStyle = opts.color || COLORS.white;
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'middle';
      ctx.fillText(str, x, y);
    }

    function pill(x, y, w, h, fill, stroke) {
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // `plain` regions respond to taps but keep the arrow cursor.
    function addRegion(x, y, w, h, onTap, id, plain) {
      regions.push({ x: x, y: y, w: w, h: h, onTap: onTap, id: id, plain: !!plain });
    }

    // A refused lesson move wiggles the tile or button that was used.
    var SHAKE_MS = 480;
    function shakeDx(kind, key) {
      if (!ui.shake || ui.shake.kind !== kind || ui.shake.key !== key) return 0;
      var p = (now() - ui.shake.start) / SHAKE_MS;
      if (p < 0 || p >= 1) return 0;
      return Math.sin(p * Math.PI * 5) * (1 - p) * 18;
    }

    function button(label, x, y, w, h, onTap, style, id, picked) {
      style = style || 'light';
      var isHover = hover === id;
      var dx = shakeDx('button', id);
      if (dx) { ctx.save(); ctx.translate(dx, 0); }
      var fills = {
        primary: isHover ? '#d62a47' : COLORS.red,
        gold: isHover ? '#ffb43c' : COLORS.gold,
        light: isHover ? '#ffffff' : 'rgba(255, 248, 240, 0.94)',
        white: isHover ? '#ece6de' : '#ffffff',
        ghost: isHover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
      };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = style === 'ghost' ? 0 : 8;
      ctx.shadowOffsetY = 2;
      pill(x, y, w, h, fills[style], style === 'ghost' ? 'rgba(255,255,255,0.3)' : null);
      ctx.restore();
      if (picked) {
        // The coach's recommended move keeps its own color and gets a gold ring.
        roundRect(ctx, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      var color = style === 'light' || style === 'white' ? COLORS.ink : COLORS.white;
      if (style === 'gold') color = COLORS.ink;
      var size = fitFont(ctx, label, w - 16, Math.min(16, h * 0.42), FONT_BODY, 'bold');
      text(label, x + w / 2, y + h / 2 + 1, { size: size, weight: 'bold', color: color, align: 'center' });
      if (dx) ctx.restore();
      var event = BUTTON_EVENTS[id];
      addRegion(x, y, w, h, event ? function () { track(event, {}); onTap(); } : onTap, id);
    }

    /* ---------------- render ---------------- */

    // Screen-space box of a tile under the current transform (rotated seats,
    // the scaled summary panel), in layout units.
    function recordSpot(id, x, y, w, h) {
      var m = ctx.getTransform();
      var xs = [], ys = [];
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (c) {
        xs.push((m.a * c[0] + m.c * c[1] + m.e) / dpr);
        ys.push((m.b * c[0] + m.d * c[1] + m.f) / dpr);
      });
      tileSpots.push({ id: id, x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) });
    }

    function spotAt(p) {
      if (!p) return null;
      for (var i = tileSpots.length - 1; i >= 0; i--) {
        var sp = tileSpots[i];
        if (p.x >= sp.x0 && p.x <= sp.x1 && p.y >= sp.y0 && p.y <= sp.y1) return sp;
      }
      return null;
    }

    function drawTileTip() {
      var sp = spotAt(mouse);
      // On a touch screen the tile you've selected (tapped once) gets the tip.
      if (!sp && lastTouch && ui.selected >= 0 && ui.turnPrompt) {
        var r = ui.lastHandRects[ui.selected];
        if (r) sp = { id: r.id, x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
      }
      tipTile = sp ? sp.id : null;
      if (!sp) return;
      var label = E.tileName(sp.id);
      // How many more could still show up: in the wall or someone's hidden hand.
      var sub = '';
      if (!E.isBonus(sp.id) && game && game.hand) {
        var n = E.unseenCounts(game, 0)[E.tileIndex(sp.id)];
        sub = n + ' left';
      }
      drawTip(label, sub, sp);
    }

    function seatSpotAt(p) {
      if (!p) return null;
      return seatSpots.filter(function (sp) {
        return p.x >= sp.x0 && p.x <= sp.x1 && p.y >= sp.y0 && p.y <= sp.y1;
      })[0] || null;
    }

    // Hovering a computer player's name shows the strategy they play. Only a
    // mouse gets here, so it's desktop only. Lesson bots play a fixed script.
    function drawSeatTip() {
      var sp = seatSpotAt(mouse);
      tipSeat = sp ? sp.seat : null;
      if (sp) drawTip('Strategy: ' + Strategies.get(ui.strategies.seats[sp.seat]).name, '', sp);
    }

    function drawTip(label, sub, sp) {
      ctx.font = 'bold 13px ' + FONT_BODY;
      var w = ctx.measureText(label).width + 18;
      ctx.font = '12px ' + FONT_BODY;
      if (sub) w = Math.max(w, ctx.measureText(sub).width + 18);
      var h = sub ? 42 : 26;
      var x = clamp((sp.x0 + sp.x1) / 2 - w / 2, 4, W - w - 4);
      var y = sp.y0 - h - 6;
      if (y < 4) y = sp.y1 + 6;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = 'rgba(26,26,26,0.92)';
      ctx.fill();
      ctx.restore();
      text(label, x + w / 2, sub ? y + 14 : y + h / 2 + 1, { size: 13, weight: 'bold', align: 'center', color: COLORS.cream });
      if (sub) text(sub, x + w / 2, y + 30, { size: 12, align: 'center', color: COLORS.goldLight });
    }

    function render(t) {
      regions = [];
      tileSpots = [];
      seatSpots = [];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFelt();
      if (!game || !game.hand) {
        drawTopBar();
        // (A finished game restored after a refresh has no hand to draw.)
        if (ui.overlay) drawOverlay(t);
        return;
      }
      drawTopBar();
      drawPond(t);
      [1, 2, 3].forEach(function (s) { drawOpponent(s, t); });
      drawMe(t);
      drawHintBand();
      drawCoachHistory();
      drawActions();
      drawSeeResults();
      tipsOn = false; // tiles in flight, banners and effects get no tooltip
      drawFlights();
      drawBanners(t);
      drawParticles(t);
      tipsOn = true;
      if (ui.overlay) {
        tileSpots = []; // only the overlay's own tiles are under the mouse
        seatSpots = [];
        drawOverlay(t);
      }
      drawTileTip();
      drawSeatTip();
    }

    function drawFelt() {
      var cx = L ? L.ox + L.tableW / 2 : W / 2;
      var g = ctx.createRadialGradient(cx, H * 0.45, 40, cx, H * 0.45, Math.max(W, H) * 0.75);
      g.addColorStop(0, COLORS.feltLight);
      g.addColorStop(1, COLORS.feltDark);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* ---------------- rules sheet ---------------- */

    function rulesSheet() {
      return document.getElementById('rules-sheet');
    }

    function buildRules() {
      var body = document.getElementById('rules-sheet-body');
      if (!body || body.childElementCount) return;
      var F = E.HKScoring.FAAN;
      var intro = document.createElement('p');
      intro.className = 'rules-sheet-intro';
      intro.textContent = 'Win with four sets and a pair, worth at least ' + E.MIN_FAAN +
        ' faan. Add up every pattern your hand has, but only count the highest faan per group. A limit hand is worth ' +
        F.thirteenOrphans + ' faan.';
      body.parentNode.insertBefore(intro, body);
      root.MahjongRules.RULES.forEach(function (section) {
        var sec = document.createElement('section');
        sec.className = 'rules-section';
        var h = document.createElement('h3');
        h.className = 'rules-section-title';
        h.textContent = section.title;
        sec.appendChild(h);
        var grid = document.createElement('div');
        grid.className = 'rules-families' + (section.families.length === 1 ? ' rules-families--flat' : '');
        section.families.forEach(function (fam) {
          var box = document.createElement('div');
          box.className = 'rules-family';
          if (fam.title) {
            var ft = document.createElement('h4');
            ft.textContent = fam.title;
            box.appendChild(ft);
          }
          fam.rows.forEach(function (r) {
            var row = document.createElement('div');
            row.className = 'rules-row';
            var faan = F[r.key];
            var limit = faan >= F.thirteenOrphans;
            row.innerHTML = '<div class="rules-row-text"><div class="rules-name"></div><div class="rules-desc"></div></div><div class="rules-faan"></div>';
            // English names only (the Chinese names stay in the rule data).
            row.querySelector('.rules-name').textContent = r.name;
            row.querySelector('.rules-desc').textContent = r.desc;
            var pill = row.querySelector('.rules-faan');
            pill.textContent = limit ? 'Limit' : faan + ' faan';
            if (limit) pill.classList.add('rules-faan--limit');
            // Desktop: hover or click opens the example above the pattern, and
            // leaving it hides the example. Touch still opens from the press,
            // and that first tap does not also close it.
            if (section.preview !== false && r.preview !== false) {
              row.classList.add('rules-row--example');
              row.tabIndex = 0;
              row.setAttribute('role', 'button');
              row.setAttribute('aria-expanded', 'false');
              var show = function () { showRuleExample(row, r, pill.textContent); };
              var fromMouse = true;
              var openBeforePress = false;
              row.addEventListener('pointerdown', function (e) {
                if (desktopRules()) return;
                fromMouse = e.pointerType === 'mouse';
                openBeforePress = openExampleRow === row;
              });
              row.addEventListener('mouseenter', function () {
                if (desktopRules()) { show(); return; }
                if (fromMouse || !openBeforePress) show();
              });
              row.addEventListener('focus', function () {
                if (desktopRules()) return;
                if (fromMouse || !openBeforePress) show();
              });
              row.addEventListener('click', function () {
                track('play_rule_click', { hand: r.name });
                if (desktopRules()) { show(); return; }
                if (fromMouse ? openExampleRow === row : openBeforePress) { hideRuleExample(); return; }
                show();
              });
              row.addEventListener('keydown', function (e) {
                if (!desktopRules() || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                if (openExampleRow === row) hideRuleExample();
                else show();
              });
              row.addEventListener('mouseleave', function (e) {
                if (desktopRules()) {
                  if (exampleCardHas(e.relatedTarget)) return;
                  if (openExampleRow === row) hideRuleExample();
                  return;
                }
                if (exampleCardHas(e.relatedTarget)) return;
                openBeforePress = false;
                hideRuleExample();
              });
              row.addEventListener('blur', function () {
                if (desktopRules()) return;
                if (!exampleCardPressed) hideRuleExample();
              });
            }
            box.appendChild(row);
          });
          grid.appendChild(box);
        });
        sec.appendChild(grid);
        body.appendChild(sec);
      });
      // One listener for the sheet: a click that isn't the open pattern or its
      // card puts the example away. The backdrop click still closes the sheet.
      rulesSheet().addEventListener('click', function (e) {
        if (!desktopRules() || !openExampleRow) return;
        if (openExampleRow.contains(e.target) || exampleCardHas(e.target)) return;
        hideRuleExample();
      });
      // Where the pointer was last, so the example can enter from that side.
      rulesSheet().addEventListener('pointermove', function (e) {
        if (pointerTravel.ready) {
          pointerTravel.dx = e.clientX - pointerTravel.x;
          pointerTravel.dy = e.clientY - pointerTravel.y;
        }
        pointerTravel.x = e.clientX;
        pointerTravel.y = e.clientY;
        pointerTravel.ready = true;
      });
    }

    // A finger still follows the touch path. Desktop uses hover and click.
    function desktopRules() {
      return !!(root.matchMedia && root.matchMedia('(hover: hover) and (pointer: fine)').matches);
    }

    function tileImg(id) {
      var img = document.createElement('img');
      img.src = '/tiles/' + E.HKScoring.TILE_BY_ID[id].file;
      img.alt = E.tileName ? E.HKScoring.TILE_BY_ID[id].name : id;
      img.className = 'rules-tile';
      return img;
    }

    // Which rule's example is on screen, so a second click can close it.
    var openExampleRow = null;
    var exampleCardPressed = false;
    var pointerTravel = { x: 0, y: 0, dx: 0, dy: 0, ready: false };

    function exampleCardHas(node) {
      var dlg = rulesSheet();
      var card = dlg && dlg.querySelector('.rules-example');
      return !!(card && node && (node === card || card.contains(node)));
    }

    // A meld or pair the pattern needs, as opposed to tiles that only complete the hand.
    function patternSet(key, set, example) {
      var id = set[0];
      var dragons = id === 'dr' || id === 'dg' || id === 'dw';
      var winds = id === 'we' || id === 'ws' || id === 'ww' || id === 'wn';
      if (key === 'allKongs') return set.length === 4;
      if (key === 'dragonPung' || key === 'greatDragons') return dragons && set.length >= 3;
      if (key === 'smallDragons') return dragons;
      if (key === 'greatWinds') return winds && set.length >= 3;
      if (key === 'smallWinds') return winds;
      if (key === 'yakuWind') {
        var windOf = { 1: 'we', 2: 'ws', 3: 'ww', 4: 'wn' };
        var seat = example.seat || 2;
        var round = example.round || 1;
        return set.length >= 3 && (id === windOf[seat] || id === windOf[round]);
      }
      return true;
    }

    // The example hand. On a desktop it sits in the middle of the sheet.
    function showRuleExample(row, r, faanLabel) {
      var dlg = rulesSheet();
      var card = dlg.querySelector('.rules-example');
      if (!card) {
        card = document.createElement('div');
        card.className = 'rules-example';
        card.setAttribute('role', 'tooltip');
        card.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
          exampleCardPressed = true;
        });
        card.addEventListener('click', function (e) {
          e.stopPropagation();
          if (desktopRules()) return;
          exampleCardPressed = false;
          hideRuleExample();
        });
        card.addEventListener('mouseenter', function () {
          if (desktopRules()) hideRuleExample();
        });
        card.addEventListener('mouseleave', function (e) {
          if (openExampleRow && e.relatedTarget && openExampleRow.contains(e.relatedTarget)) return;
          hideRuleExample();
        });
        dlg.appendChild(card);
      }
      openExampleRow = row;
      row.setAttribute('aria-expanded', 'true');
      var ex = r.example;
      card.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'rules-example-head';
      head.innerHTML = '<span class="rules-example-name"></span><span class="rules-faan"></span>';
      head.firstChild.textContent = r.name + ' example';
      head.lastChild.textContent = faanLabel;
      if (faanLabel === 'Limit') head.lastChild.classList.add('rules-faan--limit');
      card.appendChild(head);
      var tiles = document.createElement('div');
      tiles.className = 'rules-example-tiles';
      // Flower hands show only the bonus tiles. No Flowers shows none.
      var flowersOnly = r.key === 'noFlowers' || r.key === 'seatFlower' || r.key === 'seatSeason' ||
        r.key === 'allFlowers' || r.key === 'allSeasons' || r.key === 'sevenFlowers' || r.key === 'eightFlowers';
      if (!flowersOnly) {
        ex.sets.forEach(function (set) {
          var cls = 'rules-set' + (patternSet(r.key, set, ex) ? ' rules-set--open' : '');
          // A phone shows these 14-tile hands on two even rows. Desktop fits the whole hand on one.
          var twoRows = !desktopRules() && (r.key === 'nineGates' || r.key === 'thirteenOrphans') && set.length > 1;
          var parts = twoRows ? [set.slice(0, Math.ceil(set.length / 2)), set.slice(Math.ceil(set.length / 2))] : [set];
          parts.forEach(function (ids, i) {
            if (i) {
              var br = document.createElement('span');
              br.className = 'rules-example-break';
              tiles.appendChild(br);
            }
            var g = document.createElement('span');
            g.className = cls;
            ids.forEach(function (id) { g.appendChild(tileImg(id)); });
            tiles.appendChild(g);
          });
        });
      }
      if (ex.flowers && ex.flowers.length) {
        var fl = document.createElement('span');
        fl.className = 'rules-set' + (flowersOnly ? ' rules-set--open' : ' rules-set--flowers');
        ex.flowers.forEach(function (id) { fl.appendChild(tileImg(id)); });
        tiles.appendChild(fl);
      }
      if (tiles.childNodes.length) card.appendChild(tiles);
      var notes = [];
      if (ex.note) notes.push(ex.note);
      if (notes.length) {
        var p = document.createElement('p');
        p.className = 'rules-example-note';
        p.textContent = notes.join(' ');
        card.appendChild(p);
      }
      card.style.display = 'block';
      var w = card.offsetWidth, h = card.offsetHeight;
      var dr = dlg.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (desktopRules()) {
        // Just above the pattern, overlapping it by a hair so the pointer can
        // move onto the card. It slides in from the side the pointer came from.
        card.style.zIndex = '2147483647';
        var anchor = pointerTravel.ready ? pointerTravel.x - dr.left : rr.left - dr.left + rr.width / 2;
        var left = anchor - w / 2;
        left = Math.max(8, Math.min(left, dlg.clientWidth - w - 8));
        var top = rr.top - dr.top + dlg.scrollTop - h + 2;
        if (top < dlg.scrollTop + 8) top = rr.bottom - dr.top + dlg.scrollTop - 2;
        card.style.left = left + 'px';
        card.style.top = top + 'px';
        slideExampleFromPointer(card);
      } else {
        card.style.zIndex = '';
        card.style.transform = 'none';
        // On a phone it stops 10px further from the sheet's right edge (css/play.css).
        var rightGap = root.matchMedia && root.matchMedia('(max-width: 600px)').matches ? 18 : 8;
        var touchLeft = Math.min(Math.max(8, rr.left - dr.left), dr.width - w - rightGap);
        var touchTop = rr.bottom - dr.top - 2;
        if (touchTop + h > dr.height - 8) touchTop = rr.top - dr.top - h + 2;
        card.style.left = touchLeft + 'px';
        card.style.top = (touchTop + dlg.scrollTop) + 'px';
      }
    }

    function slideExampleFromPointer(card) {
      var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var dx = pointerTravel.dx, dy = pointerTravel.dy;
      var mag = Math.hypot(dx, dy);
      if (reduce || mag < 1) {
        card.style.transition = 'none';
        card.style.transform = 'none';
        return;
      }
      card.style.transition = 'none';
      card.style.transform = 'translate(' + (-dx / mag * 36) + 'px,' + (-dy / mag * 20) + 'px)';
      card.offsetWidth;
      card.style.transition = 'transform 0.16s ease-out';
      card.style.transform = 'translate(0, 0)';
    }

    function hideRuleExample() {
      if (openExampleRow) openExampleRow.setAttribute('aria-expanded', 'false');
      openExampleRow = null;
      var dlg = rulesSheet();
      var card = dlg && dlg.querySelector('.rules-example');
      if (card) card.style.display = 'none';
    }

    function openRules() {
      var dlg = rulesSheet();
      if (!dlg || dlg.open) return;
      buildRules();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      track('play_open_rules', {});
    }

    function closeRules() {
      var dlg = rulesSheet();
      if (!dlg || !dlg.open) return;
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
      track('play_close_rules', {});
    }

    function rulesOpen() {
      var dlg = rulesSheet();
      return !!(dlg && dlg.open);
    }

    /* ---------------- strategies sheet ---------------- */

    function strategiesSheet() {
      return document.getElementById('strategies-sheet');
    }

    function coachFor() {
      return Coach.forStrategy(Strategies.get(ui.strategies.coach).bot);
    }

    // A seat's choice: 'random' unless one was saved.
    function seatChoice(seat) {
      var saved = readStrategies();
      return saved.seats[seat] || 'random';
    }

    function playerLabel(seat) {
      var name = game ? game.players[seat].name : 'Bot ' + seat;
      return name + ' (' + SEAT_SIDES[seat] + ')';
    }

    function strategySelect(id, value, withRandom, onPick) {
      var sel = document.createElement('select');
      sel.id = id;
      sel.className = 'strategies-select';
      if (withRandom) {
        var any = document.createElement('option');
        any.value = 'random';
        any.textContent = 'Random each game';
        sel.appendChild(any);
      }
      Strategies.list().forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        sel.appendChild(o);
      });
      sel.value = value;
      sel.addEventListener('change', function () { onPick(sel.value); });
      return sel;
    }

    function assignRow(labelText, control, playing) {
      var row = document.createElement('div');
      row.className = 'strategies-assign-row';
      var label = document.createElement('label');
      label.className = 'strategies-assign-label';
      label.htmlFor = control.id;
      label.textContent = labelText;
      if (playing) {
        var now = document.createElement('span');
        now.className = 'strategies-assign-playing';
        now.textContent = playing;
        label.appendChild(document.createTextNode(' '));
        label.appendChild(now);
      }
      row.appendChild(label);
      row.appendChild(control);
      return row;
    }

    var strategyDetailsOpen = false;

    function buildStrategies() {
      var body = document.getElementById('strategies-sheet-body');
      if (!body) return;
      body.innerHTML = '';

      var assign = document.createElement('section');
      assign.className = 'rules-section';
      var h = document.createElement('h3');
      h.className = 'rules-section-title';
      h.textContent = 'Who plays what';
      assign.appendChild(h);
      var box = document.createElement('div');
      box.className = 'rules-family strategies-assign';
      box.appendChild(assignRow('Coach and feedback', strategySelect('strategy-coach', ui.strategies.coach, false, setCoachStrategy)));
      [1, 2, 3].forEach(function (seat) {
        var choice = seatChoice(seat);
        box.appendChild(assignRow(playerLabel(seat), strategySelect('strategy-seat-' + seat, choice, true, function (id) {
          setSeatStrategy(seat, id);
        }), 'Playing ' + Strategies.get(ui.strategies.seats[seat]).name));
      });
      assign.appendChild(box);
      body.appendChild(assign);

      var about = document.createElement('section');
      about.className = 'rules-section';
      var aboutHead = document.createElement('div');
      aboutHead.className = 'strategies-about-head';
      var h2 = document.createElement('h3');
      h2.className = 'rules-section-title';
      h2.textContent = 'Strategies';
      aboutHead.appendChild(h2);
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'strategies-details-toggle';
      toggle.className = 'strategies-details-toggle';
      aboutHead.appendChild(toggle);
      about.appendChild(aboutHead);
      var grid = document.createElement('div');
      grid.className = 'strategies-cards';
      // One link shows or hides every strategy's details.
      var showDetails = function () {
        grid.classList.toggle('is-showing-details', strategyDetailsOpen);
        toggle.textContent = strategyDetailsOpen ? 'Hide details' : 'See details';
        toggle.setAttribute('aria-expanded', strategyDetailsOpen ? 'true' : 'false');
      };
      toggle.addEventListener('click', function () {
        strategyDetailsOpen = !strategyDetailsOpen;
        showDetails();
      });
      showDetails();
      Strategies.list().forEach(function (s) {
        var card = document.createElement('article');
        card.className = 'rules-family strategies-card';
        var head = document.createElement('div');
        head.className = 'strategies-card-head';
        var name = document.createElement('h4');
        name.className = 'strategies-card-name';
        name.textContent = s.name;
        var id = document.createElement('code');
        id.className = 'strategies-card-id';
        id.textContent = s.id;
        head.appendChild(name);
        head.appendChild(id);
        card.appendChild(head);
        var used = [1, 2, 3].filter(function (seat) { return ui.strategies.seats[seat] === s.id; })
          .map(function (seat) { return game ? game.players[seat].name : 'Bot ' + seat; });
        if (ui.strategies.coach === s.id) used.push('the coach');
        var who = document.createElement('p');
        who.className = 'strategies-card-who';
        who.textContent = used.length ? 'Used by ' + listWords(used) + '.' : 'Not in use this game.';
        card.appendChild(who);
        var sum = document.createElement('p');
        sum.className = 'strategies-card-summary';
        sum.textContent = s.summary;
        card.appendChild(sum);
        var more = document.createElement('div');
        more.className = 'strategies-card-more';
        s.details.forEach(function (t) {
          var p = document.createElement('p');
          appendHandNames(p, t);
          more.appendChild(p);
        });
        card.appendChild(more);
        grid.appendChild(card);
      });
      about.appendChild(grid);
      body.appendChild(about);
    }

    // Text with its hand names (the coach's list) in red spans.
    function appendHandNames(el, value) {
      Coach.highlightPatterns(value).split('\u0002').forEach(function (part) {
        var at = part.indexOf('\u0001');
        el.appendChild(document.createTextNode(at < 0 ? part : part.slice(0, at)));
        if (at < 0) return;
        var span = document.createElement('span');
        span.className = 'strategies-hand';
        span.textContent = part.slice(at + 1);
        el.appendChild(span);
      });
    }

    function listWords(list) {
      return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0];
    }

    function setSeatStrategy(seat, id) {
      var saved = readStrategies();
      if (id === 'random') delete saved.seats[seat];
      else {
        saved.seats[seat] = id;
        ui.strategies.seats[seat] = id; // takes over from the bot's next move
      }
      writeJson(STRATEGIES_KEY, saved);
      track('play_set_strategy', { seat: seat, strategy: id });
      buildStrategies();
      requestRender();
    }

    function setCoachStrategy(id) {
      var saved = readStrategies();
      saved.coach = id;
      ui.strategies.coach = id;
      writeJson(STRATEGIES_KEY, saved);
      track('play_set_coach_strategy', { strategy: id });
      refreshHint();
      buildStrategies();
      requestRender();
    }

    function openStrategies() {
      var dlg = strategiesSheet();
      if (!dlg || dlg.open) return;
      buildStrategies();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      track('play_open_strategies', {});
    }

    function closeStrategies() {
      var dlg = strategiesSheet();
      if (!dlg || !dlg.open) return;
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
      track('play_close_strategies', {});
    }

    function strategiesOpen() {
      var dlg = strategiesSheet();
      return !!(dlg && dlg.open);
    }

    var COACH_LABELS = { on: 'Coach on', feedback: 'Feedback on', off: 'Coach off' };
    // The Sound button toggles effects and music together.
    var SOUND_LABELS = { on: 'Sound on', off: 'Sound off' };
    var SOUND_ORDER = ['on', 'off'];

    function soundMode() {
      return sound.enabled ? 'on' : 'off';
    }
    var COACH_ORDER = ['on', 'feedback', 'off'];

    function drawTopBar() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, W, 42);
      var pad = L ? L.pad : 8;
      button('Menu', pad, 7, 64, 28, openMenu, 'ghost', 'menu');
      // A sideways phone gets a Full screen button beside Menu.
      var left = pad + 72;
      if (L && L.landscape && callbacks.fullscreen) {
        var fsOn = callbacks.isFullscreen && callbacks.isFullscreen();
        var fsW = 112;
        button(fsOn ? 'Exit full screen' : 'Full screen', left, 7, fsW, 28, callbacks.fullscreen, 'ghost', 'fullscreen');
        left += fsW + 6;
      }
      var right = W - pad;
      var soundLabel = SOUND_LABELS[soundMode()];
      var sw = W < 420 ? 66 : 92;
      button(soundLabel, right - sw, 7, sw, 28, toggleSound, 'ghost', 'sound');
      var hw = W < 420 ? 84 : 106;
      button(COACH_LABELS[ui.coach], right - sw - hw - 6, 7, hw, 28, cycleCoach, ui.coach === 'off' ? 'ghost' : 'gold', 'hints');
      var rw = W < 420 ? 50 : 68;
      button('Rules', right - sw - hw - rw - 12, 7, rw, 28, openRules, 'ghost', 'rules');
      var stw = W < 420 ? 70 : 96;
      button('Strategies', right - sw - hw - rw - stw - 18, 7, stw, 28, openStrategies, 'ghost', 'strategies');
      if (game) {
        var label = E.WIND_NAMES[game.round] + ' round · Hand ' + game.handNumber;
        var maxW = right - sw - hw - rw - stw - 24 - left;
        // Phones have no room beside the buttons; the round wind still shows
        // in the middle of the table.
        if (maxW >= 90) {
          var size = fitFont(ctx, label, maxW, 15, FONT_HEAD);
          text(label, left + maxW / 2, 22, { size: size, family: FONT_HEAD, align: 'center', color: COLORS.cream });
        }
      }
    }

    function windBadge(seat, x, y, r) {
      var wind = E.seatWind(game, seat);
      var isDealer = seat === game.dealer;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isDealer ? COLORS.red : 'rgba(255,248,240,0.92)';
      ctx.fill();
      text(WIND_LETTERS[wind], x, y + 1, { size: Math.round(r * 1.05), family: FONT_HEAD, align: 'center', color: isDealer ? COLORS.white : COLORS.ink });
    }

    // A seat shows the player's name only. Their strategy is in the tooltip
    // on that name and on the Strategies sheet.
    function seatTitle(seat) {
      return game.players[seat].name;
    }

    // A small robot (computer players) or person (human players) icon, drawn
    // with paths so it doesn't depend on any emoji font.
    var ICON_GAP = 5;
    var SCORE_GAP = 6; // between the avatar and the score
    var PHONE_POINTS_PX = 9, PHONE_SCORE_ICON = 10; // points on the table on a phone
    var PHONE_NAME_PX = 8, PHONE_NAME_W = 28; // the names above them
    var PHONE_SCORE_INSET = 18; // the middle of each stack, in from the table's corner
    var SEE_RESULTS_W = 120; // See results, in the coach bar above your avatar
    function playerIcon(seat, x, cy, s, color) {
      var human = game.players[seat].isHuman;
      var ink = COLORS.feltDark;
      ctx.save();
      ctx.fillStyle = color || COLORS.cream;
      ctx.strokeStyle = color || COLORS.cream;
      ctx.lineWidth = Math.max(1, s * 0.09);
      ctx.lineCap = 'round';
      if (human) {
        ctx.beginPath();
        ctx.arc(x + s / 2, cy - s * 0.2, s * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.08, cy + s * 0.5);
        ctx.quadraticCurveTo(x + s * 0.08, cy + s * 0.12, x + s / 2, cy + s * 0.12);
        ctx.quadraticCurveTo(x + s * 0.92, cy + s * 0.12, x + s * 0.92, cy + s * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        // Antenna, head, ears, eyes and mouth.
        ctx.beginPath();
        ctx.moveTo(x + s / 2, cy - s * 0.28);
        ctx.lineTo(x + s / 2, cy - s * 0.46);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + s / 2, cy - s * 0.5, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
        roundRect(ctx, x + s * 0.12, cy - s * 0.28, s * 0.76, s * 0.68, s * 0.16);
        ctx.fill();
        ctx.fillRect(x, cy - s * 0.02, s * 0.1, s * 0.26);
        ctx.fillRect(x + s * 0.9, cy - s * 0.02, s * 0.1, s * 0.26);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(x + s * 0.34, cy + s * 0.02, s * 0.085, 0, Math.PI * 2);
        ctx.arc(x + s * 0.66, cy + s * 0.02, s * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + s * 0.32, cy + s * 0.24, s * 0.36, s * 0.07);
      }
      ctx.restore();
    }

    // The width your header needs (badge, name, icon and points), at most `max`.
    // Phones leave the players' names out (each seat keeps its wind badge,
    // icon and points), so the table gets the room.
    function namesShown() {
      return !L || L.desktop;
    }

    function seatHeaderWidth(seat, max) {
      var pts = settings.mode === 'payout' ? fmt(game.players[seat].points) : '';
      ctx.font = 'bold 13px ' + FONT_BODY;
      var ptsW = pts ? ctx.measureText(pts).width : 0;
      ctx.font = 'bold 14px ' + FONT_BODY;
      var nameW = namesShown() ? ctx.measureText(seatTitle(seat)).width : 0;
      // Badge, name, icon, then the score beside the icon.
      var content = 22 + 6 + nameW + (namesShown() ? ICON_GAP : 0) + 15 + (pts ? SCORE_GAP + ptsW : 0) + 2;
      // (On a phone your points sit by your hand instead.)
      if (seat === 0 && !L.desktop) content = 22 + 6 + 15 + 2;
      return Math.min(max, content);
    }

    function drawSeatHeader(seat, x, y, w, small) {
      var r = small ? 8 : 11;
      var iconS = small ? 13 : 15;
      var namePx = small ? 13 : 14;
      // (On a phone your points sit at the bottom right of your hand instead.)
      var pts = settings.mode === 'payout' && L.desktop ? fmt(game.players[seat].points) : '';
      var ptsPx = 13;
      windBadge(seat, x + r, y + r, r);
      if (seat === 0) {
        addRegion(x, y, 2 * r, 2 * r, copySeed, 'my-wind', true);
        // The flash after copying the seed: the badge lights up gold, and a
        // ring spreads out as it fades.
        var f = ui.windFlash;
        if (f > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(244,160,32,' + (0.75 * f).toFixed(3) + ')';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + r, y + r, r * (1 + 0.7 * (1 - f)), 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,210,122,' + f.toFixed(3) + ')';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.font = 'bold ' + ptsPx + 'px ' + FONT_BODY;
      var ptsW = pts ? ctx.measureText(pts).width : 0;
      var scoreGap = SCORE_GAP;
      var iconX = x + 2 * r + 6;
      if (namesShown()) {
        var name = seatTitle(seat);
        var nameRoom = w - (iconX - x) - ICON_GAP - iconS - (pts ? scoreGap + ptsW : 0) - 2;
        var nameSize = fitFont(ctx, name, nameRoom, namePx, FONT_BODY, 'bold');
        text(name, x + 2 * r + 6, y + r + 1, { size: nameSize, weight: 'bold', color: COLORS.cream });
        ctx.font = 'bold ' + nameSize + 'px ' + FONT_BODY;
        iconX += ctx.measureText(name).width + ICON_GAP;
      }
      playerIcon(seat, iconX, y + r, iconS);
      var scoreX = iconX + iconS + scoreGap;
      if (pts) text(pts, scoreX, y + r + 1, { size: ptsPx, weight: 'bold', color: COLORS.goldLight });
      var mark = { iconX: iconX, iconRight: iconX + iconS, scoreX: scoreX, y: y + r, hasScore: !!pts };
      ui.headerMark[seat] = mark;
      if (seat === 0) ui.youIcon = { x: iconX, y: y + r, s: iconS, rowRight: pts ? scoreX + ptsW : scoreX };
      else if (!settings.lesson) seatSpots.push({ seat: seat, x0: x, y0: y, x1: pts ? scoreX + ptsW : iconX + iconS, y1: y + 2 * r });
    }

    // A concealed kong lies fully face down during the hand (it still counts
    // as concealed); the end-of-hand summary turns it face up to show the score.
    function meldTiles(m, reveal) {
      return m.tiles.map(function (id) {
        return { id: id, back: !!m.concealed && !reveal };
      });
    }

    // Concealed tiles to show once a hand is over. A discard win's tile is
    // claimed out of the pond, so the winner's row comes from the result.
    function revealedConcealed(seat) {
      var res = ui.heldSummary && ui.heldSummary.result;
      if (res && res.type === 'win' && seat === res.winner && res.concealed) return res.concealed.slice();
      return E.sortTiles(game.hand.seats[seat].hand.slice());
    }

    // Between the computers' tiles, and between your own exposed tiles.
    function tileGap() {
      return L && L.phonePortrait ? PHONE_TILE_GAP : TILE_GAP;
    }

    // Lays tiles left-to-right, wrapping inside `w`; returns the next y.
    // `tw` is each tile's slot; `drawW` (default the same) is how wide it is drawn.
    function flowRow(items, x, y, w, tw, drawW) {
      var cx = x, cy = y;
      var drawn = drawW || tw;
      var th = drawn * TILE_ASPECT + TILE_GAP;
      items.forEach(function (it) {
        if (it.gap) { cx += tw * MELD_GAP; return; }
        if (cx + drawn > x + w + 0.5) { cx = x; cy += th; }
        drawTile(it.id, cx, cy, drawn, { back: it.back, peek: it.peek, shadow: false, glow: it.glow });
        cx += drawn + tileGap();
      });
      return { x: cx, y: cy, bottom: cy + th };
    }

    function meldItems(seat) {
      var items = [];
      var melds = game.hand.seats[seat].melds;
      var hidden = ui.hide.meld[seat];
      melds.forEach(function (m, i) {
        if (i >= melds.length - hidden) return;
        if (items.length) items.push({ gap: true });
        meldTiles(m, ui.revealHands).forEach(function (x) {
          if (seat === 0) x.peek = true; // your concealed kong still shows its tip
          items.push(x);
        });
      });
      return items;
    }

    function drawOppHeader(seat, r) {
      // A phone shows no name, wind, robot or points for a computer.
      if (!namesShown()) return;
      // Name, icon, then the score on one line, even when the seat is narrow.
      var row = 16;
      drawSeatHeader(seat, r.x + 6, r.y + Math.max(1, (r.h - row) / 2), Math.max(40, r.w - 12), true);
    }

    function oppConcealedCount(seat) {
      var n = game.hand.seats[seat].hand.length;
      return Math.max(0, n - ui.hide.backs[seat]);
    }

    // A player's box. Whose turn it is shows as a faint gold tint and a
    // thin outline that slowly breathes, enough to find without pulling
    // the eye away from the table.
    function drawSeatBox(r, active, t) {
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = active ? 'rgba(244,160,32,0.07)' : 'rgba(0,0,0,0.16)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = 'rgba(244,160,32,' + (0.32 + 0.1 * Math.sin(t / 600)) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        requestRender();
      }
      ctx.restore();
    }

    function drawOpponent(seat, t) {
      var r = L.opp[seat];
      var s = game.hand.seats[seat];
      drawSeatBox(r, ui.turnSeat === seat, t);
      // The across player's name is drawn on the exposed row, after the tiles.
      if (!(L.desktop && seat === 2)) drawOppHeader(seat, r.head);

      // Drawn in the seat's rotated frame, facing its owner. On desktop the
      // concealed hand runs along their edge (a fresh draw stays in the row,
      // and a tile they are considering lifts without leaving the row), with
      // melds and flowers in front of it. On a phone it's all one row, so the
      // tiles can be larger: flowers and melds from the owner's left, then the
      // concealed hand. A fresh draw stays in the row there too.
      var f = L.oppFrames[seat];
      var gapT = tileGap();
      var items = meldItems(seat);
      var meldTilesN = items.filter(function (it) { return !it.gap; }).length;
      var flowersN = s.flowers.length;
      var gaps = items.length - meldTilesN + (flowersN && meldTilesN ? 1 : 0);
      var tileN = meldTilesN + flowersN;
      var faceUp = ui.revealHands ? revealedConcealed(seat) : null;
      var count = faceUp ? faceUp.length : oppConcealedCount(seat);
      var oneRow = !L.desktop;
      var mw, bw, backsY, meldY, bx0, mx0;
      var rowDepth = function (w) { return w * (TILE_ASPECT + 0.08); };
      if (oneRow) {
        var split = tileN && count ? 0.6 : 0; // room between the melds and the hand
        var units = count + meldTilesN + gaps * MELD_GAP + flowersN + split;
        var tilesInRow = count + tileN;
        mw = clamp(Math.min(
          (f.h - 8) / (TILE_ASPECT + 0.08),
          (f.w - Math.max(0, tilesInRow - 1) * gapT) / Math.max(1, units)
        ), 8, 40);
        bw = mw;
        var rowW = units * mw + Math.max(0, tilesInRow - 1) * gapT;
        mx0 = Math.max(0, (f.w - rowW) / 2);
        backsY = meldY = (f.h - rowDepth(mw)) / 2;
        var meldsW = tileN ? (meldTilesN + gaps * MELD_GAP + flowersN) * mw + (tileN - 1) * gapT + gapT : 0;
        bx0 = mx0 + meldsW + split * mw;
      } else {
        // Every opponent shares one size for the concealed hand and the
        // exposed tiles. A seat with more melds does not shrink on its own.
        mw = L.oppTile;
        bw = mw;
        // The rows sit against the back edge, a small gap apart. Spare depth
        // stays in front of the melds, so nothing empty sits above the hand.
        var block = 2 * rowDepth(bw) + OPP_ROW_GAP;
        var edge = Math.min(4, Math.max(1, (f.h - block) / 2));
        backsY = f.h - edge - rowDepth(bw);
        var span = count > 0 ? count * bw + Math.max(0, count - 1) * gapT : 0;
        bx0 = (f.w - span) / 2;
        meldY = backsY - rowDepth(mw) - OPP_ROW_GAP;
        // Exposed tiles start at the owner's left. This brings them toward
        // the center of that player's row.
        mx0 = 5;
      }
      var pitch = bw + gapT;
      var lift = ui.botLift && ui.botLift.seat === seat ? ui.botLift.index : -1;
      // A lifted tile moves toward the table, not past the seat's back edge
      // and not sideways past the ends of the row.
      var liftBy = 0;
      if (lift >= 0) {
        if (oneRow) liftBy = bw * 0.38;
        else {
          // Toward the table, but only through the gap in front of the hand,
          // so the tile stays clear of the exposed row and inside the seat.
          var gapInFront = Math.max(0, backsY - (meldY + rowDepth(mw)));
          liftBy = Math.min(bw * 0.22, gapInFront, Math.max(0, backsY));
          var far = backsY - liftBy + rowDepth(bw);
          if (far > f.h - 1) liftBy = Math.max(0, backsY + rowDepth(bw) - (f.h - 1));
        }
      }
      var backX = function (i) { return bx0 + i * pitch; };

      enterFrame(f);
      for (var i = 0; i < count; i++) {
        if (faceUp) drawTile(faceUp[i], backX(i), backsY, bw, { shadow: false });
        else drawTile(null, backX(i), backsY - (i === lift ? liftBy : 0), bw, { back: true, shadow: false });
      }
      // A discard win sits face up at the end of an opponent's row once it lands.
      if (ui.winInHand && ui.winInHand.seat === seat && ui.winInHand.landed && !faceUp) {
        var winX = bx0 + count * pitch;
        drawTile(ui.winInHand.tile, winX, backsY, bw, { shadow: false, glow: COLORS.gold });
      }
      // Flowers, then melds, run from the owner's left. A flower on its way
      // already has its place, so the melds don't jump when it lands.
      var fw = mw;
      var fx = mx0 + (oneRow ? 5 : 0);
      var wind = E.seatWind(game, seat);
      var flowerShown = Math.max(0, s.flowers.length - (ui.hide.flower[seat] || 0));
      for (var fk = 0; fk < flowerShown; fk++) {
        var fid = s.flowers[fk];
        drawTile(fid, fx + fk * (fw + gapT), meldY, fw, { shadow: false, glow: flowerGlow(s.flowers, wind, fid) });
      }
      var mx = fx + flowersN * (fw + gapT) + (flowersN && items.length ? mw * FLOWER_GAP : 0);
      items.forEach(function (it) {
        if (it.gap) { mx += mw * MELD_GAP; return; }
        drawTile(it.id, mx, meldY, mw, { back: it.back, shadow: false });
        mx += mw + gapT;
      });
      ctx.restore();

      if (L.desktop && seat === 2) {
        var faceMid = meldY + mw * TILE_ASPECT / 2;
        var left = toScreen(f, f.w, faceMid);
        drawSeatHeader(seat, left.x + 8, left.y + 2, Math.min(210, Math.max(80, f.w * 0.36)), true);
      }

      ui.oppHand[seat] = { f: f, backX: backX, backsY: backsY, bw: bw, mw: mw, meldY: meldY, bx0: bx0, count: count, liftBy: lift >= 0 ? liftBy : 0 };
      ui.backAnchor[seat] = localPose(f, bx0 + count * pitch, backsY, bw);
      ui.meldAnchor[seat] = localPose(f, mx + (items.length ? mw * MELD_GAP : flowersN ? mw * FLOWER_GAP : 0), meldY, mw);
      ui.flowerAnchor[seat] = localPose(f, fx + flowerShown * (fw + gapT), meldY, fw);
    }

    /* ---------------- where drawn tiles come from ---------------- */

    // Tiles fly out of the middle of the table, from the center box.
    function drawOrigin() {
      var c = L.center;
      return { x: c.x + c.w / 2 - 10, y: c.y + c.h / 2 - 14, w: 20, rot: 0 };
    }

    // On a phone in a full game, each player's avatar, name and points sit in a
    // corner of the discard table: the player across at top left, on your left
    // at bottom left, on your right at top right, and you at bottom right.
    // Everything's white, except the player whose turn it is, in yellow.
    function drawPhoneScores() {
      var p = L.pond;
      var leftX = p.x + PHONE_SCORE_INSET, rightX = p.x + p.w - PHONE_SCORE_INSET;
      var topY = p.y + 17, bottomY = p.y + p.h - 17;
      [[2, leftX, topY], [3, leftX, bottomY], [1, rightX, topY], [0, rightX, bottomY]].forEach(function (spot) {
        var color = ui.turnSeat === spot[0] ? COLORS.goldLight : COLORS.cream;
        playerIcon(spot[0], spot[1] - PHONE_SCORE_ICON / 2, spot[2] - 10, PHONE_SCORE_ICON, color);
        var name = seatTitle(spot[0]);
        var nameSize = fitFont(ctx, name, PHONE_NAME_W, PHONE_NAME_PX, FONT_BODY, 'bold');
        text(name, spot[1], spot[2] - 1, { size: nameSize, weight: 'bold', align: 'center', color: color });
        text(fmt(game.players[spot[0]].points), spot[1], spot[2] + 8, { size: PHONE_POINTS_PX, weight: 'bold', align: 'center', color: color });
      });
    }

    function drawPond(t) {
      var p = L.pond;
      ctx.save();
      roundRect(ctx, p.x, p.y, p.w, p.h, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fill();
      ctx.restore();

      var last = game.hand.lastDiscard;
      for (var seat = 0; seat < 4; seat++) {
        var f = L.zoneFrames[seat];
        enterFrame(f);
        // Faint seat-wind watermark so each pile is easy to find. It sits at
        // the owner's outer edge, where discards arrive last, so the pile
        // doesn't cover it as the hand goes on. Turned back upright so every
        // wind reads the same way for the player.
        var ws = clamp(Math.min(f.w, f.h) * 0.42, 14, 46);
        ctx.save();
        ctx.translate(f.w / 2, f.h - ws * 0.5 - 2);
        ctx.rotate(-f.a);
        ctx.globalAlpha = ui.turnSeat === seat ? 0.2 : 0.09;
        text(WIND_LETTERS[E.seatWind(game, seat)], 0, 0, { size: ws, family: FONT_HEAD, align: 'center', color: COLORS.cream });
        ctx.restore();
        var all = game.hand.seats[seat].discards;
        var list = all.filter(function (d) { return !d.claimed; });
        var shown = list.length - ui.hide.pond[seat];
        var lastLive = last && last.from === seat && all.length && !all[all.length - 1].claimed;
        for (var i = 0; i < shown; i++) {
          var slot = pondSlotLocal(seat, i);
          var glow = null;
          if (lastLive && i === list.length - 1) {
            glow = ui.claimPrompt ? 'rgba(244,160,32,' + (0.7 + 0.3 * Math.sin(t / 160)) + ')' : COLORS.gold;
            if (ui.claimPrompt) requestRender();
          }
          drawTile(list[i].tile, slot.x, slot.y, slot.w, { shadow: false, glow: glow });
        }
        ctx.restore();
      }

      if (!L.desktop && settings.mode === 'payout') drawPhoneScores();

      var c = L.center;
      ctx.save();
      roundRect(ctx, c.x, c.y, c.w, c.h, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fill();
      ctx.restore();
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      var big = clamp(c.h * 0.42, 14, 40);
      text(WIND_LETTERS[game.round], cx, cy - big * 0.32, { size: big, family: FONT_HEAD, align: 'center', color: COLORS.goldLight });
      var leftLabel = game.hand.wall.length + ' tiles left';
      var leftSize = fitFont(ctx, leftLabel, c.w - 8, clamp(c.h * 0.16, 10, 14), FONT_BODY);
      text(leftLabel, cx, cy + big * 0.55, { size: leftSize, align: 'center', color: COLORS.cream });

      // Arrow toward whose turn it is.
      if (ui.turnSeat !== null && !ui.overlay) {
        var ang = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][ui.turnSeat];
        var dist = ui.turnSeat % 2 === 0 ? c.h / 2 - 6 : c.w / 2 - 6;
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath();
        ctx.fillStyle = COLORS.gold;
        ctx.fill();
        ctx.restore();
      }
    }

    var HAND_SLIDE_MS = 260;

    function myHandOrder() {
      if (ui.revealHands) return { tiles: revealedConcealed(0), drawnSeparate: false };
      var s = game.hand.seats[0];
      // A discard win joins the row in sorted order. The copy stays hidden
      // until the flight from the pond lands.
      if (ui.winInHand && ui.winInHand.seat === 0) {
        var won = E.sortTiles(s.hand.concat([ui.winInHand.tile]));
        return { tiles: won, drawnSeparate: false, winAt: won.lastIndexOf(ui.winInHand.tile) };
      }
      var drawn = game.hand.drawnTile;
      var showDrawn = ui.turnPrompt && drawn && game.hand.turn === 0 && game.hand.canSelfDraw && s.hand.indexOf(drawn) !== -1;
      var rest = s.hand.slice();
      if (showDrawn) rest.splice(rest.lastIndexOf(drawn), 1);
      var order = E.sortTiles(rest);
      if (showDrawn) order.push(drawn);
      return { tiles: order, drawnSeparate: !!showDrawn };
    }

    // The hand is one row across your section (the left two thirds on
    // desktop), or two rows on a portrait phone: the first half on top, the
    // rest below. A fresh draw sits at the end, in line with the others.
    function handLeft(count) {
      var total = count > 0 ? count * L.tw + (count - 1) * L.handGap : 0;
      var span = L.meW;
      if (total >= span - 2 * L.pad) return L.meX + L.pad;
      return L.meX + Math.max(L.pad, (span - total) / 2);
    }

    // Where each of `count` hand tiles sits: [{ x, y }].
    function handPositions(count) {
      var step = L.tw + L.handGap;
      var rows = L.handRows === 2 && count > 1 ? 2 : 1;
      var per = Math.ceil(count / rows);
      var out = [];
      for (var r = 0; r < rows; r++) {
        var start = r * per;
        var n = Math.min(per, count - start);
        var left = handLeft(n);
        var y = L.handY - (rows - 1 - r) * (L.th + HAND_ROW_GAP);
        for (var k = 0; k < n; k++) out.push({ x: left + k * step, y: y });
      }
      return out;
    }

    function lerpPos(a, b, e) {
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }

    function drawMe(t) {
      var s = game.hand.seats[0];
      var pad = L.pad;
      var y = L.meY;
      var active = ui.turnSeat === 0;

      // Your box, like the other players'.
      drawSeatBox(L.meBox, active, t);

      // Info + melds row.
      var left = L.meX;
      var rightEdge = L.meX + L.meW;
      // Your name sits at the right edge of your box, as narrow as it can,
      // so your melds and flowers get the rest of the row. See results only
      // needs room here when there is no coach box to hold it.
      var headW = seatHeaderWidth(0, clamp(L.meW * 0.3, 130, 240));
      var infoW = headW;
      if (ui.revealHands && seeResultsHome() === 'name') infoW = seeResultsUnder() ? Math.max(headW, SEE_RESULTS_W) : headW + 6 + SEE_RESULTS_W;
      // On a phone your wind and avatar are centered on your exposed tiles.
      var headY = L.desktop ? y + 4 : y + (L.mw * TILE_ASPECT - 22) / 2;
      ui.youHeader = { x: rightEdge - pad - 8 - headW, y: headY, w: headW, right: rightEdge - pad - 8 };
      // Your name steps aside while action buttons need its spot.
      if (!ui.buttonsOverName) drawSeatHeader(0, ui.youHeader.x, headY, headW);
      var items = meldItems(0);
      var mx = left + pad + 8 + 5; // inside your box, toward the center of your row
      // Same size as the hand; only shrinks if the row would run out of room.
      var meldN = items.filter(function (it) { return !it.gap; }).length;
      var gapsN = items.length - meldN + (meldN && s.flowers.length ? 1 : 0);
      var rowW = L.meW - 2 * pad - infoW - 18;
      var tileN = meldN + s.flowers.length;
      var mw = Math.min(L.mw, (rowW - Math.max(0, tileN - 1) * tileGap()) / Math.max(1, tileN + gapsN * MELD_GAP + 0.6));
      var y0 = y + (L.mw - mw) * TILE_ASPECT;
      // Flowers come first, then the melds, away from your name. A flower on
      // its way already has its place, so the melds don't jump when it lands.
      var fw = mw;
      var fx = mx;
      var myWind = E.seatWind(game, 0);
      var flowerShown = Math.max(0, s.flowers.length - (ui.hide.flower[0] || 0));
      for (var fk = 0; fk < flowerShown; fk++) {
        var fid = s.flowers[fk];
        drawTile(fid, fx + fk * (fw + tileGap()), y0, fw, { shadow: false, glow: flowerGlow(s.flowers, myWind, fid) });
      }
      ui.flowerAnchor[0] = { x: fx + flowerShown * (fw + tileGap()), y: y0, w: fw, rot: 0 };
      mx = fx + s.flowers.length * (fw + tileGap());
      if (s.flowers.length) mx += mw * FLOWER_GAP;
      if (items.length) {
        var end = flowRow(items, mx, y0, rowW - (mx - fx), mw, mw);
        mx = end.x + mw * MELD_GAP;
      }
      ui.meldAnchor[0] = { x: mx, y: y0, w: mw, rot: 0 };
      ui.meRowFree = { x0: mx + 10, x1: rightEdge - pad - 8 - infoW - 10 };

      // Hand.
      var order = myHandOrder();
      var tiles = order.tiles;
      var count = tiles.length;
      if (ui.hide.drawn && order.drawnSeparate) count = Math.min(count, tiles.length - 1);
      var tw = L.tw;
      var hintTile = ui.coach === 'on' && ui.hint && ui.hint.tile;
      var hintUsed = false;
      ui.lastHandRects = [];

      // Where each tile belongs, and which tile was where: when the hand
      // re-sorts (a drawn tile merging in, tiles leaving for a claim) every
      // tile slides from its old place to its new one.
      var targets = handPositions(tiles.length, order.drawnSeparate);
      var layoutKey = [tw, W, H, L.handRows].join(':');
      var sig = tiles.join(',') + '|' + (order.drawnSeparate ? 1 : 0);
      if (ui.handSig !== sig || ui.handLayout !== layoutKey) {
        var snap = ui.handLayout !== layoutKey; // a resize repositions without sliding
        var pool = (ui.handSlots || []).slice();
        var moved = false;
        ui.handSlots = tiles.map(function (tid, k) {
          // The tile just taken has no previous place in the row.
          if (k === order.winAt) return { id: tid, from: targets[k], to: targets[k] };
          var best = -1, bestD = Infinity;
          for (var q = 0; q < pool.length; q++) {
            if (pool[q] && pool[q].id === tid) {
              var dd = Math.abs(pool[q].to.x - targets[k].x) + Math.abs(pool[q].to.y - targets[k].y);
              if (dd < bestD) { bestD = dd; best = q; }
            }
          }
          var from = targets[k];
          if (best >= 0 && !snap) {
            var o = pool[best];
            from = lerpPos(o.from, o.to, ui.handSlide); // where it is right now
          }
          if (best >= 0) pool[best] = null;
          if (Math.abs(from.x - targets[k].x) + Math.abs(from.y - targets[k].y) > 0.5) moved = true;
          return { id: tid, from: from, to: targets[k] };
        });
        ui.handSig = sig;
        ui.handLayout = layoutKey;
        ui.handSlide = moved ? 0 : 1;
        if (moved) animate(HAND_SLIDE_MS, function (e) { ui.handSlide = e; }, easeInOut);
      }
      if (active && !ui.overlay && targets.length) {
        var bx0 = Infinity, bx1 = -Infinity;
        targets.forEach(function (p) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x + tw); });
        var by0 = targets[0].y;
        ctx.save();
        roundRect(ctx, bx0 - 6, by0 - 8, bx1 - bx0 + 12, L.handY + L.th - by0 + 16, 12);
        ctx.fillStyle = 'rgba(244,160,32,0.14)';
        ctx.fill();
        ctx.restore();
      }
      var heldAt = ui.hide.tile ? tiles.lastIndexOf(ui.hide.tile) : -1;
      for (var i = 0; i < count; i++) {
        var id = tiles[i];
        var slot = ui.handSlots[i];
        var pos = lerpPos(slot.from, slot.to, ui.handSlide);
        var x = pos.x;
        var lift = 0;
        if (i === ui.selected) lift = tw * 0.32;
        else if (hover === 'hand-' + i && ui.turnPrompt) lift = tw * 0.12;
        var glow = null;
        if (hintTile && !hintUsed && id === hintTile && ui.turnPrompt) {
          // Glow the rightmost copy so it matches the drawn tile when relevant.
          var lastCopy = tiles.lastIndexOf(id);
          if (i === lastCopy) { glow = COLORS.gold; hintUsed = true; }
        }
        var claimable = ui.claimPrompt && ui.claimPrompt.highlight && ui.claimPrompt.highlight.indexOf(id) !== -1;
        // A replacement, or the winning discard, keeps its spot empty until it lands.
        if (i === heldAt || (i === order.winAt && ui.winInHand && !ui.winInHand.landed)) continue;
        if (i === order.winAt) glow = COLORS.gold;
        // Tiles a pung or chow would use get a red border.
        drawTile(id, x + shakeDx('tile', i), pos.y - lift, tw, { glow: glow || (claimable ? COLORS.red : null) });
        var rect = { x: x, y: pos.y - lift, w: tw, h: L.th, id: id, index: i };
        ui.lastHandRects.push(rect);
        if (ui.turnPrompt) {
          (function (idx) {
            addRegion(rect.x, rect.y, rect.w, rect.h + lift, function () { tapHandTile(idx); }, 'hand-' + idx);
          })(i);
        }
      }
    }

    function drawHintBand() {
      ui.coachBox = null;
      if (!L.hintH) return;
      var x = L.ox + L.pad, w = L.tableW - 2 * L.pad;
      var lines = [];
      var GRAY = 'rgba(255,248,240,0.5)';
      var note = ui.coach === 'on' ? ui.hint : ui.coach === 'feedback' ? ui.feedback : null;
      var showNotice = ui.notice && !ui.overlay && (ui.turnPrompt || ui.claimPrompt);
      // In Feedback the Chow and Pass buttons already name the tile, so
      // "Claim Five Bamboo?" adds nothing. Win and short-hand notices stay.
      if (ui.coach === 'feedback' && ui.claimPrompt && ui.notice && ui.notice.indexOf('Claim ') === 0) showNotice = false;
      // On a claim the question and the coach's answer share one line, such
      // as "Claim One Circle? Chow 1-2-3 Circles."
      var oneLine = showNotice && ui.claimPrompt && ui.coach === 'on' && note && note.action;
      // The note on a tile you've selected to throw ("... is OK, but ...")
      // goes last, running on from the coach's hint in its own color.
      var choiceNote = showNotice && ui.turnPrompt && ui.selected >= 0;
      if (oneLine) {
        lines.push({ text: ui.notice + ' ' + note.action, color: COLORS.goldLight, bold: true });
      } else {
        if (showNotice && !choiceNote) lines.push({ text: ui.notice, color: COLORS.goldLight });
        // The main action on its own line in bold gold; the rest as one paragraph.
        if (note && note.action) lines.push({ text: note.action, color: COLORS.goldLight, bold: true });
      }
      var tips = note && note.tips && note.tips.length ? note.tips.join(' ') : '';
      if (tips && choiceNote) {
        lines.push({ text: tips + ' ' + ui.notice, color: COLORS.cream, tailFrom: coachPieces(tips).plain.length + 1, tailColor: COLORS.goldLight });
      } else {
        if (tips) lines.push({ text: tips, color: COLORS.cream });
        if (choiceNote) lines.push({ text: ui.notice, color: COLORS.goldLight });
      }
      if (!note) {
        // Nothing to say right now: say what this box is for, in gray.
        if (ui.coach === 'off') {
          lines.push({ text: 'The coach is off.', color: GRAY, bold: true });
          lines.push({ text: 'Click the Coach button at the top to turn it on and get advice on every move, or switch it to Feedback to learn from the moves you\'ve made.', color: GRAY });
        } else if (ui.coach === 'feedback') {
          lines.push({ text: 'Feedback is on.', color: GRAY, bold: true });
          lines.push({ text: 'After you make a move, the coach will tell you how it went so you can learn from it.', color: GRAY });
        } else {
          lines.push({ text: 'The coach gives advice here on your turn and when you can claim a tile.', color: GRAY });
        }
      }
      var iconS = Math.min(L.hintH - 14, 48);
      var tx = x + 8 + iconS + 8;
      // See results sits above your avatar, to the right of this note, so the note stops short of it.
      var reserve = 0;
      if (ui.revealHands && !ui.overlay && seeResultsHome() === 'bar') {
        var spot = seeResultsBarPlace({ x: x, y: 0, w: w, h: L.hintH });
        reserve = x + w - spot.x + 8;
      }
      var tw = w - (tx - x) - 10 - reserve;
      var size = !L.desktop ? 11 : L.tableW < 600 ? 12 : 13; // smaller on a phone
      var out = [];
      lines.forEach(function (l) {
        ctx.font = (l.bold ? 'bold ' : '') + size + 'px ' + FONT_BODY;
        // Hand-pattern names and their faan, such as All Triplets (3 faan), are red.
        var piece = coachPieces(l.text, l.color);
        var plain = piece.plain, red = piece.red;
        var cursor = 0;
        wrapText(ctx, plain, tw).forEach(function (ln) {
          var at = plain.indexOf(ln, cursor);
          cursor = at + ln.length;
          var segs = [], pos = at;
          // Plain text in the line's color, or its tail's from tailFrom on.
          var pushPlain = function (a, b) {
            var split = l.tailColor ? clamp(l.tailFrom, a, b) : b;
            if (split > a) segs.push({ text: plain.slice(a, split), color: l.color });
            if (b > split) segs.push({ text: plain.slice(split, b), color: l.tailColor });
          };
          red.forEach(function (r) {
            var a = Math.max(r[0], at), b = Math.min(r[1], at + ln.length);
            if (b <= a) return;
            if (a > pos) pushPlain(pos, a);
            segs.push({ text: plain.slice(a, b), color: COLORS.redLight });
            pos = b;
          });
          if (pos < at + ln.length) pushPlain(pos, at + ln.length);
          out.push({ segs: segs, bold: l.bold });
        });
      });
      var lh = size + 3;
      // Show every line: a long tip grows the band upward over the table.
      var h = Math.max(L.hintH, out.length * lh + 12);
      var y = L.hintY + L.hintH - h;
      ui.coachBox = { x: x, y: y, w: w, h: h };
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = h > L.hintH ? 'rgba(4,46,28,0.94)' : 'rgba(0,0,0,0.32)';
      ctx.fill();
      ctx.restore();
      if (images.logo) {
        var iw = iconS * (images.logo.width / images.logo.height);
        var dw = Math.min(iw, 48), dh = Math.min(iconS, 48 / (iw / iconS));
        ctx.drawImage(images.logo, x + 8, y + (h - dh) / 2, dw, dh); // centered in the box, however tall it grows
      }
      var startY = y + h / 2 - (out.length * lh) / 2 + lh / 2;
      out.forEach(function (l, i) {
        var cx = tx;
        l.segs.forEach(function (sg) {
          text(sg.text, cx, startY + i * lh, { size: size, color: sg.color, weight: l.bold ? 'bold' : '' });
          ctx.font = (l.bold ? 'bold ' : '') + size + 'px ' + FONT_BODY;
          cx += ctx.measureText(sg.text).width;
        });
      });
    }

    // Split coach copy into plain text plus the ranges that name a hand pattern.
    function coachPieces(text, baseColor) {
      var marked = Coach.highlightPatterns ? Coach.highlightPatterns(text) : String(text);
      var plain = '', red = [], from = -1;
      for (var ci = 0; ci < marked.length; ci++) {
        var ch = marked.charAt(ci);
        if (ch === '\u0001') from = plain.length;
        else if (ch === '\u0002') { if (from >= 0) red.push([from, plain.length]); from = -1; }
        else plain += ch;
      }
      return { plain: plain, red: red, color: baseColor };
    }

    function coachPlain(note) {
      function clean(s) { return String(s).replace(/[\u0001\u0002]/g, ''); }
      if (!note) return null;
      var action = note.action ? clean(note.action) : '';
      var detail = note.tips && note.tips.length ? note.tips.map(clean).join(' ') : '';
      if (!action && !detail) return null;
      return { action: action, detail: detail };
    }

    // Your own moves in this hand, counted 1, 2, 3 (one note per move).
    function handMoveNumber(hand) {
      return ui.coachLog.filter(function (e) { return e.hand === hand; }).length + 1;
    }

    function rememberCoach(note, kind) {
      var plain = coachPlain(note);
      if (!plain) return;
      var last = ui.coachLog[ui.coachLog.length - 1];
      if (last && last.kind === kind && last.action === plain.action && last.detail === plain.detail) return;
      var hand = game ? game.handNumber : 1; // the log runs across the whole game
      ui.coachLog.push({ kind: kind, action: plain.action, detail: plain.detail, move: handMoveNumber(hand), hand: hand });
      if (ui.coachLog.length > 200) ui.coachLog.shift(); // a whole hand's worth
      ui.coachStick = true;
    }

    // The note on the table is still current, so the panel lists only earlier ones.
    function pastCoachEntries() {
      // Without the bar (a landscape phone), the column shows the live note too.
      if (!L.hintH) return ui.coachLog;
      var live = coachPlain(ui.coach === 'on' ? ui.hint : ui.coach === 'feedback' ? ui.feedback : null);
      var entries = ui.coachLog;
      if (!live || !entries.length) return entries;
      var last = entries[entries.length - 1];
      if (last.action === live.action && last.detail === live.detail) return entries.slice(0, -1);
      return entries;
    }

    // Tapping your wind badge quietly copies the current hand's seed (the
    // number its wall is shuffled from, as in a save file, with your seat
    // and the round: MahjongEngine.handSeedText): no message, and
    // the badge keeps the normal arrow cursor. The badge flashes once it's
    // copied.
    function copySeed() {
      if (!game || !game.hand || !root.navigator || !navigator.clipboard || !navigator.clipboard.writeText) return;
      track('play_copy_seed', {});
      navigator.clipboard.writeText(E.handSeedText(game, 0)).then(function () {
        if (destroyed) return;
        animate(520, function (e) { ui.windFlash = 1 - e; });
      }, function () {});
    }

    // Older notes start at the top and later ones follow downward.
    function drawCoachHistory() {
      var r = L.history;
      if (!r) return;
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      ctx.restore();
      var coachTitle = 'Coach ' + Strategies.get(ui.strategies.coach).name;
      var titleMax = r.w - 28;
      if (ui.revealHands && !ui.overlay && seeResultsHome() === 'column') titleMax -= Math.min(SEE_RESULTS_W, r.w - 24) + 8;
      text(coachTitle, r.x + 14, r.y + 20, { size: fitFont(ctx, coachTitle, Math.max(40, titleMax), 14, FONT_HEAD, 'bold'), weight: 'bold', family: FONT_HEAD, color: COLORS.cream });

      var viewX = r.x + 10;
      var viewY = r.y + 36;
      var viewW = r.w - 20;
      var viewH = r.h - 46;
      var size = !L.desktop ? 12 : r.w > 520 ? 13 : 12;
      var lh = size + 4;
      var avatar = 32;
      var textPad = 8 + avatar + 8;
      var blocks = pastCoachEntries().map(function (entry) {
        var lines = [];
        // "Hand 2 · Move 4" sits at the right end of the advice's row.
        var moveLabel = 'Hand ' + entry.hand + ' · Move ' + entry.move;
        ctx.font = (size - 2) + 'px ' + FONT_BODY;
        var moveW = ctx.measureText(moveLabel).width + 12;
        var innerW = viewW - textPad - 16;
        function pushWrapped(value, bold, baseColor, width) {
          if (!value) return;
          ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT_BODY;
          var piece = coachPieces(value, baseColor);
          var cursor = 0;
          wrapText(ctx, piece.plain, width || innerW).forEach(function (ln) {
            var at = piece.plain.indexOf(ln, cursor);
            cursor = at + ln.length;
            var segs = [], pos = at;
            piece.red.forEach(function (span) {
              var a = Math.max(span[0], at), b = Math.min(span[1], at + ln.length);
              if (b <= a) return;
              if (a > pos) segs.push({ text: piece.plain.slice(pos, a), color: baseColor });
              segs.push({ text: piece.plain.slice(a, b), color: COLORS.redLight });
              pos = b;
            });
            if (pos < at + ln.length) segs.push({ text: piece.plain.slice(pos, at + ln.length), color: baseColor });
            lines.push({ segs: segs, bold: bold });
          });
        }
        // The whole note for that move: the advice in bold, then why.
        pushWrapped(entry.action, true, COLORS.goldLight, innerW - moveW);
        pushWrapped(entry.detail, false, COLORS.cream);
        var h = Math.max(avatar + 16, lines.length * lh + 16);
        return { entry: entry, lines: lines, h: h, moveLabel: moveLabel, moveW: moveW };
      });
      var contentH = blocks.reduce(function (n, b) { return n + b.h + 8; }, 0);
      if (blocks.length) contentH -= 8;
      ui.coachScrollMax = Math.max(0, contentH - viewH);
      if (ui.coachStick) ui.coachScroll = ui.coachScrollMax;
      ui.coachScroll = clamp(ui.coachScroll, 0, ui.coachScrollMax);

      ctx.save();
      ctx.beginPath();
      ctx.rect(viewX, viewY, viewW, viewH);
      ctx.clip();
      if (!blocks.length) {
        ctx.font = size + 'px ' + FONT_BODY;
        var empty = 'Hints and feedback will collect here.';
        wrapText(ctx, empty, viewW - 8).forEach(function (ln, i) {
          text(ln, viewX + 4, viewY + 14 + i * lh, { size: size, color: 'rgba(255,248,240,0.5)' });
        });
      }
      var y = viewY - ui.coachScroll;
      blocks.forEach(function (b) {
        roundRect(ctx, viewX, y, viewW - (ui.coachScrollMax > 0 ? 8 : 0), b.h, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
        if (images.logo) {
          var logoH = avatar * (images.logo.height / images.logo.width || 1);
          ctx.drawImage(images.logo, viewX + 8, y + (b.h - logoH) / 2, avatar, logoH);
        }
        var blockH = b.lines.length * lh;
        var startY = y + (b.h - blockH) / 2 + lh / 2;
        var rightX = viewX + viewW - (ui.coachScrollMax > 0 ? 8 : 0) - 10;
        text(b.moveLabel, rightX, startY, { size: size - 2, color: 'rgba(255,248,240,0.6)', align: 'right' });
        b.lines.forEach(function (ln, i) {
          var cx = viewX + textPad;
          ln.segs.forEach(function (sg) {
            text(sg.text, cx, startY + i * lh, { size: size, color: sg.color, weight: ln.bold ? 'bold' : '' });
            ctx.font = (ln.bold ? 'bold ' : '') + size + 'px ' + FONT_BODY;
            cx += ctx.measureText(sg.text).width;
          });
        });
        y += b.h + 8;
      });
      ctx.restore();

      if (ui.coachScrollMax > 0) {
        var trackX = r.x + r.w - 8;
        var thumbH = Math.max(28, viewH * (viewH / (viewH + ui.coachScrollMax)));
        var thumbY = viewY + (viewH - thumbH) * (ui.coachScroll / ui.coachScrollMax);
        roundRect(ctx, trackX, thumbY, 4, thumbH, 2);
        ctx.fillStyle = 'rgba(255,248,240,0.45)';
        ctx.fill();
      }
    }

    function setButtonsOverName(on) {
      if (ui.buttonsOverName === on) return;
      ui.buttonsOverName = on;
      requestRender(); // your row is drawn first, so redraw it without (or with) the name
    }

    function drawActions() {
      if (ui.overlay) { setButtonsOverName(false); return; }
      var acts = [];
      if (ui.turnPrompt) {
        var o = ui.turnPrompt.opts;
        if (o.win) acts.push({ id: 'win', label: winButtonLabel(o.win), style: 'gold', fn: function () { resolveTurn({ type: 'win' }); } });
        o.kongs.forEach(function (k) {
          acts.push({ id: 'kong-' + k.tile, label: 'Kong', style: 'primary', fn: function () { resolveTurn({ type: 'kong', tile: k.tile }); } });
        });
        if (ui.selected >= 0) {
          acts.push({ id: 'discard', label: 'Discard', style: 'light', fn: function () { discardSelected(true); } });
        }
      } else if (ui.claimPrompt) {
        var c = ui.claimPrompt.opts;
        if (c.win) acts.push({ id: 'win', label: winButtonLabel(c.win), style: 'gold', fn: function () { resolveClaim({ type: 'win' }); } });
        if (c.kong) acts.push({ id: 'kong-' + c.tile, label: 'Kong', style: 'primary', fn: function () { resolveClaim({ type: 'kong' }); } });
        if (c.pung) acts.push({ id: 'pung', label: 'Pung', style: 'primary', fn: function () { resolveClaim({ type: 'pung' }); } });
        c.chows.forEach(function (pair) {
          var seq = E.sortTiles(pair.concat([c.tile])).map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
          acts.push({ id: 'chow-' + seq, label: 'Chow ' + seq, style: 'primary', fn: function () { resolveClaim({ type: 'chow', tiles: pair }); } });
        });
        acts.push({ id: 'pass', label: 'Pass', style: 'white', fn: function () { resolveClaim({ type: 'pass' }); } });
      }
      if (!acts.length) { setButtonsOverName(false); return; }
      var h = 38;
      var gap = 8;
      // When claiming, show the tile that is up for grabs beside the buttons.
      var claimTile = ui.claimPrompt ? ui.claimPrompt.opts.tile : null;
      var ctw = claimTile ? Math.min(30, (L.actionsH - 4) / TILE_ASPECT) : 0;
      var lead = claimTile ? ctw + 10 : 0;
      var x0 = L.meX + L.pad, x1 = L.meX + L.meW - L.pad, rowY = L.actionsY;
      var free = ui.meRowFree;
      var cover = null;
      if (L.actionsInRow && free) {
        if (free.x1 - free.x0 - lead >= acts.length * (60 + gap)) { x0 = free.x0; x1 = free.x1; }
        else if (L.meX + L.meW - L.pad - free.x0 - lead >= acts.length * (60 + gap)) {
          // Not enough room beside your name: use the rest of the row and
          // cover the name while the buttons are up.
          x0 = free.x0; x1 = L.meX + L.meW - L.pad;
          cover = { x: free.x1, w: x1 - free.x1 };
        } else {
          // Still too many (lots of melds and chow choices): float them over the coach's bar.
          // Phones have no bar, so the buttons sit just above the meld row.
          rowY = L.hintH >= L.actionsH ? L.hintY + (L.hintH - L.actionsH) / 2 : L.meY - L.actionsH - 4;
        }
      }
      setButtonsOverName(!!cover);
      rowY -= ACTIONS_LIFT;
      var maxW = x1 - x0 - lead;
      ctx.font = 'bold 15px ' + FONT_BODY;
      var labelW = acts.reduce(function (m, a) { return Math.max(m, ctx.measureText(a.label).width + 28); }, 0);
      var bw = clamp((maxW - gap * (acts.length - 1)) / acts.length, 60, Math.max(150, Math.min(260, labelW)));
      var total = acts.length * bw + (acts.length - 1) * gap;
      var x = x0 + (x1 - x0 - total - lead) / 2 + lead;
      var y = rowY + (L.actionsH - h) / 2;
      if (claimTile) {
        drawTile(claimTile, x - lead, rowY + (L.actionsH - ctw * TILE_ASPECT) / 2, ctw, { glow: COLORS.red });
      }
      var hintDecision = ui.coach === 'on' && ui.hint && ui.hint.decision;
      acts.forEach(function (a, i) {
        var id = a.id || ('act-' + i);
        var recommended = hintDecision && labelMatches(a.label, hintDecision);
        button(a.label, x + i * (bw + gap), y, bw, h, a.fn, a.style, id, recommended);
      });
    }

    function winButtonLabel(win) {
      var selfDraw = win.items && win.items.some(function (it) { return it.name === 'Self-Draw'; });
      return 'Win · ' + (selfDraw ? 'self-draw · ' : '') + win.faan + ' faan';
    }

    function labelMatches(label, decision) {
      var l = label.toLowerCase();
      if (decision.type === 'chow') {
        var seq = E.sortTiles(decision.tiles.concat([ui.claimPrompt.opts.tile])).map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
        return l === 'chow ' + seq;
      }
      return l.indexOf(decision.type) === 0;
    }

    function shortName(id) {
      var i = E.tileIndex(id);
      if (E.isHonorIndex(i)) return E.tileName(id).replace(' Wind', '').replace(' Dragon', '');
      return E.rankOfIndex(i) + ' ' + { c: 'Char', d: 'Circ', b: 'Bam' }[E.suitOfIndex(i)];
    }

    function drawFlights() {
      flights.forEach(function (f) {
        if (f.flip) {
          // Turns face up halfway through the flight.
          var up = f.p >= 0.5;
          drawTile(up ? f.id : null, f.x, f.y, f.w, { back: !up, rot: f.rot || 0, scaleX: Math.abs(1 - 2 * f.p) });
        } else {
          drawTile(f.id, f.x, f.y, f.w, { back: f.back, rot: f.rot || 0, glow: f.glow });
        }
      });
    }

    function drawBanners(t) {
      banners.forEach(function (b) {
        var p = clamp((t - b.start) / b.dur, 0, 1);
        var scale = p < 0.18 ? easeBack(p / 0.18) : 1;
        var alpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(b.x, b.y);
        if (b.rot) ctx.rotate(b.rot);
        ctx.scale(scale, scale);
        var size = b.size || 30;
        ctx.font = size + 'px ' + FONT_HEAD;
        var tw = ctx.measureText(b.text).width;
        var bw = tw + size * 1.2, bh = size * 1.5;
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
        ctx.fillStyle = b.color || COLORS.red;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = COLORS.goldLight;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Center the letters (by cap height) in the pill; a fixed offset sits
        // off-center because the heading font's line box isn't symmetric.
        ctx.font = size + 'px ' + FONT_HEAD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic'; // set before measuring: the metrics depend on it
        // The height of the letters above the baseline (descenders aren't counted).
        var rise = ctx.measureText(b.text).actualBoundingBoxAscent || size * 0.7;
        ctx.fillStyle = b.textColor || COLORS.white;
        ctx.fillText(b.text, 0, rise / 2);
        if (b.sub) text(b.sub, 0, bh / 2 + 14, { size: 14, weight: 'bold', align: 'center', color: COLORS.cream });
        ctx.restore();
      });
    }

    function drawParticles(t) {
      particles.forEach(function (p) {
        var age = (t - p.born) / 1000;
        var x = p.x + p.vx * age;
        var y = p.y + p.vy * age + 420 * age * age;
        ctx.save();
        ctx.globalAlpha = clamp(1 - (t - p.born) / p.life, 0, 1);
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.spin * age);
        ctx.fillStyle = p.color;
        if (p.coin) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.s, p.s * Math.abs(Math.cos(p.spin * age)), 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        }
        ctx.restore();
      });
    }

    /* ---------------- overlays (summary, menu, game over) ---------------- */

    function panelRect(maxW, wantH) {
      var w = Math.min(maxW, W - 24);
      var h = Math.min(wantH, H - 24);
      return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
    }

    function drawPanelBg(r, noDim) {
      if (!noDim) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 30;
      roundRect(ctx, r.x, r.y, r.w, r.h, 18);
      ctx.fillStyle = COLORS.cream;
      ctx.fill();
      ctx.restore();
    }

    function drawOverlay(t) {
      var o = ui.overlay;
      if (o.type === 'summary') drawSummary(o);
      else if (o.type === 'menu') drawMenu();
      else if (o.type === 'gameover') drawGameOver();
    }

    // Winning hand as one row: melds, then concealed tiles, small gaps between groups.
    function summaryHandItems(res) {
      var all = [];
      res.melds.forEach(function (m) {
        if (all.length) all.push({ gap: true });
        meldTiles(m, true).forEach(function (it) { all.push(it); });
      });
      if (res.concealed.length) {
        if (all.length) all.push({ gap: true });
        var marked = false;
        res.concealed.forEach(function (id) {
          var win = !marked && res.tile === id;
          if (win) marked = true;
          all.push({ id: id, glow: win ? COLORS.gold : null, win: win });
        });
      }
      return all;
    }

    function sectionLabel(str, x, y) {
      text(str.toUpperCase(), x, y, { size: 11, weight: 'bold', color: COLORS.muted });
    }

    function drawSummary(o) {
      var res = o.result;
      var isWin = res.type === 'win';
      var showPay = isWin && settings.mode !== 'practice';
      var items = isWin ? res.score.items : [];
      var hand = isWin ? summaryHandItems(res) : [];
      var flowers = isWin ? res.flowers : [];
      var units = hand.reduce(function (n, it) { return n + (it.gap ? 0.3 : 1); }, 0);
      var tileCount = hand.filter(function (it) { return !it.gap; }).length;

      var wide = W >= 680 && showPay;
      var maxW = wide ? 720 : 560;
      var pw = Math.min(maxW, W - 24);
      var pad = pw < 400 ? 16 : 24;
      var w = pw - 2 * pad;
      var colGap = 28;
      var colW = wide ? (w - colGap) / 2 : w;

      // Pick the roomiest spacing that fits the screen.
      var lay;
      [{ rh: 26, tw: 40 }, { rh: 22, tw: 32 }, { rh: 19, tw: 26 }, { rh: 17, tw: 22 }].some(function (c) {
        var tw = isWin ? clamp((w - 24 - Math.max(0, tileCount - 1) * TILE_GAP) / Math.max(units, 1), 14, c.tw) : 0;
        var fw = tw; // bonus tiles match the hand
        var handH = isWin ? tw * TILE_ASPECT + 26 : 0;
        var flowerH = flowers.length ? fw * TILE_ASPECT + 14 : 0;
        var patH = isWin ? 24 + items.length * c.rh + 12 + 26 : 0;
        var payH = showPay ? 24 + 22 + 4 * c.rh : 0;
        var bodyH = wide ? Math.max(patH, payH) : patH + (payH ? payH + 18 : 0);
        var h = 24 + 30 + 22 + (isWin ? 14 : 0) + handH + flowerH + (isWin ? 18 : 0) + bodyH + (o.extra ? 28 : 0) + 78;
        lay = { rh: c.rh, tw: tw, fw: fw, h: h };
        return h <= H - 24;
      });

      // Very short screens (landscape phones) shrink the whole panel to fit.
      var k = Math.min(1, (H - 24) / lay.h);
      var r = { x: (W - pw) / 2, y: (H - lay.h) / 2, w: pw, h: lay.h };
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -H / 2);
      drawPanelBg(r, true);
      var x = r.x + pad;
      var cx = r.x + r.w / 2;
      var y = r.y + 24 + 15;

      var title, sub;
      if (isWin) {
        var who = res.winner === 0 ? 'You win' : game.players[res.winner].name + ' wins';
        title = who + (res.how === 'selfDraw' ? ' by self-draw!' : res.how === 'robKong' ? ' by robbing the kong!' : res.how === 'flowers' ? ' with flowers!' : '!');
        if (res.how === 'discard' || res.how === 'robKong') {
          sub = (res.payer === 0 ? 'You' : game.players[res.payer].name) + ' discarded the winning tile.';
        } else {
          sub = E.WIND_NAMES[res.seatWind] + ' seat · ' + E.WIND_NAMES[res.round] + ' round';
        }
      } else {
        title = 'Draw game';
        sub = 'The wall ran out with no winner. The deal passes to the next player.';
      }
      text(title, cx, y, { size: fitFont(ctx, title, w, 26, FONT_HEAD), family: FONT_HEAD, align: 'center', color: COLORS.red });
      y += 15 + 18;
      text(sub, cx, y, { size: fitFont(ctx, sub, w, 13, FONT_BODY), align: 'center', color: COLORS.muted });
      y += 11 + 14;

      if (isWin) {
        // The hand sits on its own felt strip; the winning tile gets a gold caret.
        var tw = lay.tw, th = tw * TILE_ASPECT;
        var stripH = th + 26;
        roundRect(ctx, x, y, w, stripH, 12);
        ctx.fillStyle = COLORS.felt;
        ctx.fill();
        var span = 0;
        hand.forEach(function (it) { span += it.gap ? tw * 0.3 : tw + TILE_GAP; });
        if (tileCount) span -= TILE_GAP;
        var hx = cx - span / 2;
        var ty = y + 10;
        hand.forEach(function (it) {
          if (it.gap) { hx += tw * 0.3; return; }
          drawTile(it.id, hx, ty, tw, { back: it.back, shadow: false, glow: it.glow });
          if (it.win) {
            ctx.beginPath();
            ctx.moveTo(hx + tw / 2 - 5, ty + th + 11);
            ctx.lineTo(hx + tw / 2 + 5, ty + th + 11);
            ctx.lineTo(hx + tw / 2, ty + th + 5);
            ctx.closePath();
            ctx.fillStyle = COLORS.gold;
            ctx.fill();
          }
          hx += tw + TILE_GAP;
        });
        y += stripH;

        if (flowers.length) {
          // Flowers and seasons get their own labelled row. The seat's own
          // flower or season glows, and so does every tile in a full set of four.
          var fw = lay.fw, fh = fw * TILE_ASPECT;
          y += 14;
          var fy = y;
          sectionLabel('Flowers & seasons', x, fy + fh / 2);
          ctx.font = 'bold 11px ' + FONT_BODY;
          var fx = Math.min(x + ctx.measureText('FLOWERS & SEASONS').width + 16, x + w - flowers.length * (fw + TILE_GAP) + TILE_GAP);
          flowers.forEach(function (f) {
            drawTile(f, fx, fy, fw, { shadow: false, glow: flowerGlow(flowers, res.seatWind, f) });
            fx += fw + TILE_GAP;
          });
          y += fh;
        }
        y += 18;

        var rh = lay.rh;
        var colX = x;
        var top = y;
        // Patterns and faan.
        sectionLabel('Patterns', colX, y + 6);
        y += 24;
        items.forEach(function (it, i) {
          if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.035)';
            roundRect(ctx, colX - 8, y, colW + 16, rh, 6);
            ctx.fill();
          }
          var my = y + rh / 2;
          var faanLabel = it.faan >= 13 ? 'Limit' : it.faan + ' faan';
          ctx.font = 'bold 15px ' + FONT_BODY;
          var faanW = ctx.measureText(faanLabel).width + 12;
          var ns = fitFont(ctx, it.name, colW - faanW - 40, 15, FONT_BODY);
          text(it.name, colX, my, { size: ns, color: COLORS.ink });
          ctx.font = ns + 'px ' + FONT_BODY;
          text(faanLabel, colX + colW, my, { size: 15, weight: 'bold', align: 'right', color: it.faan ? COLORS.ink : COLORS.muted });
          y += rh;
        });
        y += 6;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(colX, y, colW, 1);
        y += 6;
        var totalLabel = res.score.faan >= 13 ? res.score.faan + ' faan · limit' : res.score.faan + ' faan';
        text('Total', colX, y + 13, { size: 17, weight: 'bold', color: COLORS.ink });
        text(totalLabel, colX + colW, y + 13, { size: 17, weight: 'bold', align: 'right', color: COLORS.red });
        y += 26;
        var bottom = y;

        if (showPay) {
          if (wide) { colX = x + colW + colGap; y = top; } else { y += 18; }
          sectionLabel('Payout · ' + (settings.spicy === 'half' ? 'half spicy' : 'full spicy'), colX, y + 6);
          y += 24;
          var base = res.score.points;
          var how = res.payer === null || res.payer === undefined
            ? 'Self-draw: everyone pays ' + fmt(base)
            : (res.payer === 0 ? 'You pay ' : game.players[res.payer].name + ' pays ') + fmt(base);
          text(how, colX, y + 7, { size: fitFont(ctx, how, colW, 13, FONT_BODY), color: COLORS.muted });
          y += 22;
          for (var p = 0; p < 4; p++) {
            var d = res.deltas[p];
            var my2 = y + rh / 2;
            if (p === res.winner) {
              ctx.fillStyle = 'rgba(244,160,32,0.16)';
              roundRect(ctx, colX - 8, y, colW + 16, rh, 6);
              ctx.fill();
            }
            var name = (p === 0 ? 'You' : game.players[p].name);
            text(name, colX, my2, { size: fitFont(ctx, name, colW * 0.5, 15, FONT_BODY, p === 0 ? 'bold' : ''), weight: p === 0 ? 'bold' : '', color: COLORS.ink });
            text(signed(d), colX + colW * 0.7, my2, { size: 15, weight: 'bold', align: 'right', color: d > 0 ? COLORS.green : d < 0 ? COLORS.red : COLORS.muted });
            text(fmt(res.after[p]), colX + colW, my2, { size: 15, align: 'right', color: COLORS.muted });
            y += rh;
          }
          bottom = Math.max(bottom, y);
        }
        y = bottom;
      }
      if (o.extra) {
        var ey = y + 18;
        text(o.extra, cx, ey, { size: fitFont(ctx, o.extra, w, 13, FONT_BODY), align: 'center', color: COLORS.muted });
      }
      var label = settings.lesson ? 'Done' : (game.over ? 'See results' : 'Next hand');
      var firstRegion = regions.length;
      var gap = 12;
      var handsW = 140;
      var nextW = 156;
      var row = handsW + gap + nextW;
      if (row > w) {
        handsW = Math.floor(handsW * w / row);
        nextW = Math.floor(nextW * w / row);
        row = handsW + gap + nextW;
      }
      var bx = cx - row / 2;
      var by = r.y + r.h - 62;
      // Show hands leaves this panel without dealing. Next hand is the only way on.
      button('Show hands', bx, by, handsW, 42, showHands, 'white', 'show-hands');
      button(label, bx + handsW + gap, by, nextW, 42, nextHand, 'primary', 'next');
      ctx.restore();
      regions.slice(firstRegion).forEach(function (g) {
        g.x = W / 2 + (g.x - W / 2) * k;
        g.y = H / 2 + (g.y - H / 2) * k;
        g.w *= k;
        g.h *= k;
      });
    }


    function drawMenu() {
      var r = panelRect(340, 286);
      drawPanelBg(r);
      text('Paused', r.x + r.w / 2, r.y + 36, { size: 24, family: FONT_HEAD, align: 'center', color: COLORS.red });
      var bx = r.x + 30, bw = r.w - 60, y = r.y + 62, step = 50;
      button('Resume', bx, y, bw, 40, function () { closeOverlay(); }, 'primary', 'm-resume'); y += step;
      var armed = ui.restartArmed && now() - ui.restartArmed < 5000;
      button(armed ? 'Tap again to restart' : 'Restart game', bx, y, bw, 40, restartGame, armed ? 'gold' : 'white', 'm-restart'); y += step;
      button('Quit game', bx, y, bw, 40, function () { quit(); }, 'white', 'm-quit');
      // Mode and version, with a Beta badge.
      var line = (settings.lesson ? 'Learn to play' : settings.mode === 'practice' ? 'Practice mode' : 'Full game') + ' · v' + E.GAME_VERSION;
      ctx.font = '12px ' + FONT_BODY;
      var lineW = ctx.measureText(line).width;
      ctx.font = 'bold 10px ' + FONT_BODY;
      var badgeW = ctx.measureText('BETA').width + 12, badgeH = 16;
      var lx = r.x + (r.w - lineW - 6 - badgeW) / 2, ly = r.y + r.h - 48;
      text(line, lx, ly, { size: 12, color: COLORS.muted });
      pill(lx + lineW + 6, ly - badgeH / 2, badgeW, badgeH, COLORS.red);
      text('BETA', lx + lineW + 6 + badgeW / 2, ly + 1, { size: 10, weight: 'bold', align: 'center', color: COLORS.white });
      text('Built by Jorge Yau, developer, mahjong instructor', r.x + r.w / 2, r.y + r.h - 22, { size: 12, align: 'center', color: COLORS.muted });
    }

    /* ---------------- saving and loading ---------------- */

    // A save holds no hidden tiles: the game as the hand began, the hand's
    // seed and your moves (MahjongEngine.gameRecord), plus the table's own
    // strategies, stats and coach history. It is signed, and resuming deals
    // the hand from its seed and plays it again up to your next move.
    function savePayload() {
      return {
        savedAt: new Date().toISOString(),
        game: E.gameRecord(game),
        strategies: ui.strategies,
        stats: ui.stats,
        coachLog: ui.coachLog || [],
      };
    }

    // Keeps the game in local storage as it goes (AUTOSAVE_KEY): after the
    // events of each move, at the start of each hand and between hands.
    // Not while a loaded hand is being played again.
    var autosaveTimer = null;
    function autosave() {
      if (settings.lesson) return;
      if (!game || ui.replaying || destroyed) return;
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(function () {
        if (!game || ui.replaying || destroyed) return;
        E.makeSave(savePayload()).then(function (data) {
          if (!destroyed) writeJson(AUTOSAVE_KEY, data);
        }, function () {});
      }, 250);
    }

    // Restarting throws the match away, so it takes a second tap.
    function restartGame() {
      if (ui.restartArmed && now() - ui.restartArmed < 5000) {
        ui.restartArmed = 0;
        track('play_restart', {});
        callbacks.restart();
        return;
      }
      ui.restartArmed = now();
      requestRender();
      setTimeout(function () { if (!destroyed) requestRender(); }, 5100);
    }

    function saveSetting(key, value) {
      settings[key] = value;
      var saved = readJson(SETTINGS_KEY, {});
      saved[key] = value;
      writeJson(SETTINGS_KEY, saved);
    }

    function drawGameOver() {
      var r = panelRect(440, 420);
      drawPanelBg(r);
      var st = ui.stats;
      var standings = E.finalStandings(game);
      var mine = standings.filter(function (row) { return row.seat === 0; })[0];
      var shared = standings.filter(function (row) { return row.place === mine.place; }).length > 1;
      var place = ['1st', '2nd', '3rd', '4th'][mine.place - 1];
      text('Game over', r.x + r.w / 2, r.y + 40, { size: 28, family: FONT_HEAD, align: 'center', color: COLORS.red });
      text((shared ? 'You tied for ' : 'You finished ') + place + '.', r.x + r.w / 2, r.y + 72, { size: 15, align: 'center', color: COLORS.ink });
      var y = r.y + 106;
      standings.forEach(function (row) {
        var color = row.seat === 0 ? COLORS.red : COLORS.ink;
        text(row.place + '.  ' + row.name, r.x + 40, y, { size: 16, weight: 'bold', color: color });
        text(fmt(row.points), r.x + r.w - 40, y, { size: 16, weight: 'bold', align: 'right', color: color });
        y += 28;
      });
      y += 12;
      [
        ['Hands played', String(st.hands)],
        ['Hands you won', String(st.wins)],
        ['Times you dealt in', String(st.dealIns)],
        ['Your biggest hand', st.best ? st.best + ' faan' : '—'],
      ].forEach(function (l) {
        text(l[0], r.x + 40, y, { size: 14, color: COLORS.muted });
        text(l[1], r.x + r.w - 40, y, { size: 14, weight: 'bold', align: 'right', color: COLORS.ink });
        y += 24;
      });
      var bw = (r.w - 70) / 2;
      button('Play again', r.x + 25, r.y + r.h - 62, bw, 42, function () { callbacks.restart(); }, 'primary', 'go-again');
      button('Quit', r.x + 45 + bw, r.y + r.h - 62, bw, 42, function () { quit(); }, 'light', 'go-quit');
    }

    var overlayResolve = null;

    function showOverlay(o) {
      return new Promise(function (resolve) {
        ui.overlay = o;
        overlayResolve = resolve;
        requestRender();
      });
    }

    function closeOverlay() {
      var o = ui.overlay;
      var leavingSummary = o && o.type !== 'menu' && overlayResolve;
      ui.overlay = o && o.previous ? o.previous : null;
      if (leavingSummary) {
        ui.revealHands = false;
        ui.heldSummary = null;
      }
      requestRender();
      if (leavingSummary) {
        var r = overlayResolve;
        overlayResolve = null;
        r();
      }
    }

    // Look at the table with every hand face up. The next hand waits.
    function showHands() {
      var o = ui.overlay;
      if (!o || o.type !== 'summary') return;
      // Back from See results the hands are already face up, so no sound.
      var already = ui.revealHands;
      ui.heldSummary = o;
      ui.revealHands = true;
      ui.botLift = null;
      ui.overlay = null;
      if (!already) {
        sound.play('flip');
        announce('All four hands are face up.');
      }
      requestRender();
    }

    // Leaves the summary for the next deal, with the mining hit.
    function nextHand() {
      sound.play('next');
      closeOverlay();
    }

    function seeResults() {
      if (!ui.heldSummary || ui.overlay) return;
      ui.overlay = ui.heldSummary;
      requestRender();
    }

    // Where See results goes while the hands are face up: the coach's bar,
    // directly above your avatar. The column only when there is no bar
    // (a landscape phone). Beside your name when the coach is hidden.
    function seeResultsHome() {
      if (L.hintH) return 'bar';
      if (L.history) return 'column';
      return 'name';
    }

    // The button in the coach bar, centered on your avatar and kept inside the bar.
    function seeResultsBarPlace(box) {
      var bw = Math.min(SEE_RESULTS_W, box.w * 0.45);
      var bh = Math.min(36, Math.max(28, box.h - 16));
      var icon = ui.youIcon;
      var cx = icon ? icon.x + icon.s / 2 : box.x + box.w - 12 - bw / 2;
      var bx = clamp(cx - bw / 2, box.x + 8, box.x + box.w - 8 - bw);
      return { x: bx, y: box.y + (box.h - bh) / 2, w: bw, h: bh };
    }

    // Whether your row is tall enough for See results under your name
    // (header 4 + 22, a 6 gap, and a 30-36 button); phones put it beside.
    function seeResultsUnder() {
      return L.meldRowH - 32 >= 30;
    }

    function drawSeeResults() {
      if (!ui.revealHands || ui.overlay) return;
      var home = seeResultsHome();
      var bw = SEE_RESULTS_W;
      if (home === 'column') {
        var col = L.history;
        bw = Math.min(bw, col.w - 24);
        button('See results', col.x + col.w - 10 - bw, col.y + 5, bw, 28, seeResults, 'primary', 'see-results', true);
        return;
      }
      if (home === 'bar' && ui.coachBox) {
        var place = seeResultsBarPlace(ui.coachBox);
        button('See results', place.x, place.y, place.w, place.h, seeResults, 'primary', 'see-results', true);
        return;
      }
      var head = ui.youHeader;
      if (!head) return;
      var gap = 6;
      // Under your name, right-aligned with it. A short row (phones) has no
      // room under it, so it sits just left of your name instead.
      var top = head.y + 22 + gap;
      var room = L.meY + L.meldRowH - top;
      if (seeResultsUnder()) {
        button('See results', head.right - bw, top, bw, Math.min(36, room), seeResults, 'primary', 'see-results', true);
      } else {
        button('See results', head.x - gap - bw, head.y + 11 - 15, bw, 30, seeResults, 'primary', 'see-results', true);
      }
    }

    function openMenu() {
      if (ui.overlay && ui.overlay.type === 'menu') { closeOverlay(); return; }
      ui.overlay = { type: 'menu', previous: ui.overlay };
      requestRender();
    }

    function cycleCoach() {
      if (settings.lesson) return;
      var next = COACH_ORDER[(COACH_ORDER.indexOf(ui.coach) + 1) % COACH_ORDER.length];
      ui.coach = next;
      saveSetting('coach', next);
      refreshHint();
      L = computeLayout(); // phones show or hide the coach's bar or column
      requestRender();
      track('play_set_coach', { coach: next });
    }

    function toggleSound() {
      var next = SOUND_ORDER[(SOUND_ORDER.indexOf(soundMode()) + 1) % SOUND_ORDER.length];
      sound.enabled = next !== 'off';
      sound.musicEnabled = sound.enabled;
      writeJson(PREFS_KEY, { sound: sound.enabled, music: sound.enabled });
      sound.music(true); // plays or pauses to match
      if (sound.enabled) sound.play('select');
      requestRender();
      track('play_set_sound', { sound: next });
    }

    function quit() {
      callbacks.quit();
    }

    /* ---------------- human input ---------------- */

    function tapHandTile(idx) {
      if (!ui.turnPrompt) return;
      if (ui.selected === idx) {
        discardSelected();
        return;
      }
      ui.selected = idx;
      sound.play('select');
      var picked = myHandOrder().tiles[idx];
      if (picked && ui.coach === 'on' && ui.hint && ui.hint.candidates) {
        var cand = ui.hint.candidates.filter(function (c) { return c.tile === picked; })[0];
        var top = ui.hint.candidates[0];
        if (cand && cand.tile !== top.tile) {
          ui.notice = noteForChoice(cand, top);
        } else {
          ui.notice = null;
        }
      }
      requestRender();
    }

    function noteForChoice(cand, top) {
      if (cand.shanten > top.shanten) return E.tileName(cand.tile) + ' takes you further from winning.';
      return E.tileName(cand.tile) + ' is OK, but ' + E.tileName(top.tile) + ' is better.';
    }

    function discardSelected(fromButton) {
      if (!ui.turnPrompt || ui.selected < 0) return;
      var tile = myHandOrder().tiles[ui.selected];
      if (!tile) return;
      var rect = ui.lastHandRects[ui.selected];
      ui.discardFrom = rect ? { x: rect.x, y: rect.y, w: rect.w, rot: 0 } : null;
      var target = fromButton ? { kind: 'button', key: 'discard' } : { kind: 'tile', index: ui.selected };
      resolveTurn({ type: 'discard', tile: tile }, target);
    }

    // The lesson plays one fixed hand. A refused click shakes that tile or button.
    function lessonTarget(decision, target) {
      if (target) return { kind: target.kind, key: target.key != null ? target.key : target.index };
      if (decision.type === 'discard') return { kind: 'tile', index: ui.selected };
      if (decision.type === 'chow' && ui.claimPrompt) {
        var seq = E.sortTiles(decision.tiles.concat([ui.claimPrompt.opts.tile])).map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
        return { kind: 'button', key: 'chow-' + seq };
      }
      if (decision.type === 'kong') return { kind: 'button', key: 'kong-' + decision.tile };
      return { kind: 'button', key: decision.type };
    }

    function lessonAllows(kind, decision, target) {
      if (!settings.lesson) return true;
      if (Lesson.accept(game, 0, kind, decision)) return true;
      var where = lessonTarget(decision, target);
      ui.shake = { kind: where.kind, key: where.key, start: now() };
      requestRender();
      return false;
    }

    function resolveTurn(action, target) {
      var p = ui.turnPrompt;
      if (!p) return;
      if (!lessonAllows('turn', action, target)) return;
      // Training mode: judge the move against what the coach would have done.
      if (ui.coach === 'feedback' && ui.hint && action.type === 'discard') {
        ui.feedback = Coach.discardFeedback(ui.hint, action.tile) || ui.feedback;
        rememberCoach(ui.feedback, 'feedback');
      }
      ui.turnPrompt = null;
      ui.selected = -1;
      ui.hint = null;
      ui.notice = null;
      requestRender();
      p.resolve(action);
    }

    function resolveClaim(decision) {
      var p = ui.claimPrompt;
      if (!p) return;
      if (!lessonAllows('claim', decision)) return;
      if (ui.coach === 'feedback' && ui.hint) {
        ui.feedback = Coach.claimFeedback(ui.hint, decision) || ui.feedback;
        rememberCoach(ui.feedback, 'feedback');
      }
      ui.claimPrompt = null;
      ui.hint = null;
      ui.notice = null;
      requestRender();
      p.resolve(decision);
    }

    function refreshHint() {
      if (settings.lesson && game && game.hand) {
        ui.coach = 'on';
        ui.hint = Lesson.hint(game);
        if (ui.hint) rememberCoach(ui.hint, 'hint');
        return;
      }
      // In Feedback mode the advice is worked out (to judge your move) but not shown.
      if (ui.coach === 'off' || !game || !game.hand) { ui.hint = null; return; }
      var coach = coachFor();
      if (ui.turnPrompt) ui.hint = coach.turnHint(game, 0, ui.turnPrompt.opts);
      else if (ui.claimPrompt) ui.hint = coach.claimHint(game, 0, ui.claimPrompt.opts);
      if (ui.coach === 'on') rememberCoach(ui.hint, 'hint');
    }

    function hitTest(x, y) {
      for (var i = regions.length - 1; i >= 0; i--) {
        var r = regions[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
      }
      return null;
    }

    function pointerPos(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    }

    function historyAt(p) {
      var r = L && L.history;
      if (!r || !p) return false;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    }

    function scrollHistory(next) {
      ui.coachScroll = clamp(next, 0, ui.coachScrollMax);
      ui.coachStick = ui.coachScroll >= ui.coachScrollMax - 12;
      requestRender();
    }

    function onWheel(e) {
      if (!historyAt(pointerPos(e)) || ui.coachScrollMax <= 0) return;
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      scrollHistory(ui.coachScroll + dy);
    }

    function seeResultsHit(p) {
      if (!p || !ui.revealHands || ui.overlay) return null;
      var r = hitTest(p.x, p.y);
      return r && r.id === 'see-results' ? r : null;
    }

    function onPointerDown(e) {
      lastTouch = !!e.pointerType && e.pointerType !== 'mouse';
      var p = pointerPos(e);
      var see = seeResultsHit(p);
      if (see) {
        e.preventDefault();
        see.onTap();
        return;
      }
      if (historyAt(p)) {
        if (ui.coachScrollMax > 0) {
          historyDrag = { y: p.y, scroll: ui.coachScroll, id: e.pointerId };
          if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
        return;
      }
      var r = hitTest(p.x, p.y);
      if (!r) {
        if (ui.selected >= 0 && !ui.overlay) { ui.selected = -1; ui.notice = null; requestRender(); }
        return;
      }
      e.preventDefault();
      r.onTap();
    }

    function onPointerMove(e) {
      if (historyDrag && e.pointerId === historyDrag.id) {
        var dragged = pointerPos(e);
        scrollHistory(historyDrag.scroll + (historyDrag.y - dragged.y));
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var p = pointerPos(e);
      if (historyAt(p) && !seeResultsHit(p)) {
        canvas.style.cursor = ui.coachScrollMax > 0 ? 'grab' : 'default';
        mouse = p;
        if (hover || tipSeat !== null) { hover = null; requestRender(); }
        return;
      }
      var r = hitTest(p.x, p.y);
      var id = r ? r.id : null;
      canvas.style.cursor = r && !r.plain ? 'pointer' : 'default';
      mouse = p;
      var sp = spotAt(p);
      var seatSp = seatSpotAt(p);
      if (id !== hover || (sp ? sp.id : null) !== tipTile || (seatSp ? seatSp.seat : null) !== tipSeat) { hover = id; requestRender(); }
    }

    function onPointerUp(e) {
      if (historyDrag && e.pointerId === historyDrag.id) historyDrag = null;
    }

    function onPointerLeave() {
      mouse = null;
      if (tipTile || hover || tipSeat !== null) { hover = null; requestRender(); }
    }

    function onKey(e) {
      if (destroyed) return;
      if (rulesOpen() || strategiesOpen()) return; // the sheets handle their own keys (Escape closes them)
      if (e.key === 'Escape') { openMenu(); e.preventDefault(); return; }
      if (ui.overlay) {
        if (e.key === 'Enter' && ui.overlay.type === 'summary') { nextHand(); e.preventDefault(); }
        return;
      }
      if (ui.revealHands) {
        if (e.key === 'Enter' || e.key === ' ') { seeResults(); e.preventDefault(); }
        return;
      }
      if (ui.turnPrompt) {
        var n = myHandOrder().tiles.length;
        if (e.key === 'ArrowLeft') { ui.selected = ui.selected <= 0 ? n - 1 : ui.selected - 1; requestRender(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { ui.selected = (ui.selected + 1) % n; requestRender(); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') {
          if (ui.selected >= 0) discardSelected();
          else if (ui.turnPrompt.opts.win) resolveTurn({ type: 'win' });
          e.preventDefault();
        }
      } else if (ui.claimPrompt) {
        if (e.key === 'Enter' && ui.claimPrompt.opts.win) { resolveClaim({ type: 'win' }); e.preventDefault(); }
        else if (e.key === 'Escape' || e.key === 'p' || e.key === ' ') { resolveClaim({ type: 'pass' }); e.preventDefault(); }
      }
    }

    /* ---------------- animation helpers ---------------- */

    // Where a just-claimed discard was sitting. Claiming removes it from the
    // pond, so its old slot is the one just past the tiles still showing.
    function claimedDiscardPose(seat) {
      var list = game.hand.seats[seat].discards.filter(function (d) { return !d.claimed; });
      return pondPose(seat, list.length);
    }

    // Where that tile belongs once it joins the hand: sorted into yours,
    // or at the end of an opponent's concealed row.
    function winningHandPose(seat, tile) {
      if (seat === 0) {
        var tiles = E.sortTiles(game.hand.seats[0].hand.concat([tile]));
        var spot = handPositions(tiles.length)[tiles.lastIndexOf(tile)];
        return { x: spot.x, y: spot.y, w: L.tw, rot: 0 };
      }
      return ui.backAnchor[seat] || seatAnchor(seat);
    }

    function seatAnchor(seat) {
      if (seat === 0) {
        return { x: L.meX + L.meW / 2 - L.tw / 2, y: L.handY, w: L.tw, rot: 0 };
      }
      var a = ui.backAnchor[seat];
      if (a) return a;
      var r = L.opp[seat];
      return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: 16, rot: SEAT_ANGLE[seat] };
    }

    // Shortest turn from one rotation to another.
    function turnBetween(a, b) {
      var d = b - a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    }

    function fly(id, from, to, dur, opts) {
      opts = opts || {};
      var r0 = from.rot || 0;
      var dr = turnBetween(r0, to.rot || 0);
      var f = { id: id, back: !!opts.back, flip: !!opts.flip, glow: opts.glow || null, p: 0, x: from.x, y: from.y, w: from.w, rot: r0 };
      flights.push(f);
      var arc = opts.arc !== undefined ? opts.arc : 30;
      return animate(dur, function (p) {
        f.x = from.x + (to.x - from.x) * p;
        f.y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * arc;
        f.w = from.w + (to.w - from.w) * p;
        f.rot = r0 + dr * p;
        f.p = p;
      }, easeInOut).then(function () {
        flights.splice(flights.indexOf(f), 1);
      });
    }

    // Shrinks a banner so it fits `maxW` (its pill is the text plus 1.2 em).
    function shrinkBanner(textStr, size, maxW, maxH) {
      if (!maxW && !maxH) return size;
      for (; size > 10; size--) {
        ctx.font = size + 'px ' + FONT_HEAD;
        var fitsW = !maxW || ctx.measureText(textStr).width + size * 1.2 <= maxW;
        var fitsH = !maxH || size * 1.5 <= maxH;
        if (fitsW && fitsH) break;
      }
      return size;
    }

    function banner(textStr, x, y, opts) {
      opts = opts || {};
      var fitted = shrinkBanner(textStr, opts.size || 30, opts.maxW, opts.maxH);
      if (opts.span) {
        // Stay centered on x unless the pill would cover something at either end.
        ctx.font = fitted + 'px ' + FONT_HEAD;
        var half = (ctx.measureText(textStr).width + fitted * 1.2) / 2;
        x = Math.min(Math.max(x, opts.span[0] + half), opts.span[1] - half);
      }
      banners.push({
        text: textStr, sub: opts.sub, x: x, y: y, start: now(), dur: opts.dur || 1100,
        color: opts.color, textColor: opts.textColor, size: fitted, rot: opts.rot || 0,
      });
      requestRender();
    }

    // Where a declaration banner goes: the center of that player's exposed
    // row, both along the row and across it. Side players' banners face
    // them; the player across gets an upright one, so it reads the right
    // way up for you.
    function declarationPos(seat) {
      var pos = seatBannerPos(seat);
      if (seat === 2) pos.rot = 0;
      return pos;
    }

    function seatBannerPos(seat) {
      if (seat === 0) {
        // Centered on your hand. The name sits to the right of the meld row,
        // so the middle of that row is left of the tiles.
        return { x: L.meX + L.meW / 2, y: L.meY + L.mw * TILE_ASPECT / 2, rot: 0 };
      }
      var f = L.oppFrames[seat];
      var hand = ui.oppHand[seat];
      var localY = hand ? hand.meldY + hand.mw * TILE_ASPECT / 2 : f.h * 0.28;
      var mid = toScreen(f, f.w / 2, localY);
      return { x: mid.x, y: mid.y, rot: SEAT_ANGLE[seat] };
    }

    function confetti(cx, cy, n, coins) {
      var t = now();
      var palette = [COLORS.red, COLORS.gold, COLORS.goldLight, COLORS.green, '#ffffff'];
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
        var v = 260 + Math.random() * 420;
        particles.push({
          x: cx, y: cy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14,
          s: coins ? 5 + Math.random() * 4 : 6 + Math.random() * 7,
          color: coins ? (Math.random() < 0.7 ? COLORS.gold : COLORS.goldLight) : palette[i % palette.length],
          coin: !!coins, born: t, life: 1600 + Math.random() * 900,
        });
      }
      requestRender();
    }

    /* ---------------- engine events ---------------- */

    var handlers = {
      handStart: function () {
        ui.hide = { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null };
        ui.botDrawn = [false, false, false, false];
        ui.botLift = null;
        ui.winInHand = null;
        ui.turnSeat = null;
        ui.selected = -1;
        ui.notice = null;
        ui.hint = null;
        ui.feedback = null;
        L = computeLayout();
        announce('Hand ' + game.handNumber + '. ' + (game.dealer === 0 ? 'You are' : game.players[game.dealer].name + ' is') + ' the dealer.');
        requestRender();
        return sleep(400);
      },
      turn: function (d) {
        ui.turnSeat = d.seat;
        requestRender();
      },
      draw: function (d) {
        sound.play('draw');
        var from = drawOrigin();
        if (d.seat === 0) {
          ui.hide.drawn = true;
          if (d.replacement) ui.hide.tile = d.tile;
          var order = myHandOrder();
          var n = order.tiles.length;
          var at = d.replacement ? order.tiles.lastIndexOf(d.tile) : n - 1;
          var spot = handPositions(n, d.replacement ? false : true)[at >= 0 ? at : n - 1] || { x: L.meX + L.meW / 2, y: L.handY };
          var to = { x: spot.x, y: spot.y, w: L.tw, rot: 0 };
          return fly(d.tile, from, to, 300, { arc: 20 }).then(function () {
            ui.hide.drawn = false;
            if (d.replacement) ui.hide.tile = null;
            requestRender();
          });
        }
        ui.hide.backs[d.seat] = 1;
        ui.botDrawn[d.seat] = false;
        var anchor = seatAnchor(d.seat);
        return fly(null, from, anchor, 300, { back: true, arc: 16 }).then(function () {
          ui.hide.backs[d.seat] = 0;
          ui.botDrawn[d.seat] = true;
          requestRender();
        });
      },
      flower: function (d) {
        sound.play('flower');
        var pos = declarationPos(d.seat);
        banner(d.seat === 0 ? 'Flower!' : 'Flower', pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, span: pos.span, maxH: pos.maxH, size: 24, color: COLORS.green, dur: 800 });
        announce((d.seat === 0 ? 'You' : game.players[d.seat].name) + ' reveals ' + E.tileName(d.tile) + '.');
        var to = ui.flowerAnchor[d.seat] || seatAnchor(d.seat);
        var from = seatAnchor(d.seat);
        ui.hide.flower[d.seat] = (ui.hide.flower[d.seat] || 0) + 1;
        return fly(d.tile, from, to, 280, { arc: 18 }).then(function () {
          ui.hide.flower[d.seat] = Math.max(0, (ui.hide.flower[d.seat] || 1) - 1);
          requestRender();
        });
      },
      discard: function (d) {
        var list = game.hand.seats[d.seat].discards.filter(function (x) { return !x.claimed; });
        if (list.length > L.maxDiscards - 1) L = computeLayout();
        var slot = pondPose(d.seat, list.length - 1);
        var bot = d.seat !== 0;
        var from = bot ? (ui.botDiscardFrom[d.seat] || seatAnchor(d.seat)) : (ui.discardFrom || seatAnchor(0));
        ui.discardFrom = null;
        ui.botDiscardFrom[d.seat] = null;
        ui.botDrawn[d.seat] = false;
        ui.botLift = null;
        ui.hide.pond[d.seat] = 1;
        announce((d.seat === 0 ? 'You discard ' : game.players[d.seat].name + ' discards ') + E.tileName(d.tile) + '.');
        // Bots reveal the tile as it leaves their hand.
        return fly(d.tile, from, slot, bot ? 380 : 260, { arc: 26, flip: bot }).then(function () {
          ui.hide.pond[d.seat] = 0;
          sound.play('discard');
          requestRender();
        });
      },
      claim: function (d) {
        sound.play(d.type); // chow, pung or kong, each its own sound
        var words = { chow: 'Chow!', pung: 'Pung!', kong: 'Kong!' };
        var pos = declarationPos(d.seat);
        banner(words[d.type], pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, span: pos.span, maxH: pos.maxH, size: 32 });
        var list = game.hand.seats[d.from].discards.filter(function (x) { return !x.claimed; });
        var from = pondPose(d.from, list.length);
        var to = ui.meldAnchor[d.seat] || seatAnchor(d.seat);
        ui.hide.meld[d.seat] = 1;
        ui.botDrawn[d.seat] = false;
        announce((d.seat === 0 ? 'You claim ' : game.players[d.seat].name + ' claims ') + E.tileName(d.tile) + ' for a ' + d.type + '.');
        return fly(d.tile, from, to, 320, { arc: 34 }).then(function () {
          ui.hide.meld[d.seat] = 0;
          requestRender();
          return sleep(380);
        });
      },
      kongAttempt: function () {
        // An added kong can still be robbed. No banner here: "Kong?" was flashing before "Kong!".
      },
      kong: function (d) {
        sound.play('kong');
        var pos = declarationPos(d.seat);
        banner('Kong!', pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, span: pos.span, maxH: pos.maxH, size: 32 });
        // An opponent's concealed kong stays hidden, from screen readers too.
        var hiddenKong = d.kind === 'concealed' && d.seat !== 0;
        announce((d.seat === 0 ? 'You declare' : game.players[d.seat].name + ' declares') +
          (hiddenKong ? ' a concealed kong.' : ' a ' + (d.kind === 'concealed' ? 'concealed ' : '') + 'kong of ' + E.tileName(d.tile) + '.'));
        return sleep(650);
      },
      win: function (res) {
        ui.turnPrompt = null;
        ui.claimPrompt = null;
        var celebrate = function () {
          var c = L.center;
          var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
          var label = res.how === 'selfDraw' ? 'Self-draw!' : 'Win!';
          if (res.how === 'flowers') label = 'Flower win!';
          var mine = res.winner === 0;
          banner(label, cx, cy, { size: 34, dur: 1700, color: mine ? COLORS.gold : COLORS.red, textColor: mine ? COLORS.ink : COLORS.white, sub: (mine ? 'You' : game.players[res.winner].name) + ' · ' + res.score.faan + ' faan' });
          sound.play('win');
          if (mine) {
            confetti(cx, cy, 140, false);
            confetti(cx, cy, 50, true);
          } else {
            confetti(cx, cy, 40, true);
          }
          announce((mine ? 'You win' : game.players[res.winner].name + ' wins') + ' with ' + res.score.faan + ' faan.');
          return sleep(1500);
        };
        // The winning discard leaves the pond and joins the winner's hand
        // before the banner. Self-draw already holds the tile.
        if (res.how !== 'discard' || !res.tile || res.payer == null) return celebrate();
        ui.winInHand = { seat: res.winner, tile: res.tile, landed: false };
        return fly(res.tile, claimedDiscardPose(res.payer), winningHandPose(res.winner, res.tile), 420, { arc: 36, glow: COLORS.gold }).then(function () {
          if (ui.winInHand) ui.winInHand.landed = true;
          requestRender();
          return celebrate();
        });
      },
      drawGame: function () {
        sound.play('drawgame');
        var c = L.center;
        banner('Draw', c.x + c.w / 2, c.y + c.h / 2, { size: 30, dur: 1400, color: COLORS.muted });
        announce('Draw game. The wall is empty.');
        return sleep(1200);
      },
    };

    var uiBridge = {
      emit: function (name, data) {
        if (destroyed) return new Promise(function () {});
        var h = handlers[name];
        var out = h ? h(data) : null;
        requestRender();
        autosave();
        return out || Promise.resolve();
      },
    };

    /* ---------------- agents ---------------- */

    // Where a bot keeps a tile: sorted hand, with a fresh draw at the end.
    function botHandIndex(seat, tile) {
      var hand = game.hand.seats[seat].hand;
      var drawn = ui.botDrawn[seat] ? game.hand.drawnTile : null;
      if (drawn && tile === drawn) return hand.length - 1;
      var rest = hand.slice();
      if (drawn) rest.splice(rest.lastIndexOf(drawn), 1);
      return E.sortTiles(rest).indexOf(tile);
    }

    // A bot plays whatever strategy its seat has now, so a change in the
    // Strategies sheet takes effect on its next move.
    function botFor(seat) {
      return Strategies.get(ui.strategies.seats[seat]).bot;
    }

    function botAgent() {
      return {
        turn: function (g, seat, opts) {
          var action = botFor(seat).chooseTurnAction(g, seat, opts);
          if (instantMode()) return Promise.resolve(action);
          var n = g.hand.seats[seat].hand.length;
          var think = 560 + Math.random() * 520;
          // Look over a couple of tiles, then lift the one to throw.
          var glance = function () {
            ui.botLift = { seat: seat, index: Math.floor(Math.random() * n) };
            requestRender();
            return sleep(think / 3);
          };
          return glance().then(glance).then(function () {
            if (action.type !== 'discard') {
              ui.botLift = null;
              return action;
            }
            var idx = botHandIndex(seat, action.tile);
            ui.botLift = { seat: seat, index: idx };
            requestRender();
            return sleep(think / 3).then(function () {
              var oh = ui.oppHand[seat];
              if (oh) ui.botDiscardFrom[seat] = localPose(oh.f, oh.backX(idx), oh.backsY - oh.bw * 0.38, oh.bw);
              return action;
            });
          });
        },
        claim: function (g, seat, opts) {
          var decision = botFor(seat).chooseClaim(g, seat, opts);
          if (instantMode()) return Promise.resolve(decision);
          return sleep(decision.type === 'pass' ? 50 : 420).then(function () { return decision; });
        },
      };
    }

    function lessonAgent() {
      return {
        turn: function (g, seat) {
          var action = Lesson.take(g, seat, 'turn');
          if (instantMode()) return Promise.resolve(action);
          return sleep(640).then(function () { return action; });
        },
        claim: function (g, seat) {
          var decision = Lesson.take(g, seat, 'claim');
          if (instantMode()) return Promise.resolve(decision);
          return sleep(420).then(function () { return decision; });
        },
      };
    }

    function humanAgent() {
      return {
        turn: function (g, seat, opts) {
          return new Promise(function (resolve) {
            ui.turnPrompt = { opts: opts, resolve: resolve };
            ui.selected = -1;
            refreshHint();
            var lessonLine = settings.lesson && ui.hint && ui.hint.action;
            ui.notice = lessonLine ? null : (opts.completeButShort
              ? 'Your hand is complete, but only ' + opts.completeButShort.faan + ' faan. You need ' + game.settings.minFaan + ' to win.'
              : (opts.win ? 'You can win by self-draw with ' + opts.win.faan + ' faan!' : null));
            sound.play('turn');
            announce(lessonLine || (opts.win ? 'You can win by self-draw. Press Win, or pick a tile to discard.' : 'Your turn. Pick a tile to discard.'));
            requestRender();
          });
        },
        claim: function (g, seat, opts) {
          return new Promise(function (resolve) {
            var highlight = [];
            if (opts.pung || opts.kong) highlight.push(opts.tile);
            opts.chows.forEach(function (p) { highlight = highlight.concat(p); });
            ui.claimPrompt = { opts: opts, resolve: resolve, highlight: highlight };
            refreshHint();
            var lessonLine = settings.lesson && ui.hint && ui.hint.action;
            ui.notice = lessonLine ? null : (opts.win
              ? 'You can win on ' + E.tileName(opts.tile) + ' for ' + opts.win.faan + ' faan!'
              : (opts.completeButShort ? E.tileName(opts.tile) + ' completes your hand, but only for ' + opts.completeButShort.faan + ' faan.' : 'Claim ' + E.tileName(opts.tile) + '?'));
            sound.play('turn');
            announce(lessonLine || ui.notice);
            requestRender();
          });
        },
      };
    }

    /* ---------------- game loop ---------------- */

    function recordStats(res) {
      var st = ui.stats;
      st.hands++;
      if (res.type === 'win' && res.winner === 0) {
        st.wins++;
        st.best = Math.max(st.best || 0, res.score.faan);
      }
      if (res.type === 'win' && res.payer === 0) st.dealIns++;
    }

    // The loaded hand has caught up: draw the table as it stands.
    function replayDone() {
      ui.replaying = false;
      ui.hide = { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null };
      ui.botDrawn = [false, false, false, false];
      // A seat with a tile too many is holding a fresh draw.
      game.hand.seats.forEach(function (s, k) { if (k && s.hand.length % 3 === 2) ui.botDrawn[k] = true; });
      ui.botLift = null;
      // The replay is silent, so this is whose turn it is now: their board glows.
      ui.turnSeat = game.hand.turn;
      L = computeLayout();
      announce('Game loaded. Hand ' + game.handNumber + '.');
      requestRender();
    }

    async function play() {
      await loadAssets();
      spriteCache = {};
      ui.coachScroll = 0;
      ui.coachStick = true;
      var replay = null;
      if (saved) {
        // A loaded game: the same players, strategies and coach history,
        // and the hand in progress dealt again and played up to your move.
        var p = saved.payload;
        game = E.restoreGame(p.game);
        ui.strategies = p.strategies;
        if (savedBeforeSwap(saved.version)) {
          ui.strategies = { seats: swapOldIds(p.strategies.seats), coach: swapOldIds([p.strategies.coach])[0] };
        }
        ui.stats = p.stats || ui.stats;
        ui.coachLog = p.coachLog || [];
        if (p.game.hand) {
          ui.replaying = true;
          replay = { seed: p.game.hand.seed, replay: p.game.hand.moves, onReplayEnd: replayDone };
        }
      } else {
        var created = { spicy: settings.spicy, mode: settings.mode };
        if (settings.lesson) created.dealer = 0;
        game = E.createGame(created);
        if (settings.lesson) {
          Lesson.prepare(game);
          ui.coach = 'on';
        }
        ui.strategies = pickStrategies();
        ui.coachLog = [];
      }
      var agents = settings.lesson
        ? [humanAgent(), lessonAgent(), lessonAgent(), lessonAgent()]
        : [humanAgent(), botAgent(), botAgent(), botAgent()];
      track(saved ? 'play_resume' : 'play_start', {
        spicy: settings.spicy, mode: settings.mode, coach: settings.coach,
        speed: settings.speed, coach_strategy: ui.strategies.coach,
        strategies: ui.strategies.seats.slice(1).join(','),
      });
      if (game.over) {
        ui.overlay = { type: 'gameover' };
        requestRender();
        return;
      }
      autosave();
      while (!destroyed) {
        var res = await E.runHand(game, agents, uiBridge, replay);
        replay = null;
        if (destroyed) return;
        recordStats(res);
        ui.turnSeat = null;
        track('play_hand_end', {
          result: res.type === 'draw' ? 'draw' : res.winner === 0 ? 'win' : 'loss',
          faan: res.type === 'win' ? res.score.faan : 0,
        });
        var extra = null;
        if (settings.lesson && res.type === 'win' && res.winner === 0) extra = 'You won a Half Flush on East Wind.';
        else if (res.roundAdvanced) extra = 'The round wind is now ' + E.WIND_NAMES[game.round] + '.';
        if (game.over) extra = 'That was the last deal of the game.';
        autosave(); // between hands: a refresh deals the next one
        await showOverlay({ type: 'summary', result: res, extra: extra });
        if (settings.lesson) {
          callbacks.quit();
          return;
        }
        if (game.over) {
          track('play_game_over', { hands: ui.stats.hands, wins: ui.stats.wins });
          ui.overlay = { type: 'gameover' };
          requestRender();
          return;
        }
      }
    }

    /* ---------------- lifecycle ---------------- */

    var onResize = function () { resize(); };
    root.addEventListener('resize', onResize);
    // The music pauses while the tab is in the background.
    var onVisibility = function () { sound.music(!document.hidden); };
    document.addEventListener('visibilitychange', onVisibility);
    root.addEventListener('keydown', onKey);
    (function () {
      var dlg = rulesSheet();
      if (!dlg) return;
      dlg.querySelector('.rules-sheet-close').addEventListener('click', closeRules);
      // A click on the dimmed area outside the sheet closes it too.
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeRules(); });
      dlg.addEventListener('close', function () { canvas.focus(); });
    })();
    (function () {
      var dlg = strategiesSheet();
      if (!dlg) return;
      dlg.querySelector('.rules-sheet-close').addEventListener('click', closeStrategies);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeStrategies(); });
      dlg.addEventListener('close', function () { canvas.focus(); });
    })();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    var ro = root.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(canvas);
    resize();

    return {
      start: function () {
        sound.music(true);
        play().catch(function (err) {
          if (root.console) console.error(err);
        });
      },
      destroy: function () {
        destroyed = true;
        sound.stopMusic();
        document.removeEventListener('visibilitychange', onVisibility);
        root.removeEventListener('resize', onResize);
        root.removeEventListener('keydown', onKey);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
        if (ro) ro.disconnect();
      },
      // Exposed for debugging in the browser console.
      get game() { return game; },
      get ui() { return ui; },
      get spots() { return tileSpots; }, // face-up tile boxes from the last frame (debugging)
      get layout() { return L; }, // the table's current layout (debugging)
      // Exposed for debugging in the browser console.
      declare: function (seat, label, color) {
        var p = declarationPos(seat);
        banner(label, p.x, p.y, { rot: p.rot, maxW: p.maxW, span: p.span, maxH: p.maxH, size: 32, dur: 6000, color: color });
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Preview page wiring (settings form <-> table)
   * ------------------------------------------------------------------ */

  // Settings the form doesn't show (the coach) keep whatever
  // was last chosen from the in-game menu.
  function readForm(form, saved) {
    saved = saved || {};
    var get = function (name, fallback) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : fallback;
    };
    return {
      spicy: 'full',
      mode: get('mode', saved.mode || 'practice'),
      // Older saves had a hints on/off flag.
      coach: saved.coach || (saved.hints === false ? 'off' : 'on'),
      // Animations are always on; ?instant=1 skips them for a visit (see below).
      speed: 'normal',
    };
  }

  function applySaved(form, saved) {
    var set = function (name, value) {
      var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (el) el.checked = true;
    };
    if (saved.mode) set('mode', saved.mode);
  }

  function init() {
    var form = document.getElementById('play-settings');
    var stage = document.getElementById('play-stage');
    var canvas = document.getElementById('play-canvas');
    var live = document.getElementById('play-live');
    if (!form || !stage || !canvas) return;
    applySaved(form, readJson(SETTINGS_KEY, {}));
    loadAssets();

    // ?opened=1 says the table is open, so refreshing comes back to the game.
    // A lesson isn't saved, so it doesn't set it.
    function isOpenedUrl() {
      return /[?&]opened=1(&|$)/.test(root.location.search);
    }

    function gameUrl(on) {
      var url = new URL(root.location.href);
      if (on) url.searchParams.set('opened', '1');
      else url.searchParams.delete('opened');
      return url;
    }

    function inGameEntry() {
      return !!(root.history.state && root.history.state.lcmGame);
    }

    // The open table is its own history entry, so Back returns to this page.
    // A link straight to ?opened=1 gets this page's entry put under it first.
    function enterGameHistory(opened) {
      if (!root.history || !root.history.pushState) return;
      var state = { lcmGame: true };
      if (inGameEntry()) { root.history.replaceState(state, '', gameUrl(opened)); return; }
      if (isOpenedUrl()) root.history.replaceState(null, '', gameUrl(false));
      root.history.pushState(state, '', gameUrl(opened));
    }

    function clearOpenedUrl() {
      if (root.history && root.history.replaceState) root.history.replaceState(null, '', gameUrl(false));
    }

    // Quit steps back over the table's entry, so Back doesn't show this page twice.
    function leaveGameHistory() {
      if (!root.history) return;
      if (inGameEntry()) root.history.back();
      else clearOpenedUrl();
    }

    function pageReady() {
      document.documentElement.classList.remove('play-reopening');
    }

    var table = null;
    function open(settings, saved) {
      // A new game takes the save slot. A lesson leaves a saved game alone.
      if (!saved && !settings.lesson) removeJson(AUTOSAVE_KEY);
      enterGameHistory(!settings.lesson);
      stage.hidden = false;
      pageReady();
      document.documentElement.classList.add('is-playing');
      if (table) table.destroy();
      table = createTable(canvas, live, settings, {
        quit: close,
        restart: function () { open(settings); },
        fullscreen: toggleFullscreen,
        isFullscreen: function () { return !!fullscreenElement(); },
      }, saved);
      table.start();
      canvas.focus();
      root.__lcmTable = table;
      hideToolbar();
    }

    // Phones held sideways play fullscreen. Browsers only allow it from a
    // tap, so the first tap in the game while sideways enters it (iPhone
    // Safari has no fullscreen for pages; added to the home screen, the
    // page opens fullscreen there instead). Turning back upright, or
    // quitting, leaves the fullscreen it entered. Leaving it yourself while
    // sideways keeps it off until the phone is turned upright again.
    var autoFullscreen = false;
    var declinedFullscreen = false;
    var fullscreenPending = false; // one request at a time (a tap on Full screen fires both)
    function phoneSideways() {
      var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
      return coarse && root.innerWidth > root.innerHeight && root.innerHeight < 600;
    }
    function fullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function leaveAutoFullscreen() {
      if (!autoFullscreen) return;
      autoFullscreen = false;
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (fullscreenElement() && exit) {
        var p = exit.call(document);
        if (p && p.catch) p.catch(function () {});
      }
    }
    function enterFullscreenOnTap() {
      if (stage.hidden || declinedFullscreen || fullscreenPending || fullscreenElement() || !phoneSideways()) return;
      requestFullscreen();
    }
    function requestFullscreen() {
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) return;
      try {
        var p = req.call(el, { navigationUI: 'hide' });
        autoFullscreen = true;
        fullscreenPending = !!(p && p.then);
        setTimeout(function () { fullscreenPending = false; }, 3000); // in case it never settles
        if (p && p.then) {
          p.then(function () { fullscreenPending = false; hideToolbar(); }, function () { fullscreenPending = false; autoFullscreen = false; });
        }
      } catch (e) { fullscreenPending = false; }
    }
    // Sideways, also ask the browser to hide its toolbar: the page gets
    // room to scroll (.is-sideways: a pixel past the full screen height)
    // and is scrolled to the bottom of it, which mobile browsers answer by
    // tucking the address bar away so the game fills the screen. No tap
    // needed.
    // (Instantly: the site scrolls smoothly, and a smooth scroll can be
    // dropped while the page is still settling.) Back to the top first, so
    // the scroll down always happens even if the page was already there.
    function scrollToY(y) {
      try { root.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { root.scrollTo(0, y); }
    }
    function nudgeScroll() {
      if (stage.hidden || !phoneSideways()) return;
      var de = document.documentElement;
      var max = Math.max(1, de.scrollHeight - root.innerHeight);
      scrollToY(0);
      setTimeout(function () { scrollToY(max); }, 20);
    }
    // Repeats as a rotation settles (phones resize in steps as the toolbar moves).
    function hideToolbar() {
      var sideways = !stage.hidden && phoneSideways();
      document.documentElement.classList.toggle('is-sideways', sideways);
      if (!sideways) return;
      [60, 300, 700, 1200].forEach(function (ms) { setTimeout(nudgeScroll, ms); });
    }
    document.addEventListener('pointerup', function () { if (!stage.hidden && phoneSideways()) nudgeScroll(); }, true);
    root.addEventListener('orientationchange', hideToolbar);
    if (root.screen && root.screen.orientation && root.screen.orientation.addEventListener) {
      root.screen.orientation.addEventListener('change', hideToolbar);
    }
    // The Full screen button (sideways phones): in or out of fullscreen,
    // and the toolbar tucked away either way (iPhone Safari has no page
    // fullscreen, so there it's the toolbar only).
    function toggleFullscreen() {
      if (fullscreenElement()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        autoFullscreen = false;
        declinedFullscreen = true;
        if (exit) { var px = exit.call(document); if (px && px.catch) px.catch(function () {}); }
        return;
      }
      declinedFullscreen = false;
      if (!fullscreenPending) requestFullscreen();
      hideToolbar();
    }
    document.addEventListener('pointerup', enterFullscreenOnTap, true);
    function onFullscreenChange() {
      if (!fullscreenElement() && autoFullscreen) {
        autoFullscreen = false;
        if (phoneSideways()) declinedFullscreen = true;
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    root.addEventListener('resize', function () {
      if (root.innerHeight > root.innerWidth) {
        declinedFullscreen = false;
        leaveAutoFullscreen();
      }
      // Only when it changes, so the toolbar showing again (a resize) doesn't loop.
      var was = document.documentElement.classList.contains('is-sideways');
      if (was !== (!stage.hidden && phoneSideways())) hideToolbar();
    });

    // Quitting leaves the table. The saved game stays, so Resume game can
    // bring it back.
    function close() {
      leaveGameHistory();
      leaveTable();
    }

    function leaveTable() {
      leaveAutoFullscreen();
      document.documentElement.classList.remove('is-sideways');
      if (table) table.destroy();
      table = null;
      // Paint Resume and the mode while the table still covers the page.
      revealResume(true);
      stage.hidden = true;
      document.documentElement.classList.remove('is-playing');
    }

    // Remember the last Payout/Practice choice as soon as it changes.
    // Payouts are always full spicy, including games saved as half spicy.
    form.addEventListener('change', function () {
      var saved = readJson(SETTINGS_KEY, {});
      var now = readForm(form, saved);
      saved.mode = now.mode;
      saved.spicy = 'full';
      writeJson(SETTINGS_KEY, saved);
      document.documentElement.classList.remove('play-mode-practice', 'play-mode-payout');
      if (now.mode === 'practice' || now.mode === 'payout') {
        document.documentElement.classList.add('play-mode-' + now.mode);
      }
      track('play_mode_select', { mode: now.mode });
      paintPlayActions();
    });

    var credits = document.querySelector('.play-credits');
    if (credits) {
      credits.addEventListener('click', function (e) {
        var link = e.target.closest('a');
        if (link) track('play_credit_click', { link: link.textContent });
      });
    }

    var resumeBtn = document.getElementById('play-resume');
    var startBtn = document.getElementById('play-start');
    var learnBtn = document.getElementById('play-learn');

    // On mobile, a saved game in the other mode puts Start new game first:
    // Resume wouldn't open the mode you just picked.
    var phoneActions = root.matchMedia ? root.matchMedia('(max-width: 600px), (pointer: coarse) and (max-height: 599px)') : null;
    function newGameFirst() {
      if (!phoneActions || !phoneActions.matches || !resumeBtn || resumeBtn.hidden) return false;
      var stored = readJson(AUTOSAVE_KEY, null);
      var mode = stored && stored.payload && stored.payload.game && stored.payload.game.settings && stored.payload.game.settings.mode;
      return !!mode && mode !== readForm(form, readJson(SETTINGS_KEY, {})).mode;
    }

    // The first button on the page is the red one. The rest are white.
    function paintPlayActions() {
      var seen = false;
      var startFirst = newGameFirst();
      document.documentElement.classList.toggle('play-new-first', startFirst);
      if (resumeBtn && startBtn) {
        if (startFirst) startBtn.parentNode.insertBefore(startBtn, resumeBtn);
        else resumeBtn.parentNode.insertBefore(resumeBtn, startBtn);
      }
      (startFirst ? [startBtn, resumeBtn, learnBtn] : [resumeBtn, startBtn, learnBtn]).forEach(function (btn) {
        if (!btn) return;
        var primary = !seen && !btn.hidden;
        if (!btn.hidden) seen = true;
        btn.classList.toggle('btn-primary', primary);
        btn.classList.toggle('btn-white', !primary);
      });
    }

    // A stored game shows Resume and hides Learn. Otherwise Start leads.
    function showSavedGame(on) {
      document.documentElement.classList.toggle('play-has-save', !!on);
      if (resumeBtn) resumeBtn.hidden = !on;
      if (learnBtn) learnBtn.hidden = on;
      if (startBtn) startBtn.textContent = on ? 'Start new game' : 'Start game';
      paintPlayActions();
    }

    if (phoneActions && phoneActions.addEventListener) phoneActions.addEventListener('change', paintPlayActions);

    function settlePlayForm() {
      document.documentElement.classList.add('play-settled');
    }

    function pageSettings() {
      var settings = readForm(form, readJson(SETTINGS_KEY, {}));
      if (/[?&]instant=1/.test(root.location.search)) settings.speed = 'off';
      return settings;
    }

    function startFresh() {
      open(pageSettings());
    }

    // The signature covers the save. A changed one is thrown out and a new
    // game starts in its place.
    function resumeOrNew() {
      var data = readJson(AUTOSAVE_KEY, null);
      var settings = pageSettings();
      var beginNew = function () {
        removeJson(AUTOSAVE_KEY);
        showSavedGame(false);
        open(settings);
      };
      if (!data || !E.checkSave) { beginNew(); return; }
      E.checkSave(data).then(function (check) {
        if (!check.ok) { beginNew(); return; }
        open(Object.assign(settings, { mode: data.payload.game.settings.mode }), data);
      }, beginNew);
    }

    function revealResume(fromQuit) {
      var stored = readJson(AUTOSAVE_KEY, null);
      var looksSaved = !!(stored && stored.payload && stored.payload.game);
      if (!stored || !E.checkSave) {
        showSavedGame(false);
        settlePlayForm();
        if (fromQuit && startBtn) startBtn.focus();
        return;
      }
      // Show the stored game before the signature check, so the page doesn't
      // flash Start as the red button while that check runs.
      showSavedGame(looksSaved);
      E.checkSave(stored).then(function (check) {
        if (table) { settlePlayForm(); return; }
        if (check.ok) {
          showSavedGame(true);
          settlePlayForm();
          if (fromQuit && resumeBtn) resumeBtn.focus();
          return;
        }
        showSavedGame(false);
        settlePlayForm();
        // A newer game wrote this. Leave it. A changed signature is discarded.
        if (/newer than this game|doesn't load in version|no game version/.test(check.reason || '')) return;
        removeJson(AUTOSAVE_KEY);
        startFresh();
      }, function () {
        if (table) { settlePlayForm(); return; }
        removeJson(AUTOSAVE_KEY);
        showSavedGame(false);
        settlePlayForm();
        startFresh();
      });
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', function () {
        track('play_resume_click', {});
        resumeOrNew();
      });
    }

    // Learn to play, beside the game buttons: one fixed hand the coach walks you through.
    if (learnBtn) {
      learnBtn.addEventListener('click', function () {
        track('play_learn_click', {});
        var settings = readForm(form, readJson(SETTINGS_KEY, {}));
        settings.mode = 'practice';
        settings.lesson = true;
        settings.spicy = 'full';
        if (/[?&]instant=1/.test(root.location.search)) settings.speed = 'off';
        open(settings);
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var settings = readForm(form, readJson(SETTINGS_KEY, {}));
      writeJson(SETTINGS_KEY, settings);
      track('play_start_click', { mode: settings.mode });
      // ?instant=1 skips animations for this visit only, to speed up testing.
      if (/[?&]instant=1/.test(root.location.search)) settings.speed = 'off';
      open(settings);
    });

    // Refreshing the game goes back into it. With no game to go back to, or a
    // save that doesn't load, the page shows as usual.
    function reopenGame() {
      var stored = readJson(AUTOSAVE_KEY, null);
      var offerPage = function () {
        clearOpenedUrl();
        pageReady();
        revealResume();
      };
      if (!stored || !stored.payload || !stored.payload.game || !E.checkSave) { offerPage(); return; }
      E.checkSave(stored).then(function (check) {
        if (!check.ok) { offerPage(); return; }
        showSavedGame(true);
        settlePlayForm();
        open(Object.assign(pageSettings(), { mode: stored.payload.game.settings.mode }), stored);
      }, offerPage);
    }

    // A stored game offers Resume. A changed signature starts a new game.
    if (isOpenedUrl()) reopenGame();
    else revealResume();

    // Back leaves the table for this page, and Forward returns to the game.
    root.addEventListener('popstate', function () {
      if (table && !inGameEntry()) {
        document.querySelectorAll('dialog.rules-sheet[open]').forEach(function (dlg) { dlg.close(); });
        leaveTable();
      } else if (!table && inGameEntry() && isOpenedUrl()) reopenGame();
    });
  }

  var api = { createTable: createTable, init: init };
  root.MahjongGame = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
