#!/usr/bin/env node

const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const pkg = require("../package.json");
const {
  MCP_QA_RESOURCE_TEMPLATES,
  createQaResourceReaders,
  createQaApiClient,
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
        share_after: z.boolean().optional()
      }
    },
    async ({ run_id, timeout_seconds, poll_interval_seconds, include_report, share_after }, extra) => {
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

        const text = result.report ? buildReportText(result.report) : buildStatusText(waitResult.status || {});
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
        run_id: z.string().max(128)
      }
    },
    async ({ run_id }) => {
      try {
        const response = await apiClient.getRunReport(run_id);
        return makeToolResult(buildReportText(response), response);
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
        await maybeSendProgress(extra, 999, 999, `QA run ${queued.run_id} finished`);

        const result = {
          ok: true,
          queued,
          wait: waitResult,
          report,
          share: shared
        };

        const text = report
          ? buildText([
              `QA run ${queued.run_id} finished.`,
              buildReportText(report),
              shared?.share_url ? `Share URL: ${shared.share_url}` : ""
            ])
          : buildText([
              `QA run ${queued.run_id} did not finish before the timeout.`,
              buildStatusText(waitResult.status || {})
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
    "- qa_run_feature_check",
    "",
    "Resources:",
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_status}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_report}`,
    `- ${MCP_QA_RESOURCE_TEMPLATES.run_report_markdown}`
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
  createQaMcpServer,
  registerQaResources,
  main
};
