"use strict";

const fs = require("node:fs");
const path = require("node:path");

// A JSON file's contents, or fallback when it's missing or unreadable.
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return fallback; } };
// Writes v as JSON (one space a level), making the folder first.
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n"); };

module.exports = { readJson, writeJson };
