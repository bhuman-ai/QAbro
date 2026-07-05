#!/usr/bin/env node

const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const pkg = require("../package.json");
const {
  MCP_QA_RESOURCE_TEMPLATES,
  buildCodingAgentQaInput,
  createQaResourceReaders,
  createQaApiClient,
  summarizeCodingAgentQaOutcome,
  summarizeManualDraftEvidence,
  summarizeReportPayload,
  summarizeStatusPayload
} = require("../lib/qa-mcp");

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function makeToolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

function makeToolError(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const status = Number(error?.status) || null;
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : null;
  return {
    content: [
      {
        type: "text",
        text: buildText([
          `Error: ${message}`,
          status ? `HTTP status: ${status}` : "",
          payload ? formatJson(payload) : ""
        ])
      }
    ],
    structuredContent: {
      ok: false,
      error: message,
      status,
      payload
    },
    isError: true
  };
}

function buildText(lines) {
  return lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join("\n");
}

function safeText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

const AGENT_ACTION_MODES = new Set(["report_only", "fix_and_retest"]);

function normalizeAgentActionMode(input = {}, fallback = "report_only") {
  const explicit = safeText(
    input.feedback_action || input.feedbackAction || input.feedback_mode || input.feedbackMode || input.agent_action_mode || input.agentActionMode,
    80
  ).toLowerCase();
  if (AGENT_ACTION_MODES.has(explicit)) {
    return explicit;
  }
  if (["share_feedback", "share_only", "save_feedback", "save_only"].includes(explicit)) {
    return "report_only";
  }
  if (["share_feedback_and_start_work", "share_and_start_work", "auto_start_work", "start_work"].includes(explicit)) {
    return "fix_and_retest";
  }
  if (input.auto_start_work === true || input.autoStartWork === true) {
    return "fix_and_retest";
  }
  if (input.auto_start_work === false || input.autoStartWork === false) {
    return "report_only";
  }
  return AGENT_ACTION_MODES.has(fallback) ? fallback : "report_only";
}

function buildManualReviewWorkflowText(input = {}) {
  const targetUrl = safeText(input.target_url || input.targetUrl, 4096);
  const workSummary = safeText(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 4000);
  const featureName = safeText(input.feature_name || input.featureName || input.title, 240);

  return buildText([
    "# BeforeUsersDo Manual Review Workflow",
    "",
    "Use this whenever the user says they want a manual review, manual QA, human review, freestyle QA, or a BeforeUsersDo checklist for work you just changed.",
    "",
    "1. Gather the target URL.",
    "- Prefer the live preview URL the user gave you.",
    "- If you just deployed a preview, use that preview URL.",
    "- If no reachable URL exists, ask for one before creating the session.",
    "",
    "2. Gather implementation context automatically when available.",
    "- Include what changed in plain English.",
    "- Include changed files, branch, commit SHA, PR URL, repository, acceptance criteria, and any user instructions.",
    "- Do not leak tokens, secrets, private cookies, or credentials.",
    "",
    "3. Build the manual checklist.",
    "- Create explicit checklist items for each changed surface and acceptance criterion.",
    "- If an item starts deep in a flow, set the start URL/path and explain that the human may need to begin earlier if the app blocks deep links.",
    "- Keep checklist item titles human-readable.",
    "- If the user wants open-ended recording instead of checklist items, set `review_mode: \"freestyle\"` and skip `test_plan`.",
    "",
    "4. Call `qa_start_manual_review`.",
    "- Use `target_url`, `work_summary`, `changed_files`, `acceptance_criteria`, `scenario_list`, `review_mode`, and `test_plan` when you have them.",
    "- If the tool says `needs_input`, ask the user only for the missing fields.",
    "",
    "5. Install the page widget before you tell the user to open anything.",
    "- `widget_install.script_tag` is required, not optional.",
    "- Inject the exact script tag into the preview/dev build.",
    "- Deploy or refresh the preview, then open the target once yourself.",
    "- Verify `window.__beforeUsersDoWidgetLoaded === true` or `document.querySelector('#beforeusersdo-widget-root')`.",
    "- Do not tell the user to open the target page until the widget is verified.",
    "",
    "6. Return the result to the user.",
    "- Give `widget_install.review_url` as the primary link. This should open the preview page itself with the in-page widget.",
    "- Keep `manual_session_url` secondary as the report/dashboard link only.",
    "- Do not send the BeforeUsersDo dashboard as the place to start testing.",
    "- If the widget cannot be injected, stop and explain why. Do not fall back silently.",
    "- Tell the user to click the widget's Send All control when finished.",
    "- Optional: call `qa_wait_for_manual_evidence` while the user is still recording to see draft video segments and drawings as they are saved.",
    "- Then immediately call `qa_wait_for_manual_feedback` and keep the agent turn open for the user's final feedback package; do not stop after giving the link.",
    "",
    "7. After the human finishes.",
    "- Prefer `qa_wait_for_manual_feedback` so the user's Send All click returns directly to the agent without copy/paste.",
    "- Use `qa_wait_for_manual_evidence` or `qa://manual/{session_id}/evidence.json` for live draft evidence before Send All.",
    "- Use `qa_get_manual_report` only as a fallback or for historical export.",
    "- Obey the session's `feedback_action` setting.",
    "- `share_feedback_and_start_work`: share feedback with the agent, treat it as user instructions, fix the target product/code, run checks, deploy or refresh, then create a fresh QA link.",
    "- `share_feedback`: share feedback with the agent for summary/reporting, but do not edit or deploy unless the user explicitly asks you to start work.",
    "",
    targetUrl ? `Current target_url: ${targetUrl}` : "",
    featureName ? `Current feature_name: ${featureName}` : "",
    workSummary ? `Current work_summary: ${workSummary}` : ""
  ]);
}

function buildAgentActionContract({
  source = "qa",
  id = "",
  feedback = {},
  outcome = {},
  actionMode = "report_only",
  autoStartWork,
  nextToolAfterFix = "qa_start_manual_review"
} = {}) {
  const mode = normalizeAgentActionMode(
    {
      agent_action_mode: actionMode,
      auto_start_work: autoStartWork
    },
    "report_only"
  );
  const base = {
    required: true,
    source: safeText(source, 80) || "qa",
    id: safeText(id, 128) || null,
    feedback_id: safeText(feedback.feedback_id || feedback.feedbackId, 128) || null,
    verdict: safeText(outcome.verdict, 80) || null,
    scope: safeText(feedback.scope || "all", 40) || "all",
    item_id: safeText(feedback.item_id || feedback.itemId, 80) || null,
    agent_action_mode: mode,
    feedback_action: mode === "fix_and_retest" ? "share_feedback_and_start_work" : "share_feedback",
    auto_start_work: mode === "fix_and_retest",
    next_tool_after_fix: nextToolAfterFix
  };

  if (mode === "fix_and_retest") {
    return {
      ...base,
      status: "fix_or_explain_before_done",
      completion_rule:
        "Do not claim done after receiving this QA feedback. Extract the actionable points, fix the target work, verify, deploy or refresh the preview, then create a fresh BeforeUsersDo QA link or rerun QA.",
      steps: [
        "Read the full QA feedback and evidence links.",
        "Extract concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, network evidence, and report findings.",
        "Turn every actionable bug, copy issue, confusing UI, blocker, or requested change into implementation work.",
        "Update the target code/product instead of only summarizing the feedback.",
        "Run the relevant tests/build checks and record the result.",
        "Deploy or refresh the preview/production target the user should retest.",
        "Create a fresh BeforeUsersDo QA link or rerun the relevant QA tool for the fixed version.",
        "If any step is blocked, say exactly what is blocked and what is needed."
      ]
    };
  }

  return {
    ...base,
    status: "report_only",
    completion_rule:
      "Do not start code changes from this QA result unless the user explicitly asks you to start work or rerun with feedback_action=share_feedback_and_start_work.",
    steps: [
      "Read the full QA feedback and evidence links.",
      "Extract concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, network evidence, and report findings.",
      "Summarize what is wrong, what evidence supports it, and what you would fix first.",
      "Do not edit code, deploy, or create a replacement QA link unless the user asks you to start work.",
      "If the user asks you to start work, switch to fix-and-retest behavior: fix, verify, deploy or refresh, then create a fresh QA link or rerun QA."
    ]
  };
}

function buildManualFeedbackRequiredAction(sessionId, feedback = {}, options = {}) {
  const safeSessionId = safeText(sessionId, 128);
  return {
    ...buildAgentActionContract({
      source: "manual_qa",
      id: safeSessionId,
      feedback,
      actionMode: options.feedback_action || options.feedbackAction || options.feedback_mode || options.feedbackMode || options.agent_action_mode || options.agentActionMode || "fix_and_retest",
      autoStartWork: options.auto_start_work ?? options.autoStartWork,
      nextToolAfterFix: "qa_start_manual_review"
    }),
    session_id: safeSessionId || null,
    next_tool_after_fix: "qa_start_manual_review"
  };
}

function buildAgentActionText(action) {
  const modeLine =
    action.agent_action_mode === "fix_and_retest"
      ? "Mode: share feedback and auto-start work."
      : "Mode: share feedback only. Do not start code changes yet.";
  return buildText([
    "REQUIRED NEXT STEPS FOR THE CODING AGENT:",
    modeLine,
    ...action.steps.map((step, index) => `${index + 1}. ${step}`),
    `Completion rule: ${action.completion_rule}`
  ]);
}

function buildManualFeedbackActionText(sessionId, feedback = {}, options = {}) {
  return buildAgentActionText(buildManualFeedbackRequiredAction(sessionId, feedback, options));
}

function buildAutomatedQaRequiredAction(runId, outcome = {}, options = {}) {
  return {
    ...buildAgentActionContract({
      source: "automated_qa",
      id: runId,
      outcome,
      actionMode: options.feedback_action || options.feedbackAction || options.feedback_mode || options.feedbackMode || options.agent_action_mode || options.agentActionMode || options.action_mode || "report_only",
      autoStartWork: options.auto_start_work ?? options.autoStartWork,
      nextToolAfterFix: "qa_check_work"
    }),
    run_id: safeText(runId, 128) || null,
    next_tool_after_fix: "qa_check_work"
  };
}

function buildAutomatedQaActionText(runId, outcome = {}, options = {}) {
  return buildAgentActionText(buildAutomatedQaRequiredAction(runId, outcome, options));
}

function shouldReturnQaAction(outcome = {}) {
  return outcome && outcome.pass !== true;
}

function buildManualReviewNeedsInputResult(input = {}) {
  const targetUrl = safeText(input.target_url || input.targetUrl, 4096);
  if (targetUrl) {
    return null;
  }

  const result = {
    ok: false,
    needs_input: true,
    missing_fields: ["target_url"],
    prompt: "I can start a BeforeUsersDo manual review. Send me the preview/staging/production URL you want reviewed.",
    recommended_tool: "qa_start_manual_review",
    workflow_prompt: "manual_review_workflow",
    workflow_resource: MCP_QA_RESOURCE_TEMPLATES.manual_review_workflow,
    optional_context_to_collect: [
      "work_summary",
      "changed_files",
      "acceptance_criteria",
      "scenario_list",
      "review_mode",
      "test_plan",
      "repository",
      "branch",
      "commit_sha",
      "pull_request_url"
    ]
  };

  return makeToolResult(
    buildText([
      "BeforeUsersDo manual review needs a target URL.",
      result.prompt,
      "If you just deployed a preview, call this tool again with that preview URL and the work summary."
    ]),
    result
  );
}

function buildRequestedRunText(payload) {
  return buildText([
    `Queued QA run ${payload.run_id}.`,
    payload.run_request?.target_url ? `Target: ${payload.run_request.target_url}` : "",
    payload.ui_report_url ? `Open report: ${payload.ui_report_url}` : "",
    payload.status_url ? `Status API: ${payload.status_url}` : ""
  ]);
}

function buildStatusText(payload) {
  const summary = summarizeStatusPayload(payload);
  return buildText([
    `Run ${summary.run_id || "unknown"} status: ${summary.report_status || summary.queue_status || "processing"}.`,
    summary.progress ? `Progress: ${formatJson(summary.progress)}` : "",
    summary.latest_frame_url ? `Latest frame: ${summary.latest_frame_url}` : "",
    summary.ui_report_url ? `Open report: ${summary.ui_report_url}` : ""
  ]);
}

function buildReportText(payload) {
  const summary = summarizeReportPayload(payload);
  return buildText([
    `Run status: ${summary.status || "unknown"}.`,
    summary.summary_note ? `Summary: ${summary.summary_note}` : "",
    summary.top_finding_title ? `Top finding: ${summary.top_finding_title}` : "",
    summary.top_finding_observed_behavior ? `What happened: ${summary.top_finding_observed_behavior}` : "",
    summary.ui_report_url ? `Open report: ${summary.ui_report_url}` : ""
  ]);
}

function buildManualSessionText(payload) {
  const session = payload?.session && typeof payload.session === "object" ? payload.session : {};
  const checklist = Array.isArray(session.checklist) ? session.checklist : [];
  const widgetInstall = payload?.widget_install && typeof payload.widget_install === "object" ? payload.widget_install : {};
  const directReviewUrl = widgetInstall.review_url || payload?.review_url || session.target_url;
  const freestyle = String(session.review_mode || "").toLowerCase() === "freestyle";
  const draftEvidence = payload?.draft_evidence || summarizeManualDraftEvidence(session);
  return buildText([
    `Manual QA session ${session.session_id || payload.session_id || "created"}.`,
    session.target_url ? `Target: ${session.target_url}` : "",
    freestyle ? "Mode: Freestyle capture." : checklist.length ? `Checklist: ${checklist.length} items.` : "",
    draftEvidence.total_count ? `Draft evidence: ${draftEvidence.total_count} saved (${draftEvidence.video_segment_count || 0} video segments, ${draftEvidence.drawing_count || 0} drawings).` : "",
    session.browser?.status ? `Browser: ${session.browser.status}.` : "",
    widgetInstall.script_tag ? "REQUIRED NEXT STEP FOR THE CODING AGENT:" : "",
    widgetInstall.script_tag ? "1. Inject this exact script tag into the preview/dev build." : "",
    widgetInstall.script_tag ? "2. Deploy or refresh the preview." : "",
    widgetInstall.script_tag ? "3. Open the target once yourself and verify the floating Review button appears." : "",
    widgetInstall.script_tag ? "4. Only then send widget_install.review_url to the user as the test link. Do not use the dashboard as the test entry point." : "",
    widgetInstall.script_tag ? "5. After sending the test link, immediately call qa_wait_for_manual_feedback for this session and keep the turn open until the user sends feedback or the wait times out." : "",
    widgetInstall.script_tag ? "```html" : "",
    widgetInstall.script_tag || "",
    widgetInstall.script_tag ? "```" : "",
    widgetInstall.verify_expression ? `Verify expression: ${widgetInstall.verify_expression}` : "",
    widgetInstall.verify_selector ? `Verify selector: ${widgetInstall.verify_selector}` : "",
    directReviewUrl ? `Direct review URL: ${directReviewUrl}` : "",
    payload.manual_session_url || session.session_url ? `Report dashboard: ${payload.manual_session_url || session.session_url}` : "",
    session.session_id ? `Live draft evidence resource: qa://manual/${encodeURIComponent(session.session_id)}/evidence.json` : "",
    session.session_id ? `No-copy feedback tool: call qa_wait_for_manual_feedback with session_id ${session.session_id} immediately after sending the link; do not just end your turn.` : "",
    session.session_id ? `Report resource: qa://manual/${encodeURIComponent(session.session_id)}/report.md` : ""
  ]);
}

function buildManualEvidenceText(payload = {}) {
  const session = payload.session && typeof payload.session === "object" ? payload.session : {};
  const draftEvidence = payload.draft_evidence || summarizeManualDraftEvidence(session);
  const latest = Array.isArray(draftEvidence.latest_evidence) ? draftEvidence.latest_evidence : [];
  return buildText([
    `Manual QA draft evidence for ${draftEvidence.session_id || session.session_id || "session"}.`,
    `Saved evidence: ${draftEvidence.total_count || 0} total, ${draftEvidence.video_segment_count || 0} video segments, ${draftEvidence.drawing_count || 0} drawings.`,
    latest.length ? "Latest evidence:" : "",
    ...latest.slice(0, 8).map((entry, index) => {
      const label = entry.label || entry.kind || "Evidence";
      const item = entry.item_title ? ` (${entry.item_title})` : "";
      const url = entry.url ? `: ${entry.url}` : "";
      return `${index + 1}. ${label}${item}${url}`;
    }),
    session.session_id ? `Resource: qa://manual/${encodeURIComponent(session.session_id)}/evidence.json` : ""
  ]);
}

async function maybeSendProgress(extra, progress, total, message) {
  if (!extra?._meta || extra._meta.progressToken === undefined) {
    return;
  }
  await extra.sendNotification({
    method: "notifications/progress",
    params: {
      progressToken: extra._meta.progressToken,
      progress,
      total,
      message
    }
  });
}

function buildRunInputSchema() {
  return {
    target_url: z.string().url().describe("Feature preview URL or production URL to test."),
    brand: z.string().max(256).optional().describe("Brand slug or project key. Defaults to the target hostname."),
    feature_name: z.string().max(240).optional().describe("Short feature name, for example 'signup flow' or 'campaign builder'."),
    task_to_try: z.string().max(1000).optional().describe("Plain-English task the tester should attempt."),
    expected_success: z.string().max(1000).optional().describe("What success looks like when the feature works."),
    entry_path: z.string().max(1000).optional().describe("Optional suggested starting path, like '/signup' or '/campaigns/new'."),
    scenario_list: z.array(z.string().max(1000)).max(12).optional().describe("Additional explicit scenarios to test."),
    persona: z.string().max(500).optional().describe("Persona to adopt during the run."),
    scope_mode: z.enum(["core_20m", "deep_45m", "feature_targeted"]).optional(),
    auth_strategy: z.enum(["signup_if_needed", "public_only", "provided_credentials"]).optional().describe("How the run should treat auth."),
    new_account_required: z.boolean().optional().describe("If true, prefer creating a new account when auth is needed."),
    execution_engine: z.enum(["auto", "local_playwright", "local_vision_agent"]).optional(),
    model: z.string().max(128).optional(),
    run_id: z.string().max(128).optional(),
    dry_run: z.boolean().optional(),
    share_after: z.boolean().optional(),
    feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback for automated QA. Use share_feedback_and_start_work only when the user wants the coding agent to start fixes automatically."),
    agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
    auto_start_work: z.boolean().optional().describe("Boolean alias. true means share_feedback_and_start_work; false means share_feedback."),
    credentials: z
      .object({
        login_url: z.string().url().optional(),
        username: z.string().max(320).optional(),
        password: z.string().max(320).optional(),
        otp_mode: z.enum(["none", "manual_prompt", "provider_hook"]).optional()
      })
      .optional()
  };
}

function buildCodingAgentCheckInputSchema() {
  return {
    target_url: z.string().url().describe("Preview, localhost tunnel, staging, or production URL to QA."),
    work_summary: z.string().max(1200).optional().describe("Short summary of what the coding agent changed."),
    feature_name: z.string().max(240).optional().describe("Short feature label. Defaults from work_summary."),
    task_to_try: z.string().max(1000).optional().describe("Specific user task the QA agent should attempt."),
    expected_success: z.string().max(1000).optional().describe("What success looks like when the work is correct."),
    acceptance_criteria: z.array(z.string().max(800)).max(20).optional(),
    changed_files: z.array(z.string().max(320)).max(40).optional(),
    repository: z.string().max(500).optional(),
    branch: z.string().max(240).optional(),
    commit_sha: z.string().max(120).optional(),
    pull_request_url: z.string().url().optional(),
    developer_notes: z.string().max(1600).optional(),
    scenario_list: z.array(z.string().max(1000)).max(12).optional(),
    persona: z.string().max(500).optional(),
    auth_strategy: z.enum(["signup_if_needed", "public_only", "provided_credentials"]).optional(),
    new_account_required: z.boolean().optional(),
    credentials: z
      .object({
        login_url: z.string().url().optional(),
        username: z.string().max(320).optional(),
        password: z.string().max(320).optional(),
        otp_mode: z.enum(["none", "manual_prompt", "provider_hook"]).optional()
      })
      .optional(),
    execution_engine: z.enum(["auto", "local_playwright", "local_vision_agent"]).optional(),
    model: z.string().max(128).optional(),
    run_id: z.string().max(128).optional(),
    timeout_seconds: z.number().int().min(1).max(7200).optional(),
    poll_interval_seconds: z.number().int().min(1).max(120).optional(),
    share_after: z.boolean().optional(),
    feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback for automated QA. Use share_feedback_and_start_work only when the user wants the coding agent to start fixes automatically."),
    agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
    auto_start_work: z.boolean().optional().describe("Boolean alias. true means share_feedback_and_start_work; false means share_feedback."),
    dry_run: z.boolean().optional()
  };
}

function buildManualQaSessionInputSchema(options = {}) {
  const targetUrlSchema = z.string().url().describe("Preview, staging, localhost tunnel, or production URL the human should test.");
  return {
    target_url: options.targetRequired === false ? targetUrlSchema.optional() : targetUrlSchema,
    brand: z.string().max(256).optional().describe("Brand slug or project key."),
    brand_name: z.string().max(180).optional(),
    title: z.string().max(180).optional().describe("Short title for the manual QA session."),
    review_mode: z.enum(["checklist", "freestyle"]).optional().describe("Use freestyle when the human should freely record, speak, draw, and browse without checklist items."),
    feature_name: z.string().max(240).optional().describe("Feature label, for example 'onboarding recommendations'."),
    work_summary: z.string().max(4000).optional().describe("Plain-English summary of what changed."),
    change_summary: z.string().max(4000).optional().describe("Alias for work_summary."),
    acceptance_criteria: z.array(z.string().max(900)).max(24).optional(),
    scenario_list: z.array(z.string().max(1000)).max(24).optional(),
    changed_files: z.array(z.string().max(400)).max(60).optional(),
    repository: z.string().max(500).optional(),
    branch: z.string().max(240).optional(),
    commit_sha: z.string().max(120).optional(),
    pull_request_url: z.string().url().optional(),
    developer_notes: z.string().max(4000).optional(),
    feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback_and_start_work for human/manual feedback. Use share_feedback when the user only wants a summary."),
    agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
    auto_start_work: z.boolean().optional().describe("Boolean alias. true means share_feedback_and_start_work; false means share_feedback."),
    entry_path: z.string().max(1000).optional().describe("Optional path to use when generated checklist items need a start URL."),
    test_plan: z
      .array(
        z.object({
          id: z.string().max(80).optional(),
          title: z.string().max(180).optional(),
          instructions: z.string().max(1600).optional(),
          expected: z.string().max(1200).optional(),
          start_url: z.string().max(4096).optional(),
          path: z.string().max(1000).optional(),
          area: z.string().max(180).optional()
        })
      )
      .max(24)
      .optional()
      .describe("Explicit human checklist. Use this when you know exactly where each test should start.")
  };
}

async function createManualSessionToolResult(apiClient, input, options = {}) {
  if (options.allowMissingTargetUrl) {
    const needsInput = buildManualReviewNeedsInputResult(input);
    if (needsInput) {
      return needsInput;
    }
  }

  const response = await apiClient.createManualQaSession(input);
  return makeToolResult(buildManualSessionText(response), response);
}

function registerQaResources(server, apiClient) {
  const readers = createQaResourceReaders(apiClient);

  server.registerResource(
    "qa-run-status",
    new ResourceTemplate(MCP_QA_RESOURCE_TEMPLATES.run_status, { list: undefined }),
    {
      title: "QA Run Status",
      description: "Current queue/report status for a SwarmTester QA run.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const resource = await readers.readRunStatus(variables.run_id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType,
            text: resource.text
          }
        ]
      };
    }
  );

  server.registerResource(
    "qa-run-report",
    new ResourceTemplate(MCP_QA_RESOURCE_TEMPLATES.run_report, { list: undefined }),
    {
      title: "QA Run Report",
      description: "Normalized JSON report for a SwarmTester QA run.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const resource = await readers.readRunReport(variables.run_id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType,
            text: resource.text
          }
        ]
      };
    }
  );

  server.registerResource(
    "qa-run-report-markdown",
    new ResourceTemplate(MCP_QA_RESOURCE_TEMPLATES.run_report_markdown, { list: undefined }),
    {
      title: "QA Run Report Markdown",
      description: "Markdown summary for a SwarmTester QA run.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const resource = await readers.readRunReportMarkdown(variables.run_id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType,
            text: resource.text
          }
        ]
      };
    }
  );

  server.registerResource(
    "manual-qa-report-markdown",
    new ResourceTemplate(MCP_QA_RESOURCE_TEMPLATES.manual_qa_report_markdown, { list: undefined }),
    {
      title: "Manual QA Report Markdown",
      description: "Human tester feedback exported as Markdown for a coding agent.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const resource = await readers.readManualQaReportMarkdown(variables.session_id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType,
            text: resource.text
          }
        ]
      };
    }
  );

  server.registerResource(
    "manual-qa-live-evidence",
    new ResourceTemplate(MCP_QA_RESOURCE_TEMPLATES.manual_qa_live_evidence, { list: undefined }),
    {
      title: "Manual QA Live Evidence",
      description: "Draft video segment, drawing, and evidence links saved by the page widget before Send All.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const resource = await readers.readManualQaLiveEvidence(variables.session_id);
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.text
          }
        ]
      };
    }
  );

  server.registerResource(
    "manual-review-workflow",
    MCP_QA_RESOURCE_TEMPLATES.manual_review_workflow,
    {
      title: "Manual Review Workflow",
      description: "Instructions for agents when the user asks for a BeforeUsersDo manual review.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: buildManualReviewWorkflowText()
          }
        ]
      };
    }
  );
}

function registerQaPrompts(server) {
  server.registerPrompt(
    "manual_review_workflow",
    {
      title: "BeforeUsersDo Manual Review",
      description:
        "Use when the user says 'manual review with BeforeUsersDo', 'manual QA', 'human review', or asks for a checklist plus a browser-side recorder.",
      argsSchema: {
        target_url: z.string().url().optional().describe("Preview, staging, production, or tunnel URL to review."),
        work_summary: z.string().max(4000).optional().describe("Plain-English summary of what changed."),
        feature_name: z.string().max(240).optional().describe("Feature or flow name.")
      }
    },
    async (args = {}) => {
      return {
        description: "Guide the coding agent through creating a BeforeUsersDo manual QA session.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildManualReviewWorkflowText(args)
            }
          }
        ]
      };
    }
  );
}

function createQaMcpServer(options = {}) {
  const apiClient = createQaApiClient(options);
  const server = new McpServer(
    {
      name: "swarmtester-qa",
      version: pkg.version || "1.0.0"
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  registerQaResources(server, apiClient);
  registerQaPrompts(server);

  server.registerTool(
    "qa_request_run",
    {
      title: "Request QA Run",
      description: "Queue a real SwarmTester QA run for a feature or flow and return the run/report URLs.",
      inputSchema: buildRunInputSchema()
    },
    async (input) => {
      try {
        const response = await apiClient.requestRun(input);
        const result = {
          ok: true,
          run_id: response.run_id,
          queued: response.queued === true,
          report_url: response.report_url || null,
          status_url: response.status_url || null,
          ui_report_url: response.ui_report_url || null,
          queue: response.queue || null,
          run_request: response.run_request
        };
        return makeToolResult(buildRequestedRunText(result), result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_get_run_status",
    {
      title: "Get QA Status",
      description: "Fetch the latest status for a previously queued QA run.",
      inputSchema: {
        run_id: z.string().max(128)
      }
    },
    async ({ run_id }) => {
      try {
        const response = await apiClient.getRunStatus(run_id);
        return makeToolResult(buildStatusText(response), response);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_wait_for_run",
    {
      title: "Wait For QA Run",
      description: "Poll a QA run until it finishes or times out, then optionally include the final report.",
      inputSchema: {
        run_id: z.string().max(128),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        poll_interval_seconds: z.number().int().min(1).max(120).optional(),
        include_report: z.boolean().optional(),
        share_after: z.boolean().optional(),
        feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback. Use share_feedback_and_start_work only when the user wants the coding agent to start fixes automatically."),
        agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
        auto_start_work: z.boolean().optional().describe("Boolean alias.")
      }
    },
    async ({ run_id, timeout_seconds, poll_interval_seconds, include_report, share_after, feedback_action, agent_action_mode, auto_start_work }, extra) => {
      try {
        let tick = 0;
        const pollEvery = Math.max(1, Number(poll_interval_seconds || 5));
        const waitResult = await apiClient.waitForRun(run_id, {
          timeout_seconds,
          poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              tick,
              Math.max(1, Math.ceil((Number(timeout_seconds || 1200) || 1200) / pollEvery)),
              `Run ${run_id} is ${status.report_status || status?.queue?.queue_status || status?.queue?.status || "processing"}`
            );
          }
        });

        const result = {
          ok: true,
          run_id,
          timed_out: waitResult.timed_out === true,
          poll_count: waitResult.poll_count,
          elapsed_ms: waitResult.elapsed_ms,
          status: waitResult.status
        };

        if ((include_report ?? true) && waitResult.status && waitResult.status.report_ready) {
          result.report = await apiClient.getRunReport(run_id, { signal: extra.signal });
        }

        if (share_after) {
          result.share = await apiClient.shareRunReport(run_id, { signal: extra.signal });
        }

        const outcome =
          result.report || result.timed_out
            ? summarizeCodingAgentQaOutcome({ reportPayload: result.report, waitResult, share: result.share })
            : null;
        if (outcome) {
          result.verdict = outcome.verdict;
          result.pass = outcome.pass;
          result.reason = outcome.reason;
          if (shouldReturnQaAction(outcome)) {
            result.required_agent_action = buildAutomatedQaRequiredAction(run_id, outcome, {
              feedback_action,
              agent_action_mode,
              auto_start_work
            });
          }
        }

        const text = result.report
          ? buildText([
              buildReportText(result.report),
              result.required_agent_action ? "" : "",
              result.required_agent_action ? buildAgentActionText(result.required_agent_action) : ""
            ])
          : buildText([
              buildStatusText(waitResult.status || {}),
              result.required_agent_action ? "" : "",
              result.required_agent_action ? buildAgentActionText(result.required_agent_action) : ""
            ]);
        return makeToolResult(text, result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_get_run_report",
    {
      title: "Get QA Report",
      description: "Fetch the normalized QA report and Markdown for a completed or in-progress run.",
      inputSchema: {
        run_id: z.string().max(128),
        feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback. Use share_feedback_and_start_work only when the user wants the coding agent to start fixes automatically."),
        agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
        auto_start_work: z.boolean().optional().describe("Boolean alias.")
      }
    },
    async ({ run_id, feedback_action, agent_action_mode, auto_start_work }) => {
      try {
        const response = await apiClient.getRunReport(run_id);
        const outcome = summarizeCodingAgentQaOutcome({ reportPayload: response });
        const result = {
          ...response,
          verdict: outcome.verdict,
          pass: outcome.pass,
          reason: outcome.reason
        };
        if (shouldReturnQaAction(outcome)) {
          result.required_agent_action = buildAutomatedQaRequiredAction(run_id, outcome, {
            feedback_action,
            agent_action_mode,
            auto_start_work
          });
        }
        const text = buildText([
          buildReportText(response),
          result.required_agent_action ? "" : "",
          result.required_agent_action ? buildAgentActionText(result.required_agent_action) : ""
        ]);
        return makeToolResult(text, result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_share_run_report",
    {
      title: "Share QA Report",
      description: "Create or refresh a shareable team link for a QA report.",
      inputSchema: {
        run_id: z.string().max(128)
      }
    },
    async ({ run_id }) => {
      try {
        const response = await apiClient.shareRunReport(run_id);
        const text = buildText([
          `Created share link for ${run_id}.`,
          response.share_url ? `Share URL: ${response.share_url}` : ""
        ]);
        return makeToolResult(text, response);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_create_manual_session",
    {
      title: "Create Manual QA Session",
      description:
        "Create a BeforeUsersDo manual QA workspace and return a REQUIRED agent-injectable page widget. Supports checklist mode and freestyle recording mode. The coding agent must inject and verify the widget before telling the user to open the target page.",
      inputSchema: buildManualQaSessionInputSchema()
    },
    async (input) => {
      try {
        return await createManualSessionToolResult(apiClient, input);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_start_manual_review",
    {
      title: "Start BeforeUsersDo Manual Review",
      description:
        "Default tool when the user says 'manual review with BeforeUsersDo', 'manual QA', 'human review', 'freestyle QA', or wants a human checklist for recent code changes. Returns a REQUIRED widget snippet. Use review_mode='freestyle' when the user wants open-ended recording/drawing/speaking without checklist items. The coding agent must inject it into the preview/dev build, deploy or refresh the preview, open the target once, verify the Review widget loaded, and only then send the user to the manual QA dashboard. If target_url is missing, returns exactly what to ask for. When available, include preview URL, work_summary, changed_files, acceptance_criteria, scenario_list, repository, branch, commit_sha, pull_request_url, and an explicit test_plan.",
      inputSchema: buildManualQaSessionInputSchema({ targetRequired: false })
    },
    async (input) => {
      try {
        return await createManualSessionToolResult(apiClient, input, { allowMissingTargetUrl: true });
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_manual_review_guide",
    {
      title: "BeforeUsersDo Manual Review Guide",
      description:
        "Explains exactly what context an agent should gather and which tool to call for a BeforeUsersDo manual review. Use this if the request is ambiguous.",
      inputSchema: {
        target_url: z.string().url().optional(),
        work_summary: z.string().max(4000).optional(),
        feature_name: z.string().max(240).optional()
      }
    },
    async (input = {}) => {
      const text = buildManualReviewWorkflowText(input);
      return makeToolResult(text, {
        ok: true,
        recommended_tool: "qa_start_manual_review",
        workflow_prompt: "manual_review_workflow",
        workflow_resource: MCP_QA_RESOURCE_TEMPLATES.manual_review_workflow,
        instructions: text
      });
    }
  );

  server.registerTool(
    "qa_get_manual_session",
    {
      title: "Get Manual QA Session",
      description: "Fetch checklist status for a manual QA session.",
      inputSchema: {
        session_id: z.string().max(128)
      }
    },
    async ({ session_id }) => {
      try {
        const response = await apiClient.getManualQaSession(session_id);
        return makeToolResult(buildManualSessionText(response), response);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_get_manual_report",
    {
      title: "Get Manual QA Report",
      description: "Export the human manual QA checklist as redacted Markdown and JSON.",
      inputSchema: {
        session_id: z.string().max(128)
      }
    },
    async ({ session_id }) => {
      try {
        const response = await apiClient.exportManualQaSession(session_id);
        const text = buildText([
          `Manual QA report for ${session_id}.`,
          response.markdown || "",
          `Resource: qa://manual/${encodeURIComponent(session_id)}/report.md`
        ]);
        return makeToolResult(text, response);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_wait_for_manual_evidence",
    {
      title: "Wait For Manual QA Draft Evidence",
      description:
        "Use while the user is still recording in the BeforeUsersDo widget. Polls until saved draft evidence exists, such as 10-second video segments or drawings, without waiting for the user to click Send All.",
      inputSchema: {
        session_id: z.string().max(128),
        item_id: z.string().max(80).optional(),
        minimum_evidence_count: z.number().int().min(1).max(10000).optional(),
        since_evidence_count: z.number().int().min(0).max(10000).optional(),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        poll_interval_seconds: z.number().min(0.1).max(120).optional()
      }
    },
    async (input, extra) => {
      try {
        const waitResult = await apiClient.waitForManualEvidence(input.session_id, {
          item_id: input.item_id,
          minimum_evidence_count: input.minimum_evidence_count || 1,
          since_evidence_count: input.since_evidence_count || 0,
          timeout_seconds: input.timeout_seconds || 300,
          poll_interval_seconds: input.poll_interval_seconds || 5,
          signal: extra.signal,
          async onPoll(status, meta) {
            await maybeSendProgress(
              extra,
              meta.poll_count,
              Math.max(2, Math.ceil(Number(input.timeout_seconds || 300) / Number(input.poll_interval_seconds || 5))),
              meta.evidence_ready
                ? `Manual QA evidence saved for ${input.session_id}`
                : `Waiting for saved video/drawing evidence for ${input.session_id} (${meta.evidence_count || 0} saved)`
            );
          }
        });

        if (waitResult.evidence_ready) {
          return makeToolResult(buildManualEvidenceText(waitResult), waitResult);
        }

        return makeToolResult(
          buildText([
            `Manual QA draft evidence was not received before the timeout for ${input.session_id}.`,
            "The user may not have started recording/drawing yet, or the widget may not be installed.",
            waitResult.session?.session_url ? `Dashboard: ${waitResult.session.session_url}` : ""
          ]),
          waitResult
        );
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_wait_for_manual_feedback",
    {
      title: "Wait For Manual QA Feedback",
      description:
        "Use after starting a BeforeUsersDo manual review and giving the verified widget page to the user. Waits until the user clicks Send All or Send item in the widget, then returns the redacted Markdown feedback directly to the coding agent so the user does not need to copy/paste.",
      inputSchema: {
        session_id: z.string().max(128),
        scope: z.enum(["all", "item", "any"]).optional().describe("Defaults to all. Use item with item_id for one checklist item, or any for the latest package."),
        item_id: z.string().max(80).optional(),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        poll_interval_seconds: z.number().min(0.1).max(120).optional(),
        feedback_action: z.enum(["share_feedback", "share_feedback_and_start_work"]).optional().describe("Overrides the session setting. Defaults to the session setting, usually share_feedback_and_start_work for human feedback."),
        agent_action_mode: z.enum(["report_only", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
        auto_start_work: z.boolean().optional().describe("Boolean alias override.")
      }
    },
    async (input, extra) => {
      try {
        const waitResult = await apiClient.waitForManualFeedback(input.session_id, {
          scope: input.scope || "all",
          item_id: input.item_id,
          timeout_seconds: input.timeout_seconds || 1800,
          poll_interval_seconds: input.poll_interval_seconds || 5,
          signal: extra.signal,
          async onPoll(status, meta) {
            await maybeSendProgress(
              extra,
              meta.poll_count,
              Math.max(2, Math.ceil(Number(input.timeout_seconds || 1800) / Number(input.poll_interval_seconds || 5))),
              meta.feedback_ready
                ? `Manual QA feedback received for ${input.session_id}`
                : `Waiting for user to click Send All for ${input.session_id}`
            );
          }
        });

        if (waitResult.feedback_ready && waitResult.feedback?.markdown) {
          const sessionContext =
            waitResult.session && typeof waitResult.session.context === "object" && waitResult.session.context
              ? waitResult.session.context
              : {};
          const requiredAgentAction = buildManualFeedbackRequiredAction(input.session_id, waitResult.feedback, {
            feedback_action: input.feedback_action || sessionContext.feedback_action || sessionContext.feedbackAction,
            agent_action_mode: input.agent_action_mode || sessionContext.agent_action_mode || sessionContext.agentActionMode,
            auto_start_work: input.auto_start_work ?? sessionContext.auto_start_work ?? sessionContext.autoStartWork
          });
          const result = {
            ...waitResult,
            required_agent_action: requiredAgentAction
          };
          const text = buildText([
            `Manual QA feedback received for ${input.session_id}.`,
            `Feedback id: ${waitResult.feedback.feedback_id || "n/a"}`,
            "",
            buildAgentActionText(requiredAgentAction),
            "",
            waitResult.feedback.markdown
          ]);
          return makeToolResult(text, result);
        }

        return makeToolResult(
          buildText([
            `Manual QA feedback was not received before the timeout for ${input.session_id}.`,
            "Ask the user to click Send All in the BeforeUsersDo widget, then call this tool again.",
            waitResult.session?.session_url ? `Dashboard: ${waitResult.session.session_url}` : ""
          ]),
          waitResult
        );
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_run_feature_check",
    {
      title: "Run Feature QA",
      description: "One-shot tool: queue a real QA run for a feature, wait for it to finish, then return the final report.",
      inputSchema: {
        ...buildRunInputSchema(),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        poll_interval_seconds: z.number().int().min(1).max(120).optional()
      }
    },
    async (input, extra) => {
      try {
        const queued = await apiClient.requestRun(input);
        await maybeSendProgress(extra, 1, 3, `Queued QA run ${queued.run_id}`);

        let tick = 0;
        const pollEvery = Math.max(1, Number(input.poll_interval_seconds || 5));
        const waitResult = await apiClient.waitForRun(queued.run_id, {
          timeout_seconds: input.timeout_seconds,
          poll_interval_seconds: input.poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              1 + tick,
              Math.max(2, 2 + Math.ceil((Number(input.timeout_seconds || 1200) || 1200) / pollEvery)),
              `Run ${queued.run_id} is ${status.report_status || status?.queue?.queue_status || status?.queue?.status || "processing"}`
            );
          }
        });

        const report = waitResult.status?.report_ready ? await apiClient.getRunReport(queued.run_id, { signal: extra.signal }) : null;
        const shared = input.share_after ? await apiClient.shareRunReport(queued.run_id, { signal: extra.signal }) : null;
        const outcome = summarizeCodingAgentQaOutcome({
          reportPayload: report,
          waitResult,
          share: shared
        });
        await maybeSendProgress(extra, 999, 999, `QA run ${queued.run_id} finished`);

        const result = {
          ok: true,
          queued,
          wait: waitResult,
          report,
          share: shared,
          verdict: outcome.verdict,
          pass: outcome.pass,
          reason: outcome.reason
        };
        if (shouldReturnQaAction(outcome)) {
          result.required_agent_action = buildAutomatedQaRequiredAction(queued.run_id, outcome, input);
        }

        const text = report
          ? buildText([
              `QA run ${queued.run_id} finished.`,
              buildReportText(report),
              result.required_agent_action ? "" : "",
              result.required_agent_action ? buildAgentActionText(result.required_agent_action) : "",
              shared?.share_url ? `Share URL: ${shared.share_url}` : ""
            ])
          : buildText([
              `QA run ${queued.run_id} did not finish before the timeout.`,
              buildStatusText(waitResult.status || {}),
              result.required_agent_action ? "" : "",
              result.required_agent_action ? buildAgentActionText(result.required_agent_action) : ""
            ]);

        return makeToolResult(text, result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_check_work",
    {
      title: "QA Check Work",
      description:
        "Coding-agent-oriented one-shot QA: submit a preview URL plus implementation context, wait for real browser QA, and return a pass/fix/review verdict with evidence links.",
      inputSchema: buildCodingAgentCheckInputSchema()
    },
    async (input, extra) => {
      try {
        const qaInput = buildCodingAgentQaInput(input);
        const queued = await apiClient.requestRun(qaInput);
        await maybeSendProgress(extra, 1, 3, `Queued QA check ${queued.run_id}`);

        let tick = 0;
        const pollEvery = Math.max(1, Number(input.poll_interval_seconds || 5));
        const waitResult = await apiClient.waitForRun(queued.run_id, {
          timeout_seconds: input.timeout_seconds,
          poll_interval_seconds: input.poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              1 + tick,
              Math.max(2, 2 + Math.ceil((Number(input.timeout_seconds || 1200) || 1200) / pollEvery)),
              `QA check ${queued.run_id} is ${
                status.report_status || status?.queue?.queue_status || status?.queue?.status || "processing"
              }`
            );
          }
        });

        const report = waitResult.status?.report_ready ? await apiClient.getRunReport(queued.run_id, { signal: extra.signal }) : null;
        const shared = input.share_after ? await apiClient.shareRunReport(queued.run_id, { signal: extra.signal }) : null;
        const outcome = summarizeCodingAgentQaOutcome({
          reportPayload: report,
          waitResult,
          share: shared
        });
        const reportResource = `qa://runs/${encodeURIComponent(queued.run_id)}/report`;
        const markdownResource = `qa://runs/${encodeURIComponent(queued.run_id)}/report.md`;
        const statusResource = `qa://runs/${encodeURIComponent(queued.run_id)}/status`;

        const result = {
          ok: true,
          run_id: queued.run_id,
          verdict: outcome.verdict,
          pass: outcome.pass,
          reason: outcome.reason,
          report_status: outcome.report_status,
          summary_note: outcome.summary_note,
          top_finding: outcome.top_finding,
          target_url: qaInput.target_url || input.target_url,
          queued,
          wait: waitResult,
          report,
          share: shared,
          evidence: {
            ui_report_url: outcome.ui_report_url || queued.ui_report_url || waitResult.status?.ui_report_url || null,
            share_url: outcome.share_url,
            status_resource: statusResource,
            report_resource: reportResource,
            markdown_resource: markdownResource
          }
        };
        if (shouldReturnQaAction(outcome)) {
          result.required_agent_action = buildAutomatedQaRequiredAction(queued.run_id, outcome, input);
        }

        const text = buildText([
          `QA verdict for ${queued.run_id}: ${outcome.verdict}.`,
          outcome.reason,
          outcome.summary_note ? `Summary: ${outcome.summary_note}` : "",
          outcome.top_finding?.title ? `Top finding: ${outcome.top_finding.title}` : "",
          result.required_agent_action ? "" : "",
          result.required_agent_action ? buildAgentActionText(result.required_agent_action) : "",
          result.evidence.ui_report_url ? `Open report: ${result.evidence.ui_report_url}` : "",
          result.evidence.share_url ? `Share URL: ${result.evidence.share_url}` : "",
          `Report resource: ${markdownResource}`
        ]);

        return makeToolResult(text, result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  return { server, apiClient };
}

function printHelp() {
  const message = buildText([
    "SwarmTester QA MCP server",
    "",
    "First-time setup:",
    "- Run `npm run mcp:qa:login` to store a local dashboard session for MCP use.",
    "",
    "Environment:",
    "- QA_SERVICE_TOKEN: required service token for SwarmTester APIs",
    "- QA_MCP_OWNER_USER_ID: required owner user id for service-token requests",
    "- QA_MCP_OWNER_EMAIL: required owner email for service-token requests",
    "- QA_MCP_BASE_URL: optional, defaults to https://swarmtester.com",
    "- QA_MCP_DEFAULT_BRAND: optional default brand key",
    "- QA_MCP_DEFAULT_PERSONA: optional default persona text",
    "- QA_MCP_DEFAULT_EXECUTION_ENGINE: optional default execution engine",
    "",
    "Tools:",
    "- qa_request_run",
    "- qa_get_run_status",
    "- qa_wait_for_run",
    "- qa_get_run_report",
    "- qa_share_run_report",
    "- qa_create_manual_session",
    "- qa_start_manual_review",
    "- qa_manual_review_guide",
    "- qa_get_manual_session",
    "- qa_get_manual_report",
    "- qa_wait_for_manual_evidence",
    "- qa_wait_for_manual_feedback",
    "- qa_run_feature_check",
    "- qa_check_work",
    "",
    "Prompts:",
    "- manual_review_workflow",
    "",
    "Resources:",
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_status}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_report}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_report_markdown}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.manual_review_workflow}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.manual_qa_live_evidence}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.manual_qa_report_markdown}`
  ]);
  process.stdout.write(`${message}\n`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const { server } = createQaMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SwarmTester QA MCP server running on stdio");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("SwarmTester QA MCP server failed:", error);
    process.exit(1);
  });
}

module.exports = {
  buildAutomatedQaActionText,
  buildAutomatedQaRequiredAction,
  buildAgentActionContract,
  buildAgentActionText,
  buildManualFeedbackActionText,
  buildManualFeedbackRequiredAction,
  buildManualReviewNeedsInputResult,
  buildManualReviewWorkflowText,
  createQaMcpServer,
  registerQaPrompts,
  registerQaResources,
  main
};
