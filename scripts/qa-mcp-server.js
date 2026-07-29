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
const {
  SIMPLE_QA_FLOWS,
  buildAiRunInput,
  buildHumanTestInput,
  buildNeedsInputState,
  buildResumeToken,
  buildSelfReviewInput,
  getHumanReportReadiness,
  mergeResumeInput,
  normalizeAccess,
  normalizeAfterFeedback,
  parseResumeToken
} = require("../lib/qa-mcp-simple");

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

function normalizeStringList(value, maxItems = 20, maxLength = 800) {
  const source = Array.isArray(value)
    ? value
    : safeText(value, maxItems * maxLength)
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, ""));
  return source
    .map((item) => safeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

const DEFAULT_MCP_WAIT_SLICE_SECONDS = 35;
const MAX_MCP_WAIT_SLICE_SECONDS = 50;
const TERMINAL_QUEUE_DISPLAY_STATUSES = new Set(["completed", "failed", "cancelled"]);

function resolveMcpWaitSliceSeconds(input = {}) {
  const requestedTotal = Math.max(1, Number(input.timeout_seconds || input.timeoutSeconds || 1200));
  const requestedSlice = Math.max(
    1,
    Number(input.wait_slice_seconds || input.waitSliceSeconds || DEFAULT_MCP_WAIT_SLICE_SECONDS)
  );
  return Math.min(requestedTotal, requestedSlice, MAX_MCP_WAIT_SLICE_SECONDS);
}

function resolveRunDisplayStatus(status = {}) {
  const queueStatus = safeText(status?.queue?.queue_status || status?.queue?.status, 80).toLowerCase();
  const reportStatus = safeText(status.report_status, 80).toLowerCase();

  if (queueStatus && status.report_ready !== true && !TERMINAL_QUEUE_DISPLAY_STATUSES.has(queueStatus)) {
    return queueStatus;
  }

  return reportStatus || queueStatus || "processing";
}

function buildRunPollingHandoff(runId, status = {}, options = {}) {
  const waitSliceSeconds = resolveMcpWaitSliceSeconds(options);
  const timeoutSeconds = Math.max(1, Number(options.timeout_seconds || options.timeoutSeconds || 1200));
  const reportStatus = resolveRunDisplayStatus(status);
  const nextToolArguments = {
    run_id: runId,
    timeout_seconds: timeoutSeconds,
    wait_slice_seconds: waitSliceSeconds,
    include_report: true,
    ...(options.share_after ? { share_after: true } : {}),
    ...(options.feedback_action ? { feedback_action: options.feedback_action } : {}),
    ...(options.agent_action_mode ? { agent_action_mode: options.agent_action_mode } : {}),
    ...(options.auto_start_work !== undefined ? { auto_start_work: options.auto_start_work } : {})
  };

  return {
    text: buildText([
      `QA run ${runId} is still ${reportStatus}.`,
      "REQUIRED NEXT STEP FOR THE CODING AGENT:",
      `Immediately call qa_wait_for_run again for ${runId}. Keep this agent turn open and repeat until continue_polling is false.`,
      "This short polling handoff prevents normal MCP clients from timing out while the browser keeps working.",
      "Do not call this run a pass, failure, or completed test yet."
    ]),
    result: {
      ok: true,
      run_id: runId,
      verdict: "processing",
      pass: false,
      timed_out: false,
      continue_polling: true,
      report_status: reportStatus,
      status,
      next_tool: {
        name: "qa_wait_for_run",
        arguments: nextToolArguments
      }
    }
  };
}

const AGENT_ACTION_MODES = new Set(["report_only", "preview_then_fix", "fix_and_retest"]);

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
  if (
    [
      "preview_then_fix",
      "preview_fix_first",
      "preview_first",
      "simulate_first",
      "simulate_fix",
      "mockup_first",
      "mock_first"
    ].includes(explicit)
  ) {
    return "preview_then_fix";
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

function feedbackActionForAgentMode(mode) {
  if (mode === "fix_and_retest") return "share_feedback_and_start_work";
  if (mode === "preview_then_fix") return "preview_fix_first";
  return "share_feedback";
}

function shouldAutoStartWorkForAgentMode(mode) {
  return mode === "fix_and_retest";
}

function buildPostFixReviewGate(mode) {
  if (mode === "fix_and_retest") {
    return {
      required: true,
      reviewer: "fresh_contextless_agent",
      implementer_may_self_close: false,
      compare_against: ["original_feedback", "work_packets", "fixed_url", "changed_files_or_commit"],
      required_inputs: [
        "original feedback package or report",
        "manual work packets when available",
        "changed files or commit SHA",
        "fixed preview or production URL",
        "test/build results"
      ],
      verdicts: ["fixed", "missed", "still_unclear"],
      pass_condition: "Every actionable original feedback point is fixed or explicitly marked non-actionable with evidence.",
      fail_action: "Continue implementation; do not mark done.",
      pass_action: "Create or share a fresh BeforeUsersDo QA link for the fixed version, then summarize the reviewer verdict."
    };
  }
  if (mode === "preview_then_fix") {
    return {
      required: true,
      reviewer: "fresh_contextless_agent",
      implementer_may_self_close: false,
      compare_against: ["original_feedback", "work_packets", "approved_preview_or_checklist", "fixed_url", "changed_files_or_commit"],
      required_inputs: [
        "original feedback package or report",
        "manual work packets when available",
        "approved preview/checklist",
        "changed files or commit SHA",
        "fixed preview or production URL",
        "test/build results"
      ],
      verdicts: ["fixed", "missed", "still_unclear"],
      pass_condition: "Every actionable original feedback point and approved preview item is reflected in the fixed result.",
      fail_action: "Continue implementation; do not mark done.",
      pass_action: "Create or share a fresh BeforeUsersDo QA link for the fixed version, then summarize the reviewer verdict."
    };
  }
  return {
    required: false,
    reviewer: "not_required_until_work_starts",
    implementer_may_self_close: false,
    reason: "Report-only feedback does not authorize implementation. If the user asks to start work, switch to fix-and-retest and require this gate."
  };
}

function buildPostFixReviewRecord(input = {}) {
  const verdict = safeText(input.verdict || input.status, 40).toLowerCase();
  const safeVerdict = ["fixed", "missed", "still_unclear"].includes(verdict) ? verdict : "still_unclear";
  const missedItems = normalizeStringList(input.missed_items || input.missedItems || input.misses, 24, 900);
  const unclearItems = normalizeStringList(input.unclear_items || input.unclearItems || input.still_unclear, 24, 900);
  const mayMarkDone = safeVerdict === "fixed" && !missedItems.length && !unclearItems.length;
  return {
    review_id: safeText(input.review_id || input.reviewId, 128) || null,
    session_id: safeText(input.session_id || input.sessionId, 128) || null,
    run_id: safeText(input.run_id || input.runId, 128) || null,
    feedback_id: safeText(input.feedback_id || input.feedbackId, 128) || null,
    reviewer: safeText(input.reviewer || input.reviewer_agent || input.reviewerAgent, 160) || "fresh_contextless_agent",
    verdict: safeVerdict,
    may_mark_done: mayMarkDone,
    fixed_url: safeText(input.fixed_url || input.fixedUrl || input.url, 4096) || null,
    changed_files: normalizeStringList(input.changed_files || input.changedFiles, 80, 500),
    commit_sha: safeText(input.commit_sha || input.commitSha, 120) || null,
    packet_ids: normalizeStringList(input.packet_ids || input.packetIds || input.packet_id || input.packetId, 24, 128),
    fixed_items: normalizeStringList(input.fixed_items || input.fixedItems, 24, 900),
    missed_items: missedItems,
    unclear_items: unclearItems,
    summary: safeText(input.summary || input.reviewer_summary || input.reviewerSummary || input.note, 4000) || null,
    evidence_urls: normalizeStringList(input.evidence_urls || input.evidenceUrls || input.proof_urls || input.proofUrls, 24, 4096),
    test_results: normalizeStringList(input.test_results || input.testResults || input.checks, 24, 500),
    created_at: new Date().toISOString()
  };
}

function attachPostFixReviewGateToManualPackets(response = {}) {
  const session = response.session && typeof response.session === "object" ? response.session : {};
  const mode = normalizeAgentActionMode(session.context || {}, "report_only");
  const baseGate = buildPostFixReviewGate(mode);
  const feedbackId = safeText(session.agent_feedback?.latest?.feedback_id || session.agentFeedback?.latest?.feedback_id, 128) || null;
  const packets = Array.isArray(response.work_packets) ? response.work_packets : [];
  return {
    ...response,
    post_fix_review_gate: baseGate,
    work_packets: packets.map((packet) => ({
      ...packet,
      post_fix_review_gate: {
        ...baseGate,
        packet_id: safeText(packet.packet_id || packet.packetId, 128) || null,
        feedback_id: feedbackId
      }
    }))
  };
}

function buildManualReviewWorkflowText(input = {}) {
  const targetUrl = safeText(input.target_url || input.targetUrl, 4096);
  const workSummary = safeText(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 4000);
  const featureName = safeText(input.feature_name || input.featureName || input.title, 240);

  return buildText([
    "# BeforeUsersDo Self-Review Workflow",
    "",
    "Use this only when the user will personally review the product. For another real person, use qa_hire_tester. For AI QA, use qa_ai_test.",
    "",
    "1. Call qa_self_review with target_url, a plain-English goal, and style=guided or freestyle.",
    "- Default after_feedback to report.",
    "- Do not use qa_start_manual_review or the other legacy manual tools for a new flow.",
    "",
    "2. Follow the returned state.",
    "- needs_input: relay question, then call qa_continue with the resume_token and answer.",
    "- needs_setup: inject required_action.script_tag, deploy or refresh, and load the target page.",
    "- Call qa_continue after setup. The server must report widget.installed=true before the review link is ready.",
    "- running: the widget is ready and waiting for the user to click Send All.",
    "- complete: share the report and findings.",
    "",
    "3. Respect authorization.",
    "- report: summarize the evidence; do not edit or deploy.",
    "- preview: show a proposed future state before editing.",
    "- fix_and_retest: implement only when the user explicitly requested it.",
    "- Never leak credentials, tokens, cookies, or private browser storage.",
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
    feedback_action: feedbackActionForAgentMode(mode),
    auto_start_work: shouldAutoStartWorkForAgentMode(mode),
    next_tool_after_fix: nextToolAfterFix
  };
  base.post_fix_review_gate = buildPostFixReviewGate(mode);

  if (mode === "fix_and_retest") {
    return {
      ...base,
      status: "fix_or_explain_before_done",
      completion_rule:
        "Do not claim done after receiving this QA feedback. Extract the actionable points, fix the target work, verify, deploy or refresh the preview, then run a fresh contextless reviewer that compares the original feedback against the fixed result. If it misses anything, continue work. If it passes, create a fresh BeforeUsersDo QA link or rerun QA.",
      steps: [
        "Read the full QA feedback and evidence links.",
        "Extract concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, network evidence, and report findings.",
        "Call qa_get_manual_work_packets for manual QA sessions and use packet_id as the task boundary for focused work or sub-agents.",
        "Turn every actionable bug, copy issue, confusing UI, blocker, or requested change into implementation work.",
        "Update the target code/product instead of only summarizing the feedback.",
        "Run the relevant tests/build checks and record the result.",
        "Deploy or refresh the preview/production target the user should retest.",
        "Start a fresh contextless reviewer agent with only the original feedback package/work packets, changed files or commit, and the fixed URL.",
        "Require the reviewer to compare each original feedback point against the fixed result and return fixed, missed, or still unclear.",
        "If the reviewer finds missed or unchanged feedback, continue implementation instead of marking done.",
        "If the reviewer passes, create a fresh BeforeUsersDo QA link or rerun the relevant QA tool for the fixed version.",
        "If any step is blocked, say exactly what is blocked and what is needed."
      ]
    };
  }

  if (mode === "preview_then_fix") {
    return {
      ...base,
      status: "preview_required_before_work",
      completion_rule:
        "Do not start code changes from this QA result yet. Extract the actionable points, create a simulated future-state preview or behavior trace, ask the user to confirm or correct it, then after confirmation fix, verify, deploy or refresh. Before done, run a fresh contextless reviewer against the original feedback and approved preview. If it passes, create a fresh BeforeUsersDo QA link or rerun QA.",
      steps: [
        "Read the full QA feedback and evidence links.",
        "Extract concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, network evidence, and report findings.",
        "Call qa_get_manual_work_packets for manual QA sessions and use packet_id as the task boundary for preview proposals or sub-agents.",
        "Create a preview contract before editing code: for UI, generate an edited screenshot/mockup or precise visual description; for backend or flows, write the expected event/API/browser trace.",
        "Map every feedback point to the proposed future result so the user can catch misunderstandings early.",
        "Call qa_submit_manual_preview with the proposal so it appears inside the BeforeUsersDo widget for the user.",
        "Ask the user to confirm or correct the preview before implementation.",
        "After confirmation, update the target code/product, run relevant tests/build checks, deploy or refresh, then create a fresh BeforeUsersDo QA link or rerun QA.",
        "Before marking done, start a fresh contextless reviewer agent with only the original feedback package/work packets, approved preview/checklist, changed files or commit, and the fixed URL.",
        "If the reviewer finds missed or unchanged feedback, continue implementation instead of marking done.",
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
      "Call qa_get_manual_work_packets for manual QA sessions when available, and summarize by packet_id.",
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
      actionMode:
        options.feedback_action ||
        options.feedbackAction ||
        options.feedback_mode ||
        options.feedbackMode ||
        options.agent_action_mode ||
        options.agentActionMode ||
        "report_only",
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
      : action.agent_action_mode === "preview_then_fix"
        ? "Mode: preview fix first. Simulate the intended result before code changes."
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

function shouldReturnQaAction(outcome = {}, options = {}) {
  const mode = normalizeAgentActionMode(options, "report_only");
  if (mode !== "report_only") {
    return true;
  }
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

function hasHumanTestSpecificContext(input = {}) {
  return Boolean(
    safeText(input.test_focus || input.testFocus || input.task_to_try || input.taskToTry, 2400) ||
      safeText(input.feature_name || input.featureName, 240) ||
      safeText(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 4000) ||
      normalizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 24, 900).length
  );
}

function normalizeHumanTestFundingInput(input = {}) {
  const paymentMethod = safeText(input.payment_method || input.paymentMethod, 40).toLowerCase();
  const budgetUsd = Number(input.budget_usd ?? input.budgetUsd);
  const budgetCents = Number.isFinite(budgetUsd) ? Math.round(budgetUsd * 100) : 0;
  if (paymentMethod === "qualification_trial") {
    return {
      ...input,
      payment_method: paymentMethod,
      assignment_type: "qualification",
      funding_type: "cash",
      tester_pay_cents: 0
    };
  }
  return {
    ...input,
    payment_method: paymentMethod,
    assignment_type: "paid",
    funding_type: paymentMethod === "qa_credit" ? "qa_credit" : "cash",
    tester_pay_cents: budgetCents,
    ...(paymentMethod === "qa_credit" ? { qa_credit_amount_cents: budgetCents } : {})
  };
}

function buildHumanTestNeedsInputResult(input = {}) {
  const targetUrl = safeText(input.target_url || input.targetUrl, 4096);
  if (!targetUrl) {
    const result = {
      ok: false,
      needs_input: true,
      missing_fields: ["target_url"],
      prompt: "What preview, staging, or production URL should the real tester open?",
      recommended_tool: "qa_request_human_test"
    };
    return makeToolResult(buildText(["A real human tester needs a reachable URL.", result.prompt]), result);
  }

  const paymentMethod = safeText(input.payment_method || input.paymentMethod, 40).toLowerCase();
  if (!["cash", "qa_credit", "qualification_trial"].includes(paymentMethod)) {
    const result = {
      ok: false,
      needs_input: true,
      missing_fields: ["payment_method"],
      prompt:
        "How should this real-person QA be funded: cash or QA credit? For either paid option, include the exact dollar-equivalent budget. Choose a qualification trial only when you explicitly want the free tester-and-buyer trial.",
      recommended_tool: "qa_request_human_test"
    };
    return makeToolResult(buildText(["Human QA needs an explicit funding choice.", result.prompt]), result);
  }

  const budgetUsd = Number(input.budget_usd ?? input.budgetUsd);
  if (paymentMethod !== "qualification_trial" && (!Number.isFinite(budgetUsd) || budgetUsd < 1)) {
    const result = {
      ok: false,
      needs_input: true,
      missing_fields: ["budget_usd"],
      prompt:
        paymentMethod === "qa_credit"
          ? "How much QA credit should this test use? Enter a dollar-equivalent amount of at least $1."
          : "What tester budget should I use in dollars? Enter at least $1.",
      recommended_tool: "qa_request_human_test"
    };
    return makeToolResult(buildText(["Paid human QA needs an exact budget before it can be requested.", result.prompt]), result);
  }

  const reviewType = safeText(input.review_type || input.reviewType, 60).toLowerCase();
  if (reviewType === "specific_flow" && !hasHumanTestSpecificContext(input)) {
    const result = {
      ok: false,
      needs_input: true,
      missing_fields: ["test_focus"],
      prompt: "Which flow should the tester try? If you want a general first-time-user review instead, say that.",
      recommended_tool: "qa_request_human_test"
    };
    return makeToolResult(buildText(["The requested specific test has no flow yet.", result.prompt]), result);
  }

  const accessMode = safeText(input.access_mode || input.accessMode, 60).toLowerCase();
  const credentials = input.credentials && typeof input.credentials === "object" ? input.credentials : {};
  if (accessMode === "test_account" && (!safeText(credentials.username, 320) || !safeText(credentials.password, 320))) {
    const result = {
      ok: false,
      needs_input: true,
      missing_fields: ["credentials.username", "credentials.password"],
      prompt: "Send the test login, or tell me to limit the tester to public pages or allow a fresh signup.",
      recommended_tool: "qa_request_human_test"
    };
    return makeToolResult(buildText(["Test-account access was selected without a complete login.", result.prompt]), result);
  }

  return null;
}

function buildHumanTestRequestText(payload = {}) {
  const request = payload.request && typeof payload.request === "object" ? payload.request : {};
  const reviewLabel = request.review_type === "specific_flow" ? "Specific flow" : "General first-time-user review";
  const payCents = Math.max(0, Math.round(Number(request.tester_pay_cents) || 0));
  const payLabel = `$${(payCents / 100).toFixed(2).replace(/\.00$/, "")}`;
  return buildText([
    `Human test request ${request.id || "created"} is ${request.status || "queued"}.`,
    request.target_url ? `Target: ${request.target_url}` : "",
    `Scope: ${reviewLabel}.`,
    request.test_focus ? `Tester brief: ${request.test_focus}` : "",
    request.access_mode ? `Access: ${request.access_mode}.` : "",
    request.assignment_type === "paid"
      ? request.funding_type === "qa_credit"
        ? `Funding confirmed: ${payLabel} QA credit reserved.`
        : `Funding confirmed: ${payLabel} cash tester budget.`
      : "Funding confirmed: explicit free qualification trial.",
    request.status === "queued"
      ? "This request is awaiting Before Users Do preparation and publication. No tester is matching yet."
      : "",
    "No customer form is required. Before Users Do will email the private tracking link after the request is published.",
    request.id ? `Check later with qa_get_human_test_status using request_id ${request.id}.` : ""
  ]);
}

function buildHumanTestStatusText(payload = {}) {
  const request = payload.request && typeof payload.request === "object" ? payload.request : {};
  const payCents = Math.max(0, Math.round(Number(request.tester_pay_cents) || 0));
  const payCurrency = safeText(request.tester_pay_currency, 3).toUpperCase() || "USD";
  const payAmount = (payCents / 100).toFixed(2).replace(/\.00$/, "");
  const payLabel = payCurrency === "USD" ? `$${payAmount}` : `${payCurrency} ${payAmount}`;
  return buildText([
    `Human test request ${request.id || "unknown"}: ${request.status || "unknown"}.`,
    request.assigned_tester_name ? `Tester: ${request.assigned_tester_name}.` : "",
    request.assignment_type === "paid" ? `Paid assignment: ${payLabel}. Payout: ${request.payout_status || "pending"}.` : "",
    request.status === "queued"
      ? "The request is awaiting Before Users Do preparation and publication. No tester is matching yet."
      : "",
    request.status === "available" ? "The test is available for an eligible tester to claim." : "",
    request.status === "assigned" ? "A tester has been assigned and received the private test link." : "",
    request.status === "in_progress" ? "The tester is working now." : "",
    request.status === "submitted" || request.status === "completed" ? "The human test has been submitted." : "",
    payload.report?.markdown ? payload.report.markdown : ""
  ]);
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
    `Run ${summary.run_id || "unknown"} status: ${resolveRunDisplayStatus(payload)}.`,
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
    widgetInstall.script_tag ? "5. After sending the test link, immediately call qa_wait_for_manual_feedback with wait_forever=true for this session and keep the turn open until the user sends feedback or the client aborts." : "",
    widgetInstall.script_tag ? "```html" : "",
    widgetInstall.script_tag || "",
    widgetInstall.script_tag ? "```" : "",
    widgetInstall.verify_expression ? `Verify expression: ${widgetInstall.verify_expression}` : "",
    widgetInstall.verify_selector ? `Verify selector: ${widgetInstall.verify_selector}` : "",
    directReviewUrl ? `Direct review URL: ${directReviewUrl}` : "",
    payload.manual_session_url || session.session_url ? `Report dashboard: ${payload.manual_session_url || session.session_url}` : "",
    session.session_id ? `Live draft evidence resource: qa://manual/${encodeURIComponent(session.session_id)}/evidence.json` : "",
    session.session_id ? `No-copy feedback tool: call qa_wait_for_manual_feedback with session_id ${session.session_id} and wait_forever=true immediately after sending the link; do not just end your turn.` : "",
    session.session_id ? `After feedback: call qa_get_manual_work_packets with session_id ${session.session_id} before splitting work across agents.` : "",
    session.session_id ? "After fixes: run a fresh contextless reviewer against the original feedback and fixed URL before saying done; continue work if that reviewer finds misses." : "",
    session.session_id ? `Report resource: qa://manual/${encodeURIComponent(session.session_id)}/report.md` : ""
  ]);
}

function buildManualEvidenceText(payload = {}) {
  const session = payload.session && typeof payload.session === "object" ? payload.session : {};
  const draftEvidence = payload.draft_evidence || summarizeManualDraftEvidence(session);
  const latest = Array.isArray(draftEvidence.latest_evidence) ? draftEvidence.latest_evidence : [];
  const packets = Array.isArray(session.work_packets) ? session.work_packets : [];
  return buildText([
    `Manual QA draft evidence for ${draftEvidence.session_id || session.session_id || "session"}.`,
    `Saved evidence: ${draftEvidence.total_count || 0} total, ${draftEvidence.video_segment_count || 0} video segments, ${draftEvidence.drawing_count || 0} drawings.`,
    packets.length ? `Live work packets: ${packets.length}. The agent can start on stable packets before Send All if auto-start work is enabled.` : "",
    ...packets.slice(0, 5).flatMap((packet, index) => [
      `${index + 1}. ${packet.title || "Work packet"} (${packet.packet_id || "packet"})`,
      packet.summary ? `   Summary: ${packet.summary}` : ""
    ]),
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

function buildManualWorkPacketsText(payload = {}) {
  const packets = Array.isArray(payload.work_packets)
    ? payload.work_packets
    : Array.isArray(payload.session?.work_packets)
      ? payload.session.work_packets
      : [];
  const sessionId = payload.session_id || payload.session?.session_id || "session";
  return buildText([
    `Manual QA work packets for ${sessionId}: ${packets.length}.`,
    packets.length ? "Use one packet per focused agent/sub-agent task. Keep the packet_id in updates and commits." : "",
    packets.length
      ? "A packet is not done just because the implementing agent says so. After fixes, a fresh contextless reviewer must compare the original packet feedback against the fixed result."
      : "",
    ...packets.slice(0, 12).flatMap((packet, index) => [
      `${index + 1}. ${packet.title || "Work packet"} (${packet.packet_id || "packet"})`,
      packet.suggested_owner ? `   Owner: ${packet.suggested_owner}` : "",
      packet.page_anchor?.url ? `   Page: ${packet.page_anchor.url}` : "",
      packet.summary ? `   Summary: ${packet.summary}` : "",
      packet.agent_task ? `   Task: ${packet.agent_task}` : ""
    ]),
    packets.length
      ? "If a packet is ambiguous, ask the user a packet-specific question before editing. If multiple packets are independent, spawn separate sub-agents for them. If the reviewer finds a miss, continue work on that packet instead of marking it done."
      : "No packets yet. Wait for user evidence/feedback first or ask the user to Send All."
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
    wait_slice_seconds: z
      .number()
      .int()
      .min(1)
      .max(MAX_MCP_WAIT_SLICE_SECONDS)
      .optional()
      .describe("Maximum time one MCP tool call waits before returning a continue-polling handoff. Defaults to 35 seconds."),
    feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback for automated QA. Use preview_fix_first when the user wants a simulated fix preview before coding, or share_feedback_and_start_work when they want fixes to start automatically."),
    agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
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
    wait_slice_seconds: z
      .number()
      .int()
      .min(1)
      .max(MAX_MCP_WAIT_SLICE_SECONDS)
      .optional()
      .describe("Maximum time one MCP tool call waits before returning a continue-polling handoff. Defaults to 35 seconds."),
    share_after: z.boolean().optional(),
    feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback for automated QA. Use preview_fix_first when the user wants a simulated fix preview before coding, or share_feedback_and_start_work when they want fixes to start automatically."),
    agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
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
    feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback. Use preview_fix_first when the user wants a simulated fix preview before coding, or share_feedback_and_start_work only when they explicitly ask to start fixes."),
    agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
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

function buildHumanTestInputSchema(options = {}) {
  const targetUrlSchema = z.string().url().describe("Preview, staging, or production URL the real tester should open.");
  return {
    target_url: options.targetRequired === false ? targetUrlSchema.optional() : targetUrlSchema,
    product_name: z.string().max(180).optional().describe("Product name. Defaults to the target hostname."),
    payment_method: z
      .enum(["cash", "qa_credit", "qualification_trial"])
      .optional()
      .describe(
        "Required funding choice. Ask the user when missing. cash and qa_credit require budget_usd. qualification_trial is only for an explicitly requested free tester-and-buyer trial."
      ),
    budget_usd: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .describe("Required exact tester budget for cash or QA credit. Never infer $0."),
    review_type: z
      .enum(["specific_flow", "general_first_time_user"])
      .optional()
      .describe("Infer specific_flow from the current work. Use general_first_time_user when no specific feature is requested."),
    test_focus: z.string().max(2400).optional().describe("Plain-English task for the tester. Infer this from the current work when possible."),
    task_to_try: z.string().max(2400).optional().describe("Alias for test_focus."),
    expected_success: z.string().max(1600).optional(),
    feature_name: z.string().max(240).optional(),
    work_summary: z.string().max(4000).optional(),
    change_summary: z.string().max(4000).optional(),
    acceptance_criteria: z.array(z.string().max(900)).max(24).optional(),
    scenario_list: z.array(z.string().max(1000)).max(24).optional(),
    changed_files: z.array(z.string().max(400)).max(60).optional(),
    repository: z.string().max(500).optional(),
    branch: z.string().max(240).optional(),
    commit_sha: z.string().max(120).optional(),
    pull_request_url: z.string().url().optional(),
    developer_notes: z.string().max(4000).optional(),
    duration_minutes: z.number().int().min(10).max(60).optional(),
    access_mode: z
      .enum(["public_only", "signup_allowed", "test_account"])
      .optional()
      .describe("Use the safest mode that still permits the requested flow. Defaults to public_only."),
    account_creation_allowed: z.boolean().optional(),
    purchase_allowed: z.boolean().optional().describe("Defaults to false. Never infer permission to make a real purchase."),
    irreversible_actions_allowed: z.boolean().optional().describe("Defaults to false."),
    prohibited_actions: z.array(z.string().max(400)).max(20).optional(),
    credentials: z
      .object({
        login_url: z.string().url().optional(),
        username: z.string().max(320),
        password: z.string().max(320),
        otp_mode: z.enum(["none", "manual_prompt", "provider_hook"]).optional()
      })
      .optional()
      .describe("Private test-account login. Encrypted at rest and shown only to the assigned tester."),
    request_key: z.string().max(180).optional().describe("Optional idempotency key so an agent retry does not create a duplicate request.")
  };
}

function buildSimpleCredentialsSchema() {
  return z
    .object({
      login_url: z.string().url().optional(),
      username: z.string().max(320),
      password: z.string().max(320),
      otp_mode: z.enum(["none", "manual_prompt", "provider_hook"]).optional()
    })
    .optional()
    .describe("Only provide a dedicated test account. Never provide a personal login.");
}

function buildSimpleAiTestInputSchema() {
  return {
    target_url: z.string().url().optional().describe("Reachable preview, staging, or production URL."),
    goal: z.string().max(2400).optional().describe("What the AI tester should try. Omit for a general first-time-user review."),
    expected_result: z.string().max(1600).optional().describe("What success should look like."),
    depth: z.enum(["quick", "deep"]).optional().describe("Defaults to quick."),
    access: z.enum(["public_only", "signup_allowed", "test_account"]).optional().describe("Defaults to public_only."),
    credentials: buildSimpleCredentialsSchema(),
    after_feedback: z
      .enum(["report", "preview", "fix_and_retest"])
      .optional()
      .describe("Defaults to report. Never start fixes unless preview or fix_and_retest was explicitly requested."),
    idempotency_key: z.string().max(180).optional().describe("Optional stable key for an intentional retry.")
  };
}

function buildSimpleSelfReviewInputSchema() {
  return {
    target_url: z.string().url().optional().describe("Reachable preview, staging, or production URL."),
    goal: z.string().max(2400).optional().describe("What the owner wants to review."),
    style: z.enum(["guided", "freestyle"]).optional().describe("Guided checklist or open-ended recording. Defaults to guided."),
    after_feedback: z
      .enum(["report", "preview", "fix_and_retest"])
      .optional()
      .describe("Defaults to report. Never start fixes unless preview or fix_and_retest was explicitly requested."),
    idempotency_key: z.string().max(180).optional().describe("Optional stable key for an intentional retry.")
  };
}

function buildSimpleHumanTestInputSchema() {
  return {
    target_url: z.string().url().optional().describe("Reachable preview, staging, or production URL."),
    goal: z.string().max(2400).optional().describe("What the real tester should try. Omit for a general first-time-user review."),
    expected_result: z.string().max(1600).optional().describe("What success should look like."),
    product_name: z.string().max(180).optional(),
    payment_method: z
      .enum(["cash", "qa_credit", "qualification_trial"])
      .optional()
      .describe("Required. Never infer qualification_trial or a zero-dollar test."),
    budget_usd: z.number().min(1).max(10000).optional().describe("Required exact budget for cash or QA credit."),
    duration_minutes: z.number().int().min(10).max(60).optional(),
    access: z.enum(["public_only", "signup_allowed", "test_account"]).optional().describe("Defaults to public_only."),
    credentials: buildSimpleCredentialsSchema(),
    purchase_allowed: z.boolean().optional().describe("Defaults to false. Set true only with explicit user permission."),
    idempotency_key: z.string().max(180).optional().describe("Optional stable key for an intentional retry.")
  };
}

function buildSimpleContinueInputSchema() {
  return {
    resume_token: z.string().max(16000).describe("Opaque token returned by a primary BeforeUsersDo QA tool."),
    target_url: z.string().url().optional(),
    goal: z.string().max(2400).optional(),
    expected_result: z.string().max(1600).optional(),
    product_name: z.string().max(180).optional(),
    payment_method: z.enum(["cash", "qa_credit", "qualification_trial"]).optional(),
    budget_usd: z.number().min(1).max(10000).optional(),
    duration_minutes: z.number().int().min(10).max(60).optional(),
    access: z.enum(["public_only", "signup_allowed", "test_account"]).optional(),
    style: z.enum(["guided", "freestyle"]).optional(),
    after_feedback: z.enum(["report", "preview", "fix_and_retest"]).optional(),
    credentials: buildSimpleCredentialsSchema(),
    purchase_allowed: z.boolean().optional(),
    setup_verified: z
      .boolean()
      .optional()
      .describe("For self-review only. The server still confirms that the widget actually loaded."),
    wait_seconds: z.number().int().min(1).max(MAX_MCP_WAIT_SLICE_SECONDS).optional()
  };
}

function buildSimpleNextTool(resumeToken, extraArguments = {}) {
  return {
    name: "qa_continue",
    arguments: {
      resume_token: resumeToken,
      ...extraArguments
    }
  };
}

function makeSimpleStateResult(result, lines = []) {
  const text = buildText([
    result.question || "",
    result.reason || "",
    ...lines,
    result.state === "running" ? "Use qa_continue with the returned resume_token for the next update." : ""
  ]);
  return makeToolResult(text || `BeforeUsersDo state: ${result.state || "unknown"}.`, result);
}

function buildSimpleNeedsInputToolResult(flow, input, legacyResult) {
  const legacy = legacyResult?.structuredContent || legacyResult || {};
  const result = buildNeedsInputState({
    flow,
    input,
    missingFields: Array.isArray(legacy.missing_fields) ? legacy.missing_fields : ["input"],
    question: legacy.prompt || legacy.question || "BeforeUsersDo needs one more detail."
  });
  return makeSimpleStateResult(result);
}

function buildSimpleAccessNeedsInput(flow, input = {}) {
  if (normalizeAccess(input.access) !== "test_account") return null;
  const credentials = input.credentials && typeof input.credentials === "object" ? input.credentials : {};
  if (safeText(credentials.username, 320) && safeText(credentials.password, 320)) return null;
  const result = buildNeedsInputState({
    flow,
    input,
    missingFields: ["credentials"],
    question: "Send a dedicated test-account username and password, or choose public_only or signup_allowed access."
  });
  result.choices = [
    { value: "public_only", label: "Public pages only" },
    { value: "signup_allowed", label: "Allow a fresh signup" },
    { value: "test_account", label: "Provide a dedicated test login", requires: ["credentials"] }
  ];
  return makeSimpleStateResult(result);
}

async function finishSimpleAiWait(apiClient, runId, waitResult, input = {}) {
  const resumeToken = buildResumeToken({ flow: SIMPLE_QA_FLOWS.AI, id: runId, input });
  if (waitResult.timed_out === true || waitResult.status?.report_ready !== true) {
    const result = {
      ok: true,
      state: "running",
      flow: SIMPLE_QA_FLOWS.AI,
      run_id: runId,
      reason: `AI QA is ${resolveRunDisplayStatus(waitResult.status || {})}.`,
      resume_token: resumeToken,
      continue_polling: true,
      status: waitResult.status || null,
      report_url: waitResult.status?.ui_report_url || null,
      next_tool: buildSimpleNextTool(resumeToken)
    };
    return makeSimpleStateResult(result);
  }

  const report = await apiClient.getRunReport(runId);
  let share = null;
  try {
    share = await apiClient.shareRunReport(runId);
  } catch {
    share = null;
  }
  const outcome = summarizeCodingAgentQaOutcome({ reportPayload: report, waitResult, share });
  const result = {
    ok: true,
    state: "complete",
    flow: SIMPLE_QA_FLOWS.AI,
    run_id: runId,
    verdict: outcome.verdict,
    pass: outcome.pass,
    reason: outcome.reason,
    report,
    share,
    report_url: outcome.share_url || outcome.ui_report_url || report?.ui_report_url || null,
    continue_polling: false
  };
  if (shouldReturnQaAction(outcome, { feedback_action: buildAiRunInput(input).feedback_action })) {
    result.required_agent_action = buildAutomatedQaRequiredAction(runId, outcome, {
      feedback_action: buildAiRunInput(input).feedback_action
    });
  }
  return makeSimpleStateResult(result, [
    result.report_url ? `Report: ${result.report_url}` : "",
    result.required_agent_action ? buildAgentActionText(result.required_agent_action) : ""
  ]);
}

async function startSimpleAiTest(apiClient, input = {}, extra = {}) {
  if (!safeText(input.target_url, 4096)) {
    return buildSimpleNeedsInputToolResult(SIMPLE_QA_FLOWS.AI, input, {
      missing_fields: ["target_url"],
      prompt: "What preview, staging, or production URL should the AI tester open?"
    });
  }
  const accessNeedsInput = buildSimpleAccessNeedsInput(SIMPLE_QA_FLOWS.AI, input);
  if (accessNeedsInput) return accessNeedsInput;

  const runInput = buildAiRunInput({ ...input, after_feedback: normalizeAfterFeedback(input.after_feedback) });
  const queued = await apiClient.requestRun(runInput);
  await maybeSendProgress(extra, 1, 3, `Queued AI QA run ${queued.run_id}`);
  const waitResult = await apiClient.waitForRun(queued.run_id, {
    timeout_seconds: resolveMcpWaitSliceSeconds(input),
    poll_interval_seconds: 5,
    signal: extra.signal
  });
  return finishSimpleAiWait(apiClient, queued.run_id, waitResult, input);
}

async function startSimpleSelfReview(apiClient, input = {}) {
  if (!safeText(input.target_url, 4096)) {
    return buildSimpleNeedsInputToolResult(SIMPLE_QA_FLOWS.SELF, input, {
      missing_fields: ["target_url"],
      prompt: "What preview, staging, or production URL do you want to review yourself?"
    });
  }
  const response = await apiClient.createManualQaSession(
    buildSelfReviewInput({ ...input, after_feedback: normalizeAfterFeedback(input.after_feedback) })
  );
  const session = response.session && typeof response.session === "object" ? response.session : {};
  const widgetInstall = response.widget_install && typeof response.widget_install === "object" ? response.widget_install : {};
  const resumeToken = buildResumeToken({
    flow: SIMPLE_QA_FLOWS.SELF,
    id: session.session_id || response.session_id,
    input
  });
  const result = {
    ok: true,
    state: "needs_setup",
    flow: SIMPLE_QA_FLOWS.SELF,
    session_id: session.session_id || response.session_id,
    reason: "Install and verify the in-page review widget before giving the review link to the user.",
    resume_token: resumeToken,
    required_action: {
      type: "install_and_verify_widget",
      script_tag: widgetInstall.script_tag || null,
      verify_expression: widgetInstall.verify_expression || "window.__beforeUsersDoWidgetLoaded === true",
      verify_selector: widgetInstall.verify_selector || "#beforeusersdo-widget-root",
      review_url: widgetInstall.review_url || response.review_url || session.target_url || null,
      report_url: response.manual_session_url || session.session_url || null,
      completion_condition: "The server session reports widget.installed=true."
    },
    next_tool: buildSimpleNextTool(resumeToken, { setup_verified: true })
  };
  return makeSimpleStateResult(result, [
    widgetInstall.script_tag ? "Required widget:" : "",
    widgetInstall.script_tag ? "```html" : "",
    widgetInstall.script_tag || "",
    widgetInstall.script_tag ? "```" : "",
    result.required_action.review_url ? `Review link after verification: ${result.required_action.review_url}` : ""
  ]);
}

async function startSimpleHumanTest(apiClient, input = {}) {
  const normalizedInput = { ...input };
  const mappedInput = buildHumanTestInput(normalizedInput);
  const needsInput = buildHumanTestNeedsInputResult(mappedInput);
  if (needsInput) {
    return buildSimpleNeedsInputToolResult(SIMPLE_QA_FLOWS.HUMAN, normalizedInput, needsInput);
  }
  const response = await apiClient.requestHumanTest(normalizeHumanTestFundingInput(mappedInput));
  const request = response.request && typeof response.request === "object" ? response.request : {};
  const resumeToken = buildResumeToken({
    flow: SIMPLE_QA_FLOWS.HUMAN,
    id: request.id,
    input: normalizedInput
  });
  const result = {
    ...response,
    ok: true,
    state: "running",
    flow: SIMPLE_QA_FLOWS.HUMAN,
    request_id: request.id,
    reason:
      request.status === "queued"
        ? "The funded request is created and awaiting publication; no tester is matching yet."
        : `Human QA is ${request.status || "starting"}.`,
    resume_token: resumeToken,
    continue_polling: false,
    poll_after_seconds: 300,
    next_tool: buildSimpleNextTool(resumeToken)
  };
  return makeSimpleStateResult(result);
}

async function continueSimpleAi(apiClient, parsed, input = {}, extra = {}) {
  const waitResult = await apiClient.waitForRun(parsed.id, {
    timeout_seconds: Math.min(MAX_MCP_WAIT_SLICE_SECONDS, Number(input.wait_seconds) || DEFAULT_MCP_WAIT_SLICE_SECONDS),
    poll_interval_seconds: 5,
    signal: extra.signal
  });
  return finishSimpleAiWait(apiClient, parsed.id, waitResult, parsed.input);
}

async function continueSimpleSelf(apiClient, parsed, input = {}, extra = {}) {
  const response = await apiClient.getManualQaSession(parsed.id);
  const session = response.session && typeof response.session === "object" ? response.session : {};
  const resumeToken = buildResumeToken({ flow: SIMPLE_QA_FLOWS.SELF, id: parsed.id, input: parsed.input });
  if (session.widget?.installed !== true) {
    const result = {
      ok: true,
      state: "needs_setup",
      flow: SIMPLE_QA_FLOWS.SELF,
      session_id: parsed.id,
      reason: "The BeforeUsersDo server has not detected the widget on the target page yet.",
      resume_token: resumeToken,
      required_action: {
        type: "install_and_verify_widget",
        completion_condition: "The server session reports widget.installed=true.",
        report_url: session.session_url || null
      },
      next_tool: buildSimpleNextTool(resumeToken, { setup_verified: true })
    };
    return makeSimpleStateResult(result);
  }

  const waitResult = await apiClient.waitForManualFeedback(parsed.id, {
    scope: "all",
    wait_forever: false,
    timeout_seconds: Math.min(MAX_MCP_WAIT_SLICE_SECONDS, Number(input.wait_seconds) || DEFAULT_MCP_WAIT_SLICE_SECONDS),
    poll_interval_seconds: 5,
    signal: extra.signal
  });
  if (!waitResult.feedback_ready) {
    const result = {
      ok: true,
      state: "running",
      flow: SIMPLE_QA_FLOWS.SELF,
      session_id: parsed.id,
      reason: "The self-review widget is installed and waiting for the user to click Send All.",
      resume_token: resumeToken,
      continue_polling: true,
      review_url: session.target_url || null,
      report_url: session.session_url || null,
      next_tool: buildSimpleNextTool(resumeToken)
    };
    return makeSimpleStateResult(result);
  }

  const [report, packets] = await Promise.all([
    apiClient.exportManualQaSession(parsed.id),
    apiClient.getManualQaWorkPackets(parsed.id)
  ]);
  const requiredAgentAction = buildManualFeedbackRequiredAction(parsed.id, waitResult.feedback, {
    feedback_action: buildSelfReviewInput(parsed.input).feedback_action
  });
  const result = {
    ok: true,
    state: "complete",
    flow: SIMPLE_QA_FLOWS.SELF,
    session_id: parsed.id,
    reason: "The self-review feedback and report are ready.",
    continue_polling: false,
    feedback: waitResult.feedback,
    report,
    work_packets: packets.work_packets || packets.session?.work_packets || [],
    report_url: report.session?.session_url || session.session_url || null,
    required_agent_action: requiredAgentAction
  };
  return makeSimpleStateResult(result, [
    result.report_url ? `Report: ${result.report_url}` : "",
    buildAgentActionText(requiredAgentAction)
  ]);
}

async function continueSimpleHuman(apiClient, parsed) {
  const response = await apiClient.getHumanTestRequest(parsed.id);
  const request = response.request && typeof response.request === "object" ? response.request : {};
  const status = safeText(request.status, 40).toLowerCase();
  const resumeToken = buildResumeToken({ flow: SIMPLE_QA_FLOWS.HUMAN, id: parsed.id, input: parsed.input });
  if (status === "cancelled") {
    return makeSimpleStateResult({
      ...response,
      ok: false,
      state: "failed",
      flow: SIMPLE_QA_FLOWS.HUMAN,
      request_id: parsed.id,
      reason: "The human QA request was cancelled.",
      continue_polling: false
    });
  }

  if (!["submitted", "completed"].includes(status) || !request.trial_session_id) {
    const result = {
      ...response,
      ok: true,
      state: ["submitted", "completed"].includes(status) ? "processing_report" : "running",
      flow: SIMPLE_QA_FLOWS.HUMAN,
      request_id: parsed.id,
      reason:
        ["submitted", "completed"].includes(status)
          ? "The tester submitted, but the report session is not ready yet."
          : `Human QA is ${status || "starting"}.`,
      resume_token: resumeToken,
      continue_polling: false,
      poll_after_seconds: 300,
      next_tool: buildSimpleNextTool(resumeToken)
    };
    return makeSimpleStateResult(result);
  }

  const report = await apiClient.exportManualQaSession(request.trial_session_id);
  const readiness = getHumanReportReadiness(report);
  if (!readiness.ready) {
    const result = {
      ...response,
      ok: readiness.state !== "needs_review",
      state: readiness.state,
      flow: SIMPLE_QA_FLOWS.HUMAN,
      request_id: parsed.id,
      reason: readiness.reason,
      report,
      evidence: {
        video_count: readiness.video_count,
        analysis_status: readiness.analysis_status
      },
      resume_token: resumeToken,
      continue_polling: readiness.state === "processing_report",
      poll_after_seconds: readiness.state === "processing_report" ? 60 : null,
      next_tool: readiness.state === "processing_report" ? buildSimpleNextTool(resumeToken) : null
    };
    return makeSimpleStateResult(result);
  }

  const result = {
    ...response,
    ok: true,
    state: "complete",
    flow: SIMPLE_QA_FLOWS.HUMAN,
    request_id: parsed.id,
    reason: readiness.reason,
    continue_polling: false,
    report,
    report_url: report.session?.session_url || null,
    evidence: {
      video_count: readiness.video_count,
      analysis_status: readiness.analysis_status
    }
  };
  return makeSimpleStateResult(result, [result.report_url ? `Report: ${result.report_url}` : ""]);
}

function registerSimplifiedQaTools(server, apiClient) {
  server.registerTool(
    "qa_ai_test",
    {
      title: "Run AI QA",
      description:
        "PRIMARY AI QA TOOL. Use when the user wants BeforeUsersDo or an AI agent to test a site, app, feature, or flow. Defaults to a report only. Follow the returned state and use qa_continue when directed.",
      inputSchema: buildSimpleAiTestInputSchema()
    },
    async (input, extra) => {
      try {
        return await startSimpleAiTest(apiClient, input, extra);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_self_review",
    {
      title: "Start My Self-Review",
      description:
        "PRIMARY SELF-REVIEW TOOL. Use only when the user wants to personally test or record feedback on their own product. It returns a required widget installation step and does not become ready until the server detects the widget.",
      inputSchema: buildSimpleSelfReviewInputSchema()
    },
    async (input) => {
      try {
        return await startSimpleSelfReview(apiClient, input);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_hire_tester",
    {
      title: "Hire a Human Tester",
      description:
        "PRIMARY HUMAN QA TOOL. Use when the user asks for someone else, a real person, or a QA professional to test. Funding and an exact paid budget are server-enforced. A free qualification trial is allowed only when explicitly selected. Completion requires video plus transcript-derived analysis.",
      inputSchema: buildSimpleHumanTestInputSchema()
    },
    async (input) => {
      try {
        return await startSimpleHumanTest(apiClient, input);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_continue",
    {
      title: "Continue BeforeUsersDo QA",
      description:
        "PRIMARY RESUME TOOL. Use the resume_token from qa_ai_test, qa_self_review, or qa_hire_tester. Relay needs_input.question exactly, perform needs_setup.required_action, and do not claim completion until state=complete.",
      inputSchema: buildSimpleContinueInputSchema()
    },
    async (input, extra) => {
      try {
        const parsed = parseResumeToken(input.resume_token);
        if (!parsed.ok) {
          return makeSimpleStateResult({
            ok: false,
            state: "failed",
            reason: parsed.error,
            continue_polling: false
          });
        }
        if (!parsed.id) {
          const mergedInput = mergeResumeInput(parsed.input, input);
          if (parsed.flow === SIMPLE_QA_FLOWS.AI) return await startSimpleAiTest(apiClient, mergedInput, extra);
          if (parsed.flow === SIMPLE_QA_FLOWS.SELF) return await startSimpleSelfReview(apiClient, mergedInput);
          return await startSimpleHumanTest(apiClient, mergedInput);
        }
        if (parsed.flow === SIMPLE_QA_FLOWS.AI) return await continueSimpleAi(apiClient, parsed, input, extra);
        if (parsed.flow === SIMPLE_QA_FLOWS.SELF) return await continueSimpleSelf(apiClient, parsed, input, extra);
        return await continueSimpleHuman(apiClient, parsed);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );
}

async function createManualSessionToolResult(apiClient, input, options = {}) {
  if (options.allowMissingTargetUrl) {
    const needsInput = buildManualReviewNeedsInputResult(input);
    if (needsInput) {
      return needsInput;
    }
  }

  const hasExplicitAction = Boolean(
    input.feedback_action ||
      input.feedbackAction ||
      input.agent_action_mode ||
      input.agentActionMode ||
      input.auto_start_work !== undefined ||
      input.autoStartWork !== undefined
  );
  const response = await apiClient.createManualQaSession(
    hasExplicitAction ? input : { ...input, feedback_action: "share_feedback" }
  );
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
      description: "Manual reviewer feedback exported as Markdown for a coding agent.",
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
        "Use when the user wants to review the product themselves with a checklist, drawing, voice, or screen recording. Start with qa_self_review. For another real person, use qa_hire_tester.",
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
  const apiClient = options.apiClient || createQaApiClient(options);
  const server = new McpServer(
    {
      name: "beforeusersdo-qa",
      version: pkg.version || "1.0.0"
    },
    {
      instructions:
        "Use the four primary tools: qa_ai_test for AI testing, qa_self_review when the user will test personally, qa_hire_tester for another real person, and qa_continue for every next step. Treat all other qa_* tools as legacy compatibility tools. In a primary flow, relay needs_input.question exactly, obey needs_setup.required_action, and never say a test is complete unless state=complete.",
      capabilities: {
        logging: {}
      }
    }
  );

  registerQaResources(server, apiClient);
  registerQaPrompts(server);
  registerSimplifiedQaTools(server, apiClient);

  server.registerTool(
    "qa_request_run",
    {
      title: "Legacy: Request QA Run",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_ai_test, then use qa_continue with its resume_token. This low-level tool remains for existing integrations.",
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
      title: "Legacy: Get QA Status",
      description: "LEGACY COMPATIBILITY TOOL. Prefer qa_continue with the resume_token from qa_ai_test.",
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
      title: "Legacy: Wait For QA Run",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_continue. Poll a low-level QA run in client-safe slices for existing integrations.",
      inputSchema: {
        run_id: z.string().max(128),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        poll_interval_seconds: z.number().int().min(1).max(120).optional(),
        wait_slice_seconds: z
          .number()
          .int()
          .min(1)
          .max(MAX_MCP_WAIT_SLICE_SECONDS)
          .optional()
          .describe("Maximum time this MCP call waits before handing polling back to the agent. Defaults to 35 seconds."),
        include_report: z.boolean().optional(),
        share_after: z.boolean().optional(),
        feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback. Use preview_fix_first when the user wants a simulated fix preview before coding, or share_feedback_and_start_work when they want fixes to start automatically."),
        agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
        auto_start_work: z.boolean().optional().describe("Boolean alias.")
      }
    },
    async ({ run_id, timeout_seconds, poll_interval_seconds, wait_slice_seconds, include_report, share_after, feedback_action, agent_action_mode, auto_start_work }, extra) => {
      try {
        let tick = 0;
        const pollEvery = Math.max(1, Number(poll_interval_seconds || 5));
        const waitWindowSeconds = resolveMcpWaitSliceSeconds({ timeout_seconds, wait_slice_seconds });
        const waitResult = await apiClient.waitForRun(run_id, {
          timeout_seconds: waitWindowSeconds,
          poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              tick,
              Math.max(1, Math.ceil((Number(timeout_seconds || 1200) || 1200) / pollEvery)),
              `Run ${run_id} is ${resolveRunDisplayStatus(status)}`
            );
          }
        });

        if (waitResult.timed_out === true) {
          const handoff = buildRunPollingHandoff(run_id, waitResult.status || {}, {
            timeout_seconds,
            wait_slice_seconds,
            share_after,
            feedback_action,
            agent_action_mode,
            auto_start_work
          });
          return makeToolResult(handoff.text, {
            ...handoff.result,
            poll_count: waitResult.poll_count,
            elapsed_ms: waitResult.elapsed_ms
          });
        }

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
          if (shouldReturnQaAction(outcome, { feedback_action, agent_action_mode, auto_start_work })) {
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
      title: "Legacy: Get QA Report",
      description: "LEGACY COMPATIBILITY TOOL. Prefer qa_continue, which returns the report only when the selected QA flow is ready.",
      inputSchema: {
        run_id: z.string().max(128),
        feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Preferred setting. Defaults to share_feedback. Use preview_fix_first when the user wants a simulated fix preview before coding, or share_feedback_and_start_work when they want fixes to start automatically."),
        agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
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
        if (shouldReturnQaAction(outcome, { feedback_action, agent_action_mode, auto_start_work })) {
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
      title: "Legacy: Share QA Report",
      description: "LEGACY COMPATIBILITY TOOL. Create or refresh a shareable team link for an existing low-level run.",
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
    "qa_request_human_test",
    {
      title: "Legacy: Request a Real Human Tester",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_hire_tester, which enforces funding and returns a qa_continue resume token. Never infer funding, a zero-dollar cost, or qualification_trial.",
      inputSchema: buildHumanTestInputSchema({ targetRequired: false })
    },
    async (input) => {
      try {
        const needsInput = buildHumanTestNeedsInputResult(input);
        if (needsInput) return needsInput;
        const response = await apiClient.requestHumanTest(normalizeHumanTestFundingInput(input));
        const structured = {
          ...response,
          matching_started: response.request?.status !== "queued",
          funding_confirmed: true
        };
        return makeToolResult(buildHumanTestRequestText(structured), structured);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_get_human_test_status",
    {
      title: "Legacy: Get Human Test Status",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_continue, which also verifies that video and transcript-derived analysis are ready.",
      inputSchema: {
        request_id: z.string().max(128)
      }
    },
    async ({ request_id }) => {
      try {
        const response = await apiClient.getHumanTestRequest(request_id);
        const request = response.request && typeof response.request === "object" ? response.request : {};
        let report = null;
        if (
          request.trial_session_id &&
          ["submitted", "completed"].includes(safeText(request.status, 40).toLowerCase())
        ) {
          try {
            report = await apiClient.exportManualQaSession(request.trial_session_id);
          } catch {
            report = null;
          }
        }
        const result = { ...response, report };
        return makeToolResult(buildHumanTestStatusText(result), result);
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_create_manual_session",
    {
      title: "Legacy: Create Manual QA Session",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_self_review, which server-checks widget installation and returns a qa_continue resume token.",
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
      title: "Legacy: Start BeforeUsersDo Manual Review",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_self_review. Do not use this for another person; use qa_hire_tester.",
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
      title: "Legacy: BeforeUsersDo Manual Review Guide",
      description:
        "LEGACY COMPATIBILITY TOOL. New flows should call qa_self_review directly. If the user wants someone else to test, call qa_hire_tester.",
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
        recommended_tool: "qa_self_review",
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
      description: "Export the manual self-review checklist as redacted Markdown and JSON.",
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
    "qa_get_manual_work_packets",
    {
      title: "Get Manual QA Work Packets",
      description:
        "Fetches BeforeUsersDo work packets derived from manual QA notes, transcript, drawings, videos, page anchors, console errors, and network signals. Use after qa_wait_for_manual_feedback or qa_wait_for_manual_evidence when the agent should split feedback into focused tasks or sub-agents.",
      inputSchema: {
        session_id: z.string().max(128)
      }
    },
    async ({ session_id }) => {
      try {
        const response = await apiClient.getManualQaWorkPackets(session_id);
        const gatedResponse = attachPostFixReviewGateToManualPackets(response);
        return makeToolResult(buildManualWorkPacketsText(gatedResponse), gatedResponse);
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
        "Use while the user is still recording in the BeforeUsersDo widget. Polls until saved draft evidence exists, such as 10-second video segments, drawings, or live work packets, without waiting for the user to click Send All. If auto-start work is enabled, begin work from stable packets while continuing to poll.",
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
        "Use after starting a BeforeUsersDo manual review and giving the verified widget page to the user. Defaults to wait_forever=true: keep the agent turn alive until the user clicks Send All or Send item, then return the redacted Markdown feedback directly so the user does not need to copy/paste.",
      inputSchema: {
        session_id: z.string().max(128),
        scope: z.enum(["all", "item", "any"]).optional().describe("Defaults to all. Use item with item_id for one checklist item, or any for the latest package."),
        item_id: z.string().max(80).optional(),
        timeout_seconds: z.number().int().min(1).max(7200).optional(),
        wait_forever: z.boolean().optional().describe("Defaults to true for manual QA. Keep polling until feedback arrives or the MCP client aborts. Set false only if the user explicitly wants a bounded wait."),
        poll_interval_seconds: z.number().min(0.1).max(120).optional(),
        feedback_action: z.enum(["share_feedback", "preview_fix_first", "share_feedback_and_start_work"]).optional().describe("Overrides the session setting. Defaults to report-only share_feedback. Use preview_fix_first for a simulated fix preview, or share_feedback_and_start_work only with explicit permission."),
        agent_action_mode: z.enum(["report_only", "preview_then_fix", "fix_and_retest"]).optional().describe("Legacy alias for feedback_action."),
        auto_start_work: z.boolean().optional().describe("Boolean alias override.")
      }
    },
    async (input, extra) => {
      try {
        const waitResult = await apiClient.waitForManualFeedback(input.session_id, {
          scope: input.scope || "all",
          item_id: input.item_id,
          wait_forever: input.wait_forever !== false,
          timeout_seconds: input.timeout_seconds || 1800,
          poll_interval_seconds: input.poll_interval_seconds || 5,
          signal: extra.signal,
          async onPoll(status, meta) {
            const boundedTotal = Math.max(2, Math.ceil(Number(input.timeout_seconds || 1800) / Number(input.poll_interval_seconds || 5)));
            await maybeSendProgress(
              extra,
              meta.poll_count,
              input.wait_forever === false ? boundedTotal : Math.max(meta.poll_count + 1, 2),
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
            "This should only happen when wait_forever=false. Ask the user to click Send All in the BeforeUsersDo widget, then call this tool again with wait_forever=true.",
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
    "qa_submit_manual_preview",
    {
      title: "Submit Manual QA Preview Proposal",
      description:
        "Use after qa_wait_for_manual_feedback returns preview_required_before_work. Saves the proposed future-state fix into the open BeforeUsersDo widget so the user can approve or request changes before coding.",
      inputSchema: {
        session_id: z.string().max(128),
        title: z.string().max(180).optional().describe("Short preview title, for example 'Cleaner homepage hero'."),
        summary: z.string().max(2400).optional().describe("Plain-English summary of what the fixed state will look like or do."),
        changes: z.array(z.string().max(700)).max(12).optional().describe("Concrete proposed changes mapped from the feedback."),
        expected_behavior: z.array(z.string().max(700)).max(12).optional().describe("Expected visual, browser, API, or state behavior after the fix."),
        open_questions: z.array(z.string().max(500)).max(6).optional().describe("Optional questions the user should answer before implementation."),
        visual_preview_url: z.string().url().optional().describe("Optional mockup or edited screenshot URL.")
      }
    },
    async (input) => {
      try {
        const proposal = {
          title: input.title,
          summary: input.summary,
          changes: input.changes,
          expected_behavior: input.expected_behavior,
          open_questions: input.open_questions,
          visual_preview_url: input.visual_preview_url,
          status: "draft"
        };
        const response = await apiClient.submitManualPreviewProposal(input.session_id, proposal);
        const preview = response.preview_proposal || {};
        return makeToolResult(
          buildText([
            `Preview proposal saved for ${input.session_id}.`,
            preview.title ? `Title: ${preview.title}` : "",
            "The BeforeUsersDo widget will show it in the Proposed fix panel.",
            "Wait for the user to approve it or ask for changes before editing code."
          ]),
          {
            ...response,
            required_next_step: "wait_for_user_preview_response"
          }
        );
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_submit_post_fix_review",
    {
      title: "Submit Post-Fix Review",
      description:
        "Use after implementation and deployment/refresh. Records the fresh contextless reviewer verdict. Returns may_mark_done=false when the reviewer found missed or unclear feedback, so the implementing agent must continue work.",
      inputSchema: {
        session_id: z.string().max(128).optional().describe("Manual QA session id. Required to persist the verdict on a manual QA session."),
        run_id: z.string().max(128).optional().describe("Automated QA run id when this review is for qa_check_work or qa_run_feature_check."),
        feedback_id: z.string().max(128).optional(),
        reviewer: z.string().max(160).optional().describe("Name/id of the fresh contextless reviewer."),
        verdict: z.enum(["fixed", "missed", "still_unclear"]).describe("Reviewer verdict after comparing original feedback to the fixed result."),
        fixed_url: z.string().url().optional().describe("Fixed preview or production URL reviewed."),
        changed_files: z.array(z.string().max(500)).max(80).optional(),
        commit_sha: z.string().max(120).optional(),
        packet_ids: z.array(z.string().max(128)).max(24).optional(),
        fixed_items: z.array(z.string().max(900)).max(24).optional(),
        missed_items: z.array(z.string().max(900)).max(24).optional(),
        unclear_items: z.array(z.string().max(900)).max(24).optional(),
        summary: z.string().max(4000).optional(),
        evidence_urls: z.array(z.string().url()).max(24).optional(),
        test_results: z.array(z.string().max(500)).max(24).optional()
      }
    },
    async (input) => {
      try {
        const review = buildPostFixReviewRecord(input);
        if (!review.session_id && !review.run_id) {
          return makeToolResult(
            "Post-fix review needs either session_id or run_id.",
            {
              ok: false,
              needs_input: true,
              missing_fields: ["session_id_or_run_id"],
              post_fix_review: review,
              may_mark_done: false
            }
          );
        }

        if (review.session_id) {
          const response = await apiClient.submitManualPostFixReview(review.session_id, review);
          return makeToolResult(
            buildText([
              `Post-fix review saved for ${review.session_id}.`,
              `Verdict: ${response.post_fix_review?.verdict || review.verdict}.`,
              `May mark done: ${response.may_mark_done === true ? "yes" : "no"}.`,
              response.may_mark_done === true
                ? "Reviewer passed the fixed result. Share the reviewer verdict and fresh QA link."
                : "Reviewer found missed or unclear feedback. Continue work before marking done."
            ]),
            response
          );
        }

        return makeToolResult(
          buildText([
            `Post-fix review recorded for run ${review.run_id}.`,
            `Verdict: ${review.verdict}.`,
            `May mark done: ${review.may_mark_done ? "yes" : "no"}.`,
            review.may_mark_done
              ? "Reviewer passed the fixed result. Share the reviewer verdict and fresh QA link."
              : "Reviewer found missed or unclear feedback. Continue work before marking done."
          ]),
          {
            ok: true,
            run_id: review.run_id,
            post_fix_review: review,
            may_mark_done: review.may_mark_done
          }
        );
      } catch (error) {
        return makeToolError(error);
      }
    }
  );

  server.registerTool(
    "qa_run_feature_check",
    {
      title: "Legacy: Run Feature QA",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_ai_test and qa_continue.",
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
        const waitWindowSeconds = resolveMcpWaitSliceSeconds(input);
        const waitResult = await apiClient.waitForRun(queued.run_id, {
          timeout_seconds: waitWindowSeconds,
          poll_interval_seconds: input.poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              1 + tick,
              Math.max(2, 2 + Math.ceil((Number(input.timeout_seconds || 1200) || 1200) / pollEvery)),
              `Run ${queued.run_id} is ${resolveRunDisplayStatus(status)}`
            );
          }
        });

        if (waitResult.timed_out === true) {
          const handoff = buildRunPollingHandoff(queued.run_id, waitResult.status || {}, input);
          return makeToolResult(handoff.text, {
            ...handoff.result,
            queued,
            wait: waitResult,
            ui_report_url: queued.ui_report_url || waitResult.status?.ui_report_url || null
          });
        }

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
        if (shouldReturnQaAction(outcome, input)) {
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
      title: "Legacy: QA Check Work",
      description:
        "LEGACY COMPATIBILITY TOOL. Prefer qa_ai_test and qa_continue. This tool remains for coding-agent integrations that depend on its older schema.",
      inputSchema: buildCodingAgentCheckInputSchema()
    },
    async (input, extra) => {
      try {
        const qaInput = buildCodingAgentQaInput(input);
        const queued = await apiClient.requestRun(qaInput);
        await maybeSendProgress(extra, 1, 3, `Queued QA check ${queued.run_id}`);

        let tick = 0;
        const pollEvery = Math.max(1, Number(input.poll_interval_seconds || 5));
        const waitWindowSeconds = resolveMcpWaitSliceSeconds(input);
        const waitResult = await apiClient.waitForRun(queued.run_id, {
          timeout_seconds: waitWindowSeconds,
          poll_interval_seconds: input.poll_interval_seconds,
          signal: extra.signal,
          async onPoll(status) {
            tick += 1;
            await maybeSendProgress(
              extra,
              1 + tick,
              Math.max(2, 2 + Math.ceil((Number(input.timeout_seconds || 1200) || 1200) / pollEvery)),
              `QA check ${queued.run_id} is ${resolveRunDisplayStatus(status)}`
            );
          }
        });

        if (waitResult.timed_out === true) {
          const handoff = buildRunPollingHandoff(queued.run_id, waitResult.status || {}, {
            ...input,
            feedback_action: input.feedback_action || "share_feedback"
          });
          return makeToolResult(handoff.text, {
            ...handoff.result,
            target_url: qaInput.target_url || input.target_url,
            queued,
            wait: waitResult,
            evidence: {
              ui_report_url: queued.ui_report_url || waitResult.status?.ui_report_url || null,
              status_resource: `qa://runs/${encodeURIComponent(queued.run_id)}/status`,
              report_resource: `qa://runs/${encodeURIComponent(queued.run_id)}/report`,
              markdown_resource: `qa://runs/${encodeURIComponent(queued.run_id)}/report.md`
            }
          });
        }

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
        const qaCheckActionInput = { ...input, feedback_action: input.feedback_action || "share_feedback" };
        if (shouldReturnQaAction(outcome, qaCheckActionInput)) {
          result.required_agent_action = buildAutomatedQaRequiredAction(queued.run_id, outcome, qaCheckActionInput);
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
    "- HUMAN_TEST_CREDENTIALS_SECRET: recommended encryption secret for private human-test logins",
    "",
    "Primary tools:",
    "- qa_ai_test",
    "- qa_self_review",
    "- qa_hire_tester",
    "- qa_continue",
    "",
    "Legacy compatibility tools:",
    "- qa_request_run",
    "- qa_get_run_status",
    "- qa_wait_for_run",
    "- qa_get_run_report",
    "- qa_share_run_report",
    "- qa_request_human_test",
    "- qa_get_human_test_status",
    "- qa_create_manual_session",
    "- qa_start_manual_review",
    "- qa_manual_review_guide",
    "- qa_get_manual_session",
    "- qa_get_manual_report",
    "- qa_get_manual_work_packets",
    "- qa_wait_for_manual_evidence",
    "- qa_wait_for_manual_feedback",
    "- qa_submit_manual_preview",
    "- qa_submit_post_fix_review",
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
  attachPostFixReviewGateToManualPackets,
  buildAutomatedQaRequiredAction,
  buildAgentActionContract,
  buildAgentActionText,
  buildPostFixReviewRecord,
  buildManualFeedbackActionText,
  buildManualFeedbackRequiredAction,
  buildHumanTestNeedsInputResult,
  buildHumanTestRequestText,
  buildHumanTestStatusText,
  normalizeHumanTestFundingInput,
  buildRunPollingHandoff,
  buildManualReviewNeedsInputResult,
  buildManualReviewWorkflowText,
  createQaMcpServer,
  registerQaPrompts,
  registerQaResources,
  resolveMcpWaitSliceSeconds,
  shouldReturnQaAction,
  main
};
