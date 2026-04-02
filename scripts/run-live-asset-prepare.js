#!/usr/bin/env node

const { bootstrapEnv } = require("./submission-worker");
const { sanitizeString } = require("../lib/qa-core");
const { upsertSubmissionBrandProfile, loadSubmissionBrandProfile } = require("../lib/submission-brand-profiles");
const { upsertSubmissionSiteProfile, loadActiveSubmissionSiteProfiles } = require("../lib/submission-site-profiles");
const { createSubmissionAssetManifest } = require("../lib/submission-asset-manifests");
const { runAssetPrepare } = require("../lib/submission-runner");

function pushUnique(list, value) {
  const safeValue = sanitizeString(value, 4096);
  if (safeValue && !list.includes(safeValue)) {
    list.push(safeValue);
  }
}

function parseArgs(argv) {
  const args = {
    owner_user_id: "",
    owner_email: "",
    brand_profile_id: "",
    brand_key: "lastb2b",
    track: "startup",
    display_name: "",
    legal_name: "",
    website_url: "",
    summary: "",
    description: "",
    target_market_description: "",
    target_audience: "",
    positioning: "",
    support_email: "",
    pricing_summary: "",
    logo_url: "",
    icon_url: "",
    identity_mode: "client_owned",
    seed_startup_sites: false,
    colors: [],
    tags: [],
    categories: [],
    site_ids: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--owner-user-id") {
      args.owner_user_id = sanitizeString(next, 128);
      index += 1;
      continue;
    }
    if (arg === "--owner-email") {
      args.owner_email = sanitizeString(next, 320);
      index += 1;
      continue;
    }
    if (arg === "--brand-profile-id") {
      args.brand_profile_id = sanitizeString(next, 128);
      index += 1;
      continue;
    }
    if (arg === "--brand-key") {
      args.brand_key = sanitizeString(next, 256) || args.brand_key;
      index += 1;
      continue;
    }
    if (arg === "--track") {
      args.track = sanitizeString(next, 64) || args.track;
      index += 1;
      continue;
    }
    if (arg === "--display-name") {
      args.display_name = sanitizeString(next, 180);
      index += 1;
      continue;
    }
    if (arg === "--legal-name") {
      args.legal_name = sanitizeString(next, 240);
      index += 1;
      continue;
    }
    if (arg === "--website-url") {
      args.website_url = sanitizeString(next, 4096);
      index += 1;
      continue;
    }
    if (arg === "--summary") {
      args.summary = sanitizeString(next, 1000);
      index += 1;
      continue;
    }
    if (arg === "--description") {
      args.description = sanitizeString(next, 4000);
      index += 1;
      continue;
    }
    if (arg === "--target-market-description") {
      args.target_market_description = sanitizeString(next, 4000);
      index += 1;
      continue;
    }
    if (arg === "--target-audience") {
      args.target_audience = sanitizeString(next, 2000);
      index += 1;
      continue;
    }
    if (arg === "--positioning") {
      args.positioning = sanitizeString(next, 2000);
      index += 1;
      continue;
    }
    if (arg === "--support-email") {
      args.support_email = sanitizeString(next, 320);
      index += 1;
      continue;
    }
    if (arg === "--pricing-summary") {
      args.pricing_summary = sanitizeString(next, 1200);
      index += 1;
      continue;
    }
    if (arg === "--logo-url") {
      args.logo_url = sanitizeString(next, 4096);
      index += 1;
      continue;
    }
    if (arg === "--icon-url") {
      args.icon_url = sanitizeString(next, 4096);
      index += 1;
      continue;
    }
    if (arg === "--identity-mode") {
      args.identity_mode = sanitizeString(next, 64) || args.identity_mode;
      index += 1;
      continue;
    }
    if (arg === "--color") {
      pushUnique(args.colors, next);
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      pushUnique(args.tags, next);
      index += 1;
      continue;
    }
    if (arg === "--category") {
      pushUnique(args.categories, next);
      index += 1;
      continue;
    }
    if (arg === "--site-id") {
      pushUnique(args.site_ids, sanitizeString(next, 128).toLowerCase());
      index += 1;
      continue;
    }
    if (arg === "--seed-startup-sites") {
      args.seed_startup_sites = true;
      continue;
    }
  }

  return args;
}

async function maybeSeedStartupSiteProfiles(siteIds) {
  const requested = new Set((Array.isArray(siteIds) ? siteIds : []).map((siteId) => sanitizeString(siteId, 128).toLowerCase()));

  if (requested.has("saashub")) {
    await upsertSubmissionSiteProfile({
      site_id: "saashub",
      site_name: "SaaSHub",
      track: "startup",
      status: "verified",
      submission_policy: "assist",
      submit_url: "https://www.saashub.com/services/submit",
      profile: {
        fields: [
          { key: "product_name", label: "Product Name", type: "text", required: true },
          { key: "tagline", label: "Tagline", type: "textarea", required: true },
          { key: "categories", label: "Categories", type: "combobox", required: true },
          { key: "competitors", label: "Competitors", type: "combobox", required: false },
          { key: "website_url", label: "Website", type: "url", required: true },
          { key: "contact_email", label: "Contact email", type: "email", required: false }
        ],
        asset_requirements: [],
        gates: [],
        success_signals: ["submission received", "thank you"]
      },
      is_active: true
    });
  }

  if (requested.has("product_hunt")) {
    await upsertSubmissionSiteProfile({
      site_id: "product_hunt",
      site_name: "Product Hunt",
      track: "startup",
      status: "verified",
      submission_policy: "assist",
      submit_url: "https://www.producthunt.com/launch/preparing-for-launch",
      profile: {
        fields: [
          { key: "name", label: "Product Name", type: "text", required: true, max_length: 50 },
          { key: "tagline", label: "Tagline", type: "text", required: true, max_length: 60 },
          { key: "description", label: "Description", type: "textarea", required: true, max_length: 500 },
          { key: "website_url", label: "Website", type: "url", required: true },
          { key: "topics", label: "Topics", type: "multiselect", required: true }
        ],
        asset_requirements: [
          { key: "thumbnail_square", label: "Thumbnail", type: "image", required: true, width: 240, height: 240 },
          { key: "gallery_1270x760", label: "Gallery image", type: "image", required: true, width: 1270, height: 760, count_min: 2 },
          { key: "youtube_demo", label: "Demo video", type: "video", required: false }
        ],
        gates: ["maker_account", "launch_day"],
        success_signals: ["launch submitted", "preparing for launch"]
      },
      is_active: true
    });
  }
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));

  if (!args.owner_user_id || !args.owner_email || !args.brand_profile_id || !args.display_name || !args.website_url) {
    throw new Error("owner-user-id, owner-email, brand-profile-id, display-name, and website-url are required");
  }
  if (!args.site_ids.length) {
    throw new Error("At least one --site-id is required");
  }

  if (args.seed_startup_sites) {
    await maybeSeedStartupSiteProfiles(args.site_ids);
  }

  const profile = {
    business_name: args.display_name,
    display_name: args.display_name,
    legal_name: args.legal_name || args.display_name,
    website_url: args.website_url,
    website: args.website_url,
    summary: args.summary,
    description: args.description,
    target_market_description: args.target_market_description,
    target_audience: args.target_audience,
    positioning: args.positioning,
    pricing_summary: args.pricing_summary,
    support_email: args.support_email,
    colors: args.colors,
    categories: args.categories,
    tags: args.tags,
    identity: {
      mode: args.identity_mode
    }
  };

  if (args.logo_url || args.icon_url) {
    profile.assets = {};
    if (args.logo_url) {
      profile.assets.logo = { kind: "remote", url: args.logo_url };
    }
    if (args.icon_url) {
      profile.assets.icon = { kind: "remote", url: args.icon_url };
    }
  }

  await upsertSubmissionBrandProfile(
    {
      owner_user_id: args.owner_user_id,
      owner_email: args.owner_email,
      brand_profile_id: args.brand_profile_id,
      brand_key: args.brand_key,
      track: args.track,
      display_name: args.display_name,
      legal_name: args.legal_name || args.display_name,
      website_url: args.website_url,
      profile
    },
    { ownerUserId: args.owner_user_id, ownerEmail: args.owner_email }
  );

  const jobId = `asset-prepare-${args.brand_profile_id}-${Date.now()}`;
  const prepareResult = await runAssetPrepare(
    {
      job_id: jobId,
      owner_user_id: args.owner_user_id,
      owner_email: args.owner_email,
      brand_profile_id: args.brand_profile_id,
      site_ids: args.site_ids,
      metadata: {
        asset_generation_prefer_builtin: true,
        asset_generation_builtin: true,
        self_hosted_record_video: false
      }
    },
    {
      loadBrandProfile: (brandProfileId) =>
        loadSubmissionBrandProfile(brandProfileId, {
          ownerUserId: args.owner_user_id,
          includeSecrets: true
        }),
      loadSiteProfiles: (siteIds) => loadActiveSubmissionSiteProfiles(siteIds)
    }
  );

  const manifest = prepareResult?.result?.asset_manifest;
  if (!prepareResult?.ok || !manifest) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          prepare_result: prepareResult
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const saved = await createSubmissionAssetManifest(
    {
      manifest_id: `manifest-${args.brand_profile_id}-${Date.now()}`,
      owner_user_id: args.owner_user_id,
      owner_email: args.owner_email,
      brand_profile_id: args.brand_profile_id,
      brand_key: args.brand_key,
      track: args.track,
      source_job_id: jobId,
      status: "pending_approval",
      manifest
    },
    { ownerUserId: args.owner_user_id, ownerEmail: args.owner_email }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        brand_profile_id: args.brand_profile_id,
        manifest_id: saved?.row?.manifest_id || null,
        db_id: saved?.row?.id || null,
        generation: manifest.generation,
        output_dir: prepareResult.artifacts.output_dir,
        manifest_path: prepareResult.artifacts.manifest_path,
        run_log_path: prepareResult.artifacts.run_log_path,
        available_assets: manifest.available_assets,
        copy_pack: manifest.copy_pack,
        factual_pack: manifest.factual_pack,
        site_plans: manifest.site_plans,
        site_summaries: Array.isArray(manifest.site_manifests)
          ? Object.fromEntries(
              manifest.site_manifests.map((site) => [
                site.site_id,
                {
                  required_assets: site.asset_requirements,
                  missing_items: site.missing_items,
                  field_suggestions: site.field_suggestions
                }
              ])
            )
          : {},
        missing_items: manifest.missing_items,
        approval_items: manifest.approval_items
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || "Live asset prepare failed",
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
  maybeSeedStartupSiteProfiles,
  main
};
