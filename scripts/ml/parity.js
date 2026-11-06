#!/usr/bin/env node
/* Checks the JS model (js/mahjong-ml-model.js) gives the outputs ml/train.py
   expects for the same weights. ml/train.py runs it after every export.

   node scripts/ml/parity.js ml/models/r0.json ml/models/r0.check.json */

'use strict';

const fs = require('node:fs');
const M = require('../../js/mahjong-ml-model.js');

const [weightsFile, checkFile] = process.argv.slice(2);
const model = M.createModel(JSON.parse(fs.readFileSync(weightsFile, 'utf8')));
const check = JSON.parse(fs.readFileSync(checkFile, 'utf8'));
let worst = 0;
check.inputs.forEach((x, k) => {
  const out = model.forward(Float32Array.from(x));
  out.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - check.outputs[k][i])); });
});
const ok = worst < 1e-3;
console.log('JS parity: ' + check.inputs.length + ' samples, largest difference ' + worst.toExponential(2) + (ok ? ' (ok)' : ' (TOO LARGE)'));
process.exit(ok ? 0 : 1);
