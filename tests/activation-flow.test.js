const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "src", "App.tsx"), "utf8");

test("signup asks only for an email when creating an account", () => {
  const authGate = app.slice(app.indexOf("function AuthGate"), app.indexOf("function LoadingShell"));

  assert.match(authGate, /Create your account/);
  assert.match(authGate, /Catch problems before you ship/);
  assert.doesNotMatch(authGate, /Full Name|Invite Code|fullName|passwordOrInvite/);
});

test("public MCP actions bypass project onboarding and open focused key setup", () => {
  assert.match(app, /next\.set\("panel", "coding_agents"\)/);
  assert.match(app, /\["help", "manual_qa", "coding_agents"\]\.includes\(currentPanel\)/);
  assert.match(app, /resolvedPanel === "coding_agents"/);
  assert.match(app, /codingAgentsOnly/);
  assert.match(app, /Connect your coding agent/);
});

test("first-run dashboard uses real run state instead of demo data", () => {
  assert.match(app, /run\.latest_report_status \|\| run\.status \|\| run\.queue_status/);
  assert.match(app, /"Needs review"/);
  assert.match(app, /"In progress"/);
  assert.match(app, /No tests yet/);
  assert.match(app, /No live test/);
  assert.doesNotMatch(app, /70 \+ index \* 3/);
  assert.doesNotMatch(app, /liveAgents\[0\] \|\|/);
});

test("completed human reports explain findings directly below the recording", () => {
  const report = app.slice(app.indexOf("function ManualQaCompletedReport"), app.indexOf("function getSupportedRecordingMimeType"));
  const playerIndex = report.indexOf("<ManualQaRecordingPlayer");
  const findingsIndex = report.indexOf("<ManualQaFindings");
  const noteIndex = report.indexOf('aria-labelledby="manual-qa-note-title"');

  assert.ok(playerIndex >= 0);
  assert.ok(findingsIndex > playerIndex);
  assert.ok(noteIndex > findingsIndex);
  assert.match(app, /What the tester found/);
  assert.match(app, /Bugs/);
  assert.match(app, /Frustrations/);
  assert.match(app, /Aha moments/);
  assert.match(app, /Draft findings from the captured note and evidence/);
});
