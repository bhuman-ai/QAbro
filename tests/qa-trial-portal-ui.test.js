const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(ROOT, "src", "QaTrialPortal.tsx"), "utf8");
const types = fs.readFileSync(path.join(ROOT, "src", "types.ts"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

test("buyer trial view shows the completed recording report as the primary view", () => {
  const report = portal.slice(portal.indexOf("function BuyerReport"), portal.indexOf("function TrialLogo"));

  assert.match(types, /report\?: \{/);
  assert.match(types, /findings: ManualQaRecordingFinding\[\]/);
  assert.match(report, /trial\.report\?\.findings/);
  assert.match(report, />Problems</);
  assert.match(report, />What worked</);
  assert.match(report, />Suggested fixes</);
  assert.match(report, /More observations \(\{observations\.length\}\)/);
  assert.match(report, /Created only from the tester&apos;s video and speech transcript/);
  assert.match(report, /support_verified !== false/);
});

test("buyer evidence links select the matching recording and timestamp", () => {
  assert.match(portal, /entry\.evidence_id === evidenceId/);
  assert.match(portal, /recordingPartNumber\(entry\) === partNumber/);
  assert.match(portal, /url\.hash = `t=\$\{/);
  assert.match(portal, /Watch part \{partNumber\} at \{formatEvidenceTime\(anchor\.start_ms\)\}/);
});

test("buyer waits for analysis and secondary raw material stays collapsed", () => {
  assert.match(portal, /const reportComplete = trial\.report\?\.status === "complete"/);
  assert.match(portal, /title="Preparing your report…"/);
  assert.match(portal, /title="We couldn't analyze the recording\."/);
  assert.match(portal, /const reportFailed = trial\.report\?\.status === "failed"/);
  assert.match(portal, /Tester&apos;s extra note/);
  assert.match(portal, /All recordings \(\{videoEvidence\.length\}\)/);
  assert.match(portal, /trial\.role === "lead" && reportComplete && !trial\.lead_rating\.score/);
  assert.match(portal, /!showBuyerReport \? \(/);
  assert.doesNotMatch(portal, /<h2 className="text-xl font-black">Recordings<\/h2>/);
});

test("private buyer report links do not leak through caches, referrers, or search indexing", () => {
  const trialHeaders = vercel.headers.find((entry) => entry.source === "/trial")?.headers || [];
  const byName = Object.fromEntries(trialHeaders.map((entry) => [entry.key.toLowerCase(), entry.value]));
  assert.match(byName["cache-control"], /private/);
  assert.match(byName["cache-control"], /no-store/);
  assert.equal(byName["referrer-policy"], "no-referrer");
  assert.match(byName["x-robots-tag"], /noindex/);
});
