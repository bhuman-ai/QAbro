const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildInitialRepoTriageState,
  runLocalRepoTriage,
  shouldEnqueueRepoTriage
} = require("../lib/qa-repo-triage");

test("buildInitialRepoTriageState keeps disabled runs blind by default", () => {
  const state = buildInitialRepoTriageState({
    metadata: {}
  });

  assert.equal(state.enabled, false);
  assert.equal(state.status, "disabled");
});

test("shouldEnqueueRepoTriage only queues enabled high-signal runs", () => {
  const decision = shouldEnqueueRepoTriage(
    {
      findings: [
        {
          id: "finding_bug_1",
          type: "bug",
          title: "Signup redirects back to login",
          observed_behavior: "After submit, the flow jumps back to login.",
          evidence: {
            network_logs: ["POST /api/signup -> 302 /login"]
          }
        }
      ]
    },
    {
      metadata: {
        repo_triage: {
          enabled: true,
          repo: "acme/web"
        }
      }
    }
  );

  assert.equal(decision.shouldQueue, true);
  assert.equal(decision.config.enabled, true);
  assert.deepEqual(decision.signalTypes, ["bug"]);
});

test("runLocalRepoTriage maps a blocker to likely files in the workspace", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qa-repo-triage-"));
  const appDir = path.join(repoRoot, "apps", "web");
  fs.mkdirSync(path.join(appDir, "src", "auth"), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "src", "auth", "signup.js"),
    [
      "export async function submitSignup() {",
      "  const response = await fetch('/api/signup');",
      "  return redirectToDashboard(response);",
      "}"
    ].join("\n")
  );

  const triage = runLocalRepoTriage({
    repoRoot,
    repoTriage: {
      enabled: true,
      repo: "acme/web",
      path_allowlist: ["apps/web/src"]
    },
    report: {
      findings: [
        {
          id: "finding_bug_1",
          type: "bug",
          title: "Signup redirects back to login",
          observed_behavior: "After submit, the signup flow returns to login instead of the app.",
          diagnostic_details: {
            current_url: "https://acme.example/signup"
          },
          evidence: {
            network_logs: ["POST /api/signup -> 302 /login"]
          }
        }
      ]
    },
    runRequest: {
      metadata: {
        repo_triage: {
          enabled: true,
          repo: "acme/web"
        }
      }
    }
  });

  assert.equal(triage.repo_label, "acme/web");
  assert.equal(Array.isArray(triage.per_finding), true);
  assert.equal(triage.per_finding.length, 1);
  assert.match(triage.per_finding[0].suspected_files[0], /apps\/web\/src\/auth\/signup\.js/);
});
