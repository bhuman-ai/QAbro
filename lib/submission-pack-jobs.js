const {
  DEFAULT_PUBLIC_BASE_URL,
  isPlainObject,
  normalizeUrl,
  parseBoolean,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { validateReconRequest, validateSubmitRequest } = require("./submission-core");
const { loadSubmissionBrandProfile } = require("./submission-brand-profiles");
const { enqueueSubmissionJob, listSubmissionJobs } = require("./submission-queue");
const { runSubmissionPreflight } = require("./submission-preflight");
const { buildSubmissionSiteScorecard } = require("./submission-scorecard");
const { expandSiteSelection, getSiteDefinition, getSitePack, recommendSitePack } = require("./site-packs");

const ACTIVE_RECON_JOB_STATUSES = ["queued", "processing", "retryable", "paused"];
const ACTIVE_SUBMIT_JOB_STATUSES = ["queued", "processing", "retryable", "paused"];
const RECON_QUEUEABLE_SUPPORT_TIERS = new Set(["supported", "recon_needed", "manual_only", "custom"]);

function sanitizeStringArray(value, maxItems = 50, maxLength = 128) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => sanitizeString(item, maxLength).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function sanitizeStructuredObject(value, maxKeyLength = 128, maxValueLength = 4096) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([rawKey, rawValue]) => {
        const key = sanitizeString(rawKey, maxKeyLength).toLowerCase();
        const safeValue = normalizeUrl(rawValue) || sanitizeOptionalString(rawValue, maxValueLength) || null;
        if (!key || !safeValue) {
          return null;
        }
        return [key, safeValue];
      })
      .filter(Boolean)
  );
}

function normalizePackReconRequest(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const brandProfileId = sanitizeString(source.brand_profile_id || source.brandProfileId, 128);
  if (!brandProfileId) {
    return { ok: false, error: "brand_profile_id is required" };
  }

  const requestedPackId = sanitizeString(
    source.pack_id || source.packId || recommendSitePack(source.track)?.pack_id,
    128
  ).toLowerCase();
  const explicitSiteIds = sanitizeStringArray(source.site_ids || source.siteIds, 50, 128);
  const requestedPack = requestedPackId ? getSitePack(requestedPackId) : null;
  const selection = explicitSiteIds.length
    ? {
        pack_id: requestedPack?.pack_id || requestedPackId || "custom",
        pack_name: requestedPack?.pack_name || "Custom",
        track: requestedPack?.track || sanitizeString(source.track, 64) || "custom",
        site_ids: explicitSiteIds,
        sites: explicitSiteIds.map((siteId) => getSiteDefinition(siteId)).filter(Boolean)
      }
    : expandSiteSelection({
        pack_id: requestedPackId,
        site_ids: [],
        track: source.track
      });

  if (!selection.site_ids.length) {
    return { ok: false, error: "Provide pack_id or site_ids" };
  }

  return {
    ok: true,
    data: {
      brand_profile_id: brandProfileId,
      pack_id: selection.pack_id,
      pack_name: selection.pack_name,
      track: sanitizeString(source.track, 64) || selection.track || "custom",
      site_ids: selection.site_ids,
      explicit_site_ids: explicitSiteIds,
      has_explicit_site_ids: explicitSiteIds.length > 0,
      site_selection: selection.sites,
      include_manual: parseBoolean(source.include_manual ?? source.includeManual) === true,
      skip_if_active:
        source.skip_if_active === undefined && source.skipIfActive === undefined
          ? true
          : parseBoolean(source.skip_if_active ?? source.skipIfActive) !== false,
      stop_before_submit:
        source.stop_before_submit === undefined && source.stopBeforeSubmit === undefined
          ? true
          : parseBoolean(source.stop_before_submit ?? source.stopBeforeSubmit) !== false,
      dry_run: parseBoolean(source.dry_run ?? source.dryRun) === true,
      priority: Number.isFinite(Number(source.priority)) ? Math.max(1, Math.min(1000, Math.floor(Number(source.priority)))) : 350,
      max_attempts: Number.isFinite(Number(source.max_attempts || source.maxAttempts))
        ? Math.max(1, Math.min(10, Math.floor(Number(source.max_attempts || source.maxAttempts))))
        : 2,
      source: sanitizeString(source.source, 64) || "submission_bot",
      metadata: isPlainObject(source.metadata) ? source.metadata : {},
      submit_url_overrides: sanitizeStructuredObject(source.submit_url_overrides || source.submitUrlOverrides),
      batch_id:
        sanitizeOptionalString(source.batch_id || source.batchId, 128) ||
        `pack-recon-${selection.pack_id}-${Date.now()}`
    }
  };
}

function resolvePublicBaseUrl(value) {
  const configured = normalizeUrl(value || process.env.QA_PUBLIC_APP_URL);
  return (configured || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, "");
}

function buildPackReconJobId(batchId, siteId) {
  const safeBatch = sanitizeString(batchId, 96)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const safeSite = sanitizeString(siteId, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${safeBatch || "pack-recon"}-${safeSite || "site"}`;
}

function buildSkippedItem(site, reason, message, extra = {}) {
  return {
    site_id: sanitizeString(site?.site_id, 128),
    site_name: sanitizeString(site?.site_name, 180) || sanitizeString(site?.site_id, 128),
    reason: sanitizeString(reason, 64),
    message: sanitizeString(message, 320),
    ...extra
  };
}

function isProductPack(pack) {
  return sanitizeString(pack?.pack_kind, 32).toLowerCase() === "product";
}

function shouldIncludeEffectivePackSite(packId, site = {}) {
  const safePackId = sanitizeString(packId, 128).toLowerCase();
  const tier = sanitizeString(site?.eligibility_tier, 32).toLowerCase();
  const productLane = sanitizeString(site?.product_lane, 64).toLowerCase();
  const track = sanitizeString(site?.track, 64).toLowerCase();

  if (safePackId === "launch_starter") {
    return track === "startup" && tier === "starter";
  }
  if (safePackId === "launch_boosters") {
    return track === "startup" && tier === "booster";
  }
  if (safePackId === "community_launch") {
    return track === "startup" && productLane === "community_launch";
  }
  if (safePackId === "presence_pack") {
    return track === "physical_local";
  }
  return true;
}

async function resolveLivePackSelection(request = {}, ownerUserId = "", options = {}) {
  const basePack = getSitePack(request.pack_id);
  const explicitSiteIds = sanitizeStringArray(request.explicit_site_ids, 100, 128);
  if (!basePack || !isProductPack(basePack) || explicitSiteIds.length > 0) {
    return {
      pack: basePack,
      site_ids: explicitSiteIds.length ? explicitSiteIds : Array.isArray(request.site_ids) ? [...request.site_ids] : Array.isArray(basePack?.site_ids) ? [...basePack.site_ids] : [],
      effective: false,
      degraded_count: 0
    };
  }

  const scorecard = await buildSubmissionSiteScorecard(
    {
      track: request.track || basePack.track,
      pack_id: basePack.pack_id,
      telemetry_window_days: request.telemetry_window_days || request.telemetryWindowDays,
      telemetry_limit: request.telemetry_limit || request.telemetryLimit
    },
    {
      ownerUserId: sanitizeOptionalString(ownerUserId, 128) || undefined,
      listJobs: options.listJobs
    }
  );

  if (!scorecard?.ok) {
    return {
      pack: basePack,
      site_ids: [...basePack.site_ids],
      effective: false,
      degraded_count: 0,
      telemetry_error: scorecard?.error || "Failed to build live pack selection"
    };
  }

  const effectiveSites = (Array.isArray(scorecard.sites) ? scorecard.sites : []).filter((site) =>
    shouldIncludeEffectivePackSite(basePack.pack_id, site)
  );
  const siteIds = effectiveSites.map((site) => sanitizeString(site?.site_id, 128).toLowerCase()).filter(Boolean);
  const degradedCount = effectiveSites.filter((site) => site?.degraded_from_catalog === true).length;

  return {
    pack: {
      ...basePack,
      sites: effectiveSites,
      site_ids: siteIds,
      effective_site_count: siteIds.length
    },
    site_ids: siteIds,
    effective: true,
    degraded_count: degradedCount,
    telemetry_error: scorecard.telemetry_error || null,
    eligibility_summary: scorecard.eligibility_summary || null
  };
}

async function enqueueSubmissionPackRecon(input = {}, options = {}) {
  const normalized = normalizePackReconRequest(input);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  const request = normalized.data;
  const brandLoaded = await (typeof options.loadBrandProfile === "function"
    ? options.loadBrandProfile(request.brand_profile_id, options)
    : loadSubmissionBrandProfile(request.brand_profile_id, {
        ownerUserId: sanitizeOptionalString(options.ownerUserId, 128) || undefined
      }));

  if (!brandLoaded?.ok || !brandLoaded.row) {
    return {
      ok: false,
      status: brandLoaded?.status || 404,
      error: brandLoaded?.error || "Submission brand profile not found"
    };
  }

  const brandRow = brandLoaded.row;
  const ownerUserId =
    sanitizeString(options.ownerUserId, 128) ||
    sanitizeString(brandRow.owner_user_id, 128);
  const ownerEmail =
    sanitizeString(options.ownerEmail, 320).toLowerCase() ||
    sanitizeString(brandRow.owner_email, 320).toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    return {
      ok: false,
      status: 400,
      error: "owner_user_id and owner_email are required to queue pack recon jobs"
    };
  }

  const publicBaseUrl = resolvePublicBaseUrl(options.publicBaseUrl);
  const pack = getSitePack(request.pack_id) || {
    pack_id: request.pack_id,
    pack_name: request.pack_name,
    track: request.track
  };

  const queued_jobs = [];
  const skipped_sites = [];
  const failed_sites = [];
  const listJobsImpl = typeof options.listJobs === "function" ? options.listJobs : listSubmissionJobs;
  const enqueueJobImpl = typeof options.enqueueJob === "function" ? options.enqueueJob : enqueueSubmissionJob;

  for (const siteId of request.site_ids) {
    const site = getSiteDefinition(siteId) || {
      site_id: siteId,
      site_name: siteId,
      track: request.track,
      support_tier: "custom",
      default_policy: "assist",
      submit_url: request.submit_url_overrides[siteId] || null,
      notes: ["Custom site selection."]
    };

    if (!RECON_QUEUEABLE_SUPPORT_TIERS.has(sanitizeString(site.support_tier, 64))) {
      skipped_sites.push(
        buildSkippedItem(site, "unsupported_tier", `${site.site_name} is not queueable for recon.`)
      );
      continue;
    }

    if (site.support_tier === "manual_only" && request.include_manual !== true) {
      skipped_sites.push(
        buildSkippedItem(
          site,
          "manual_only",
          `${site.site_name} is manual-only and was skipped from batch recon by default.`
        )
      );
      continue;
    }

    const submitUrl = request.submit_url_overrides[site.site_id] || normalizeUrl(site.submit_url);
    if (!submitUrl) {
      skipped_sites.push(
        buildSkippedItem(site, "missing_submit_url", `${site.site_name} does not have a configured submit URL.`)
      );
      continue;
    }

    if (request.skip_if_active) {
      const active = await listJobsImpl(
        {
          owner_user_id: ownerUserId,
          job_type: "directory_recon",
          site_id: site.site_id,
          statuses: ACTIVE_RECON_JOB_STATUSES,
          limit: 5
        },
        {
          ownerUserId
        }
      );
      if (!active?.ok) {
        failed_sites.push(
          buildSkippedItem(
            site,
            "active_job_lookup_failed",
            active?.error || `Failed to inspect active recon jobs for ${site.site_name}.`
          )
        );
        continue;
      }
      if (Array.isArray(active.rows) && active.rows.length > 0) {
        skipped_sites.push(
          buildSkippedItem(
            site,
            "active_recon_exists",
            `${site.site_name} already has an active recon job.`,
            {
              active_job_id: sanitizeOptionalString(active.rows[0]?.job_id, 128) || null
            }
          )
        );
        continue;
      }
    }

    const candidate = validateReconRequest({
      job_id: buildPackReconJobId(request.batch_id, site.site_id),
      job_type: "directory_recon",
      site_id: site.site_id,
      site_name: site.site_name,
      track: sanitizeString(site.track, 64) || request.track || sanitizeString(brandRow.track, 64) || "custom",
      submit_url: submitUrl,
      source: request.source,
      priority: request.priority,
      max_attempts: request.max_attempts,
      stop_before_submit: request.stop_before_submit,
      dry_run: request.dry_run,
      metadata: {
        ...(isPlainObject(site.runtime_policy) ? site.runtime_policy : {}),
        ...(isPlainObject(request.metadata) ? request.metadata : {}),
        brand_profile_id: request.brand_profile_id,
        brand_key:
          sanitizeOptionalString(brandRow.brand_key, 256) ||
          sanitizeOptionalString(request.metadata?.brand_key, 256) ||
          null,
        pack_id: request.pack_id,
        batch_id: request.batch_id,
        queue_origin: "pack_recon",
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        support_tier: sanitizeString(site.support_tier, 64) || "custom"
      }
    });

    if (!candidate.ok) {
      failed_sites.push(buildSkippedItem(site, "invalid_recon_request", candidate.error));
      continue;
    }

    if (request.dry_run) {
      queued_jobs.push({
        job_id: candidate.data.job_id,
        site_id: site.site_id,
        site_name: site.site_name,
        status: "dry_run",
        submit_url: submitUrl
      });
      continue;
    }

    const queued = await enqueueJobImpl(candidate.data, {
      ownerUserId,
      ownerEmail,
      brandKey:
        sanitizeOptionalString(brandRow.brand_key, 256) ||
        sanitizeOptionalString(candidate.data.metadata?.brand_key, 256) ||
        null,
      publicBaseUrl
    });
    if (!queued?.ok) {
      failed_sites.push(
        buildSkippedItem(site, "enqueue_failed", queued?.error || `Failed to enqueue ${site.site_name}.`)
      );
      continue;
    }

    queued_jobs.push({
      job_id: sanitizeOptionalString(queued.job?.job_id || queued.row?.job_id, 128) || candidate.data.job_id,
      site_id: site.site_id,
      site_name: site.site_name,
      status: sanitizeOptionalString(queued.job?.status || queued.row?.status, 64) || "queued",
      submit_url: submitUrl,
      status_url: sanitizeOptionalString(queued.job?.status_url, 4096) || null,
      report_url: sanitizeOptionalString(queued.job?.report_url, 4096) || null
    });
  }

  const next_steps = [];
  if (queued_jobs.length) {
    next_steps.push(`Start the submission worker to process ${queued_jobs.length} queued recon job(s).`);
  }
  if (skipped_sites.some((item) => item.reason === "manual_only")) {
    next_steps.push("Review manual-only connectors separately or rerun with include_manual=true.");
  }
  if (failed_sites.length) {
    next_steps.push("Review failed pack-recon queue attempts before retrying the batch.");
  }

  return {
    ok: true,
    status: 200,
    batch_id: request.batch_id,
    request,
    pack,
    brand: {
      brand_profile_id: brandRow.brand_profile_id,
      brand_key: brandRow.brand_key || null,
      track: brandRow.track || request.track || "custom",
      display_name: brandRow.display_name || request.brand_profile_id
    },
    queued_jobs,
    skipped_sites,
    failed_sites,
    summary: {
      requested_site_count: request.site_ids.length,
      queued_count: queued_jobs.length,
      skipped_count: skipped_sites.length,
      failed_count: failed_sites.length
    },
    next_steps
  };
}

async function runPackSubmissionPreflight(input = {}, options = {}) {
  const normalized = normalizePackReconRequest(input);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  let selectionPack = getSitePack(normalized.data.pack_id) || null;
  let selectedSiteIds = [...normalized.data.site_ids];
  let livePackSelection = null;
  if (!normalized.data.has_explicit_site_ids) {
    livePackSelection = await resolveLivePackSelection(normalized.data, sanitizeOptionalString(options.ownerUserId, 128), options);
    if (Array.isArray(livePackSelection?.site_ids) && livePackSelection.site_ids.length) {
      selectedSiteIds = [...livePackSelection.site_ids];
      selectionPack = livePackSelection.pack || selectionPack;
    } else if (livePackSelection?.effective === true) {
      return {
        ok: false,
        status: 409,
        error: `${selectionPack?.pack_name || normalized.data.pack_name || "This pack"} has no currently eligible connectors.`,
        pack: livePackSelection.pack || selectionPack,
        telemetry_error: livePackSelection.telemetry_error || null
      };
    }
  }

  const result = await runSubmissionPreflight(
    {
      brand_profile_id: normalized.data.brand_profile_id,
      pack_id: normalized.data.pack_id,
      track: normalized.data.track,
      site_ids: selectedSiteIds,
      manifest_id: sanitizeOptionalString(input.manifest_id || input.manifestId, 128) || null,
      stale_site_profile_days:
        input.stale_site_profile_days !== undefined || input.staleSiteProfileDays !== undefined
          ? input.stale_site_profile_days ?? input.staleSiteProfileDays
          : undefined,
      strict: input.strict,
      include_blocked_sites: input.include_blocked_sites ?? input.includeBlockedSites
    },
    options
  );

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    request: {
      ...result.request,
      site_ids: selectedSiteIds
    },
    pack:
      result.pack ||
      selectionPack || {
        pack_id: normalized.data.pack_id,
        pack_name: normalized.data.pack_name,
        track: normalized.data.track,
        sites: normalized.data.site_selection || []
      },
    live_pack_selection: livePackSelection
  };
}

function normalizePackSubmitRequest(input = {}) {
  const normalized = normalizePackReconRequest(input);
  if (!normalized.ok) {
    return normalized;
  }

  const source = isPlainObject(input) ? input : {};
  const noHumanActions =
    parseBoolean(source.no_human_actions ?? source.noHumanActions ?? source.full_auto ?? source.fullAuto) === true;
  return {
    ok: true,
    data: {
      ...normalized.data,
      manifest_id: sanitizeOptionalString(source.manifest_id || source.manifestId, 128) || null,
      no_human_actions: noHumanActions,
      strict: source.strict === undefined ? true : parseBoolean(source.strict) !== false,
      include_blocked_sites:
        source.include_blocked_sites === undefined && source.includeBlockedSites === undefined
          ? true
          : parseBoolean(source.include_blocked_sites ?? source.includeBlockedSites) !== false,
      include_auto:
        noHumanActions
          ? true
          : source.include_auto === undefined && source.includeAuto === undefined
            ? true
            : parseBoolean(source.include_auto ?? source.includeAuto) !== false,
      include_assist:
        noHumanActions
          ? true
          : source.include_assist === undefined && source.includeAssist === undefined
            ? true
            : parseBoolean(source.include_assist ?? source.includeAssist) !== false,
      stop_before_submit:
        noHumanActions
          ? false
          : normalized.data.stop_before_submit,
      batch_id:
        sanitizeOptionalString(source.batch_id || source.batchId, 128) ||
        `pack-submit-${normalized.data.pack_id}-${Date.now()}`
    }
  };
}

function buildPackSubmitJobId(batchId, siteId) {
  const safeBatch = sanitizeString(batchId, 96)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const safeSite = sanitizeString(siteId, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${safeBatch || "pack-submit"}-${safeSite || "site"}`;
}

function buildPreflightReasonSummary(item) {
  return (Array.isArray(item?.reasons) ? item.reasons : [])
    .map((reason) => sanitizeString(reason?.code || reason?.message, 128))
    .filter(Boolean)
    .slice(0, 8);
}

async function enqueueSubmissionPackSubmit(input = {}, options = {}) {
  const normalized = normalizePackSubmitRequest(input);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }

  const request = normalized.data;
  const brandLoaded = await (typeof options.loadBrandProfile === "function"
    ? options.loadBrandProfile(request.brand_profile_id, options)
    : loadSubmissionBrandProfile(request.brand_profile_id, {
        ownerUserId: sanitizeOptionalString(options.ownerUserId, 128) || undefined
      }));

  if (!brandLoaded?.ok || !brandLoaded.row) {
    return {
      ok: false,
      status: brandLoaded?.status || 404,
      error: brandLoaded?.error || "Submission brand profile not found"
    };
  }

  const brandRow = brandLoaded.row;
  const ownerUserId =
    sanitizeString(options.ownerUserId, 128) ||
    sanitizeString(brandRow.owner_user_id, 128);
  const ownerEmail =
    sanitizeString(options.ownerEmail, 320).toLowerCase() ||
    sanitizeString(brandRow.owner_email, 320).toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    return {
      ok: false,
      status: 400,
      error: "owner_user_id and owner_email are required to queue pack submit jobs"
    };
  }

  const runPreflight =
    typeof options.runPackSubmissionPreflight === "function"
      ? options.runPackSubmissionPreflight
      : (payload, innerOptions) => runPackSubmissionPreflight(payload, innerOptions);
  const preflight = await runPreflight(
    {
      brand_profile_id: request.brand_profile_id,
      pack_id: request.pack_id,
      track: request.track,
      site_ids: request.site_ids,
      manifest_id: request.manifest_id,
      stale_site_profile_days:
        input.stale_site_profile_days !== undefined || input.staleSiteProfileDays !== undefined
          ? input.stale_site_profile_days ?? input.staleSiteProfileDays
          : undefined,
      strict: request.strict,
      include_blocked_sites: true
    },
    {
      ...options,
      ownerUserId
    }
  );
  if (!preflight?.ok) {
    return preflight;
  }

  const publicBaseUrl = resolvePublicBaseUrl(options.publicBaseUrl);
  const pack = preflight.pack || getSitePack(request.pack_id) || {
    pack_id: request.pack_id,
    pack_name: request.pack_name,
    track: request.track
  };
  const listJobsImpl = typeof options.listJobs === "function" ? options.listJobs : listSubmissionJobs;
  const enqueueJobImpl = typeof options.enqueueJob === "function" ? options.enqueueJob : enqueueSubmissionJob;
  const manifestId =
    sanitizeOptionalString(preflight.manifest?.manifest_id, 128) ||
    sanitizeOptionalString(request.manifest_id, 128) ||
    null;

  const queued_jobs = [];
  const skipped_sites = [];
  const failed_sites = [];

  for (const item of Array.isArray(preflight.items) ? preflight.items : []) {
    const site = getSiteDefinition(item.site_id) || {
      site_id: item.site_id,
      site_name: item.site_name,
      track: item.track || request.track,
      support_tier: item.support_tier || "custom",
      default_policy: item.effective_policy || "assist"
    };

    if (item.decision === "blocked") {
      skipped_sites.push(
        buildSkippedItem(site, "preflight_blocked", `${site.site_name} is blocked by preflight.`, {
          decision: item.decision,
          preflight_reasons: buildPreflightReasonSummary(item)
        })
      );
      continue;
    }

    if (item.effective_policy === "manual" && request.include_manual !== true) {
      skipped_sites.push(
        buildSkippedItem(site, "manual_policy", `${site.site_name} is configured for manual handling.`, {
          decision: item.decision
        })
      );
      continue;
    }

    if (item.decision === "ready_auto" && request.include_auto !== true) {
      skipped_sites.push(
        buildSkippedItem(site, "ready_auto_excluded", `${site.site_name} is ready_auto but include_auto=false.`, {
          decision: item.decision
        })
      );
      continue;
    }

    if (item.decision === "ready_assist" && request.include_assist !== true) {
      skipped_sites.push(
        buildSkippedItem(site, "ready_assist_excluded", `${site.site_name} is ready_assist but include_assist=false.`, {
          decision: item.decision
        })
      );
      continue;
    }

    if (request.skip_if_active) {
      const active = await listJobsImpl(
        {
          owner_user_id: ownerUserId,
          job_type: "directory_submit",
          site_id: site.site_id,
          statuses: ACTIVE_SUBMIT_JOB_STATUSES,
          limit: 5
        },
        {
          ownerUserId
        }
      );
      if (!active?.ok) {
        failed_sites.push(
          buildSkippedItem(
            site,
            "active_job_lookup_failed",
            active?.error || `Failed to inspect active submit jobs for ${site.site_name}.`
          )
        );
        continue;
      }
      if (Array.isArray(active.rows) && active.rows.length > 0) {
        skipped_sites.push(
          buildSkippedItem(
            site,
            "active_submit_exists",
            `${site.site_name} already has an active submit job.`,
            {
              active_job_id: sanitizeOptionalString(active.rows[0]?.job_id, 128) || null
            }
          )
        );
        continue;
      }
    }

    const candidate = validateSubmitRequest({
      job_id: buildPackSubmitJobId(request.batch_id, site.site_id),
      job_type: "directory_submit",
      brand_profile_id: request.brand_profile_id,
      manifest_id: manifestId,
      brand_key:
        sanitizeOptionalString(brandRow.brand_key, 256) ||
        sanitizeOptionalString(request.metadata?.brand_key, 256) ||
        null,
      site_id: site.site_id,
      site_name: site.site_name,
      track: sanitizeString(item.track, 64) || request.track || sanitizeString(brandRow.track, 64) || "custom",
      source: request.source,
      priority: request.priority,
      max_attempts: request.max_attempts,
      submission_policy: sanitizeString(item.effective_policy, 64) || sanitizeString(site.default_policy, 64) || "assist",
      stop_before_submit: request.stop_before_submit,
      dry_run: request.dry_run,
      metadata: {
        ...(isPlainObject(site.runtime_policy) ? site.runtime_policy : {}),
        ...(isPlainObject(request.metadata) ? request.metadata : {}),
        brand_profile_id: request.brand_profile_id,
        brand_key:
          sanitizeOptionalString(brandRow.brand_key, 256) ||
          sanitizeOptionalString(request.metadata?.brand_key, 256) ||
          null,
        pack_id: request.pack_id,
        batch_id: request.batch_id,
        manifest_id: manifestId,
        queue_origin: "pack_submit",
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        preflight_decision: item.decision,
        support_tier: sanitizeString(site.support_tier, 64) || "custom",
        connector_confidence: Number.isFinite(Number(item.connector_confidence))
          ? Math.max(0, Math.min(100, Math.floor(Number(item.connector_confidence))))
          : null,
        manifest_color: sanitizeString(item.manifest_color, 32) || null,
        no_human_actions: request.no_human_actions === true
      }
    });

    if (!candidate.ok) {
      failed_sites.push(buildSkippedItem(site, "invalid_submit_request", candidate.error));
      continue;
    }

    if (request.no_human_actions === true && candidate.data.submission_policy !== "manual") {
      candidate.data.submission_policy = "auto";
      candidate.data.stop_before_submit = false;
    }

    if (request.dry_run) {
      queued_jobs.push({
        job_id: candidate.data.job_id,
        site_id: site.site_id,
        site_name: site.site_name,
        status: "dry_run",
        decision: item.decision,
        submission_policy: candidate.data.submission_policy
      });
      continue;
    }

    const queued = await enqueueJobImpl(candidate.data, {
      ownerUserId,
      ownerEmail,
      brandKey:
        sanitizeOptionalString(brandRow.brand_key, 256) ||
        sanitizeOptionalString(candidate.data.metadata?.brand_key, 256) ||
        null,
      publicBaseUrl
    });
    if (!queued?.ok) {
      failed_sites.push(
        buildSkippedItem(site, "enqueue_failed", queued?.error || `Failed to enqueue ${site.site_name}.`)
      );
      continue;
    }

    queued_jobs.push({
      job_id: sanitizeOptionalString(queued.job?.job_id || queued.row?.job_id, 128) || candidate.data.job_id,
      site_id: site.site_id,
      site_name: site.site_name,
      status: sanitizeOptionalString(queued.job?.status || queued.row?.status, 64) || "queued",
      decision: item.decision,
      submission_policy: candidate.data.submission_policy,
      status_url: sanitizeOptionalString(queued.job?.status_url, 4096) || null,
      report_url: sanitizeOptionalString(queued.job?.report_url, 4096) || null
    });
  }

  const next_steps = [];
  if (queued_jobs.length) {
    next_steps.push(`Start the submission worker to process ${queued_jobs.length} queued submit job(s).`);
  }
  if (Number(preflight?.live_pack_selection?.degraded_count || 0) > 0) {
    next_steps.push("Some connectors were downgraded by live telemetry and excluded from this product pack.");
  }
  if (skipped_sites.some((item) => item.reason === "preflight_blocked")) {
    next_steps.push("Resolve blocked preflight items before retrying pack submit.");
  }
  if (skipped_sites.some((item) => item.reason === "manual_policy")) {
    next_steps.push("Review manual-policy connectors separately or rerun with include_manual=true.");
  }
  if (skipped_sites.some((item) => item.reason === "active_submit_exists")) {
    next_steps.push("Wait for active submit jobs to finish or rerun with skip_if_active=false.");
  }
  if (failed_sites.length) {
    next_steps.push("Review failed pack-submit queue attempts before retrying the batch.");
  }

  return {
    ok: true,
    status: request.dry_run ? 200 : 202,
    batch_id: request.batch_id,
    request,
    pack,
    live_pack_selection: preflight.live_pack_selection || null,
    brand: {
      brand_profile_id: brandRow.brand_profile_id,
      brand_key: brandRow.brand_key || null,
      track: brandRow.track || request.track || "custom",
      display_name: brandRow.display_name || request.brand_profile_id
    },
    manifest: preflight.manifest || null,
    preflight_summary: preflight.summary || null,
    queued_jobs,
    skipped_sites,
    failed_sites,
    summary: {
      requested_site_count: Array.isArray(preflight?.request?.site_ids) ? preflight.request.site_ids.length : request.site_ids.length,
      static_requested_site_count: request.site_ids.length,
      queued_count: queued_jobs.length,
      skipped_count: skipped_sites.length,
      failed_count: failed_sites.length
    },
    next_steps
  };
}

module.exports = {
  ACTIVE_RECON_JOB_STATUSES,
  ACTIVE_SUBMIT_JOB_STATUSES,
  normalizePackReconRequest,
  normalizePackSubmitRequest,
  buildPackReconJobId,
  buildPackSubmitJobId,
  enqueueSubmissionPackRecon,
  enqueueSubmissionPackSubmit,
  runPackSubmissionPreflight
};
