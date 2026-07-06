const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildCodingAgentQaInput,
  buildQaResourceUri,
  buildQaRunRequest,
  createQaApiClient,
  createQaResourceReaders,
  selectManualFeedbackPackage,
  summarizeManualDraftEvidence,
  summarizeCodingAgentQaOutcome
} = require("../lib/qa-mcp");
const { readQaMcpStoredAuth, writeQaMcpStoredAuth } = require("../lib/qa-mcp-auth");
const {
  buildAutomatedQaActionText,
  buildAutomatedQaRequiredAction,
  buildManualFeedbackActionText,
  buildManualFeedbackRequiredAction,
  buildManualReviewNeedsInputResult,
  buildManualReviewWorkflowText
} = require("../scripts/qa-mcp-server");

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("buildQaRunRequest creates a feature-targeted signup-aware run request", () => {
  const runRequest = buildQaRunRequest(
    {
      target_url: "https://preview.example.com/signup",
      feature_name: "signup flow",
      task_to_try: "Create a new account and reach the dashboard",
      expected_success: "The tester ends up in the logged-in product",
      persona: "A busy growth marketer evaluating the product for the first time."
    },
    {
      defaultBrand: "example.com"
    }
  );

  assert.equal(runRequest.target_url, "https://preview.example.com/signup");
  assert.equal(runRequest.scope_mode, "feature_targeted");
  assert.equal(runRequest.metadata.brand_key, "example.com");
  assert.equal(runRequest.metadata.auth_policy, "signup_if_needed");
  assert.match(runRequest.scenario_list[0], /signup flow/i);
  assert.match(runRequest.scenario_list.join(" "), /logged-in product/i);
});

test("buildQaRunRequest preserves new account requirement for worker profile isolation", () => {
  const runRequest = buildQaRunRequest({
    target_url: "https://databoss.us/customer/register",
    brand: "databoss",
    task_to_try: "Create a new account",
    new_account_required: true
  });

  assert.equal(runRequest.metadata.auth_policy, "signup_if_needed");
  assert.equal(runRequest.metadata.new_account_required, true);
});

test("buildCodingAgentQaInput maps implementation context into run scenarios and metadata", () => {
  const agentInput = buildCodingAgentQaInput({
    target_url: "https://preview.example.com",
    work_summary: "Added the checkout discount field",
    scenario_list: ["Customer instruction: sign up with a phone number and confirm the discount field works."],
    changed_files: ["src/Checkout.tsx", "src/api/discounts.ts"],
    acceptance_criteria: ["Customer can apply a valid discount", "Invalid codes show a useful error"],
    repository: "acme/shop",
    branch: "feature/discounts",
    commit_sha: "abc123",
    pull_request_url: "https://github.com/acme/shop/pull/42"
  });

  const runRequest = buildQaRunRequest(agentInput, { defaultBrand: "acme" });

  assert.equal(agentInput.feature_name, "Added the checkout discount field");
  assert.equal(
    agentInput.scenario_list[0],
    "Customer instruction: sign up with a phone number and confirm the discount field works."
  );
  assert.match(runRequest.scenario_list[0], /Customer instruction/i);
  assert.match(runRequest.scenario_list.join(" "), /checkout discount/i);
  assert.match(runRequest.scenario_list.join(" "), /src\/Checkout\.tsx/);
  assert.equal(runRequest.metadata.caller_kind, "coding_agent");
  assert.equal(runRequest.metadata.instruction_priority, "customer_first");
  assert.equal(runRequest.metadata.customer_scenario_count, 1);
  assert.equal(runRequest.metadata.repository, "acme/shop");
  assert.deepEqual(runRequest.metadata.acceptance_criteria, [
    "Customer can apply a valid discount",
    "Invalid codes show a useful error"
  ]);
});

test("summarizeCodingAgentQaOutcome returns pass, needs_fix, and timed_out verdicts", () => {
  const pass = summarizeCodingAgentQaOutcome({
    reportPayload: {
      status: "completed",
      summary: { note: "Main flow worked." },
      findings: []
    }
  });
  assert.equal(pass.verdict, "pass");
  assert.equal(pass.pass, true);

  const needsFix = summarizeCodingAgentQaOutcome({
    reportPayload: {
      status: "partial",
      summary: { note: "The tester hit a blocker." },
      findings: [
        {
          title: "Checkout submit does not advance",
          severity: "high",
          observed_behavior: "Clicking Pay keeps the user on the same step."
        }
      ]
    }
  });
  assert.equal(needsFix.verdict, "needs_fix");
  assert.equal(needsFix.pass, false);
  assert.equal(needsFix.top_finding.title, "Checkout submit does not advance");

  const timedOut = summarizeCodingAgentQaOutcome({
    waitResult: {
      timed_out: true,
      status: {
        report_status: "processing"
      }
    }
  });
  assert.equal(timedOut.verdict, "timed_out");
  assert.equal(timedOut.pass, false);
});

test("qa MCP client requestRun sends service token and owner headers", async () => {
  const calls = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse({
        ok: true,
        queued: true,
        run_id: "run_123",
        report_url: "https://swarmtester.com/api/qa/report?run_id=run_123",
        status_url: "https://swarmtester.com/api/qa/status?run_id=run_123",
        ui_report_url: "https://swarmtester.com/dashboard?view=report&run_id=run_123"
      });
    }
  });

  const response = await client.requestRun({
    target_url: "https://example.com",
    task_to_try: "Create the first project"
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["x-qa-service-token"], "svc_123");
  assert.equal(calls[0].options.headers["x-owner-user-id"], "user_123");
  assert.equal(calls[0].options.headers["x-owner-email"], "owner@example.com");
});

test("qa MCP client waitForRun polls until the report is ready and emits onPoll", async () => {
  const pollStates = [
    {
      ok: true,
      run_id: "run_wait",
      report_ready: false,
      report_status: "processing",
      queue: { status: "processing" }
    },
    {
      ok: true,
      run_id: "run_wait",
      report_ready: true,
      report_status: "partial",
      queue: { status: "completed" }
    }
  ];

  let index = 0;
  const observed = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async () => createJsonResponse(pollStates[index++])
  });

  const result = await client.waitForRun("run_wait", {
    timeout_seconds: 5,
    poll_interval_seconds: 0.001,
    onPoll(status, meta) {
      observed.push({ status: status.report_status, poll_count: meta.poll_count });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.timed_out, false);
  assert.equal(result.status.report_status, "partial");
  assert.deepEqual(observed, [
    { status: "processing", poll_count: 1 },
    { status: "partial", poll_count: 2 }
  ]);
});

test("qa MCP client waitForManualFeedback returns feedback package after Send All", async () => {
  const states = [
    {
      ok: true,
      session: {
        session_id: "manual_wait",
        agent_feedback: { ready: false, latest: null, packages: [] }
      }
    },
    {
      ok: true,
      session: {
        session_id: "manual_wait",
        agent_feedback: {
          ready: true,
          latest: {
            feedback_id: "feedback_1",
            scope: "all",
            markdown: "# BeforeUsersDo Manual QA Feedback\n\nLooks good.",
            generated_at: "2026-07-02T00:00:00.000Z"
          },
          packages: [
            {
              feedback_id: "feedback_1",
              scope: "all",
              markdown: "# BeforeUsersDo Manual QA Feedback\n\nLooks good.",
              generated_at: "2026-07-02T00:00:00.000Z"
            }
          ]
        }
      }
    }
  ];

  let index = 0;
  const observed = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async () => createJsonResponse(states[Math.min(index++, states.length - 1)])
  });

  const result = await client.waitForManualFeedback("manual_wait", {
    timeout_seconds: 5,
    poll_interval_seconds: 0.001,
    onPoll(_status, meta) {
      observed.push({ poll_count: meta.poll_count, feedback_ready: meta.feedback_ready });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.feedback_ready, true);
  assert.equal(result.timed_out, false);
  assert.equal(result.feedback.feedback_id, "feedback_1");
  assert.match(result.feedback.markdown, /Looks good/);
  assert.deepEqual(observed, [
    { poll_count: 1, feedback_ready: false },
    { poll_count: 2, feedback_ready: true }
  ]);
});

test("summarizeManualDraftEvidence returns compact live evidence links", () => {
  const summary = summarizeManualDraftEvidence({
    session_id: "manual_live",
    review_mode: "freestyle",
    checklist: [
      {
        id: "freestyle",
        title: "Freestyle capture",
        evidence_urls: [
          "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_live&item_id=freestyle&index=0"
        ],
        evidence_media: [
          {
            kind: "video",
            label: "Video recording segment 1",
            content_type: "video/webm",
            byte_length: 123,
            url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_live&item_id=freestyle&index=0",
            created_at: "2026-07-04T18:00:00.000Z"
          },
          {
            kind: "screenshot",
            label: "Drawing annotation",
            content_type: "image/png",
            byte_length: 456,
            url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_live&item_id=freestyle&index=1",
            created_at: "2026-07-04T18:00:10.000Z"
          }
        ]
      }
    ]
  });

  assert.equal(summary.ready, true);
  assert.equal(summary.total_count, 2);
  assert.equal(summary.video_count, 1);
  assert.equal(summary.video_segment_count, 1);
  assert.equal(summary.drawing_count, 1);
  assert.equal(summary.link_count, 0);
  assert.equal(summary.latest_evidence[0].label, "Drawing annotation");
  assert.equal(summary.latest_evidence[1].label, "Video recording segment 1");
});

test("qa MCP client waitForManualEvidence returns draft evidence before Send All", async () => {
  const states = [
    {
      ok: true,
      session: {
        session_id: "manual_live",
        checklist: [{ id: "freestyle", title: "Freestyle", evidence_media: [] }],
        agent_feedback: { ready: false, latest: null, packages: [] }
      }
    },
    {
      ok: true,
      session: {
        session_id: "manual_live",
        checklist: [
          {
            id: "freestyle",
            title: "Freestyle",
            evidence_media: [
              {
                kind: "video",
                label: "Video recording segment 1",
                content_type: "video/webm",
                byte_length: 100,
                url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_live&item_id=freestyle&index=0",
                created_at: "2026-07-04T18:00:00.000Z"
              }
            ]
          }
        ],
        agent_feedback: { ready: false, latest: null, packages: [] }
      }
    }
  ];

  let index = 0;
  const observed = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async () => createJsonResponse(states[Math.min(index++, states.length - 1)])
  });

  const result = await client.waitForManualEvidence("manual_live", {
    timeout_seconds: 5,
    poll_interval_seconds: 0.001,
    onPoll(_status, meta) {
      observed.push({
        poll_count: meta.poll_count,
        evidence_ready: meta.evidence_ready,
        evidence_count: meta.evidence_count,
        video_segment_count: meta.video_segment_count
      });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.evidence_ready, true);
  assert.equal(result.timed_out, false);
  assert.equal(result.draft_evidence.total_count, 1);
  assert.equal(result.draft_evidence.video_segment_count, 1);
  assert.equal(result.draft_evidence.latest_evidence[0].label, "Video recording segment 1");
  assert.deepEqual(observed, [
    { poll_count: 1, evidence_ready: false, evidence_count: 0, video_segment_count: 0 },
    { poll_count: 2, evidence_ready: true, evidence_count: 1, video_segment_count: 1 }
  ]);
});

test("qa MCP client returns manual work packets from the session", async () => {
  const calls = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse({
        ok: true,
        session: {
          session_id: "manual_packets",
          work_packets: [
            {
              packet_id: "packet_1",
              title: "Hero feels wrong",
              suggested_owner: "frontend_or_product",
              page_anchor: { url: "https://preview.example.com/" },
              agent_task: "Fix the hero copy."
            }
          ]
        }
      });
    }
  });

  const result = await client.getManualQaWorkPackets("manual_packets");

  assert.equal(result.ok, true);
  assert.equal(result.session_id, "manual_packets");
  assert.equal(result.work_packets.length, 1);
  assert.equal(result.work_packets[0].packet_id, "packet_1");
  assert.equal(new URL(calls[0].url).pathname, "/api/manual-qa/sessions");
});

test("selectManualFeedbackPackage can filter all, item, and any scopes", () => {
  const session = {
    agent_feedback: {
      packages: [
        { feedback_id: "item_1", scope: "item", item_id: "hero", markdown: "Hero note" },
        { feedback_id: "all_1", scope: "all", markdown: "All feedback" }
      ]
    }
  };

  assert.equal(selectManualFeedbackPackage(session, { scope: "all" }).feedback_id, "all_1");
  assert.equal(selectManualFeedbackPackage(session, { scope: "item", item_id: "hero" }).feedback_id, "item_1");
  assert.equal(selectManualFeedbackPackage(session, { scope: "any" }).feedback_id, "all_1");
  assert.equal(selectManualFeedbackPackage(session, { scope: "item", item_id: "missing" }), null);
});

test("qa MCP resource readers expose status, report, and markdown resources", async () => {
  const readers = createQaResourceReaders({
    async getRunStatus(runId) {
      assert.equal(runId, "run_456");
      return {
        ok: true,
        run_id: runId,
        report_ready: true,
        report_status: "completed",
        queue: { status: "completed" }
      };
    },
    async getRunReport(runId) {
      assert.equal(runId, "run_456");
      return {
        ok: true,
        run_id: runId,
        status: "completed",
        summary: { note: "The tester completed the main flow." },
        findings: [{ title: "No blocker", observed_behavior: "The feature worked." }],
        markdown: "# Report\n\nEverything worked."
      };
    },
    async getManualQaSession(sessionId) {
      assert.equal(sessionId, "manual_123");
      return {
        ok: true,
        session: {
          session_id: sessionId,
          checklist: [
            {
              id: "freestyle",
              title: "Freestyle",
              evidence_media: [
                {
                  kind: "video",
                  label: "Video recording segment 1",
                  content_type: "video/webm",
                  url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_123&item_id=freestyle&index=0",
                  created_at: "2026-07-04T18:00:00.000Z"
                }
              ]
            }
          ]
        }
      };
    }
  });

  const statusResource = await readers.readRunStatus("run_456");
  const reportResource = await readers.readRunReport("run_456");
  const markdownResource = await readers.readRunReportMarkdown("run_456");
  const liveEvidenceResource = await readers.readManualQaLiveEvidence("manual_123");

  assert.equal(statusResource.uri, "qa://runs/run_456/status");
  assert.equal(statusResource.mimeType, "application/json");
  assert.match(statusResource.text, /"report_status": "completed"/);

  assert.equal(reportResource.uri, "qa://runs/run_456/report");
  assert.equal(reportResource.mimeType, "application/json");
  assert.match(reportResource.text, /The tester completed the main flow/);

  assert.equal(markdownResource.uri, "qa://runs/run_456/report.md");
  assert.equal(markdownResource.mimeType, "text/markdown");
  assert.match(markdownResource.text, /^# Report/m);

  assert.equal(liveEvidenceResource.uri, "qa://manual/manual_123/evidence.json");
  assert.equal(liveEvidenceResource.mimeType, "application/json");
  assert.match(liveEvidenceResource.text, /Video recording segment 1/);
});

test("buildQaResourceUri encodes dynamic run ids", () => {
  assert.equal(buildQaResourceUri("run_status", "run id/with spaces"), "qa://runs/run%20id%2Fwith%20spaces/status");
  assert.equal(buildQaResourceUri("run_report", "run id/with spaces"), "qa://runs/run%20id%2Fwith%20spaces/report");
  assert.equal(buildQaResourceUri("run_report_markdown", "run id/with spaces"), "qa://runs/run%20id%2Fwith%20spaces/report.md");
  assert.equal(buildQaResourceUri("manual_review_workflow", "ignored"), "qa://workflows/manual-review");
  assert.equal(buildQaResourceUri("manual_qa_live_evidence", "manual id"), "qa://manual/manual%20id/evidence.json");
  assert.equal(buildQaResourceUri("manual_qa_report_markdown", "manual id"), "qa://manual/manual%20id/report.md");
});

test("manual review workflow tells agents what context to gather", () => {
  const text = buildManualReviewWorkflowText({
    target_url: "https://preview.example.com",
    work_summary: "Changed onboarding cards."
  });

  assert.match(text, /manual review/i);
  assert.match(text, /qa_start_manual_review/);
  assert.match(text, /changed files/i);
  assert.match(text, /acceptance criteria/i);
  assert.match(text, /review_mode: "freestyle"/);
  assert.match(text, /widget_install\.script_tag/i);
  assert.match(text, /required, not optional/i);
  assert.match(text, /Do not tell the user to open the target page until the widget is verified/i);
  assert.match(text, /widget_install\.review_url/i);
  assert.match(text, /Do not send the BeforeUsersDo dashboard as the place to start testing/i);
  assert.match(text, /qa_wait_for_manual_evidence/);
  assert.match(text, /evidence\.json/);
  assert.match(text, /qa_wait_for_manual_feedback/);
  assert.match(text, /qa_get_manual_work_packets/);
  assert.match(text, /without copy\/paste/i);
  assert.match(text, /keep the agent turn open/i);
  assert.match(text, /do not stop after giving the link/i);
  assert.match(text, /Obey the session's `feedback_action`/i);
  assert.match(text, /`share_feedback_and_start_work`: share feedback with the agent/i);
  assert.match(text, /`preview_fix_first`: share feedback with the agent/i);
  assert.match(text, /`share_feedback`: share feedback with the agent for summary\/reporting/i);
  assert.match(text, /https:\/\/preview\.example\.com/);
});

test("manual feedback action contract defaults to fix-deploy-new-QA loop", () => {
  const action = buildManualFeedbackRequiredAction("manual_123", {
    feedback_id: "feedback_123",
    scope: "item",
    item_id: "hero-copy"
  });
  const text = buildManualFeedbackActionText("manual_123", {
    feedback_id: "feedback_123",
    scope: "item",
    item_id: "hero-copy"
  });

  assert.equal(action.required, true);
  assert.equal(action.status, "fix_or_explain_before_done");
  assert.equal(action.agent_action_mode, "fix_and_retest");
  assert.equal(action.feedback_action, "share_feedback_and_start_work");
  assert.equal(action.auto_start_work, true);
  assert.equal(action.next_tool_after_fix, "qa_start_manual_review");
  assert.match(action.completion_rule, /fresh BeforeUsersDo QA link/);
  assert.match(action.steps.join(" "), /Update the target code\/product instead of only summarizing/);
  assert.match(action.steps.join(" "), /qa_get_manual_work_packets/);
  assert.match(action.steps.join(" "), /Deploy or refresh/);
  assert.match(text, /REQUIRED NEXT STEPS FOR THE CODING AGENT/);
  assert.match(text, /Mode: share feedback and auto-start work/);
  assert.match(text, /Create a fresh BeforeUsersDo QA link or rerun the relevant QA tool/);
});

test("manual feedback action contract can be report-only", () => {
  const action = buildManualFeedbackRequiredAction(
    "manual_123",
    { feedback_id: "feedback_123", scope: "all" },
    { feedback_action: "share_feedback" }
  );
  const text = buildManualFeedbackActionText(
    "manual_123",
    { feedback_id: "feedback_123", scope: "all" },
    { feedback_action: "share_feedback" }
  );

  assert.equal(action.status, "report_only");
  assert.equal(action.agent_action_mode, "report_only");
  assert.equal(action.feedback_action, "share_feedback");
  assert.equal(action.auto_start_work, false);
  assert.match(action.completion_rule, /Do not start code changes/);
  assert.match(text, /Mode: share feedback only/);
  assert.match(text, /Do not edit code/);
});

test("manual feedback action contract can require preview before work", () => {
  const action = buildManualFeedbackRequiredAction(
    "manual_123",
    { feedback_id: "feedback_123", scope: "all" },
    { feedback_action: "preview_fix_first" }
  );
  const text = buildManualFeedbackActionText(
    "manual_123",
    { feedback_id: "feedback_123", scope: "all" },
    { feedback_action: "preview_fix_first" }
  );

  assert.equal(action.status, "preview_required_before_work");
  assert.equal(action.agent_action_mode, "preview_then_fix");
  assert.equal(action.feedback_action, "preview_fix_first");
  assert.equal(action.auto_start_work, false);
  assert.match(action.completion_rule, /simulated future-state preview/);
  assert.match(action.steps.join(" "), /Ask the user to confirm or correct/);
  assert.match(action.steps.join(" "), /qa_get_manual_work_packets/);
  assert.match(text, /Mode: preview fix first/);
  assert.match(text, /Simulate the intended result before code changes/);
});

test("automated QA action contract defaults to report-only and can opt into fix-and-retest", () => {
  const reportOnly = buildAutomatedQaRequiredAction("run_123", {
    verdict: "needs_fix"
  });
  const previewFirst = buildAutomatedQaRequiredAction(
    "run_123",
    { verdict: "needs_fix" },
    { feedback_action: "preview_fix_first" }
  );
  const fixAndRetest = buildAutomatedQaRequiredAction(
    "run_123",
    { verdict: "needs_fix" },
    { feedback_action: "share_feedback_and_start_work" }
  );
  const text = buildAutomatedQaActionText("run_123", { verdict: "needs_fix" });

  assert.equal(reportOnly.source, "automated_qa");
  assert.equal(reportOnly.status, "report_only");
  assert.equal(reportOnly.agent_action_mode, "report_only");
  assert.equal(reportOnly.feedback_action, "share_feedback");
  assert.equal(reportOnly.auto_start_work, false);
  assert.match(reportOnly.completion_rule, /unless the user explicitly asks/);
  assert.equal(previewFirst.status, "preview_required_before_work");
  assert.equal(previewFirst.agent_action_mode, "preview_then_fix");
  assert.equal(previewFirst.feedback_action, "preview_fix_first");
  assert.equal(previewFirst.auto_start_work, false);
  assert.equal(fixAndRetest.status, "fix_or_explain_before_done");
  assert.equal(fixAndRetest.feedback_action, "share_feedback_and_start_work");
  assert.equal(fixAndRetest.auto_start_work, true);
  assert.match(fixAndRetest.completion_rule, /fix the target work/);
  assert.match(text, /Mode: share feedback only/);
});

test("manual review missing-input result asks only for target_url", () => {
  const result = buildManualReviewNeedsInputResult({});

  assert.equal(result.structuredContent.needs_input, true);
  assert.deepEqual(result.structuredContent.missing_fields, ["target_url"]);
  assert.equal(result.structuredContent.recommended_tool, "qa_start_manual_review");
  assert.match(result.content[0].text, /target URL/i);
});

test("qa MCP client loads stored dashboard auth and sends dashboard token headers", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-mcp-auth-"));
  const authPath = path.join(tempDir, "qa-mcp-auth.json");
  writeQaMcpStoredAuth(
    {
      base_url: "https://swarmtester.com",
      access_token: "access_saved_123",
      refresh_token: "refresh_saved_123",
      owner_user_id: "user_saved_123",
      owner_email: "saved@example.com"
    },
    { authPath }
  );

  const calls = [];
  const client = createQaApiClient({
    baseUrl: "https://swarmtester.com",
    authPath,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse({
        ok: true,
        user: {
          id: "user_saved_123",
          email: "saved@example.com"
        }
      });
    }
  });

  const response = await client.getDashboardSession();
  const stored = readQaMcpStoredAuth({ authPath });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["x-dashboard-access-token"], "access_saved_123");
  assert.equal(calls[0].options.headers["x-dashboard-refresh-token"], "refresh_saved_123");
  assert.equal(stored.ok, true);
  assert.equal(stored.auth.owner_email, "saved@example.com");
});

test("qa MCP client can submit a manual preview proposal", async () => {
  const calls = [];
  const client = createQaApiClient({
    baseUrl: "https://beforeusersdo.com",
    serviceToken: "service_123",
    ownerUserId: "user_123",
    ownerEmail: "owner@example.com",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse({
        ok: true,
        session_id: "manual_123",
        preview_proposal: {
          proposal_id: "preview_123",
          status: "draft",
          title: "Cleaner hero"
        }
      });
    }
  });

  const response = await client.submitManualPreviewProposal("manual_123", {
    title: "Cleaner hero",
    summary: "Make the install path obvious.",
    changes: ["Make MCP primary.", "Keep proof visible."]
  });

  assert.equal(response.ok, true);
  assert.equal(response.preview_proposal.title, "Cleaner hero");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/api/manual-qa/preview-proposal");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["x-qa-service-token"], "service_123");
  assert.equal(calls[0].options.headers["x-owner-user-id"], "user_123");
  assert.equal(calls[0].options.headers["x-owner-email"], "owner@example.com");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    session_id: "manual_123",
    proposal: {
      title: "Cleaner hero",
      summary: "Make the install path obvious.",
      changes: ["Make MCP primary.", "Keep proof visible."]
    }
  });
});
