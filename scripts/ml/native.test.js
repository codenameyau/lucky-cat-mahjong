// The native simulator plays exactly as the JS does (scripts/ml/native.js).
// Skipped until it's built (npm run native:build): CI runs the JS alone.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const EXE = process.platform === 'win32' ? '.exe' : '';
const built = fs.existsSync(path.join(ROOT, 'native', 'build', 'lcm-sim' + EXE)) && fs.existsSync(path.join(ROOT, 'native', 'build', 'lcm-sim-exact' + EXE));

describe('native simulator', { skip: !built && 'native/build/lcm-sim is not built (npm run native:build)' }, () => {
  const parity = (agents, deals) => {
    const r = spawnSync('node', [path.join(__dirname, 'native.js'), 'parity', '--agents', agents, '--deals', String(deals), '--seed', '914000000'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^same: /);
  };
  it('plays every action of the engine as the JS does', () => parity('simple,simple,simple,simple', 100));
  it('plays Jorge Yau and Neural Cat as the JS does', () => parity('neural-cat,jorge-yau,neural-cat,jorge-yau', 8));
  it('plays Lucky Cat (features v1) as the JS does', () => parity('lc:js/mahjong-lucky-cat-weights.js,neural-cat,jorge-yau,neural-cat', 6));
  it('the fast build plays the exact build\'s hands, last-bit ties aside', () => {
    const N = require('./native.js');
    const ids = ['neural-cat', 'jorge-yau', 'neural-cat', 'lc:js/mahjong-lucky-cat-weights.js'].map((id) => N.nativeId(id));
    const run = (bin) => spawnSync(path.join(ROOT, 'native', 'build', bin + EXE), ['trace', '--agents', ids.join(','), '--seed', '915500000', '--deals', '30'], { encoding: 'utf8' }).stdout.split(/^hand /m).slice(1);
    const fast = run('lcm-sim'), exact = run('lcm-sim-exact');
    assert.strictEqual(fast.length, 30);
    const same = fast.filter((h, k) => h === exact[k]).length;
    assert.ok(same >= 27, same + ' of 30 hands identical');
  });
  it('round-trips weights through .lcmw', () => {
    const W = require('./weights.js');
    const w = W.readWeights('js/mahjong-lucky-cat-weights.js');
    const back = W.fromLcmw(W.toLcmw(w));
    const a = W.floats(w.layers[1].w, w.dtype), b = W.floats(back.layers[1].w);
    assert.strictEqual(a.length, b.length);
    for (let i = 0; i < a.length; i += 97) assert.strictEqual(a[i], b[i]);
  });
});
