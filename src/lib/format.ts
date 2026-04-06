import type { LaunchDraft, QaReport, ReportFinding, RunSummary } from "@/types";

export const DEFAULT_PERSONA =
  "A first-time customer trying to understand the product, finish sign-up, and reach the first useful state without help.";

export const DEFAULT_GOALS = [
  "Understand what the product does from the first screen.",
  "Start sign-up or the main get-started flow.",
  "Reach the first meaningful in-product state."
];

export const DEFAULT_CONTROLLED_UX_JOB = "Validate the main owned flow before broad live QA.";

export function normalizeValidationTarget(value: string) {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "login_signup" || safe === "login-signup" || safe === "auth" || safe === "login") {
    return "login_signup";
  }
  if (safe === "inside_product" || safe === "inside-product" || safe === "authenticated" || safe === "post_login") {
    return "inside_product";
  }
  return "public_flow";
}

export function normalizeAccessMethod(value: string, validationTarget: string) {
  const target = normalizeValidationTarget(validationTarget);
  const safe = String(value || "").trim().toLowerCase();
  if (target === "public_flow") {
    return "none";
  }
  if (safe === "auth_url" || safe === "auth-url") {
    return "auth_url";
  }
  if (safe === "credentials" || safe === "test_login" || safe === "login") {
    return "credentials";
  }
  if (safe === "app_url" || safe === "app-url" || safe === "default") {
    return "app_url";
  }
  return target === "inside_product" ? "credentials" : "app_url";
}

export function normalizePathname(pathname: string) {
  const value = String(pathname || "/").trim().toLowerCase();
  if (!value || value === "/index.html") {
    return "/";
  }
  if (value === "/dashboard.html") {
    return "/dashboard";
  }
  if (value === "/reports.html") {
    return "/reports";
  }
  if (value === "/dashboard" || value === "/reports") {
    return value;
  }
  return "/";
}

export function normalizeUrlInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function normalizeBrandKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 256);
}

export function deriveBrandKeyFromUrl(value: string) {
  const normalized = normalizeUrlInput(value);
  if (!normalized) {
    return "";
  }
  try {
    return normalizeBrandKey(new URL(normalized).hostname);
  } catch {
    return "";
  }
}

export function inferBrandName(value: string) {
  const brandKey = normalizeBrandKey(value);
  if (!brandKey) {
    return "";
  }
  return brandKey
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseGoalsText(value: string) {
  return String(value || "")
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeEntryPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      return "";
    }
  }
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalized.replace(/\/{2,}/g, "/");
}

function buildControlledScenarioList(draft: LaunchDraft) {
  const routeHints = parseGoalsText(draft.routeHintsText);
  const successSignals = parseGoalsText(draft.successSignalsText);
  const entryPath = normalizeEntryPath(draft.entryPath);
  const userJob = String(draft.userJob || "").trim();
  const scenarios = [];

  if (userJob && entryPath) {
    scenarios.push(`Start at ${entryPath} and validate this owned flow: ${userJob}`);
  } else if (userJob) {
    scenarios.push(userJob);
  } else if (entryPath) {
    scenarios.push(`Start at ${entryPath} and validate the main owned flow.`);
  } else {
    scenarios.push(DEFAULT_CONTROLLED_UX_JOB);
  }

  if (routeHints.length) {
    scenarios.push(`Stay close to these planned routes: ${routeHints.join(" -> ")}`);
  }

  if (successSignals.length) {
    scenarios.push(`Treat the run as successful only if these checks hold: ${successSignals.join("; ")}`);
  }

  return {
    scenarios: scenarios.slice(0, 12),
    entryPath,
    userJob,
    routeHints,
    successSignals
  };
}

export function buildLaunchPayload(draft: LaunchDraft, options: { retryOfRunId?: string | null; source?: string } = {}) {
  const targetUrl = normalizeUrlInput(draft.targetUrl);
  const brandKey = normalizeBrandKey(draft.brandKey || deriveBrandKeyFromUrl(targetUrl));
  const brandName = String(draft.brandName || inferBrandName(brandKey)).trim() || null;
  const qaMode = draft.runMode === "controlled_ux" ? "controlled_ux" : "live_qa";
  const validationTarget = normalizeValidationTarget(draft.validationTarget);
  const accessMethod = normalizeAccessMethod(draft.accessMethod, validationTarget);
  const authUrl = normalizeUrlInput(draft.authUrl);
  const controlled = buildControlledScenarioList(draft);
  const goals = qaMode === "controlled_ux" ? controlled.scenarios : parseGoalsText(draft.goalsText);
  const effectiveScopeMode = qaMode === "controlled_ux" ? "feature_targeted" : draft.scopeMode || "core_20m";
  const runId = `${brandKey || "swarm"}_${Date.now()}`;
  const shouldAttachCredentials =
    accessMethod === "credentials" &&
    String(draft.authUsername || "").trim() &&
    String(draft.authPassword || "").trim();
  const authPolicy =
    validationTarget === "public_flow"
      ? "public_only"
      : validationTarget === "inside_product"
        ? "none"
        : accessMethod === "credentials"
          ? "none"
          : "signup_if_needed";

  return {
    run_id: runId,
    target_url: targetUrl,
    scope_mode: effectiveScopeMode,
    scenario_list: goals,
    brand_persona: String(draft.persona || DEFAULT_PERSONA).trim().slice(0, 500),
    credentials: shouldAttachCredentials
      ? {
          login_url: authUrl || null,
          username: String(draft.authUsername || "").trim(),
          password: String(draft.authPassword || "").trim(),
          otp_mode: "none"
        }
      : undefined,
    source: options.source || "dashboard_react",
    metadata: {
      brand_key: brandKey || null,
      brand_name: brandName,
      qa_mode: qaMode,
      validation_target: validationTarget,
      access_method: accessMethod,
      auth_entry_url: authUrl || null,
      auth_policy: authPolicy,
      goal:
        qaMode === "controlled_ux"
          ? controlled.userJob || goals[0] || DEFAULT_CONTROLLED_UX_JOB
          : goals.length === 1
          ? goals[0]
          : goals.length > 1
            ? `Complete these goals in order: ${goals.join("; ")}`
            : DEFAULT_GOALS.join(" "),
      controlled_ux:
        qaMode === "controlled_ux"
          ? {
              enabled: true,
              entry_path: controlled.entryPath || null,
              user_job: controlled.userJob || null,
              route_hints: controlled.routeHints,
              success_signals: controlled.successSignals
            }
          : {
              enabled: false
            },
      retry_of_run_id: options.retryOfRunId || null,
      repo_triage: {
        enabled: draft.repoTriageEnabled === true && Boolean(draft.selectedRepoFullName),
        provider: "github",
        repo: draft.selectedRepoFullName || null,
        ref_strategy: "workspace",
        mode: "high_signal_only"
      }
    }
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const deltaMs = date.getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 48) {
    return formatter.format(deltaHours, "hour");
  }
  return formatter.format(Math.round(deltaHours / 24), "day");
}

export function formatStatusLabel(value?: string | null) {
  const safe = String(value || "unknown").replaceAll("_", " ").trim();
  return safe ? safe.charAt(0).toUpperCase() + safe.slice(1) : "Unknown";
}

export function getStatusTone(value?: string | null) {
  const safe = String(value || "").toLowerCase();
  if (safe === "completed" || safe === "ready" || safe === "healthy" || safe === "connected") {
    return "success";
  }
  if (safe === "failed" || safe === "error" || safe === "offline" || safe === "blocked") {
    return "danger";
  }
  if (safe === "partial" || safe === "retryable" || safe === "stale" || safe === "awaiting_repo_selection") {
    return "warning";
  }
  return "neutral";
}

export function getSeverityTone(value?: string | null) {
  const safe = String(value || "").toLowerCase();
  if (safe === "critical" || safe === "high") {
    return "danger";
  }
  if (safe === "medium") {
    return "warning";
  }
  return "neutral";
}

export function getRunTitle(run?: RunSummary | null) {
  if (!run) {
    return "Test";
  }
  return run.brand_name || inferBrandName(run.brand_key || "") || run.target || run.run_id;
}

export function getPrimaryFinding(report?: QaReport | null) {
  const findings = Array.isArray(report?.findings) ? report!.findings! : [];
  return findings[0] || null;
}

export function getReportHeadline(run?: RunSummary | null, report?: QaReport | null) {
  const primary = getPrimaryFinding(report);
  if (primary?.title) {
    return primary.title;
  }
  if (report?.summary?.note) {
    return report.summary.note;
  }
  if (run?.summary_note) {
    return run.summary_note;
  }
  return "Start a test to see what broke first.";
}

export function getReportSubhead(run?: RunSummary | null, report?: QaReport | null) {
  const primary = getPrimaryFinding(report);
  if (primary?.observed_behavior) {
    return primary.observed_behavior;
  }
  return report?.summary?.note || run?.summary_note || "Open a test to read the main problem, the fix, and the proof.";
}

export function getFindingSummary(finding?: ReportFinding | null) {
  if (!finding) {
    return "";
  }
  return finding.observed_behavior || finding.expected_behavior || finding.title || "";
}

export function collectEvidenceValues(report: QaReport | null | undefined, kind: "screenshot" | "video") {
  const safeReport = report || ({} as QaReport);
  const gallery = safeReport.evidence_gallery || {};
  const field = kind === "video" ? "videos" : "screenshots";
  const values: string[] = [];

  const pushValues = (items?: string[]) => {
    (items || []).forEach((item) => {
      const safe = String(item || "").trim();
      if (safe) {
        values.push(safe);
      }
    });
  };

  pushValues(gallery[field]);
  (safeReport.findings || []).forEach((finding) => pushValues(finding.evidence?.[field]));
  (safeReport.tested_journeys || []).forEach((journey) => {
    pushValues(journey.evidence?.[field]);
    if (kind === "video") {
      (journey.step_video_clips || []).forEach((clip) => {
        const safe = String(clip.video || "").trim();
        if (safe) {
          values.push(safe);
        }
      });
    }
  });

  const deduped: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    deduped.push(value);
  });

  return deduped;
}

export function buildEvidenceIndexMap(report: QaReport | null | undefined, kind: "screenshot" | "video") {
  const values = collectEvidenceValues(report, kind);
  const lookup = new Map<string, number>();
  values.forEach((value, index) => {
    lookup.set(value, index);
  });
  return lookup;
}

export function buildEvidenceAssetUrl(runId: string, kind: "screenshot" | "video", index: number, shareKey = "") {
  const params = new URLSearchParams({
    run_id: runId,
    kind,
    index: String(index)
  });
  if (shareKey) {
    params.set("share_key", shareKey);
  }
  return `/api/qa/evidence?${params.toString()}`;
}
