const test = require("node:test");
const assert = require("node:assert/strict");

const statusHandler = require("../api/qa/status");

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

test("status handler requires owner-authenticated read by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_status_public_1",
          run_id: "run_status_public_1",
          target: "clusterseo.com",
          brand_key: "clusterseo.com",
          status: "partial",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_status_public_1",
          delivered_at: "2026-03-27T20:00:00.000Z",
          payload: {
            run_request: {
              metadata: {
                owner_user_id: "user_999"
              }
            },
            report_json: {
              status: "partial",
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
            run_id: "run_status_public_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_999"
          }
        };
        const res = createRes();

        await statusHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.run_id, "run_status_public_1");
        assert.equal(res.body.report_status, "partial");
        assert.match(res.body.ui_report_url, /run_id=run_status_public_1/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("status handler allows shared-link read by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_status_shared_1",
          run_id: "run_status_shared_1",
          target: "clusterseo.com",
          brand_key: "clusterseo.com",
          status: "partial",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_status_shared_1",
          delivered_at: "2026-03-27T20:00:00.000Z",
          payload: {
            share: {
              enabled: true,
              token: "share_status_123"
            },
            report_json: {
              status: "partial",
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
            run_id: "run_status_shared_1",
            share_key: "share_status_123"
          },
          headers: {
            host: "swarmtester.com"
          }
        };
        const res = createRes();

        await statusHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.run_id, "run_status_shared_1");
        assert.match(res.body.ui_report_url, /share_key=share_status_123/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("status handler only returns repo triage details to the owner view", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_status_repo_triage_1",
          run_id: "run_status_repo_triage_1",
          target: "acme.example",
          brand_key: "acme",
          status: "completed",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_status_repo_triage_1",
          delivered_at: "2026-04-01T10:00:00.000Z",
          payload: {
            share: {
              enabled: true,
              token: "share_repo_triage_123"
            },
            run_request: {
              metadata: {
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
              status: "completed",
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
        const ownerReq = {
          method: "GET",
          query: {
            run_id: "run_status_repo_triage_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const ownerRes = createRes();
        await statusHandler(ownerReq, ownerRes);
        assert.equal(ownerRes.statusCode, 200);
        assert.equal(ownerRes.body.repo_triage.status, "completed");

        const sharedReq = {
          method: "GET",
          query: {
            run_id: "run_status_repo_triage_1",
            share_key: "share_repo_triage_123"
          },
          headers: {
            host: "swarmtester.com"
          }
        };
        const sharedRes = createRes();
        await statusHandler(sharedReq, sharedRes);
        assert.equal(sharedRes.statusCode, 200);
        assert.equal(sharedRes.body.repo_triage, null);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("status handler exposes replay timing and viewport metadata from artifacts", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: "row_status_artifacts_1",
          run_id: "run_status_artifacts_1",
          target: "clusterseo.com",
          brand_key: "clusterseo.com",
          status: "completed",
          report_url: "https://swarmtester.com/api/qa/report?run_id=run_status_artifacts_1",
          delivered_at: "2026-04-07T15:20:00.000Z",
          payload: {
            run_request: {
              metadata: {
                owner_user_id: "user_123"
              }
            },
            report_json: {
              status: "completed",
              findings: []
            },
            artifacts: {
              started_at: "2026-04-07T15:18:00.000Z",
              finished_at: "2026-04-07T15:19:30.000Z",
              viewport_width: 1440,
              viewport_height: 900
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
            run_id: "run_status_artifacts_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await statusHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.artifacts.started_at, "2026-04-07T15:18:00.000Z");
        assert.equal(res.body.artifacts.finished_at, "2026-04-07T15:19:30.000Z");
        assert.equal(res.body.artifacts.viewport_width, 1440);
        assert.equal(res.body.artifacts.viewport_height, 900);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
