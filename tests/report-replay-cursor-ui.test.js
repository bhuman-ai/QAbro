const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");

test("shared replays show one plain-language click intent overlay", () => {
  assert.match(appSource, /Trying to click: \{activeCursor\.label\}/);
  assert.match(appSource, /agent_click_attempted/);
  assert.match(appSource, /replay_interactions/);
  assert.match(appSource, /rebaseReplayCursorCues/);
  assert.match(appSource, /border-brand-accent bg-brand-accent\/20/);
});

test("finding clips receive their rebased cursor cues", () => {
  assert.match(appSource, /moment\.sourceKind === "finding_clip"/);
  assert.match(appSource, /cursorCues=\{replayTarget\.cursorCues\}/);
});

