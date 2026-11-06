/* Hidden playback page. The table is up immediately and plays the playback
   saved from a game. With none saved, Upload in the center reads a JSON
   file, and Command+V or Ctrl+V pastes one. ?replay=1 is the visit from
   View playback, so Back can return there. */
(function () {
  'use strict';

  var canvas = document.getElementById('play-canvas');
  var live = document.getElementById('play-live');
  var Game = window.MahjongGame;
  if (!canvas || !live || !Game || !Game.createTable) return;

  document.documentElement.classList.add('is-playing');
  var fromReplay = /[?&]replay=1(?:&|$)/.test(window.location.search);
  var table = Game.createTable(canvas, live, {
    playback: true,
    review: null,
    replayFromStorage: fromReplay,
    coach: 'on',
    speed: 'normal',
    spicy: 'full',
    mode: 'practice',
  }, { quit: function () {}, restart: function () {} });
  table.start();
})();
