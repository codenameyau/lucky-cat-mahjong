const { describe, it } = require("node:test");
const assert = require("node:assert");
const { isGameFile, versionIn, isHigher, problem } = require("./check-game-version.js");

describe("the game version check", () => {
  it("counts the game's scripts, pages, styles, sounds and tiles", () => {
    ["js/mahjong-coach.js", "js/mahjong-ml-weights.js", "js/points.js", "js/offline-cache.js", "css/play.css",
      "playing-mahjong/index.html", "assets/sounds/gong.wav", "tiles/01-winds-east.svg",
    ].forEach((f) => assert.ok(isGameFile(f), f));
  });
  it("leaves out tests, docs and the rest of the site", () => {
    ["js/mahjong-coach.test.js", "js/points.harness.js", "js/main.js", "css/styles.css", "README.md", "play-mahjong/index.html",
      "assets/sounds/README.md", "native/ported.json", "scripts/ml/lab.js",
    ].forEach((f) => assert.ok(!isGameFile(f), f));
  });
  it("compares versions as numbers", () => {
    assert.ok(isHigher([0, 61, 10], [0, 61, 9]));
    assert.ok(isHigher([1, 0, 0], [0, 99, 99]));
    assert.ok(!isHigher([0, 61, 5], [0, 61, 5]));
    assert.ok(!isHigher([0, 60, 9], [0, 61, 0]));
  });
  it("reads the version from the engine", () => {
    assert.deepStrictEqual(versionIn("  var GAME_VERSION = \"0.61.6\";"), [0, 61, 6]);
    assert.deepStrictEqual(versionIn("  var GAME_VERSION = '0.61.6';"), [0, 61, 6], "an older base, in single quotes");
    assert.throws(() => versionIn("  var GAME_VERSION = \"0.61.6';"));
    assert.throws(() => versionIn("nothing here"));
  });
  it("fails a game change with no bump, and names the file", () => {
    assert.match(problem(["js/mahjong-bot.js"], [0, 61, 6], [0, 61, 6]), /js\/mahjong-bot\.js/);
  });
  it("passes a bump, and a change outside the game", () => {
    assert.strictEqual(problem(["js/mahjong-bot.js"], [0, 61, 6], [0, 61, 7]), null);
    assert.strictEqual(problem(["README.md", "js/main.js"], [0, 61, 6], [0, 61, 6]), null);
  });
});
