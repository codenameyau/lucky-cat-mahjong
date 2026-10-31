/* Play page: the Hong Kong mahjong table, drawn on a single <canvas>.
   Rendering is on demand (only while something animates or changes);
   tile faces are pre-rendered once per size into sprite canvases.
   Game rules live in mahjong-engine.js, bots and hints in mahjong-bot.js,
   scoring in points.js. */

(function (root) {
  'use strict';

  var E = root.MahjongEngine;
  var B = root.MahjongBot;
  var Coach = root.MahjongCoach;

  var SETTINGS_KEY = 'lcm-play-settings';
  var PREFS_KEY = 'lcm-play-prefs';
  var TILE_ASPECT = 1.4;

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

  function track(name, params) {
    if (typeof root.gtag === 'function') root.gtag('event', name, params || {});
  }

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
      if (images.logo && w >= 14) {
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
    spriteCache[key] = cv;
    return cv;
  }

  /* ------------------------------------------------------------------ *
   * 2. Sound (synthesized with WebAudio; no audio files to download)
   * ------------------------------------------------------------------ */

  // Tile sounds are layered "clacks": a crisp noise tick, a few short
  // inharmonic partials (the ring of a bone/resin tile), and a soft table
  // thud. Musical cues use plucked-string notes (Karplus-Strong) on a
  // pentatonic scale and a soft gong, instead of plain beeps.
  var NOTE = { G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880 };

  function createSound(enabled) {
    var ac = null;
    var master = null;
    var plucks = {};
    var api = { enabled: enabled };

    function ctx() {
      if (!api.enabled) return null;
      if (!ac) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createDynamicsCompressor();
        master.threshold.value = -14;
        master.ratio.value = 3;
        var out = ac.createGain();
        out.gain.value = 0.9;
        master.connect(out);
        out.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }

    function env(a, start, peak, dur, attack) {
      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + (attack || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      g.connect(master);
      return g;
    }

    function partial(a, start, freq, gain, dur) {
      var o = a.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, start);
      o.connect(env(a, start, gain, dur));
      o.start(start);
      o.stop(start + dur + 0.02);
    }

    // Tile impacts are modal: a few short, decaying resonances plus a tiny
    // noise transient. A handful of variants per kind are rendered once and
    // replayed with slight pitch changes so no two hits sound identical.
    var IMPACTS = {
      // Tile striking tile: hard, bright and very short.
      click: { dur: 0.07, spread: 0.12, tick: 0.5, thump: 0, modes: [[2450, 0.016, 1], [3900, 0.011, 0.75], [5600, 0.007, 0.5], [7900, 0.004, 0.3]] },
      // Tile set down on the felt-covered table: duller and lower.
      thock: { dur: 0.1, spread: 0.1, tick: 0.25, thump: 0.6, modes: [[820, 0.022, 0.7], [1500, 0.016, 1], [2650, 0.01, 0.55], [4300, 0.005, 0.25]] },
    };
    var banks = {};

    function makeImpact(a, spec) {
      var sr = a.sampleRate;
      var len = Math.floor(sr * spec.dur);
      var buf = a.createBuffer(1, len, sr);
      var y = buf.getChannelData(0);
      var modes = spec.modes.map(function (m) {
        return {
          w: 2 * Math.PI * m[0] * (1 + (Math.random() - 0.5) * 2 * spec.spread),
          d: m[1] * (0.8 + Math.random() * 0.4),
          g: m[2] * (0.7 + Math.random() * 0.6),
          ph: Math.random() * Math.PI * 2,
        };
      });
      var low = 0, peak = 0;
      for (var i = 0; i < len; i++) {
        var t = i / sr;
        var v = 0;
        for (var k = 0; k < modes.length; k++) v += modes[k].g * Math.exp(-t / modes[k].d) * Math.sin(modes[k].w * t + modes[k].ph);
        var n = Math.random() * 2 - 1;
        v += spec.tick * n * Math.exp(-t / 0.0012);
        low += (n - low) * 0.06;
        v += spec.thump * low * 3 * Math.exp(-t / 0.01);
        y[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      for (var j = 0; j < len; j++) y[j] *= 0.9 / peak;
      return buf;
    }

    function impact(a, start, kind, gain, rate) {
      var bank = banks[kind];
      if (!bank) {
        bank = banks[kind] = [];
        for (var i = 0; i < 6; i++) bank.push(makeImpact(a, IMPACTS[kind]));
      }
      var src = a.createBufferSource();
      src.buffer = bank[Math.floor(Math.random() * bank.length)];
      src.playbackRate.value = (rate || 1) * (0.94 + Math.random() * 0.12);
      var g = a.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(master);
      src.start(start);
    }

    // Tile against tile.
    function clack(a, start, gain, pitch) { impact(a, start, 'click', gain, pitch); }
    // Tile put down on the table.
    function thock(a, start, gain, pitch) { impact(a, start, 'thock', gain, pitch); }

    function pluckBuffer(a, freq, dur) {
      var key = Math.round(freq) + ':' + dur;
      if (plucks[key]) return plucks[key];
      var sr = a.sampleRate;
      var len = Math.floor(sr * dur);
      var buf = a.createBuffer(1, len, sr);
      var y = buf.getChannelData(0);
      var n = Math.max(2, Math.round(sr / freq));
      for (var i = 0; i < n; i++) y[i] = Math.random() * 2 - 1;
      for (var k = 1; k < n; k++) y[k] = (y[k] + y[k - 1]) * 0.5; // soften the attack
      for (var m = n; m < len; m++) y[m] = 0.4985 * (y[m - n] + y[m - n + 1]);
      plucks[key] = buf;
      return buf;
    }

    function pluck(a, start, freq, gain, dur, dest) {
      dur = dur || 1.4;
      var src = a.createBufferSource();
      src.buffer = pluckBuffer(a, freq, dur);
      var lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      var g = a.createGain();
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(lp); lp.connect(g); g.connect(dest || master);
      src.start(start);
    }

    function gong(a, start, gain) {
      [[98, 1], [151, 0.6], [207, 0.45], [283, 0.3], [392, 0.15]].forEach(function (pr, k) {
        partial(a, start + k * 0.004, pr[0], gain * pr[1], 2.6 - k * 0.3);
      });
    }

    api.play = function (name, opt) {
      var a = ctx();
      if (!a) return;
      var t = a.currentTime + 0.01;
      switch (name) {
        case 'draw':
          clack(a, t, 0.2, 1.05);
          break;
        case 'discard':
          thock(a, t, 0.75, 1);
          clack(a, t + 0.022, 0.22, 1);
          break;
        case 'select':
          clack(a, t, 0.06, 1.2);
          break;
        case 'flower':
          pluck(a, t, NOTE.G5, 0.22, 1.2);
          pluck(a, t + 0.09, NOTE.E5, 0.18, 1.2);
          break;
        case 'claim':
          thock(a, t, 0.45, 0.95);
          clack(a, t + 0.05, 0.4, 1);
          pluck(a, t + 0.04, NOTE.A4, 0.26);
          pluck(a, t + 0.12, NOTE.D5, 0.22);
          break;
        case 'kong':
          for (var k = 0; k < 4; k++) {
            thock(a, t + k * 0.055, 0.32, 1);
            clack(a, t + k * 0.055 + 0.01, 0.3, 0.95 + k * 0.03);
          }
          pluck(a, t + 0.08, NOTE.G4, 0.26);
          pluck(a, t + 0.2, NOTE.D5, 0.24);
          break;
        case 'turn':
          pluck(a, t, NOTE.E5, 0.13, 0.9);
          break;
        case 'win':
          gong(a, t, 0.32);
          [NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5].forEach(function (f, n) {
            pluck(a, t + 0.05 + n * 0.09, f, 0.24, 1.8);
          });
          break;
        case 'otherwin':
          gong(a, t, 0.22);
          pluck(a, t + 0.05, NOTE.D5, 0.2, 1.6);
          pluck(a, t + 0.17, NOTE.G4, 0.18, 1.6);
          break;
        case 'lose':
          [NOTE.E5, NOTE.D5, NOTE.A4, NOTE.G4].forEach(function (f, n) { pluck(a, t + n * 0.17, f, 0.2, 1.6); });
          break;
        case 'drawgame':
          pluck(a, t, NOTE.D5, 0.2, 1.4);
          pluck(a, t + 0.22, NOTE.A4, 0.2, 1.6);
          break;
      }
    };
    /* Background music: a calm tune on plucked zither strings in G major
       pentatonic over a soft pad, 4 phrases of 8 beats that loop, with small
       variations each time round. Each phrase is scheduled a little ahead of
       time so the loop never stutters. */
    var BEAT = 60 / 64;
    function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    // [root, melody as [beat, note, beats]] for each phrase.
    var PHRASES = [
      [43, [[0, 74, 1], [1, 76, 1], [2, 79, 2], [4, 76, 1], [5, 74, 1], [6, 71, 2]]],
      [40, [[0, 76, 1], [1, 74, 1], [2, 71, 1], [3, 69, 1], [4, 71, 2.5], [7, 74, 1]]],
      [45, [[0, 76, 1.5], [1.5, 79, 0.5], [2, 81, 2], [4, 79, 1], [5, 76, 1], [6, 74, 2]]],
      [38, [[0, 71, 1], [1, 69, 1], [2, 67, 2], [4, 69, 1], [5, 71, 1], [6, 74, 1.5], [7.5, 67, 0.5]]],
    ];
    var music = { timer: null, bus: null, next: 0, count: 0 };

    function pad(a, t, root, dur) {
      var out = a.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.05, t + 1.6);
      out.gain.setValueAtTime(0.05, t + dur - 0.4);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
      var lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.connect(out);
      out.connect(music.bus);
      [[root + 12, -4], [root + 19, 4], [root + 24, 0]].forEach(function (n) {
        var o = a.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n[0]);
        o.detune.value = n[1];
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 1.8);
      });
    }

    function schedulePhrase(a, t) {
      var p = PHRASES[music.count % PHRASES.length];
      var round = Math.floor(music.count / PHRASES.length);
      var dur = 8 * BEAT;
      pad(a, t, p[0], dur);
      pluck(a, t, midi(p[0] + 12), 0.1, 2.4, music.bus);
      pluck(a, t + 4 * BEAT, midi(p[0] + 19), 0.07, 2.2, music.bus);
      p[1].forEach(function (n) {
        var at = t + n[0] * BEAT + (Math.random() - 0.5) * 0.03;
        pluck(a, at, midi(n[1]), 0.1 + Math.random() * 0.03, Math.min(2.4, n[2] * BEAT + 1), music.bus);
        // Every other time round, a soft octave echo on longer notes.
        if (round % 2 === 1 && n[2] >= 2) pluck(a, at + BEAT * 0.5, midi(n[1] + 12), 0.035, 1.6, music.bus);
      });
      if (music.count % PHRASES.length === 0) {
        [[392, 1], [588, 0.4], [988, 0.15]].forEach(function (pr) {
          var o = a.createOscillator();
          var g = a.createGain();
          o.frequency.value = pr[0];
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.03 * pr[1], t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
          o.connect(g); g.connect(music.bus);
          o.start(t); o.stop(t + 3.1);
        });
      }
      music.count++;
      return dur;
    }

    api.musicOn = true;
    api.startMusic = function () {
      if (!api.musicOn || music.timer) return;
      var a = ctx();
      if (!a) return;
      music.bus = a.createGain();
      music.bus.gain.value = 0.9;
      music.bus.connect(master);
      music.next = a.currentTime + 0.4;
      var tick = function () {
        while (music.next < a.currentTime + 1.5) music.next += schedulePhrase(a, music.next);
      };
      tick();
      music.timer = setInterval(tick, 400);
    };
    api.stopMusic = function () {
      if (music.timer) clearInterval(music.timer);
      music.timer = null;
      // Notes already scheduled fade out with their bus.
      if (music.bus && ac) {
        music.bus.gain.setTargetAtTime(0, ac.currentTime, 0.25);
        music.bus = null;
      }
    };
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

  function createTable(canvas, liveRegion, settings, callbacks) {
    var ctx = canvas.getContext('2d');
    var prefs = readJson(PREFS_KEY, { sound: true });
    var sound = createSound(prefs.sound !== false);
    sound.musicOn = prefs.music !== false;
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
    // Face-up tiles drawn this frame (screen boxes) and the mouse position,
    // for the tile-name tooltip.
    var tileSpots = [], tipsOn = true, mouse = null, tipTile = null;

    var ui = {
      hints: !!settings.hints,
      turnSeat: null,
      selected: -1,
      turnPrompt: null,
      claimPrompt: null,
      hint: null,
      notice: null,
      hide: { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], drawn: false },
      thinking: null, // seat whose bot is deciding
      botLift: null, // { seat, index } tile a bot is considering
      botDrawn: [false, false, false, false], // bot's fresh draw sits apart
      botDiscardFrom: [null, null, null, null],
      oppHand: [null, null, null, null],
      overlay: null,
      lastHandRects: [],
      meldAnchor: [null, null, null, null],
      backAnchor: [null, null, null, null],
      flowerAnchor: [null, null, null, null],
      stats: { hands: 0, wins: 0, best: null, dealIns: 0 },
    };

    function announce(text) {
      if (liveRegion) liveRegion.textContent = text;
    }

    // Animations: 'normal' (shown) or 'off' (skip animations and delays).
    function instantMode() { return settings.speed === 'off'; }
    function speed(ms) { return reduceMotion ? 0 : ms; }

    /* ---------------- frame loop ---------------- */

    function requestRender() {
      if (frameRequested || destroyed) return;
      frameRequested = true;
      root.requestAnimationFrame(frame);
    }

    function frame() {
      frameRequested = false;
      if (destroyed) return;
      var t = now();
      anims = anims.filter(function (a) {
        var p = a.dur ? clamp((t - a.start) / a.dur, 0, 1) : 1;
        a.step(a.ease ? a.ease(p) : p, p);
        if (p >= 1) { a.done(); return false; }
        return true;
      });
      particles = particles.filter(function (p) { return t - p.born < p.life; });
      banners = banners.filter(function (b) { return t - b.start < b.dur; });
      render(t);
      if (anims.length || particles.length || banners.length) requestRender();
    }

    function animate(dur, step, ease) {
      if (instantMode()) {
        step(1, 1);
        requestRender();
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        if (destroyed) return;
        var a = { start: now(), dur: speed(dur), step: step, ease: ease, done: resolve };
        anims.push(a);
        requestRender();
        // Finish even if animation frames stop (e.g. a hidden tab).
        setTimeout(function () {
          var at = anims.indexOf(a);
          if (at === -1 || destroyed) return;
          anims.splice(at, 1);
          a.step(1, 1);
          a.done();
          requestRender();
        }, a.dur + 250);
      });
    }

    function sleep(ms) {
      if (instantMode()) return destroyed ? new Promise(function () {}) : Promise.resolve();
      return new Promise(function (resolve) {
        if (destroyed) return;
        setTimeout(function () { if (!destroyed) resolve(); }, reduceMotion ? Math.min(ms, 120) : speed(ms));
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

    function fitPondTile(zw, zh, n) {
      var best = 8;
      for (var pw = 40; pw >= 8; pw -= 0.5) {
        var cols = Math.floor(zw / (pw + 1));
        if (cols < 1) continue;
        var rows = Math.ceil(n / cols);
        if (rows * (pw * TILE_ASPECT + 2) <= zh) { best = pw; break; }
      }
      return best;
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

    function computeLayout() {
      var pad = W < 600 ? 6 : 14;
      var topH = 42 + 6; // top bar plus a little breathing room below it
      var portrait = W < 700 || W < H * 0.9;
      var tw = clamp(Math.min((W - 2 * pad) / 14.8, H * 0.085), 20, 60);
      var th = tw * TILE_ASPECT;
      var handY = H - pad - th - Math.max(2, tw * 0.08) - 4;
      var mw = tw; // melds and flowers match the hand
      var meldRowH = mw * TILE_ASPECT + 8;
      var meY = handY - meldRowH - 6;
      var actionsH = 44;
      // The coach's bar keeps its space even when the coach is off, so
      // toggling it never moves the table. It fits the action line plus a
      // four-line paragraph.
      var hintH = 84;
      // Action buttons sit in the meld row, between your melds and your
      // name, so the table gets the room.
      var actionsInRow = true;
      var actionsY = meY + (meldRowH - actionsH) / 2;
      var hintY = meY - hintH - 4;
      var bandTop = hintY;
      var gap = 6;

      var sideW = portrait ? clamp(W * 0.18, 62, 98) : clamp(W * 0.18, 130, 224);
      var topPanelH = portrait ? clamp(H * 0.13, 80, 116) : clamp(H * 0.19, 104, 150);
      var sideHead = portrait ? 36 : 26;
      var topHead = 24;
      var opp = [];
      opp[3] = { x: pad, y: topH, w: sideW, h: bandTop - topH - gap };
      opp[1] = { x: W - pad - sideW, y: topH, w: sideW, h: bandTop - topH - gap };
      var mid = pad + sideW + gap;
      opp[2] = { x: mid, y: topH, w: W - 2 * mid, h: topPanelH };
      [1, 3].forEach(function (k) {
        var r = opp[k];
        r.head = { x: r.x, y: r.y, w: r.w, h: sideHead };
        r.tiles = { x: r.x + 3, y: r.y + sideHead, w: r.w - 6, h: r.h - sideHead - 3 };
      });
      opp[2].head = { x: opp[2].x, y: opp[2].y + opp[2].h - topHead, w: opp[2].w, h: topHead };
      opp[2].tiles = { x: opp[2].x + 3, y: opp[2].y + 3, w: opp[2].w - 6, h: opp[2].h - topHead - 3 };
      var oppFrames = [];
      [1, 2, 3].forEach(function (k) { oppFrames[k] = makeFrame(opp[k].tiles, k); });

      var pond = { x: mid, y: topH + topPanelH + gap, w: W - 2 * mid, h: Math.max(60, bandTop - (topH + topPanelH + 2 * gap)) };

      // Optional walls: a square of 18 two-tile stacks per side just inside
      // the pond, in front of each player, with the discards inside it.
      var wall = null;
      var inner = pond;
      if (settings.walls) {
        var ww = clamp(Math.min(pond.w, pond.h) / 21.6, 6, 18);
        var depth = ww * (TILE_ASPECT + 0.38) + 3;
        wall = { ww: ww, depth: depth, frames: [] };
        wall.frames[0] = makeFrame({ x: pond.x, y: pond.y + pond.h - depth, w: pond.w, h: depth }, 0);
        wall.frames[1] = makeFrame({ x: pond.x + pond.w - depth, y: pond.y, w: depth, h: pond.h }, 1);
        wall.frames[2] = makeFrame({ x: pond.x, y: pond.y, w: pond.w, h: depth }, 2);
        wall.frames[3] = makeFrame({ x: pond.x, y: pond.y, w: depth, h: pond.h }, 3);
        // Same tile size on every side; stacks sit flush, centered on each side.
        var tws = ww;
        wall.frames.forEach(function (f) { tws = Math.min(tws, (f.w - 2 * depth) / 18 - 0.3); });
        wall.frames.forEach(function (f) {
          f.tw = tws;
          f.x0 = (f.w - 18 * (tws + 0.3)) / 2;
        });
        inner = { x: pond.x + depth + 4, y: pond.y + depth + 4, w: pond.w - 2 * depth - 8, h: pond.h - 2 * depth - 8 };
      }

      // Discard zones form a cross around the center info box.
      var zones = [];
      var sideFrac = 0.26, midFrac = 0.3;
      zones[2] = { x: inner.x + inner.w * sideFrac, y: inner.y + 2, w: inner.w * (1 - 2 * sideFrac), h: inner.h * midFrac - 2 };
      zones[0] = { x: inner.x + inner.w * sideFrac, y: inner.y + inner.h * (1 - midFrac), w: inner.w * (1 - 2 * sideFrac), h: inner.h * midFrac - 2 };
      zones[3] = { x: inner.x + 2, y: inner.y + 2, w: inner.w * sideFrac - 6, h: inner.h - 4 };
      zones[1] = { x: inner.x + inner.w * (1 - sideFrac) + 4, y: inner.y + 2, w: inner.w * sideFrac - 6, h: inner.h - 4 };
      var center = {
        x: inner.x + inner.w * sideFrac + 4, y: inner.y + inner.h * midFrac + 2,
        w: inner.w * (1 - 2 * sideFrac) - 8, h: inner.h * (1 - 2 * midFrac) - 4,
      };
      // A little smaller than the gap between the discard areas, kept centered.
      var shrink = 0.85;
      center.x += center.w * (1 - shrink) / 2;
      center.y += center.h * (1 - shrink) / 2;
      center.w *= shrink;
      center.h *= shrink;
      var zoneFrames = zones.map(function (z, k) { return makeFrame(z, k); });
      var maxDiscards = 20;
      if (game && game.hand) {
        game.hand.seats.forEach(function (st) { maxDiscards = Math.max(maxDiscards, st.discards.length + 2); });
      }
      var pw = tw * 0.8;
      zoneFrames.forEach(function (f) { pw = Math.min(pw, fitPondTile(f.w, f.h, maxDiscards)); });
      return {
        pad: pad, topH: topH, portrait: portrait,
        tw: tw, th: th, handY: handY, mw: mw, meY: meY, meldRowH: meldRowH,
        actionsY: actionsY, actionsH: actionsH, actionsInRow: actionsInRow, hintY: hintY, hintH: hintH,
        opp: opp, oppFrames: oppFrames, pond: pond, inner: inner, wall: wall, zones: zones, zoneFrames: zoneFrames,
        center: center, pw: pw, maxDiscards: maxDiscards,
      };
    }

    // Discards fill rows starting next to the center, moving toward the owner.
    function pondSlotLocal(seat, idx) {
      var f = L.zoneFrames[seat];
      var pw = L.pw;
      var ph = pw * TILE_ASPECT + 2;
      var cols = Math.max(1, Math.floor(f.w / (pw + 1)));
      var gridW = cols * (pw + 1);
      return { x: (f.w - gridW) / 2 + (idx % cols) * (pw + 1), y: 2 + Math.floor(idx / cols) * ph, w: pw };
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
      if (id && !opts.back && tipsOn) recordSpot(id, x, y, w, h);
      ctx.drawImage(sp, x, y, w, h);
      if (opts.glow) {
        ctx.strokeStyle = opts.glow;
        ctx.lineWidth = Math.max(2, w * 0.07);
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

    function addRegion(x, y, w, h, onTap, id) {
      regions.push({ x: x, y: y, w: w, h: h, onTap: onTap, id: id });
    }

    function button(label, x, y, w, h, onTap, style, id) {
      style = style || 'light';
      var isHover = hover === id;
      var fills = {
        primary: isHover ? '#d62a47' : COLORS.red,
        gold: isHover ? '#ffb43c' : COLORS.gold,
        light: isHover ? '#ffffff' : 'rgba(255, 248, 240, 0.94)',
        ghost: isHover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
      };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = style === 'ghost' ? 0 : 8;
      ctx.shadowOffsetY = 2;
      pill(x, y, w, h, fills[style], style === 'ghost' ? 'rgba(255,255,255,0.3)' : null);
      ctx.restore();
      var color = style === 'light' ? COLORS.ink : COLORS.white;
      if (style === 'gold') color = COLORS.ink;
      var size = fitFont(ctx, label, w - 16, Math.min(16, h * 0.42), FONT_BODY, 'bold');
      text(label, x + w / 2, y + h / 2 + 1, { size: size, weight: 'bold', color: color, align: 'center' });
      addRegion(x, y, w, h, onTap, id);
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
      tipTile = sp ? sp.id : null;
      if (!sp) return;
      var label = E.tileName(sp.id);
      // How many more could still show up: in the wall or someone's hidden hand.
      var sub = '';
      if (!E.isBonus(sp.id) && game && game.hand) {
        var n = E.unseenCounts(game, 0)[E.tileIndex(sp.id)];
        sub = n + ' left';
      }
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFelt();
      if (!game || !game.hand) {
        drawTopBar();
        return;
      }
      drawTopBar();
      drawPond(t);
      drawWall();
      [1, 2, 3].forEach(function (s) { drawOpponent(s, t); });
      drawMe(t);
      drawHintBand();
      drawActions();
      tipsOn = false; // tiles in flight, banners and effects get no tooltip
      drawFlights();
      drawBanners(t);
      drawParticles(t);
      tipsOn = true;
      if (ui.overlay) {
        tileSpots = []; // only the overlay's own tiles are under the mouse
        drawOverlay(t);
      }
      drawTileTip();
    }

    function drawFelt() {
      var g = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, Math.max(W, H) * 0.75);
      g.addColorStop(0, COLORS.feltLight);
      g.addColorStop(1, COLORS.feltDark);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function drawTopBar() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, W, 42);
      var pad = L ? L.pad : 8;
      button('Menu', pad, 7, 64, 28, openMenu, 'ghost', 'menu');
      var right = W - pad;
      var soundLabel = sound.enabled ? 'Sound on' : 'Sound off';
      var sw = W < 420 ? 76 : 92;
      button(soundLabel, right - sw, 7, sw, 28, toggleSound, 'ghost', 'sound');
      var hw = W < 420 ? 72 : 88;
      button(ui.hints ? 'Coach on' : 'Coach off', right - sw - hw - 6, 7, hw, 28, toggleHints, ui.hints ? 'gold' : 'ghost', 'hints');
      if (game) {
        var label = E.WIND_NAMES[game.round] + ' round · Hand ' + game.handNumber;
        var maxW = right - sw - hw - 12 - (pad + 72);
        var size = fitFont(ctx, label, maxW, 15, FONT_HEAD);
        text(label, pad + 72 + maxW / 2, 22, { size: size, family: FONT_HEAD, align: 'center', color: COLORS.cream });
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

    function seatTitle(seat) {
      var p = game.players[seat];
      return p.name;
    }

    function drawSeatHeader(seat, x, y, w) {
      var r = 11;
      windBadge(seat, x + r, y + r, r);
      var name = seatTitle(seat);
      var pts = settings.mode === 'payout' ? fmt(game.players[seat].points) : '';
      ctx.font = 'bold 13px ' + FONT_BODY;
      var ptsW = pts ? ctx.measureText(pts).width + 6 : 0;
      var nameSize = fitFont(ctx, name, w - 2 * r - 8 - ptsW, 14, FONT_BODY, 'bold');
      text(name, x + 2 * r + 6, y + r + 1, { size: nameSize, weight: 'bold', color: COLORS.cream });
      if (pts) text(pts, x + w, y + r + 1, { size: 13, weight: 'bold', color: COLORS.goldLight, align: 'right' });
    }

    function meldTiles(m) {
      return m.tiles.map(function (id, i) {
        var back = m.concealed && (i === 0 || i === 3);
        return { id: id, back: back };
      });
    }

    // Lays tiles left-to-right, wrapping inside `w`; returns the next y.
    function flowRow(items, x, y, w, tw, gapEvery) {
      var cx = x, cy = y;
      var th = tw * TILE_ASPECT + 3;
      items.forEach(function (it) {
        if (it.gap) { cx += tw * 0.35; return; }
        if (cx + tw > x + w + 0.5) { cx = x; cy += th; }
        drawTile(it.id, cx, cy, tw, { back: it.back, shadow: false, glow: it.glow });
        cx += tw + (gapEvery ? 0.5 : 0);
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
        meldTiles(m).forEach(function (x) { items.push(x); });
      });
      return items;
    }

    function drawOppHeader(seat, r) {
      var compact = r.w < 120;
      var pts = settings.mode === 'payout' ? fmt(game.players[seat].points) : '';
      if (!compact) {
        drawSeatHeader(seat, r.x + 8, r.y + (r.h - 22) / 2, r.w - 16);
        return;
      }
      var rad = 8;
      windBadge(seat, r.x + 4 + rad, r.y + 4 + rad, rad);
      var name = seatTitle(seat);
      var size = fitFont(ctx, name, r.w - 2 * rad - 12, 12, FONT_BODY, 'bold');
      text(name, r.x + 2 * rad + 8, r.y + 4 + rad + 1, { size: size, weight: 'bold', color: COLORS.cream });
      if (pts) text(pts, r.x + r.w / 2, r.y + r.h - 7, { size: 11, weight: 'bold', align: 'center', color: COLORS.goldLight });
    }

    function oppConcealedCount(seat) {
      var n = game.hand.seats[seat].hand.length;
      return Math.max(0, n - ui.hide.backs[seat]);
    }

    function drawOpponent(seat, t) {
      var r = L.opp[seat];
      var s = game.hand.seats[seat];
      var active = ui.turnSeat === seat;
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = active ? 'rgba(244,160,32,0.16)' : 'rgba(0,0,0,0.16)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = 'rgba(244,160,32,' + (0.65 + 0.3 * Math.sin(t / 220)) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
        requestRender();
      }
      ctx.restore();
      drawOppHeader(seat, r.head);

      // Drawn in the seat's rotated frame, facing its owner: the concealed
      // hand along their edge (a fresh draw sits a little apart, and the tile
      // they are considering lifts), melds and flowers in front of it.
      var f = L.oppFrames[seat];
      // One tile size for the hand and the meld row, so both rows must fit.
      var bw = clamp(Math.min(f.w / 14.7, (f.h - 8) / (2 * (TILE_ASPECT + 0.08))), 8, 38);
      var count = oppConcealedCount(seat);
      var apart = ui.botDrawn[seat] && count > 0;
      // Center the hand along the area by the tiles actually held (a fresh
      // draw hangs off the end so the hand doesn't jump every turn). The
      // player across centers the hand and meld row in their area; side
      // players keep the hand near their back edge, melds in front.
      var depth = bw * (TILE_ASPECT + 0.08);
      var block = 2 * depth + 5;
      var edge = seat === 2 ? Math.max(1, (f.h - block) / 2) : Math.min(6, Math.max(1, (f.h - block) / 2));
      var backsY = f.h - edge - depth;
      var held = apart ? count - 1 : count;
      var bx0 = (f.w - held * bw) / 2;
      var lift = ui.botLift && ui.botLift.seat === seat ? ui.botLift.index : -1;
      var backX = function (i) { return bx0 + i * bw + (apart && i === count - 1 ? bw * 0.4 : 0); };

      var items = meldItems(seat);
      var meldTilesN = items.filter(function (it) { return !it.gap; }).length;
      var gaps = items.length - meldTilesN;
      var flowersN = s.flowers.length;
      var mw = Math.min(bw, f.w / Math.max(1, meldTilesN + gaps * 0.35 + flowersN + 0.6));
      var meldY = backsY - mw * (TILE_ASPECT + 0.08) - 5;

      enterFrame(f);
      for (var i = 0; i < count; i++) {
        drawTile(null, backX(i), backsY - (i === lift ? bw * 0.38 : 0), bw - 0.5, { back: true, shadow: false });
      }
      var mx = 0;
      items.forEach(function (it) {
        if (it.gap) { mx += mw * 0.35; return; }
        drawTile(it.id, mx, meldY, mw - 0.5, { back: it.back, shadow: false });
        mx += mw;
      });
      // Like a real table, melds then flowers run from the owner's left.
      var fw = mw;
      var fx = mx + (items.length ? mw * 0.35 : 0);
      s.flowers.forEach(function (id, k) {
        drawTile(id, fx + k * fw, meldY, fw - 0.5, { shadow: false });
      });
      ctx.restore();

      ui.oppHand[seat] = { f: f, backX: backX, backsY: backsY, bw: bw };
      ui.backAnchor[seat] = localPose(f, bx0 + count * bw + bw * 0.4, backsY, bw);
      ui.meldAnchor[seat] = localPose(f, mx + (items.length ? mw * 0.35 : 0), meldY, mw);
      ui.flowerAnchor[seat] = localPose(f, fx + flowersN * fw, meldY, fw);

      if (ui.thinking === seat) drawThinking(seat, t);
    }

    // "..." bubble while a bot decides, turned to face the bot like its tiles.
    function drawThinking(seat, t) {
      var pos = seatBannerPos(seat);
      var w = 46, h = 22;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(SEAT_ANGLE[seat]);
      pill(-w / 2, -h / 2, w, h, 'rgba(255,248,240,0.95)');
      for (var k = 0; k < 3; k++) {
        var a = 0.35 + 0.65 * Math.max(0, Math.sin(t / 160 - k * 0.9));
        ctx.beginPath();
        ctx.arc(-11 + k * 11, 0, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196,30,58,' + a + ')';
        ctx.fill();
      }
      ctx.restore();
      requestRender();
    }

    /* ---------------- the wall ---------------- */

    var WALL_SIDES = [0, 3, 2, 1]; // clockwise around the table, starting with yours

    // Where the dealer breaks the wall (stands in for the dice roll).
    function wallBreak() {
      return WALL_SIDES.indexOf(game.dealer) * 18 + 2 + (game.handNumber * 5) % 14;
    }

    function wallTaken() {
      var h = game.hand;
      return { front: 144 - h.wall.length - h.backDrawn, back: h.backDrawn };
    }

    // Placement of draw position `pos` (0 = first tile dealt). Even positions
    // are the top tile of a stack.
    function wallSlot(pos) {
      var j = Math.floor(pos / 2);
      var g = (j + wallBreak()) % 72;
      var side = WALL_SIDES[Math.floor(g / 18)];
      var p = g % 18;
      var f = L.wall.frames[side];
      var x = f.x0 + (17 - p) * (f.tw + 0.3);
      var y = f.h - f.tw * (TILE_ASPECT + 0.08) - 2 - (pos % 2 === 0 ? f.tw * 0.32 : 0);
      return { f: f, x: x, y: y, w: f.tw, p: p };
    }

    function wallPose(pos) {
      if (!L.wall) {
        var c = L.center;
        return { x: c.x + c.w / 2 - 10, y: c.y + c.h / 2 - 14, w: 20, rot: 0 };
      }
      var sl = wallSlot(pos);
      return localPose(sl.f, sl.x, sl.y, sl.w);
    }

    function drawWall() {
      if (!L.wall) return;
      var taken = wallTaken();
      [1, 0].forEach(function (layer) {
        for (var j = 0; j < 72; j++) {
          var pos = 2 * j + layer;
          if (pos < taken.front || pos >= 144 - taken.back) continue;
          var sl = wallSlot(pos);
          enterFrame(sl.f);
          drawTile(null, sl.x, sl.y, sl.w, { back: true, shadow: false });
          ctx.restore();
        }
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
        // Faint seat-wind watermark so each pile is easy to find. Turned back
        // upright so every wind reads the same way for the player.
        var ws = clamp(Math.min(f.w, f.h) * 0.5, 14, 54);
        ctx.save();
        ctx.translate(f.w / 2, f.h / 2);
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

      var c = L.center;
      ctx.save();
      roundRect(ctx, c.x, c.y, c.w, c.h, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fill();
      ctx.restore();
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      var big = clamp(c.h * 0.42, 14, 40);
      text(WIND_LETTERS[game.round], cx, cy - big * 0.32, { size: big, family: FONT_HEAD, align: 'center', color: COLORS.goldLight });
      var tk = wallTaken();
      var left = 144 - tk.front - tk.back;
      var leftLabel = left + ' tiles left';
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

    function myHandOrder() {
      var s = game.hand.seats[0];
      var drawn = game.hand.drawnTile;
      var showDrawn = ui.turnPrompt && drawn && game.hand.turn === 0 && game.hand.canSelfDraw && s.hand.indexOf(drawn) !== -1;
      var rest = s.hand.slice();
      if (showDrawn) rest.splice(rest.lastIndexOf(drawn), 1);
      var order = E.sortTiles(rest);
      if (showDrawn) order.push(drawn);
      return { tiles: order, drawnSeparate: !!showDrawn };
    }

    function drawMe(t) {
      var s = game.hand.seats[0];
      var pad = L.pad;
      var y = L.meY;
      var active = ui.turnSeat === 0;

      // Info + melds row.
      var infoW = clamp(W * 0.3, 130, 240);
      // Your name steps aside while action buttons need its spot.
      if (!ui.buttonsOverName) drawSeatHeader(0, W - pad - infoW, y + 2, infoW);
      var items = meldItems(0);
      var mx = pad;
      // Same size as the hand; only shrinks if the row would run out of room.
      var meldN = items.filter(function (it) { return !it.gap; }).length;
      var gapsN = items.length - meldN;
      var rowW = W - 2 * pad - infoW - 10;
      var mw = Math.min(L.mw, rowW / Math.max(1, meldN + gapsN * 0.35 + s.flowers.length + 0.6));
      var y0 = y + (L.mw - mw) * TILE_ASPECT;
      if (items.length) {
        var end = flowRow(items, mx, y0, rowW, mw);
        mx = end.x + mw * 0.35;
      }
      ui.meldAnchor[0] = { x: mx, y: y0, w: mw, rot: 0 };
      // Flowers sit after the melds, in the same row (away from your name).
      var fw = mw;
      var fx = mx + (items.length ? mw * 0.2 : 0);
      var fy = y0;
      s.flowers.forEach(function (f, k) { drawTile(f, fx + k * (fw + 1), fy, fw, { shadow: false }); });
      ui.flowerAnchor[0] = { x: fx + s.flowers.length * (fw + 1), y: fy, w: fw, rot: 0 };
      ui.meRowFree = { x0: ui.flowerAnchor[0].x + 10, x1: W - pad - infoW - 10 };

      // Hand.
      var order = myHandOrder();
      var tiles = order.tiles;
      var count = tiles.length;
      if (ui.hide.drawn && order.drawnSeparate) count = Math.min(count, tiles.length - 1);
      var tw = L.tw;
      var total = tiles.length * tw + (order.drawnSeparate ? tw * 0.4 : 0);
      var x0 = Math.max(pad, (W - total) / 2);
      var hintTile = ui.hints && ui.hint && ui.hint.tile;
      var hintUsed = false;
      ui.lastHandRects = [];
      if (active && !ui.overlay) {
        ctx.save();
        roundRect(ctx, x0 - 6, L.handY - 8, total + 12, L.th + 16, 12);
        ctx.fillStyle = 'rgba(244,160,32,0.14)';
        ctx.fill();
        ctx.restore();
      }
      for (var i = 0; i < count; i++) {
        var id = tiles[i];
        var x = x0 + i * tw + (order.drawnSeparate && i === tiles.length - 1 ? tw * 0.4 : 0);
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
        drawTile(id, x, L.handY - lift, tw - 1, { glow: glow || (claimable ? 'rgba(255,255,255,0.85)' : null) });
        var rect = { x: x, y: L.handY - lift, w: tw - 1, h: L.th, id: id, index: i };
        ui.lastHandRects.push(rect);
        if (ui.turnPrompt) {
          (function (idx) {
            addRegion(rect.x, rect.y, rect.w, rect.h + lift, function () { tapHandTile(idx); }, 'hand-' + idx);
          })(i);
        }
      }
    }

    function drawHintBand() {
      // With the coach off, the bar's space stays empty apart from notes.
      if (!ui.hints && !(ui.notice && !ui.overlay && (ui.turnPrompt || ui.claimPrompt))) return;
      var x = L.pad, w = W - 2 * L.pad;
      var lines = [];
      if (ui.notice) lines.push({ text: ui.notice, color: COLORS.goldLight });
      // The main action on its own line in bold gold; the rest as one paragraph.
      if (ui.hint && ui.hint.action) lines.push({ text: ui.hint.action, color: COLORS.goldLight, bold: true });
      if (ui.hint && ui.hint.tips && ui.hint.tips.length) lines.push({ text: ui.hint.tips.join(' '), color: COLORS.cream });
      if (!lines.length && ui.hints) lines.push({ text: 'The coach gives advice here on your turn and when you can claim a tile.', color: 'rgba(255,248,240,0.6)' });
      var iconS = Math.min(L.hintH - 14, 48);
      var tx = x + 8 + iconS + 8;
      var tw = w - (tx - x) - 10;
      var size = W < 600 ? 12 : 13;
      var out = [];
      lines.forEach(function (l) {
        ctx.font = (l.bold ? 'bold ' : '') + size + 'px ' + FONT_BODY;
        // The coach marks its "Target: ..." phrase; it's drawn in a light brand red.
        var plain = '', red = [], from = -1;
        for (var ci = 0; ci < l.text.length; ci++) {
          var ch = l.text.charAt(ci);
          if (ch === '\u0001') from = plain.length;
          else if (ch === '\u0002') { if (from >= 0) red.push([from, plain.length]); from = -1; }
          else plain += ch;
        }
        var cursor = 0;
        wrapText(ctx, plain, tw).forEach(function (ln) {
          var at = plain.indexOf(ln, cursor);
          cursor = at + ln.length;
          var segs = [], pos = at;
          red.forEach(function (r) {
            var a = Math.max(r[0], at), b = Math.min(r[1], at + ln.length);
            if (b <= a) return;
            if (a > pos) segs.push({ text: plain.slice(pos, a), color: l.color });
            segs.push({ text: plain.slice(a, b), color: COLORS.redLight });
            pos = b;
          });
          if (pos < at + ln.length) segs.push({ text: plain.slice(pos, at + ln.length), color: l.color });
          out.push({ segs: segs, bold: l.bold });
        });
      });
      var lh = size + 3;
      // Show every line: a long tip grows the band upward over the table.
      var h = Math.max(L.hintH, out.length * lh + 12);
      var y = L.hintY + L.hintH - h;
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = h > L.hintH ? 'rgba(4,46,28,0.94)' : 'rgba(0,0,0,0.32)';
      ctx.fill();
      ctx.restore();
      if (images.logo) {
        var iw = iconS * (images.logo.width / images.logo.height);
        ctx.drawImage(images.logo, x + 8, y + 7, Math.min(iw, 48), Math.min(iconS, 48 / (iw / iconS)));
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
        if (o.win) acts.push({ label: 'Win · ' + o.win.faan + ' faan', style: 'gold', fn: function () { resolveTurn({ type: 'win' }); } });
        o.kongs.forEach(function (k) {
          acts.push({ label: 'Kong ' + shortName(k.tile), style: 'primary', fn: function () { resolveTurn({ type: 'kong', tile: k.tile }); } });
        });
        if (ui.selected >= 0) {
          acts.push({ label: 'Discard', style: 'light', fn: function () { discardSelected(); } });
        }
      } else if (ui.claimPrompt) {
        var c = ui.claimPrompt.opts;
        if (c.win) acts.push({ label: 'Win · ' + c.win.faan + ' faan', style: 'gold', fn: function () { resolveClaim({ type: 'win' }); } });
        if (c.kong) acts.push({ label: 'Kong', style: 'primary', fn: function () { resolveClaim({ type: 'kong' }); } });
        if (c.pung) acts.push({ label: 'Pung', style: 'primary', fn: function () { resolveClaim({ type: 'pung' }); } });
        c.chows.forEach(function (pair) {
          var seq = E.sortTiles(pair.concat([c.tile])).map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
          acts.push({ label: 'Chow ' + seq, style: 'primary', fn: function () { resolveClaim({ type: 'chow', tiles: pair }); } });
        });
        acts.push({ label: 'Pass', style: 'light', fn: function () { resolveClaim({ type: 'pass' }); } });
      }
      if (!acts.length) { setButtonsOverName(false); return; }
      var h = 38;
      var gap = 8;
      // When claiming, show the tile that is up for grabs beside the buttons.
      var claimTile = ui.claimPrompt ? ui.claimPrompt.opts.tile : null;
      var ctw = claimTile ? Math.min(30, (L.actionsH - 4) / TILE_ASPECT) : 0;
      var lead = claimTile ? ctw + 10 : 0;
      var x0 = L.pad, x1 = W - L.pad, rowY = L.actionsY;
      var free = ui.meRowFree;
      var cover = null;
      if (L.actionsInRow && free) {
        if (free.x1 - free.x0 - lead >= acts.length * (60 + gap)) { x0 = free.x0; x1 = free.x1; }
        else if (W - L.pad - free.x0 - lead >= acts.length * (60 + gap)) {
          // Not enough room beside your name: use the rest of the row and
          // cover the name while the buttons are up.
          x0 = free.x0; x1 = W - L.pad;
          cover = { x: free.x1, w: W - free.x1 };
        } else {
          // Still too many (lots of melds and chow choices): float them over the coach's bar.
          rowY = L.hintY + (L.hintH - L.actionsH) / 2;
        }
      }
      setButtonsOverName(!!cover);
      var maxW = x1 - x0 - lead;
      var bw = clamp((maxW - gap * (acts.length - 1)) / acts.length, 60, 150);
      var total = acts.length * bw + (acts.length - 1) * gap;
      var x = x0 + (x1 - x0 - total - lead) / 2 + lead;
      var y = rowY + (L.actionsH - h) / 2;
      if (claimTile) {
        drawTile(claimTile, x - lead, rowY + (L.actionsH - ctw * TILE_ASPECT) / 2, ctw, { glow: COLORS.gold });
      }
      var hintDecision = ui.hints && ui.hint && ui.hint.decision;
      acts.forEach(function (a, i) {
        var id = 'act-' + i;
        var recommended = hintDecision && labelMatches(a.label, hintDecision);
        if (recommended) {
          ctx.save();
          pill(x + i * (bw + gap) - 3, y - 3, bw + 6, h + 6, 'rgba(255,210,122,0.55)');
          ctx.restore();
        }
        button(a.label, x + i * (bw + gap), y, bw, h, a.fn, a.style, id);
      });
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
          drawTile(f.id, f.x, f.y, f.w, { back: f.back, rot: f.rot || 0 });
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
        text(b.text, 0, 2, { size: size, family: FONT_HEAD, align: 'center', color: b.textColor || COLORS.white });
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
        meldTiles(m).forEach(function (it) { all.push(it); });
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
        var tw = isWin ? clamp((w - 24) / Math.max(units, 1), 14, c.tw) : 0;
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
        sub = 'The wall ran out with no winner. The dealer keeps the deal.';
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
        var hx = cx - units * tw / 2;
        var ty = y + 10;
        hand.forEach(function (it) {
          if (it.gap) { hx += tw * 0.3; return; }
          drawTile(it.id, hx, ty, tw - 1, { back: it.back, shadow: false, glow: it.glow });
          if (it.win) {
            ctx.beginPath();
            ctx.moveTo(hx + tw / 2 - 5, ty + th + 11);
            ctx.lineTo(hx + tw / 2 + 5, ty + th + 11);
            ctx.lineTo(hx + tw / 2, ty + th + 5);
            ctx.closePath();
            ctx.fillStyle = COLORS.gold;
            ctx.fill();
          }
          hx += tw;
        });
        y += stripH;

        if (flowers.length) {
          // Flowers and seasons get their own labelled row; the seat's own ones glow.
          var fw = lay.fw, fh = fw * TILE_ASPECT;
          y += 14;
          var fy = y;
          sectionLabel('Flowers & seasons', x, fy + fh / 2);
          ctx.font = 'bold 11px ' + FONT_BODY;
          var fx = Math.min(x + ctx.measureText('FLOWERS & SEASONS').width + 16, x + w - flowers.length * (fw + 6) + 6);
          flowers.forEach(function (f) {
            var own = f === 'f' + res.seatWind || f === 's' + res.seatWind;
            drawTile(f, fx, fy, fw, { shadow: false, glow: own ? COLORS.gold : null });
            fx += fw + 6;
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
      var label = game.over ? 'See results' : 'Next hand';
      var firstRegion = regions.length;
      button(label, cx - 80, r.y + r.h - 62, 160, 42, function () { closeOverlay(); }, 'primary', 'next');
      ctx.restore();
      regions.slice(firstRegion).forEach(function (g) {
        g.x = W / 2 + (g.x - W / 2) * k;
        g.y = H / 2 + (g.y - H / 2) * k;
        g.w *= k;
        g.h *= k;
      });
    }

    var SPEED_LABELS = { normal: 'Show', off: 'Skip' };
    var SPEED_ORDER = ['normal', 'off'];

    function drawMenu() {
      var r = panelRect(340, 382);
      drawPanelBg(r);
      text('Paused', r.x + r.w / 2, r.y + 36, { size: 24, family: FONT_HEAD, align: 'center', color: COLORS.red });
      var bx = r.x + 30, bw = r.w - 60, y = r.y + 62, step = 50;
      button('Resume', bx, y, bw, 40, function () { closeOverlay(); }, 'primary', 'm-resume'); y += step;
      button('Animations: ' + SPEED_LABELS[settings.speed || 'normal'], bx, y, bw, 40, cycleSpeed, 'light', 'm-speed'); y += step;
      button(settings.walls ? 'Hide the walls' : 'Show the walls', bx, y, bw, 40, toggleWalls, 'light', 'm-walls'); y += step;
      button(sound.musicOn ? 'Music: On' : 'Music: Off', bx, y, bw, 40, toggleMusic, 'light', 'm-music'); y += step;
      button('Quit game', bx, y, bw, 40, function () { quit(); }, 'light', 'm-quit');
      var modeLine = (settings.mode === 'practice' ? 'Practice mode' : 'Payout mode') + ' · ' + (settings.spicy === 'half' ? 'Half spicy' : 'Full spicy');
      text(modeLine, r.x + r.w / 2, r.y + r.h - 18, { size: 12, align: 'center', color: COLORS.muted });
    }

    function saveSetting(key, value) {
      settings[key] = value;
      var saved = readJson(SETTINGS_KEY, {});
      saved[key] = value;
      writeJson(SETTINGS_KEY, saved);
    }

    function cycleSpeed() {
      var next = SPEED_ORDER[(SPEED_ORDER.indexOf(settings.speed || 'normal') + 1) % SPEED_ORDER.length];
      saveSetting('speed', next);
      requestRender();
      track('play_set_speed', { speed: next });
    }

    function toggleWalls() {
      saveSetting('walls', !settings.walls);
      L = computeLayout();
      requestRender();
      track('play_toggle_walls', { walls: settings.walls ? 'on' : 'off' });
    }

    function drawGameOver() {
      var r = panelRect(440, 330);
      drawPanelBg(r);
      var st = ui.stats;
      text('Game over', r.x + r.w / 2, r.y + 40, { size: 28, family: FONT_HEAD, align: 'center', color: COLORS.red });
      text('You ran out of points.', r.x + r.w / 2, r.y + 72, { size: 15, align: 'center', color: COLORS.ink });
      var lines = [
        ['Hands played', String(st.hands)],
        ['Hands you won', String(st.wins)],
        ['Times you dealt in', String(st.dealIns)],
        ['Your biggest hand', st.best ? st.best + ' faan' : '—'],
      ];
      var y = r.y + 108;
      lines.forEach(function (l) {
        text(l[0], r.x + 40, y, { size: 15, color: COLORS.muted });
        text(l[1], r.x + r.w - 40, y, { size: 15, weight: 'bold', align: 'right', color: COLORS.ink });
        y += 28;
      });
      var bw = (r.w - 70) / 2;
      button('Play again', r.x + 25, r.y + r.h - 62, bw, 42, function () { callbacks.restart(); }, 'primary', 'go-again');
      button('Settings', r.x + 45 + bw, r.y + r.h - 62, bw, 42, function () { quit(); }, 'light', 'go-settings');
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
      ui.overlay = o && o.previous ? o.previous : null;
      requestRender();
      if (o && o.type !== 'menu' && overlayResolve) {
        var r = overlayResolve;
        overlayResolve = null;
        r();
      }
    }

    function openMenu() {
      if (ui.overlay && ui.overlay.type === 'menu') { closeOverlay(); return; }
      ui.overlay = { type: 'menu', previous: ui.overlay };
      requestRender();
    }

    function toggleHints() {
      ui.hints = !ui.hints;
      saveSetting('hints', ui.hints);
      refreshHint();
      requestRender();
      track('play_toggle_hints', { hints: ui.hints ? 'on' : 'off' });
    }

    function savePrefs() {
      writeJson(PREFS_KEY, { sound: sound.enabled, music: sound.musicOn });
    }

    function toggleSound() {
      sound.enabled = !sound.enabled;
      savePrefs();
      if (sound.enabled) { sound.play('select'); sound.startMusic(); } else sound.stopMusic();
      requestRender();
    }

    function toggleMusic() {
      sound.musicOn = !sound.musicOn;
      savePrefs();
      if (sound.musicOn) sound.startMusic(); else sound.stopMusic();
      requestRender();
      track('play_toggle_music', { music: sound.musicOn ? 'on' : 'off' });
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
      if (picked && ui.hints && ui.hint && ui.hint.candidates) {
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
      var again = ' Tap it again to throw it anyway.';
      if (cand.loss > top.loss + 0.05 && cand.loss > 0.08) return 'Careful: an opponent close to winning may want ' + E.tileName(cand.tile) + '.' + again;
      if (cand.shanten > top.shanten) return E.tileName(cand.tile) + ' takes you further from winning.' + again;
      return E.tileName(cand.tile) + ' is OK, but ' + E.tileName(top.tile) + ' is better.' + again;
    }

    function discardSelected() {
      if (!ui.turnPrompt || ui.selected < 0) return;
      var tile = myHandOrder().tiles[ui.selected];
      if (!tile) return;
      var rect = ui.lastHandRects[ui.selected];
      ui.discardFrom = rect ? { x: rect.x, y: rect.y, w: rect.w, rot: 0 } : null;
      resolveTurn({ type: 'discard', tile: tile });
    }

    function resolveTurn(action) {
      var p = ui.turnPrompt;
      if (!p) return;
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
      ui.claimPrompt = null;
      ui.hint = null;
      ui.notice = null;
      requestRender();
      p.resolve(decision);
    }

    function refreshHint() {
      if (!ui.hints || !game || !game.hand) { ui.hint = null; return; }
      if (ui.turnPrompt) ui.hint = Coach.turnHint(game, 0, ui.turnPrompt.opts);
      else if (ui.claimPrompt) ui.hint = Coach.claimHint(game, 0, ui.claimPrompt.opts);
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

    function onPointerDown(e) {
      sound.startMusic(); // no-op once playing; covers browsers that block audio until a tap
      var p = pointerPos(e);
      var r = hitTest(p.x, p.y);
      if (!r) {
        if (ui.selected >= 0 && !ui.overlay) { ui.selected = -1; ui.notice = null; requestRender(); }
        return;
      }
      e.preventDefault();
      r.onTap();
    }

    function onPointerMove(e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var p = pointerPos(e);
      var r = hitTest(p.x, p.y);
      var id = r ? r.id : null;
      canvas.style.cursor = r ? 'pointer' : 'default';
      mouse = p;
      var sp = spotAt(p);
      if (id !== hover || (sp ? sp.id : null) !== tipTile) { hover = id; requestRender(); }
    }

    function onPointerLeave() {
      mouse = null;
      if (tipTile || hover) { hover = null; requestRender(); }
    }

    function onKey(e) {
      if (destroyed) return;
      if (e.key === 'Escape') { openMenu(); e.preventDefault(); return; }
      if (ui.overlay) {
        if (e.key === 'Enter' && ui.overlay.type === 'summary') { closeOverlay(); e.preventDefault(); }
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

    function seatAnchor(seat) {
      if (seat === 0) {
        return { x: W / 2 - L.tw / 2, y: L.handY, w: L.tw, rot: 0 };
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
      var f = { id: id, back: !!opts.back, flip: !!opts.flip, p: 0, x: from.x, y: from.y, w: from.w, rot: r0 };
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
    function shrinkBanner(textStr, size, maxW) {
      if (!maxW) return size;
      for (; size > 10; size--) {
        ctx.font = size + 'px ' + FONT_HEAD;
        if (ctx.measureText(textStr).width + size * 1.2 <= maxW) break;
      }
      return size;
    }

    function banner(textStr, x, y, opts) {
      opts = opts || {};
      banners.push({
        text: textStr, sub: opts.sub, x: x, y: y, start: now(), dur: opts.dur || 1100,
        color: opts.color, textColor: opts.textColor, size: shrinkBanner(textStr, opts.size || 30, opts.maxW), rot: opts.rot || 0,
      });
      requestRender();
    }

    // Where a declaration banner goes. Opponents' banners face them and sit
    // on their tiles, except the player across: theirs is upright for you and
    // sits in the empty stretch of their name row, clear of their tiles.
    function declarationPos(seat) {
      if (seat !== 2) return seatBannerPos(seat);
      var r = L.opp[2];
      var rad = 11;
      ctx.font = 'bold 14px ' + FONT_BODY;
      var left = r.x + 8 + 2 * rad + 6 + ctx.measureText(seatTitle(2)).width + 10;
      var pts = settings.mode === 'payout' ? fmt(game.players[2].points) : '';
      ctx.font = 'bold 13px ' + FONT_BODY;
      var right = r.x + r.w - 8 - (pts ? ctx.measureText(pts).width : 0) - 10;
      return { x: (left + right) / 2, y: r.y + r.h - r.head.h / 2, rot: 0, maxW: Math.max(40, right - left) };
    }

    function seatBannerPos(seat) {
      if (seat === 0) return { x: W / 2, y: L.actionsY + L.actionsH / 2, rot: 0 };
      // Opponents' banners sit in the middle of their tiles and face them.
      var f = L.oppFrames[seat];
      var mid = toScreen(f, f.w / 2, f.h / 2);
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
        ui.hide = { pond: [0, 0, 0, 0], meld: [0, 0, 0, 0], backs: [0, 0, 0, 0], drawn: false };
        ui.botDrawn = [false, false, false, false];
        ui.botLift = null;
        ui.thinking = null;
        ui.turnSeat = null;
        ui.selected = -1;
        ui.notice = null;
        ui.hint = null;
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
        var h = game.hand;
        var pos = d.replacement ? 144 - h.backDrawn : 144 - h.wall.length - h.backDrawn - 1;
        var from = wallPose(pos);
        if (d.seat === 0) {
          ui.hide.drawn = true;
          var order = myHandOrder();
          var total = order.tiles.length * L.tw + L.tw * 0.4;
          var x0 = Math.max(L.pad, (W - total) / 2);
          var to = { x: x0 + (order.tiles.length - 1) * L.tw + L.tw * 0.4, y: L.handY, w: L.tw - 1, rot: 0 };
          return fly(d.tile, from, to, 300, { arc: 20 }).then(function () { ui.hide.drawn = false; requestRender(); });
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
        banner(d.seat === 0 ? 'Flower!' : 'Flower', pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, size: 18, color: COLORS.green, dur: 800 });
        announce((d.seat === 0 ? 'You' : game.players[d.seat].name) + ' reveals ' + E.tileName(d.tile) + '.');
        return sleep(380);
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
        sound.play(d.type === 'kong' ? 'kong' : 'claim');
        var words = { chow: 'Chow!', pung: 'Pung!', kong: 'Kong!' };
        var pos = declarationPos(d.seat);
        banner(words[d.type], pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, size: 24 });
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
      kongAttempt: function (d) {
        var pos = declarationPos(d.seat);
        banner('Kong?', pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, size: 20, dur: 700 });
        return sleep(300);
      },
      kong: function (d) {
        sound.play('kong');
        var pos = declarationPos(d.seat);
        banner('Kong!', pos.x, pos.y, { rot: pos.rot, maxW: pos.maxW, size: 24 });
        announce((d.seat === 0 ? 'You declare' : game.players[d.seat].name + ' declares') + ' a kong of ' + E.tileName(d.tile) + '.');
        return sleep(650);
      },
      win: function (res) {
        ui.turnPrompt = null;
        ui.claimPrompt = null;
        var c = L.center;
        var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        var label = res.how === 'selfDraw' ? 'Self-draw!' : 'Win!';
        if (res.how === 'flowers') label = 'Flower win!';
        var mine = res.winner === 0;
        banner(label, cx, cy, { size: 34, dur: 1700, color: mine ? COLORS.gold : COLORS.red, textColor: mine ? COLORS.ink : COLORS.white, sub: (mine ? 'You' : game.players[res.winner].name) + ' · ' + res.score.faan + ' faan' });
        if (mine) {
          sound.play('win');
          confetti(cx, cy, 140, false);
          confetti(cx, cy, 50, true);
        } else {
          sound.play(res.payer === 0 ? 'lose' : 'otherwin');
          confetti(cx, cy, 40, true);
        }
        announce((mine ? 'You win' : game.players[res.winner].name + ' wins') + ' with ' + res.score.faan + ' faan.');
        return sleep(1500);
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

    function botAgent() {
      return {
        turn: function (g, seat, opts) {
          var action = B.chooseTurnAction(g, seat, opts);
          if (instantMode()) return Promise.resolve(action);
          var n = g.hand.seats[seat].hand.length;
          var think = 560 + Math.random() * 520;
          ui.thinking = seat;
          requestRender();
          // Look over a couple of tiles, then lift the one to throw.
          var glance = function () {
            ui.botLift = { seat: seat, index: Math.floor(Math.random() * n) };
            requestRender();
            return sleep(think / 3);
          };
          return glance().then(glance).then(function () {
            ui.thinking = null;
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
          var decision = B.chooseClaim(g, seat, opts);
          if (instantMode()) return Promise.resolve(decision);
          return sleep(decision.type === 'pass' ? 50 : 420).then(function () { return decision; });
        },
      };
    }

    function humanAgent() {
      return {
        turn: function (g, seat, opts) {
          return new Promise(function (resolve) {
            ui.turnPrompt = { opts: opts, resolve: resolve };
            ui.selected = -1;
            ui.notice = opts.completeButShort
              ? 'Your hand is complete, but only ' + opts.completeButShort.faan + ' faan. You need ' + game.settings.minFaan + ' to win.'
              : (opts.win ? 'You can win with ' + opts.win.faan + ' faan!' : null);
            refreshHint();
            sound.play('turn');
            announce(opts.win ? 'You can win. Press Win, or pick a tile to discard.' : 'Your turn. Pick a tile to discard.');
            requestRender();
          });
        },
        claim: function (g, seat, opts) {
          return new Promise(function (resolve) {
            var highlight = [];
            if (opts.pung || opts.kong) highlight.push(opts.tile);
            opts.chows.forEach(function (p) { highlight = highlight.concat(p); });
            ui.claimPrompt = { opts: opts, resolve: resolve, highlight: highlight };
            ui.notice = opts.win
              ? 'You can win on ' + E.tileName(opts.tile) + ' for ' + opts.win.faan + ' faan!'
              : (opts.completeButShort ? E.tileName(opts.tile) + ' completes your hand, but only for ' + opts.completeButShort.faan + ' faan.' : 'Claim ' + E.tileName(opts.tile) + '?');
            refreshHint();
            sound.play('turn');
            announce(ui.notice);
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

    async function play() {
      await loadAssets();
      spriteCache = {};
      game = E.createGame({ spicy: settings.spicy, mode: settings.mode });
      var agents = [humanAgent(), botAgent(), botAgent(), botAgent()];
      track('play_start', {
        spicy: settings.spicy, mode: settings.mode, hints: settings.hints ? 'on' : 'off',
        speed: settings.speed, walls: settings.walls ? 'on' : 'off',
      });
      while (!destroyed) {
        var res = await E.runHand(game, agents, uiBridge);
        if (destroyed) return;
        recordStats(res);
        ui.turnSeat = null;
        track('play_hand_end', {
          result: res.type === 'draw' ? 'draw' : res.winner === 0 ? 'win' : 'loss',
          faan: res.type === 'win' ? res.score.faan : 0,
        });
        var extra = null;
        if (!game.over && settings.mode === 'payout') {
          var joined = E.replaceBustedBots(game);
          if (joined.length) {
            extra = joined.map(function (j) { return j.left + ' is out of points; ' + j.joined + ' takes the seat.'; }).join(' ');
          }
        }
        if (res.roundAdvanced && !extra) extra = 'The round wind is now ' + E.WIND_NAMES[game.round] + '.';
        await showOverlay({ type: 'summary', result: res, extra: extra });
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
    root.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    var ro = root.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(canvas);
    resize();

    return {
      start: function () {
        sound.startMusic();
        play().catch(function (err) {
          if (root.console) console.error(err);
        });
      },
      destroy: function () {
        destroyed = true;
        sound.stopMusic();
        root.removeEventListener('resize', onResize);
        root.removeEventListener('keydown', onKey);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        if (ro) ro.disconnect();
      },
      // Exposed for debugging in the browser console.
      get game() { return game; },
      get ui() { return ui; },
      // Exposed for debugging in the browser console.
      declare: function (seat, label) {
        var p = declarationPos(seat);
        banner(label, p.x, p.y, { rot: p.rot, maxW: p.maxW, size: 24, dur: 6000 });
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Preview page wiring (settings form <-> table)
   * ------------------------------------------------------------------ */

  // Settings the form doesn't show (hints, animations, walls) keep whatever
  // was last chosen from the in-game menu.
  function readForm(form, saved) {
    saved = saved || {};
    var get = function (name, fallback) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : fallback;
    };
    return {
      spicy: get('spicy', saved.spicy || 'full'),
      mode: get('mode', saved.mode || 'payout'),
      hints: get('hints', saved.hints === false ? 'off' : 'on') === 'on',
      speed: get('speed', saved.speed) === 'off' ? 'off' : 'normal', // an old 'fast' setting shows animations
      walls: get('walls', saved.walls === false ? 'off' : 'on') === 'on',
    };
  }

  function applySaved(form, saved) {
    var set = function (name, value) {
      var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (el) el.checked = true;
    };
    if (saved.spicy) set('spicy', saved.spicy);
    if (saved.mode) set('mode', saved.mode);
    if (saved.hints !== undefined) set('hints', saved.hints ? 'on' : 'off');
    if (saved.speed) set('speed', saved.speed);
    if (saved.walls !== undefined) set('walls', saved.walls ? 'on' : 'off');
  }

  function init() {
    var form = document.getElementById('play-settings');
    var stage = document.getElementById('play-stage');
    var canvas = document.getElementById('play-canvas');
    var live = document.getElementById('play-live');
    if (!form || !stage || !canvas) return;
    applySaved(form, readJson(SETTINGS_KEY, {}));
    loadAssets();

    var table = null;

    function open(settings) {
      stage.hidden = false;
      document.documentElement.classList.add('is-playing');
      if (table) table.destroy();
      table = createTable(canvas, live, settings, {
        quit: close,
        restart: function () { open(settings); },
      });
      table.start();
      canvas.focus();
      root.__lcmTable = table;
    }

    function close() {
      if (table) table.destroy();
      table = null;
      stage.hidden = true;
      document.documentElement.classList.remove('is-playing');
      var start = document.getElementById('play-start');
      if (start) start.focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var settings = readForm(form, readJson(SETTINGS_KEY, {}));
      writeJson(SETTINGS_KEY, settings);
      // ?instant=1 skips animations for this visit only (handy for testing).
      if (/[?&]instant=1/.test(root.location.search)) settings.speed = 'off';
      open(settings);
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
