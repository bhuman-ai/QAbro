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
