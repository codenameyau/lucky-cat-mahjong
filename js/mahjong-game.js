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
  var Analysis = root.MahjongAnalysis;
  var Strategies = root.MahjongStrategies;
  var Lesson = root.MahjongLesson;

  var SETTINGS_KEY = 'lcm-play-settings';
  var PREFS_KEY = 'lcm-play-prefs';
  // { coach: id }. The computer players are not saved: each gets a random
  // strategy every game.
  var STRATEGIES_KEY = 'lcm-play-strategies';
  // The one saved game on this device, signed (HMAC-SHA256). Each turn writes
  // it; Resume game reads it. Quit leaves it.
  var AUTOSAVE_KEY = 'lcm-play-autosave';
  // The signed playback View playback and a finished hand save. The playback
  // page opens it on its own.
  var REPLAY_KEY = 'lcm-play-replay';
  // The playback of a hand still being played. Its file holds the whole deal,
  // so it is never written to storage: it lives here, for the playback view
  // on this page, and goes when the page does.
  var liveReplay = null;
  // A file an older version stored for a hand not yet finished is dropped.
  function dropUnfinishedStored() {
    var stored = readJson(REPLAY_KEY, null);
    if (stored && stored.payload && !E.playbackFinished(stored.payload)) removeJson(REPLAY_KEY);
  }
  function keepReplay(file) {
    if (!file) return;
    if (E.playbackFinished(file.payload || file)) {
      liveReplay = null;
      // The list first: before it existed, REPLAY_KEY held the last hand,
      // which the list takes in as an earlier one.
      addRecent(file);
      writeJson(REPLAY_KEY, file);
    } else {
      liveReplay = file;
    }
  }
  // A playback file you uploaded: { savedAt, file }, one at a time. It has a
  // place of its own, so it never replaces the game's (REPLAY_KEY): View
  // playback on the game always shows the game. A refresh while it shows
  // brings it back.
  var UPLOAD_KEY = 'lcm-play-upload';
  // The five most recent finished hands, newest first: [{ savedAt, file }].
  // The View playback sheet lists them, each with Play and Download.
  var RECENT_KEY = 'lcm-play-recent';
  var RECENT_MAX = 5;
  // One hand's playback, whoever saved it.
  function playbackId(file) {
    var p = file && file.payload;
    return p ? p.handSeed + ':' + p.handNumber + ':' + file.moves : null;
  }
  function recentPlaybacks() {
    var list = readJson(RECENT_KEY, null);
    if (!Array.isArray(list)) {
      // Before the list was kept: the one finished hand there was.
      var last = readJson(REPLAY_KEY, null);
      list = last && last.payload && E.playbackFinished(last.payload) ? [{ savedAt: null, file: last }] : [];
    }
    return list.filter(function (e) { return e && e.file && e.file.payload; }).slice(0, RECENT_MAX);
  }
  // A finished hand joins the front; a hand already listed keeps its place and time.
  function addRecent(file) {
    var id = playbackId(file);
    var list = recentPlaybacks();
    if (list.some(function (e) { return playbackId(e.file) === id; })) return;
    list.unshift({ savedAt: Date.now(), file: file });
    writeJson(RECENT_KEY, list.slice(0, RECENT_MAX));
  }
  function uploadedPlayback() {
    var u = readJson(UPLOAD_KEY, null);
    if (!u) return null;
    if (u.payload) return { savedAt: null, file: u }; // kept before the time was
    return u.file && u.file.payload ? u : null;
  }
  // Each strategy's hints for the game in progress: { v: 1, lists: { id: [note, ...] } }.
  // A new game overwrites it. Switching the coach only picks which list shows.
  var HINTS_KEY = 'lcm-play-hints';
  var PLAYBACK_EMPTY = 'Pick one of your recent hands, or upload a playback file.';
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
  var TAP_TWICE = 'Tap a tile twice to discard it.';

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
  var RENAMED_STRATEGIES = { 'claude-cat': 'lucky-cat', 'no-defense': 'jorge-yau' };
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

  // The saved coach strategy, if its id still exists.
  function readStrategies() {
    var saved = readJson(STRATEGIES_KEY, {}) || {};
    var old = saved.v !== 2;
    function current(id) {
      if (old && SWAPPED_STRATEGIES[id]) id = SWAPPED_STRATEGIES[id];
      id = RENAMED_STRATEGIES[id] || id;
      return Strategies.has(id) ? id : null;
    }
    // Only the coach's strategy is kept. Computer players get a random one
    // each game, so any seat choice an older version saved is ignored.
    return { v: 2, seats: {}, coach: current(saved.coach) };
  }

  // This game's strategy for each bot seat (always random) and the coach's (saved).
  function pickStrategies() {
    var saved = readStrategies();
    var seats = [null];
    for (var k = 1; k <= 3; k++) seats.push(Strategies.randomId());
    // Rolled once, when a game starts, and kept for every hand of it.
    Object.freeze(seats);
    return { seats: seats, coach: saved.coach || Strategies.DEFAULT_COACH };
  }

  function track(name, params) {
    if (typeof root.gtag === 'function') root.gtag('event', name, params || {});
  }

  // The event for a click on each of the table's buttons, by button id. Coach,
  // Rules, Strategies and Sound have their own, and so do View playback and the
  // playback speed. Tiles and the buttons that play a move (Win, Kong, Pung,
  // Chow, Pass, Discard) are not tracked.
  var BUTTON_EVENTS = {
    menu: 'play_menu_open',
    fullscreen: 'play_fullscreen_click',
    'show-hands': 'play_show_hands_click',
    next: 'play_next_hand_click',
    'see-results': 'play_see_results_click',
    'm-resume': 'play_menu_resume_click',
    'm-close': 'play_menu_resume_click',
    'm-restart': 'play_menu_restart_click',
    'm-quit': 'play_menu_quit_click',
    'go-again': 'play_again_click',
    'go-results': 'play_end_results_click',
    'go-quit': 'play_end_quit_click',
    'go-close': 'play_end_close_click',
    'review-prev': 'play_playback_prev_click',
    'review-next': 'play_playback_next_click',
    'review-back': 'play_playback_back_click',
    'review-list': 'play_playback_list_click',
    'review-list-center': 'play_playback_list_click',
  };

  /* ------------------------------------------------------------------ *
   * 1. Assets and tile sprites
   * ------------------------------------------------------------------ */

  var images = {};
  var assetsReady = null;

  function loadScript(src) {
    return new Promise(function (resolve) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = resolve; // like an image, a miss must not stop the game starting
      document.head.appendChild(el);
    });
  }

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
    // Neural Cat's and Lucky Cat's weights are the page's biggest scripts. The menu does not
    // need them, so they load here, before a strategy first builds its model.
    if (!root.MahjongMLWeights) jobs.push(loadScript('/js/mahjong-ml-weights.js'));
    // Only Orphans' weights, the same way.
    if (!root.MahjongOnlyOrphansWeights) jobs.push(loadScript('/js/mahjong-only-orphans-weights.js'));
    if (!root.MahjongLuckyCatWeights) jobs.push(loadScript('/js/mahjong-lucky-cat-weights.js'));
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
    // Previous on the playback: the draw's own chip clip (Casino Audio) played
    // lower, with chips settling just before it, as if the tile were going back.
    back: { clips: ['tile-claim-1'], gain: 0.45, then: [['tile-draw', 0.04, 0.4, 0.8]] },
    // Next: the same two chip clips the other way round, the draw first and
    // the chips settling after it.
    forward: { clips: ['tile-draw'], gain: 0.45, then: [['tile-claim-1', 0.05, 0.35, 1.1]] },
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

  // The sound files' bytes, fetched once for the page, so a second table (the
  // playback view) has them without the network.
  var clipBytes = {};
  function fetchClip(name) {
    if (!clipBytes[name]) {
      clipBytes[name] = root.fetch(SOUND_DIR + name + '.wav')
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .catch(function () { delete clipBytes[name]; return null; });
    }
    return clipBytes[name];
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
        raw[name] = fetchClip(name);
      });
    }

    function decodeAll(a) {
      Object.keys(raw).forEach(function (name) {
        var pending = raw[name];
        delete raw[name];
        pending.then(function (bytes) {
          if (!bytes) return;
          // The callback form also works in older Safari. Decoding takes the
          // bytes it is given, so it gets a copy and the page keeps its own.
          a.decodeAudioData(bytes.slice(0), function (buf) { buffers[name] = buf; }, function () {});
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

  // Like wrapText, for a paragraph where some words are bold: each word is
  // measured in its own weight (weightAt gives it from the word's position).
  function wrapRuns(ctx, text, maxW, weightAt, size) {
    var lines = [];
    var line = '', width = 0, at = 0;
    function wide(word, pos) {
      ctx.font = (weightAt(pos) ? 'bold ' : '') + size + 'px ' + FONT_BODY;
      return ctx.measureText(word).width;
    }
    String(text).split(' ').forEach(function (w) {
      var gap = line ? wide(' ', at - 1) : 0;
      var ww = wide(w, at);
      if (line && width + gap + ww > maxW) {
        lines.push(line);
        line = w; width = ww;
      } else {
        line = line ? line + ' ' + w : w;
        width += gap + ww;
      }
      at += w.length + 1;
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
    if (!settings.playback) liveReplay = null; // a new game starts without the last one's unfinished playback
    dropUnfinishedStored();
    var prefs = readJson(PREFS_KEY, { sound: true });
    // ?sound=0 and ?sound=1 cover this visit only, so a test can stay quiet
    // without changing the saved Sound button choice. No sound param keeps it.
    var soundParam = /[?&]sound=(0|1)(?:&|$)/.exec((root.location && root.location.search) || '');
    var soundOn = soundParam ? soundParam[1] === '1' : prefs.sound !== false;
    var sound = createSound(soundOn);
    sound.musicEnabled = sound.enabled;
    var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // W and H are the layout size. On short landscape screens the table is
    // laid out taller and scaled down to fit (zoom < 1); dpr then includes
    // that zoom so everything still renders sharp.
    // A pane smaller than the table's fixed parts (a hidden one measures 0)
    // is still laid out at the minimum and clipped, because below that the
    // seats overrun the table and the pond's size goes negative.
    var MIN_LAYOUT_W = 200, MIN_LAYOUT_H = 300;
    var W = MIN_LAYOUT_W, H = MIN_LAYOUT_H, dpr = 1, zoom = 1, cssW = 0, cssH = 0;
    var MIN_LANDSCAPE_H = 520;
    var L = null;
    var game = null;
    var reviewStep = 0; // how many recorded moves are on the table
    var reviewShown = -1; // the step drawn on the table, so the next one can fly from it
    var reviewMotion = 0; // bumps when a flight is replaced, so a late landing can't unhide the next move
    var reviewSnapHand = false; // a jump repositions your tiles in place; one step lets them slide
    var reviewPicks = null; // { step, rows } the discard each strategy would make at this move
    var livePicks = null; // { sig, rows } the same, for the hand on the table
    var layoutNesting = false; // computeLayout is measuring the strategy panel's height
    var reviewPlaying = false;
    var reviewTimer = null;
    var reviewSpeed = [0.5, 1, 2].indexOf(prefs.speed) !== -1 ? prefs.speed : 1; // playback speed: 0.5, 1 or 2, kept in PREFS_KEY
    var reviewStopsFor = null; // { rec, stops, mine, discards }: the steps a move lands on
    var reviewScrub = 0; // pointer id while the move bar is being dragged
    var reviewBar = null; // where the move bar was drawn, in layout units
    var reviewNote = null; // why the empty table is waiting, when a paste failed
    var playbackLooked = false; // the page has looked for a stored playback
    var loadStartedAt = now(); // the skeleton only shows if loading takes longer than skeletonAfterMs()
    function skeletonAfterMs() { return 250; }
    var reviewCoaches = {}; // by strategy id: one walk of the hand each, so a coach who follows your discards keeps that streak
    var reviewCoachTimer = null;
    var reviewAnalyst = null; // reads the whole table for the coach panel
    var destroyed = false;
    var frameRequested = false;
    var anims = [];
    var particles = [];
    var banners = [];
    var flights = [];
    var regions = [];
    var hover = null;
    var historyDrag = null;
    var historyTap = null; // a press on a coach note in playback: it jumps there if it wasn't a drag
    var resultsDrag = null;
    // Face-up tiles drawn this frame (screen boxes) and the mouse position,
    // for the tile-name tooltip.
    var tileSpots = [], tipsOn = true, mouse = null, tipTile = null;
    // A tile tapped on a touch screen, so its name stays up without a hover.
    var pinnedTip = null;
    // The computer players' name rows, for the strategy tooltip.
    var seatSpots = [], tipSeat = null;
    var lastTouch = false; // the last press was a finger: no hover, so the selected tile gets the tip

    var ui = {
      coach: settings.coach || 'on', // 'on' (advice), 'feedback' (notes on your last move) or 'off'
      feedback: null, // the coach's note on your previous move
      feedbackDiscards: null, // what each strategy would have done on your last discard or claim
      feedbackKind: null, // 'discard' or 'claim': which of those the boxes show
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
      hintLists: {}, // by strategy id: every hint and feedback note it gave this game, oldest first (HINTS_KEY)
      hintsAll: {}, // by strategy id: the hint for the move in front of you
      coachLog: [], // playback only: the shown coach's notes up to the move on the table
      coachScroll: 0,
      coachStick: true, // follow the newest note until the player scrolls up
      coachScrollMax: 0,
      results: [], // one row per finished hand: faan and points for each seat
      resultsScroll: 0,
      resultsStick: true, // follow the newest hand until the player scrolls up
      resultsScrollMax: 0,
      notice: null,
      hide: { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null },
      botLift: null, // { seat, index } tile a bot is considering
      botDrawn: [false, false, false, false], // a bot is holding a fresh draw
      winInHand: null, // a discard win's tile, flying into the winner's hand then glowing there
      botDiscardFrom: [null, null, null, null],
      oppHand: [null, null, null, null],
      overlay: null,
      revealHands: false, // after Show hands, every concealed hand is face up
      resultsOpen: false, // the end-of-game results sheet is up
      heldSummary: null, // the results panel, while those hands stay open
      youIcon: null, // where your person icon was drawn
      headerMark: [null, null, null, null], // name row: icon and where the score sits beside it
      youHeader: null, // where your name was drawn, so See results can sit under it when there is no coach box
      coachBox: null, // the coach's bar, once drawn, so See results can sit above your avatar
      lastHandRects: [],
      meldAnchor: [null, null, null, null],
      backAnchor: [null, null, null, null],
      flowerAnchor: [null, null, null, null],
      // dealIns: the times you discarded the winning tile. stays: the times the deal
      // stayed with you (you won as dealer and dealt again).
      // fastest: the fewest moves in a hand you won (your own discards, plus the winning move).
      stats: { hands: 0, wins: 0, best: null, fastest: null, dealIns: 0, stays: 0 },
      strategies: { seats: [null, null, null, null], coach: Strategies.DEFAULT_COACH }, // set once in start
    };

    function announce(text) {
      if (liveRegion) liveRegion.textContent = text;
    }

    // Animations: 'normal' (shown) or 'off' (skip animations and delays).
    // Auto-play (the wind badge, on development addresses) skips every one of
    // them: the flights, pauses and bot delays, and the declaration banners
    // (Pung!, Flower! ...) and win confetti.
    function instantMode() { return settings.speed === 'off' || ui.replaying || autoPlay; }
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
      var nextZoom = rect.width > rect.height && rect.height > 0 && rect.height < MIN_LANDSCAPE_H ? rect.height / MIN_LANDSCAPE_H : 1;
      if (rect.width === cssW && rect.height === cssH && deviceDpr * nextZoom === dpr) return;
      cssW = rect.width; cssH = rect.height; zoom = nextZoom;
      W = Math.max(MIN_LAYOUT_W, cssW / zoom); H = Math.max(MIN_LAYOUT_H, cssH / zoom); dpr = deviceDpr * zoom;
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
    var TOP_PANEL_TRIM = 6; // how much shorter the top player's panel is than its tiles alone would make it
    var SIDE_HEAD_TOP = 4; // on desktop, room above the side players' names
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
      // Each strategy's discard sits under the coach column, as wide as that
      // column and as tall as your hand, in a game and in playback. A phone
      // with no column keeps the strip under the table instead. The coach
      // being off hides it, along with the coach's notes.
      if ((settings.review || (game && game.hand && ui.coach !== 'off')) && !layoutNesting) {
        var full = H;
        layoutNesting = true;
        try {
          var laid = computeLayout();
          if (laid.history) {
            var split = 8;
            var col = laid.history;
            col.h = Math.max(48, laid.meBox.y - split - col.y);
            laid.strategyPanel = { x: col.x, y: laid.meBox.y, w: col.w, h: laid.meBox.h };
            return laid;
          }
        } finally {
          H = full;
          layoutNesting = false;
        }
        var reserve = 0;
        var fallback = null;
        layoutNesting = true;
        try {
          for (var pass = 0; pass < 5; pass++) {
            H = Math.max(320, full - reserve); // no extra gap above the strip
            fallback = computeLayout();
            var next = Math.round(Math.min(fallback.meBox.h, 78)); // the strip's height, see below
            if (next === reserve) break;
            reserve = next;
          }
          // A phone's strip holds one row of boxes, so it only needs what they do,
          // not the height of your two-row hand.
          var panelH = Math.min(fallback.meBox.h, 78);
          fallback.strategyPanel = { x: fallback.pad, y: full - panelH, w: W - 2 * fallback.pad, h: panelH, phone: true };
          return fallback;
        } finally {
          H = full;
          layoutNesting = false;
        }
      }
      var pad = W < 600 ? 6 : 14;
      var topH = 42 + 6; // top bar plus a little breathing room below it
      // Short landscape phones are laid out taller than the screen, so W can
      // look like a desktop. The coach column follows the real screen.
      var desktop = cssW >= 980 && cssW >= cssH * 0.9;
      var landscape = !desktop && W > H;
      var phonePortrait = !desktop && !landscape;
      var handRows = phonePortrait ? 2 : 1;
      var depth = function (w) { return Math.max(2, w * 0.08); };

      // Desktop keeps the column so the results stay put. A phone drops the
      // coach's bar and column while the coach is off, and the table takes that room.
      var coachShown = desktop || ui.coach !== 'off';

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
      // Playback keeps the coach's bar even on a landscape phone, where a
      // live game would put the coach in the column instead. The move bar
      // and the playback buttons live in that box.
      if (settings.review && !hintH) hintH = 76;
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
        sideHead = 20 + SIDE_HEAD_TOP;
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
        topPanelH = Math.ceil(oppFit * 2 * depthUnit + 16) - TOP_PANEL_TRIM;
      } else {
        sideW = phonePortrait ? 46 : landscape ? LANDSCAPE_SIDE_W : portrait ? clamp(tableW * 0.16, 56, 88) : clamp(tableW * 0.16, 118, 200);
        // Every opponent's panel is the same depth.
        topPanelH = sideW;
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
          // (The top seat is trimmed, so it fits the same tile with less room spare.)
          shared = Math.min(shared, (fr.w - 13 * TILE_GAP) / 14, (fr.h - (k === 2 ? 10 - TOP_PANEL_TRIM : 10)) / (2 * depthUnit));
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
      // bottom of yours, so those three edges line up. On a desktop the
      // results table takes the top of that column and the coach keeps the
      // rest. Playback leaves the column to the coach.
      var historyBottom = meBox.y + meBox.h;
      var history = historyW ? {
        x: ox + tableW + historyGap,
        y: opp[2].y,
        w: historyW,
        h: historyBottom - opp[2].y,
      } : null;
      var results = null;
      if (desktop && history && !settings.playback && !settings.review) {
        if (ui.coach === 'off') {
          // The coach's notes and the recommendations are hidden, so the
          // results take the column.
          results = { x: history.x, y: history.y, w: history.w, h: history.h };
          history = null;
        } else {
          var resultsGap = 8;
          var coachMin = 140;
          // A bit under a third of the screen, so the coach below it has the room.
          var resultsH = Math.round(H / 3.5);
          var room = history.h - resultsGap;
          if (room < coachMin + 96) resultsH = Math.max(48, Math.round(room * 0.46));
          else if (resultsH > room - coachMin) resultsH = room - coachMin;
          results = { x: history.x, y: history.y, w: history.w, h: resultsH };
          history = { x: history.x, y: history.y + resultsH + resultsGap, w: history.w, h: room - resultsH };
        }
      }

      return {
        pad: pad, topH: topH, portrait: portrait, ox: ox, tableW: tableW, history: history,
        desktop: desktop, landscape: landscape, phonePortrait: phonePortrait, meX: meX, meW: meW,
        tw: tw, th: th, handGap: handGap, handY: handY, handRows: handRows, mw: mw, meY: meY, meldRowH: meldRowH, meBox: meBox,
        actionsY: actionsY, actionsH: actionsH, actionsInRow: actionsInRow, hintY: hintY, hintH: hintH,
        results: results,
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
        off: 'rgba(255,255,255,0.05)',
      };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = style === 'ghost' || style === 'off' ? 0 : 8;
      ctx.shadowOffsetY = 2;
      pill(x, y, w, h, fills[style], style === 'ghost' ? 'rgba(255,255,255,0.3)' : style === 'off' ? 'rgba(255,255,255,0.12)' : null);
      ctx.restore();
      if (picked) {
        // The coach's recommended move keeps its own color and gets a gold ring.
        roundRect(ctx, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // A touch smaller, and dark text a little softer than black, so the pixel
      // font (which has only one weight) reads lighter on a button. White text
      // stays pure white.
      var dark = style === 'light' || style === 'white' || style === 'gold';
      var color = dark ? '#3a3a3a' : style === 'off' ? 'rgba(255,255,255,0.35)' : COLORS.white;
      // Buttons use the game's own font, the one on its titles.
      var size = fitFont(ctx, label, w - 16, Math.min(15, h * 0.39), FONT_HEAD);
      text(label, x + w / 2, y + h / 2 + 1, { size: size, family: FONT_HEAD, color: color, align: 'center' });
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

    function boxHas(box, x, y) {
      return !!(box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
    }

    // A face-up discard, a tile in an opponent's seat (a meld, a flower, or a
    // hand turned up at the end), or one of your own melds or flowers.
    function tableTipSpot(p) {
      var sp = spotAt(p);
      if (!sp || !sp.id || !L) return null;
      var x = (sp.x0 + sp.x1) / 2, y = (sp.y0 + sp.y1) / 2;
      if (boxHas(L.center, x, y)) return null;
      if (boxHas(L.pond, x, y)) return sp;
      for (var s = 1; s < 4; s++) if (boxHas(L.opp[s], x, y)) return sp;
      // Your own exposed tiles: melds and flowers. The tiles of your concealed
      // hand are tapped to play them, so they stay out.
      if (boxHas(L.meBox, x, y)) {
        var inHand = (ui.lastHandRects || []).some(function (r) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; });
        if (!inHand) return sp;
      }
      return null;
    }

    // The tapped tile, found again after the next draw. Gone once it moves
    // off that spot or leaves the table.
    function pinnedSpot() {
      if (!pinnedTip) return null;
      var best = null, bestD = 12;
      for (var i = 0; i < tileSpots.length; i++) {
        var sp = tileSpots[i];
        if (sp.id !== pinnedTip.id) continue;
        var d = Math.abs((sp.x0 + sp.x1) / 2 - pinnedTip.x) + Math.abs((sp.y0 + sp.y1) / 2 - pinnedTip.y);
        if (d < bestD) { best = sp; bestD = d; }
      }
      return best;
    }

    function tileTipText(id) {
      var label = E.tileName(id);
      var sub = '';
      if (!E.isBonus(id) && game && game.hand) sub = E.unseenCounts(game, 0)[E.tileIndex(id)] + ' left';
      return { label: label, sub: sub };
    }

    // Tap the same tile again to put the tip away. A touch only: a mouse
    // already shows it while the pointer is over the tile.
    function pinTableTip(p) {
      var sp = tableTipSpot(p);
      if (!sp) return false;
      var x = (sp.x0 + sp.x1) / 2, y = (sp.y0 + sp.y1) / 2;
      var same = pinnedTip && pinnedTip.id === sp.id && Math.abs(pinnedTip.x - x) < 2 && Math.abs(pinnedTip.y - y) < 2;
      if (same) pinnedTip = null; // putting it away is silent
      else {
        sound.play('select'); // showing the tip
        pinnedTip = { id: sp.id, x: x, y: y };
        var tip = tileTipText(sp.id);
        announce(tip.label + (tip.sub ? ', ' + tip.sub : '') + '.');
      }
      if (ui.selected >= 0) { ui.selected = -1; ui.notice = null; }
      requestRender();
      return true;
    }

    function drawTileTip() {
      var sp = spotAt(mouse);
      // On a touch screen the tile you've selected (tapped once) gets the tip.
      if (!sp && lastTouch) sp = pinnedSpot();
      if (!sp && lastTouch && ui.selected >= 0 && ui.turnPrompt) {
        var r = ui.lastHandRects[ui.selected];
        if (r) sp = { id: r.id, x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
      }
      tipTile = sp ? sp.id : null;
      if (!sp) return;
      var tip = tileTipText(sp.id);
      drawTip(tip.label, tip.sub, sp);
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
      if (sp && ui.strategies.seats[sp.seat]) drawTip('Strategy: ' + Strategies.get(ui.strategies.seats[sp.seat]).name, '', sp);
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
      roundRect(ctx, x, y, w, h, 4);
      ctx.fillStyle = 'rgba(26,26,26,0.92)';
      ctx.fill();
      ctx.restore();
      text(label, x + w / 2, sub ? y + 14 : y + h / 2 + 1, { size: 13, weight: 'bold', align: 'center', color: COLORS.cream });
      if (sub) text(sub, x + w / 2, y + 30, { size: 12, align: 'center', color: COLORS.goldLight });
    }

    // Grey blocks where the table's parts will go, with a soft light sweeping
    // across them, while the page loads the tiles and finds the playback.
    var skeletonLayout = null, skeletonFor = null;
    function drawSkeleton(t) {
      if (!L) return;
      // The layout the table will have once a playback is on it (with the
      // strategy panel and the coach bar), worked out once per screen size.
      if (skeletonFor !== L) {
        var held = settings.review;
        var wasLoaded = L;
        settings.review = settings.review || true;
        try { skeletonLayout = computeLayout(); } finally { settings.review = held; }
        skeletonFor = wasLoaded;
      }
      // The playback bar's Back (or Close) button is already in place, so the
      // bar looks the same before and after the playback loads. It does nothing yet.
      if (settings.playback) {
        var padTop = skeletonLayout ? skeletonLayout.pad : 8;
        pill(padTop, 7, 64, 28, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.3)');
        text('Back', padTop + 32, 22, { size: 13, family: FONT_HEAD, align: 'center', color: COLORS.white });
      }
      var real = L;
      L = skeletonLayout;
      var sweep = (t % 1500) / 1500;
      function bone(x, y, w, h, r) {
        if (!(w > 0 && h > 0)) return;
        ctx.save();
        roundRect(ctx, x, y, w, h, r == null ? 8 : r);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, w, h);
        var gx = -W * 0.5 + sweep * (W * 2);
        var g = ctx.createLinearGradient(gx, 0, gx + W * 0.45, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.09)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
      try {
        // The scoring and coach columns, the panel under them, and the three other players.
        if (L.results) bone(L.results.x, L.results.y, L.results.w, L.results.h);
        if (L.history) bone(L.history.x, L.history.y, L.history.w, L.history.h);
        if (L.strategyPanel) {
          // The strategy panel and its four boxes, laid out as drawStrategyPanel does.
          var sp = L.strategyPanel;
          bone(sp.x, sp.y, sp.w, sp.h);
          var strip = !!sp.phone, small = strip || sp.h < 150;
          var headH = strip ? 4 : small ? 24 : 34;
          var boxGap = 8;
          var boxW = (sp.w - boxGap * 5) / 4;
          var boxH = Math.max(36, sp.h - headH - (strip ? 4 : small ? 5 : 8));
          if (!strip) bone(sp.x + 14, sp.y + (small ? 8 : 11), 84, 9, 4); // the heading
          for (var bi = 0; bi < 4; bi++) bone(sp.x + boxGap + bi * (boxW + boxGap), sp.y + headH, boxW, boxH, 6);
        }
        [1, 2, 3].forEach(function (seat) { var o = L.opp[seat]; if (o) bone(o.x, o.y, o.w, o.h); });
        if (L.pond) bone(L.pond.x, L.pond.y, L.pond.w, L.pond.h);
        if (L.center) bone(L.center.x + 4, L.center.y, L.center.w - 8, L.center.h, 10);
        if (L.hintH) bone(L.ox + L.pad, L.hintY, L.tableW - 2 * L.pad, L.hintH, 6);
        if (L.meBox) bone(L.meBox.x, L.meBox.y, L.meBox.w, L.meBox.h);
        // Your hand: tile-sized blocks where the tiles will sit. 14 gives a phone's
        // two rows seven each, and one long row on desktop.
        handPositions(14).forEach(function (pos) { bone(pos.x, pos.y, L.tw, L.th, Math.max(2, L.tw * 0.13)); });
      } finally {
        L = real;
      }
      requestRender(); // keep the light moving until the table is ready
    }

    function render(t) {
      regions = [];
      tileSpots = [];
      seatSpots = [];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFelt();
      if (!game || !game.hand) {
        drawTopBar();
        // Only once the stored playback has been looked for: while the page is
        // still loading, the table stays empty instead of flashing the upload prompt.
        if (settings.playback ? playbackLooked : false) drawPlaybackPrompt();
        else if ((settings.playback || !game) && t - loadStartedAt > skeletonAfterMs()) drawSkeleton(t);
        // A finished hand restored on its results has no tiles to draw.
        // The scoring column and the coach notes stay beside that panel.
        if (ui.overlay && ui.overlay.type === 'summary') {
          drawResults();
          drawCoachHistory();
        }
        if (ui.overlay) drawOverlay(t);
        return;
      }
      drawTopBar();
      drawPond(t);
      [1, 2, 3].forEach(function (s) { drawOpponent(s, t); });
      drawMe(t);
      drawHintBand();
      drawResults();
      drawCoachHistory();
      drawStrategyPanel();
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
      drawStrategyToast();
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

    // The sheet's rows play this table's sounds and open its examples, so a
    // sheet another table built (a playback view or game since closed) is
    // built again for this one.
    var rulesOwner = {};
    function buildRules() {
      var body = document.getElementById('rules-sheet-body');
      if (!body) return;
      if (body.childElementCount && body.lcmOwner === rulesOwner) return;
      body.innerHTML = '';
      var oldIntro = body.parentNode.querySelector('.rules-sheet-intro');
      if (oldIntro) oldIntro.remove();
      var oldCard = rulesSheet().querySelector('.rules-example');
      if (oldCard) oldCard.remove();
      body.lcmOwner = rulesOwner;
      var F = E.HKScoring.FAAN;
      var intro = document.createElement('p');
      intro.className = 'rules-sheet-intro';
      intro.textContent = 'Win with four melds and the eyes (a pair), worth at least ' + E.MIN_FAAN +
        ' faan. Add up every pattern your hand has, but only count the highest faan per group. A limit hand is worth ' +
        F.thirteenOrphans + ' faan.';
      body.parentNode.insertBefore(intro, body);
      root.MahjongRules.RULES.forEach(function (section) {
        var sec = document.createElement('section');
        sec.className = 'rules-section' + (section.half ? ' rules-section--half' : '');
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
            if (!(section.preview !== false && r.preview !== false)) {
              // A pattern with no example still clicks.
              row.addEventListener('click', function () {
                sound.play('select');
                track('play_rule_click', { hand: r.name });
              });
            }
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
                sound.play('select'); // opening or putting away an example
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
      onSheet(rulesSheet(), 'click', function (e) {
        if (!desktopRules() || !openExampleRow) return;
        if (openExampleRow.contains(e.target) || exampleCardHas(e.target)) return;
        sound.play('select'); // a click elsewhere puts the example away
        hideRuleExample();
      });
      // Where the pointer was last, so the example can enter from that side.
      onSheet(rulesSheet(), 'pointermove', function (e) {
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
      sound.play('select'); // the click
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

    function playerLabel(seat) {
      var name = game ? game.players[seat].name : 'Bot ' + seat;
      return name + ' (' + SEAT_SIDES[seat] + ')';
    }

    var ASSIGN_ICON = {
      user: '<circle cx="8" cy="4.4" r="2.3" fill="currentColor"/><path d="M2.1 14.4c.4-3.5 2.3-5.2 5.9-5.2s5.5 1.7 5.9 5.2z" fill="currentColor"/>',
      bot: '<path d="M8 3.1V1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="1.15" r="0.85" fill="currentColor"/><rect x="0.5" y="6.1" width="1.5" height="2.5" rx="0.4" fill="currentColor"/><rect x="14" y="6.1" width="1.5" height="2.5" rx="0.4" fill="currentColor"/><rect x="2.3" y="3.5" width="11.4" height="10.2" rx="2.2" fill="currentColor"/><circle cx="6.2" cy="7.8" r="0.95" fill="#074029"/><circle cx="9.8" cy="7.8" r="0.95" fill="#074029"/><rect x="5.7" y="10.5" width="4.6" height="1" rx="0.4" fill="#074029"/>',
    };

    // The drawings stop short of the view box. Drop each one so its lowest
    // point is the box's bottom, and that bottom can share the name's baseline.
    var ICON_DROP = { user: 1.6, bot: 2.3 };

    function assignIcon(kind) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('strategies-assign-icon');
      svg.innerHTML = '<g transform="translate(0 ' + ICON_DROP[kind] + ')">' + ASSIGN_ICON[kind] + '</g>';
      return svg;
    }

    function playingNow(id) {
      return 'Playing ' + Strategies.get(id).name;
    }

    function assignRow(labelText, playing, icon) {
      var row = document.createElement('div');
      row.className = 'strategies-assign-row';
      var label = document.createElement('label');
      label.className = 'strategies-assign-label';
      var who = document.createElement('span');
      who.className = 'strategies-assign-who';
      if (icon) who.appendChild(assignIcon(icon));
      who.appendChild(document.createTextNode(labelText));
      label.appendChild(who);
      if (playing) {
        var now = document.createElement('span');
        now.className = 'strategies-assign-playing';
        now.textContent = playing;
        label.appendChild(now);
      }
      row.appendChild(label);
      row.classList.add('strategies-assign-row--read');
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
      // The sheet only shows who is playing what. The coach is picked on the
      // table, and each computer player gets a random strategy every game.
      box.appendChild(assignRow('Coach', playingNow(ui.strategies.coach), 'user'));
      [1, 2, 3].forEach(function (seat) {
        box.appendChild(assignRow(playerLabel(seat), playingNow(ui.strategies.seats[seat]), 'bot'));
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
        sound.play('select'); // See details or Hide details
        strategyDetailsOpen = !strategyDetailsOpen;
        track('play_strategy_details_click', { open: strategyDetailsOpen });
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

    function setCoachStrategy(id) {
      var saved = readStrategies();
      saved.coach = id;
      ui.strategies.coach = id;
      writeJson(STRATEGIES_KEY, saved);
      track('play_set_coach_strategy', { strategy: id });
      // Only which list shows changes. Every strategy has kept its own.
      if (ui.hint && !settings.lesson && ui.coach !== 'off') ui.hint = ui.hintsAll[id] || ui.hint;
      ui.coachStick = true;
      buildStrategies();
      requestRender();
    }

    function openStrategies() {
      var dlg = strategiesSheet();
      if (!dlg || dlg.open) return;
      sound.play('select'); // the click
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

    /* ---------------- results sheet ---------------- */
    // The desktop column shows the same rows. This sheet opens from the
    // center square, and at the end of a full game.

    function resultsSheet() {
      return document.getElementById('results-sheet');
    }

    // Faan on one line, points on the next. Zero points read as 0, not ±0.
    // Practice never pays, so the points line would only ever say 0.
    function showsPoints() {
      return settings.mode !== 'practice';
    }

    function resultLines(row, seat) {
      var faan = row.faan[seat] || 0;
      var points = row.points[seat] || 0;
      // A full game's total is the score, starting from the opening stake.
      var stake = row.stake || 0;
      var delta = stake ? points - stake : points;
      return {
        faan: (faan ? signed(faan) : '0') + ' faan',
        points: stake ? (points < 0 ? '−' + fmt(-points) : fmt(points)) : (points ? signed(points) : '0'),
        scored: faan > 0,
        faanLoss: faan < 0,
        gain: delta > 0,
        loss: delta < 0,
      };
    }

    function resultsTotal() {
      var faan = [0, 0, 0, 0];
      var points = [0, 0, 0, 0];
      ui.results.forEach(function (row) {
        for (var seat = 0; seat < 4; seat++) {
          faan[seat] += row.faan[seat] || 0;
          points[seat] += row.points[seat] || 0;
        }
      });
      // Full game: everyone is dealt 2,000, then each hand's points are added.
      var stake = 0;
      if (showsPoints()) {
        var opening = game && game.settings && game.settings.startPoints;
        stake = typeof opening === 'number' ? opening : E.START_POINTS;
        for (var seat = 0; seat < 4; seat++) points[seat] += stake;
      }
      return { faan: faan, points: points, stake: stake };
    }

    function fillResults() {
      var body = document.getElementById('results-sheet-body');
      if (!body) return;
      while (body.firstChild) body.removeChild(body.firstChild);
      if (!ui.results.length) {
        var empty = document.createElement('p');
        empty.className = 'results-empty';
        empty.textContent = 'Finished hands show up here.';
        body.appendChild(empty);
        return;
      }
      var table = document.createElement('table');
      table.className = 'results-table';
      var caption = document.createElement('caption');
      caption.className = 'visually-hidden';
      var total = resultsTotal();
      caption.textContent = showsPoints()
        ? 'Faan and points each player gained or lost, one row per hand. The total starts each player at ' + fmt(total.stake) + '.'
        : 'Faan each player gained or lost, one row per hand.';
      table.appendChild(caption);
      var thead = document.createElement('thead');
      var head = document.createElement('tr');
      var handHead = document.createElement('th');
      handHead.scope = 'col';
      handHead.textContent = 'Hand';
      head.appendChild(handHead);
      [0, 1, 2, 3].forEach(function (seat) {
        var th = document.createElement('th');
        th.scope = 'col';
        var who = document.createElement('span');
        who.className = 'results-player';
        var avatar = assignIcon(game.players[seat].isHuman ? 'user' : 'bot');
        avatar.classList.remove('strategies-assign-icon');
        avatar.classList.add('results-avatar');
        who.appendChild(document.createTextNode(seatTitle(seat)));
        who.appendChild(avatar);
        th.appendChild(who);
        head.appendChild(th);
      });
      thead.appendChild(head);
      table.appendChild(thead);
      function resultCells(row) {
        var cells = [];
        for (var seat = 0; seat < 4; seat++) {
          var lines = resultLines(row, seat);
          var td = document.createElement('td');
          var faan = document.createElement('span');
          faan.className = 'results-faan' + (lines.scored ? ' results-faan--scored' : lines.faanLoss ? ' results-faan--loss' : '');
          faan.textContent = lines.faan;
          td.appendChild(faan);
          if (showsPoints()) {
            var pts = document.createElement('span');
            pts.className = 'results-points' + (lines.gain ? ' results-points--gain' : lines.loss ? ' results-points--loss' : '');
            pts.textContent = lines.points;
            td.appendChild(pts);
          }
          cells.push(td);
        }
        return cells;
      }
      var tbody = document.createElement('tbody');
      ui.results.forEach(function (row) {
        var tr = document.createElement('tr');
        var hand = document.createElement('th');
        hand.scope = 'row';
        hand.textContent = String(row.hand);
        if (row.draw) {
          var draw = document.createElement('span');
          draw.className = 'results-draw';
          draw.textContent = 'Draw';
          hand.appendChild(draw);
        }
        tr.appendChild(hand);
        resultCells(row).forEach(function (td) { tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      var foot = document.createElement('tfoot');
      var totalRow = document.createElement('tr');
      totalRow.className = 'results-total';
      var totalHead = document.createElement('th');
      totalHead.scope = 'row';
      totalHead.textContent = 'Total';
      totalRow.appendChild(totalHead);
      resultCells(total).forEach(function (td) { totalRow.appendChild(td); });
      foot.appendChild(totalRow);
      table.appendChild(foot);
      body.appendChild(table);
    }

    function currentReplay() {
      // A hand with nothing recorded (one put back on the table after Back or a
      // refresh, only to look at) has no playback of its own: the stored one is
      // the real one, and an empty file must never replace it.
      if (!game || !game.hand || !game.hand.trace || !game.hand.trace.length) return null;
      if (restoredHand && game.hand === restoredHand) return null;
      return E.makePlayback(game, {
        seat: 0,
        strategies: ui.strategies && ui.strategies.seats ? ui.strategies.seats.slice() : [],
      });
    }

    // The menu offers View playback for a hand with moves on the table, or one
    // put back after a refresh whose playback is stored.
    function menuHasPlayback() {
      if (settings.lesson || settings.playback || !game || !game.hand) return false;
      return !!currentReplay() || !!(restoredHand && game.hand === restoredHand && storedReplay());
    }

    function storedReplay() {
      var stored = readJson(REPLAY_KEY, null);
      var check = stored && E.checkPlayback(stored);
      return check && check.ok ? stored : null;
    }

    // Playback is a view of the game page (?playback=1). It reads the file
    // from storage, so a refresh there opens the same hand, and the game stays
    // in memory under it: no page load, nothing fetched.
    function viewReplay() {
      var file = currentReplay();
      if (file) {
        keepReplay(file);
        if (!liveReplay && !readJson(REPLAY_KEY, null)) return;
      } else if (!storedReplay()) return;
      track('play_view_replay', {});
      if (callbacks.playback) { callbacks.playback(); return; }
      root.location.assign(visitUrl('/playing-mahjong/', { playback: '1' }));
    }

    // Keep a quiet or instant visit quiet on the next page too.
    function visitUrl(path, params) {
      var url = new URL(path, root.location.origin);
      Object.keys(params).forEach(function (key) { url.searchParams.set(key, params[key]); });
      var search = (root.location && root.location.search) || '';
      var sound = /[?&]sound=(0|1)(?:&|$)/.exec(search);
      if (sound) url.searchParams.set('sound', sound[1]);
      if (/[?&]instant=1(?:&|$)/.test(search)) url.searchParams.set('instant', '1');
      return url.pathname + url.search;
    }

    // A discard or robbed-kong win is not in the concealed hand. Remember it
    // so See hands can put that tile back.
    function noteFinishedWin() {
      var trace = game.hand && game.hand.trace;
      if (!trace) return;
      var win = null;
      for (var i = trace.length - 1; i >= 0; i--) if (trace[i].a === 'win') { win = trace[i]; break; }
      if (!win) return;
      if (!game.hand.review) game.hand.review = { mark: null, win: win };
      else if (!game.hand.review.win) game.hand.review.win = win;
    }

    // The results sheet of a finished match keeps a signed playback, so a
    // refresh can put that hand back on the table.
    function saveMatchPlayback() {
      if (!game || !game.over || settings.playback) return;
      noteFinishedWin();
      var file = currentReplay();
      if (file) keepReplay(file);
    }

    // The dealt hand, played to its last move. The save itself keeps no tiles.
    function showFinalMatch() {
      if (!game || !game.over) return false;
      return restoreFinishedHand();
    }

    // The hand that just finished, put back on the table after a refresh from
    // the playback saved when it ended, so Show hands works on its summary.
    function restoreFinishedHand() {
      if (!game) return false;
      if (game.hand) { noteFinishedWin(); return true; }
      var stored = storedReplay();
      if (!stored || stored.payload.handNumber !== game.handNumber) return false;
      try {
        var played = E.playbackGame(stored.payload);
        if (!played || !played.hand) return false;
        game.hand = played.hand;
        // This hand is only put back to look at. It is not a hand in progress,
        // so a save must not store it as one (a second refresh would play it on).
        restoredHand = played.hand;
        // The table was laid out before this hand existed, for the 8 discards
        // a phone's ponds plan for, so a long hand would draw its discards
        // far too large. Fit them to the hand that is here.
        L = computeLayout();
        requestRender();
        return true;
      } catch (err) {
        return false;
      }
    }

    // While this is true, closing the sheet (to look at the hands) is not
    // leaving the results page.
    var resultsStay = false;

    function markResultsOpen(open) {
      if (!game || !game.over || settings.playback) return;
      ui.resultsOpen = !!open;
      if (root.history && root.history.replaceState) {
        var url = new URL(root.location.href);
        if (open) url.searchParams.set('results', '1');
        else url.searchParams.delete('results');
        root.history.replaceState(root.history.state, '', url.pathname + url.search);
      }
      autosave(true);
    }

    function openResults() {
      var dlg = resultsSheet();
      // The game-over standings sit under this sheet, so they must not block it.
      if (!dlg || dlg.open || !game) return;
      if (ui.overlay && ui.overlay.type !== 'gameover') return;
      pinnedTip = null;
      if (game.over) saveMatchPlayback();
      fillResults();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      if (game.over) markResultsOpen(true);
      track('play_open_results', {});
    }

    function closeResults() {
      var dlg = resultsSheet();
      if (!dlg || !dlg.open) return;
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
      track('play_close_results', {});
    }

    function resultsOpen() {
      var dlg = resultsSheet();
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
      if (settings.playback) {
        // The playback bar is Back, the title, Download and Sound. Strategies and
        // Rules aren't here.
        // The title, "Playback Analysis", always shows, on a phone, a tablet
        // and a desktop, with or without a hand loaded. Download and Upload
        // keep their words only when that still leaves the title room;
        // otherwise they are icons.
        var TITLE = 'Playback Analysis';
        var TITLE_ROOM = 150; // the width the title gets before the buttons turn to icons
        var sw = W < 420 ? 66 : 92;
        var right = W - pad;
        var soundX = right - sw;
        button(SOUND_LABELS[soundMode()], soundX, 7, sw, 28, toggleSound, 'ghost', 'sound');
        // Back always goes to the game, however the playback was opened.
        var backW = 64;
        button('Back', pad, 7, backW, 28, function () { sound.play('select'); backToGame(); }, 'ghost', 'review-back');
        var gapL = pad + backW + 8;
        var clusterX = soundX; // the left edge of the buttons on the right
        // View playback (the sheet of recent hands and the upload: each row
        // there has its own Download), then Sound. Words when they leave the
        // title room, an icon when they don't.
        var LIST_W = 136;
        var words = W >= 600 && soundX - 6 - LIST_W - 8 - gapL >= TITLE_ROOM;
        var vpW = words ? LIST_W : 34;
        var vpX = soundX - 6 - vpW;
        button(words ? 'Saved playbacks' : '', vpX, 7, vpW, 28, openPlaybacks, 'ghost', 'review-list');
        clusterX = vpX;
        if (!words) {
          // A list, three rows each with a dot (your saved hands), drawn here so it needs no font.
          ctx.save();
          ctx.strokeStyle = COLORS.white;
          ctx.fillStyle = COLORS.white;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          var ay = 21;
          var lx = vpX + vpW / 2;
          ctx.beginPath();
          [-5, 0, 5].forEach(function (dy) {
            ctx.moveTo(lx - 2, ay + dy); ctx.lineTo(lx + 7, ay + dy);
          });
          ctx.stroke();
          [-5, 0, 5].forEach(function (dy) {
            ctx.beginPath();
            ctx.arc(lx - 6, ay + dy, 1.6, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        }
        // Always centered between Back and the buttons on the right.
        var gapR = clusterX - 8;
        var titleX = (gapL + gapR) / 2;
        var titleW = Math.max(1, gapR - gapL - 8);
        text(TITLE, titleX, 22, { size: fitFont(ctx, TITLE, titleW, 15, FONT_HEAD), family: FONT_HEAD, align: 'center', color: COLORS.cream });
        return;
      }
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
    var PHONE_SCORE_INSET = 22; // the middle of each stack, in from the table's corner
    var SEE_RESULTS_W = 120; // See results, in the coach bar above your avatar
    // cy is the middle the paths are drawn around. A person ends lower than
    // a robot, so each is lifted until its feet share one line.
    function iconCy(seat, bottom, s) {
      var feet = game.players[seat].isHuman ? 0.5 : 0.4;
      return bottom - s * feet;
    }

    // The name is drawn from its middle. This is the lowest painted pixel.
    function paintedBottom(name, y) {
      ctx.textBaseline = 'middle';
      return y + (ctx.measureText(name).actualBoundingBoxDescent || 0);
    }

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
      if (seat === 0 && !settings.review) {
        addRegion(x, y, 2 * r, 2 * r, onMyWind, 'my-wind', true);
        // Auto-play on (localhost): a steady gold ring round your wind.
        if (autoPlay) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x + r, y + r, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.gold;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
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
      var iconY = y + r;
      if (namesShown()) {
        var name = seatTitle(seat);
        var nameRoom = w - (iconX - x) - ICON_GAP - iconS - (pts ? scoreGap + ptsW : 0) - 2;
        var nameSize = fitFont(ctx, name, nameRoom, namePx, FONT_BODY, 'bold');
        text(name, x + 2 * r + 6, y + r + 1, { size: nameSize, weight: 'bold', color: COLORS.cream });
        ctx.font = 'bold ' + nameSize + 'px ' + FONT_BODY;
        iconX += ctx.measureText(name).width + ICON_GAP;
        iconY = iconCy(seat, paintedBottom(name, y + r + 1), iconS);
      }
      playerIcon(seat, iconX, iconY, iconS);
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
    // The tile this replay step just moved, so the table can ring it in gold.
    function reviewMark(seat, id, where) {
      var rev = game && game.hand && game.hand.review;
      var m = rev && rev.mark;
      return !!(id && m && m.seat === seat && m.tile === id && m.where === where);
    }

    // A tile on its way into a face-up hand keeps its place empty until it lands.
    function reviewConcealedHidden(seat, tiles, i) {
      var id = tiles[i];
      var hiddenSeat = ui.hide.hand == null ? 0 : ui.hide.hand;
      if (ui.hide.tile && hiddenSeat === seat && id === ui.hide.tile && i === tiles.lastIndexOf(id)) return true;
      var win = ui.winInHand;
      return !!(win && !win.landed && win.seat === seat && id === win.tile && i === tiles.lastIndexOf(id));
    }

    function revealedConcealed(seat) {
      var res = ui.heldSummary && ui.heldSummary.result;
      if (res && res.type === 'win' && seat === res.winner && res.concealed) return res.concealed.slice();
      var tiles = game.hand.seats[seat].hand.slice();
      // A discard or robbed kong is the winning tile, and it isn't in the hand yet.
      var win = game.hand.review && game.hand.review.win;
      if (win && win.s === seat && (win.how === 'discard' || win.how === 'robKong') && win.t) tiles.push(win.t);
      return E.sortTiles(tiles);
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
          if (reviewMark(seat, x.id, 'meld')) x.glow = COLORS.gold;
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
      drawSeatHeader(seat, r.x + 6, r.y + SIDE_HEAD_TOP + Math.max(1, (r.h - SIDE_HEAD_TOP - row) / 2), Math.max(40, r.w - 12), true);
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
      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
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

    // The largest tile that fits this opponent's one row on a phone.
    function oppRowFit(seat) {
      var f = L.oppFrames[seat], s = game.hand.seats[seat];
      var items = meldItems(seat);
      var meldN = items.filter(function (it) { return !it.gap; }).length;
      var flowersN = s.flowers.length;
      var count = ui.revealHands ? revealedConcealed(seat).length : oppConcealedCount(seat);
      var gaps = items.length - meldN + (flowersN && meldN ? 1 : 0);
      var tileN = meldN + flowersN;
      var units = count + meldN + gaps * MELD_GAP + flowersN + (tileN && count ? 0.6 : 0);
      return clamp(Math.min(
        (f.h - 8) / (TILE_ASPECT + 0.08),
        (f.w - Math.max(0, count + tileN - 1) * tileGap()) / Math.max(1, units)
      ), 8, 40);
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
        // Every opponent's tiles are one size: whatever fits the tightest seat.
        mw = Math.min(oppRowFit(1), oppRowFit(2), oppRowFit(3));
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
        if (faceUp && reviewConcealedHidden(seat, faceUp, i)) continue;
        if (faceUp) drawTile(faceUp[i], backX(i), backsY, bw, { shadow: false, glow: reviewMark(seat, faceUp[i], 'hand') ? COLORS.gold : null });
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
        drawTile(fid, fx + fk * (fw + gapT), meldY, fw, { shadow: false, glow: reviewMark(seat, fid, 'flower') ? COLORS.gold : flowerGlow(s.flowers, wind, fid) });
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
      var topY = p.y + 21, bottomY = p.y + p.h - 21;
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
      roundRect(ctx, p.x, p.y, p.w, p.h, 8);
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
        // On a phone the four winds are one size: the smallest any pile allows.
        if (W < 600) {
          ws = Math.min.apply(null, L.zoneFrames.map(function (zf) { return clamp(Math.min(zf.w, zf.h) * 0.42, 14, 46); }));
        }
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
          if (!glow && i === list.length - 1 && reviewMark(seat, list[i].tile, 'pond')) glow = COLORS.gold;
          drawTile(list[i].tile, slot.x, slot.y, slot.w, { shadow: false, glow: glow });
        }
        ctx.restore();
      }

      if (!L.desktop && settings.mode === 'payout') drawPhoneScores();

      var c0 = L.center;
      var c = { x: c0.x + 4, y: c0.y, w: c0.w - 8, h: c0.h }; // a few pixels narrower than the layout's square
      var lit = hover === 'center';
      // The plaque: a soft dark panel with a fine gold edge.
      ctx.save();
      roundRect(ctx, c.x, c.y, c.w, c.h, 10);
      var plaque = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      plaque.addColorStop(0, lit ? 'rgba(244,160,32,0.30)' : 'rgba(0,0,0,0.30)');
      plaque.addColorStop(1, lit ? 'rgba(244,160,32,0.18)' : 'rgba(0,0,0,0.16)');
      ctx.fillStyle = plaque;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = lit ? 'rgba(255,210,122,0.8)' : 'rgba(255,210,122,0.32)';
      ctx.stroke();
      ctx.restore();
      // Results open from this square only: the wind and the tiles left. A
      // discard tile keeps its own tap, for the tip.
      if (!ui.overlay && !settings.review) addRegion(c.x, c.y, c.w, c.h, function () { sound.play('select'); openResults(); }, 'center');
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      // The round wind, as its tile's character, with the tiles left close under
      // it. The two sit as one group in the middle of the panel.
      var rad = clamp(c.h * 0.25, 11, 26);
      var gw = rad * 1.8, gh = gw * TILE_ASPECT; // the character alone, so a good size
      var visH = gh * 0.716; // the SVG's character fills about this much of its height
      var leftLabel = game.hand.wall.length + ' tiles left';
      var leftSize = fitFont(ctx, leftLabel, c.w - 22, clamp(c.h * 0.15, 10, 13), FONT_BODY); // clear of the side arrows
      var textGap = 3;
      var top = cy - (visH + textGap + leftSize) / 2;
      var glyphY = top + visH / 2;
      var windGlyph = windGlyphSprite(['', 'we', 'ws', 'ww', 'wn'][game.round], gw, gh);
      if (windGlyph) ctx.drawImage(windGlyph, cx - gw / 2, glyphY - gh / 2, gw, gh);
      text(leftLabel, cx, top + visH + textGap + leftSize / 2, { size: leftSize, align: 'center', color: COLORS.cream });

      // Arrow toward whose turn it is, on the plaque's edge nearest that seat.
      // A soft rounded gold point whose glow breathes with the seat's outline.
      if (ui.turnSeat !== null && !ui.overlay) {
        var ang = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][ui.turnSeat];
        var dist = ui.turnSeat % 2 === 0 ? c.h / 2 - 3 : c.w / 2 - 3; // on the plaque's edge, clear of the text
        var breathe = 0.5 + 0.5 * Math.sin(now() / 600);
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(4.5, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5); ctx.closePath();
        var tip = ctx.createLinearGradient(-3, 0, 4.5, 0);
        tip.addColorStop(0, COLORS.gold);
        tip.addColorStop(1, COLORS.goldLight);
        ctx.shadowColor = 'rgba(244,160,32,' + (0.45 + 0.35 * breathe) + ')';
        ctx.shadowBlur = 4 + 3 * breathe;
        ctx.fillStyle = tip;
        ctx.strokeStyle = tip;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.5; // rounds the three corners
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // A tile SVG's character (the file holds only the character) painted gold,
    // at this size. Kept per wind and size, so it is drawn once.
    var glyphCache = {};
    function windGlyphSprite(id, w, h) {
      var img = images[id];
      if (!img || !id) return null;
      var key = id + '|' + Math.round(w * dpr) + '|' + dpr;
      if (glyphCache[key]) return glyphCache[key];
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w * dpr));
      cv.height = Math.max(1, Math.ceil(h * dpr));
      var g = cv.getContext('2d');
      g.drawImage(img, 0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = COLORS.goldLight; // gold, to read on the dark panel
      g.fillRect(0, 0, cv.width, cv.height);
      glyphCache[key] = cv;
      return cv;
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
        drawTile(fid, fx + fk * (fw + tileGap()), y0, fw, { shadow: false, glow: reviewMark(0, fid, 'flower') ? COLORS.gold : flowerGlow(s.flowers, myWind, fid) });
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
        var snap = ui.handLayout !== layoutKey || reviewSnapHand; // a resize, or a replay jump, repositions without sliding
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
        reviewSnapHand = false;
        ui.handSlide = moved ? 0 : 1;
        if (moved) animate(HAND_SLIDE_MS, function (e) { ui.handSlide = e; }, easeInOut);
      }
      if (active && !ui.overlay && targets.length) {
        var bx0 = Infinity, bx1 = -Infinity;
        targets.forEach(function (p) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x + tw); });
        var by0 = targets[0].y;
        ctx.save();
        roundRect(ctx, bx0 - 6, by0 - 8, bx1 - bx0 + 12, L.handY + L.th - by0 + 16, 6);
        ctx.fillStyle = 'rgba(244,160,32,0.14)';
        ctx.fill();
        ctx.restore();
      }
      var heldAt = (ui.hide.tile && (ui.hide.hand == null || ui.hide.hand === 0)) ? tiles.lastIndexOf(ui.hide.tile) : -1;
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
        if (ui.winInHand && !ui.winInHand.landed && ui.winInHand.seat === 0 && id === ui.winInHand.tile && i === tiles.lastIndexOf(id)) continue;
        if (i === order.winAt) glow = COLORS.gold;
        if (!glow && reviewMark(0, id, 'hand')) glow = COLORS.gold;
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
      if (settings.review) { drawReviewCoachBox(); return; }
      var x = L.ox + L.pad, w = L.tableW - 2 * L.pad;
      var lines = [];
      var GRAY = 'rgba(255,248,240,0.5)';
      var note = ui.coach === 'on' ? ui.hint : ui.coach === 'feedback' ? ui.feedback : null;
      var showNotice = ui.notice && !ui.overlay && (ui.turnPrompt || ui.claimPrompt);
      // In Feedback the Chow and Pass buttons already name the tile, so
      // "Claim Five Bamboo?" adds nothing. Win and short-hand notices stay.
      if (ui.coach === 'feedback' && ui.claimPrompt && ui.notice && ui.notice.indexOf('Claim ') === 0) showNotice = false;
      // The note on a tile you've selected to throw ("... is OK, but ...")
      // goes last, running on from the coach's hint in its own color.
      var choiceNote = showNotice && ui.turnPrompt && ui.selected >= 0;
      // A win is one bold sentence. The coach's copy is that same sentence.
      var declaring = ui.notice && ui.notice.indexOf('Mahjong!') === 0;
      // The coach's action (with a question before it on a claim) is the first
      // line, in bold gold. Everything else is one paragraph run on in order
      // with no line breaks: the tips, how to discard on your first move in
      // bold white, and the note on a selected tile in gold. A win is one bold
      // sentence on its own.
      var tips = declaring ? '' : (note && note.tips && note.tips.length ? note.tips.join(' ') : '');
      // Your first move of a game also says how to discard.
      var firstMove = !settings.lesson && ui.coach === 'on' && ui.turnPrompt && game && game.handNumber === 1 && !game.hand.seats[0].discards.length;
      var parts = [], head = [];
      if (declaring) {
        lines.push({ text: ui.notice, color: COLORS.goldLight, bold: true, nowrap: true });
      } else {
        // On a claim the question and the coach's answer are both bold, such as "Claim One Circle? Chow 1-2-3 Circles."
        var claimAsk = showNotice && ui.claimPrompt && ui.coach === 'on' && note && note.action;
        if (showNotice && !choiceNote) head.push({ text: ui.notice, color: COLORS.goldLight, bold: !!claimAsk });
        if (note && note.action) head.push({ text: note.action, color: COLORS.goldLight, bold: true });
        if (tips) parts.push({ text: tips, color: COLORS.cream });
        if (firstMove && note && note.action) parts.push({ text: TAP_TWICE, color: COLORS.white, bold: true });
        if (choiceNote) parts.push({ text: ui.notice, color: COLORS.goldLight });
        if (!note) {
          // Nothing to say right now: say what this box is for, in gray.
          if (ui.coach === 'off') {
            parts.push({ text: 'The coach is off. Click the Coach button at the top to turn it on and get advice on every move, or switch it to Feedback to learn from the moves you\'ve made.', color: GRAY });
          } else if (ui.coach === 'feedback') {
            parts.push({ text: 'Feedback is on. After you make a move, the coach will tell you how it went so you can learn from it.', color: GRAY });
            parts.push({ text: TAP_TWICE, color: GRAY, bold: true });
          } else {
            parts.push({ text: 'The coach gives advice here on your turn and when you can claim a tile.', color: GRAY });
          }
        }
      }
      // Parts run on as one line or paragraph, each keeping its color and weight.
      function pushRun(list) {
        if (!list.length) return;
        var runs = [], joined = '', plainAt = 0;
        list.forEach(function (pt, k) {
          if (k) { joined += ' '; plainAt += 1; }
          runs.push({ from: plainAt, color: pt.color, bold: !!pt.bold }); // plain-text positions, so hand-name marks don't shift them
          joined += pt.text;
          plainAt += coachPieces(pt.text).plain.length;
        });
        lines.push({ text: joined, color: list[0].color, runs: runs });
      }
      pushRun(head);
      pushRun(parts);
      var iconS = Math.min(L.hintH - 14, 48);
      var tx = x + 8 + iconS + 8;
      // See results sits above your avatar, to the right of this note, so the note stops short of it.
      var reserve = 0;
      if (ui.revealHands && !settings.review && !ui.overlay && seeResultsHome() === 'bar') {
        var spot = seeResultsBarPlace({ x: x, y: 0, w: w, h: L.hintH });
        reserve = x + w - spot.x + 8;
      }
      var tw = w - (tx - x) - 10 - reserve;
      var baseSize = !L.desktop ? 11 : L.tableW < 600 ? 12 : 13; // smaller on a phone
      // The box keeps its height. A longer note shrinks the text until it fits.
      function layout(size) {
        var out = [];
        lines.forEach(function (l) {
          var lineSize = l.nowrap ? fitFont(ctx, coachPieces(l.text).plain, tw, size, FONT_BODY, 'bold') : size;
          ctx.font = (l.bold ? 'bold ' : '') + lineSize + 'px ' + FONT_BODY;
          // Hand-pattern names and their faan, such as All Triplets (3 faan), are red.
          var piece = coachPieces(l.text, l.color);
          var plain = piece.plain, red = piece.red;
          var cursor = 0;
          var runAt = function (pos) {
            var run = null;
            (l.runs || []).forEach(function (r) { if (r.from <= pos) run = r; });
            return run;
          };
          var weightAt = function (pos) { var r = runAt(pos); return r ? r.bold : !!l.bold; };
          var chunks = l.nowrap ? [plain] : l.runs ? wrapRuns(ctx, plain, tw, weightAt, lineSize) : wrapText(ctx, plain, tw);
          chunks.forEach(function (ln) {
            var at = plain.indexOf(ln, cursor);
            cursor = at + ln.length;
            var segs = [], pos = at;
            // Plain text in the line's color, changing to a run's color from where it starts.
            var pushPlain = function (a, b) {
              var cuts = (l.runs || []).map(function (r) { return r.from; }).filter(function (c) { return c > a && c < b; });
              var from = a;
              cuts.concat([b]).forEach(function (cut) {
                var run = runAt(from);
                if (cut > from) segs.push({ text: plain.slice(from, cut), color: run ? run.color : l.color, bold: weightAt(from) });
                from = cut;
              });
            };
            red.forEach(function (r) {
              var a = Math.max(r[0], at), b = Math.min(r[1], at + ln.length);
              if (b <= a) return;
              if (a > pos) pushPlain(pos, a);
              segs.push({ text: plain.slice(a, b), color: COLORS.redLight, bold: weightAt(a) });
              pos = b;
            });
            if (pos < at + ln.length) pushPlain(pos, at + ln.length);
            out.push({ segs: segs, bold: l.bold, size: lineSize });
          });
        });
        return out;
      }
      var size = baseSize, out, lh;
      for (;;) {
        out = layout(size);
        lh = (out.length === 1 && out[0].size ? out[0].size : size) + 3;
        if (out.length * lh + 12 <= L.hintH || size <= 8) break;
        size -= 0.5;
      }
      var h = L.hintH;
      var y = L.hintY;
      ui.coachBox = { x: x, y: y, w: w, h: h };
      ctx.save();
      roundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
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
          var bold = sg.bold !== undefined ? sg.bold : l.bold;
          text(sg.text, cx, startY + i * lh, { size: l.size || size, color: sg.color, weight: bold ? 'bold' : '' });
          ctx.font = (bold ? 'bold ' : '') + (l.size || size) + 'px ' + FONT_BODY;
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
    function handMoveNumber(list, hand) {
      return list.filter(function (e) { return e.hand === hand; }).length + 1;
    }

    function hintList(id) {
      return ui.hintLists[id] || (ui.hintLists[id] = []);
    }

    function saveHints() {
      if (settings.lesson || settings.playback || settings.review) return;
      writeJson(HINTS_KEY, { v: 1, lists: ui.hintLists });
    }

    // The stored lists, as long as every note in them reads back whole.
    function keptHints(raw) {
      var out = {};
      if (!raw || raw.v !== 1 || !raw.lists || typeof raw.lists !== 'object') return out;
      Strategies.ids().forEach(function (id) {
        var list = raw.lists[id];
        if (!Array.isArray(list)) return;
        out[id] = list.filter(function (e) {
          return e && (e.kind === 'hint' || e.kind === 'feedback') && typeof e.action === 'string'
            && typeof e.detail === 'string' && typeof e.move === 'number' && typeof e.hand === 'number';
        }).slice(-200);
      });
      return out;
    }

    // The advice from every strategy for the move in front of you.
    function hintsForAll(kind, opts) {
      var out = {};
      Strategies.ids().forEach(function (id) {
        var coach = Coach.forStrategy(Strategies.get(id).bot);
        try { out[id] = kind === 'turn' ? coach.turnHint(game, 0, opts) : coach.claimHint(game, 0, opts); }
        catch (err) { out[id] = null; }
      });
      return out;
    }

    // Puts a note on each strategy's own list. `notes` is by strategy id.
    function rememberAll(notes, kind) {
      Strategies.ids().forEach(function (id) { rememberCoach(notes[id], kind, id); });
      saveHints();
    }

    function rememberCoach(note, kind, id) {
      var plain = coachPlain(note);
      if (!plain) return;
      var list = hintList(id || ui.strategies.coach);
      var hand = game ? game.handNumber : 1; // cleared when the next hand is dealt
      // The same suggestion, with "N tiles from ready" moved to the end.
      function sameAdvice(detail) {
        var norm = function (s) {
          return String(s).replace(/\s*(?:\d+ tiles|1 tile) from ready\./g, '').replace(/\s+/g, ' ').trim();
        };
        return norm(detail) === norm(plain.detail);
      }
      var last = list[list.length - 1];
      if (last && last.kind === kind && last.hand === hand && last.action === plain.action && sameAdvice(last.detail)) {
        if (last.detail !== plain.detail) {
          last.detail = plain.detail;
          ui.coachStick = true;
        }
        var prev = list[list.length - 2];
        if (prev && prev.kind === kind && prev.hand === hand && prev.action === plain.action && sameAdvice(prev.detail)) {
          list.splice(list.length - 2, 1);
          ui.coachStick = true;
        }
        return;
      }
      list.push({ kind: kind, action: plain.action, detail: plain.detail, move: handMoveNumber(list, hand), hand: hand });
      if (list.length > 200) list.shift();
      ui.coachStick = true;
    }

    // The note on the table is still current, so the panel lists only earlier ones.
    function pastCoachEntries() {
      // Playback lists every note up to the move on the table. The live caption
      // is the move itself, not a coach note, so it must not hide the latest one.
      if (settings.review) return ui.coachLog;
      // The shown coach's list, for this hand. The panel is this hand only.
      var hand = game ? game.handNumber : 1;
      var entries = hintList(ui.strategies.coach).filter(function (e) { return e.hand === hand; });
      // Without the bar (a landscape phone), the column shows the live note too.
      if (!L.hintH) return entries;
      var live = coachPlain(ui.coach === 'on' ? ui.hint : ui.coach === 'feedback' ? ui.feedback : null);
      if (!live || !entries.length) return entries;
      var last = entries[entries.length - 1];
      // Move 1 of a hand stays in the panel, in yellow, even while that note is still on the table.
      if (last.move !== 1 && last.action === live.action && last.detail === live.detail) return entries.slice(0, -1);
      return entries;
    }

    // Copies `text` during the click. The clipboard API needs a secure page;
    // the fallback covers plain http, where a phone on the local network is.
    function copyText(text) {
      var fallback = function () {
        return new Promise(function (resolve, reject) {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.top = '0';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
          document.body.removeChild(ta);
          if (canvas && canvas.focus) canvas.focus();
          ok ? resolve() : reject(new Error('copy failed'));
        });
      };
      var clip = root.navigator && navigator.clipboard && navigator.clipboard.writeText;
      if (!clip) return fallback();
      return navigator.clipboard.writeText(text).catch(fallback);
    }

    // Tapping your wind badge copies the hand seed (payload.handSeed, such as
    // 919942249-NE), and nothing else. No message. The badge flashes on the click.
    // The seed the badge could not copy at the press itself. Some browsers
    // (Safari) only allow the clipboard from a click, which comes just after the
    // press the table reacts to, so it is tried again there.
    var pendingCopy = null;
    function onCanvasClick() {
      // Phones only open the file picker from the click itself, not the pointer-up before it.
      if (!pendingCopy) return;
      var text = pendingCopy;
      pendingCopy = null;
      copyText(text).then(function () {}, function () {});
    }

    /* Auto-play, for testing on localhost only: with the coach on, clicking
       your wind badge has the coach's strategy play your moves (each one
       through the same buttons and animations as a click), hand after hand,
       until it is clicked again or the coach is turned off. Anywhere else,
       and with the coach off, the badge copies the hand seed as usual. */
    var autoPlay = false;
    var autoTimer = null;
    var autoAgents = {};
    function localDev() {
      return isLocalHost((root.location && root.location.hostname) || '');
    }

    function canAutoPlay() {
      return localDev() && !settings.review && !settings.playback && !settings.lesson && ui.coach !== 'off';
    }

    function onMyWind() {
      if (autoPlay || canAutoPlay()) { toggleAutoPlay(); return; }
      copySeed();
    }

    // Every flight in progress ends at once, and any banner or confetti on screen goes.
    function finishAnimations() {
      var running = anims.splice(0);
      running.forEach(function (a) {
        a.step(1, 1);
        a.done();
      });
      banners.length = 0;
      particles.length = 0;
      requestRender();
    }

    // Off, with nothing queued. Auto-play is never kept: it is off on every
    // load, and a page the browser brings back from its frozen-page cache
    // (Back) or sends away (pagehide) is switched off too.
    function stopAutoPlay() {
      var was = autoPlay;
      autoPlay = false;
      clearTimeout(autoTimer);
      autoTimer = null;
      if (was) requestRender();
    }

    function toggleAutoPlay() {
      autoPlay = !autoPlay;
      sound.play('select');
      clearTimeout(autoTimer);
      var coachName = Strategies.get(ui.strategies.coach).name;
      announce(autoPlay ? 'Auto-play on: ' + coachName + ' plays your moves. Click your wind to stop.' : 'Auto-play off.');
      track('play_autoplay', { on: autoPlay });
      // Whatever is mid-flight lands now, so the first auto move isn't held up by it.
      if (autoPlay) finishAnimations();
      if (autoPlay) autoStep();
      requestRender();
    }

    function coachAgent() {
      var id = ui.strategies.coach;
      if (!autoAgents[id]) autoAgents[id] = Strategies.createAgent(id);
      return autoAgents[id];
    }

    // The next move, a moment after the prompt appears, so each one can be seen.
    function autoStep() {
      clearTimeout(autoTimer);
      if (!autoPlay) return;
      if (!canAutoPlay()) { autoPlay = false; announce('Auto-play off.'); requestRender(); return; }
      autoTimer = setTimeout(autoMove, instantMode() ? 30 : 650);
    }

    function autoMove() {
      autoTimer = null;
      if (!autoPlay || destroyed || !game || !game.hand) return;
      if (!canAutoPlay()) { autoPlay = false; requestRender(); return; }
      // The hand's results: on to the next hand after a look (the last hand's end stops it).
      if (ui.overlay && ui.overlay.type === 'summary' && !ui.overlay.playback) {
        if (game.over) { autoPlay = false; requestRender(); return; }
        autoTimer = setTimeout(function () {
          if (autoPlay && ui.overlay && ui.overlay.type === 'summary') nextHand();
        }, instantMode() ? 50 : 1800);
        return;
      }
      if (ui.overlay) return; // the menu, say: wait for it to close
      var turn = ui.turnPrompt, claim = ui.claimPrompt;
      if (!turn && !claim) return;
      var agent = coachAgent();
      Promise.resolve(turn ? agent.turn(game, 0, turn.opts) : agent.claim(game, 0, claim.opts)).then(function (d) {
        if (!autoPlay || destroyed || !d) return;
        if (turn && ui.turnPrompt === turn) {
          if (d.type === 'discard') {
            var idx = myHandOrder().tiles.indexOf(d.tile);
            if (idx < 0) return;
            ui.selected = idx;
            discardSelected(false);
          } else {
            resolveTurn(d);
          }
        } else if (claim && ui.claimPrompt === claim) {
          resolveClaim(d);
        }
      }, function () {});
    }

    function copySeed() {
      if (!game || !game.hand) return;
      var file;
      try {
        file = currentReplay() || storedReplay(); // this hand as it stands now
      } catch (err) { return; }
      if (!file || !file.payload || !file.payload.handSeed) return;
      track('play_copy_seed', {});
      animate(520, function (e) { ui.windFlash = 1 - e; });
      var seed = String(file.payload.handSeed);
      pendingCopy = seed;
      copyText(seed).then(function () { pendingCopy = null; }, function () { /* tried again on the click */ });
    }

    // Older notes start at the top and later ones follow downward.
    function drawCoachHistory() {
      var r = L.history;
      if (!r) return;
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      ctx.restore();
      var coachName = Strategies.get(ui.strategies.coach).name;
      var coachTitle = 'Coach ' + coachName;
      var titleMax = r.w - 28;
      if (ui.revealHands && !settings.review && !ui.overlay && seeResultsHome() === 'column') titleMax -= Math.min(SEE_RESULTS_W, r.w - 24) + 8;
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
        var empty = settings.review
          ? (reviewCoaches[ui.strategies.coach] && reviewCoaches[ui.strategies.coach].index < reviewStep ? 'Reading your moves...' : 'Feedback on your moves shows here.')
          : 'Hints and feedback will collect here.';
        wrapText(ctx, empty, viewW - 8).forEach(function (ln, i) {
          text(ln, viewX + 4, viewY + 14 + i * lh, { size: size, color: 'rgba(255,248,240,0.5)' });
        });
      }
      var y = viewY - ui.coachScroll;
      ui.coachHits = [];
      blocks.forEach(function (b) {
        if (settings.review && typeof b.entry.step === 'number') {
          ui.coachHits.push({ x: viewX, y: Math.max(y, viewY), w: viewW, h: Math.min(y + b.h, viewY + viewH) - Math.max(y, viewY), step: b.entry.step });
        }
        roundRect(ctx, viewX, y, viewW - (ui.coachScrollMax > 0 ? 8 : 0), b.h, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
        if (images.logo) {
          var logoH = avatar * (images.logo.height / images.logo.width || 1);
          ctx.drawImage(images.logo, viewX + 8, y + (b.h - logoH) / 2, avatar, logoH);
        }
        var blockH = b.lines.length * lh;
        var startY = y + (b.h - blockH) / 2 + lh / 2;
        var rightX = viewX + viewW - (ui.coachScrollMax > 0 ? 8 : 0) - 10;
        var moveColor = b.entry.move === 1 ? COLORS.goldLight : 'rgba(255,248,240,0.6)';
        text(b.moveLabel, rightX, startY, { size: size - 2, color: moveColor, align: 'right' });
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

    // The step each strategy's discard is read from: the hand on the table
    // when you are about to discard, else the one just before your latest
    // discard (or your first one, if you haven't discarded yet), so the boxes
    // always show a tile, as they do in a game.
    function reviewSourceStep() {
      if (!settings.review || !game || !game.hand) return null;
      if (game.hand.seats[0].hand.length % 3 === 2) return reviewStep;
      var actions = settings.review.actions;
      var limit = reviewMoves();
      for (var i = Math.min(reviewStep, limit) - 1; i >= 0; i--) {
        if (actions[i].a === 'discard' && actions[i].s === 0) return i;
      }
      for (var j = Math.max(0, reviewStep); j < limit; j++) {
        if (actions[j].a === 'discard' && actions[j].s === 0) return j;
      }
      return null;
    }

    function reviewStrategyRows() {
      var at = reviewSourceStep();
      if (reviewPicks && reviewPicks.step === at) return reviewPicks.rows;
      var source = null;
      if (at !== null) {
        try { source = E.playbackGame(settings.review, at); } catch (err) { source = null; }
      }
      var rows = Strategies.list().map(function (s) {
        var tile = null;
        if (source) {
          try {
            var found = s.bot.analyzeDiscards(source, 0);
            var top = found && found.candidates && found.candidates[0];
            tile = top ? top.tile : null;
          } catch (err) { tile = null; }
        }
        return { id: s.id, name: s.name, tile: tile };
      });
      reviewPicks = { step: at, rows: rows };
      return rows;
    }

    // The chow, pung, kong, or pass on the table right now.
    function claimOffer() {
      return ui.claimPrompt && ui.claimPrompt.opts;
    }

    function claimText(decision, opts) {
      if (!decision) return null;
      if (decision.type === 'chow') {
        var seq = E.sortTiles((decision.tiles || []).concat([opts.tile])).map(function (id) {
          return E.rankOfIndex(E.tileIndex(id));
        }).join('-');
        return 'Chow ' + seq;
      }
      if (decision.type === 'pung') return 'Pung';
      if (decision.type === 'kong') return kongLabel(opts && opts.tile);
      if (decision.type === 'pass') return 'Pass';
      if (decision.type === 'win') return 'Win';
      return null;
    }

    // What you are about to throw, or the claim in front of you, so a copied
    // hand can be read without moving the coach's plan on the real tiles.
    function liveDiscardSignature() {
      if (!game || !game.hand) return '';
      var seat = game.hand.seats[0];
      var offer = claimOffer();
      if (!offer && seat.hand.length % 3 !== 2) return '';
      var body = seat.hand.join(',') + '|'
        + seat.melds.map(function (m) { return m.type + m.tiles.join(''); }).join(';') + '|'
        + game.hand.wall.length + '|'
        + game.hand.seats.map(function (s) {
          return s.discards.map(function (d) { return d.tile; }).join('');
        }).join('/');
      if (!offer) return 'discard|' + body;
      var chows = (offer.chows || []).map(function (pair) { return pair.join(','); }).join(';');
      return 'claim|' + offer.tile + '|' + (offer.pung ? 1 : 0) + (offer.kong ? 1 : 0) + (offer.win ? 1 : 0) + '|' + chows + '|' + body;
    }

    function strategyChoice(bot, handCopy, offer) {
      try {
        if (offer) return { tile: null, action: claimText(bot.chooseClaim(game, 0, offer), offer) };
        if (!handCopy) return { tile: null, action: null };
        var found = bot.analyzeDiscards(game, 0, null, handCopy);
        var top = found && found.candidates && found.candidates[0];
        return { tile: top ? top.tile : null, action: null };
      } catch (err) {
        return { tile: null, action: null };
      }
    }

    // The tile each strategy would throw from the hand you have right now.
    function strategyDiscardRows() {
      var handCopy = game.hand.seats[0].hand.slice();
      return Strategies.list().map(function (s) {
        var pick = strategyChoice(s.bot, handCopy, null);
        return { id: s.id, name: s.name, tile: pick.tile, action: null };
      });
    }

    function liveStrategyRows() {
      // Feedback looks back at the discard you just made, not at the next one.
      if (ui.coach === 'feedback') {
        return ui.feedbackDiscards || Strategies.list().map(function (s) {
          return { id: s.id, name: s.name, tile: null, action: null };
        });
      }
      // A winning hand is the one recommendation, whatever each strategy would throw.
      var canWin = (ui.turnPrompt && ui.turnPrompt.opts && ui.turnPrompt.opts.win)
        || (ui.claimPrompt && ui.claimPrompt.opts && ui.claimPrompt.opts.win);
      if (canWin) {
        return Strategies.list().map(function (s) { return { id: s.id, name: s.name, tile: null, action: 'Win' }; });
      }
      var sig = liveDiscardSignature();
      if (livePicks && livePicks.sig === sig) return livePicks.rows;
      var offer = claimOffer();
      var sourceHand = !offer && sig ? game.hand.seats[0].hand.slice() : null;
      var rows = Strategies.list().map(function (s) {
        var pick = strategyChoice(s.bot, sourceHand, offer);
        return { id: s.id, name: s.name, tile: pick.tile, action: pick.action };
      });
      livePicks = { sig: sig, rows: rows };
      return rows;
    }

    // Every strategy, and the tile it would discard, or the claim it would make.
    // Clicking one makes it the coach.
    function drawStrategyPanel() {
      var p = L.strategyPanel;
      if (!p || !(settings.review || (game && game.hand))) return;
      ctx.save();
      roundRect(ctx, p.x, p.y, p.w, p.h, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fill();
      ctx.restore();
      var strip = !!p.phone; // the phone strip has no heading
      var small = strip || p.h < 150; // the strip and the half-height column panel
      if (!strip) {
        text('Strategies', p.x + 14, p.y + (small ? 14 : 18), {
          size: fitFont(ctx, 'Strategies', Math.max(40, p.w - 28), small ? 12 : 14, FONT_HEAD, 'bold'),
          weight: 'bold', family: FONT_HEAD, color: COLORS.cream,
        });
      }
      var rows = settings.review ? reviewStrategyRows() : liveStrategyRows();
      if (!rows.length) return;
      var gap = 8;
      var colW = (p.w - gap * (rows.length + 1)) / rows.length;
      var nameH = strip ? 14 : small ? 16 : 22;
      var topPad = strip ? 3 : small ? 4 : 8; // above the strategy name, like the pad under the tile
      var headH = strip ? 4 : small ? 24 : 34;
      var y = p.y + headH;
      var h = Math.max(36, p.h - headH - (strip ? 4 : small ? 5 : 8));
      rows.forEach(function (row, i) {
        var x = p.x + gap + i * (colW + gap);
        var on = row.id === ui.strategies.coach;
        var hot = hover === 'strategy-' + row.id;
        ctx.save();
        roundRect(ctx, x, y, colW, h, 6);
        ctx.fillStyle = on ? 'rgba(244,160,32,0.16)' : (hot ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)');
        ctx.fill();
        if (on) {
          ctx.strokeStyle = COLORS.gold;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
        var label = row.name;
        text(label, x + colW / 2, y + topPad + nameH / 2 + 2, {
          size: fitFont(ctx, label, colW - 12, strip ? 11 : small ? 12 : 14, FONT_BODY, 'bold'),
          weight: 'bold', align: 'center',
          color: on ? COLORS.gold : COLORS.cream,
        });
        var tileRoom = h - topPad - nameH - (strip ? 3 : small ? 4 : 8);
        var color = on ? COLORS.gold : COLORS.cream;
        if (row.action) {
          var maxW = Math.max(24, colW - 10);
          var one = strip ? 10 : small ? 13 : 15, many = strip ? 10 : small ? 12 : 13; // on a phone every line but the name is 10
          ctx.font = 'bold ' + one + 'px ' + FONT_BODY;
          var lines = ctx.measureText(row.action).width <= maxW ? [row.action] : wrapText(ctx, row.action, maxW);
          var size = lines.length > 1 ? many : one;
          var lh = size + 3;
          var start = y + topPad + nameH + (tileRoom - lines.length * lh) / 2 + lh / 2;
          lines.forEach(function (ln, n) {
            text(ln, x + colW / 2, start + n * lh, { size: size, weight: 'bold', align: 'center', color: color });
          });
        } else {
          var labelH = strip ? 12 : small ? 15 : 22; // "Discard" under the tile, with a little above it
          var fit = Math.min(colW - 16, (tileRoom - labelH) / TILE_ASPECT);
          var tw = fit * 0.84;
          if (row.tile && tw >= 16) {
            var tx = x + (colW - tw) / 2;
            var ty = y + topPad + nameH + (tileRoom - labelH - tw * TILE_ASPECT) / 2;
            drawTile(row.tile, tx, ty, tw);
            text('Discard', x + colW / 2, ty + tw * TILE_ASPECT + labelH / 2 + 4, {
              size: fitFont(ctx, 'Discard', colW - 12, strip ? 10 : small ? 11 : 13, FONT_BODY, strip ? '' : 'bold'),
              weight: strip ? '' : 'bold', align: 'center', color: on ? COLORS.gold : COLORS.cream,
            });
          } else if (ui.coach === 'feedback' && !settings.review) {
            // Feedback looks back, so before your discard there is nothing to show.
            var waiting = 'Discard tile for feedback';
            var wmax = Math.max(24, colW - 12);
            var wsize = strip ? 10 : 13;
            ctx.font = wsize + 'px ' + FONT_BODY;
            var wlines = wrapText(ctx, waiting, wmax);
            var wlh = wsize + 3;
            var wstart = y + topPad + nameH + (tileRoom - wlines.length * wlh) / 2 + wlh / 2;
            wlines.forEach(function (ln, n) {
              text(ln, x + colW / 2, wstart + n * wlh, { size: wsize, align: 'center', color: 'rgba(255,248,240,0.6)' });
            });
          } else {
            text('—', x + colW / 2, y + topPad + nameH + tileRoom / 2, { size: strip ? 10 : 16, align: 'center', color: COLORS.cream });
          }
        }
        addRegion(x, y, colW, h, function () { chooseCoach(row.id); }, 'strategy-' + row.id);
      });
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
          acts.push({ id: 'kong-' + k.tile, label: kongLabel(k.tile), style: 'primary', fn: function () { resolveTurn({ type: 'kong', tile: k.tile }); } });
        });
        if (ui.selected >= 0) {
          acts.push({ id: 'discard', label: 'Discard', style: 'light', fn: function () { discardSelected(true); } });
        }
      } else if (ui.claimPrompt) {
        var c = ui.claimPrompt.opts;
        if (c.win) acts.push({ id: 'win', label: winButtonLabel(c.win), style: 'gold', fn: function () { resolveClaim({ type: 'win' }); } });
        if (c.kong) acts.push({ id: 'kong-' + c.tile, label: kongLabel(c.tile), style: 'primary', fn: function () { resolveClaim({ type: 'kong' }); } });
        if (c.pung) acts.push({ id: 'pung', label: 'Pung', style: 'primary', fn: function () { resolveClaim({ type: 'pung' }); } });
        c.chows.forEach(function (pair) {
          var seq = E.sortTiles(pair.concat([c.tile])).map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
          acts.push({ id: 'chow-' + seq, label: 'Chow ' + seq, style: 'primary', fn: function () { resolveClaim({ type: 'chow', tiles: pair }); } });
        });
        acts.push({ id: 'pass', label: 'Pass', style: 'white', fn: function () { resolveClaim({ type: 'pass' }); } });
      }
      if (!acts.length) { setButtonsOverName(false); return; }
      var phone = W < 600; // smaller buttons on a phone
      var h = phone ? 30 : 38;
      var gap = phone ? 6 : 8;
      // When claiming, show the tile that is up for grabs beside the buttons.
      var claimTile = ui.claimPrompt ? ui.claimPrompt.opts.tile : null;
      var ctw = claimTile ? Math.min(phone ? 24 : 30, (L.actionsH - 4) / TILE_ASPECT) : 0;
      var lead = claimTile ? ctw + 10 : 0;
      ctx.font = 'bold ' + (phone ? 12 : 15) + 'px ' + FONT_BODY;
      // Each button is only as wide as its label.
      var widths = acts.map(function (a) { return Math.ceil(ctx.measureText(a.label).width) + (phone ? 20 : 28); });
      var buttonsW = widths.reduce(function (sum, w) { return sum + w; }, 0) + gap * (acts.length - 1);
      var x0 = L.meX + L.pad, x1 = L.meX + L.meW - L.pad, rowY = L.actionsY;
      var free = ui.meRowFree;
      var cover = null;
      if (L.actionsInRow && free) {
        if (free.x1 - free.x0 - lead >= buttonsW) {
          // Centered on your whole row when nothing there collides with them
          // (your name sits to one side); otherwise centered in the room left.
          var midX = (L.meX + L.pad + L.meX + L.meW - L.pad) / 2;
          var groupW = buttonsW + lead;
          if (midX - groupW / 2 >= free.x0 && midX + groupW / 2 <= free.x1) { x0 = L.meX + L.pad; x1 = L.meX + L.meW - L.pad; }
          else { x0 = free.x0; x1 = free.x1; }
        }
        else if (L.meX + L.meW - L.pad - free.x0 - lead >= buttonsW) {
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
      if (buttonsW > maxW) {
        var inner = buttonsW - gap * (acts.length - 1);
        var scale = inner > 0 ? (maxW - gap * (acts.length - 1)) / inner : 1;
        widths = widths.map(function (w) { return Math.max(36, w * scale); });
        buttonsW = widths.reduce(function (sum, w) { return sum + w; }, 0) + gap * (acts.length - 1);
      }
      var x = x0 + (x1 - x0 - buttonsW - lead) / 2 + lead;
      var y = rowY + (L.actionsH - h) / 2;
      if (claimTile) {
        drawTile(claimTile, x - lead, rowY + (L.actionsH - ctw * TILE_ASPECT) / 2, ctw, { glow: COLORS.red });
      }
      var hintDecision = ui.coach === 'on' && ui.hint && ui.hint.decision;
      var cursor = x;
      acts.forEach(function (a, i) {
        var id = a.id || ('act-' + i);
        var recommended = hintDecision && labelMatches(a.label, hintDecision);
        button(a.label, cursor, y, widths[i], h, a.fn, a.style, id, recommended);
        cursor += widths[i] + gap;
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

    // Two characters: the rank, then the suit. 9C, 5D, 3B, EW, RD.
    function shortName(id) {
      var i = E.tileIndex(id);
      if (i < 27) return E.rankOfIndex(i) + { c: 'C', d: 'D', b: 'B' }[E.suitOfIndex(i)];
      return { we: 'EW', ws: 'SW', ww: 'WW', wn: 'NW', dw: 'WD', dg: 'GD', dr: 'RD' }[id] || '';
    }

    function kongLabel(id) {
      var code = shortName(id);
      return code ? 'Kong ' + code : 'Kong';
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
      roundRect(ctx, r.x, r.y, r.w, r.h, 9);
      ctx.fillStyle = COLORS.cream;
      ctx.fill();
      ctx.restore();
    }

    // The green sheet the Results window uses: a deep green with a gold edge.
    function drawSheetBg(r) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 18;
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      var g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.35, 10, r.x + r.w / 2, r.y + r.h * 0.35, Math.max(r.w, r.h) * 0.75);
      g.addColorStop(0, '#127048');
      g.addColorStop(1, '#074029');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.gold;
      ctx.stroke();
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
      text(str.toUpperCase(), x, y, { size: 11, weight: 'bold', color: 'rgba(255,248,240,0.6)' });
    }

    var SUMMARY_PAD = 24; // above the title and below the buttons

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
      // View playback opens this hand's playback. On a phone every button is
      // the same size on its own row, Next hand first. Elsewhere they share a row.
      if (o.hasPlayback === undefined) o.hasPlayback = !settings.lesson && !!(currentReplay() || storedReplay());
      var phoneStack = W < 600;
      var haveHand = !!(game && game.hand);
      var buttonCount = 1 + (haveHand ? 1 : 0) + (o.hasPlayback ? 1 : 0);
      var threeButtons = !phoneStack && o.hasPlayback && haveHand && w >= 490;
      var playbackRow = phoneStack ? (buttonCount - 1) * 58 : (o.hasPlayback && !threeButtons ? 50 : 0);
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
        // The title and its line, then a gap above the buttons and the same room below them as above the title.
        var h = SUMMARY_PAD + 68 + (isWin ? 14 : 0) + handH + flowerH + (isWin ? 18 : 0) + bodyH + (o.extra ? 28 : 0) + 58 + playbackRow + SUMMARY_PAD;
        lay = { rh: c.rh, tw: tw, fw: fw, h: h };
        return h <= H - 24;
      });

      // Very short screens (landscape phones) shrink the whole panel to fit.
      var k = Math.min(1, (H - 24) / lay.h);
      var r = { x: (W - pw) / 2, y: (H - lay.h) / 2, w: pw, h: lay.h };
      // Where the panel really is once it has been scaled to fit, for a click outside it.
      ui.overlayBox = { x: W / 2 + (r.x - W / 2) * k, y: H / 2 + (r.y - H / 2) * k, w: r.w * k, h: r.h * k };
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -H / 2);
      drawSheetBg(r);
      var x = r.x + pad;
      var cx = r.x + r.w / 2;
      var y = r.y + SUMMARY_PAD + 10; // the title's letters start at the padding

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
      text(title, cx, y, { size: fitFont(ctx, title, w, 26, FONT_HEAD), family: FONT_HEAD, align: 'center', color: COLORS.goldLight });
      y += 15 + 18;
      text(sub, cx, y, { size: fitFont(ctx, sub, w, 13, FONT_BODY), align: 'center', color: 'rgba(255,248,240,0.75)' });
      y += 11 + 14;

      if (isWin) {
        // The hand sits on its own felt strip; the winning tile gets a gold caret.
        var tw = lay.tw, th = tw * TILE_ASPECT;
        var stripH = th + 26;
        roundRect(ctx, x, y, w, stripH, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
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
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            roundRect(ctx, colX - 8, y, colW + 16, rh, 3);
            ctx.fill();
          }
          var my = y + rh / 2;
          var faanLabel = it.faan >= 13 ? 'Limit' : it.faan + ' faan';
          ctx.font = 'bold 15px ' + FONT_BODY;
          var faanW = ctx.measureText(faanLabel).width + 12;
          var ns = fitFont(ctx, it.name, colW - faanW - 40, 15, FONT_BODY);
          text(it.name, colX, my, { size: ns, color: COLORS.cream });
          ctx.font = ns + 'px ' + FONT_BODY;
          text(faanLabel, colX + colW, my, { size: 15, weight: 'bold', align: 'right', color: it.faan ? COLORS.cream : 'rgba(255,248,240,0.55)' });
          y += rh;
        });
        y += 6;
        ctx.fillStyle = 'rgba(255,210,122,0.4)';
        ctx.fillRect(colX, y, colW, 1);
        y += 6;
        var totalLabel = res.score.faan >= 13 ? res.score.faan + ' faan · limit' : res.score.faan + ' faan';
        text('Total', colX, y + 13, { size: 17, weight: 'bold', color: COLORS.white });
        text(totalLabel, colX + colW, y + 13, { size: 17, weight: 'bold', align: 'right', color: COLORS.goldLight });
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
          text(how, colX, y + 7, { size: fitFont(ctx, how, colW, 13, FONT_BODY), color: 'rgba(255,248,240,0.7)' });
          y += 22;
          for (var p = 0; p < 4; p++) {
            var d = res.deltas[p];
            var my2 = y + rh / 2;
            if (p === res.winner) {
              ctx.fillStyle = 'rgba(244,160,32,0.16)';
              roundRect(ctx, colX - 8, y, colW + 16, rh, 3);
              ctx.fill();
            }
            var name = (p === 0 ? 'You' : game.players[p].name);
            text(name, colX, my2, { size: fitFont(ctx, name, colW * 0.5, 15, FONT_BODY, p === 0 ? 'bold' : ''), weight: p === 0 ? 'bold' : '', color: COLORS.cream });
            text(signed(d), colX + colW * 0.7, my2, { size: 15, weight: 'bold', align: 'right', color: d > 0 ? COLORS.goldLight : d < 0 ? COLORS.redLight : 'rgba(255,248,240,0.55)' });
            text(fmt(res.after[p]), colX + colW, my2, { size: 15, align: 'right', color: 'rgba(255,248,240,0.55)' });
            y += rh;
          }
          bottom = Math.max(bottom, y);
        }
        y = bottom;
      }
      if (o.extra) {
        var ey = y + 16;
        text(o.extra, cx, ey, { size: fitFont(ctx, o.extra, w, 13, FONT_BODY, 'bold'), weight: 'bold', align: 'center', color: COLORS.goldLight });
      }
      if (o.playback) {
        // A playback's results: Watch again (from the deal), and Close (back
        // to the table at the last move).
        var firstP = regions.length;
        var byP = r.y + r.h - SUMMARY_PAD - 42;
        if (phoneStack) {
          var swP = Math.min(w, 280);
          button('Watch again', cx - swP / 2, byP - 58, swP, 42, function () { sound.play('select'); watchAgain(); }, 'white', 'review-again');
          button('Close', cx - swP / 2, byP, swP, 42, function () { sound.play('select'); closeOverlay(); }, 'primary', 'review-result-close');
        } else {
          var bwP = Math.min(156, (w - 12) / 2);
          button('Watch again', cx - bwP - 6, byP, bwP, 42, function () { sound.play('select'); watchAgain(); }, 'white', 'review-again');
          button('Close', cx + 6, byP, bwP, 42, function () { sound.play('select'); closeOverlay(); }, 'primary', 'review-result-close');
        }
        ctx.restore();
        regions.slice(firstP).forEach(function (g) {
          g.x = W / 2 + (g.x - W / 2) * k;
          g.y = H / 2 + (g.y - H / 2) * k;
          g.w *= k;
          g.h *= k;
        });
        return;
      }
      var label = settings.lesson ? 'Done' : (game.over ? 'See results' : 'Next hand');
      // Show hands turns the hands face up; once they are, the button says See hands.
      var handsLabel = ui.revealHands ? 'See hands' : 'Show hands';
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
      var by = r.y + r.h - SUMMARY_PAD - 42;
      var playW = 150;
      if (phoneStack) {
        // One column, one size, with room between: Show hands, View playback,
        // and Next hand last, at the bottom.
        var stack = [];
        if (haveHand) stack.push({ label: handsLabel, fn: showHands, style: 'white', id: 'show-hands' });
        if (o.hasPlayback) stack.push({ label: 'View playback', fn: viewReplay, style: 'white', id: 'view-playback' });
        stack.push({ label: label, fn: nextHand, style: 'primary', id: 'next' });
        var sw = Math.min(w, 280);
        stack.forEach(function (b, i) {
          button(b.label, cx - sw / 2, by - (stack.length - 1 - i) * 58, sw, 42, b.fn, b.style, b.id);
        });
        ctx.restore();
        regions.slice(firstRegion).forEach(function (g) {
          g.x = W / 2 + (g.x - W / 2) * k;
          g.y = H / 2 + (g.y - H / 2) * k;
          g.w *= k;
          g.h *= k;
        });
        return;
      }
      if (threeButtons) {
        // Show hands and View playback are the same width, so Next hand is in the middle.
        handsW = playW;
        row = handsW + gap + nextW + gap + playW;
      }
      var bx = cx - row / 2;
      var rowY = by - playbackRow; // the two main buttons, above the playback row when it is on its own
      // Show hands leaves this panel without dealing, and only while the
      // finished hand is still on the table. Next hand is the only way on.
      var nx = bx;
      if (game && game.hand) { button(handsLabel, nx, rowY, handsW, 42, showHands, 'white', 'show-hands'); nx += handsW + gap; }
      button(label, game && game.hand ? nx : cx - nextW / 2, rowY, nextW, 42, nextHand, 'primary', 'next');
      if (threeButtons) button('View playback', nx + nextW + gap, rowY, playW, 42, viewReplay, 'white', 'view-playback');
      if (playbackRow) button('View playback', cx - 110, by, 220, 42, viewReplay, 'white', 'view-playback');
      ctx.restore();
      regions.slice(firstRegion).forEach(function (g) {
        g.x = W / 2 + (g.x - W / 2) * k;
        g.y = H / 2 + (g.y - H / 2) * k;
        g.w *= k;
        g.h *= k;
      });
    }


    // The pause menu, in the look of the Results window: the deep green sheet
    // with a gold edge, a gold title at the left and a Close button at the right.
    function drawMenu() {
      // View playback sits under Resume once the hand has a move to look at.
      var withPlayback = menuHasPlayback();
      var r = panelRect(360, withPlayback ? 360 : 308);
      ui.overlayBox = r;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      drawSheetBg(r);
      var px = r.x + 22;
      text('Menu', px, r.y + 36, { size: 28, family: FONT_HEAD, align: 'left', color: COLORS.goldLight });
      button('Close', r.x + r.w - 22 - 64, r.y + 22, 64, 28, function () { sound.play('select'); closeOverlay(); }, 'ghost', 'm-close');
      // On a short screen (a phone held sideways) the buttons close up to fit.
      var rows = withPlayback ? 4 : 3;
      var room = r.h - 70 - 64;
      var step = Math.max(34, Math.min(52, room / rows));
      var bh = Math.min(42, step - 6);
      var bx = px, bw = r.w - 44, y = r.y + 70;
      button('Resume', bx, y, bw, bh, function () { sound.play('select'); closeOverlay(); }, 'primary', 'm-resume'); y += step;
      if (withPlayback) { button('View playback', bx, y, bw, bh, function () { sound.play('select'); closeOverlay(); viewReplay(); }, 'white', 'm-playback'); y += step; }
      var armed = ui.restartArmed && now() - ui.restartArmed < 5000;
      button(armed ? 'Tap again to restart' : 'Restart game', bx, y, bw, bh, function () { sound.play('select'); restartGame(); }, armed ? 'gold' : 'white', 'm-restart'); y += step;
      button('Quit game', bx, y, bw, bh, function () { sound.play('select'); quit(); }, 'white', 'm-quit');
      // Mode and version, with a Beta badge.
      var line = (settings.lesson ? 'Learn to play' : settings.mode === 'practice' ? 'Practice mode' : 'Full game') + ' · v' + E.GAME_VERSION;
      ctx.font = '12px ' + FONT_BODY;
      var lineW = ctx.measureText(line).width;
      ctx.font = 'bold 10px ' + FONT_BODY;
      var badgeW = ctx.measureText('BETA').width + 12, badgeH = 16;
      var lx = r.x + (r.w - lineW - 6 - badgeW) / 2, ly = r.y + r.h - 46;
      text(line, lx, ly, { size: 12, color: 'rgba(255,248,240,0.7)' });
      pill(lx + lineW + 6, ly - badgeH / 2, badgeW, badgeH, COLORS.red);
      text('BETA', lx + lineW + 6 + badgeW / 2, ly + 1, { size: 10, weight: 'bold', align: 'center', color: COLORS.white });
      text('Built by Jorge Yau, developer, mahjong instructor', r.x + r.w / 2, r.y + r.h - 22, { size: 12, align: 'center', color: 'rgba(255,248,240,0.55)' });
    }

    /* ---------------- saving and loading ---------------- */

    // A save holds no hidden tiles: the game as the hand began, the hand's
    // seed and your moves (MahjongEngine.gameRecord), plus the table's own
    // strategies, stats and finished-hand results. The coach's notes are
    // not stored. Resuming works them out again from the hand.
    // While the hand's results are up, it also keeps that panel, so a
    // refresh shows it again and deals the next hand only after Next hand.
    // It is signed, and resuming a hand in progress deals it from its seed
    // and plays it again up to your next move.
    function savePayload() {
      var record = E.gameRecord(game);
      if (restoredHand && game.hand === restoredHand) {
        // game.handNumber was already counted when this hand finished.
        record.hand = null;
        record.handNumber = game.handNumber;
      }
      return {
        savedAt: new Date().toISOString(),
        game: record,
        strategies: ui.strategies,
        stats: ui.stats,
        results: ui.results,
        summary: pendingSummary,
        resultsOpen: !!ui.resultsOpen,
      };
    }

    // The results panel, as stored. A win keeps the tiles, patterns and
    // payouts that panel draws. Anything else is dropped, and a refresh
    // then deals the next hand as before.
    function keptSummary(raw) {
      if (!raw || !raw.result) return null;
      var res = raw.result;
      var extra = typeof raw.extra === 'string' ? raw.extra : null;
      if (res.type === 'draw') return { result: { type: 'draw' }, extra: extra };
      if (res.type !== 'win' || typeof res.winner !== 'number' || res.winner < 0 || res.winner > 3) return null;
      if (!res.score || !Array.isArray(res.score.items)) return null;
      var hows = { discard: 1, selfDraw: 1, robKong: 1, flowers: 1 };
      var tiles = function (list) {
        return Array.isArray(list) ? list.filter(function (id) { return typeof id === 'string'; }) : [];
      };
      var nums = function (list) {
        return [0, 1, 2, 3].map(function (i) { return Array.isArray(list) ? +list[i] || 0 : 0; });
      };
      return {
        result: {
          type: 'win',
          winner: res.winner,
          payer: typeof res.payer === 'number' && res.payer >= 0 && res.payer <= 3 ? res.payer : null,
          tile: typeof res.tile === 'string' ? res.tile : null,
          how: hows[res.how] ? res.how : 'discard',
          score: {
            faan: +res.score.faan || 0,
            points: +res.score.points || 0,
            items: res.score.items.filter(function (it) { return it && typeof it.name === 'string'; }).map(function (it) {
              return { name: it.name, faan: +it.faan || 0 };
            }),
          },
          deltas: nums(res.deltas),
          after: nums(res.after),
          concealed: tiles(res.concealed),
          melds: Array.isArray(res.melds) ? res.melds.filter(function (m) { return m && typeof m.type === 'string'; }).map(function (m) {
            return { type: m.type, tiles: tiles(m.tiles), concealed: !!m.concealed };
          }) : [],
          flowers: tiles(res.flowers),
          seatWind: +res.seatWind || 1,
          round: +res.round || 1,
        },
        extra: extra,
      };
    }

    function keptResults(list) {
      if (!Array.isArray(list)) return [];
      return list.filter(function (row) {
        return row && typeof row.hand === 'number' && row.faan && row.faan.length === 4 && row.points && row.points.length === 4;
      }).map(function (row) {
        return {
          hand: row.hand,
          draw: !!row.draw,
          faan: [0, 1, 2, 3].map(function (i) { return +row.faan[i] || 0; }),
          points: [0, 1, 2, 3].map(function (i) { return +row.points[i] || 0; }),
        };
      });
    }

    function rememberResult(res) {
      var row = E.resultsRow(res);
      if (ui.results.some(function (have) { return have.hand === row.hand; })) return;
      ui.results.push(row);
      ui.resultsStick = true;
    }

    // Keeps the game in local storage as it goes (AUTOSAVE_KEY): after each
    // move, and when a hand's results go up. Not while a loaded hand is
    // being played again. A newer save drops one that is still being signed,
    // so leaving the results can't be overwritten by the copy taken while
    // they were up.
    var restoredHand = null; // a finished hand put back after a refresh, only for looking at
    var shownFile = null; // the playback view's file (its row's Play button in the sheet has a white ring)
    var autosaveTimer = null;
    var autosaveGen = 0;
    var pendingSummary = null;
    function autosave(immediate) {
      if (settings.lesson || settings.playback) return;
      if (!game || ui.replaying || destroyed) return;
      clearTimeout(autosaveTimer);
      // The win and the draw fire as soon as the hand is finished. Saving
      // then stores no hand and no summary, and a refresh deals the next
      // one. Leave the last move's save in place. The results are saved
      // once the summary is stored, and the next hand's save is the one
      // after Next hand.
      if (!immediate && game.hand && game.hand.result && !pendingSummary) return;
      var gen = ++autosaveGen;
      var write = function () {
        if (gen !== autosaveGen || !game || ui.replaying || destroyed) return;
        E.makeSave(savePayload()).then(function (data) {
          if (gen === autosaveGen && !destroyed) writeJson(AUTOSAVE_KEY, data);
        }, function () {});
      };
      if (immediate) write();
      else autosaveTimer = setTimeout(write, 250);
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

    // The strategy a seat played: a computer player's own, and for you the
    // coach's (the Strategies sheet reads the same way: "Coach", then what it plays).
    function gameOverStrategy(seat) {
      var id = seat === 0 ? ui.strategies.coach : ui.strategies.seats[seat];
      var name = id && Strategies.has(id) ? Strategies.get(id).name : '';
      if (!name) return '';
      return seat === 0 ? 'Coach \u00b7 ' + name : name;
    }

    // The game over window, in the look of the Results window: the deep green
    // sheet with a gold edge, a gold title at the left and Close at the right.
    // Each player has an avatar, their name, the strategy they played and
    // their points; yours is highlighted.
    function drawGameOver() {
      var st = ui.stats;
      var standings = E.finalStandings(game);
      var streak = longestWinStreak(ui.results);
      var statLines = [
        ['Hands played', String(st.hands)],
        ['Your biggest hand', st.best ? st.best + ' faan' : '\u2014'],
        ['Fastest win', st.fastest == null ? '\u2014' : st.fastest + (st.fastest === 1 ? ' move' : ' moves')],
        ['Hands you won', String(st.wins)],
        ['Longest winning streak', streak ? streak + (streak === 1 ? ' hand' : ' hands') : '\u2014'],
        ['Times you discarded the winning tile', String(st.dealIns || 0)],
        ['Times you stayed dealer', String(st.stays || 0)],
      ];
      var PAD = 22, ROW = 50, STAT = 23, BTN = 42, BIG = 48;
      var pw = Math.min(480, W - 24);
      var standH = standings.length * ROW + 16;
      var BEFORE_PLAY = 32; // room between the stats and Play again
      var h = PAD + 34 + 14 + standH + 18 + 18 + statLines.length * STAT + BEFORE_PLAY + BIG + 10 + BTN + PAD;
      // A short screen (a phone held sideways) shrinks the whole window to fit.
      var k = Math.min(1, (H - 24) / h);
      var r = { x: (W - pw) / 2, y: (H - h) / 2, w: pw, h: h };
      ui.overlayBox = { x: W / 2 + (r.x - W / 2) * k, y: H / 2 + (r.y - H / 2) * k, w: r.w * k, h: r.h * k };
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      var firstRegion = regions.length;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -H / 2);
      drawSheetBg(r);
      var px = r.x + PAD, innerW = r.w - 2 * PAD;
      text('Game over', px, r.y + 36, { size: 28, family: FONT_HEAD, align: 'left', color: COLORS.goldLight });
      button('Close', r.x + r.w - PAD - 64, r.y + PAD, 64, 28, seeMatchHands, 'ghost', 'go-close');

      // The standings: a dark panel, a row for each player.
      var sy = r.y + PAD + 34 + 14; // under the title; your place is the highlighted row
      roundRect(ctx, px, sy, innerW, standH, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fill();
      standings.forEach(function (row, i) {
        var ry = sy + 8 + i * ROW;
        var cy = ry + ROW / 2;
        var you = row.seat === 0;
        if (you) {
          roundRect(ctx, px + 6, ry + 2, innerW - 12, ROW - 4, 5);
          ctx.fillStyle = 'rgba(244,160,32,0.2)';
          ctx.fill();
        }
        var ink = you ? COLORS.goldLight : COLORS.cream;
        text(row.place + '.', px + 18, cy + 1, { size: 15, weight: 'bold', color: you ? COLORS.goldLight : 'rgba(255,248,240,0.7)' });
        // The avatar: the person or robot icon in a round badge.
        var ax = px + 58;
        ctx.beginPath();
        ctx.arc(ax, cy, 16, 0, Math.PI * 2);
        ctx.fillStyle = you ? 'rgba(255,210,122,0.25)' : 'rgba(255,248,240,0.12)';
        ctx.fill();
        playerIcon(row.seat, ax - 9, cy + 1, 18, ink);
        var tx = px + 84;
        var pointsText = fmt(row.points);
        ctx.font = 'bold 16px ' + FONT_BODY;
        var pointsW = ctx.measureText(pointsText).width;
        var room = innerW - (tx - px) - pointsW - 28;
        var strat = gameOverStrategy(row.seat);
        var nameSize = fitFont(ctx, row.name, room, 16, FONT_BODY, 'bold');
        text(row.name, tx, strat ? cy - 8 : cy + 1, { size: nameSize, weight: 'bold', color: ink });
        if (strat) {
          var stratSize = fitFont(ctx, strat, room, 12.5, FONT_BODY);
          text(strat, tx, cy + 10, { size: stratSize, color: 'rgba(255,248,240,0.7)' });
        }
        text(pointsText, px + innerW - 16, cy + 1, { size: 16, weight: 'bold', align: 'right', color: ink });
      });

      // How the game went.
      var y = sy + standH + 18;
      sectionLabel('Your game', px, y + 6);
      y += 18;
      statLines.forEach(function (l) {
        y += STAT;
        text(l[0], px, y - 6, { size: 14, color: 'rgba(255,248,240,0.7)' });
        text(l[1], px + innerW, y - 6, { size: 14, weight: 'bold', align: 'right', color: COLORS.cream });
      });

      // Play again is the large red button on top; Results and Quit share the row under it.
      var by = r.y + r.h - PAD - BTN;
      var bw = (innerW - 12) / 2;
      button('Play again', px, by - BIG - 10, innerW, BIG, function () { callbacks.restart(); }, 'primary', 'go-again');
      button('Results', px, by, bw, BTN, openResults, 'white', 'go-results');
      button('Quit', px + bw + 12, by, bw, BTN, function () { quit(); }, 'white', 'go-quit');
      ctx.restore();
      regions.slice(firstRegion).forEach(function (g) {
        g.x = W / 2 + (g.x - W / 2) * k;
        g.y = H / 2 + (g.y - H / 2) * k;
        g.w *= k;
        g.h *= k;
      });
    }

    var overlayResolve = null;

    function showOverlay(o) {
      return new Promise(function (resolve) {
        ui.overlay = o;
        overlayResolve = resolve;
        requestRender();
        if (autoPlay) autoStep();
      });
    }

    // A click on the dimmed table outside a modal puts it away. The pause menu
    // closes. The hand summary and the game-over panel step aside to the table
    // with every hand face up (their See results button brings them back), so a
    // stray click never deals the next hand.
    function dismissOverlay() {
      var o = ui.overlay;
      if (!o) return false;
      if (o.type === 'menu') { closeOverlay(); return true; }
      if (o.playback) { closeOverlay(); return true; } // a playback's results step aside to the table
      if (settings.lesson || !game || !game.hand) return false;
      if (o.type === 'summary') { showHands(true); return true; }
      if (o.type === 'gameover') { seeMatchHands(); return true; }
      return false;
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
    function showHands(clickedOut) {
      var o = ui.overlay;
      if (!o || o.type !== 'summary') return;
      var already = ui.revealHands;
      ui.heldSummary = o;
      ui.revealHands = true;
      ui.botLift = null;
      ui.overlay = null;
      // The first time is the mining hit. Coming back to See hands after See
      // results is a plain click.
      sound.play(clickedOut === true || already ? 'select' : 'flip');
      if (!already) announce('All four hands are face up.');
      requestRender();
    }

    // Leaves the summary for the next deal, with the mining hit.
    function nextHand() {
      // On the last hand the button reads See results, and that is a plain click.
      sound.play(game && game.over && !settings.lesson ? 'select' : 'next');
      closeOverlay();
    }

    function seeResults() {
      sound.play('select'); // the click
      if (ui.heldSummary && !ui.overlay) {
        ui.overlay = ui.heldSummary;
        requestRender();
        return;
      }
      if (game && game.over) {
        // Only the game over window: its Results button opens the Results table.
        ui.revealHands = false;
        ui.overlay = { type: 'gameover' };
        saveMatchPlayback();
        requestRender();
      }
    }

    // Face-up hands of the finished match. See results brings the sheet back.
    function seeMatchHands() {
      if (!game || !game.hand || !game.over) return;
      noteFinishedWin();
      resultsStay = true;
      var dlg = resultsSheet();
      if (dlg && dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
      ui.overlay = null;
      ui.revealHands = true;
      ui.botLift = null;
      // No sound: this is the game over window being closed or dismissed (Close, or a click outside).
      announce('All four hands are face up.');
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
      if (settings.review || !ui.revealHands || ui.overlay) return;
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
      sound.play('select'); // the click
      if (ui.overlay && ui.overlay.type === 'menu') { closeOverlay(); return; }
      ui.overlay = { type: 'menu', previous: ui.overlay };
      requestRender();
    }

    function cycleCoach() {
      if (settings.lesson) return;
      sound.play('select'); // the click
      var next = COACH_ORDER[(COACH_ORDER.indexOf(ui.coach) + 1) % COACH_ORDER.length];
      ui.coach = next;
      saveSetting('coach', next);
      // Auto-play follows the coach: turning it off stops it.
      if (autoPlay && next === 'off') { autoPlay = false; clearTimeout(autoTimer); announce('Auto-play off.'); }
      refreshHint();
      L = computeLayout(); // phones show or hide the coach's bar or column
      requestRender();
      track('play_set_coach', { coach: next });
    }

    function toggleSound() {
      var next = SOUND_ORDER[(SOUND_ORDER.indexOf(soundMode()) + 1) % SOUND_ORDER.length];
      sound.enabled = next !== 'off';
      sound.musicEnabled = sound.enabled;
      prefs.sound = sound.enabled;
      prefs.music = sound.enabled;
      writeJson(PREFS_KEY, prefs);
      sound.music(true); // plays or pauses to match
      if (sound.enabled) sound.play('select');
      requestRender();
      track('play_set_sound', { sound: next });
    }

    function quit() {
      if (settings.playback) { clearReview(); return; }
      callbacks.quit();
    }

    // The game page's playback view goes back in place. A table on its own
    // (no page around it) loads the game page.
    function backToGame() {
      if (callbacks.back) { callbacks.back(); return; }
      root.location.assign(visitUrl('/playing-mahjong/', { results: '1' }));
    }

    // ?results=1 asks the finished game to open its results. One visit only.
    function consumeResultsRequest() {
      if (!/[?&]results=1(?:&|$)/.test(root.location.search || '')) return false;
      if (root.history && root.history.replaceState) {
        var url = new URL(root.location.href);
        url.searchParams.delete('results');
        root.history.replaceState(root.history.state, '', url.pathname + url.search);
      }
      return true;
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
      if (!settings.lesson && ui.coach !== 'off' && action.type === 'discard' && ui.hint && ui.hint.tile) {
        coachFor().noteDiscard(game, 0, ui.hint.tile, action.tile);
      }
      if (action.type === 'discard' && game && game.hand) {
        ui.feedbackDiscards = strategyDiscardRows();
        ui.feedbackKind = 'discard';
      }
      if (ui.coach === 'feedback' && ui.hint && action.type === 'discard') {
        ui.feedback = Coach.discardFeedback(ui.hint, action.tile) || ui.feedback;
        rememberAll(feedbackForAll(function (hint) { return Coach.discardFeedback(hint, action.tile); }), 'feedback');
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
        rememberAll(feedbackForAll(function (hint) { return Coach.claimFeedback(hint, decision); }), 'feedback');
      }
      if (ui.coach === 'feedback') {
        // What each strategy would have done with this tile, shown after your call.
        ui.feedbackDiscards = Strategies.list().map(function (s) {
          var pick = strategyChoice(s.bot, null, p.opts);
          return { id: s.id, name: s.name, tile: null, action: pick.action };
        });
        // These stay after a chow, pung, kong or pass until your next move's
        // feedback replaces them.
        ui.feedbackKind = 'claim';
      }
      ui.claimPrompt = null;
      ui.hint = null;
      ui.notice = null;
      requestRender();
      p.resolve(decision);
    }

    // What each strategy says about your move, from the hints it gave for it.
    function feedbackForAll(judge) {
      var out = {};
      Strategies.ids().forEach(function (id) {
        var hint = ui.hintsAll[id];
        out[id] = hint ? judge(hint) : null;
      });
      return out;
    }

    // The same notes the strategies would have given, before this saved move.
    function rebuildCoachNote(kind, opts, decision) {
      if (settings.lesson || ui.coach === 'off' || !game || !game.hand || !decision) return;
      if (kind !== 'turn' && kind !== 'claim') return;
      var all = hintsForAll(kind, opts);
      var hint = all[ui.strategies.coach];
      if (!hint) return;
      ui.hintsAll = all;
      if (ui.coach === 'on') rememberAll(all, 'hint');
      if (kind === 'turn' && decision.type === 'discard' && hint.tile) {
        coachFor().noteDiscard(game, 0, hint.tile, decision.tile);
      }
      if (ui.coach !== 'feedback') return;
      var judge = kind === 'turn'
        ? function (h) { return decision.type === 'discard' ? Coach.discardFeedback(h, decision.tile) : null; }
        : function (h) { return Coach.claimFeedback(h, decision); };
      var notes = feedbackForAll(judge);
      if (!notes[ui.strategies.coach]) return;
      ui.feedback = notes[ui.strategies.coach];
      rememberAll(notes, 'feedback');
    }

    function refreshHint() {
      if (settings.lesson && game && game.hand) {
        ui.coach = 'on';
        ui.hint = Lesson.hint(game);
        if (ui.hint) rememberCoach(ui.hint, 'hint');
        return;
      }
      // In Feedback mode the advice is worked out (to judge your move) but not shown.
      if (ui.coach === 'off' || !game || !game.hand) { ui.hint = null; ui.hintsAll = {}; return; }
      var kind = ui.turnPrompt ? 'turn' : ui.claimPrompt ? 'claim' : null;
      if (!kind) return;
      // Every strategy works out its advice, and each keeps its own list.
      ui.hintsAll = hintsForAll(kind, (ui.turnPrompt || ui.claimPrompt).opts);
      ui.hint = ui.hintsAll[ui.strategies.coach];
      if (ui.coach === 'on') rememberAll(ui.hintsAll, 'hint');
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

    function deltaColor(n) {
      if (n > 0) return COLORS.goldLight;
      if (n < 0) return COLORS.redLight;
      return 'rgba(255,248,240,0.55)';
    }

    // Finished hands, above the coach. The newest row stays in view until
    // the player scrolls up.
    function drawResults() {
      var r = L.results;
      if (!r) return;
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      ctx.restore();
      text('Results', r.x + 14, r.y + 18, { size: 14, weight: 'bold', family: FONT_HEAD, color: COLORS.cream });

      var pad = 10;
      var handW = 44;
      var viewX = r.x + pad;
      var viewW = r.w - pad * 2;
      var playerW = (viewW - handW) / 4;
      var headerY = r.y + 40;
      text('Hand', viewX + handW / 2, headerY, { size: 11, weight: 'bold', align: 'center', color: COLORS.white });
      for (var seat = 0; seat < 4; seat++) {
        var name = seatTitle(seat);
        var iconS = 13;
        var nameMax = playerW - 6 - iconS - 4;
        var nameSize = fitFont(ctx, name, Math.max(24, nameMax), 12, FONT_BODY, 'bold');
        ctx.font = 'bold ' + nameSize + 'px ' + FONT_BODY;
        var nameW = ctx.measureText(name).width;
        var left = viewX + handW + playerW * seat + (playerW - nameW - iconS - 4) / 2;
        text(name, left, headerY, { size: nameSize, weight: 'bold', color: COLORS.white });
        playerIcon(seat, left + nameW + 4, iconCy(seat, paintedBottom(name, headerY), iconS), iconS, COLORS.white);
      }

      var bodyY = r.y + 54;
      var bodyH = r.h - 62;
      var rowH = 36;
      var rows = ui.results;
      var pay = showsPoints();
      var contentH = (rows.length + (rows.length ? 1 : 0)) * rowH;
      ui.resultsScrollMax = Math.max(0, contentH - bodyH);
      if (ui.resultsStick) ui.resultsScroll = ui.resultsScrollMax;
      ui.resultsScroll = clamp(ui.resultsScroll, 0, ui.resultsScrollMax);
      var scrollW = ui.resultsScrollMax > 0 ? 8 : 0;

      function drawResultRow(row, y, label, isDraw, isTotal) {
        if (y + rowH < bodyY || y > bodyY + bodyH) return;
        roundRect(ctx, viewX, y + 1, viewW - scrollW, rowH - 2, 3);
        ctx.fillStyle = isTotal ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.18)';
        ctx.fill();
        var mid = y + rowH / 2;
        var labelSize = fitFont(ctx, label, handW - 4, 13, FONT_BODY, 'bold');
        text(label, viewX + handW / 2, isDraw ? mid - 6 : mid, { size: labelSize, weight: 'bold', align: 'center', color: COLORS.white });
        if (isDraw) text('Draw', viewX + handW / 2, mid + 8, { size: 10, align: 'center', color: COLORS.white });
        for (var s = 0; s < 4; s++) {
          var lines = resultLines(row, s);
          var cx = viewX + handW + playerW * s + playerW / 2;
          var faanSize = fitFont(ctx, lines.faan, playerW - 4, 11, FONT_BODY, lines.scored || lines.faanLoss ? 'bold' : '');
          text(lines.faan, cx, pay ? mid - 7 : mid, {
            size: faanSize,
            weight: lines.scored || lines.faanLoss ? 'bold' : '',
            align: 'center',
            color: lines.faanLoss ? COLORS.redLight : lines.scored ? COLORS.cream : 'rgba(255,248,240,0.55)',
          });
          if (!pay) continue;
          var pointSize = fitFont(ctx, lines.points, playerW - 4, 12, FONT_BODY, 'bold');
          var pointDelta = row.stake ? row.points[s] - row.stake : row.points[s];
          text(lines.points, cx, mid + 8, { size: pointSize, weight: 'bold', align: 'center', color: deltaColor(pointDelta) });
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(viewX, bodyY, viewW, bodyH);
      ctx.clip();
      if (!rows.length) {
        var empty = 'Finished hands show up here.';
        var emptySize = fitFont(ctx, empty, viewW - 8, 13, FONT_BODY);
        text(empty, viewX + 4, bodyY + 16, { size: emptySize, color: 'rgba(255,248,240,0.5)' });
      }
      var y = bodyY - ui.resultsScroll;
      rows.forEach(function (row) {
        drawResultRow(row, y, String(row.hand), row.draw, false);
        y += rowH;
      });
      if (rows.length) drawResultRow(resultsTotal(), y, 'Total', false, true);
      ctx.restore();

      if (ui.resultsScrollMax > 0) {
        var trackX = r.x + r.w - 8;
        var thumbH = Math.max(28, bodyH * (bodyH / (bodyH + ui.resultsScrollMax)));
        var thumbY = bodyY + (bodyH - thumbH) * (ui.resultsScroll / ui.resultsScrollMax);
        roundRect(ctx, trackX, thumbY, 4, thumbH, 2);
        ctx.fillStyle = 'rgba(255,248,240,0.45)';
        ctx.fill();
      }
    }

    function historyAt(p) {
      var r = L && L.history;
      if (!r || !p) return false;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    }

    function resultsAt(p) {
      var r = L && L.results;
      if (!r || !p) return false;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    }

    function scrollHistory(next) {
      ui.coachScroll = clamp(next, 0, ui.coachScrollMax);
      ui.coachStick = ui.coachScroll >= ui.coachScrollMax - 12;
      requestRender();
    }

    function scrollResults(next) {
      ui.resultsScroll = clamp(next, 0, ui.resultsScrollMax);
      ui.resultsStick = ui.resultsScroll >= ui.resultsScrollMax - 12;
      requestRender();
    }

    function onWheel(e) {
      var p = pointerPos(e);
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (resultsAt(p) && ui.resultsScrollMax > 0) {
        e.preventDefault();
        scrollResults(ui.resultsScroll + dy);
        return;
      }
      if (!historyAt(p) || ui.coachScrollMax <= 0) return;
      e.preventDefault();
      scrollHistory(ui.coachScroll + dy);
    }

    function seeResultsHit(p) {
      if (!p || !ui.revealHands || ui.overlay) return null;
      var r = hitTest(p.x, p.y);
      return r && r.id === 'see-results' ? r : null;
    }

    // A button of the open overlay (summary, game over) under this point.
    function overlayButtonAt(p) {
      if (!ui.overlay || !ui.overlayBox || !boxHas(ui.overlayBox, p.x, p.y)) return null;
      var r = hitTest(p.x, p.y);
      return r && boxHas(ui.overlayBox, r.x, r.y) ? r : null;
    }

    // Playback: a double-click (or double-tap) on an opponent's hand hides or
    // shows all their concealed tiles. The choice is kept for playback
    // (prefs.showOpponents, in lcm-play-prefs). An unfinished hand's playback
    // always keeps their tiles concealed, so the double-click does nothing there.
    var lastHandTap = null;
    function opponentSeatAt(p) {
      for (var k = 1; k <= 3; k++) if (L && L.opp && boxHas(L.opp[k], p.x, p.y)) return k;
      return 0;
    }

    // True when this press was the second of a double-tap on an opponent's seat.
    function opponentHandsTap(p, e) {
      var seat = opponentSeatAt(p);
      if (!seat) { lastHandTap = null; return false; }
      var t = e.timeStamp || now();
      var prev = lastHandTap;
      lastHandTap = { t: t, x: p.x, y: p.y, seat: seat };
      if (!prev || prev.seat !== seat || t - prev.t > 420 || Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) > 40) return false;
      lastHandTap = null;
      if (!reviewFinished()) return false;
      toggleOpponentHands();
      return true;
    }

    function toggleOpponentHands() {
      var shown = prefs.showOpponents === false; // hidden now, so this shows them
      prefs.showOpponents = shown;
      writeJson(PREFS_KEY, prefs);
      ui.revealHands = reviewFinished() && shown;
      ui.botLift = null;
      sound.play('flip');
      track('play_playback_toggle_hands', { shown: shown });
      announce(shown ? 'Opponents\' hands are face up.' : 'Opponents\' hands are hidden.');
      requestRender();
    }

    function onPointerDown(e) {
      lastTouch = !!e.pointerType && e.pointerType !== 'mouse';
      if (lastTouch) mouse = null;
      var p = pointerPos(e);
      if (settings.review && !ui.overlay && opponentHandsTap(p, e)) { e.preventDefault(); return; }
      if (ui.overlay && ui.overlayBox && !boxHas(ui.overlayBox, p.x, p.y)) {
        if (dismissOverlay()) { e.preventDefault(); return; }
      }
      // An open summary sits over the coach column, so its buttons come first.
      var overlayHit = overlayButtonAt(p);
      if (overlayHit) {
        pinnedTip = null;
        e.preventDefault();
        overlayHit.onTap();
        return;
      }
      if (settings.review && reviewBarHit(p)) {
        reviewScrub = e.pointerId;
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        jumpReview(reviewStepAt(p.x), true);
        e.preventDefault();
        return;
      }
      var see = seeResultsHit(p);
      if (see) {
        e.preventDefault();
        see.onTap();
        return;
      }
      if (resultsAt(p)) {
        if (ui.resultsScrollMax > 0) {
          resultsDrag = { y: p.y, scroll: ui.resultsScroll, id: e.pointerId };
          if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
        return;
      }
      if (historyAt(p)) {
        historyTap = settings.review ? { x: p.x, y: p.y, id: e.pointerId, step: coachNoteAt(p) } : null;
        if (ui.coachScrollMax > 0) {
          historyDrag = { y: p.y, scroll: ui.coachScroll, id: e.pointerId };
          if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
        return;
      }
      var r = hitTest(p.x, p.y);
      if (!r && lastTouch && !ui.overlay && pinTableTip(p)) {
        e.preventDefault();
        return;
      }
      if (!r) {
        if (pinnedTip) { pinnedTip = null; requestRender(); }
        if (ui.selected >= 0 && !ui.overlay) { ui.selected = -1; ui.notice = null; requestRender(); }
        return;
      }
      var hadTip = !!pinnedTip;
      pinnedTip = null;
      e.preventDefault();
      r.onTap();
      if (hadTip) requestRender();
    }

    function onPointerMove(e) {
      if (reviewScrub && e.pointerId === reviewScrub) {
        jumpReview(reviewStepAt(pointerPos(e).x), true);
        canvas.style.cursor = 'pointer';
        return;
      }
      if (resultsDrag && e.pointerId === resultsDrag.id) {
        var draggedResults = pointerPos(e);
        scrollResults(resultsDrag.scroll + (resultsDrag.y - draggedResults.y));
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (historyDrag && e.pointerId === historyDrag.id) {
        var dragged = pointerPos(e);
        scrollHistory(historyDrag.scroll + (historyDrag.y - dragged.y));
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var p = pointerPos(e);
      if ((resultsAt(p) || historyAt(p)) && !seeResultsHit(p) && !overlayButtonAt(p)) {
        canvas.style.cursor = !resultsAt(p) && settings.review && coachNoteAt(p) !== null ? 'pointer'
          : (resultsAt(p) ? ui.resultsScrollMax > 0 : ui.coachScrollMax > 0) ? 'grab' : 'default';
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

    // The move a coach note is about, under this point (playback).
    function coachNoteAt(p) {
      var hits = ui.coachHits || [];
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        if (h.h > 0 && p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.step;
      }
      return null;
    }

    // Takes you to the move on the progress bar that a coach note is about.
    function jumpToNote(step) {
      var stops = reviewStops().stops;
      var at = stops[stops.length - 1];
      for (var i = 0; i < stops.length; i++) { if (stops[i] >= step) { at = stops[i]; break; } }
      sound.play('select');
      track('play_playback_coach_note_click', {});
      jumpReview(at);
      ensureReviewNotes(reviewStep);
      ui.coachStick = true;
      requestRender();
    }

    function onPointerUp(e) {
      if (historyTap && e.pointerId === historyTap.id) {
        var tap = historyTap;
        historyTap = null;
        var up = pointerPos(e);
        if (tap.step !== null && up && Math.abs(up.x - tap.x) < 8 && Math.abs(up.y - tap.y) < 8) jumpToNote(tap.step);
      }
      if (reviewScrub && e.pointerId === reviewScrub) {
        reviewScrub = 0;
        announce(reviewSpoken());
      }
      if (resultsDrag && e.pointerId === resultsDrag.id) resultsDrag = null;
      if (historyDrag && e.pointerId === historyDrag.id) historyDrag = null;
    }

    function onPointerLeave() {
      mouse = null;
      if (tipTile || hover || tipSeat !== null) { hover = null; requestRender(); }
    }

    function onKey(e) {
      if (destroyed) return;
      if (rulesOpen() || strategiesOpen() || resultsOpen() || playbacksOpen() || uploadErrorOpen()) return; // the sheets handle their own keys (Escape closes them)
      if (settings.playback && !settings.review) return;
      if (settings.review && ui.overlay && ui.overlay.type === 'summary') {
        // The playback's results: Enter or Escape puts them away; Space watches it again.
        if (e.key === 'Enter' || e.key === 'Escape') { sound.play('select'); closeOverlay(); e.preventDefault(); }
        else if (e.key === ' ') { sound.play('select'); watchAgain(); e.preventDefault(); }
        return;
      }
      if (settings.review) {
        // The keys press the same buttons, so they click, squeeze and glow too.
        if (e.key === 'ArrowLeft') { sound.play('back'); pressButton('review-prev'); stepReview(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { sound.play('forward'); pressButton('review-next'); stepReview(1); e.preventDefault(); }
        else if (e.key === 'Home') { jumpReview(0); e.preventDefault(); }
        else if (e.key === 'End') { jumpReview(reviewMoves()); e.preventDefault(); }
        else if (e.key === ' ') { sound.play('select'); pressButton('review-play'); toggleReviewPlay(); e.preventDefault(); }
        else if (e.key === 'Escape') { quit(); e.preventDefault(); }
        return;
      }
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
        var at = flights.indexOf(f);
        if (at !== -1) flights.splice(at, 1);
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
      if (autoPlay) return; // auto-play shows no callouts
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
      if (autoPlay) return; // nor confetti
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
        ui.feedbackDiscards = null;
        ui.feedbackKind = null;
        // The panel is this hand only; the lists keep every hand of the game.
        ui.hintsAll = {};
        ui.coachScroll = 0;
        ui.coachStick = true;
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
      // A resumed hand plays again up to your next move, with no events.
      // The coach's notes are worked out again at each of those moves.
      replayDecision: function (kind, opts, decision) {
        try { rebuildCoachNote(kind, opts, decision); } catch (err) {}
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

    // A bot keeps its seat's strategy for the whole game. Only the coach's
    // (the player's) can change.
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

    function clearDiscardFeedback() {
      if (ui.feedbackKind === 'discard') {
        ui.feedbackDiscards = null;
        ui.feedbackKind = null;
      }
    }

    function humanAgent() {
      return {
        turn: function (g, seat, opts) {
          return new Promise(function (resolve) {
            ui.turnPrompt = { opts: opts, resolve: resolve };
            ui.selected = -1;
            // Feedback on a discard clears when your next turn starts. Feedback on
            // a claim stays until your next move.
            clearDiscardFeedback();
            refreshHint();
            var lessonLine = settings.lesson && ui.hint && ui.hint.action;
            ui.notice = lessonLine ? null : (opts.completeButShort
              ? 'Your hand is complete, but only ' + opts.completeButShort.faan + ' faan. You need ' + game.settings.minFaan + ' to win.'
              : (opts.win ? coachFor().turnHint(game, 0, opts).action : null));
            sound.play('turn');
            announce(lessonLine || ui.notice || 'Your turn. Pick a tile to discard.');
            requestRender();
            if (autoPlay) autoStep();
          });
        },
        claim: function (g, seat, opts) {
          return new Promise(function (resolve) {
            var highlight = [];
            if (opts.pung || opts.kong) highlight.push(opts.tile);
            opts.chows.forEach(function (p) { highlight = highlight.concat(p); });
            ui.claimPrompt = { opts: opts, resolve: resolve, highlight: highlight };
            clearDiscardFeedback();
            refreshHint();
            var lessonLine = settings.lesson && ui.hint && ui.hint.action;
            ui.notice = lessonLine ? null : (opts.win
              ? coachFor().claimHint(game, 0, opts).action
              : (opts.completeButShort ? E.tileName(opts.tile) + ' completes your hand, but only for ' + opts.completeButShort.faan + ' faan.' : 'Claim ' + E.tileName(opts.tile) + '?'));
            sound.play('turn');
            announce(lessonLine || ui.notice);
            requestRender();
            if (autoPlay) autoStep();
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
        // Your moves in that hand: each discard of yours, and the winning move (a win on your
        // 6th turn is 6 moves, whether you drew the tile or took a discard).
        var moves = 1 + ((game && game.hand && game.hand.trace) || []).filter(function (ev) { return ev.a === 'discard' && ev.s === 0; }).length;
        st.fastest = st.fastest == null ? moves : Math.min(st.fastest, moves);
      }
      // Your discard was the tile another player won on (a robbed kong isn't a discard).
      if (res.type === 'win' && res.how === 'discard' && res.payer === 0) st.dealIns = (st.dealIns || 0) + 1;
      // The dealer won, so the deal stays: one more time for you if you were that dealer.
      if (res.dealerKeeps && res.winner === 0) st.stays = (st.stays || 0) + 1;
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
      // A refresh of View playback: the hand is back on the table, so its playback opens again.
      if (settings.openPlayback) {
        settings.openPlayback = false;
        viewReplay();
      }
    }

    // The empty table, before a playback is stored, or after a file that didn't load.
    function drawPlaybackPrompt() {
      var msg = reviewNote || PLAYBACK_EMPTY;
      var maxW = Math.min(520, W - 48);
      ctx.font = '16px ' + FONT_BODY;
      var lines = wrapText(ctx, msg, maxW);
      var lh = 24;
      var y0;
      var bw = Math.min(160, Math.max(120, W - 48));
      var bh = 40;
      var by = Math.round(H / 2 - bh / 2);
      var textBottom = by - 18;
      y0 = textBottom - (lines.length - 1) * lh;
      if (y0 < 64) {
        y0 = 64;
        by = y0 + (lines.length - 1) * lh + 18 + 16;
      }
      lines.forEach(function (ln, i) {
        text(ln, W / 2, y0 + i * lh, {
          size: 16, align: 'center',
          color: reviewNote ? COLORS.goldLight : COLORS.cream,
        });
      });
      button('Saved playbacks', (W - bw) / 2, by, bw, bh, openPlaybacks, 'gold', 'review-list-center');
    }

    // Whether the playback on screen is of a finished hand. Only then are the
    // other players' tiles face up and the file saveable; an unfinished hand
    // plays back like the game, with their tiles concealed.
    var finishedFor = null, finishedValue = false;
    function reviewFinished() {
      var rec = settings.review;
      if (!rec) return false;
      if (finishedFor !== rec) { finishedFor = rec; finishedValue = E.playbackFinished(rec); }
      return finishedValue;
    }

    // The file as JSON, named with the time it was saved (or now), such as
    // lucky-cat-mahjong-playback-2026-11-05-1430.json.
    function saveFile(file, savedAt) {
      var d = new Date(savedAt == null ? Date.now() : savedAt);
      function two(n) { return (n < 10 ? '0' : '') + n; }
      var stamp = d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes());
      var blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'lucky-cat-mahjong-playback-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* The Saved playbacks sheet: your five most recent finished hands, each
       with the time it was saved, Play and Download, then the one playback
       you uploaded last (if any), and Upload playback. */
    function playbacksSheet() {
      return document.getElementById('playbacks-sheet');
    }

    function openPlaybacks() {
      var dlg = playbacksSheet();
      if (!dlg || dlg.open) return;
      sound.play('select'); // the click
      buildPlaybacks();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }

    /* The popup for a playback that couldn't be uploaded (a file or a paste):
       a signature that doesn't match, a file that isn't a playback, or one
       from a version this game can't load. Nothing from the file is kept. */
    // The line under the heading: this one is not about the file being bad, but
    // about the version it was saved by.
    var UPLOAD_LEADS = {
      version: 'This playback is from an incompatible version of the game.',
    };

    // What to do about a version this game can't load, named with both versions.
    function versionMessage(c) {
      var file = c.fileVersion, game = c.gameVersion;
      if (c.versionKind === 'newer') {
        return 'It was saved by a newer version of the game (' + file + '), and this page is on ' + game + '. Reload the page to update, then upload it again.';
      }
      if (c.versionKind === 'older') {
        return 'It was saved by an older version of the game (' + file + ') that this version (' + game + ') can\'t play.';
      }
      return 'It has no game version, so this version (' + game + ') can\'t tell whether it can be played.';
    }

    var UPLOAD_ERRORS = {
      signature: 'Its signature doesn\'t match, so the file was changed or damaged after it was saved. Only a playback downloaded from this game, as it was saved, can be played.',
      damaged: 'Its contents don\'t fit together, so the file was changed or damaged after it was saved.',
      notFile: 'That isn\'t a playback file. Upload a JSON file downloaded from Saved playbacks.',
    };

    function uploadErrorSheet() {
      return document.getElementById('upload-error-sheet');
    }

    function uploadErrorOpen() {
      var dlg = uploadErrorSheet();
      return !!(dlg && dlg.open);
    }

    function showUploadError(checked) {
      var dlg = uploadErrorSheet();
      var why = document.getElementById('upload-error-why');
      if (!dlg) { announce('This playback could not be uploaded. ' + checked.reason); return; }
      var lead = document.getElementById('upload-error-lead');
      if (lead) lead.textContent = UPLOAD_LEADS[checked.code] || 'This playback could not be uploaded.';
      if (why) why.textContent = checked.code === 'version' ? versionMessage(checked) : (UPLOAD_ERRORS[checked.code] || checked.reason);
      closePlaybacks();
      if (dlg.open) return;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }

    function closeUploadError() {
      var dlg = uploadErrorSheet();
      if (!dlg || !dlg.open) return;
      sound.play('select'); // the click
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    }

    function playbacksOpen() {
      var dlg = playbacksSheet();
      return !!(dlg && dlg.open);
    }

    function closePlaybacks() {
      var dlg = playbacksSheet();
      if (!dlg || !dlg.open) return;
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    }

    // The row buttons are icons: their names are in aria-label, and a tooltip
    // (data-tip, drawn by css/play.css) shows them on hover or keyboard focus.
    var ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
    var ICON_COPY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
    var ICON_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>';

    function playbackRow(entry, mark, kind) {
      var li = document.createElement('li');
      li.className = 'playbacks-row';
      var check = E.checkPlayback(entry.file);
      var showing = shownFile && playbackId(shownFile) === playbackId(entry.file);
      if (showing) li.classList.add('is-showing');
      var info = document.createElement('div');
      info.className = 'playbacks-text';
      // Who won and with which hand, then which hand of the game (no round) and when it finished.
      var sum = check.ok ? E.playbackSummary(check.record) : { result: 'A playback that no longer plays', hand: '', number: '' };
      var name = document.createElement('div');
      name.className = 'playbacks-name';
      name.textContent = sum.result;
      var when = document.createElement('div');
      when.className = 'playbacks-when';
      // One timestamp, with no label, in words (Today, 2:30 PM): when the hand finished (the
      // file's own time). A file from before that was recorded shows when it was saved or
      // uploaded instead, and a time nobody kept isn't shown at all.
      var ended = check.ok ? check.record.endedAt : null;
      var stamp = ended != null ? ended : entry.savedAt;
      when.textContent = [sum.number, stamp != null ? E.playbackWhen(stamp) : ''].filter(Boolean).join(' \u00b7 ');
      info.appendChild(name);
      info.appendChild(when);
      li.appendChild(info);
      var play = document.createElement('button');
      play.type = 'button';
      play.className = 'playbacks-btn playbacks-play';
      play.innerHTML = ICON_PLAY;
      play.disabled = !check.ok;
      // The one on screen has a white ring round its button (css/play.css), and says so to a screen reader and in its tooltip.
      play.classList.toggle('is-showing', !!showing);
      play.setAttribute('data-tip', showing ? 'Playing now' : 'Play');
      play.setAttribute('aria-label', (showing ? 'Playing now: ' : 'Play ') + sum.hand + ', ' + sum.result);
      if (showing) play.setAttribute('aria-current', 'true');
      play.addEventListener('click', function () {
        sound.play('select');
        track('play_playback_list_play', { kind: kind });
        closePlaybacks();
        loadPlaybackText(entry.file, mark);
      });
      // Copy hand seed, between Play and Download: the hand's seed (such as
      // 919942249-NE) on the clipboard, the same text your wind badge copies.
      var seedText = check.ok && entry.file.payload ? String(entry.file.payload.handSeed || '') : '';
      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'playbacks-btn playbacks-copy';
      copy.innerHTML = ICON_COPY;
      copy.setAttribute('data-tip', 'Copy hand seed');
      copy.disabled = !seedText;
      copy.setAttribute('aria-label', 'Copy hand seed for ' + sum.hand + ', ' + sum.result);
      var copiedTimer = null;
      copy.addEventListener('click', function () {
        sound.play('select');
        track('play_playback_list_copy_seed', { kind: kind });
        copyText(seedText).then(function () {
          // "Copied" shows even without a hover (a phone), then goes back.
          copy.classList.add('is-copied');
          copy.innerHTML = ICON_CHECK;
          copy.setAttribute('data-tip', 'Copied');
          announce('Copied hand seed ' + seedText + '.');
          clearTimeout(copiedTimer);
          copiedTimer = setTimeout(function () {
            copy.classList.remove('is-copied');
            copy.innerHTML = ICON_COPY;
            copy.setAttribute('data-tip', 'Copy hand seed');
          }, 1500);
        }, function () { announce('Could not copy the hand seed.'); });
      });
      var down = document.createElement('button');
      down.type = 'button';
      down.className = 'playbacks-btn playbacks-download';
      down.innerHTML = ICON_DOWNLOAD;
      // Only a finished hand's file is saved: an unfinished one holds the whole deal.
      down.disabled = !check.ok || !E.playbackFinished(check.record);
      down.setAttribute('data-tip', down.disabled ? 'Download opens once the hand is finished' : 'Download');
      down.setAttribute('aria-label', 'Download ' + sum.hand + ', ' + sum.result);
      down.addEventListener('click', function () {
        sound.play('select');
        track('play_playback_list_download', { kind: kind });
        saveFile(entry.file, entry.savedAt);
      });
      li.appendChild(play);
      li.appendChild(copy);
      li.appendChild(down);
      return li;
    }

    function fillList(el, entries, emptyText, markFor, kind) {
      if (!el) return;
      while (el.firstChild) el.removeChild(el.firstChild);
      if (!entries.length) {
        var empty = document.createElement('li');
        empty.className = 'playbacks-empty';
        empty.textContent = emptyText;
        el.appendChild(empty);
        return;
      }
      entries.forEach(function (e) { el.appendChild(playbackRow(e, markFor(e), kind)); });
    }

    function buildPlaybacks() {
      fillList(document.getElementById('playbacks-recent'), recentPlaybacks(),
        'No finished hands yet. Each hand you finish is kept here, the last five.',
        function (e) { return { lcmRecent: playbackId(e.file) }; }, 'recent');
      var up = uploadedPlayback();
      fillList(document.getElementById('playbacks-uploaded'), up ? [up] : [],
        'Nothing uploaded yet.', function () { return { lcmUpload: true }; }, 'upload');
    }

    var replayFileInput = null;
    function openReplayPicker() {
      if (!replayFileInput) {
        var input = document.createElement('input');
        input.type = 'file';
        // Json first, and plain text too: a phone can save the download as .txt, and the text is checked on load.
        input.accept = 'application/json,.json,text/plain,.txt';
        input.hidden = true; // not drawn at all, so nothing shows behind the picker
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');
        input.addEventListener('change', function () {
          var picked = input.files && input.files[0];
          input.value = '';
          if (!picked) return;
          var reader = new FileReader();
          reader.onload = function () {
            if (!destroyed) loadPlaybackText(String(reader.result || ''));
          };
          reader.readAsText(picked);
        });
        document.body.appendChild(input);
        replayFileInput = input;
      }
      replayFileInput.click();
    }

    // A playback to show: a file uploaded or pasted (stored as the upload),
    // or one picked from the View playback sheet (mark: { lcmRecent: id }).
    // The mark rides in this view's history entry, so a refresh shows it again.
    function loadPlaybackText(text, mark) {
      var checked = E.checkPlayback(text);
      if (!checked.ok) {
        // Nothing is kept or shown: the playback on screen stays, and a popup says why.
        reviewNote = checked.reason;
        track('play_playback_upload_failed', { code: checked.code || 'unknown' });
        showUploadError(checked);
        requestRender();
        return;
      }
      var rec = checked.record;
      try {
        var file = typeof text === 'string' ? JSON.parse(text) : text;
        if (file && file.payload) {
          if (!mark) writeJson(UPLOAD_KEY, { savedAt: Date.now(), file: file });
          shownFile = file;
          // What this view shows now, so a refresh shows it too.
          if (root.history && root.history.replaceState) {
            var next = Object.assign({}, root.history.state || {});
            delete next.lcmUpload;
            delete next.lcmRecent;
            Object.assign(next, mark || { lcmUpload: true });
            root.history.replaceState(next, '');
          }
        }
      } catch (e) {}
      try { E.playbackGame(rec, 0); }
      catch (err) {
        reviewNote = 'That playback doesn\'t replay on the table.';
        announce(reviewNote);
        requestRender();
        return;
      }
      reviewNote = null;
      stopReviewPlay();
      resetReviewCoach();
      reviewPicks = null;
      settings.review = rec;
      reviewStep = 0;
      showReviewStep();
      reviewPlaying = true;
      scheduleReview();
    }

    function onCanvasPaste(e) {
      if (!settings.playback || destroyed) return;
      var text = e.clipboardData && e.clipboardData.getData('text');
      if (!text) return;
      e.preventDefault();
      loadPlaybackText(text);
    }

    function clearReview() {
      stopReviewPlay();
      settings.review = null;
      reviewStep = 0;
      reviewBar = null;
      reviewNote = null;
      reviewShown = -1;
      reviewPicks = null;
      clearReviewMotion();
      resetReviewCoach();
      game = null;
      announce(PLAYBACK_EMPTY);
      requestRender();
    }

    // A recommendation chooses the coach. Playback keeps that choice for this
    // visit. A game saves it with the other strategy choices.
    // On a phone there is no hover, so picking a strategy says so for a second.
    var strategyToastTimer = null;
    function showStrategyToast(id) {
      ui.strategyToast = 'Selected strategy: ' + Strategies.get(id).name;
      ui.strategyToastAt = now();
      if (strategyToastTimer) clearTimeout(strategyToastTimer);
      strategyToastTimer = setTimeout(function () {
        strategyToastTimer = null;
        ui.strategyToast = null;
        if (!destroyed) requestRender();
      }, 1000);
      requestRender();
    }

    function drawStrategyToast() {
      var p = L && L.strategyPanel;
      if (!ui.strategyToast || !p) return;
      // A quick fade and rise in, a hold, then a longer fade out, all inside the second.
      var age = now() - ui.strategyToastAt;
      var FADE_IN = 160, FADE_OUT = 340, TOTAL = 1000;
      var alpha = age < FADE_IN ? easeInOut(age / FADE_IN)
        : age > TOTAL - FADE_OUT ? easeInOut(Math.max(0, (TOTAL - age) / FADE_OUT)) : 1;
      var rise = age < FADE_IN ? (1 - alpha) * 8 : 0;
      if (age < TOTAL) requestRender(); // keep drawing while it fades
      if (alpha <= 0) return;
      var label = ui.strategyToast;
      var size = fitFont(ctx, label, Math.max(80, W - 40), 14, FONT_BODY, 'bold');
      ctx.font = 'bold ' + size + 'px ' + FONT_BODY;
      var w = Math.min(ctx.measureText(label).width + 28, W - 16);
      var h = 30;
      var x = clamp(p.x + p.w / 2 - w / 2, 8, W - w - 8);
      var y = p.y - h - 8 + rise;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = 'rgba(20,20,20,0.94)';
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha;
      text(label, x + w / 2, y + h / 2 + 1, { size: size, weight: 'bold', align: 'center', color: COLORS.cream });
      ctx.restore();
    }

    function chooseCoach(id) {
      sound.play('select'); // the same tick as picking a tile
      if (settings.review) track('play_set_coach_strategy', { strategy: id, playback: true });
      if (W < 600 || lastTouch) showStrategyToast(id);
      if (settings.review) setReviewCoach(id);
      else setCoachStrategy(id);
    }

    // Playback only. The saved coach in a real game stays as it was. Every
    // strategy keeps its own notes, so this only changes which list shows.
    function setReviewCoach(id) {
      if (!Strategies.has(id)) return;
      if (ui.strategies.coach === id) { requestRender(); return; }
      ui.strategies.coach = id;
      ensureReviewNotes(reviewStep);
      ui.coachStick = true;
      requestRender();
    }

    function resetReviewCoach() {
      reviewCoaches = {};
      reviewAnalyst = null;
      if (reviewCoachTimer) { clearTimeout(reviewCoachTimer); reviewCoachTimer = null; }
      ui.coachLog = [];
    }

    // Walks the recording once for each strategy, each on its own game, so a
    // coach who follows your discards keeps that streak. A couple of notes per
    // turn, then the rest follow.
    function ensureReviewNotes(upto) {
      if (!settings.review || destroyed) return;
      var actions = settings.review.actions;
      var limit = reviewMoves();
      var target = Math.max(0, Math.min(upto == null ? limit : upto, limit));
      var more = false;
      // The shown coach goes first, so its notes are there before the rest.
      var shown = (ui.strategies && ui.strategies.coach) || Strategies.DEFAULT_COACH;
      var order = [shown].concat(Strategies.ids().filter(function (id) { return id !== shown; }));
      order.forEach(function (id) {
        var walk = reviewCoaches[id];
        if (!walk) {
          var built;
          try { built = E.playbackGame(settings.review, 0); } catch (err) { built = null; }
          if (!built) return;
          walk = reviewCoaches[id] = { id: id, game: built, index: 0, discards: 0, notes: [] };
        }
        var coach = Coach.forStrategy(Strategies.get(id).bot);
        var hints = 0;
        while (walk.index < target) {
          var ev = actions[walk.index];
          var note = null;
          try { note = reviewFeedback(coach, walk.game, ev, walk.index + 1, walk.discards + 1); }
          catch (err) { note = null; }
          if (note) {
            walk.notes.push(note);
            hints++;
          }
          try { E.applyPlaybackAction(walk.game, ev); }
          catch (err) { walk.index = actions.length; break; }
          if (ev && ev.a === 'discard') walk.discards++; // one discard is one move, anyone's
          walk.index++;
          if (hints >= 2 && walk.index < target) { more = true; break; }
        }
      });
      // The table read: every hand face up, so it can say what you could not see.
      // Only for a finished hand: on one still being played it would give away
      // the other players' tiles, so just the coach's notes (what your seat saw) show.
      var table = [];
      if (Analysis && reviewFinished()) {
        try {
          if (!reviewAnalyst) reviewAnalyst = Analysis.createAnalyst(settings.review);
          if (reviewAnalyst.run(target, 10)) more = true;
          table = reviewAnalyst.notes();
        } catch (err) { table = []; }
      }
      if (more && !reviewCoachTimer) {
        reviewCoachTimer = setTimeout(function () {
          reviewCoachTimer = null;
          if (destroyed || !settings.review) return;
          ensureReviewNotes(reviewStep);
          requestRender();
        }, 0);
      }
      var mine = reviewCoaches[shown];
      var coachNotes = mine ? mine.notes : [];
      ui.coachLog = coachNotes.concat(table).filter(function (n) { return n.step <= reviewStep; }).map(function (n, k) {
        return { n: n, k: k };
      }).sort(function (a, b) { return a.n.step - b.n.step || a.k - b.k; }).map(function (o) { return o.n; });
    }

    // What this coach says about your discard, call, or kong, before it happens.
    function reviewFeedback(coach, game, ev, step, move) {
      if (!ev || ev.s !== 0) return null;
      var hint = null;
      var fb = null;
      if (ev.a === 'discard') {
        hint = coach.turnHint(game, 0, E.turnOptions(game, 0));
        if (hint && hint.tile) coach.noteDiscard(game, 0, hint.tile, ev.t);
        fb = coach.discardFeedback(hint, ev.t);
      } else if (ev.a === 'claim') {
        hint = coach.claimHint(game, 0, E.claimOptions(game, 0, ev.t, ev.from, false));
        if (hint && hint.decision && hint.decision.tiles) {
          hint = {
            action: hint.action, tips: hint.tips,
            decision: { type: hint.decision.type, tiles: hint.decision.tiles.slice().sort() },
          };
        }
        fb = coach.claimFeedback(hint, { type: ev.c, tiles: ev.tiles ? ev.tiles.slice().sort() : [] });
      } else if (ev.a === 'kong') {
        hint = coach.turnHint(game, 0, E.turnOptions(game, 0));
        fb = reviewKongFeedback(hint, ev.t);
      } else return null;
      if (!fb || !fb.action) return null;
      return {
        kind: 'feedback',
        action: fb.action,
        detail: (fb.tips || []).filter(Boolean).join(' '),
        hand: settings.review.handNumber || 1,
        move: move,
        step: step,
      };
    }

    function reviewKongFeedback(hint, tile) {
      var name = E.tileName(tile);
      var wanted = hint && hint.action && hint.action.indexOf('Kong ') === 0;
      if (wanted && hint.action.indexOf(name) !== -1) return { action: 'Good call.', tips: [hint.action] };
      if (wanted) return { action: 'The coach would have called ' + hint.action.replace(/[.!]$/, '') + '.', tips: ['You konged ' + name + '.'] };
      if (hint && hint.tile) return { action: 'The coach would have discarded ' + E.tileName(hint.tile) + '.', tips: ['You konged ' + name + '.'] };
      return null;
    }

    // A move is one discard. The stops are the deal, the step after each
    // discard, and the last step of the file when something follows the last
    // discard (a win, say). Draws, flowers and claims belong to the move they lead to.
    function reviewStops() {
      var rec = settings.review;
      if (reviewStopsFor && reviewStopsFor.rec === rec) return reviewStopsFor;
      var stops = [0], mine = [false], melds = [false], claims = [false], discards = 0;
      var limit = reviewMoves();
      var meld = false; // you exposed a meld since the last stop
      var claim = false; // you did a chow, pung or kong since the last stop
      for (var i = 0; i < limit; i++) {
        var ev = rec.actions[i];
        if (ev.s === 0 && (ev.a === 'claim' || ev.a === 'kong')) claim = true;
        if (ev.s === 0 && (ev.a === 'claim' || (ev.a === 'kong' && ev.k === 'added'))) meld = true;
        if (ev.a === 'discard') { stops.push(i + 1); mine.push(ev.s === 0); melds.push(meld); claims.push(claim); meld = false; claim = false; discards++; }
      }
      if (limit > 0 && stops[stops.length - 1] !== limit) { stops.push(limit); mine.push(false); melds.push(meld); claims.push(claim); }
      reviewStopsFor = { rec: rec, stops: stops, mine: mine, melds: melds, claims: claims, discards: discards };
      return reviewStopsFor;
    }

    // The last stop at or before this step.
    function reviewStopIndex(step) {
      var stops = reviewStops().stops, at = 0;
      for (var i = 0; i < stops.length; i++) if (stops[i] <= step) at = i;
      return at;
    }

    // Which move a step is on: discards so far (the closing step is not a move).
    function reviewMoveNo(step) {
      return Math.min(reviewStopIndex(step), reviewStops().discards);
    }

    // What happened to reach a stop: claims and the discard, without the draws.
    function reviewCaptionAt(step) {
      if (!step) return 'The deal.';
      var from = reviewStops().stops[Math.max(0, reviewStopIndex(step) - 1)];
      return E.playbackCaption(settings.review, from, step);
    }

    function reviewCaption() {
      return reviewCaptionAt(reviewStep);
    }

    // How far this signed file may play. Never past the move count it names.
    function reviewMoves() {
      var rec = settings.review;
      if (!rec || !rec.actions) return 0;
      var n = rec.actions.length;
      if (typeof rec.moves === 'number' && rec.moves >= 0) n = Math.min(n, rec.moves);
      return n;
    }

    function reviewSpoken() {
      if (!reviewStep) return 'The deal.';
      return 'Move ' + reviewMoveNo(reviewStep) + ' of ' + reviewStops().discards + '. ' + reviewCaption();
    }

    // One move is long enough to read. A reduced-motion visit waits longer.
    function reviewPace() { return (reduceMotion ? 2400 : 1500) / reviewSpeed; }

    function setReviewSpeed(v) {
      track('play_playback_speed', { speed: v });
      reviewSpeed = v;
      prefs.speed = v;
      writeJson(PREFS_KEY, prefs);
      announce('Speed ' + v + 'x.');
      if (reviewPlaying) scheduleReview();
      requestRender();
    }

    function stopReviewPlay() {
      reviewPlaying = false;
      if (reviewTimer) { clearTimeout(reviewTimer); reviewTimer = null; }
    }

    function scheduleReview() {
      if (reviewTimer) clearTimeout(reviewTimer);
      if (!reviewPlaying || destroyed) return;
      reviewTimer = setTimeout(function () {
        reviewTimer = null;
        if (!reviewPlaying || destroyed) return;
        if (reviewStep >= reviewMoves()) {
          stopReviewPlay();
          announce('The last move.');
          requestRender();
          return;
        }
        stepReview(1, true);
        scheduleReview();
      }, reviewPace());
    }

    function toggleReviewPlay() {
      track(reviewPlaying ? 'play_playback_pause_click' : 'play_playback_play_click', {});
      if (reviewPlaying) {
        stopReviewPlay();
        announce('Paused.');
        requestRender();
        return;
      }
      if (reviewStep >= reviewMoves()) {
        reviewStep = 0;
        if (!showReviewStep()) return;
      }
      reviewPlaying = true;
      announce('Playing.');
      scheduleReview();
      requestRender();
    }

    function reviewBarHit(p) {
      var b = reviewBar;
      if (!b || !p) return false;
      return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y - 4 && p.y <= b.y + b.h + 4;
    }

    // The move under a point on the bar. The deal is the left end.
    function reviewStepAt(px) {
      var stops = reviewStops().stops;
      if (!reviewBar || !reviewBar.w || stops.length < 2) return 0;
      return stops[clamp(Math.round((px - reviewBar.x) / reviewBar.w * (stops.length - 1)), 0, stops.length - 1)];
    }

    function jumpReview(step, quiet) {
      stopReviewPlay();
      reviewSeq++; // cancels a move still being played out
      step = clamp(step, 0, reviewMoves());
      if (step === reviewStep) return;
      var prev = reviewStep;
      reviewStep = step;
      if (!showReviewStep(quiet)) reviewStep = prev;
    }

    // The coach's bar holds what happened, the speed, the progress bar, and the transport buttons.
    function drawReviewCoachBox() {
      var x = L.ox + L.pad, w = L.tableW - 2 * L.pad, y = L.hintY, h = L.hintH;
      ui.coachBox = { x: x, y: y, w: w, h: h };
      ctx.save();
      roundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fill();
      ctx.restore();
      var padX = 14;
      var barH = 14, btnH = 34, gap = 10;
      var stack = barH + gap + btnH;
      if (stack > h - 8) btnH = Math.max(26, h - 8 - barH - gap);
      stack = barH + gap + btnH;
      var top = y + Math.max(4, (h - stack) / 2);
      drawReviewBar({ x: x + padX, y: top, w: w - padX * 2, h: barH });
      drawReviewButtons({ x0: x + padX, x1: x + w - padX, y: top + barH + gap, h: btnH });
    }

    // A pressed playback button: 1 right after the press, down to 0 over 260 ms.
    var pressedButton = null;
    function pressButton(id) {
      pressedButton = { id: id, at: now() };
      requestRender();
    }
    function pressAmount(id) {
      if (!pressedButton || pressedButton.id !== id) return 0;
      var age = now() - pressedButton.at;
      if (age >= 260) { pressedButton = null; return 0; }
      requestRender(); // keep drawing until it settles
      return 1 - age / 260;
    }

    // The playback buttons' icons, drawn here so they need no font. `s` is the
    // icon's height.
    function drawTransportIcon(kind, cx, cy, s, color) {
      var h = s / 2, w = s * 0.55;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      if (kind === 'play') {
        ctx.moveTo(cx - w * 0.7, cy - h); ctx.lineTo(cx + w * 0.9, cy); ctx.lineTo(cx - w * 0.7, cy + h);
      } else if (kind === 'pause') {
        var bw2 = s * 0.2;
        ctx.rect(cx - bw2 * 1.6, cy - h, bw2, s);
        ctx.rect(cx + bw2 * 0.6, cy - h, bw2, s);
      } else if (kind === 'prev') {
        // A bar on the left and a triangle pointing left.
        ctx.rect(cx - w * 1.05, cy - h, s * 0.16, s);
        ctx.moveTo(cx + w * 0.9, cy - h); ctx.lineTo(cx - w * 0.6, cy); ctx.lineTo(cx + w * 0.9, cy + h);
      } else if (kind === 'next') {
        ctx.rect(cx + w * 1.05 - s * 0.16, cy - h, s * 0.16, s);
        ctx.moveTo(cx - w * 0.9, cy - h); ctx.lineTo(cx + w * 0.6, cy); ctx.lineTo(cx - w * 0.9, cy + h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // One row: what happened (small, white) on the left, the transport buttons,
    // and the speed control at the right end.
    function drawReviewButtons(slot) {
      var n = reviewMoves();
      var acts = [];
      var speeds = [0.5, 1, 2];
      var sbw = W < 420 ? 30 : 36;
      var groupW = sbw * speeds.length;
      var rowW = slot.x1 - slot.x0;
      // Icons, not words: a triangle with a bar for Previous and Next, a triangle
      // for Play and two bars for Pause.
      // All three always show. Previous is dimmed and does nothing at the start,
      // and Next at the end. Play still works at the end: it starts over.
      acts.push({ id: 'review-prev', icon: 'prev', style: 'white', off: reviewStep <= 0, fn: function () { sound.play('back'); pressButton('review-prev'); stepReview(-1); } });
      acts.push({ id: 'review-play', icon: reviewPlaying ? 'pause' : 'play', style: 'gold', fn: function () { sound.play('select'); pressButton('review-play'); toggleReviewPlay(); } });
      acts.push({ id: 'review-next', icon: 'next', style: 'white', off: reviewStep >= n, fn: function () { sound.play('forward'); pressButton('review-next'); stepReview(1); } });
      var gap = 6;
      var bw = rowW >= 560 ? 84 : 66;
      // The buttons sit in the middle of the row, with the caption and the speed
      // control sharing the room on either side. A phone shows no caption (who
      // did what is in the move itself): the buttons and the speed control sit
      // together in the middle of the row.
      var phone = rowW < 440;
      var total = acts.length * bw + (acts.length - 1) * gap;
      var bx0, captionW;
      var gx;
      if (phone) {
        var fitPhone = rowW - groupW - 12; // room for the buttons beside the speed control
        bw = Math.max(44, Math.min(84, (fitPhone - (acts.length - 1) * gap) / acts.length));
        total = acts.length * bw + (acts.length - 1) * gap;
        bx0 = slot.x0 + (rowW - (total + 12 + groupW)) / 2;
        gx = bx0 + total + 12;
        captionW = 0;
      } else {
        var side = Math.max(groupW, 110) + 10;
        var fitW = rowW - 2 * side;
        if (total > fitW) {
          bw = Math.max(46, (fitW - (acts.length - 1) * gap) / acts.length);
          total = acts.length * bw + (acts.length - 1) * gap;
        }
        bx0 = slot.x0 + (rowW - total) / 2;
        captionW = bx0 - slot.x0 - 10;
        gx = slot.x1 - groupW;
        var caption = reviewCaption();
        // Up to three lines at 14, then smaller until it fits.
        var size = 14, lines;
        for (; size >= 11; size--) {
          ctx.font = 'bold ' + size + 'px ' + FONT_BODY;
          lines = wrapText(ctx, caption, captionW);
          if (lines.length <= 3) break;
        }
        lines = lines.slice(0, 3);
        var lh = size + 2;
        lines.forEach(function (ln, i) {
          text(ln, slot.x0, slot.y + slot.h / 2 + (i - (lines.length - 1) / 2) * lh + 1, { size: size, weight: 'bold', color: COLORS.cream });
        });
      }
      acts.forEach(function (a, i) {
        var ax = bx0 + i * (bw + gap);
        var cx = ax + bw / 2, cy = slot.y + slot.h / 2;
        // A press squeezes the button and lets it spring back, with a quick glow.
        var press = pressAmount(a.id);
        ctx.save();
        if (press > 0) {
          var squeeze = 1 - 0.12 * Math.sin(Math.PI * (1 - press)) ;
          ctx.translate(cx, cy);
          ctx.scale(squeeze, squeeze);
          ctx.translate(-cx, -cy);
        }
        if (a.off) ctx.globalAlpha = 0.35;
        button('', ax, slot.y, bw, slot.h, a.fn, a.style, a.id);
        if (press > 0) {
          ctx.save();
          ctx.globalAlpha = 0.5 * press;
          pill(ax, slot.y, bw, slot.h, COLORS.goldLight, null);
          ctx.restore();
        }
        drawTransportIcon(a.icon, cx, cy, Math.min(18, slot.h * 0.5), '#3a3a3a');
        ctx.restore();
        if (a.off) regions.pop(); // a dimmed button can't be pressed
      });
      var sbh = Math.min(slot.h, 28);
      var gy = slot.y + (slot.h - sbh) / 2;
      ctx.save();
      roundRect(ctx, gx, gy, groupW, sbh, sbh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      ctx.restore();
      speeds.forEach(function (v, i) {
        var on = reviewSpeed === v;
        var hot = hover === 'review-speed-' + v;
        var bx = gx + i * sbw;
        if (on || hot) {
          ctx.save();
          roundRect(ctx, bx + 2, gy + 2, sbw - 4, sbh - 4, (sbh - 4) / 2);
          ctx.fillStyle = on ? COLORS.gold : 'rgba(255,255,255,0.2)';
          ctx.fill();
          ctx.restore();
        }
        text(v + 'x', bx + sbw / 2, gy + sbh / 2 + 1, { size: 12, family: FONT_HEAD, align: 'center', color: on ? COLORS.ink : COLORS.cream });
        addRegion(bx, gy, sbw, sbh, function () { sound.play('select'); setReviewSpeed(v); }, 'review-speed-' + v);
      });
    }

    // The progress bar: a light groove with a gold fill, a dot for every move
    // (a bigger one for your own discards, a red one for any chow, pung or kong,
    // inside a yellow circle when it is your own meld), and a round handle.
    // Hovering shows what happened at that move.
    function drawReviewBar(slot) {
      var info = reviewStops();
      var stops = info.stops;
      var segs = Math.max(1, stops.length - 1);
      var x = slot.x, y = slot.y, w = slot.w, h = slot.h;
      reviewBar = { x: x, y: y, w: w, h: h };
      var live = hover === 'review-bar' || !!reviewScrub;
      var at = reviewStopIndex(reviewStep);
      var cy = y + h / 2;
      var trackH = live ? 10 : 8;
      var ty = cy - trackH / 2;
      // The groove.
      ctx.save();
      roundRect(ctx, x, ty, w, trackH, trackH / 2);
      var groove = ctx.createLinearGradient(0, ty, 0, ty + trackH);
      groove.addColorStop(0, 'rgba(255,248,240,0.30)');
      groove.addColorStop(1, 'rgba(255,248,240,0.16)');
      ctx.fillStyle = groove;
      ctx.fill();
      ctx.restore();
      // The fill, up to the move on the table.
      var fx = x + at / segs * w;
      if (at > 0) {
        ctx.save();
        roundRect(ctx, x, ty, Math.max(trackH, fx - x), trackH, trackH / 2);
        var grad = ctx.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, '#e08a10');
        grad.addColorStop(1, COLORS.goldLight);
        ctx.fillStyle = grad;
        ctx.fill();
        // A soft highlight along the top of the fill.
        roundRect(ctx, x + 2, ty + 1.5, Math.max(0, fx - x - 4), 2, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
        ctx.restore();
      }
      // A dot for each move, when they are far enough apart to read.
      var gapPx = w / segs;
      for (var i = 1; i < stops.length; i++) {
        var mine = info.mine[i];
        var exposed = info.melds[i];
        var called = info.claims[i];
        if (gapPx < 7 && !mine && !exposed && !called) continue;
        var dx = x + i / segs * w;
        var done = i <= at;
        if (exposed) {
          // A meld you exposed: a larger yellow circle behind the red dot.
          ctx.beginPath();
          ctx.arc(dx, cy, 5.2, 0, Math.PI * 2);
          ctx.fillStyle = '#FFE14D';
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = '#8a5200';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(dx, cy, called ? (exposed ? 2.8 : 3.8) : mine ? 3 : 1.5, 0, Math.PI * 2);
        // A red dot is a chow, pung or kong by you, not the computers.
        ctx.fillStyle = called ? COLORS.red : mine ? COLORS.cream : (done ? 'rgba(90,50,0,0.55)' : 'rgba(255,248,240,0.55)');
        ctx.fill();
        if (called && !exposed) {
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = COLORS.cream;
          ctx.stroke();
        } else if (mine && !called) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = done ? COLORS.gold : 'rgba(255,255,255,0.7)';
          ctx.stroke();
        }
      }
      // The handle.
      var hx = clamp(fx, x + 7, x + w - 7);
      var hr = live ? 8.5 : 7;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      ctx.arc(hx, cy, hr, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.cream;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(hx, cy, hr - 3, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
      // What is at the point under the pointer.
      if (live && mouse && mouse.x >= x - 4 && mouse.x <= x + w + 4) {
        var hoverStep = reviewStepAt(mouse.x);
        var idx = reviewStopIndex(hoverStep);
        var label = (hoverStep ? 'Move ' + reviewMoveNo(hoverStep) + ' · ' : '') + reviewCaptionAt(hoverStep);
        var size = 12;
        ctx.font = 'bold ' + size + 'px ' + FONT_BODY;
        var tw = Math.min(ctx.measureText(label).width + 16, Math.max(80, W - 16));
        var px = clamp(x + idx / segs * w - tw / 2, 4, W - tw - 4);
        var py = y - 30;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        roundRect(ctx, px, py, tw, 22, 6);
        ctx.fillStyle = 'rgba(20,20,20,0.92)';
        ctx.fill();
        ctx.restore();
        text(label, px + tw / 2, py + 12, { size: fitFont(ctx, label, tw - 12, size, FONT_BODY, 'bold'), weight: 'bold', align: 'center', color: COLORS.cream });
      }
      addRegion(x, y - 4, w, h + 8, function () {}, 'review-bar');
    }

    function clearReviewMotion() {
      reviewMotion++;
      flights.length = 0;
      banners.length = 0;
      particles.length = 0;
      ui.hide = { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null };
      ui.winInHand = null;
    }

    // Drop a flight that a newer step replaced. Banners finish on their own.
    function clearReviewFlights() {
      reviewMotion++;
      flights.length = 0;
      ui.hide = { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], flower: [0, 0, 0, 0], drawn: false, tile: null };
      ui.winInHand = null;
    }

    // Where a face-up tile sits in that seat's concealed row.
    function reviewHandPose(seat, tileId) {
      var tiles = E.sortTiles(game.hand.seats[seat].hand.slice());
      var at = tiles.lastIndexOf(tileId);
      if (seat === 0) {
        if (at < 0) return seatAnchor(0);
        var spot = handPositions(tiles.length)[at];
        return spot ? { x: spot.x, y: spot.y, w: L.tw, rot: 0 } : seatAnchor(0);
      }
      return reviewOppPose(seat, at, tiles.length);
    }

    // The same row after this step, once the arriving tile has a place in it.
    function reviewSortedPose(seat, tileId) {
      var tiles = revealedConcealed(seat);
      var at = tiles.lastIndexOf(tileId);
      if (at < 0) at = Math.max(0, tiles.length - 1);
      if (seat === 0) {
        var spot = handPositions(tiles.length)[at];
        return spot ? { x: spot.x, y: spot.y, w: L.tw, rot: 0 } : seatAnchor(0);
      }
      return reviewOppPose(seat, at, tiles.length);
    }

    function reviewOppPose(seat, index, count) {
      var hand = ui.oppHand[seat];
      if (!hand || index < 0) return seatAnchor(seat);
      var pitch = hand.bw + tileGap();
      var bx0 = hand.bx0 - ((count - hand.count) * pitch) / 2;
      return localPose(hand.f, bx0 + index * pitch, hand.backsY, hand.bw);
    }

    // Where the tile is now, and where it will land. Measured before the step.
    function reviewMotionFrom(ev) {
      if (!ev) return null;
      var seat = ev.s;
      if (ev.a === 'flower') return { from: reviewHandPose(seat, ev.t), to: ui.flowerAnchor[seat] || seatAnchor(seat) };
      if (ev.a === 'discard') {
        var n = game.hand.seats[seat].discards.filter(function (d) { return !d.claimed; }).length;
        return { from: reviewHandPose(seat, ev.t), to: pondPose(seat, n) };
      }
      if (ev.a === 'draw') return { from: drawOrigin() };
      if (ev.a === 'claim') {
        var list = game.hand.seats[ev.from] ? game.hand.seats[ev.from].discards : [];
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (!list[i].claimed && list[i].tile === ev.t) idx = i;
        return { from: idx >= 0 ? pondPose(ev.from, idx) : seatAnchor(ev.from), to: ui.meldAnchor[seat] || seatAnchor(seat) };
      }
      if (ev.a === 'kong' || ev.a === 'win' || ev.a === 'drawGame') return {};
      return null;
    }

    function reviewDeclare(seat, label, size) {
      var pos = declarationPos(seat);
      banner(label, pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, span: pos.span, maxH: pos.maxH, size: size || 32 });
    }

    // Where the tile of an action sits now, measured with that action applied:
    // the start of its flight when the action is played backwards.
    function reviewReverseFrom(ev) {
      var seat = ev.s;
      if (ev.a === 'discard') {
        var n = game.hand.seats[seat].discards.filter(function (d) { return !d.claimed; }).length;
        return { from: pondPose(seat, Math.max(0, n - 1)) };
      }
      if (ev.a === 'draw') return { from: reviewSortedPose(seat, ev.t) };
      if (ev.a === 'flower') return { from: ui.flowerAnchor[seat] || seatAnchor(seat) };
      if (ev.a === 'claim') return { from: ui.meldAnchor[seat] || seatAnchor(seat) };
      return null; // a kong declaration, a win and a drawn game have no flight
    }

    // The same move in reverse, once the earlier state is on the table: the
    // discard flies back to the hand, a draw back to the wall, a claimed tile back
    // to the pond, a flower back into the hand.
    function reviewPlayReverse(ev, rev) {
      var token = reviewMotion;
      var seat = ev.s;
      function finish() {
        if (token !== reviewMotion) return;
        ui.hide.pond[0] = ui.hide.pond[1] = ui.hide.pond[2] = ui.hide.pond[3] = 0;
        ui.hide.tile = null;
        ui.hide.hand = null;
        requestRender();
      }
      if (ev.a === 'discard' || ev.a === 'flower') {
        ui.hide.tile = ev.t;
        ui.hide.hand = seat;
        fly(ev.t, rev.from, reviewHandPose(seat, ev.t), seat === 0 ? 260 : 380, { arc: 26, glow: COLORS.gold }).then(finish);
        return;
      }
      if (ev.a === 'draw') {
        fly(ev.t, rev.from, drawOrigin(), 300, { arc: 20, glow: COLORS.gold }).then(finish);
        return;
      }
      if (ev.a === 'claim') {
        var list = game.hand.seats[ev.from] ? game.hand.seats[ev.from].discards : [];
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (!list[i].claimed && list[i].tile === ev.t) idx = i;
        var live = list.filter(function (d) { return !d.claimed; }).length;
        ui.hide.pond[ev.from] = 1;
        fly(ev.t, rev.from, pondPose(ev.from, idx >= 0 ? idx : Math.max(0, live - 1)), 320, { arc: 34, glow: COLORS.gold }).then(finish);
      }
    }

    // The flight, banner, and sound for the move that just landed on the table.
    function reviewPlayMotion(ev, motion) {
      var token = reviewMotion;
      var seat = ev.s;
      function finish() {
        if (token !== reviewMotion) return;
        ui.hide.pond[seat] = 0;
        ui.hide.meld[seat] = 0;
        ui.hide.flower[seat] = 0;
        ui.hide.tile = null;
        ui.hide.hand = null;
        if (ui.winInHand && ui.winInHand.seat === seat) ui.winInHand.landed = true;
        requestRender();
      }
      if (ev.a === 'flower') {
        sound.play('flower');
        reviewDeclare(seat, seat === 0 ? 'Flower!' : 'Flower', 24);
        ui.hide.flower[seat] = 1;
        fly(ev.t, motion.from, motion.to, 280, { arc: 18, glow: COLORS.gold }).then(finish);
        return;
      }
      if (ev.a === 'draw') {
        sound.play('draw');
        ui.hide.tile = ev.t;
        ui.hide.hand = seat;
        fly(ev.t, motion.from, reviewSortedPose(seat, ev.t), 300, { arc: 20, glow: COLORS.gold }).then(finish);
        return;
      }
      if (ev.a === 'discard') {
        ui.hide.pond[seat] = 1;
        fly(ev.t, motion.from, motion.to, seat === 0 ? 260 : 380, { arc: 26, glow: COLORS.gold }).then(function () {
          if (token === reviewMotion) sound.play('discard');
          finish();
        });
        return;
      }
      if (ev.a === 'claim') {
        sound.play(ev.c);
        reviewDeclare(seat, ev.c === 'chow' ? 'Chow!' : ev.c === 'kong' ? 'Kong!' : 'Pung!');
        ui.hide.meld[seat] = 1;
        fly(ev.t, motion.from, motion.to, 320, { arc: 34, glow: COLORS.gold }).then(finish);
        return;
      }
      if (ev.a === 'kong') {
        sound.play('kong');
        reviewDeclare(seat, 'Kong!');
        return;
      }
      if (ev.a === 'win') {
        var celebrate = function () {
          if (token !== reviewMotion || !L) return;
          var c = L.center;
          var mine = seat === 0;
          var label = ev.how === 'selfDraw' ? 'Self-draw!' : ev.how === 'flowers' ? 'Flower win!' : 'Win!';
          banner(label, c.x + c.w / 2, c.y + c.h / 2, { size: 34, dur: 1700, color: mine ? COLORS.gold : COLORS.red, textColor: mine ? COLORS.ink : COLORS.white });
          sound.play('win');
          confetti(c.x + c.w / 2, c.y + c.h / 2, mine ? 140 : 40, !mine);
          if (mine) confetti(c.x + c.w / 2, c.y + c.h / 2, 50, true);
        };
        if (ev.how === 'discard' && ev.t && ev.from != null) {
          ui.winInHand = { seat: seat, tile: ev.t, landed: false };
          fly(ev.t, claimedDiscardPose(ev.from), reviewSortedPose(seat, ev.t), 420, { arc: 36, glow: COLORS.gold }).then(function () {
            finish();
            celebrate();
          });
          return;
        }
        celebrate();
        return;
      }
      if (ev.a === 'drawGame' && L) {
        sound.play('drawgame');
        var c = L.center;
        banner('Draw', c.x + c.w / 2, c.y + c.h / 2, { size: 30, dur: 1400, color: COLORS.muted });
      }
    }

    // Puts the recorded hand on the table after `reviewStep` moves.
    // False when that move doesn't match the deal, and the table stays put.
    function showReviewStep(quiet, animated, reverseEv) {
      if (settings.review && reviewStep > reviewMoves()) reviewStep = reviewMoves();
      var motion = null;
      var ev = null;
      // Going back one action plays it in reverse: where the tile is now, measured
      // on the table as it stands, before the earlier state is drawn.
      var revFrom = null;
      if (reverseEv && speed(280) > 0 && game && game.hand && settings.review) revFrom = reviewReverseFrom(reverseEv);
      // One step forward plays the same flight the table uses. A jump snaps.
      if (animated && speed(280) > 0 && reviewStep === reviewShown + 1 && game && game.hand && settings.review) {
        ev = settings.review.actions[reviewShown];
        motion = ev ? reviewMotionFrom(ev) : null;
      }
      var built;
      try { built = E.playbackGame(settings.review, reviewStep); }
      catch (err) {
        announce('That move doesn\'t match the deal, so the replay stopped.');
        return false;
      }
      if (!built) return false;
      if ((motion && ev) || revFrom) {
        clearReviewFlights();
        reviewSnapHand = false;
      } else {
        clearReviewMotion();
        reviewSnapHand = true;
      }
      game = built;
      var seats = [null, null, null, null];
      settings.review.players.forEach(function (p, i) { if (p.strategy) seats[i] = p.strategy; });
      ui.strategies = { seats: seats, coach: ui.strategies.coach };
      // A finished hand's playback shows every hand face up, unless you hid them (double-click an
      // opponent's hand); an unfinished hand's opponents always stay concealed.
      ui.revealHands = reviewFinished() && prefs.showOpponents !== false;
      ui.coach = 'on';
      ui.turnPrompt = null;
      ui.claimPrompt = null;
      ui.notice = null;
      ui.feedback = null;
      ui.overlay = null;
      ui.hint = { action: reviewCaption(), tips: [] };
      ui.turnSeat = game.hand.turn;
      L = computeLayout();
      ensureReviewNotes(reviewStep);
      if (motion && ev) reviewPlayMotion(ev, motion);
      if (revFrom) reviewPlayReverse(reverseEv, revFrom);
      reviewShown = reviewStep;
      if (!quiet) announce(reviewSpoken());
      // The last move of a finished hand: its results, as the game showed them,
      // once the winning tile (or the last draw) has landed.
      if (!quiet && reviewStep > 0 && reviewStep >= reviewMoves() && reviewFinished()) {
        var at = reviewSeq;
        setTimeout(function () {
          if (destroyed || at !== reviewSeq || reviewStep < reviewMoves() || ui.overlay) return;
          showPlaybackResult();
        }, motion ? speed(700) : 0);
      }
      requestRender();
      return true;
    }

    // The results card for the playback on screen: who won, the hand, its
    // patterns and faan (the game's own card, without the payout).
    function showPlaybackResult() {
      var res = E.playbackResult(settings.review);
      if (!res) return;
      stopReviewPlay();
      ui.overlay = { type: 'summary', result: res, hasPlayback: false, playback: true };
      track('play_playback_results', { result: res.type === 'win' ? 'win' : 'draw' });
      announce(res.type === 'win'
        ? (res.winner === 0 ? 'You' : game.players[res.winner].name) + ' won with ' + res.score.faan + ' faan.'
        : 'No winner: the wall ran out.');
      requestRender();
    }

    // From the results: the hand again from the deal, playing.
    function watchAgain() {
      closeOverlay();
      stopReviewPlay();
      reviewSeq++;
      reviewStep = 0;
      if (!showReviewStep()) return;
      reviewPlaying = true;
      scheduleReview();
      requestRender();
    }

    function stepReview(d, keepPlaying) {
      if (!keepPlaying) stopReviewPlay();
      var stops = reviewStops().stops;
      var at = reviewStopIndex(reviewStep);
      // Off a stop (never by the buttons) going back lands on the one it is past.
      var to = d < 0 && stops[at] < reviewStep ? at : at + d;
      if (to < 0 || to >= stops.length) return;
      var next = stops[to];
      var prev = reviewStep;
      reviewSeq++; // a new step or jump cancels a move still being played out
      // Going forward, each action of the move plays in turn: the draw flies in
      // and the hand rearranges, then any claim, then the discard flies out.
      if (d > 0 && next - prev > 1 && !instantMode() && !reduceMotion) {
        playMoveSteps(prev, next, reviewSeq);
        return;
      }
      // Going back plays the move in reverse, the last action first.
      if (d < 0 && prev - next >= 1 && !instantMode() && !reduceMotion) {
        playMoveStepsBack(prev, next, reviewSeq);
        return;
      }
      // Without animation (or when jumping) the move lands at once.
      if (d > 0 && next - prev > 1) {
        reviewStep = next - 1;
        if (!showReviewStep(true)) { reviewStep = prev; return; }
      }
      reviewStep = next;
      if (!showReviewStep(false, d > 0)) reviewStep = prev;
    }

    // One move, action by action, each with its own flight. Stops if a newer
    // step or jump has started.
    var reviewSeq = 0;
    async function playMoveStepsBack(from, to, seq) {
      var rec = settings.review;
      for (var st = from; st > to; st--) {
        if (seq !== reviewSeq || destroyed || settings.review !== rec) return;
        var ev = rec.actions[st - 1];
        var last = st - 1 === to;
        var before = reviewStep;
        reviewStep = st - 1;
        if (!showReviewStep(!last, true, ev)) { reviewStep = before; return; }
        if (!last) {
          var wait = ev && (ev.a === 'claim' || ev.a === 'kong') ? 520 : 340;
          await sleep(wait / reviewSpeed);
        }
      }
    }

    async function playMoveSteps(from, to, seq) {
      var rec = settings.review;
      for (var st = from + 1; st <= to; st++) {
        if (seq !== reviewSeq || destroyed || settings.review !== rec) return;
        var ev = rec.actions[st - 1];
        var last = st === to;
        var before = reviewStep;
        reviewStep = st;
        if (!showReviewStep(!last, true)) { reviewStep = before; return; }
        if (!last) {
          // Long enough to watch the tile fly, shorter at a faster speed.
          var wait = ev && (ev.a === 'claim' || ev.a === 'kong') ? 520 : 340;
          await sleep(wait / reviewSpeed);
        }
      }
    }

    async function play() {
      // A quick load shows nothing extra; a slow one shows the skeleton after a moment.
      setTimeout(function () { if (!destroyed) requestRender(); }, skeletonAfterMs() + 30);
      if (settings.playback) {
        await loadAssets();
        if (destroyed) return;
        spriteCache = {};
        if (!settings.review) {
          // An upload shown in this view (a refresh), or else the game's own:
          // the hand on the table (in memory), or its last finished hand.
          var viewState = (root.history && root.history.state) || {};
          var picked = null;
          if (viewState.lcmUpload) picked = uploadedPlayback();
          else if (viewState.lcmRecent) {
            picked = recentPlaybacks().filter(function (e) { return playbackId(e.file) === viewState.lcmRecent; })[0] || null;
          }
          var stored = picked ? picked.file : (liveReplay || readJson(REPLAY_KEY, null));
          shownFile = stored;
          var check = stored ? E.checkPlayback(stored) : null;
          if (check && check.ok) {
            settings.review = check.record;
            // Back belongs to View playback, which opens this page on purpose.
            if (settings.replayFromStorage) settings.replayBack = true;
          } else if (check && check.reason) {
            reviewNote = check.reason;
          }
        }
        playbackLooked = true;
        if (settings.review) {
          // The view opens on the deal and plays by itself; the button says
          // Pause. A tab opened in the background waits until it is shown.
          reviewStep = 0;
          showReviewStep();
          if (document.hidden) reviewPausedByHide = true;
          else {
            reviewPlaying = true;
            scheduleReview();
          }
          requestRender();
        } else {
          announce(reviewNote || PLAYBACK_EMPTY);
          requestRender();
        }
        if (canvas.focus) canvas.focus();
        return;
      }
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
        ui.results = keptResults(p.results);
        pendingSummary = p.game.hand ? null : keptSummary(p.summary);
        ui.resultsOpen = !!p.resultsOpen;
        // Earlier hands' hints come back from storage. The hand in progress is
        // played again below, which gives its hints again.
        ui.hintLists = keptHints(readJson(HINTS_KEY, null));
        if (p.game.hand) {
          Object.keys(ui.hintLists).forEach(function (id) {
            ui.hintLists[id] = ui.hintLists[id].filter(function (e) { return e.hand !== game.handNumber; });
          });
        }
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
        ui.hintLists = {};
        if (!settings.lesson && !settings.playback) writeJson(HINTS_KEY, { v: 1, lists: {} }); // a new game overwrites the last one's hints
      }
      var agents = settings.lesson
        ? [humanAgent(), lessonAgent(), lessonAgent(), lessonAgent()]
        : [humanAgent(), botAgent(), botAgent(), botAgent()];
      track(saved ? 'play_resume' : 'play_start', {
        spicy: settings.spicy, mode: settings.mode, coach: settings.coach,
        speed: settings.speed, coach_strategy: ui.strategies.coach,
        strategies: ui.strategies.seats.slice(1).join(','),
      });
      if (pendingSummary) restoreFinishedHand();
      var showSavedResults = consumeResultsRequest() || !!ui.resultsOpen;
      if (game.over && !pendingSummary) {
        showFinalMatch();
        ui.overlay = { type: 'gameover' };
        L = computeLayout();
        requestRender();
        if (showSavedResults) openResults();
        return;
      }
      autosave();
      if (pendingSummary) {
        var held = pendingSummary;
        await showOverlay({ type: 'summary', result: held.result, extra: held.extra });
        if (destroyed) return;
        pendingSummary = null;
        autosave(true); // Next hand was pressed: this is the next deal
        if (settings.lesson) {
          callbacks.quit();
          return;
        }
        if (game.over) {
          track('play_game_over', { hands: ui.stats.hands, wins: ui.stats.wins });
          showFinalMatch();
          L = computeLayout();
          // Only the game over window shows (not the Results table): its Results
          // button opens that. The match's playback is kept for a refresh.
          ui.overlay = { type: 'gameover' };
          saveMatchPlayback();
          requestRender();
          return;
        }
      }
      while (!destroyed) {
        var res = await E.runHand(game, agents, uiBridge, replay);
        replay = null;
        if (destroyed) return;
        recordStats(res);
        rememberResult(res);
        ui.turnSeat = null;
        track('play_hand_end', {
          result: res.type === 'draw' ? 'draw' : res.winner === 0 ? 'win' : 'loss',
          faan: res.type === 'win' ? res.score.faan : 0,
        });
        var extra = null;
        if (settings.lesson && res.type === 'win' && res.winner === 0) extra = 'You won a Half Flush on East Wind.';
        else if (res.roundAdvanced) extra = 'The round wind is now ' + E.WIND_NAMES[game.round] + '.';
        if (game.over) extra = 'That was the last deal of the game.';
        pendingSummary = keptSummary({ result: res, extra: extra });
        if (!settings.lesson) { // a refresh puts this hand back for Show hands
          var finished = currentReplay();
          if (finished) keepReplay(finished);
        }
        autosave(true); // a refresh returns to these results until Next hand
        await showOverlay({ type: 'summary', result: res, extra: extra });
        if (destroyed) return;
        pendingSummary = null;
        autosave(true); // Next hand was pressed: this is the next deal
        if (settings.lesson) {
          callbacks.quit();
          return;
        }
        if (game.over) {
          track('play_game_over', { hands: ui.stats.hands, wins: ui.stats.wins });
          showFinalMatch();
          L = computeLayout();
          // Only the game over window shows (not the Results table): its Results
          // button opens that. The match's playback is kept for a refresh.
          ui.overlay = { type: 'gameover' };
          saveMatchPlayback();
          requestRender();
          return;
        }
      }
    }

    /* ---------------- lifecycle ---------------- */

    var onResize = function () { resize(); };
    root.addEventListener('resize', onResize);
    // A page restored from the browser's frozen-page cache keeps its variables
    // and timers, so auto-play would still be on; it never is after a load.
    var onPageLife = function (e) {
      if (e.type === 'pagehide' || e.persisted) stopAutoPlay();
    };
    root.addEventListener('pageshow', onPageLife);
    root.addEventListener('pagehide', onPageLife);
    // The music pauses while the tab is in the background.
    var reviewPausedByHide = false;
    var onVisibility = function () {
      if (settings.playback) {
        if (settings.review && document.hidden) {
          if (reviewPlaying) { reviewPausedByHide = true; stopReviewPlay(); requestRender(); }
        } else if (settings.review && reviewPausedByHide) {
          reviewPausedByHide = false;
          reviewPlaying = true;
          scheduleReview();
          requestRender();
        }
        sound.music(!document.hidden);
        return;
      }
      sound.music(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    root.addEventListener('keydown', onKey);
    // The sheets belong to the page, and every table (a new game, the playback
    // view) adds its own listeners to them, so destroy() takes them off again:
    // [element, type, handler] for each.
    var sheetListeners = [];
    function onSheet(el, type, fn) {
      el.addEventListener(type, fn);
      sheetListeners.push([el, type, fn]);
    }
    (function () {
      var dlg = rulesSheet();
      if (!dlg) return;
      onSheet(dlg.querySelector('.rules-sheet-close'), 'click', closeRules);
      // A click on the dimmed area outside the sheet closes it too.
      onSheet(dlg, 'click', function (e) { if (e.target === dlg) closeRules(); });
      onSheet(dlg, 'close', function () { canvas.focus(); });
    })();
    (function () {
      var dlg = strategiesSheet();
      if (!dlg) return;
      onSheet(dlg.querySelector('.rules-sheet-close'), 'click', closeStrategies);
      onSheet(dlg, 'click', function (e) { if (e.target === dlg) closeStrategies(); });
      onSheet(dlg, 'close', function () { canvas.focus(); });
    })();
    (function () {
      var dlg = settings.playback ? playbacksSheet() : null;
      if (!dlg) return;
      onSheet(dlg.querySelector('.rules-sheet-close'), 'click', closePlaybacks);
      onSheet(dlg, 'click', function (e) { if (e.target === dlg) closePlaybacks(); });
      onSheet(dlg, 'close', function () { canvas.focus(); });
      var up = document.getElementById('playbacks-upload');
      // A click on a page button may open the file picker straight away.
      if (up) onSheet(up, 'click', function () {
        sound.play('select');
        track('play_playback_upload_click', {});
        closePlaybacks();
        openReplayPicker();
      });
    })();
    (function () {
      var dlg = settings.playback ? uploadErrorSheet() : null;
      if (!dlg) return;
      onSheet(dlg.querySelector('.rules-sheet-close'), 'click', closeUploadError);
      onSheet(dlg, 'click', function (e) { if (e.target === dlg) closeUploadError(); });
      onSheet(dlg, 'close', function () { canvas.focus(); });
    })();
    (function () {
      var dlg = resultsSheet();
      if (!dlg) return;
      onSheet(dlg.querySelector('.rules-sheet-close'), 'click', closeResults);
      onSheet(dlg, 'click', function (e) { if (e.target === dlg) closeResults(); });
      onSheet(dlg, 'close', function () {
        canvas.focus();
        if (resultsStay) { resultsStay = false; return; }
        markResultsOpen(false);
      });
    })();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('paste', onCanvasPaste);
    var ro = root.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(canvas);
    resize();

    // Set aside while the playback view covers this table: no keys, no
    // resizes (a hidden canvas measures 0) and no music. The game itself
    // stays as it is, so resume() carries on from exactly there.
    var suspended = false;
    function detachWindow() {
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeEventListener('resize', onResize);
      root.removeEventListener('keydown', onKey);
      if (ro) ro.disconnect();
    }

    return {
      suspend: function () {
        if (destroyed || suspended) return;
        suspended = true;
        detachWindow();
        sound.music(false);
      },
      resume: function () {
        if (destroyed || !suspended) return;
        suspended = false;
        // The playback view may have changed Sound or the playback speed.
        // Take them, so this table never writes back an older choice.
        var fresh = readJson(PREFS_KEY, null);
        if (fresh) Object.keys(fresh).forEach(function (k) { prefs[k] = fresh[k]; });
        if (!soundParam) {
          sound.enabled = prefs.sound !== false;
          sound.musicEnabled = sound.enabled;
        }
        document.addEventListener('visibilitychange', onVisibility);
        root.addEventListener('resize', onResize);
        root.addEventListener('keydown', onKey);
        if (ro) ro.observe(canvas);
        resize();
        sound.music(!document.hidden);
        requestRender();
      },
      get suspended() { return suspended; },
      // Your wind badge's click (auto-play on localhost with the coach on; else copy the seed).
      clickMyWind: function () { if (!destroyed) onMyWind(); },
      get autoPlay() { return autoPlay; },
      get stats() { return ui.stats; },
      // The menu's View playback, for this hand.
      viewPlayback: function () { if (!destroyed && !settings.playback) viewReplay(); },
      // The playback bar's View playback: the sheet of recent hands and the upload.
      openPlaybacks: function () { if (!destroyed && settings.playback) openPlaybacks(); },
      start: function () {
        sound.music(true);
        play().catch(function (err) {
          if (root.console) console.error(err);
        });
      },
      destroy: function () {
        destroyed = true;
        stopAutoPlay();
        root.removeEventListener('pageshow', onPageLife);
        root.removeEventListener('pagehide', onPageLife);
        if (strategyToastTimer) clearTimeout(strategyToastTimer);
        stopReviewPlay();
        if (reviewCoachTimer) { clearTimeout(reviewCoachTimer); reviewCoachTimer = null; }
        sound.stopMusic();
        detachWindow();
        sheetListeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
        sheetListeners = [];
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('click', onCanvasClick);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('paste', onCanvasPaste);
        if (replayFileInput) { replayFileInput.remove(); replayFileInput = null; }
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
  // The settings the options page (/play-mahjong/) saved.
  function savedSettings(saved) {
    saved = saved || {};
    return {
      spicy: 'full',
      mode: saved.mode === 'payout' ? 'payout' : 'practice',
      // Older saves had a hints on/off flag. With nothing saved, the coach is on.
      coach: saved.coach || (saved.hints === false ? 'off' : 'on'),
      // Animations are always on; ?instant=1 skips them for a visit (see below).
      speed: 'normal',
    };
  }

  /* The game page, /playing-mahjong/. The options page (/play-mahjong/) sends
     you here: ?new=1 starts a new game in the mode it saved, ?learn=1 the
     lesson, and no query resumes the saved game (or starts one if there is
     none). A refresh resumes the saved game. ?playback=1 is the playback
     view. Quit goes back to the options page. */
  function init() {
    var stage = document.getElementById('play-stage');
    var canvas = document.getElementById('play-canvas');
    var live = document.getElementById('play-live');
    if (!stage || !canvas) return;
    loadAssets();

    function hasParam(name) {
      return new RegExp('[?&]' + name + '=1(&|$)').test(root.location.search);
    }

    // Takes a one-time request (?new=1) out of the address, so a refresh resumes.
    function dropParam(name) {
      if (!root.history || !root.history.replaceState) return;
      var url = new URL(root.location.href);
      url.searchParams.delete(name);
      root.history.replaceState(root.history.state, '', url.pathname + url.search);
    }

    // Keep a quiet or instant visit quiet on the next page too.
    function pageUrl(path) {
      var url = new URL(path, root.location.origin);
      var search = root.location.search || '';
      var sound = /[?&]sound=(0|1)(?:&|$)/.exec(search);
      if (sound) url.searchParams.set('sound', sound[1]);
      if (/[?&]instant=1(?:&|$)/.test(search)) url.searchParams.set('instant', '1');
      return url.pathname + url.search;
    }

    function goToOptions() {
      root.location.assign(pageUrl('/play-mahjong/'));
    }

    function settingsNow() {
      var settings = savedSettings(readJson(SETTINGS_KEY, {}));
      // ?instant=1 skips animations for this visit only, to speed up testing.
      if (hasParam('instant')) settings.speed = 'off';
      return settings;
    }

    // Tables are made through the api, so a test can stand in for them.
    var table = null;
    function open(settings, saved) {
      // A new game takes the save slot. A lesson leaves a saved game alone.
      if (!saved && !settings.lesson) removeJson(AUTOSAVE_KEY);
      closePlaybackView();
      stage.hidden = false;
      document.documentElement.classList.add('is-playing');
      if (table) table.destroy();
      table = api.createTable(canvas, live, settings, {
        quit: close,
        restart: function () { open(settings); },
        // Already on the playback's entry (a refresh brought the game back
        // under it): no second entry.
        playback: function () { showPlayback(!inPlaybackEntry()); },
        fullscreen: toggleFullscreen,
        isFullscreen: function () { return !!fullscreenElement(); },
      }, saved);
      table.start();
      canvas.focus();
      root.__lcmTable = table;
      hideToolbar();
    }

    function startFresh() {
      open(settingsNow());
    }

    function startLesson() {
      var settings = settingsNow();
      settings.mode = 'practice';
      settings.lesson = true;
      open(settings);
    }

    // The saved game, if its signature checks out. Otherwise a new game.
    // extra: settings for the table (openPlayback).
    function resumeGame(extra) {
      var stored = readJson(AUTOSAVE_KEY, null);
      if (!stored || !stored.payload || !stored.payload.game || !E.checkSave) { startFresh(); return; }
      E.checkSave(stored).then(function (check) {
        if (!check.ok) { startFresh(); return; }
        open(Object.assign(settingsNow(), { mode: stored.payload.game.settings.mode }, extra || {}), stored);
      }, startFresh);
    }

    // A refresh of View playback on a hand still being played. That hand's
    // playback was never stored (it holds the whole deal), so the game comes
    // back from its save, played up to the current move, and its playback
    // opens again on this same entry: the hand on the table, not a stored or
    // uploaded one.
    function handInProgress() {
      var stored = readJson(AUTOSAVE_KEY, null);
      return !!(stored && stored.payload && stored.payload.game && stored.payload.game.hand);
    }
    function refreshedGamePlayback() {
      var state = (root.history && root.history.state) || {};
      return !!(state.lcmFromGame && !state.lcmUpload && handInProgress());
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

    /* The playback view: a second table on its own canvas in the same stage.
       The game's table is only set aside under it (suspend), so going back
       finds it exactly as it was. Nothing is loaded for it: the scripts, tiles
       and sounds are the game's. ?playback=1 marks it, so a refresh opens the
       same view, with the hand read from storage. Stepping through the moves
       never touches the history, so Back always leaves the view. */
    var playbackCanvas = document.getElementById('playback-canvas');
    var playbackLive = document.getElementById('playback-live');
    var playbackTable = null;
    var strategiesIntro = document.querySelector('#strategies-sheet .rules-sheet-intro');
    var gameStrategiesIntro = strategiesIntro ? strategiesIntro.textContent : '';
    var PLAYBACK_STRATEGIES_INTRO = 'How each strategy chooses a discard. The coach is the one named on the side panel.';

    function isPlaybackUrl() {
      return /[?&]playback=1(&|$)/.test(root.location.search);
    }

    function playbackUrl(on) {
      var url = new URL(root.location.href);
      if (on) url.searchParams.set('playback', '1');
      else url.searchParams.delete('playback');
      return url;
    }

    function inPlaybackEntry() {
      return !!(root.history.state && root.history.state.lcmPlayback);
    }

    function closeSheets() {
      document.querySelectorAll('dialog.rules-sheet[open]').forEach(function (dlg) { dlg.close(); });
    }

    // fromGame: View playback on the open game. The view gets a history entry
    // of its own over the game's, so Back (the button or the browser's) returns
    // to the game. Otherwise (a refresh, a link, Forward) the entry is already here.
    function showPlayback(fromGame) {
      if (!playbackCanvas || !playbackLive) return;
      if (fromGame && root.history && root.history.pushState) {
        var state = Object.assign({}, root.history.state || {}, { lcmPlayback: true, lcmFromGame: true });
        root.history.pushState(state, '', playbackUrl(true));
      } else if (root.history && root.history.replaceState && !inPlaybackEntry()) {
        root.history.replaceState(Object.assign({}, root.history.state || {}, { lcmPlayback: true }), '', playbackUrl(true));
      }
      if (playbackTable) return;
      closeSheets();
      if (table) table.suspend();
      stage.hidden = false;
      canvas.hidden = true;
      playbackCanvas.hidden = false;
      if (strategiesIntro) strategiesIntro.textContent = PLAYBACK_STRATEGIES_INTRO;
      document.documentElement.classList.add('is-playing');
      playbackTable = api.createTable(playbackCanvas, playbackLive, {
        playback: true,
        review: null,
        replayFromStorage: true,
        coach: 'on',
        speed: 'normal',
        spicy: 'full',
        mode: 'practice',
      }, { quit: function () {}, restart: function () {}, back: leavePlayback });
      playbackTable.start();
      playbackCanvas.focus();
      root.__lcmPlayback = playbackTable;
      hideToolbar();
    }

    // Takes the playback view down. The game's table, if any, comes back as it was.
    function closePlaybackView() {
      if (!playbackTable) return false;
      closeSheets();
      playbackTable.destroy();
      playbackTable = null;
      root.__lcmPlayback = null;
      if (playbackCanvas) playbackCanvas.hidden = true;
      canvas.hidden = false;
      if (strategiesIntro) strategiesIntro.textContent = gameStrategiesIntro;
      if (table) {
        table.resume();
        canvas.focus();
      } else {
        stage.hidden = true;
        document.documentElement.classList.remove('is-playing');
      }
      return true;
    }

    // With no game in memory (playback opened by a refresh or a link), the
    // saved game opens on its results, as it ended. With none, the options page.
    function reopenAfterPlayback() {
      if (table) return;
      if (readJson(AUTOSAVE_KEY, null)) {
        var url = new URL(root.location.href);
        url.searchParams.set('results', '1');
        root.history.replaceState(root.history.state, '', url.pathname + url.search);
        resumeGame();
      } else {
        goToOptions();
      }
    }

    // Back on the playback bar: always the game, never an earlier move.
    function leavePlayback() {
      if (inPlaybackEntry() && root.history.state.lcmFromGame) {
        root.history.back(); // the game's own entry is under this one (popstate does the rest)
        return;
      }
      // Opened straight on ?playback=1: this entry becomes the game's.
      if (root.history && root.history.replaceState) {
        var state = Object.assign({}, root.history.state || {});
        delete state.lcmPlayback;
        delete state.lcmFromGame;
        root.history.replaceState(state, '', playbackUrl(false));
      }
      closePlaybackView();
      reopenAfterPlayback();
    }

    // Quitting goes back to the options page. The saved game stays, so
    // Resume game there brings it back.
    function close() {
      leaveAutoFullscreen();
      document.documentElement.classList.remove('is-sideways');
      if (table) table.destroy();
      table = null;
      goToOptions();
    }

    if (hasParam('playback') && refreshedGamePlayback()) resumeGame({ openPlayback: true });
    else if (hasParam('playback')) showPlayback(false);
    else if (hasParam('learn')) startLesson();
    else if (hasParam('new')) { dropParam('new'); startFresh(); }
    else resumeGame();

    // Back from playback returns to the game, and Forward to playback again.
    root.addEventListener('popstate', function () {
      if (inPlaybackEntry() || isPlaybackUrl()) {
        if (!playbackTable) showPlayback(false);
        return;
      }
      if (closePlaybackView() && !table) reopenAfterPlayback();
    });
  }

  // The most hands you won in a row, read from the Results table's rows (a
  // row where your faan is above 0 and it wasn't a draw is a win of yours). A
  // hand you didn't win, a drawn hand too, ends the run. 0 when you won none.
  function longestWinStreak(rows) {
    var best = 0, run = 0;
    (rows || []).slice().sort(function (a, b) { return a.hand - b.hand; }).forEach(function (row) {
      if (row && !row.draw && row.faan && row.faan[0] > 0) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    });
    return best;
  }

  // A development address: this computer, or a private network (a phone on
  // the local wifi, say). The same set the pages' analytics skip, so testing
  // adds no events: localhost, 127.x.x.x, ::1, 10.x.x.x, 192.168.x.x,
  // 172.16-31.x.x, and .local, .localhost and .test names. Auto-play is for
  // these only.
  function isLocalHost(host) {
    return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local|.+\.localhost|.+\.test)$/i.test(String(host || ''));
  }

  var api = { createTable: createTable, init: init, isLocalHost: isLocalHost, longestWinStreak: longestWinStreak };
  root.MahjongGame = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
