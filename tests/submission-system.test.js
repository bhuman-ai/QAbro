const test = require("node:test");
const assert = require("node:assert/strict");

const {
  expandSiteSelection,
  getSitePack,
  listSitePacks,
  listSiteScorecard,
  listSupportedSites,
  recommendSitePack
} = require("../lib/site-packs");
const { runSubmissionPreflight } = require("../lib/submission-preflight");
const { deriveSubmissionInboxState, listSubmissionOperatorInbox } = require("../lib/operator-inbox");
const {
  claimSubmissionJobById,
  listSubmissionJobs,
  reclaimStaleSubmissionJobs
} = require("../lib/submission-queue");
const { __private: workerPrivate } = require("../scripts/submission-worker");

test("expandSiteSelection merges pack defaults with explicit site ids", () => {
  const selection = expandSiteSelection({
    pack_id: "startup_core",
    site_ids: ["saashub", "custom_directory"]
  });

  assert.equal(selection.pack_id, "startup_core");
  assert.ok(selection.site_ids.includes("saashub"));
  assert.ok(selection.site_ids.includes("custom_directory"));
  assert.ok(selection.site_ids.includes("betalist"));
  assert.equal(recommendSitePack("startup").pack_id, "launch_starter");
  assert.equal(recommendSitePack("startup", { legacy: true }).pack_id, "startup_core");
});

test("site packs include product summaries and scorecard ordering", () => {
  const productPack = getSitePack("launch_starter");
  assert.equal(productPack.pack_kind, "product");
  assert.equal(productPack.product_summary.total_sites, 1);
  assert.equal(productPack.product_summary.green_count, 1);
  assert.equal(productPack.product_summary.yellow_count, 0);
  assert.equal(productPack.product_summary.red_count, 0);

  const legacyPack = getSitePack("startup_core");
  assert.equal(legacyPack.pack_kind, "legacy");
  assert.equal(legacyPack.product_summary.total_sites, 4);
  assert.equal(legacyPack.product_summary.green_count, 1);
  assert.equal(legacyPack.product_summary.yellow_count, 1);
  assert.equal(legacyPack.product_summary.red_count, 2);

  const scorecard = listSiteScorecard({ track: "startup" });
  assert.equal(scorecard.summary.total_sites, 7);
  assert.equal(scorecard.sites[0].site_id, "saashub");
  assert.equal(scorecard.sites[0].product_status, "green");
  assert.equal(scorecard.sites[1].site_id, "betalist");
  assert.equal(scorecard.sites[1].execution_policy.session_mode, "ephemeral_submitter");
  assert.equal(scorecard.sites[1].runtime_policy.twocaptcha_timeout_ms, 240000);
  assert.ok(scorecard.sites.some((site) => site.site_id === "product_hunt" && site.product_status === "red"));

  const productPacks = listSitePacks({ track: "startup", pack_kind: "product" });
  assert.deepEqual(productPacks.map((pack) => pack.pack_id), ["launch_starter", "launch_boosters", "community_launch"]);
});

test("listSupportedSites can filter by product_status", () => {
  const greenSites = listSupportedSites({ track: "startup", product_status: "green" });
  assert.deepEqual(greenSites.map((site) => site.site_id), ["saashub"]);

  const yellowPresence = listSiteScorecard({ track: "physical_local", product_status: "yellow" });
  assert.equal(yellowPresence.summary.yellow_count, 4);
  assert.equal(yellowPresence.sites.length, 4);

  const starterSites = listSupportedSites({ pack_id: "launch_starter" });
  assert.deepEqual(starterSites.map((site) => site.site_id), ["saashub"]);

  const starterScorecard = listSiteScorecard({ pack_id: "launch_starter" });
  assert.equal(starterScorecard.summary.total_sites, 1);
  assert.equal(starterScorecard.sites[0].site_id, "saashub");
});

test("recon promotion skips interstitial-only connector snapshots", () => {
  const decision = workerPrivate.shouldPromoteReconSiteProfile(
    {
      site_id: "saashub",
      profile: {
        fields: [
          { key: "product_name", label: "Product Name", type: "text", required: true },
          { key: "website_url", label: "Website", type: "url", required: true }
        ]
      }
    },
    {
      site_id: "saashub",
      fields: [],
      pages: [
        {
          title: "Just a moment...",
          text_hints: [
            "Performing security verification",
            "This website uses a security service to protect against malicious bots."
          ]
        }
      ]
    }
  );

  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "interstitial_recon_profile");
});

test("runSubmissionPreflight returns ready_assist for pending-approval manifest", async () => {
  const result = await runSubmissionPreflight(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "startup_core",
      site_ids: ["saashub"]
    },
    {
      ownerUserId: "user_1",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://www.clusterseo.com/",
          profile: {
            contact: {
              email: "team@clusterseo.com"
            },
            identity: {
              mode: "client_owned",
              mailbox: {
                email: "listings@clusterseo.com",
                auth_method: "app_password",
                protocol: "imap",
                app_password_configured: true,
                inbox_ready: true
              }
            }
          }
        }
      }),
      loadAssetManifest: async () => ({
        ok: true,
        row: {
          manifest_id: "manifest_1",
          version: 2,
          status: "pending_approval",
          manifest: {
            missing_items: [],
            site_manifests: [
              {
                site_id: "saashub",
                missing_items: []
              }
            ]
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            last_recon_at: new Date().toISOString(),
            profile: {
              fields: [{ label: "Product Name", name: "service[name]" }],
              gates: [],
              duplicate_check_flow: []
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.overall_decision, "ready_assist");
  assert.equal(result.summary.ready_assist_count, 1);
  assert.equal(result.items[0].decision, "ready_assist");
  assert.ok(Array.isArray(result.items[0].policy_summary));
  assert.ok(result.items[0].policy_summary.includes("Ephemeral session"));
  assert.ok(result.items[0].policy_summary.includes("Client mailbox"));
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "manifest_pending_approval"));
});

test("runSubmissionPreflight blocks stale or missing connector inputs", async () => {
  const result = await runSubmissionPreflight(
    {
      brand_profile_id: "brand_forney",
      pack_id: "physical_local",
      site_ids: ["google_business_profile"]
    },
    {
      ownerUserId: "user_1",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          track: "physical_local",
          display_name: "Forney Group",
          website_url: "https://forneygroup.agency",
          profile: {
            contact: {
              email: "sales@forneygroup.agency"
            },
            location: {
              address_line_1: "201 N Bois D Arc St",
              city: "Forney",
              state: "TX"
            }
          }
        }
      }),
      loadAssetManifest: async () => ({
        ok: false,
        status: 404,
        error: "Submission asset manifest not found"
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "google_business_profile",
            site_name: "Google Business Profile",
            submission_policy: "assist",
            last_recon_at: "2025-01-01T00:00:00.000Z",
            profile: {
              fields: [{ label: "Business name", name: "business_name" }],
              gates: [{ type: "auth", note: "verification" }],
              duplicate_check_flow: ["Search for existing listing first."]
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.overall_decision, "blocked");
  assert.equal(result.items[0].decision, "blocked");
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "stale_site_profile"));
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "missing_asset_manifest"));
});

test("runSubmissionPreflight blocks client-owned connectors when mailbox access is missing", async () => {
  const result = await runSubmissionPreflight(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "launch_starter",
      site_ids: ["saashub"]
    },
    {
      ownerUserId: "user_1",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://www.clusterseo.com/",
          profile: {
            contact: {
              email: "team@clusterseo.com"
            },
            identity: {
              mode: "client_owned"
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
            missing_items: [],
            site_manifests: [
              {
                site_id: "saashub",
                missing_items: []
              }
            ]
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            last_recon_at: new Date().toISOString(),
            profile: {
              fields: [{ label: "Product Name", name: "service[name]" }],
              gates: [],
              duplicate_check_flow: []
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.overall_decision, "blocked");
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "missing_client_owned_mailbox"));
});

test("runSubmissionPreflight warns when smtp+imap mailbox is missing smtp settings", async () => {
  const result = await runSubmissionPreflight(
    {
      brand_profile_id: "brand_clusterseo",
      pack_id: "launch_starter",
      site_ids: ["saashub"]
    },
    {
      ownerUserId: "user_1",
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://www.clusterseo.com/",
          profile: {
            contact: {
              email: "team@clusterseo.com"
            },
            identity: {
              mode: "client_owned",
              mailbox: {
                email: "listings@clusterseo.com",
                auth_method: "smtp_imap_password",
                protocol: "smtp_imap",
                host: "imap.gmail.com",
                port: 993,
                inbox_ready: true
              }
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
            missing_items: [],
            site_manifests: [
              {
                site_id: "saashub",
                missing_items: []
              }
            ]
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            last_recon_at: new Date().toISOString(),
            profile: {
              fields: [{ label: "Product Name", name: "service[name]" }],
              gates: [],
              duplicate_check_flow: []
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "mailbox_smtp_not_ready"));
});

test("listSubmissionJobs applies owner and status filters", async () => {
  const capturedUrls = [];
  const result = await listSubmissionJobs(
    {
      owner_user_id: "user_alpha",
      status: "paused,failed",
      job_type: "directory_submit",
      created_after: "2026-03-01T00:00:00.000Z",
      limit: "25",
      offset: "10"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        capturedUrls.push(String(url));
        return {
          ok: true,
          status: 200,
          async json() {
            return [];
          }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.limit, 25);
  assert.equal(result.offset, 10);
  assert.equal(capturedUrls.length, 1);
  const decoded = decodeURIComponent(capturedUrls[0]);
  assert.match(decoded, /owner_user_id=eq\.user_alpha/);
  assert.match(decoded, /status=in\.\(paused,failed\)/);
  assert.match(decoded, /job_type=eq\.directory_submit/);
  assert.match(decoded, /created_at=gte\.2026-03-01T00%3A00%3A00.000Z|created_at=gte\.2026-03-01T00:00:00.000Z/);
});

test("claimSubmissionJobById claims a specific queued submission job", async () => {
  let patchBody = null;
  const queuedRow = {
    job_id: "submit_claim_1",
    job_type: "directory_submit",
    owner_user_id: "user_alpha",
    owner_email: "alpha@example.com",
    brand_key: "clusterseo",
    site_id: "saashub",
    target: "saashub",
    status: "queued",
    priority: 100,
    attempt_count: 0,
    max_attempts: 3,
    claimed_by: null,
    payload: {
      job_request: {
        job_id: "submit_claim_1",
        job_type: "directory_submit",
        brand_profile_id: "brand_clusterseo",
        site_id: "saashub"
      },
      status_url: "https://swarmtester.com/api/submissions/status?job_id=submit_claim_1",
      report_url: "https://swarmtester.com/api/submissions/report?job_id=submit_claim_1",
      run_log: [],
      artifacts: {},
      worker: {},
      webhook: null
    }
  };

  const claimed = await claimSubmissionJobById("submit_claim_1", {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (_url, init = {}) => {
      if (!init.method || init.method === "GET") {
        return {
          ok: true,
          status: 200,
          async json() {
            return [queuedRow];
          }
        };
      }

      patchBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              ...queuedRow,
              ...patchBody,
              payload: patchBody.payload
            }
          ];
        }
      };
    },
    workerId: "worker-specific"
  });

  assert.equal(claimed.ok, true);
  assert.equal(claimed.row.status, "processing");
  assert.equal(claimed.jobRequest.job_id, "submit_claim_1");
  assert.equal(patchBody.claimed_by, "worker-specific");
  assert.equal(patchBody.attempt_count, 1);
});

test("reclaimStaleSubmissionJobs requeues processing jobs with dead heartbeats", async () => {
  const fetchCalls = [];
  const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const processingRow = {
    job_id: "stale_recon_1",
    job_type: "directory_recon",
    owner_user_id: "user_alpha",
    owner_email: "alpha@example.com",
    brand_key: "lastb2b",
    site_id: "yelp",
    target: "yelp",
    status: "processing",
    priority: 100,
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "submission-worker-dead",
    payload: {
      job_request: {
        job_id: "stale_recon_1",
        job_type: "directory_recon",
        brand_profile_id: "brand_forney",
        site_id: "yelp",
        submit_url: "https://biz.yelp.com/claim"
      },
      status_url: "https://swarmtester.com/api/submissions/status?job_id=stale_recon_1",
      report_url: "https://swarmtester.com/api/submissions/report?job_id=stale_recon_1",
      run_log: [],
      artifacts: {},
      worker: {
        worker_id: "submission-worker-dead",
        claimed_at: staleHeartbeat,
        heartbeat_at: staleHeartbeat
      },
      webhook: null
    },
    progress: {
      phase: "processing",
      percent: 42,
      message: "Still working",
      updated_at: staleHeartbeat
    },
    updated_at: staleHeartbeat,
    started_at: staleHeartbeat
  };

  const result = await reclaimStaleSubmissionJobs(
    {
      workerId: "submission-worker-live",
      jobTypes: ["directory_recon"],
      staleAfterMs: 60 * 1000
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        fetchCalls.push({ url: String(url), method: init.method || "GET", body: init.body || null });
        if (!init.method || init.method === "GET") {
          return {
            ok: true,
            status: 200,
            async json() {
              return [processingRow];
            }
          };
        }

        const body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return [
              {
                ...processingRow,
                ...body,
                payload: body.payload,
                progress: body.progress
              }
            ];
          }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.reclaimed.length, 1);
  assert.equal(result.reclaimed[0].job_id, "stale_recon_1");

  const patchCall = fetchCalls.find((call) => call.method === "PATCH");
  assert.ok(patchCall);
  const patchBody = JSON.parse(patchCall.body);
  assert.equal(patchBody.status, "retryable");
  assert.equal(patchBody.claimed_by, null);
  assert.equal(patchBody.progress.phase, "retryable");
  assert.equal(patchBody.payload.worker.previous_worker_id, "submission-worker-dead");
  assert.equal(patchBody.payload.worker.stale_reclaimed_by, "submission-worker-live");
});

test("operator inbox keeps only human-action items by default", async () => {
  const listed = await listSubmissionOperatorInbox(
    {
      owner_user_id: "user_alpha"
    },
    {
      listJobs: async () => ({
        ok: true,
        status: 200,
        limit: 50,
        offset: 0,
        rows: [
          {
            job_id: "asset_1",
            job_type: "asset_prepare",
            owner_user_id: "user_alpha",
            status: "completed",
            payload: { artifacts: {} },
            result: {
              asset_manifest: {
                manifest_id: "manifest_1",
                status: "pending_approval"
              },
              summary: { note: "Waiting for approval." }
            }
          },
          {
            job_id: "submit_1",
            job_type: "directory_submit",
            owner_user_id: "user_alpha",
            status: "paused",
            payload: { artifacts: {} },
            result: {
              submission_status: "paused_for_duplicate_review",
              summary: { note: "Need duplicate review." }
            }
          },
          {
            job_id: "submit_2",
            job_type: "directory_submit",
            owner_user_id: "user_alpha",
            status: "completed",
            payload: { artifacts: {} },
            result: {
              submission_status: "submitted",
              summary: { note: "All done." }
            }
          }
        ]
      })
    }
  );

  assert.equal(listed.ok, true);
  assert.equal(listed.total, 2);
  assert.deepEqual(
    listed.items.map((item) => item.inbox_state),
    ["asset_approval", "duplicate_review"]
  );
  assert.equal(deriveSubmissionInboxState({ status: "failed", result: {} }).inbox_state, "failure_review");
});
