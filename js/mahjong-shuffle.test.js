'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const G = require('./mahjong-game.js');

// Deepest overlap between two tiles (positive means they overlap).
function overlap(A, B, hw, hh) {
  const ax = [Math.cos(A.a), Math.sin(A.a), -Math.sin(A.a), Math.cos(A.a)];
  const bx = [Math.cos(B.a), Math.sin(B.a), -Math.sin(B.a), Math.cos(B.a)];
  const dx = B.x - A.x, dy = B.y - A.y;
  let least = Infinity;
  for (const [x, y] of [[ax[0], ax[1]], [ax[2], ax[3]], [bx[0], bx[1]], [bx[2], bx[3]]]) {
    const ra = hw * Math.abs(ax[0] * x + ax[1] * y) + hh * Math.abs(ax[2] * x + ax[3] * y);
    const rb = hw * Math.abs(bx[0] * x + bx[1] * y) + hh * Math.abs(bx[2] * x + bx[3] * y);
    least = Math.min(least, ra + rb - Math.abs(dx * x + dy * y));
  }
  return least;
}

function cornersInside(t, hw, hh, b) {
  const c = Math.cos(t.a), s = Math.sin(t.a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => {
    const x = t.x + c * hw * sx - s * hh * sy;
    const y = t.y + s * hw * sx + c * hh * sy;
    return x >= b.x - 0.5 && x <= b.x + b.w + 0.5 && y >= b.y - 0.5 && y <= b.y + b.h + 0.5;
  });
}

describe('shuffle physics', () => {
  // Sizes the table uses (tile = shorter side / 8), plus a denser stress case.
  for (const [w, h, tw, count] of [[420, 300, 30, 32], [260, 220, 27, 17], [180, 140, 17, 19], [420, 300, 26, 46]]) {
    it(`keeps ${count} tiles apart and on the felt (${w}x${h})`, () => {
      const bounds = { x: 10, y: 20, w, h };
      const total = 2.2;
      const sim = G.createWashSim(bounds, tw, count, total);
      const start = sim.tiles.map((t) => [t.x, t.y]);
      let worst = 0, hits = 0;
      for (let time = 0; time < total; time += G.WASH_STEP) {
        sim.step(G.WASH_STEP, time);
        hits += sim.hits.filter((v) => v > tw * 1.5).length;
        sim.hits.length = 0;
        for (let i = 0; i < sim.tiles.length; i++) {
          assert.ok(cornersInside(sim.tiles[i], sim.hw, sim.hh, bounds), 'tile left the felt');
          for (let j = i + 1; j < sim.tiles.length; j++) {
            worst = Math.max(worst, overlap(sim.tiles[i], sim.tiles[j], sim.hw, sim.hh));
          }
        }
      }
      // A sliver under a pixel can exist mid-step; nothing visible.
      assert.ok(worst < 1, 'tiles overlapped by ' + worst.toFixed(2) + 'px');
      const moved = sim.tiles.reduce((n, t, i) => n + Math.hypot(t.x - start[i][0], t.y - start[i][1]), 0) / sim.tiles.length;
      assert.ok(moved > tw, 'tiles barely moved: ' + moved.toFixed(1) + 'px');
      assert.ok(hits > 20, 'only ' + hits + ' audible collisions');
    });
  }
});
