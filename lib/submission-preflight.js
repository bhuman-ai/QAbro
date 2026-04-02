const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const { loadSubmissionBrandProfile } = require("./submission-brand-profiles");
const { loadSubmissionAssetManifest } = require("./submission-asset-manifests");
const { loadActiveSubmissionSiteProfiles } = require("./submission-site-profiles");
const { hasSubmissionIdentity, normalizeSubmissionIdentityProfile } = require("./submission-identity");
const { resolveSubmissionProxySelection } = require("./submission-proxy");
const { expandSiteSelection, getSiteDefinition, getSitePack, recommendSitePack } = require("./site-packs");

const DEFAULT_STALE_SITE_PROFILE_DAYS = 75;

function sanitizeInteger(value, fallbackValue, minValue, maxValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(minValue, Math.min(maxValue, Math.floor(numeric)));
}

function normalizePreflightRequest(value = {}) {
  const safeValue = isPlainObject(value) ? value : {};
  const brandProfileId = sanitizeString(safeValue.brand_profile_id || safeValue.brandProfileId, 128);
  if (!brandProfileId) {
    return { ok: false, error: "brand_profile_id is required" };
  }

  const explicitSiteIds = Array.from(
    new Set(
      (
        Array.isArray(safeValue.site_ids)
          ? safeValue.site_ids
          : typeof safeValue.site_ids === "string"
            ? safeValue.site_ids.split(",")
            : Array.isArray(safeValue.siteIds)
              ? safeValue.siteIds
              : []
      )
        .map((item) => sanitizeString(item, 128).toLowerCase())
        .filter(Boolean)
    )
  );
  const requestedPackId = sanitizeString(
    safeValue.pack_id || safeValue.packId || recommendSitePack(safeValue.track)?.pack_id,
    128
  ).toLowerCase();
  const pack = requestedPackId ? getSitePack(requestedPackId) : null;
  const selection = explicitSiteIds.length
    ? {
        pack_id: pack?.pack_id || requestedPackId || "custom",
        pack_name: pack?.pack_name || "Custom",
        track: pack?.track || sanitizeString(safeValue.track, 64) || "custom",
        site_ids: explicitSiteIds
      }
    : expandSiteSelection({
        pack_id: requestedPackId,
        site_ids: [],
        track: safeValue.track
      });
  if (!selection.site_ids.length) {
    return { ok: false, error: "Provide pack_id or site_ids" };
  }

  return {
    ok: true,
    data: {
      brand_profile_id: brandProfileId,
      manifest_id: sanitizeOptionalString(safeValue.manifest_id || safeValue.manifestId, 128) || null,
      pack_id: selection.pack_id,
      pack_name: selection.pack_name,
      track: sanitizeString(safeValue.track, 64) || selection.track || "custom",
      site_ids: selection.site_ids,
      stale_site_profile_days: sanitizeInteger(
        safeValue.stale_site_profile_days || safeValue.staleSiteProfileDays,
        DEFAULT_STALE_SITE_PROFILE_DAYS,
        1,
        365
      ),
      strict:
        safeValue.strict === undefined
          ? true
          : parseBoolean(safeValue.strict) !== false,
      include_blocked_sites:
        safeValue.include_blocked_sites === undefined && safeValue.includeBlockedSites === undefined
          ? true
          : parseBoolean(safeValue.include_blocked_sites ?? safeValue.includeBlockedSites) !== false
    }
  };
}

function extractBrandFacts(brandRow) {
  const profile = isPlainObject(brandRow?.profile) ? brandRow.profile : {};
  const contact = isPlainObject(profile.contact) ? profile.contact : {};
  const location = isPlainObject(profile.location) ? profile.location : {};
  const links = isPlainObject(profile.links) ? profile.links : {};
  const identity = normalizeSubmissionIdentityProfile(profile.identity);

  return {
    brand_profile_id: sanitizeString(brandRow?.brand_profile_id, 128),
    track: sanitizeString(brandRow?.track, 64) || "custom",
    display_name: sanitizeString(brandRow?.display_name, 180),
    website_url: sanitizeOptionalString(brandRow?.website_url, 4096) || null,
    email:
      sanitizeOptionalString(contact.email || profile.email || profile.support_email || identity.mailbox?.email, 320) ||
      null,
    phone: sanitizeOptionalString(contact.phone || profile.phone, 120) || null,
    linkedin_url: sanitizeOptionalString(links.linkedin_url, 4096) || null,
    address_line_1: sanitizeOptionalString(location.address_line_1 || location.address || profile.address, 320) || null,
    city: sanitizeOptionalString(location.city, 120) || null,
    state: sanitizeOptionalString(location.state, 120) || null,
    postal_code: sanitizeOptionalString(location.postal_code || location.zip, 64) || null,
    identity: hasSubmissionIdentity(identity) ? identity : null
  };
}

function computeSiteProfileConfidence(siteProfile) {
  const profile = isPlainObject(siteProfile?.profile) ? siteProfile.profile : {};
  const fields = Array.isArray(profile.fields) ? profile.fields : [];
  const gates = Array.isArray(profile.gates) ? profile.gates : [];
  const duplicateFlow = Array.isArray(profile.duplicate_check_flow) ? profile.duplicate_check_flow : [];

  let score = 100;
  if (!fields.length) {
    score -= 40;
  }
  const genericFields = fields.filter((field) => /^field_\d+$/i.test(sanitizeString(field?.label, 120))).length;
  if (genericFields) {
    score -= Math.min(30, genericFields * 8);
  }
  if (gates.length) {
    score -= Math.min(20, gates.length * 6);
  }
  if (duplicateFlow.length) {
    score -= 5;
  }
  if (!sanitizeOptionalString(siteProfile?.last_recon_at, 128)) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

function determineManifestColor(manifestRow, manifest) {
  const status = sanitizeString(manifestRow?.status, 64).toLowerCase();
  const missingItems = Array.isArray(manifest?.missing_items) ? manifest.missing_items.length : 0;
  if (status === "approved") {
    return "green";
  }
  if (status === "rejected" || status === "failed") {
    return "red";
  }
  if (missingItems > 0) {
    return "red";
  }
  return "yellow";
}

function clonePolicyConfig(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

function buildPolicySummary(siteDefinition) {
  const executionPolicy =
    siteDefinition?.execution_policy && typeof siteDefinition.execution_policy === "object"
      ? siteDefinition.execution_policy
      : null;
  const runtimePolicy =
    siteDefinition?.runtime_policy && typeof siteDefinition.runtime_policy === "object"
      ? siteDefinition.runtime_policy
      : null;
  const parts = [];

  const sessionMode = sanitizeString(executionPolicy?.session_mode, 64).toLowerCase();
  if (sessionMode === "ephemeral_submitter") {
    parts.push("Ephemeral session");
  } else if (sessionMode === "persistent_owner") {
    parts.push("Persistent owner session");
  } else if (sessionMode === "founder_personal") {
    parts.push("Founder identity");
  }

  const ownershipModel = sanitizeString(executionPolicy?.ownership_model, 64).toLowerCase();
  if (ownershipModel === "client_owned_mailbox") {
    parts.push("Client mailbox");
  } else if (ownershipModel === "founder_personal") {
    parts.push("Founder-owned account");
  }

  const proxyPolicy = sanitizeString(executionPolicy?.proxy_policy, 64).toLowerCase();
  if (proxyPolicy === "geo_recommended") {
    parts.push("Geo proxy recommended");
  } else if (proxyPolicy === "same_country_required") {
    parts.push("Same-country proxy");
  } else if (proxyPolicy === "founder_geo_recommended") {
    parts.push("Founder-geo proxy");
  }

  const captchaExpectation = sanitizeString(executionPolicy?.captcha_expectation, 64).toLowerCase();
  if (captchaExpectation === "expected") {
    parts.push("Captcha expected");
  } else if (captchaExpectation === "possible") {
    parts.push("Captcha possible");
  }

  const captchaTimeout = Number(runtimePolicy?.twocaptcha_timeout_ms || 0);
  if (captchaTimeout >= 240000) {
    parts.push("Extended solve window");
  }

  return parts;
}

function buildSiteReasons(siteContext) {
  const reasons = [];
  const addReason = (code, severity, message) => {
    reasons.push({ code, severity, message });
  };

  const {
    brandFacts,
    siteDefinition,
    siteProfile,
    siteManifest,
    manifestRow,
    manifest,
    staleDays,
    staleLimit,
    confidence,
    effectivePolicy,
    proxySelection
  } = siteContext;
  const identityRequirement =
    siteDefinition?.identity_requirement && typeof siteDefinition.identity_requirement === "object"
      ? siteDefinition.identity_requirement
      : {};
  const brandIdentity = brandFacts.identity && typeof brandFacts.identity === "object" ? brandFacts.identity : null;
  const mailbox = brandIdentity?.mailbox && typeof brandIdentity.mailbox === "object" ? brandIdentity.mailbox : null;
  const allowedModes = Array.isArray(identityRequirement.allowed_modes)
    ? identityRequirement.allowed_modes.map((value) => sanitizeString(value, 64).toLowerCase()).filter(Boolean)
    : [];
  const preferredAuthMethods = Array.isArray(identityRequirement.preferred_auth_methods)
    ? identityRequirement.preferred_auth_methods.map((value) => sanitizeString(value, 64).toLowerCase()).filter(Boolean)
    : [];
  const identitySeverity = siteDefinition?.support_tier === "manual_only" ? "warning" : "error";

  if (!brandFacts.display_name) {
    addReason("missing_brand_name", "error", "Brand profile is missing a display name.");
  }
  if (!brandFacts.website_url) {
    addReason("missing_website_url", "error", "Brand profile is missing a canonical website URL.");
  }
  if (!brandFacts.email) {
    addReason("missing_contact_email", "warning", "Brand profile is missing a contact email.");
  }
  if (allowedModes.length) {
    const identityMode = sanitizeString(brandIdentity?.mode, 64).toLowerCase();
    if (!identityMode) {
      addReason(
        "missing_identity_mode",
        identitySeverity,
        `${siteDefinition.site_name} expects a defined ownership identity before submission.`
      );
    } else if (!allowedModes.includes(identityMode)) {
      addReason(
        "identity_mode_mismatch",
        identitySeverity,
        `${siteDefinition.site_name} expects ${allowedModes.join(" or ").replaceAll("_", " ")} identity, but the brand is set to ${identityMode.replaceAll("_", " ")}.`
      );
    }
  }
  if (identityRequirement.mailbox_required) {
    if (!mailbox?.email) {
      addReason(
        "missing_client_owned_mailbox",
        identitySeverity,
        `${siteDefinition.site_name} should use a client-owned mailbox so the client can edit the listing after launch.`
      );
    } else if (mailbox.inbox_ready !== true) {
      addReason(
        "mailbox_access_not_ready",
        identitySeverity,
        `${siteDefinition.site_name} needs working mailbox access for OTP or magic-link handling, but the mailbox is not marked ready.`
      );
    }
  }
  if (
    mailbox?.auth_method === "smtp_imap_password" &&
    (!sanitizeOptionalString(mailbox.smtp_host, 320) || !Number.isFinite(Number(mailbox.smtp_port)))
  ) {
    addReason(
      "mailbox_smtp_not_ready",
      "warning",
      `${siteDefinition.site_name} is configured for shared SMTP + IMAP auth, but the SMTP host or port is still missing.`
    );
  }
  if (mailbox?.email && preferredAuthMethods.length) {
    const authMethod = sanitizeString(mailbox.auth_method, 64).toLowerCase();
    if (authMethod && authMethod !== "unknown" && !preferredAuthMethods.includes(authMethod)) {
      addReason(
        "mailbox_auth_method_mismatch",
        "warning",
        `${siteDefinition.site_name} prefers ${preferredAuthMethods.join(", ").replaceAll("_", " ")} mailbox access, but this brand is configured as ${authMethod.replaceAll("_", " ")}.`
      );
    }
  }
  if (brandFacts.track === "physical_local") {
    if (!brandFacts.address_line_1) {
      addReason("missing_address", "error", "Physical-local brands require a street address.");
    }
    if (!brandFacts.city || !brandFacts.state) {
      addReason("missing_city_state", "error", "Physical-local brands require city and state.");
    }
  }
  if (proxySelection?.status === "missing_target") {
    addReason(
      "missing_proxy_geo_target",
      "warning",
      "Business location is incomplete, so proxy auto-selection cannot choose a nearby region."
    );
  } else if (proxySelection?.status === "provider_missing") {
    addReason(
      "proxy_provider_missing",
      "warning",
      "Managed proxy auto-selection is enabled, but no proxy inventory provider key is configured."
    );
  } else if (proxySelection?.status === "provider_error") {
    addReason(
      "proxy_provider_error",
      "warning",
      proxySelection.note || "Managed proxy inventory could not be loaded."
    );
  } else if (proxySelection?.status === "mismatch") {
    addReason(
      "proxy_geo_mismatch",
      "warning",
      proxySelection.note || "No nearby proxy matched the business location; the run will use a fallback geography."
    );
  } else if (proxySelection?.status === "no_match") {
    addReason(
      "proxy_geo_unavailable",
      "warning",
      proxySelection.note || "The proxy pool does not currently include a near-business match."
    );
  }

  if (!siteProfile) {
    addReason("missing_site_profile", "error", `No active site profile exists for ${siteDefinition.site_name}.`);
    return reasons;
  }

  if (staleDays > staleLimit) {
    addReason(
      "stale_site_profile",
      "error",
      `${siteDefinition.site_name} recon is stale (${staleDays}d old; limit ${staleLimit}d).`
    );
  }

  if (confidence < 70) {
    addReason(
      "low_connector_confidence",
      "warning",
      `${siteDefinition.site_name} connector confidence is ${confidence}/100 and should stay assisted.`
    );
  }

  const profile = isPlainObject(siteProfile.profile) ? siteProfile.profile : {};
  const gates = Array.isArray(profile.gates) ? profile.gates : [];
  const duplicateFlow = Array.isArray(profile.duplicate_check_flow) ? profile.duplicate_check_flow : [];
  if (gates.length) {
    addReason("gate_detected", "warning", `${siteDefinition.site_name} exposes ${gates.length} gate hint(s).`);
  }
  if (duplicateFlow.length) {
    addReason("duplicate_check_expected", "warning", `${siteDefinition.site_name} expects duplicate/claim review.`);
  }

  if (!manifestRow) {
    addReason("missing_asset_manifest", "error", "No active asset manifest exists for this brand.");
    return reasons;
  }

  const manifestColor = determineManifestColor(manifestRow, manifest);
  if (manifestColor === "red") {
    addReason("manifest_not_ready", "error", "Asset manifest is blocked or rejected.");
  } else if (manifestColor === "yellow") {
    addReason("manifest_pending_approval", "warning", "Asset manifest is pending approval and should stay assisted.");
  }

  if (!siteManifest) {
    addReason("missing_site_manifest", "error", `Asset manifest does not include ${siteDefinition.site_name}.`);
    return reasons;
  }

  const siteMissingItems = Array.isArray(siteManifest.missing_items) ? siteManifest.missing_items : [];
  if (siteMissingItems.length) {
    addReason(
      "site_manifest_missing_items",
      "error",
      `${siteDefinition.site_name} still has ${siteMissingItems.length} unresolved manifest item(s).`
    );
  }

  if (effectivePolicy === "manual") {
    addReason("manual_policy", "warning", `${siteDefinition.site_name} is configured for manual handling.`);
  } else if (effectivePolicy === "assist") {
    addReason("assist_policy", "warning", `${siteDefinition.site_name} is configured for assisted handling.`);
  }

  return reasons;
}

function toDecision(reasons, effectivePolicy) {
  if (reasons.some((reason) => reason.severity === "error")) {
    return "blocked";
  }
  if (effectivePolicy !== "auto" || reasons.some((reason) => reason.severity === "warning")) {
    return "ready_assist";
  }
  return "ready_auto";
}

function buildNextSteps(items, overallDecision) {
  const steps = new Set();

  for (const item of items) {
    for (const reason of Array.isArray(item.reasons) ? item.reasons : []) {
      if (reason.code === "missing_site_profile" || reason.code === "stale_site_profile") {
        steps.add(`Run recon for ${item.site_name}.`);
      }
      if (reason.code === "missing_asset_manifest" || reason.code === "manifest_not_ready") {
        steps.add("Prepare or approve the asset manifest before submitting.");
      }
      if (reason.code === "site_manifest_missing_items") {
        steps.add(`Resolve manifest gaps for ${item.site_name}.`);
      }
      if (reason.code === "duplicate_check_expected") {
        steps.add(`Keep ${item.site_name} in assisted mode for duplicate review.`);
      }
    }
  }

  if (!steps.size && overallDecision === "ready_auto") {
    steps.add("Queue directory_submit jobs for the ready sites.");
  }
  if (!steps.size) {
    steps.add("Review the per-site preflight decision log.");
  }

  return Array.from(steps);
}

async function runSubmissionPreflight(input, options = {}) {
  const validation = normalizePreflightRequest(input);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  const request = validation.data;
  const ownerUserId = sanitizeString(options.ownerUserId || input?.owner_user_id || input?.ownerUserId, 128);
  const loadBrandProfile =
    typeof options.loadBrandProfile === "function"
      ? options.loadBrandProfile
      : (brandProfileId) => loadSubmissionBrandProfile(brandProfileId, { ownerUserId });
  const loadAssetManifest =
    typeof options.loadAssetManifest === "function"
      ? options.loadAssetManifest
      : (filters) => loadSubmissionAssetManifest(filters, { ownerUserId });
  const loadSiteProfiles =
    typeof options.loadSiteProfiles === "function"
      ? options.loadSiteProfiles
      : (siteIds) => loadActiveSubmissionSiteProfiles(siteIds);

  const brandLoaded = await loadBrandProfile(request.brand_profile_id);
  if (!brandLoaded?.ok || !brandLoaded.row) {
    return {
      ok: false,
      status: brandLoaded?.status || 404,
      error: brandLoaded?.error || "Submission brand profile not found"
    };
  }

  const manifestLoaded = await loadAssetManifest(
    request.manifest_id
      ? { manifest_id: request.manifest_id }
      : { brand_profile_id: request.brand_profile_id, latest: true }
  );
  const manifestRow = manifestLoaded?.ok ? manifestLoaded.row : null;
  const manifest = isPlainObject(manifestRow?.manifest) ? manifestRow.manifest : null;

  const sitesLoaded = await loadSiteProfiles(request.site_ids);
  if (!sitesLoaded?.ok) {
    return {
      ok: false,
      status: sitesLoaded?.status || 500,
      error: sitesLoaded?.error || "Failed to load site profiles"
    };
  }

  const siteProfileMap = new Map(
    (Array.isArray(sitesLoaded.rows) ? sitesLoaded.rows : []).map((row) => [sanitizeString(row.site_id, 128), row])
  );
  const siteManifestMap = new Map(
    (Array.isArray(manifest?.site_manifests) ? manifest.site_manifests : [])
      .map((row) => [sanitizeString(row?.site_id, 128), row])
      .filter(([siteId]) => siteId)
  );
  const brandFacts = extractBrandFacts(brandLoaded.row);
  const proxySelectionResult = await (typeof options.resolveProxySelection === "function"
    ? options.resolveProxySelection({ brandRow: brandLoaded.row, brandFacts, request, options })
    : resolveSubmissionProxySelection({ metadata: {} }, brandLoaded.row, null, options));
  const proxySelection = isPlainObject(proxySelectionResult?.selection) ? proxySelectionResult.selection : null;

  const items = request.site_ids.map((siteId) => {
    const siteDefinition = getSiteDefinition(siteId) || {
      site_id: siteId,
      site_name: siteId,
      track: request.track,
      support_tier: "custom",
      default_policy: "assist"
    };
    const siteProfile = siteProfileMap.get(siteId) || null;
    const siteManifest = siteManifestMap.get(siteId) || null;
    const effectivePolicy =
      sanitizeString(input?.submission_policy || input?.submissionPolicy, 64) ||
      sanitizeString(siteProfile?.submission_policy, 64) ||
      sanitizeString(siteDefinition.default_policy, 64) ||
      "assist";
    const staleDays = (() => {
      const ts = Date.parse(sanitizeOptionalString(siteProfile?.last_recon_at, 128) || "");
      if (!Number.isFinite(ts)) {
        return request.stale_site_profile_days + 1;
      }
      return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
    })();
    const confidence = siteProfile ? computeSiteProfileConfidence(siteProfile) : 0;
    const reasons = buildSiteReasons({
      brandFacts,
      siteDefinition,
      siteProfile,
      siteManifest,
      manifestRow,
      manifest,
      staleDays,
      staleLimit: request.stale_site_profile_days,
      confidence,
      effectivePolicy,
      proxySelection
    });
    const decision = toDecision(reasons, effectivePolicy);

    return {
      site_id: siteId,
      site_name: siteDefinition.site_name,
      pack_id: request.pack_id,
      track: siteDefinition.track || request.track,
      support_tier: siteDefinition.support_tier || "custom",
      effective_policy: effectivePolicy,
      connector_confidence: confidence,
      stale_recon_days: staleDays,
      manifest_status: sanitizeString(manifestRow?.status, 64) || null,
      manifest_color: manifestRow ? determineManifestColor(manifestRow, manifest) : "red",
      execution_policy: clonePolicyConfig(siteDefinition.execution_policy),
      runtime_policy: clonePolicyConfig(siteDefinition.runtime_policy),
      policy_summary: buildPolicySummary(siteDefinition),
      decision,
      reasons
    };
  });

  const visibleItems = request.include_blocked_sites !== false ? items : items.filter((item) => item.decision !== "blocked");
  const blockedCount = items.filter((item) => item.decision === "blocked").length;
  const assistCount = items.filter((item) => item.decision === "ready_assist").length;
  const autoCount = items.filter((item) => item.decision === "ready_auto").length;
  const overallDecision =
    blockedCount && request.strict
      ? "blocked"
      : blockedCount === items.length
        ? "blocked"
        : assistCount || blockedCount
          ? "ready_assist"
          : "ready_auto";

  return {
    ok: true,
    status: 200,
    checked_at: new Date().toISOString(),
    request,
    pack: recommendSitePack(request.track)?.pack_id === request.pack_id ? recommendSitePack(request.track) : null,
    brand: {
      brand_profile_id: brandFacts.brand_profile_id,
      display_name: brandFacts.display_name,
      track: brandFacts.track,
      website_url: brandFacts.website_url
    },
    proxy: proxySelection
      ? {
          provider: proxySelection.provider || null,
          status: proxySelection.status || null,
          matched: proxySelection.matched !== false,
          match_quality: proxySelection.match_quality || null,
          target: proxySelection.target || null,
          selected: proxySelection.selected || null,
          note: proxySelection.note || null,
          warnings: Array.isArray(proxySelection.warnings) ? proxySelection.warnings : []
        }
      : null,
    manifest: manifestRow
      ? {
          manifest_id: manifestRow.manifest_id,
          version: manifestRow.version,
          status: manifestRow.status,
          color: determineManifestColor(manifestRow, manifest)
        }
      : null,
    overall_decision: overallDecision,
    summary: {
      site_count: items.length,
      ready_auto_count: autoCount,
      ready_assist_count: assistCount,
      blocked_count: blockedCount
    },
    items: visibleItems,
    next_steps: buildNextSteps(items, overallDecision)
  };
}

module.exports = {
  DEFAULT_STALE_SITE_PROFILE_DAYS,
  normalizePreflightRequest,
  extractBrandFacts,
  computeSiteProfileConfidence,
  runSubmissionPreflight
};
