const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifySubmissionDrift,
  maybeQueueSubmissionDriftRefresh
} = require("../lib/submission-drift");
const { buildSubmissionMarkdown } = require("../lib/submission-core");

test("classifySubmissionDrift flags missing submit CTA as high-severity connector drift", () => {
  const drift = classifySubmissionDrift({
    jobRequest: {
      site_id: "saashub",
      site_name: "SaaSHub"
    },
    siteProfile: {
      site_id: "saashub",
      site_name: "SaaSHub",
      version: 3,
      last_recon_at: new Date().toISOString()
    },
    result: {
      status: "paused",
      submission_status: "paused_no_submit_cta",
      summary: {
        note: "Submission was filled but no safe submit CTA was detected."
      },
      submission: {
        site_id: "saashub",
        site_name: "SaaSHub",
        filled_field_count: 5,
        failed_fields: []
      }
    }
  });

  assert.equal(drift.detected, true);
  assert.equal(drift.should_refresh, true);
  assert.equal(drift.severity, "high");
  assert.ok(drift.reason_codes.includes("submit_cta_missing"));
});

test("classifySubmissionDrift ignores non-connector configuration failures", () => {
  const drift = classifySubmissionDrift({
    jobRequest: {
      site_id: "saashub"
    },
    result: {
      status: "failed",
      submission_status: "failed",
      summary: {
        note: "Submission asset manifest not found."
      },
      submission: {}
    }
  });

  assert.equal(drift.detected, false);
  assert.equal(drift.should_refresh, false);
  assert.deepEqual(drift.reason_codes, []);
});

test("maybeQueueSubmissionDriftRefresh enqueues recon refresh when no active recon exists", async () => {
  let capturedRequest = null;
  const refresh = await maybeQueueSubmissionDriftRefresh(
    {
      claimed: {
        jobRequest: {
          job_id: "submit_1",
          site_id: "saashub",
          site_name: "SaaSHub",
          track: "startup",
          metadata: {
            brand_key: "clusterseo"
          }
        },
        row: {
          job_id: "submit_1",
          brand_key: "clusterseo"
        }
      },
      siteProfile: {
        site_id: "saashub",
        site_name: "SaaSHub",
        track: "startup",
        version: 4,
        submit_url: "https://www.saashub.com/services/submit",
        last_recon_at: new Date().toISOString()
      },
      result: {
        status: "paused",
        submission_status: "paused_no_submit_cta",
        summary: {
          note: "Submission was filled but no safe submit CTA was detected."
        },
        submission: {
          site_id: "saashub",
          site_name: "SaaSHub",
          filled_field_count: 5,
          failed_fields: []
        }
      }
    },
    {
      ownerUserId: "user_1",
      ownerEmail: "team@clusterseo.com",
      publicBaseUrl: "https://swarmtester.com",
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        capturedRequest = request;
        return {
          ok: true,
          row: {
            job_id: request.job_id,
            status: "queued"
          },
          job: {
            job_id: request.job_id,
            status: "queued",
            status_url: `https://swarmtester.com/api/submissions/status?job_id=${encodeURIComponent(request.job_id)}`,
            report_url: `https://swarmtester.com/api/submissions/report?job_id=${encodeURIComponent(request.job_id)}`
          }
        };
      }
    }
  );

  assert.ok(capturedRequest);
  assert.equal(capturedRequest.job_type, "directory_recon");
  assert.equal(capturedRequest.stop_before_submit, true);
  assert.equal(capturedRequest.metadata.refresh_kind, "connector_drift");
  assert.equal(refresh.drift_event.recon_refresh.enqueued, true);
  assert.equal(refresh.drift_event.recon_refresh.state, "queued");
});

test("maybeQueueSubmissionDriftRefresh reuses active recon refresh jobs", async () => {
  let enqueueCount = 0;
  const refresh = await maybeQueueSubmissionDriftRefresh(
    {
      claimed: {
        jobRequest: {
          job_id: "submit_2",
          site_id: "saashub",
          site_name: "SaaSHub"
        },
        row: {
          job_id: "submit_2"
        }
      },
      siteProfile: {
        site_id: "saashub",
        site_name: "SaaSHub",
        submit_url: "https://www.saashub.com/services/submit",
        last_recon_at: new Date().toISOString()
      },
      result: {
        status: "paused",
        submission_status: "paused_no_submit_cta",
        summary: {
          note: "Submission was filled but no safe submit CTA was detected."
        },
        submission: {
          site_id: "saashub",
          site_name: "SaaSHub",
          filled_field_count: 5,
          failed_fields: []
        }
      }
    },
    {
      ownerUserId: "user_1",
      listJobs: async () => ({
        ok: true,
        rows: [
          {
            job_id: "recon_existing_1",
            status: "queued"
          }
        ]
      }),
      enqueueJob: async () => {
        enqueueCount += 1;
        return { ok: true };
      }
    }
  );

  assert.equal(enqueueCount, 0);
  assert.equal(refresh.drift_event.recon_refresh.state, "existing");
  assert.equal(refresh.drift_event.recon_refresh.job_id, "recon_existing_1");
});

test("buildSubmissionMarkdown renders drift details", () => {
  const markdown = buildSubmissionMarkdown(
    {
      status: "paused",
      submission_status: "paused_no_submit_cta",
      summary: {
        note: "Submission paused."
      },
      submission: {
        site_id: "saashub",
        site_name: "SaaSHub",
        submission_policy: "assist",
        filled_field_count: 5,
        uploaded_asset_count: 1
      },
      evidence: {
        screenshots: []
      },
      next_steps: [],
      drift_event: {
        detected: true,
        severity: "high",
        note: "The connector reached the filled state but no safe final submit CTA was detected.",
        reasons: [
          {
            code: "submit_cta_missing",
            message: "The connector reached the filled state but no safe final submit CTA was detected."
          }
        ],
        recon_refresh: {
          enqueued: true,
          job_id: "recon-refresh-saashub-123"
        }
      }
    },
    {
      job_id: "submit_3",
      brand_profile_id: "brand_clusterseo",
      site_id: "saashub"
    }
  );

  assert.match(markdown, /## Drift/);
  assert.match(markdown, /submit_cta_missing/);
  assert.match(markdown, /Recon refresh queued: recon-refresh-saashub-123/);
});
