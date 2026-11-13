#!/usr/bin/env node
// The Python in ml/.venv, wherever the platform puts it: bin/python on
// macOS and Linux, Scripts\python.exe on Windows. Run as a script, it runs
// that Python with the given arguments (npm run ml:train uses this).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const VENV = path.join(ROOT, "ml", ".venv");
const PYTHON = process.platform === "win32"
  ? path.join(VENV, "Scripts", "python.exe")
  : path.join(VENV, "bin", "python");

module.exports = { PYTHON };

if (require.main === module) {
  if (!fs.existsSync(PYTHON)) {
    console.error("No Python at " + PYTHON + ". Set up ml/.venv first: see docs/machine-learning/training.md#setup");
    process.exit(1);
  }
  const res = spawnSync(PYTHON, process.argv.slice(2), { cwd: ROOT, stdio: "inherit" });
  if (res.error) throw res.error;
  process.exit(res.status === null ? 1 : res.status);
}
