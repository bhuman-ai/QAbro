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

test("completed human reports wait for recording analysis and link findings to evidence", () => {
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
  assert.match(report, /analysisComplete \? \(/);
  assert.match(report, /disabled=\{!analysisComplete\}/);
  assert.match(report, /Preparing report/);
  assert.match(app, /session\.findings_analysis\?\.findings/);
  assert.match(app, /Watch Part \{partNumber\} at/);
  assert.match(app, /Created only from the video and speech transcript/);
  assert.match(report, /Raw transcript/);
  assert.match(report, /analysisComplete \? collectManualQaTranscriptEvents\(session\) : \[\]/);
  assert.match(report, /This note is not used to create the findings above/);
  assert.match(app, /session\.findings_analysis\?\.clip_results/);
  assert.match(app, /source: "server_recording_analysis"/);
  assert.match(app, /getManualQaEvidenceUrl\(undefined/);
  assert.match(app, /\/api\/manual-qa\/analyze-recording/);
  assert.doesNotMatch(app, /Draft findings from the captured note and evidence/);
  assert.doesNotMatch(app, /const packets = \(session\.work_packets \|\| \[\]\)/);
  assert.match(app, /retryExhausted/);
  assert.match(app, /Preparing the report…/);
  assert.doesNotMatch(report, /Waiting for the tester’s permission|Analyze video/);
});

test("trial recorder requires one mixed microphone track and resumes after the highest saved part", () => {
  const portal = fs.readFileSync(path.join(ROOT, "src", "QaTrialPortal.tsx"), "utf8");
  const uploadEndpoint = fs.readFileSync(path.join(ROOT, "api", "manual-qa", "widget-evidence-chunks.js"), "utf8");

  assert.match(portal, /duration_ms: durationMs/);
  assert.match(portal, /use AI to make a transcript and report/);
  assert.match(portal, /the AI provider does not keep them/);
  assert.match(portal, /recordingExtension\(contentType\)/);
  assert.match(portal, /The report is created automatically/);
  assert.doesNotMatch(portal, /accept_analysis|One permission needed|Allow analysis of my recording/);
  assert.match(portal, /recorder\.start\(\);/);
  assert.doesNotMatch(portal, /recorder\.start\(1000\)/);
  assert.doesNotMatch(portal, /private to this trial/);
  assert.match(portal, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(portal, /Microphone access is required/);
  assert.match(portal, /!microphoneTracks\.some\(\(track\) => track\.readyState === "live"\)/);
  assert.match(portal, /createMediaStreamDestination\(\)/);
  assert.match(portal, /createMediaStreamSource\(new MediaStream\(\[track\]\)\)/);
  assert.match(portal, /new MediaStream\(\[\.\.\.displayVideoTracks, mixedAudioTrack\]\)/);
  assert.doesNotMatch(portal, /\.\.\.display\.getAudioTracks\(\),/);
  assert.match(portal, /segmentIndexRef\.current = nextRecordingSegmentIndex\(started\.submission\.evidence_media\)/);
  assert.match(portal, /return Math\.max\(highest, recordingPartNumber\(entry\)\)/);
  assert.match(portal, /releaseRecordingResources\(\)/);
  assert.match(portal, /sourceStreamsRef\.current\.forEach/);
  assert.match(portal, /audioContext\.close\(\)/);
  assert.match(uploadEndpoint, /duration_ms: durationMs/);
});
