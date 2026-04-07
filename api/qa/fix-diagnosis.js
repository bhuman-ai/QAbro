const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const {
  isPlainObject,
  loadStoredReportByRunId,
  parseRequestBody,
  sanitizeOptionalString,
  sanitizeString
} = require("../../lib/qa-core");
const { extractBrandKey, extractOwnerUserId } = require("../../lib/qa-queue");
const {
  loadBrandRepoConnection,
  listOwnerBrandRepoConnections,
  upsertBrandRepoConnection
} = require("../../lib/qa-brand-repo-connections");
const { listGitHubInstallationRepositories } = require("../../lib/github-app");
const {
  generateRepoAwareFixDiagnosis,
  __private: { inferBestRepositoryForBrand }
} = require("../../lib/qa-fix-diagnosis");

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

async function resolveEffectiveRepoConnection({
  brandKey,
  requestedOwnerUserId,
  ownerEmail,
  existingConnection,
  runRequest
}) {
  const baseConnection = existingConnection && typeof existingConnection === "object" ? existingConnection : {};
  if (baseConnection.installation_id && baseConnection.selected_repo_full_name) {
    return { ok: true, connection: baseConnection };
  }

  const ownerConnections = await listOwnerBrandRepoConnections(requestedOwnerUserId, {
    ownerUserId: requestedOwnerUserId
  });
  if (!ownerConnections.ok) {
    return ownerConnections;
  }

  const reusableConnection =
    ownerConnections.rows.find((row) => row.brand_key === brandKey && row.installation_id) ||
    ownerConnections.rows.find((row) => row.installation_id);
  if (!reusableConnection?.installation_id) {
    return {
      ok: false,
      status: 409,
      error: "Connect the GitHub App to your account before using repo-aware fix diagnosis."
    };
  }

  const listed = await listGitHubInstallationRepositories(reusableConnection.installation_id);
  if (!listed.ok) {
    return listed;
  }

  const inferredRepo = inferBestRepositoryForBrand({
    brandKey,
    targetUrl: sanitizeString(runRequest?.target_url, 4096),
    repositories: listed.repositories
  });
  if (!inferredRepo?.full_name) {
    const savedAwaiting = await upsertBrandRepoConnection(
      {
        brand_key: brandKey,
        provider: "github",
        connection_status: "awaiting_repo_selection",
        installation_id: reusableConnection.installation_id,
        installation_account_login: reusableConnection.installation_account_login,
        installation_account_type: reusableConnection.installation_account_type,
        installation_target_type: reusableConnection.installation_target_type,
        installation_target_id: reusableConnection.installation_target_id,
        path_allowlist:
          Array.isArray(baseConnection.path_allowlist) && baseConnection.path_allowlist.length
            ? baseConnection.path_allowlist
            : reusableConnection.path_allowlist,
        connection: {
          installed_via: "github_app",
          inherited_installation_brand_key: reusableConnection.brand_key || null
        }
      },
      {
        owner_user_id: requestedOwnerUserId,
        owner_email: ownerEmail
      }
    );
    if (savedAwaiting.ok) {
      return {
        ok: false,
        status: 409,
        error: "GitHub App access is available, but no matching repository could be inferred for this project yet. Pick the repo once in project settings."
      };
    }
    return {
      ok: false,
      status: 409,
      error: "GitHub App access is available, but no matching repository could be inferred for this project yet."
    };
  }

  const saved = await upsertBrandRepoConnection(
    {
      brand_key: brandKey,
      provider: "github",
      connection_status: "connected",
      installation_id: reusableConnection.installation_id,
      installation_account_login: reusableConnection.installation_account_login,
      installation_account_type: reusableConnection.installation_account_type,
      installation_target_type: reusableConnection.installation_target_type,
      installation_target_id: reusableConnection.installation_target_id,
      selected_repo_id: inferredRepo.id,
      selected_repo_owner: inferredRepo.owner,
      selected_repo_name: inferredRepo.name,
      selected_repo_full_name: inferredRepo.full_name,
      default_branch: inferredRepo.default_branch,
      path_allowlist:
        Array.isArray(baseConnection.path_allowlist) && baseConnection.path_allowlist.length
          ? baseConnection.path_allowlist
          : reusableConnection.path_allowlist,
      connection: {
        installed_via: "github_app",
        inherited_installation_brand_key: reusableConnection.brand_key || null,
        auto_selected_repo: true,
        auto_selected_reason: "brand_key_repo_match"
      }
    },
    {
      owner_user_id: requestedOwnerUserId,
      owner_email: ownerEmail
    }
  );
  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    connection: saved.row
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
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
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

  const resolvedConnection = await resolveEffectiveRepoConnection({
    brandKey,
    requestedOwnerUserId,
    ownerEmail,
    existingConnection: connectionLoaded.row || {},
    runRequest
  });
  if (!resolvedConnection.ok) {
    return res.status(resolvedConnection.status || 409).json({
      ok: false,
      error: resolvedConnection.error || "Connect a GitHub repository for this project before using repo-aware fix diagnosis."
    });
  }
  const connection = resolvedConnection.connection || {};

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
