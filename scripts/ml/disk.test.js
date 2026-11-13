// What the frontier rounds delete to save disk, and what they never touch (scripts/ml/disk.js).
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const D = require("./disk.js");

function tmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lcm-disk-"));
  const mk = (rel, bytes, ageHours) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.alloc(bytes || 10));
    if (ageHours) { const t = new Date(Date.now() - ageHours * 3600e3); fs.utimesSync(p, t, t); fs.utimesSync(path.dirname(p), t, t); }
    return p;
  };
  return { root, mk };
}
const quiet = () => {};

describe("disk", () => {
  it("deletes frontier data no lineage lists, once it is old, and nothing else", () => {
    const { root, mk } = tmp();
    mk("ml/frontier/lucky-cat/state.json");
    fs.writeFileSync(path.join(root, "ml/frontier/lucky-cat/state.json"), JSON.stringify({ data: ["ml/data/lv-5"] }));
    mk("ml/data/lv-5/shard-0.x.f16", 10, 24);   // listed: stays
    mk("ml/data/lv-4/shard-0.x.f16", 10, 24);   // unlisted, old: goes
    mk("ml/data/sp-1/shard-0.x.f16", 10, 1);    // unlisted, but could still be being written: stays
    mk("ml/data/lab-9/shard-0.x.f16", 10, 24);  // another lab's: never touched
    D.pruneOrphans(quiet, { data: path.join(root, "ml/data"), frontier: path.join(root, "ml/frontier") });
    const left = fs.readdirSync(path.join(root, "ml/data")).sort();
    assert.deepStrictEqual(left, ["lab-9", "lv-5", "sp-1"]);
  });
  it("makes room by dropping the oldest kept rounds, never the newest, and stops if that is not enough", () => {
    const { root, mk } = tmp();
    ["lv-1", "lv-2", "lv-3"].forEach((d) => mk("ml/data/" + d + "/x", 10));
    let free = 5;
    const state = { data: ["ml/data/lv-1", "ml/data/lv-2", "ml/data/lv-3"] };
    const opts = { root, free: () => free };
    // Freeing comes from the deletions: each one adds 4 here.
    const log = () => { free += 4; };
    D.makeRoom(state, 10, log, 2, opts);   // wants 12: drops lv-1 (9), lv-2 (13)
    assert.deepStrictEqual(state.data, ["ml/data/lv-3"]);
    assert.ok(!fs.existsSync(path.join(root, "ml/data/lv-1")) && !fs.existsSync(path.join(root, "ml/data/lv-2")));
    free = 1;
    assert.throws(() => D.makeRoom(state, 10, log, 2, opts), /disk:/);
    assert.deepStrictEqual(state.data, ["ml/data/lv-3"]);  // the newest is never deleted
  });
  it("keeps the converted-weights cache to the recently used, under its cap", () => {
    const { root, mk } = tmp();
    const cache = path.join(root, "cache");
    mk("cache/old.lcmw", 10, 24 * 30);
    mk("cache/a.lcmw", 600, 1);
    mk("cache/b.lcmw", 600, 2);
    D.pruneCache(quiet, { cache, maxAgeDays: 14, maxBytes: 1000 });
    assert.deepStrictEqual(fs.readdirSync(cache).sort(), ["a.lcmw"]);  // old: unused 30 days; b: past the cap
  });
});
