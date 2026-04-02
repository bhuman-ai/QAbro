const test = require("node:test");
const assert = require("node:assert/strict");

const reportHandler = require("../api/qa/report");

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("report handler normalizes sparse stored report payloads", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_sparse_1",
          run_id: "run_sparse_1",
          target: "atlas.example",
          status: "completed",
          source: "qa_bot",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_sparse_1",
          delivered_at: "2026-03-16T18:20:00.000Z",
          payload: {
            artifacts: {
              browserbase_debug_url: "https://browserbase.example/debug/run_sparse_1",
              browserbase_session_url: "https://browserbase.example/session/run_sparse_1"
            },
            run_request: {
              run_id: "run_sparse_1",
              target_url: "https://atlas.example/signup",
              scope_mode: "feature_targeted",
              brand_persona: "An exhausted founder",
              source: "qa_bot",
              metadata: {
                owner_user_id: "user_123",
                brand_id: "atlas-one",
                brand_name: "Atlas"
              }
            },
            report_json: {
              run_id: "run_sparse_1",
              target: "atlas.example",
              status: "completed",
              summary: {
                note: "Historical payload omitted several normalized fields."
              },
              findings: [
                {
                  id: "f_sparse_1",
                  type: "friction",
                  severity: "medium",
                  confidence: 0.62,
                  title: "Confusing CTA",
                  observed_behavior: "The primary CTA did not make the next step clear."
                }
              ],
              tested_journeys: [
                {
                  id: "journey_sparse_1",
                  name: "Signup",
                  status: "partial",
                  summary: "The flow was only partially captured."
                }
              ],
              recommendations: ["Clarify the CTA label and supporting copy."]
            }
          }
        }
      ];
    }
  });

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_sparse_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await reportHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.report.run_id, "run_sparse_1");
        assert.equal(
          res.body.report.findings[0].expected_behavior,
          "The user should be able to complete this step smoothly and understand the next action."
        );
        assert.equal(
          res.body.report.findings[0].evidence.screenshots[0],
          "https://browserbase.example/debug/run_sparse_1"
        );
        assert.equal(res.body.report.tested_journeys[0].id, "journey_sparse_1");
        assert.match(res.body.markdown, /### f_sparse_1: Confusing CTA/);
        assert.match(res.body.ui_report_url, /brand=atlas-one/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("report handler requires owner-authenticated access by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_public_1",
          run_id: "run_public_1",
          target: "clusterseo.com",
          status: "partial",
          source: "qa_bot",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_public_1",
          delivered_at: "2026-03-27T20:00:00.000Z",
          payload: {
            run_request: {
              run_id: "run_public_1",
              target_url: "https://clusterseo.com",
              metadata: {
                brand_id: "clusterseo.com",
                owner_user_id: "user_456"
              }
            },
            report_json: {
              run_id: "run_public_1",
              target: "clusterseo.com",
              status: "partial",
              summary: {
                note: "Public report row"
              },
              findings: []
            }
          }
        }
      ];
    }
  });

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_public_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_456"
          }
        };
        const res = createRes();

        await reportHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.run_id, "run_public_1");
        assert.equal(res.body.report.status, "partial");
        assert.match(res.body.ui_report_url, /run_id=run_public_1/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("report handler allows shared-link access by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_shared_1",
          run_id: "run_shared_1",
          target: "clusterseo.com",
          status: "partial",
          source: "qa_bot",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_shared_1",
          delivered_at: "2026-03-27T20:00:00.000Z",
          payload: {
            share: {
              enabled: true,
              token: "share_abc123"
            },
            run_request: {
              run_id: "run_shared_1",
              target_url: "https://clusterseo.com",
              metadata: {
                brand_id: "clusterseo.com",
                owner_user_id: "user_456"
              }
            },
            report_json: {
              run_id: "run_shared_1",
              target: "clusterseo.com",
              status: "partial",
              summary: {
                note: "Shared report row"
              },
              findings: []
            }
          }
        }
      ];
    }
  });

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_shared_1",
            share_key: "share_abc123"
          },
          headers: {
            host: "swarmtester.com"
          }
        };
        const res = createRes();

        await reportHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.run_id, "run_shared_1");
        assert.match(res.body.ui_report_url, /share_key=share_abc123/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("report handler redacts engineering triage for shared-link reads", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_repo_triage_1",
          run_id: "run_repo_triage_1",
          target: "acme.example",
          status: "completed",
          source: "qa_bot",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_repo_triage_1",
          delivered_at: "2026-04-01T11:00:00.000Z",
          payload: {
            share: {
              enabled: true,
              token: "share_repo_triage_abc"
            },
            run_request: {
              run_id: "run_repo_triage_1",
              target_url: "https://acme.example/signup",
              metadata: {
                brand_id: "acme",
                owner_user_id: "user_123",
                repo_triage: {
                  enabled: true,
                  repo: "acme/web"
                }
              }
            },
            repo_triage: {
              enabled: true,
              status: "completed",
              summary: "Matched the blocker to auth/signup.tsx."
            },
            report_json: {
              run_id: "run_repo_triage_1",
              target: "acme.example",
              status: "completed",
              summary: {
                note: "Blind report is ready."
              },
              findings: [],
              engineering_triage: {
                summary: "Matched the blocker to auth/signup.tsx.",
                per_finding: [
                  {
                    finding_id: "finding_bug_1",
                    suspected_files: ["apps/web/src/auth/signup.tsx:42"]
                  }
                ]
              }
            }
          }
        }
      ];
    }
  });

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const ownerReq = {
          method: "GET",
          query: {
            run_id: "run_repo_triage_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const ownerRes = createRes();
        await reportHandler(ownerReq, ownerRes);
        assert.equal(ownerRes.statusCode, 200);
        assert.equal(ownerRes.body.report.engineering_triage.summary, "Matched the blocker to auth/signup.tsx.");
        assert.equal(ownerRes.body.report.metadata.repo_triage.enabled, true);

        const sharedReq = {
          method: "GET",
          query: {
            run_id: "run_repo_triage_1",
            share_key: "share_repo_triage_abc"
          },
          headers: {
            host: "swarmtester.com"
          }
        };
        const sharedRes = createRes();
        await reportHandler(sharedReq, sharedRes);
        assert.equal(sharedRes.statusCode, 200);
        assert.equal(sharedRes.body.report.engineering_triage, undefined);
        assert.equal(sharedRes.body.report.metadata.repo_triage, undefined);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
