#!/usr/bin/env node

const { bootstrapEnv } = require("./submission-worker");
const { upsertSubmissionBrandProfile } = require("../lib/submission-brand-profiles");
const { createSubmissionAssetManifest } = require("../lib/submission-asset-manifests");
const { upsertSubmissionSiteProfile } = require("../lib/submission-site-profiles");
const { enqueueSubmissionPackSubmit } = require("../lib/submission-pack-jobs");
const { sanitizeString } = require("../lib/qa-core");

function parseArgs(argv) {
  return {
    keep: argv.includes("--keep")
  };
}

function getSupabaseAccess() {
  const supabaseUrl = sanitizeString(process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(process.env.SUPABASE_SERVICE_KEY, 4096);
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }
  return { supabaseUrl, serviceKey };
}

async function cleanupSyntheticRows({ supabaseUrl, serviceKey, ownerUserId, brandProfileId, siteIds }) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`
  };

  await fetch(
    `${supabaseUrl}/rest/v1/submission_asset_manifests?owner_user_id=eq.${encodeURIComponent(ownerUserId)}&brand_profile_id=eq.${encodeURIComponent(brandProfileId)}`,
    {
      method: "DELETE",
      headers
    }
  );

  if (Array.isArray(siteIds) && siteIds.length) {
    await fetch(`${supabaseUrl}/rest/v1/submission_site_profiles?site_id=in.(${siteIds.join(",")})`, {
      method: "DELETE",
      headers
    });
  }

  await fetch(
    `${supabaseUrl}/rest/v1/submission_brand_profiles?owner_user_id=eq.${encodeURIComponent(ownerUserId)}&brand_profile_id=eq.${encodeURIComponent(brandProfileId)}`,
    {
      method: "DELETE",
      headers
    }
  );
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));
  const { supabaseUrl, serviceKey } = getSupabaseAccess();

  const stamp = Date.now();
  const ownerUserId = "smoke_pack_submit_operator";
  const ownerEmail = "smoke-pack-submit@example.com";
  const brandProfileId = `brand_pack_submit_smoke_${stamp}`;
  const brandKey = `pack_submit_smoke_${stamp}`;
  const siteIds = ["saashub", "betalist"];

  try {
    const brand = await upsertSubmissionBrandProfile(
      {
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        brand_profile_id: brandProfileId,
        brand_key: brandKey,
        track: "startup",
        display_name: "ClusterSEO Smoke",
        website_url: "https://clusterseo.com/",
        profile: {
          contact: {
            email: "team@clusterseo.com"
          },
          links: {
            linkedin_url: "https://www.linkedin.com/company/clusterseo/"
          }
        }
      },
      {
        ownerUserId,
        ownerEmail
      }
    );
    if (!brand.ok) {
      throw new Error(brand.error || "Failed to seed submission brand profile");
    }

    for (const siteId of siteIds) {
      const siteName = siteId === "saashub" ? "SaaSHub" : "BetaList";
      const submitUrl = siteId === "saashub" ? "https://www.saashub.com/services/submit" : "https://betalist.com/submit";
      const siteProfile = await upsertSubmissionSiteProfile({
        site_id: siteId,
        site_name: siteName,
        track: "startup",
        status: "active",
        submission_policy: siteId === "saashub" ? "assist" : "auto",
        submit_url: submitUrl,
        profile: {
          fields: [
            { label: "Name", name: "name" },
            { label: "Website", name: "website" }
          ],
          gates: [],
          duplicate_check_flow: []
        },
        evidence: {
          source: "smoke_submission_pack_submit"
        },
        source_job_id: `seed_pack_submit_${stamp}`,
        last_recon_at: new Date().toISOString()
      });
      if (!siteProfile.ok) {
        throw new Error(siteProfile.error || `Failed to seed ${siteId} site profile`);
      }
    }

    const manifest = await createSubmissionAssetManifest(
      {
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        brand_profile_id: brandProfileId,
        brand_key: brandKey,
        track: "startup",
        status: "approved",
        manifest: {
          copy_pack: {
            one_liner_60: "ClusterSEO helps teams scale SEO workflows.",
            blurb_280: "ClusterSEO helps teams scale SEO workflows and link operations from one place."
          },
          missing_items: [],
          site_manifests: [
            {
              site_id: "saashub",
              missing_items: []
            },
            {
              site_id: "betalist",
              missing_items: []
            }
          ]
        },
        approval: {
          status: "approved"
        },
        source_job_id: `seed_pack_submit_${stamp}`
      },
      {
        ownerUserId,
        ownerEmail
      }
    );
    if (!manifest.ok) {
      throw new Error(manifest.error || "Failed to seed submission asset manifest");
    }

    const result = await enqueueSubmissionPackSubmit(
      {
        brand_profile_id: brandProfileId,
        pack_id: "startup_core",
        site_ids: siteIds,
        dry_run: true
      },
      {
        ownerUserId,
        ownerEmail,
        publicBaseUrl: process.env.QA_PUBLIC_APP_URL || "https://swarmtester.com"
      }
    );
    if (!result.ok) {
      throw new Error(result.error || "Pack submit smoke failed");
    }

    if (result.summary?.queued_count !== 2 || result.summary?.failed_count !== 0) {
      throw new Error(`Unexpected pack submit smoke summary: ${JSON.stringify(result.summary)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          brand_profile_id: brandProfileId,
          pack_id: result.pack?.pack_id || "startup_core",
          manifest_id: result.manifest?.manifest_id || null,
          summary: result.summary,
          queued_jobs: result.queued_jobs,
          skipped_sites: result.skipped_sites,
          failed_sites: result.failed_sites,
          kept: args.keep === true
        },
        null,
        2
      )
    );

    if (!args.keep) {
      await cleanupSyntheticRows({
        supabaseUrl,
        serviceKey,
        ownerUserId,
        brandProfileId,
        siteIds
      });
    }
  } catch (error) {
    if (!args.keep) {
      await cleanupSyntheticRows({
        supabaseUrl,
        serviceKey,
        ownerUserId,
        brandProfileId,
        siteIds
      }).catch(() => {});
    }
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || "Pack submit smoke failed",
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
  cleanupSyntheticRows,
  main
};
