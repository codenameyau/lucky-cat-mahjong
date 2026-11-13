/* Lab strategies for the training scripts (npm run compete, ml:generate,
   ml:orphans), never offered at the table:
     only-orphans-rules  the rule-based Only Orphans, the baseline the learned
                         one is measured against
     oo:<file>           the learned Only Orphans with those weights */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const S = require("../../../js/mahjong-strategies.js");

const BASELINE = "only-orphans-rules";
const MODEL_PREFIX = "oo:";

function addBaselines() {
  if (S.has(BASELINE)) return;
  S.addLab({
    id: BASELINE,
    name: "Only Orphans (rules)",
    bot: require("./only-orphans-rules.js"),
    summary: "The rule-based Only Orphans: the baseline the learned Only Orphans is measured against.",
  });
}

// "oo:<file>" ids in a lineup: the learned Only Orphans with those weights.
function addOrphanModels(ids) {
  const OO = require("../../../js/mahjong-only-orphans.js");
  ids.filter((id) => id.startsWith(MODEL_PREFIX) && !S.has(id)).forEach((id) => {
    const weights = JSON.parse(fs.readFileSync(path.resolve(id.slice(MODEL_PREFIX.length)), "utf8"));
    S.addLab({ id, name: id, bot: OO.create({ id, weights, fast: true }), summary: "Only Orphans with " + id.slice(MODEL_PREFIX.length) });
  });
}

module.exports = { addBaselines, addOrphanModels, BASELINE, MODEL_PREFIX };
