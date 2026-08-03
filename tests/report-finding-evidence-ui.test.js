const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
const formatSource = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "format.ts"), "utf8");

test("shared reports make exact finding proof the primary replay action", () => {
  assert.match(appSource, /Watch this moment/);
  assert.match(appSource, /Video proof unavailable for this finding/);
  assert.match(appSource, /Full session recording/);
  assert.match(appSource, /evidenceMode === "finding"/);
});

test("replay UI does not invent a neutral experience without reaction evidence", () => {
  assert.match(appSource, /if \(!sorted\.length\) \{\s*return \[\];/);
  assert.doesNotMatch(appSource, /id: "experience-neutral"/);
  assert.match(appSource, /No reaction label is shown without timestamped reaction evidence/);
});

test("finding evidence resolution prefers clips linked by finding id", () => {
  assert.match(formatSource, /getFindingEvidenceMoment/);
  assert.match(formatSource, /clip\.finding_id/);
  assert.match(formatSource, /linked_finding_ids/);
});
