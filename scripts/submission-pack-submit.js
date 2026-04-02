#!/usr/bin/env node

const { bootstrapEnv } = require("./submission-worker");
const { enqueueSubmissionPackSubmit } = require("../lib/submission-pack-jobs");
const { sanitizeString } = require("../lib/qa-core");

function parseArgs(argv) {
  const args = {
    brand_profile_id: "",
    manifest_id: "",
    pack_id: "",
    track: "",
    site_ids: [],
    include_manual: false,
    include_auto: true,
    include_assist: true,
    skip_if_active: true,
    dry_run: false,
    stop_before_submit: true,
    no_human_actions: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--brand-profile-id") {
      args.brand_profile_id = sanitizeString(argv[index + 1], 128);
      index += 1;
      continue;
    }
    if (arg === "--manifest-id") {
      args.manifest_id = sanitizeString(argv[index + 1], 128);
      index += 1;
      continue;
    }
    if (arg === "--pack-id") {
      args.pack_id = sanitizeString(argv[index + 1], 128);
      index += 1;
      continue;
    }
    if (arg === "--track") {
      args.track = sanitizeString(argv[index + 1], 64);
      index += 1;
      continue;
    }
    if (arg === "--site-id") {
      const siteId = sanitizeString(argv[index + 1], 128).toLowerCase();
      if (siteId) {
        args.site_ids.push(siteId);
      }
      index += 1;
      continue;
    }
    if (arg === "--include-manual") {
      args.include_manual = true;
      continue;
    }
    if (arg === "--no-auto") {
      args.include_auto = false;
      continue;
    }
    if (arg === "--no-assist") {
      args.include_assist = false;
      continue;
    }
    if (arg === "--no-skip-if-active") {
      args.skip_if_active = false;
      continue;
    }
    if (arg === "--submit-live") {
      args.stop_before_submit = false;
      continue;
    }
    if (arg === "--full-auto" || arg === "--no-human-actions") {
      args.no_human_actions = true;
      args.stop_before_submit = false;
      continue;
    }
    if (arg === "--dry-run") {
      args.dry_run = true;
    }
  }

  return args;
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));
  const result = await enqueueSubmissionPackSubmit(args, {
    publicBaseUrl: process.env.QA_PUBLIC_APP_URL
  });
  if (!result.ok) {
    throw new Error(result.error || "Pack submit failed");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        batch_id: result.batch_id,
        pack: result.pack,
        live_pack_selection: result.live_pack_selection,
        brand: result.brand,
        manifest: result.manifest,
        preflight_summary: result.preflight_summary,
        summary: result.summary,
        queued_jobs: result.queued_jobs,
        skipped_sites: result.skipped_sites,
        failed_sites: result.failed_sites,
        next_steps: result.next_steps
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
          error: error?.message || "Pack submit failed",
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
  main
};
