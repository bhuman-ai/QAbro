const test = require("node:test");
const assert = require("node:assert/strict");

const workersHandler = require("../api/qa/workers");
const { listQaWorkers, upsertQaWorkerHeartbeat } = require("../lib/qa-workers");

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

test("listQaWorkers summarizes healthy, stale, and offline workers", async () => {
  const result = await listQaWorkers({
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    staleAfterMs: 30000,
    offlineAfterMs: 120000,
    nowMs: Date.parse("2026-03-21T10:00:20.000Z"),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return [
          {
            worker_id: "worker_a",
            status: "processing",
            current_run_id: "run_1",
            current_phase: "processing",
            last_seen_at: "2026-03-21T10:00:08.000Z",
            last_job_claimed_at: "2026-03-21T10:00:05.000Z",
            metadata: { hostname: "qa-a", pid: 101 }
          },
          {
            worker_id: "worker_b",
            status: "sleeping",
            current_phase: "waiting_for_jobs",
            last_seen_at: "2026-03-21T09:59:15.000Z",
            metadata: { hostname: "qa-b", pid: 102 }
          },
          {
            worker_id: "worker_c",
            status: "stopped",
            current_phase: "stopped",
            last_seen_at: "2026-03-21T09:56:00.000Z",
            metadata: { hostname: "qa-c", pid: 103 }
          }
        ];
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.healthy, 1);
  assert.equal(result.summary.stale, 1);
  assert.equal(result.summary.offline, 1);
  assert.equal(result.summary.active, 1);
  assert.equal(result.summary.overall_status, "healthy");
  assert.equal(result.summary.label, "1 worker active");
  assert.equal(result.items[0].worker_id, "worker_a");
  assert.equal(result.items[0].heartbeat_status, "healthy");
  assert.equal(result.items[1].heartbeat_status, "stale");
  assert.equal(result.items[2].heartbeat_status, "offline");
});

test("upsertQaWorkerHeartbeat posts a merged worker row", async () => {
  const captured = {
    url: "",
    method: "",
    body: null
  };

  const result = await upsertQaWorkerHeartbeat(
    {
      worker_id: "worker_1",
      status: "processing",
      current_run_id: "run_123",
      current_phase: "processing",
      last_seen_at: "2026-03-21T10:00:00.000Z",
      last_job_claimed_at: "2026-03-21T09:59:59.000Z",
      metadata: {
        hostname: "qa-a",
        pid: 777,
        ignored: { nested: true }
      }
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        captured.url = String(url);
        captured.method = String(init.method || "GET");
        captured.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return captured.body;
          }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(captured.method, "POST");
  assert.match(captured.url, /swarmtest_workers\?on_conflict=worker_id/);
  assert.equal(Array.isArray(captured.body), true);
  assert.equal(captured.body[0].worker_id, "worker_1");
  assert.equal(captured.body[0].status, "processing");
  assert.equal(captured.body[0].metadata.hostname, "qa-a");
  assert.equal(captured.body[0].metadata.pid, 777);
  assert.equal(captured.body[0].metadata.ignored, undefined);
});

test("workers handler returns worker health for service-token auth", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (!requestUrl.includes("/rest/v1/swarmtest_workers")) {
      throw new Error(`Unexpected fetch: ${requestUrl}`);
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            worker_id: "worker_1",
            status: "sleeping",
            current_phase: "waiting_for_jobs",
            last_seen_at: "2026-03-21T10:00:00.000Z",
            metadata: { hostname: "qa-a" }
          }
        ];
      }
    };
  };

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
          headers: {
            "x-qa-service-token": "service-token"
          }
        };
        const res = createRes();

        await workersHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.summary.total, 1);
        assert.equal(res.body.items[0].worker_id, "worker_1");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
