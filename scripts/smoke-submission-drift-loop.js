#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");

const { bootstrapEnv, processClaimedSubmissionJob } = require("./submission-worker");
const { upsertSubmissionBrandProfile } = require("../lib/submission-brand-profiles");
const { upsertSubmissionSiteProfile, loadActiveSubmissionSiteProfiles } = require("../lib/submission-site-profiles");
const { createSubmissionAssetManifest } = require("../lib/submission-asset-manifests");
const {
  claimSubmissionJobById,
  enqueueSubmissionJob,
  getSubmissionJobStatus
} = require("../lib/submission-queue");
const { sanitizeOptionalString, sanitizeString } = require("../lib/qa-core");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const FIXTURE_NAME = "submission-drift-no-submit.html";
const FIXTURE_PATH = path.resolve(__dirname, "..", "tests", "fixtures", FIXTURE_NAME);

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    keep: false,
    headed: false,
    ownerUserId: "smoke_drift_operator",
    ownerEmail: "drift-smoke@clusterseo.com"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep") {
      args.keep = true;
      continue;
    }
    if (arg === "--headed") {
      args.headed = true;
      continue;
    }
    if (arg === "--host") {
      const next = sanitizeString(argv[index + 1], 128);
      if (next) {
        args.host = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--port") {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next >= 0 && next <= 65535) {
        args.port = Math.floor(next);
        index += 1;
      }
      continue;
    }
    if (arg === "--owner-user-id") {
      const next = sanitizeString(argv[index + 1], 128);
      if (next) {
        args.ownerUserId = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--owner-email") {
      const next = sanitizeString(argv[index + 1], 320).toLowerCase();
      if (next) {
        args.ownerEmail = next;
        index += 1;
      }
    }
  }

  return args;
}

function requireEnv(name) {
  const value = sanitizeString(process.env[name], 4096);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseAccess() {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL").replace(/\/$/, ""),
    serviceKey: requireEnv("SUPABASE_SERVICE_KEY")
  };
}

function buildSupabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

async function startFixtureServer(options = {}) {
  const fixtureBody = fs.readFileSync(FIXTURE_PATH);
  const server = http.createServer((req, res) => {
    const requestPath = String(req.url || "").split("?")[0];
    if (requestPath === `/${FIXTURE_NAME}`) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": fixtureBody.length
      });
      res.end(fixtureBody);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? DEFAULT_PORT, options.host || DEFAULT_HOST, resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port || DEFAULT_PORT;
  const host = typeof address === "object" && address ? address.address : options.host || DEFAULT_HOST;

  return {
    server,
    host,
    port,
    submitUrl: `http://${host}:${port}/${FIXTURE_NAME}`
  };
}

async function stopFixtureServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function deleteRestRows(tableName, queryPairs) {
  const { supabaseUrl, serviceKey } = getSupabaseAccess();
  const url = new URL(`${supabaseUrl}/rest/v1/${tableName}`);
  for (const [key, value] of queryPairs) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: buildSupabaseHeaders(serviceKey)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.message || data?.error || `Failed to delete ${tableName} rows (${response.status}).`
    );
  }
}

function safeRm(targetPath) {
  const safePath = sanitizeOptionalString(targetPath, 4096);
  if (!safePath) {
    return;
  }
  fs.rmSync(safePath, { recursive: true, force: true });
}

async function claimAndProcess(jobId, workerId) {
  const claimed = await claimSubmissionJobById(jobId, { workerId });
  if (!claimed.ok) {
    throw new Error(claimed.error || `Could not claim ${jobId}`);
  }
  return processClaimedSubmissionJob(claimed, workerId);
}

async function loadVerifiedJob(jobId, expectedType) {
  const status = await getSubmissionJobStatus(jobId);
  if (!status.ok || !status.row) {
    throw new Error(status.error || `Job ${jobId} was not found`);
  }
  if (expectedType && sanitizeString(status.row.job_type, 64) !== expectedType) {
    throw new Error(`Job ${jobId} is not a ${expectedType} job`);
  }
  return status;
}

async function seedSmokeRun(context) {
  const { ownerUserId, ownerEmail, submitUrl, headed } = context;
  const suffix = Date.now();
  const brandProfileId = `brand_clusterseo_drift_smoke_${suffix}`;
  const brandKey = `clusterseo_drift_smoke_${suffix}`;
  const siteId = `saashub_drift_http_smoke_${suffix}`;
  const submitJobId = `submit-drift-http-smoke-${suffix}`;

  const brand = await upsertSubmissionBrandProfile(
    {
      brand_profile_id: brandProfileId,
      brand_key: brandKey,
      track: "startup",
      display_name: "ClusterSEO Drift Smoke",
      legal_name: "ClusterSEO",
      website_url: "https://clusterseo.com",
      profile: {
        summary: "Automates SEO outreach and backlink workflows for startups.",
        description:
          "ClusterSEO helps startups automate SEO outreach, backlink operations, and directory distribution workflows.",
        competitors: ["Respona", "Ahrefs", "Pitchbox"],
        tags: ["SEO", "Backlinks", "Outreach"],
        services: ["SEO", "Link Building"],
        contact: {
          email: ownerEmail,
          phone: "+1 555 000 0000"
        }
      }
    },
    {
      ownerUserId,
      ownerEmail
    }
  );
  if (!brand.ok) {
    throw new Error(brand.error || "Failed to create smoke brand profile");
  }

  const site = await upsertSubmissionSiteProfile({
    site_id: siteId,
    site_name: "SaaSHub Drift HTTP Smoke",
    track: "startup",
    status: "active",
    submission_policy: "auto",
    submit_url: submitUrl,
    profile: {
      site_id: siteId,
      site_name: "SaaSHub Drift HTTP Smoke",
      recommended_submission_policy: "auto",
      fields: [
        { label: "Product Name", name: "product_name", type: "text", required: true },
        { label: "Tagline", name: "tagline", type: "text", required: true },
        { label: "Website URL", name: "website_url", type: "url", required: true },
        { label: "Contact Email", name: "contact_email", type: "email", required: true },
        { label: "Description", name: "description", type: "textarea", required: false }
      ],
      asset_requirements: [],
      gates: [],
      duplicate_check_flow: []
    },
    evidence: {
      fixture: "submission-drift-no-submit-http"
    }
  });
  if (!site.ok) {
    throw new Error(site.error || "Failed to create smoke site profile");
  }

  const manifest = await createSubmissionAssetManifest(
    {
      brand_profile_id: brandProfileId,
      status: "approved",
      brand_key: brandKey,
      track: "startup",
      manifest: {
        copy_pack: {
          one_liner_60: "Automate SEO outreach and backlinks.",
          about_500:
            "ClusterSEO helps startups automate SEO outreach, backlink operations, and directory distribution workflows."
        },
        factual_pack: {
          legal_name: "ClusterSEO",
          website_url: "https://clusterseo.com",
          email: ownerEmail,
          competitors: ["Respona", "Ahrefs", "Pitchbox"]
        },
        site_manifests: [],
        missing_items: [],
        approval_items: []
      },
      approval: {
        required: false,
        items: []
      }
    },
    {
      ownerUserId,
      ownerEmail
    }
  );
  if (!manifest.ok) {
    throw new Error(manifest.error || "Failed to create smoke asset manifest");
  }

  const queued = await enqueueSubmissionJob(
    {
      job_id: submitJobId,
      job_type: "directory_submit",
      brand_profile_id: brandProfileId,
      brand_key: brandKey,
      site_id: siteId,
      site_name: "SaaSHub Drift HTTP Smoke",
      track: "startup",
      source: "submission_bot",
      priority: 1000,
      max_attempts: 2,
      manifest_id: manifest.row.manifest_id,
      submission_policy: "auto",
      stop_before_submit: false,
      metadata: {
        brand_key: brandKey,
        self_hosted_headless: headed !== true,
        self_hosted_browser_launch_timeout_ms: 60000
      }
    },
    {
      ownerUserId,
      ownerEmail,
      publicBaseUrl: process.env.QA_PUBLIC_APP_URL,
      brandKey
    }
  );
  if (!queued.ok) {
    throw new Error(queued.error || "Failed to queue smoke submit job");
  }

  return {
    ownerUserId,
    ownerEmail,
    brandProfileId,
    brandKey,
    siteId,
    manifestId: manifest.row.manifest_id,
    submitJobId
  };
}

async function verifySmokeLoop(state) {
  const submitStatus = await loadVerifiedJob(state.submitJobId, "directory_submit");
  const submitResult = submitStatus.row?.result || {};
  const driftEvent = submitResult.drift_event || {};
  const reconRefresh = driftEvent.recon_refresh || {};
  const reconJobId = sanitizeString(reconRefresh.job_id, 128);

  if (sanitizeString(submitResult.submission_status, 64) !== "paused_no_submit_cta") {
    throw new Error("Smoke submit job did not reach paused_no_submit_cta");
  }
  if (driftEvent.detected !== true || reconRefresh.enqueued !== true || !reconJobId) {
    throw new Error("Smoke submit job did not enqueue a recon refresh");
  }

  await claimAndProcess(reconJobId, `submission-smoke-recon-${Date.now()}`);
  const reconStatus = await loadVerifiedJob(reconJobId, "directory_recon");
  if (sanitizeString(reconStatus.row?.status, 64) !== "completed") {
    throw new Error("Smoke recon refresh job did not complete");
  }

  const siteProfiles = await loadActiveSubmissionSiteProfiles([state.siteId]);
  if (!siteProfiles.ok || !Array.isArray(siteProfiles.rows) || !siteProfiles.rows.length) {
    throw new Error(siteProfiles.error || "Smoke site profile could not be reloaded");
  }

  const activeSiteProfile = siteProfiles.rows[0];
  if ((Number(activeSiteProfile.version) || 0) < 2) {
    throw new Error("Smoke site profile did not version forward after recon refresh");
  }
  if (sanitizeString(activeSiteProfile.source_job_id, 128) !== reconJobId) {
    throw new Error("Smoke site profile was not sourced from the recon refresh job");
  }

  return {
    submitStatus,
    reconStatus,
    activeSiteProfile
  };
}

async function cleanupSmokeState(state, verification) {
  const outputDirs = new Set(
    [
      verification?.submitStatus?.row?.payload?.artifacts?.output_dir,
      verification?.submitStatus?.row?.result?.artifacts?.output_dir,
      verification?.reconStatus?.row?.payload?.artifacts?.output_dir,
      verification?.reconStatus?.row?.result?.artifacts?.output_dir
    ]
      .map((value) => sanitizeOptionalString(value, 4096))
      .filter(Boolean)
  );

  const jobIds = Array.from(
    new Set(
      [
        state.submitJobId,
        sanitizeOptionalString(verification?.reconStatus?.row?.job_id, 128),
        sanitizeOptionalString(
          verification?.submitStatus?.row?.result?.drift_event?.recon_refresh?.job_id,
          128
        )
      ].filter(Boolean)
    )
  );

  if (jobIds.length) {
    await deleteRestRows("swarm_jobs", [["job_id", `in.(${jobIds.join(",")})`]]);
  }
  await deleteRestRows("submission_asset_manifests", [
    ["owner_user_id", `eq.${state.ownerUserId}`],
    ["brand_profile_id", `eq.${state.brandProfileId}`]
  ]);
  await deleteRestRows("submission_site_profiles", [["site_id", `eq.${state.siteId}`]]);
  await deleteRestRows("submission_brand_profiles", [
    ["owner_user_id", `eq.${state.ownerUserId}`],
    ["brand_profile_id", `eq.${state.brandProfileId}`]
  ]);

  for (const outputDir of outputDirs) {
    safeRm(outputDir);
  }
}

async function runSmoke(args = {}) {
  bootstrapEnv();
  getSupabaseAccess();

  const fixtureServer = await startFixtureServer({
    host: args.host,
    port: args.port
  });

  let state = null;
  let verification = null;
  let failed = null;

  try {
    state = await seedSmokeRun({
      ownerUserId: args.ownerUserId,
      ownerEmail: args.ownerEmail,
      submitUrl: fixtureServer.submitUrl,
      headed: args.headed === true
    });

    await claimAndProcess(state.submitJobId, `submission-smoke-submit-${Date.now()}`);
    verification = await verifySmokeLoop(state);

    return {
      ok: true,
      fixture_url: fixtureServer.submitUrl,
      submit_job_id: state.submitJobId,
      recon_job_id: verification.reconStatus.row.job_id,
      manifest_id: state.manifestId,
      site_id: state.siteId,
      site_profile_version: verification.activeSiteProfile.version,
      submit_report_url: verification.submitStatus.job.report_url,
      recon_report_url: verification.reconStatus.job.report_url,
      submit_output_dir:
        sanitizeOptionalString(verification.submitStatus.row?.payload?.artifacts?.output_dir, 4096) || null,
      recon_output_dir:
        sanitizeOptionalString(verification.reconStatus.row?.payload?.artifacts?.output_dir, 4096) || null,
      cleanup_skipped: args.keep === true
    };
  } catch (error) {
    failed = error;
    throw error;
  } finally {
    await stopFixtureServer(fixtureServer.server);
    if (!args.keep && state) {
      try {
        await cleanupSmokeState(state, verification);
      } catch (cleanupError) {
        if (!failed) {
          throw cleanupError;
        }
        console.error(
          JSON.stringify(
            {
              ok: false,
              cleanup_error: cleanupError?.message || "Smoke cleanup failed"
            },
            null,
            2
          )
        );
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runSmoke(args);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || "Smoke run failed",
          stack: error?.stack || null
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  startFixtureServer,
  runSmoke,
  cleanupSmokeState
};
