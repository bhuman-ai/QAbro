#!/usr/bin/env node

const { bootstrapEnv } = require("./submission-worker");
const { upsertSubmissionBrandProfile } = require("../lib/submission-brand-profiles");
const { sanitizeString } = require("../lib/qa-core");

function parseArgs(argv) {
  const args = {
    owner_user_id: "",
    owner_email: "",
    brand_profile_id: "brand_forneygroup_agency",
    brand_key: "forneygroup_agency"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--owner-user-id") {
      args.owner_user_id = sanitizeString(argv[index + 1], 128);
      index += 1;
      continue;
    }
    if (arg === "--owner-email") {
      args.owner_email = sanitizeString(argv[index + 1], 320).toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--brand-profile-id") {
      args.brand_profile_id = sanitizeString(argv[index + 1], 128);
      index += 1;
      continue;
    }
    if (arg === "--brand-key") {
      args.brand_key = sanitizeString(argv[index + 1], 256).toLowerCase();
      index += 1;
    }
  }

  return args;
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.owner_user_id) {
    throw new Error("--owner-user-id is required");
  }
  if (!args.owner_email) {
    throw new Error("--owner-email is required");
  }

  const saved = await upsertSubmissionBrandProfile(
    {
      brand_profile_id: args.brand_profile_id,
      brand_key: args.brand_key,
      track: "physical_local",
      display_name: "Forney Group Insurance Agency",
      legal_name: "Forney Group Insurance Agency",
      website_url: "https://forneygroup.agency/",
      profile: {
        summary:
          "Texas insurance agency serving Forney and surrounding areas with home, auto, life, business, condo, renters, boat, motorcycle, and ATV coverage.",
        description:
          "Forney Group Insurance Agency is a Texas-based insurance company serving Forney and nearby communities with personalized insurance solutions across home, auto, life, business, condo, renters, boat, motorcycle, and ATV coverage.",
        tags: ["insurance", "home insurance", "auto insurance", "life insurance", "business insurance"],
        services: [
          "Home Insurance",
          "Auto Insurance",
          "Life Insurance",
          "Business Insurance",
          "Condo Insurance",
          "Renters Insurance",
          "Boat Insurance",
          "Motorcycle Insurance",
          "ATV Insurance"
        ],
        contact: {
          email: "sales@forneygroup.agency",
          phone: "(972) 552-6919"
        },
        location: {
          address_line_1: "201 N Bois D Arc St",
          city: "Forney",
          state: "TX",
          postal_code: "75126",
          country: "US",
          service_areas: [
            "Forney, TX",
            "Dallas, TX",
            "Mesquite, TX",
            "Garland, TX",
            "Rockwall, TX",
            "Rowlett, TX",
            "Terrell, TX",
            "Sunnyvale, TX",
            "Heath, TX",
            "Sachse, TX"
          ],
          hours: {
            monday: "8:00am-5:00pm",
            tuesday: "8:00am-5:00pm",
            wednesday: "8:00am-5:00pm",
            thursday: "8:00am-5:00pm",
            friday: "8:00am-5:00pm"
          }
        },
        team: [
          {
            name: "Nataliya Schwedt",
            role: "Agency Lead"
          }
        ],
        links: {
          quote_url: "https://forneygroup.agency/contact/"
        }
      }
    },
    {
      ownerUserId: args.owner_user_id,
      ownerEmail: args.owner_email
    }
  );

  if (!saved.ok) {
    throw new Error(saved.error || "Failed to seed Forney brand profile");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        brand_profile: saved.row,
        next_steps: [
          `Run: npm run submission:pack:recon -- --brand-profile-id ${saved.row.brand_profile_id} --pack-id forney_local --dry-run`,
          `Then remove --dry-run to enqueue the real recon batch.`
        ]
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
          error: error?.message || "Failed to seed Forney brand profile",
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
