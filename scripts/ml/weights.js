#!/usr/bin/env node
/* Model weights in both forms: the JSON (and js/*-weights.js) the game and
   the JS lab read, and .lcmw, the binary the native simulator reads.

   node scripts/ml/weights.js export <weights> <out.lcmw>
   node scripts/ml/weights.js import <in.lcmw> <out.json>

   <weights>: a .json model, a js/*-weights.js file, or git:<commit>:<path>.
   .lcmw holds the same numbers the JS plays with: each layer's weights and
   biases as float32 (an f16 file is widened exactly as js/mahjong-ml-model.js
   does), after a JSON header with everything else (featureVersion,
   featureSize, meta with its play settings). Importing gives back a JSON
   the JS loads, with float32 weights: the two forms play the same moves.

   Layout: "LCMW" 1 (uint32) headerBytes (uint32) header (UTF-8 JSON), then
   per layer w (rows x cols, row-major) and b (rows), float32 little-endian.
   Version 2 is a stacked model: the header also has readerVersion and
   reader.layers, and the reader's layers follow the move network's. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

function halfToFloat(h) {
  const sign = h & 0x8000 ? -1 : 1, exp = (h >> 10) & 0x1f, frac = h & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

function floats(v, dtype) {
  if (typeof v !== 'string') return Float32Array.from(v);
  const bytes = Buffer.from(v, 'base64');
  if (dtype === 'f16') {
    const out = new Float32Array(bytes.length / 2);
    for (let j = 0; j < out.length; j++) out[j] = halfToFloat(bytes[2 * j] | (bytes[2 * j + 1] << 8));
    return out;
  }
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function readWeights(spec) {
  if (spec.startsWith('git:')) {
    const [, commit, file] = spec.match(/^git:([^:]+):(.+)$/);
    const text = execFileSync('git', ['show', commit + ':' + file], { cwd: ROOT, maxBuffer: 1 << 30 }).toString();
    if (file.endsWith('.js')) { const m = { exports: {} }; new Function('module', 'exports', text)(m, m.exports); return m.exports; }
    return JSON.parse(text);
  }
  const file = path.resolve(ROOT, spec);
  if (file.endsWith('.js')) return require(file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toLcmw(w) {
  const conv = (ls, dtype) => ls.map((l) => ({ rows: l.rows, cols: l.cols, w: floats(l.w, dtype), b: floats(l.b, dtype) }));
  const layers = conv(w.layers, w.dtype);
  const reader = w.reader ? conv(w.reader.layers, w.reader.dtype || w.dtype) : null;
  const head = {
    featureVersion: w.featureVersion, featureSize: w.featureSize, meta: w.meta || {},
    layers: layers.map((l) => ({ rows: l.rows, cols: l.cols })),
  };
  if (reader) { head.readerVersion = w.readerVersion; head.reader = { layers: reader.map((l) => ({ rows: l.rows, cols: l.cols })) }; }
  const header = Buffer.from(JSON.stringify(head));
  const parts = [Buffer.from('LCMW'), Buffer.alloc(8)];
  parts[1].writeUInt32LE(reader ? 2 : 1, 0);
  parts[1].writeUInt32LE(header.length, 4);
  parts.push(header);
  layers.concat(reader || []).forEach((l) => { parts.push(Buffer.from(l.w.buffer, l.w.byteOffset, l.w.byteLength), Buffer.from(l.b.buffer, l.b.byteOffset, l.b.byteLength)); });
  return Buffer.concat(parts);
}

function fromLcmw(buf) {
  if (buf.toString('latin1', 0, 4) !== 'LCMW') throw new Error('not an .lcmw file');
  const n = buf.readUInt32LE(8);
  const h = JSON.parse(buf.toString('utf8', 12, 12 + n));
  let at = 12 + n;
  const take = (len) => { const a = new Float32Array(buf.buffer.slice(buf.byteOffset + at, buf.byteOffset + at + 4 * len)); at += 4 * len; return a; };
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const one = (l) => { const w = take(l.rows * l.cols), b = take(l.rows); return { rows: l.rows, cols: l.cols, w: b64(w), b: b64(b) }; };
  const layers = h.layers.map(one);
  const out = { featureVersion: h.featureVersion, featureSize: h.featureSize, meta: h.meta, layers };
  if (h.reader) { out.readerVersion = h.readerVersion; out.reader = { layers: h.reader.layers.map(one) }; }
  return out;
}

if (require.main === module) {
  const [cmd, from, to] = process.argv.slice(2);
  if (cmd === 'export' && from && to) {
    fs.writeFileSync(to, toLcmw(readWeights(from)));
    console.log('wrote ' + to);
  } else if (cmd === 'import' && from && to) {
    fs.writeFileSync(to, JSON.stringify(fromLcmw(fs.readFileSync(from))));
    console.log('wrote ' + to);
  } else {
    console.error('usage: weights.js export <weights> <out.lcmw> | import <in.lcmw> <out.json>');
    process.exit(2);
  }
}

module.exports = { readWeights, toLcmw, fromLcmw, floats };
