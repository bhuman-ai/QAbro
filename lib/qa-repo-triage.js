const path = require("path");
const { spawnSync } = require("child_process");

const {
  isPlainObject,
  loadStoredReportByRunId,
  sanitizeEngineeringTriage,
  sanitizeRepoTriageConfig,
  sanitizeRepoTriageState,
  sanitizeString
} = require("./qa-core");
const { buildQueuePayload, updateQueueRow } = require("./qa-queue");

const REPO_TRIAGE_ACTIVE_STATUS_SET = new Set(["queued", "processing"]);
const ENGINEERING_SIGNAL_TYPES = new Set(["bug", "dead_end", "performance_issue"]);
const STOP_WORDS = new Set([
  "after",
  "again",
  "button",
  "cannot",
  "click",
  "clear",
  "complete",
  "continue",
  "during",
  "error",
  "field",
  "flow",
  "from",
  "into",
  "just",
  "more",
  "next",
  "page",
  "screen",
  "site",
  "step",
  "stuck",
  "than",
  "that",
  "their",
  "there",
  "they",
  "this",
  "user",
  "when",
  "with"
]);

function isRepoTriageActiveStatus(value) {
  const status = sanitizeString(value, 64).toLowerCase();
  return REPO_TRIAGE_ACTIVE_STATUS_SET.has(status);
}

function readRunRequestRepoTriage(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  return sanitizeRepoTriageConfig(metadata.repo_triage || metadata.repoTriage);
}

function buildInitialRepoTriageState(runRequest) {
  const config = readRunRequestRepoTriage(runRequest);
  return sanitizeRepoTriageState({
    ...config,
    status: config.enabled ? "pending_blind_report" : "disabled",
    summary: config.enabled
      ? "Blind QA is running. Code-aware diagnosis unlocks only after the blind report is ready."
      : null,
    updated_at: new Date().toISOString()
  });
}

function findingHasEngineeringSignal(finding) {
  if (!isPlainObject(finding)) {
    return false;
  }

  const type = sanitizeString(finding.type, 64).toLowerCase();
  const evidence = isPlainObject(finding.evidence) ? finding.evidence : {};
  const diagnostics = isPlainObject(finding.diagnostic_details) ? finding.diagnostic_details : {};

  return (
    ENGINEERING_SIGNAL_TYPES.has(type) ||
    (Array.isArray(evidence.console_logs) && evidence.console_logs.length > 0) ||
    (Array.isArray(evidence.network_logs) && evidence.network_logs.length > 0) ||
    Boolean(
      diagnostics.current_url ||
        diagnostics.current_state ||
        diagnostics.failure_reason ||
        diagnostics.last_successful_step
    )
  );
}

function collectRepoTriageCandidates(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const candidates = findings.filter(findingHasEngineeringSignal);

  return candidates.slice(0, 6);
}

function shouldEnqueueRepoTriage(report, runRequest) {
  const config = readRunRequestRepoTriage(runRequest);
  if (!config.enabled) {
    return {
      enabled: false,
      shouldQueue: false,
      reason: "Code-aware diagnosis is disabled for this run.",
      config,
      findings: []
    };
  }

  const findings = collectRepoTriageCandidates(report);
  if (!findings.length) {
    return {
      enabled: true,
      shouldQueue: false,
      reason: "Blind QA did not capture a high-signal bug, dead end, or code-level failure trace.",
      config,
      findings: []
    };
  }

  const signalTypes = Array.from(
    new Set(findings.map((finding) => sanitizeString(finding?.type, 64).toLowerCase()).filter(Boolean))
  );
  return {
    enabled: true,
    shouldQueue: true,
    reason: "",
    config,
    findings,
    signalTypes
  };
}

function normalizeRepoSearchRoots(repoRoot, allowlist) {
  const safeRoot = path.resolve(String(repoRoot || process.cwd()));
  const requestedRoots = Array.isArray(allowlist) ? allowlist : [];
  const roots = [];

  for (const entry of requestedRoots) {
    const rawEntry = sanitizeString(entry, 320);
    if (!rawEntry) {
      continue;
    }
    const resolved = path.resolve(safeRoot, rawEntry);
    if (resolved === safeRoot || resolved.startsWith(`${safeRoot}${path.sep}`)) {
      roots.push(resolved);
    }
  }

  return roots.length ? roots : [safeRoot];
}

function extractPathTokens(urlValue) {
  const raw = sanitizeString(urlValue, 4096);
  if (!raw) {
    return [];
  }

  try {
    const parsed = new URL(raw);
    return parsed.pathname
      .split("/")
      .flatMap((segment) => segment.split(/[-_]/g))
      .map((segment) => segment.trim().toLowerCase())
      .filter((segment) => segment.length >= 3 && !STOP_WORDS.has(segment))
      .slice(0, 6);
  } catch {
    return [];
  }
}

function extractKeywordTokens(value, maxItems = 8) {
  const raw = sanitizeString(value, 500).toLowerCase();
  if (!raw) {
    return [];
  }

  const tokens = [];
  const seen = new Set();
  for (const token of raw.split(/[^a-z0-9]+/g)) {
    if (token.length < 4 || STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= maxItems) {
      break;
    }
  }
  return tokens;
}

function buildFindingQueries(finding) {
  const queries = [];
  const seen = new Set();
  const title = sanitizeString(finding?.title, 180);
  const currentUrl = sanitizeString(
    finding?.diagnostic_details?.current_url || finding?.page?.url,
    4096
  );
  const observedBehavior = sanitizeString(finding?.observed_behavior, 500);

  function pushQuery(term, kind, weight) {
    const safeTerm = sanitizeString(term, 180);
    if (!safeTerm) {
      return;
    }
    const dedupeKey = `${kind}:${safeTerm.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    queries.push({ term: safeTerm, kind, weight });
  }

  if (title.split(/\s+/).length >= 2) {
    pushQuery(title, "title", 5);
  }
  for (const token of extractPathTokens(currentUrl)) {
    pushQuery(token, "route", 4);
  }
  for (const token of extractKeywordTokens(title, 5)) {
    pushQuery(token, "keyword", 2);
  }
  for (const token of extractKeywordTokens(observedBehavior, 5)) {
    pushQuery(token, "keyword", 1);
  }

  return queries.slice(0, 10);
}

function runRipgrepQuery(term, repoRoot, searchRoots) {
  const roots = searchRoots
    .map((root) => path.relative(repoRoot, root) || ".")
    .filter(Boolean);
  const args = [
    "-n",
    "--no-heading",
    "--hidden",
    "--max-count",
    "10",
    "--glob",
    "!node_modules",
    "--glob",
    "!.git",
    "--glob",
    "!dist",
    "--glob",
    "!coverage",
    "--glob",
    "!*.min.*",
    "-F",
    "-i",
    term,
    ...roots
  ];
  const result = spawnSync("rg", args, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.error) {
    return [];
  }

  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    return [];
  }

  return stdout
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (!match) {
        return null;
      }
      return {
        file: match[1],
        line: Number(match[2]) || 0,
        text: sanitizeString(match[3], 240)
      };
    })
    .filter(Boolean);
}

function buildProbableCauses(finding, matchedFiles) {
  const causes = [];
  const consoleLogs = Array.isArray(finding?.evidence?.console_logs) ? finding.evidence.console_logs : [];
  const networkLogs = Array.isArray(finding?.evidence?.network_logs) ? finding.evidence.network_logs : [];
  const observedBehavior = sanitizeString(finding?.observed_behavior, 500).toLowerCase();

  if (consoleLogs.length) {
    causes.push("Frontend state or rendering logic is likely throwing near the blocker.");
  }
  if (networkLogs.some((entry) => /\b(4\d\d|5\d\d)\b/.test(String(entry || "")))) {
    causes.push("A network contract, auth gate, or server-side validation failure likely blocks the flow.");
  }
  if (/redirect|login|sign in|sign up/.test(observedBehavior)) {
    causes.push("Route guards or post-auth redirect logic likely disagree about the success state.");
  }
  if (/spinner|loading|stuck|never/.test(observedBehavior)) {
    causes.push("An async state transition likely never resolves or never updates the visible UI.");
  }
  if (matchedFiles.length) {
    causes.push("Recent code around the matched files probably owns the broken transition or missing state guard.");
  }

  return Array.from(new Set(causes)).slice(0, 4);
}

function buildSuggestedChecks(finding, matchedFiles) {
  const checks = [];
  const currentUrl = sanitizeString(finding?.diagnostic_details?.current_url || finding?.page?.url, 320);
  if (currentUrl) {
    checks.push(`Replay the blocker on ${currentUrl} and trace the state transition immediately after the failing action.`);
  }
  if (matchedFiles.length) {
    checks.push(`Inspect the matched files first: ${matchedFiles.slice(0, 2).join(", ")}.`);
  }
  checks.push("Compare the last successful step against the blocker state to find the missing transition or guard.");

  if (Array.isArray(finding?.evidence?.network_logs) && finding.evidence.network_logs.length) {
    checks.push("Verify the request/response pair around the blocker and confirm the UI handles non-2xx outcomes.");
  }

  return Array.from(new Set(checks)).slice(0, 4);
}

function buildSuggestedTests(finding) {
  const tests = [];
  const currentUrl = sanitizeString(finding?.diagnostic_details?.current_url || finding?.page?.url, 4096);
  const pathTokens = extractPathTokens(currentUrl);
  const flowLabel = pathTokens[0] || "critical-flow";

  tests.push(`${flowLabel} happy-path e2e that asserts the user reaches the next step after submit.`);
  tests.push(`${flowLabel} regression coverage for the blocker state and recovery path.`);

  if (Array.isArray(finding?.evidence?.network_logs) && finding.evidence.network_logs.length) {
    tests.push(`${flowLabel} failure-handling test for the captured network error path.`);
  }
  if (Array.isArray(finding?.evidence?.console_logs) && finding.evidence.console_logs.length) {
    tests.push(`${flowLabel} client-side guard test that prevents the captured console error.`);
  }

  return Array.from(new Set(tests)).slice(0, 4);
}

function buildFindingDiagnosis(finding, repoRoot, config) {
  const searchRoots = normalizeRepoSearchRoots(repoRoot, config.path_allowlist);
  const queries = buildFindingQueries(finding);
  const fileScores = new Map();

  for (const query of queries) {
    const matches = runRipgrepQuery(query.term, repoRoot, searchRoots);
    for (const match of matches) {
      const key = sanitizeString(match.file, 512);
      if (!key) {
        continue;
      }

      const current = fileScores.get(key) || {
        score: 0,
        lines: [],
        matched_terms: new Set()
      };
      current.score += query.weight;
      if (match.line > 0 && current.lines.length < 3 && !current.lines.includes(match.line)) {
        current.lines.push(match.line);
      }
      current.matched_terms.add(query.term);
      fileScores.set(key, current);
    }
  }

  const rankedFiles = Array.from(fileScores.entries())
    .sort((left, right) => {
      const scoreDiff = right[1].score - left[1].score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 5);
  const suspectedFiles = rankedFiles.map(([file, details]) => {
    const firstLine = details.lines[0];
    return firstLine ? `${file}:${firstLine}` : file;
  });
  const matchedTerms = Array.from(
    new Set(rankedFiles.flatMap(([, details]) => Array.from(details.matched_terms)))
  ).slice(0, 6);
  const topScore = rankedFiles[0]?.[1]?.score || 0;
  const confidence = suspectedFiles.length
    ? Math.max(0.32, Math.min(0.92, 0.34 + topScore / 15))
    : 0.22;

  return {
    finding_id: sanitizeString(finding?.id, 128) || null,
    finding_title: sanitizeString(finding?.title, 180) || null,
    confidence,
    suspected_files: suspectedFiles,
    probable_causes: buildProbableCauses(finding, suspectedFiles),
    suggested_checks: buildSuggestedChecks(finding, suspectedFiles),
    suggested_tests: buildSuggestedTests(finding),
    matched_terms: matchedTerms
  };
}

function runLocalRepoTriage(options = {}) {
  const report = isPlainObject(options.report) ? options.report : {};
  const runRequest = isPlainObject(options.runRequest) ? options.runRequest : {};
  const config = sanitizeRepoTriageConfig(options.repoTriage || readRunRequestRepoTriage(runRequest));
  const repoRoot = path.resolve(String(options.repoRoot || process.cwd()));
  const findings = collectRepoTriageCandidates(report);
  const perFinding = findings.map((finding) => buildFindingDiagnosis(finding, repoRoot, config));
  const matchedFindingCount = perFinding.filter((item) => Array.isArray(item.suspected_files) && item.suspected_files.length).length;
  const averageConfidence =
    perFinding.length > 0
      ? perFinding.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0) / perFinding.length
      : 0;

  return sanitizeEngineeringTriage({
    summary: matchedFindingCount
      ? `Matched ${matchedFindingCount} finding${matchedFindingCount === 1 ? "" : "s"} to likely code paths in the configured workspace.`
      : "No strong file match was found in the configured workspace, but the blind evidence still suggests where to inspect next.",
    repo_label: config.repo || path.basename(repoRoot),
    confidence: averageConfidence,
    based_on: ["blind_evidence", "workspace_read"],
    generated_at: new Date().toISOString(),
    suspected_files: Array.from(
      new Set(perFinding.flatMap((item) => (Array.isArray(item.suspected_files) ? item.suspected_files : [])))
    ).slice(0, 8),
    probable_causes: Array.from(
      new Set(perFinding.flatMap((item) => (Array.isArray(item.probable_causes) ? item.probable_causes : [])))
    ).slice(0, 6),
    suggested_checks: Array.from(
      new Set(perFinding.flatMap((item) => (Array.isArray(item.suggested_checks) ? item.suggested_checks : [])))
    ).slice(0, 6),
    suggested_tests: Array.from(
      new Set(perFinding.flatMap((item) => (Array.isArray(item.suggested_tests) ? item.suggested_tests : [])))
    ).slice(0, 6),
    per_finding: perFinding
  });
}

async function updateStoredReportRepoTriage(runId, mutation = {}, options = {}) {
  const loaded = await loadStoredReportByRunId(runId, options);
  if (!loaded.ok) {
    return loaded;
  }

  const row = loaded.row;
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const reportJson = isPlainObject(payload.report_json) ? payload.report_json : {};
  const existingRepoTriage = sanitizeRepoTriageState(
    payload.repo_triage,
    readRunRequestRepoTriage(runRequest)
  );
  const nextRepoTriage = sanitizeRepoTriageState(
    {
      ...existingRepoTriage,
      ...(isPlainObject(mutation.repoTriage) ? mutation.repoTriage : {})
    },
    existingRepoTriage
  );
  let nextReportJson = reportJson;
  if (mutation.engineeringTriage !== undefined) {
    if (mutation.engineeringTriage === null) {
      const { engineering_triage: _removed, ...rest } = reportJson;
      nextReportJson = rest;
    } else {
      nextReportJson = {
        ...reportJson,
        engineering_triage: sanitizeEngineeringTriage(mutation.engineeringTriage)
      };
    }
  }

  const nextPayload = buildQueuePayload({
    existingPayload: payload,
    reportJson: nextReportJson
  });
  nextPayload.repo_triage = nextRepoTriage;

  return updateQueueRow(runId, {
    payload: nextPayload
  }, options);
}

module.exports = {
  isRepoTriageActiveStatus,
  readRunRequestRepoTriage,
  buildInitialRepoTriageState,
  shouldEnqueueRepoTriage,
  runLocalRepoTriage,
  updateStoredReportRepoTriage
};
