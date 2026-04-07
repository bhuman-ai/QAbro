const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const {
  isPlainObject,
  loadStoredReportByRunId,
  parseRequestBody,
  sanitizeOptionalString,
  sanitizeString
} = require("../../lib/qa-core");
const { extractBrandKey, extractOwnerUserId } = require("../../lib/qa-queue");
const { loadBrandRepoConnection } = require("../../lib/qa-brand-repo-connections");
const { generateRepoAwareFixDiagnosis } = require("../../lib/qa-fix-diagnosis");

function sanitizeFixPoint(value) {
  const point = isPlainObject(value) ? value : {};
  return {
    id: sanitizeOptionalString(point.id, 128) || null,
    title: sanitizeString(point.title, 240) || "Customer issue",
    severity: sanitizeString(point.severity, 64) || "medium",
    description: sanitizeString(point.description, 1200) || "",
    recommended_fix: sanitizeOptionalString(point.recommended_fix, 4000) || null
  };
}

function buildStoredEngineeringDiagnosis(point, reportJson) {
  const engineering = isPlainObject(reportJson?.engineering_triage) ? reportJson.engineering_triage : {};
  const perFinding = Array.isArray(engineering.per_finding) ? engineering.per_finding : [];
  const matched = perFinding.find((item) => {
    const findingId = sanitizeOptionalString(item?.finding_id, 128) || null;
    const findingTitle = sanitizeString(item?.finding_title, 240).toLowerCase();
    if (point.id && findingId && point.id === findingId) {
      return true;
    }
    return findingTitle && findingTitle === point.title.toLowerCase();
  });
  const suspectedFiles = Array.isArray(matched?.suspected_files)
    ? matched.suspected_files.map((item) => sanitizeString(item, 320)).filter(Boolean)
    : Array.isArray(engineering.suspected_files)
      ? engineering.suspected_files.map((item) => sanitizeString(item, 320)).filter(Boolean)
      : [];
  if (!matched && !suspectedFiles.length) {
    return null;
  }

  const probableCauses = Array.isArray(matched?.probable_causes)
    ? matched.probable_causes
    : Array.isArray(engineering.probable_causes)
      ? engineering.probable_causes
      : [];
  const suggestedChecks = Array.isArray(matched?.suggested_checks)
    ? matched.suggested_checks
    : Array.isArray(engineering.suggested_checks)
      ? engineering.suggested_checks
      : [];
  const suggestedTests = Array.isArray(matched?.suggested_tests)
    ? matched.suggested_tests
    : Array.isArray(engineering.suggested_tests)
      ? engineering.suggested_tests
      : [];
  const summary =
    sanitizeString(engineering.summary, 1200) ||
    "Repo-aware triage matched this issue to likely code paths in the connected workspace.";

  const implementationNotes = [...probableCauses, ...suggestedChecks, ...suggestedTests]
    .map((item) => sanitizeString(item, 320))
    .filter(Boolean)
    .slice(0, 5);

  const developerPrompt = [
    `Issue: ${point.title}`,
    `Severity: ${point.severity}`,
    `Customer issue: ${point.description}`,
    "",
    `Repo triage summary: ${summary}`,
    `Suspected files: ${suspectedFiles.length ? suspectedFiles.join(", ") : "No file match provided."}`,
    "",
    "Do the following:",
    "- Inspect the suspected files first.",
    "- Implement the smallest product-facing change that answers the customer concern.",
    "- Add or update tests if the change touches a core flow.",
    "- Rerun the test after the fix."
  ].join("\n");

  return {
    source: "stored_engineering_triage",
    repo_full_name: sanitizeOptionalString(engineering.repo_label, 320) || null,
    repo_understanding: summary,
    likely_fix_location: suspectedFiles[0]
      ? `Start in ${suspectedFiles[0]} and any adjacent copy-owning component.`
      : "Start in the files most directly tied to the affected flow.",
    suspected_files: suspectedFiles.slice(0, 6),
    suggested_fixes: [
      sanitizeString(point.recommended_fix, 500) ||
        "Answer the customer concern directly in the visible UI with clearer copy or proof."
    ].filter(Boolean),
    implementation_notes: implementationNotes,
    developer_prompt: developerPrompt,
    confidence_note: sanitizeString(
      matched?.confidence
        ? `Stored repo triage confidence: ${Math.round(Number(matched.confidence) * 100)}%.`
        : "Using stored repo triage from the connected workspace.",
      300
    )
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const runId = sanitizeString(body.run_id || body.runId, 128);
  const point = sanitizeFixPoint(body.point);
  if (!runId) {
    return res.status(400).json({ ok: false, error: "run_id is required" });
  }
  if (!point.description) {
    return res.status(400).json({ ok: false, error: "point.description is required" });
  }

  const loaded = await loadStoredReportByRunId(runId);
  if (!loaded.ok) {
    return res.status(loaded.status || 404).json({ ok: false, error: loaded.error || "Run not found" });
  }

  const row = loaded.row;
  const rowOwnerUserId = extractOwnerUserId(row);
  const requestedOwnerUserId = sanitizeString(auth.user?.id, 128);
  if (rowOwnerUserId && requestedOwnerUserId && rowOwnerUserId !== requestedOwnerUserId) {
    return res.status(404).json({ ok: false, error: "Run not found" });
  }

  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const reportJson = isPlainObject(payload.report_json) ? payload.report_json : {};
  const storedEngineeringDiagnosis = buildStoredEngineeringDiagnosis(point, reportJson);
  if (storedEngineeringDiagnosis) {
    return res.status(200).json({
      ok: true,
      diagnosis: storedEngineeringDiagnosis
    });
  }

  const brandKey =
    sanitizeString(body.brand_key || body.brandKey, 256).toLowerCase() ||
    sanitizeString(extractBrandKey(row), 256).toLowerCase();
  if (!brandKey) {
    return res.status(400).json({ ok: false, error: "brand_key is required" });
  }

  const connectionLoaded = await loadBrandRepoConnection(brandKey, {
    ownerUserId: requestedOwnerUserId
  });
  if (!connectionLoaded.ok) {
    return res.status(connectionLoaded.status || 500).json({ ok: false, error: connectionLoaded.error });
  }

  const connection = connectionLoaded.row || {};
  if (!connection.installation_id || !connection.selected_repo_full_name) {
    return res.status(409).json({
      ok: false,
      error: "Connect a GitHub repository for this project before using repo-aware fix diagnosis."
    });
  }

  const diagnosisResult = await generateRepoAwareFixDiagnosis({
    connection,
    point,
    runRequest,
    report: reportJson,
    openAiApiKey:
      process.env.OPENAI_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      process.env.BROWSERBASE_OPENAI_API_KEY,
    openAiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.QA_FIX_DIAGNOSIS_MODEL || undefined
  });
  if (!diagnosisResult.ok) {
    return res.status(diagnosisResult.status || 502).json({
      ok: false,
      error: diagnosisResult.error || "Repo-aware fix diagnosis failed"
    });
  }

  return res.status(200).json({
    ok: true,
    diagnosis: diagnosisResult.diagnosis
  });
};
