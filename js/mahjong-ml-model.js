/* The learned strategy's model: a small fully connected network, run in
   plain JS so the page needs no library.

   It reads the features of one discard (js/mahjong-ml-features.js) and
   predicts how the hand ends for this seat:
     outcome   win by self-draw, win off a discard, deal in, someone else
               self-draws, someone else wins off another seat, or a draw
     winFaan   the faan of our win (3 to 13)
     payFaan   the faan of the hand we pay for (3 to 13)
   ev() turns that into expected points on the full-spicy payout table, so
   the best discard is the one worth the most points on average: fast wins
   and big wins both count.

   Weights are { featureVersion, featureSize, layers: [{ rows, cols, w, b }] }
   with w (rows x cols, row-major) and b as base64 float32, or plain arrays.
   The last layer has OUTPUTS rows. createModel(weights) or randomModel(seed). */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var F = node ? require('./mahjong-ml-features.js') : root.MahjongMLFeatures;

  var OUTCOMES = ['winSelf', 'winDiscard', 'dealIn', 'otherSelf', 'otherWin', 'draw'];
  var FAAN = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  var OUTPUTS = OUTCOMES.length + 2 * FAAN.length;
  var HIDDEN = [256, 128];

  function points(f) { return 8 * Math.pow(2, Math.min(f, 13) - 3); }

  function fromBase64(s) {
    var bytes;
    if (typeof Buffer !== 'undefined') bytes = new Uint8Array(Buffer.from(s, 'base64'));
    else {
      var bin = atob(s);
      bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }

  function toBase64(arr) {
    var bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function floats(v) {
    if (v instanceof Float32Array) return v;
    if (typeof v === 'string') return fromBase64(v);
    return Float32Array.from(v);
  }

  function softmax(v, from, n) {
    var m = -Infinity, i;
    for (i = 0; i < n; i++) m = Math.max(m, v[from + i]);
    var out = new Array(n), sum = 0;
    for (i = 0; i < n; i++) { out[i] = Math.exp(v[from + i] - m); sum += out[i]; }
    for (i = 0; i < n; i++) out[i] /= sum;
    return out;
  }

  function createModel(weights) {
    if (weights.featureSize !== F.SIZE) {
      throw new Error('model expects ' + weights.featureSize + ' features, have ' + F.SIZE);
    }
    var layers = weights.layers.map(function (l) {
      return { rows: l.rows, cols: l.cols, w: floats(l.w), b: floats(l.b) };
    });
    if (layers[layers.length - 1].rows !== OUTPUTS) throw new Error('model must have ' + OUTPUTS + ' outputs');
    var widest = layers.reduce(function (m, l) { return Math.max(m, l.rows); }, 0);
    var bufA = new Float32Array(widest), bufB = new Float32Array(widest);

    // The raw outputs for one feature vector.
    function forward(x) {
      var input = x, out;
      for (var k = 0; k < layers.length; k++) {
        var l = layers[k], w = l.w, b = l.b, cols = l.cols;
        out = k % 2 ? bufB : bufA;
        var last = k === layers.length - 1;
        for (var r = 0; r < l.rows; r++) {
          var s = b[r], off = r * cols;
          for (var c = 0; c < cols; c++) s += w[off + c] * input[c];
          out[r] = last || s > 0 ? s : 0;
        }
        input = out;
      }
      return Array.prototype.slice.call(out, 0, OUTPUTS);
    }

    function predict(x) {
      var raw = forward(x);
      var o = softmax(raw, 0, OUTCOMES.length);
      var winFaan = softmax(raw, OUTCOMES.length, FAAN.length);
      var payFaan = softmax(raw, OUTCOMES.length + FAAN.length, FAAN.length);
      var outcome = {};
      OUTCOMES.forEach(function (k, i) { outcome[k] = o[i]; });
      return { outcome: outcome, winFaan: winFaan, payFaan: payFaan };
    }

    return {
      meta: weights.meta || {},
      featureVersion: weights.featureVersion,
      forward: forward,
      predict: predict,
      ev: function (x) { return summarize(predict(x)); },
    };
  }

  // Expected points from a prediction, and the parts behind it.
  function summarize(p) {
    var winPts = 0, payPts = 0, winF = 0, payF = 0;
    FAAN.forEach(function (f, i) {
      winPts += p.winFaan[i] * points(f);
      payPts += p.payFaan[i] * points(f);
      winF += p.winFaan[i] * f;
      payF += p.payFaan[i] * f;
    });
    var o = p.outcome;
    // A self-draw is paid by all three other seats.
    var gain = o.winSelf * 3 * winPts + o.winDiscard * winPts;
    var cost = (o.dealIn + o.otherSelf) * payPts;
    return {
      ev: gain - cost,
      pWin: o.winSelf + o.winDiscard,
      pDealIn: o.dealIn,
      pOtherSelf: o.otherSelf,
      pDraw: o.draw,
      winFaan: winF,
      payFaan: payF,
      avgWin: (o.winSelf * 3 * winPts + o.winDiscard * winPts) / Math.max(1e-9, o.winSelf + o.winDiscard),
      gain: gain,
      cost: cost,
      outcome: o,
    };
  }

  // A model with random weights (He initialisation), for tests and the
  // first round of data before any training.
  function randomWeights(seed, hidden) {
    var rng = E.createRng(seed || 1);
    var gauss = function () {
      var u = Math.max(1e-12, rng()), v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    var sizes = [F.SIZE].concat(hidden || HIDDEN, [OUTPUTS]);
    var layers = [];
    for (var k = 0; k < sizes.length - 1; k++) {
      var cols = sizes[k], rows = sizes[k + 1];
      var w = new Float32Array(rows * cols), b = new Float32Array(rows);
      var scale = Math.sqrt(2 / cols) * (k === sizes.length - 2 ? 0.1 : 1);
      for (var i = 0; i < w.length; i++) w[i] = gauss() * scale;
      layers.push({ rows: rows, cols: cols, w: w, b: b });
    }
    return { featureVersion: F.FEATURE_VERSION, featureSize: F.SIZE, layers: layers, meta: { random: true, seed: seed || 1 } };
  }

  function randomModel(seed, hidden) { return createModel(randomWeights(seed, hidden)); }

  // Weights as JSON-friendly base64 (for js/mahjong-ml-weights.js).
  function serialize(weights) {
    return {
      featureVersion: weights.featureVersion,
      featureSize: weights.featureSize,
      meta: weights.meta || {},
      layers: weights.layers.map(function (l) {
        return { rows: l.rows, cols: l.cols, w: toBase64(floats(l.w)), b: toBase64(floats(l.b)) };
      }),
    };
  }

  var api = {
    OUTCOMES: OUTCOMES,
    FAAN: FAAN,
    OUTPUTS: OUTPUTS,
    HIDDEN: HIDDEN,
    points: points,
    createModel: createModel,
    randomWeights: randomWeights,
    randomModel: randomModel,
    summarize: summarize,
    serialize: serialize,
  };

  if (node) module.exports = api;
  else root.MahjongMLModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
