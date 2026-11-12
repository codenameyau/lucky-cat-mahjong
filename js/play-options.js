/* The options page, /play-mahjong/: the game mode, Start, Resume and Learn
   to play. The game itself is its own page, /playing-mahjong/ (js/mahjong-game.js):

   - Start game:   /playing-mahjong/?new=1, a new game in the mode picked here
   - Resume game:  /playing-mahjong/, the saved game
   - Learn to play: /playing-mahjong/?learn=1, the lesson

   The page's inline script paints the saved mode and buttons before the first
   frame; this keeps them right as the mode changes. Whether the saved game
   still loads is checked on the game page, which starts a new game if not.
   ?sound and ?instant (for testing) carry over to the game page. */

(function (root) {
  'use strict';

  var SETTINGS_KEY = 'lcm-play-settings';
  var AUTOSAVE_KEY = 'lcm-play-autosave';
  var GAME_PAGE = '/playing-mahjong/';

  function readJson(key, fallback) {
    try {
      var v = JSON.parse(root.localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function writeJson(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function track(name, params) {
    if (typeof root.gtag === 'function') root.gtag('event', name, params || {});
  }

  // The game page's address: the request, and a quiet or instant visit kept so.
  function gameUrl(params, search) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) { parts.push(k + '=' + encodeURIComponent(params[k])); });
    var sound = /[?&]sound=(0|1)(?:&|$)/.exec(search || '');
    if (sound) parts.push('sound=' + sound[1]);
    if (/[?&]instant=1(?:&|$)/.test(search || '')) parts.push('instant=1');
    return GAME_PAGE + (parts.length ? '?' + parts.join('&') : '');
  }

  function savedGame() {
    var save = readJson(AUTOSAVE_KEY, null);
    return save && save.payload && save.payload.game ? save.payload.game : null;
  }

  function init(document) {
    var form = document.getElementById('play-settings');
    if (!form) return;
    var html = document.documentElement;
    var resumeBtn = document.getElementById('play-resume');
    var startBtn = document.getElementById('play-start');
    var learnBtn = document.getElementById('play-learn');

    function mode() {
      var el = form.querySelector('input[name="mode"]:checked');
      return el ? el.value : 'practice';
    }

    // Two buttons. The red one is Resume game when there's a saved game in
    // the selected mode, otherwise Start new game; Learn to play is always the
    // white one beside it.
    function paint() {
      var game = savedGame();
      var saved = game && game.settings && game.settings.mode;
      var here = !!game && (!saved || saved === mode());
      html.classList.toggle('play-has-save', here);
      if (resumeBtn) { resumeBtn.hidden = !here; resumeBtn.classList.add('btn-primary'); resumeBtn.classList.remove('btn-white'); }
      if (startBtn) { startBtn.hidden = here; startBtn.textContent = 'Start new game'; startBtn.classList.add('btn-primary'); startBtn.classList.remove('btn-white'); }
      if (learnBtn) { learnBtn.hidden = false; learnBtn.classList.add('btn-white'); learnBtn.classList.remove('btn-primary'); }
      html.classList.add('play-settled');
    }

    function saveMode() {
      var saved = readJson(SETTINGS_KEY, {});
      saved.mode = mode();
      // Payouts are always full spicy, including games saved as half spicy.
      saved.spicy = 'full';
      writeJson(SETTINGS_KEY, saved);
      return saved;
    }

    function go(params) {
      root.location.assign(gameUrl(params, root.location.search));
    }

    form.addEventListener('change', function () {
      saveMode();
      html.classList.remove('play-mode-practice', 'play-mode-payout');
      html.classList.add('play-mode-' + mode());
      track('play_mode_select', { mode: mode() });
      // The buttons swap colors at once: reading a layout value applies the
      // new colors while their fade is off, so nothing fades when it's back on.
      html.classList.add('play-swapping');
      paint();
      void html.offsetWidth;
      html.classList.remove('play-swapping');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveMode();
      track('play_start_click', { mode: mode() });
      go({ new: 1 });
    });

    if (resumeBtn) {
      resumeBtn.addEventListener('click', function () {
        track('play_resume_click', {});
        go({});
      });
    }

    if (learnBtn) {
      learnBtn.addEventListener('click', function () {
        track('play_learn_click', {});
        go({ learn: 1 });
      });
    }

    var credits = document.querySelector('.play-credits');
    if (credits) {
      credits.addEventListener('click', function (e) {
        var link = e.target.closest('a');
        if (link) track('play_credit_click', { link: link.textContent });
      });
    }

    // Back to this page from the game (the browser may show it from its
    // back-forward cache): the saved game may have changed.
    root.addEventListener('pageshow', paint);
    paint();
  }

  var api = { gameUrl: gameUrl, init: init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { init(root.document); });
    else init(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
