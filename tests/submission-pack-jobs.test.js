const test = require("node:test");
const assert = require("node:assert/strict");

const {
  enqueueSubmissionPackRecon,
  enqueueSubmissionPackSubmit,
  runPackSubmissionPreflight
} = require("../lib/submission-pack-jobs");

test("enqueueSubmissionPackRecon queues recon jobs for forney_local and skips manual-only sites by default", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackRecon(
    {
      brand_profile_id: "brand_forney",
      pack_id: "forney_local"
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          owner_user_id: "owner_forney",
          owner_email: "sales@forneygroup.agency",
          brand_key: "forneygroup",
          track: "physical_local",
          display_name: "Forney Group"
        }
      }),
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
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

  assert.equal(result.ok, true);
  assert.equal(result.summary.requested_site_count, 5);
  assert.equal(result.summary.queued_count, 4);
  assert.equal(result.summary.skipped_count, 1);
  assert.equal(queuedRequests.length, 4);
  assert.deepEqual(
    queuedRequests.map((item) => item.site_id).sort(),
    ["apple_business_connect", "bbb", "google_business_profile", "yelp"]
  );
  assert.equal(result.skipped_sites[0].site_id, "forney_chamber");
  assert.equal(result.skipped_sites[0].reason, "manual_only");
});

test("enqueueSubmissionPackRecon can include manual-only sites when requested", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackRecon(
    {
      brand_profile_id: "brand_forney",
      pack_id: "forney_local",
      include_manual: true,
      dry_run: true
    },
    {
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          owner_user_id: "owner_forney",
          owner_email: "sales@forneygroup.agency",
          brand_key: "forneygroup",
          track: "physical_local",
          display_name: "Forney Group"
        }
      }),
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.queued_count, 5);
  assert.equal(result.summary.skipped_count, 0);
  assert.equal(queuedRequests.length, 0);
  assert.ok(result.queued_jobs.some((item) => item.site_id === "forney_chamber"));
});

test("enqueueSubmissionPackRecon skips sites with active recon jobs", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackRecon(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "startup_core",
      site_ids: ["saashub", "betalist"],
      dry_run: false
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      listJobs: async (filters) => ({
        ok: true,
        rows: filters.site_id === "saashub" ? [{ job_id: "active_recon_1", status: "processing" }] : []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.queued_count, 1);
  assert.equal(result.summary.skipped_count, 1);
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0].site_id, "betalist");
  assert.equal(result.skipped_sites[0].site_id, "saashub");
  assert.equal(result.skipped_sites[0].reason, "active_recon_exists");
});

test("enqueueSubmissionPackRecon carries site runtime policy into queued metadata", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackRecon(
    {
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"]
    },
    {
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      listJobs: async () => ({ ok: true, rows: [] }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0].metadata.submission_proxy_auto_select, false);
  assert.equal(queuedRequests[0].metadata.self_hosted_proxy_server, "");
});

test("runPackSubmissionPreflight forwards pack selection into submission preflight", async () => {
  const result = await runPackSubmissionPreflight(
    {
      brand_profile_id: "brand_forney",
      pack_id: "forney_local"
    },
    {
      ownerUserId: "owner_forney",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          track: "physical_local",
          display_name: "Forney Group",
          website_url: "https://forneygroup.agency",
          profile: {
            contact: { email: "sales@forneygroup.agency" },
            location: {
              address_line_1: "201 N Bois D Arc St",
              city: "Forney",
              state: "TX"
            }
          }
        }
      }),
      loadAssetManifest: async () => ({
        ok: true,
        row: {
          manifest_id: "manifest_1",
          version: 1,
          status: "approved",
          manifest: {
            site_manifests: [
              { site_id: "google_business_profile", missing_items: [] },
              { site_id: "apple_business_connect", missing_items: [] },
              { site_id: "yelp", missing_items: [] },
              { site_id: "bbb", missing_items: [] },
              { site_id: "forney_chamber", missing_items: [] }
            ],
            missing_items: []
          }
        }
      }),
      loadSiteProfiles: async (siteIds) => ({
        ok: true,
        rows: siteIds.map((siteId) => ({
          site_id: siteId,
          site_name: siteId,
          submission_policy: siteId === "forney_chamber" ? "manual" : "assist",
          last_recon_at: new Date().toISOString(),
          profile: {
            fields: [{ label: "Name", name: "name" }],
            gates: [],
            duplicate_check_flow: []
          }
        }))
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.pack.pack_id, "forney_local");
  assert.equal(result.request.site_ids.length, 5);
  assert.ok(result.items.some((item) => item.site_id === "forney_chamber"));
});

test("runPackSubmissionPreflight blocks product packs with no currently eligible connectors", async () => {
  const result = await runPackSubmissionPreflight(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "launch_starter"
    },
    {
      ownerUserId: "owner_clusterseo",
      listJobs: async () => ({
        ok: true,
        rows: [
          {
            job_id: "submit_1",
            job_type: "directory_submit",
            site_id: "saashub",
            status: "paused",
            created_at: "2026-03-29T08:00:00.000Z",
            result: {
              submission_status: "paused_for_captcha"
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /no currently eligible connectors/i);
  assert.equal(result.pack.pack_id, "launch_starter");
});

test("enqueueSubmissionPackSubmit queues ready sites and skips blocked or manual ones", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackSubmit(
    {
      brand_profile_id: "brand_forney",
      pack_id: "forney_local",
      dry_run: false
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          owner_user_id: "owner_forney",
          owner_email: "sales@forneygroup.agency",
          brand_key: "forneygroup",
          track: "physical_local",
          display_name: "Forney Group"
        }
      }),
      runPackSubmissionPreflight: async () => ({
        ok: true,
        pack: {
          pack_id: "forney_local",
          pack_name: "Forney Local",
          track: "physical_local"
        },
        manifest: {
          manifest_id: "manifest_forney_v1",
          version: 1,
          status: "approved",
          color: "green"
        },
        summary: {
          site_count: 5,
          ready_auto_count: 1,
          ready_assist_count: 2,
          blocked_count: 2
        },
        items: [
          {
            site_id: "google_business_profile",
            site_name: "Google Business Profile",
            track: "physical_local",
            support_tier: "recon_needed",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 82,
            manifest_color: "green",
            reasons: []
          },
          {
            site_id: "apple_business_connect",
            site_name: "Apple Business Connect",
            track: "physical_local",
            support_tier: "recon_needed",
            effective_policy: "auto",
            decision: "ready_auto",
            connector_confidence: 94,
            manifest_color: "green",
            reasons: []
          },
          {
            site_id: "yelp",
            site_name: "Yelp",
            track: "physical_local",
            support_tier: "recon_needed",
            effective_policy: "assist",
            decision: "blocked",
            connector_confidence: 70,
            manifest_color: "red",
            reasons: [{ code: "site_manifest_missing_items" }]
          },
          {
            site_id: "bbb",
            site_name: "BBB",
            track: "physical_local",
            support_tier: "recon_needed",
            effective_policy: "manual",
            decision: "ready_assist",
            connector_confidence: 76,
            manifest_color: "yellow",
            reasons: [{ code: "manual_policy" }]
          }
        ]
      }),
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
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

  assert.equal(result.ok, true);
  assert.equal(result.summary.queued_count, 2);
  assert.equal(result.summary.skipped_count, 2);
  assert.equal(queuedRequests.length, 2);
  assert.deepEqual(
    queuedRequests.map((item) => item.site_id).sort(),
    ["apple_business_connect", "google_business_profile"]
  );
  assert.equal(queuedRequests[0].brand_profile_id, "brand_forney");
  assert.equal(queuedRequests[0].manifest_id, "manifest_forney_v1");
  assert.equal(result.skipped_sites[0].reason, "preflight_blocked");
  assert.equal(result.skipped_sites[1].reason, "manual_policy");
});

test("enqueueSubmissionPackSubmit carries site runtime policy into queued metadata", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackSubmit(
    {
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"],
      manifest_id: "manifest_1"
    },
    {
      ownerUserId: "owner_clusterseo",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      runPackSubmissionPreflight: async () => ({
        ok: true,
        items: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            decision: "ready_assist",
            effective_policy: "assist",
            track: "startup",
            connector_confidence: 90,
            manifest_color: "green"
          }
        ],
        manifest: { manifest_id: "manifest_1" },
        effective_pack: { requested_site_count: 1, selected_site_count: 1, excluded_site_count: 0, downgraded_site_count: 0 }
      }),
      listJobs: async () => ({ ok: true, rows: [] }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0].metadata.submission_proxy_auto_select, false);
  assert.equal(queuedRequests[0].metadata.self_hosted_proxy_server, "");
});

test("enqueueSubmissionPackSubmit skips sites with active submit jobs", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackSubmit(
    {
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub", "betalist"]
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      runPackSubmissionPreflight: async () => ({
        ok: true,
        pack: {
          pack_id: "startup_core",
          pack_name: "Startup Core",
          track: "startup"
        },
        manifest: {
          manifest_id: "manifest_clusterseo_v1",
          version: 1,
          status: "approved",
          color: "green"
        },
        summary: {
          site_count: 2,
          ready_auto_count: 0,
          ready_assist_count: 2,
          blocked_count: 0
        },
        items: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            track: "startup",
            support_tier: "supported",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 92,
            manifest_color: "green",
            reasons: []
          },
          {
            site_id: "betalist",
            site_name: "BetaList",
            track: "startup",
            support_tier: "recon_needed",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 83,
            manifest_color: "yellow",
            reasons: []
          }
        ]
      }),
      listJobs: async (filters) => ({
        ok: true,
        rows: filters.site_id === "saashub" ? [{ job_id: "submit_active_1", status: "processing" }] : []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.queued_count, 1);
  assert.equal(result.summary.skipped_count, 1);
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0].site_id, "betalist");
  assert.equal(result.skipped_sites[0].site_id, "saashub");
  assert.equal(result.skipped_sites[0].reason, "active_submit_exists");
});

test("enqueueSubmissionPackSubmit promotes assisted connectors to auto in no-human-actions mode", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackSubmit(
    {
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"],
      no_human_actions: true,
      dry_run: false
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      runPackSubmissionPreflight: async () => ({
        ok: true,
        pack: {
          pack_id: "startup_core",
          pack_name: "Startup Core",
          track: "startup"
        },
        manifest: {
          manifest_id: "manifest_clusterseo_v1",
          version: 1,
          status: "approved",
          color: "green"
        },
        summary: {
          site_count: 1,
          ready_auto_count: 0,
          ready_assist_count: 1,
          blocked_count: 0
        },
        items: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            track: "startup",
            support_tier: "supported",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 92,
            manifest_color: "green",
            reasons: []
          }
        ]
      }),
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.queued_count, 1);
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0].submission_policy, "auto");
  assert.equal(queuedRequests[0].stop_before_submit, false);
  assert.equal(queuedRequests[0].metadata.no_human_actions, true);
});

test("enqueueSubmissionPackSubmit reports effective pack size when live selection shrinks a product pack", async () => {
  const queuedRequests = [];
  const result = await enqueueSubmissionPackSubmit(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "launch_boosters",
      dry_run: false
    },
    {
      publicBaseUrl: "https://swarmtester.com",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          owner_user_id: "owner_clusterseo",
          owner_email: "team@clusterseo.com",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO"
        }
      }),
      runPackSubmissionPreflight: async () => ({
        ok: true,
        request: {
          site_ids: ["betalist", "futurepedia"]
        },
        live_pack_selection: {
          degraded_count: 1
        },
        pack: {
          pack_id: "launch_boosters",
          pack_name: "Launch Boosters",
          track: "startup",
          effective_site_count: 2
        },
        manifest: {
          manifest_id: "manifest_clusterseo_v2",
          version: 2,
          status: "approved",
          color: "green"
        },
        summary: {
          site_count: 2,
          ready_auto_count: 0,
          ready_assist_count: 2,
          blocked_count: 0
        },
        items: [
          {
            site_id: "betalist",
            site_name: "BetaList",
            track: "startup",
            support_tier: "recon_needed",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 81,
            manifest_color: "yellow",
            reasons: []
          },
          {
            site_id: "futurepedia",
            site_name: "Futurepedia",
            track: "startup",
            support_tier: "recon_needed",
            effective_policy: "assist",
            decision: "ready_assist",
            connector_confidence: 78,
            manifest_color: "yellow",
            reasons: []
          }
        ]
      }),
      listJobs: async () => ({
        ok: true,
        rows: []
      }),
      enqueueJob: async (request) => {
        queuedRequests.push(request);
        return {
          ok: true,
          row: { job_id: request.job_id, status: "queued" },
          job: { job_id: request.job_id, status: "queued" }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.requested_site_count, 2);
  assert.equal(result.summary.static_requested_site_count, 4);
  assert.equal(result.summary.queued_count, 2);
  assert.equal(result.live_pack_selection.degraded_count, 1);
  assert.ok(result.next_steps.some((step) => /downgraded by live telemetry/i.test(step)));
  assert.equal(queuedRequests.length, 2);
});
