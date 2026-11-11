// node scripts/ml/oo-fair-play.js <weights.json>: the fair-play shuffle check (scripts/ml/fair-play.js) on an Only Orphans model.
const fs = require('fs');
const OO = require('../../js/mahjong-only-orphans.js');
const { playAll } = require('./fair-play.js');
const w = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const bot = OO.create({ id: 'oo-check', weights: w, fast: true });
  const n = await playAll('only-orphans ' + w.meta.name, bot, null, 3);
  console.log('fair play ok:', w.meta.name, JSON.stringify(n));
})().catch((e) => { console.error('FAIR PLAY FAILED', e.message); process.exit(1); });
