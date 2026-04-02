const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSubmissionSiteScorecard, classifyJobBucket } = require("../lib/submission-scorecard");

test("classifyJobBucket maps submission outcomes into telemetry buckets", () => {
  assert.equal(
    classifyJobBucket({
      status: "completed",
      result: { submission_status: "submitted" }
    }),
    "success"
  );
  assert.equal(
    classifyJobBucket({
      status: "paused",
      result: { submission_status: "paused_for_captcha" }
    }),
    "captcha"
  );
  assert.equal(
    classifyJobBucket({
      status: "failed",
      result: { submission_status: "failed" }
    }),
    "failed"
  );
});

test("buildSubmissionSiteScorecard merges live telemetry onto static catalog sites", async () => {
  const scorecard = await buildSubmissionSiteScorecard(
    {
      track: "startup",
      telemetry_window_days: 45,
      telemetry_limit: 50
    },
    {
      ownerUserId: "user_alpha",
      listJobs: async () => ({
        ok: true,
        rows: [
          {
            job_id: "submit_1",
            job_type: "directory_submit",
            site_id: "saashub",
            status: "completed",
            created_at: "2026-03-27T08:00:00.000Z",
            result: {
              submission_status: "submitted"
            }
          },
          {
            job_id: "submit_2",
            job_type: "directory_submit",
            site_id: "saashub",
            status: "paused",
            created_at: "2026-03-28T08:00:00.000Z",
            result: {
              submission_status: "paused_for_captcha"
            }
          },
          {
            job_id: "submit_3",
            job_type: "directory_submit",
            site_id: "betalist",
            status: "paused",
            created_at: "2026-03-28T12:00:00.000Z",
            result: {
              submission_status: "paused_for_login"
            }
          },
          {
            job_id: "submit_4",
            job_type: "directory_submit",
            site_id: "toolify",
            status: "failed",
            created_at: "2026-03-29T08:00:00.000Z",
            result: {
              submission_status: "failed"
            }
          }
        ]
      })
    }
  );

  assert.equal(scorecard.ok, true);
  assert.equal(scorecard.summary.total_sites, 7);
  assert.equal(scorecard.effective_summary.total_sites, 7);
  assert.equal(scorecard.telemetry_summary.sample_window_days, 45);
  assert.equal(scorecard.telemetry_summary.sampled_jobs, 4);
  assert.equal(scorecard.telemetry_summary.sites_with_live_runs, 3);
  assert.equal(scorecard.telemetry_summary.captcha_count, 1);
  assert.equal(scorecard.telemetry_summary.auth_count, 1);

  const saashub = scorecard.sites.find((site) => site.site_id === "saashub");
  assert.ok(saashub);
  assert.equal(saashub.live_status, "watch");
  assert.equal(saashub.telemetry.total_runs, 2);
  assert.equal(saashub.telemetry.success_count, 1);
  assert.equal(saashub.telemetry.captcha_count, 1);
  assert.equal(saashub.telemetry.success_rate_percent, 50);
  assert.equal(saashub.telemetry.last_submission_status, "paused_for_captcha");
  assert.equal(saashub.effective_product_status, "yellow");
  assert.equal(saashub.eligibility_tier, "booster");
  assert.equal(saashub.degraded_from_catalog, true);

  const betalist = scorecard.sites.find((site) => site.site_id === "betalist");
  assert.ok(betalist);
  assert.equal(betalist.live_status, "blocked");
  assert.equal(betalist.telemetry.auth_count, 1);
  assert.equal(betalist.effective_product_status, "yellow");
  assert.equal(betalist.eligibility_tier, "booster");

  const toolify = scorecard.sites.find((site) => site.site_id === "toolify");
  assert.ok(toolify);
  assert.equal(toolify.live_status, "blocked");
  assert.equal(toolify.effective_product_status, "red");
  assert.equal(toolify.eligibility_tier, "manual");

  const productHunt = scorecard.sites.find((site) => site.site_id === "product_hunt");
  assert.ok(productHunt);
  assert.equal(productHunt.live_status, "untested");
  assert.equal(productHunt.telemetry.total_runs, 0);
  assert.equal(productHunt.effective_product_status, "red");
  assert.equal(productHunt.eligibility_tier, "manual");

  assert.equal(scorecard.effective_summary.green_count, 0);
  assert.equal(scorecard.effective_summary.yellow_count, 4);
  assert.equal(scorecard.effective_summary.red_count, 3);
  assert.equal(scorecard.eligibility_summary.starter_count, 0);
  assert.equal(scorecard.eligibility_summary.booster_count, 4);
  assert.equal(scorecard.eligibility_summary.manual_count, 3);
  assert.equal(scorecard.eligibility_summary.degraded_count, 2);
});

test("buildSubmissionSiteScorecard tolerates telemetry load failures", async () => {
  const scorecard = await buildSubmissionSiteScorecard(
    {
      track: "physical_local"
    },
    {
      ownerUserId: "user_alpha",
      listJobs: async () => ({
        ok: false,
        error: "telemetry unavailable"
      })
    }
  );

  assert.equal(scorecard.ok, true);
  assert.equal(scorecard.telemetry_error, "telemetry unavailable");
  assert.equal(scorecard.sites.length, 5);
  assert.ok(scorecard.sites.every((site) => site.live_status === "untested"));
  assert.ok(scorecard.sites.every((site) => site.effective_product_status === site.product_status));
});
