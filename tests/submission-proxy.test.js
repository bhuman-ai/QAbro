const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProxyRotationConfig,
  extractProxyTargetFromBrand,
  resolveSubmissionProxySelection,
  selectBestManagedProxy,
  shouldRotateProxyForExecution
} = require("../lib/submission-proxy");
const { runSubmissionPreflight } = require("../lib/submission-preflight");
const { __private } = require("../lib/submission-runner");

test("extractProxyTargetFromBrand normalizes physical-business geography", () => {
  const target = extractProxyTargetFromBrand({
    track: "physical_local",
    profile: {
      location: {
        city: "Forney",
        state: "Texas",
        country: "United States",
        postal_code: "75126"
      }
    }
  });

  assert.equal(target.country_code, "US");
  assert.equal(target.state_code, "TX");
  assert.equal(target.city, "Forney");
  assert.equal(target.locality_required, true);
});

test("selectBestManagedProxy prefers same-country and same-region candidates", () => {
  const selection = selectBestManagedProxy(
    [
      {
        host: "10.0.0.1",
        port: 8001,
        country_code: "SE",
        city_name: "Stockholm",
        region_code: null
      },
      {
        host: "10.0.0.2",
        port: 8002,
        country_code: "US",
        city_name: "Dallas",
        region_code: "TX"
      },
      {
        host: "10.0.0.3",
        port: 8003,
        country_code: "US",
        city_name: "New York",
        region_code: "NY"
      }
    ],
    {
      country_code: "US",
      state_code: "TX",
      city: "Forney"
    }
  );

  assert.equal(selection.ok, true);
  assert.equal(selection.candidate.host, "10.0.0.2");
  assert.equal(selection.matched, true);
  assert.equal(selection.matchQuality, "country_region");
});

test("resolveSubmissionProxySelection falls back with mismatch warning when only distant proxies exist", async () => {
  const result = await resolveSubmissionProxySelection(
    {
      metadata: {
        submission_proxy_auto_select: true,
        webshare_api_key: "webshare-secret"
      }
    },
    {
      track: "physical_local",
      profile: {
        location: {
          city: "Forney",
          state: "TX",
          country: "US"
        }
      }
    },
    {
      server: "http://fallback.example:8080",
      bypass: "localhost"
    },
    {
      listManagedProxies: async () => ({
        ok: true,
        rows: [
          {
            host: "10.0.0.10",
            port: 8010,
            username: "user",
            password: "pass",
            country_code: "SE",
            city_name: "Stockholm",
            region_code: null
          }
        ]
      })
    }
  );

  assert.equal(result.proxy.server, "http://10.0.0.10:8010");
  assert.equal(result.proxy.bypass, "localhost");
  assert.equal(result.selection.status, "mismatch");
  assert.equal(result.selection.matched, false);
  assert.match(result.selection.note, /falling back/i);
});

test("resolveSubmissionProxySelection uses proxy attempt index to advance through candidates", async () => {
  const result = await resolveSubmissionProxySelection(
    {
      metadata: {
        submission_proxy_auto_select: true,
        submission_proxy_attempt_index: 1,
        webshare_api_key: "webshare-secret"
      }
    },
    {
      track: "physical_local",
      profile: {
        location: {
          city: "Forney",
          state: "TX",
          country: "US"
        }
      }
    },
    null,
    {
      listManagedProxies: async () => ({
        ok: true,
        rows: [
          {
            host: "10.0.0.2",
            port: 8002,
            username: "best",
            password: "pass",
            country_code: "US",
            city_name: "Dallas",
            region_code: "TX"
          },
          {
            host: "10.0.0.3",
            port: 8003,
            username: "second",
            password: "pass",
            country_code: "US",
            city_name: "Austin",
            region_code: "TX"
          }
        ]
      })
    }
  );

  assert.equal(result.selection.attempt_index, 1);
  assert.equal(result.selection.available_candidate_count, 2);
  assert.equal(result.selection.has_more_candidates, false);
  assert.equal(result.proxy.server, "http://10.0.0.3:8003");
});

test("buildProxyRotationConfig and shouldRotateProxyForExecution rotate on retryable captcha outcomes", () => {
  const rotation = buildProxyRotationConfig({
    metadata: {
      submission_proxy_rotation_enabled: true,
      submission_proxy_max_attempts: 3
    }
  });

  assert.equal(rotation.enabled, true);
  assert.equal(rotation.maxAttempts, 3);

  const decision = shouldRotateProxyForExecution(
    {
      ok: true,
      result: {
        submission_status: "paused_for_captcha",
        summary: {
          note: "Captcha remained active after solve attempt."
        }
      }
    },
    {
      attempt_index: 0,
      available_candidate_count: 3,
      has_more_candidates: true
    },
    {
      metadata: {
        submission_proxy_rotation_enabled: true,
        submission_proxy_max_attempts: 3
      }
    }
  );

  assert.equal(decision.shouldRotate, true);
  assert.equal(decision.reason, "captcha");
  assert.equal(decision.nextAttemptIndex, 1);
});

test("resolveSelfHostedRuntimeConfig upgrades the runtime proxy from managed inventory", async () => {
  const runtime = await __private.resolveSelfHostedRuntimeConfig(
    {
      job_id: "submit_1",
      site_id: "bbb",
      metadata: {
        submission_proxy_auto_select: true,
        webshare_api_key: "webshare-secret",
        self_hosted_proxy_server: "http://fallback.example:8080",
        self_hosted_proxy_bypass: "localhost"
      }
    },
    {
      track: "physical_local",
      profile: {
        location: {
          city: "Forney",
          state: "TX",
          country: "US"
        }
      }
    },
    {
      listManagedProxies: async () => ({
        ok: true,
        rows: [
          {
            host: "10.0.0.2",
            port: 8002,
            username: "user",
            password: "pass",
            country_code: "US",
            city_name: "Dallas",
            region_code: "TX"
          }
        ]
      })
    }
  );

  assert.equal(runtime.proxy.server, "http://10.0.0.2:8002");
  assert.equal(runtime.proxy.bypass, "localhost");
  assert.equal(runtime.proxySelection.status, "matched");
  assert.equal(runtime.proxySelection.selected.country_code, "US");
});

test("runSubmissionPreflight surfaces proxy geography mismatch warnings", async () => {
  const result = await runSubmissionPreflight(
    {
      brand_profile_id: "brand_forney",
      pack_id: "physical_local",
      site_ids: ["google_business_profile"]
    },
    {
      ownerUserId: "user_1",
      resolveProxySelection: async () => ({
        selection: {
          provider: "webshare",
          status: "mismatch",
          matched: false,
          match_quality: "country_mismatch_fallback",
          target: {
            country_code: "US",
            state_code: "TX",
            city: "Forney"
          },
          selected: {
            country_code: "SE",
            city_name: "Stockholm"
          },
          note: "No nearby proxy matched Forney, TX, US; falling back to Stockholm, SE.",
          warnings: ["No nearby proxy matched the business geography; using the closest available fallback."]
        }
      }),
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
              state: "TX",
              country: "US"
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
                site_id: "google_business_profile",
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
            site_id: "google_business_profile",
            site_name: "Google Business Profile",
            submission_policy: "assist",
            last_recon_at: new Date().toISOString(),
            profile: {
              fields: [{ label: "Business name", name: "business_name" }],
              gates: [],
              duplicate_check_flow: []
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.proxy.status, "mismatch");
  assert.ok(result.items[0].reasons.some((reason) => reason.code === "proxy_geo_mismatch"));
});
