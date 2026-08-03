const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const helperSource = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "screen-capture.ts"), "utf8");
const widgetSource = fs.readFileSync(path.join(__dirname, "..", "lib", "manual-qa-widget.js"), "utf8");

test("human screen capture requests an always-visible cursor", () => {
  assert.match(helperSource, /cursor: "always"/);
  assert.match(widgetSource, /cursor: "always"/);
});

test("unsupported cursor constraints fall back without hiding permission errors", () => {
  assert.match(helperSource, /TypeError/);
  assert.match(helperSource, /OverconstrainedError/);
  assert.match(helperSource, /throw error/);
  assert.match(helperSource, /getDisplayMedia\(\{ video: true, audio: true \}\)/);
});
