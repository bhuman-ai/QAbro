#!/usr/bin/env node

const { bootstrapEnv } = require("./submission-worker");
const { runPackSubmissionPreflight } = require("../lib/submission-pack-jobs");
const { sanitizeString } = require("../lib/qa-core");

function parseArgs(argv) {
  const args = {
    brand_profile_id: "",
    pack_id: "",
    track: "",
    site_ids: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--brand-profile-id") {
      args.brand_profile_id = sanitizeString(argv[index + 1], 128);
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
  }

  return args;
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));
  const result = await runPackSubmissionPreflight(args, {});
  if (!result.ok) {
    throw new Error(result.error || "Pack preflight failed");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked_at: result.checked_at,
        request: result.request,
        pack: result.pack,
        brand: result.brand,
        overall_decision: result.overall_decision,
        summary: result.summary,
        items: result.items,
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
          error: error?.message || "Pack preflight failed",
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
