const test = require("node:test");
const assert = require("node:assert/strict");

const {
  claimNextQaRun,
  enqueueQaRun,
  getQaRunStatus
} = require("../lib/qa-queue");

test("enqueueQaRun stores a queued job row", async () => {
  let requestBody = null;

  const result = await enqueueQaRun(
    {
      run_id: "queue_1",
      target_url: "https://example.com",
      scope_mode: "core_20m",
      scenario_list: [],
      brand_persona: "Test persona",
      credentials: null,
      source: "qa_bot",
      metadata: {}
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      publicBaseUrl: "https://swarmtester.com",
      reportUrl: "https://swarmtester.com/api/qa/report?run_id=queue_1",
      statusUrl: "https://swarmtester.com/api/qa/status?run_id=queue_1",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          async json() {
            return requestBody;
          }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.queue.queue_status, "queued");
  assert.equal(requestBody[0].status, "queued_vision");
  assert.equal(requestBody[0].payload.queue.status, "queued_vision");
  assert.equal(requestBody[0].payload.status_url, "https://swarmtester.com/api/qa/status?run_id=queue_1");
});

test("claimNextQaRun claims the oldest fresh queued row", async () => {
  let callIndex = 0;
  const queuedRow = {
    run_id: "queue_2",
    target: "example.com",
    status: "queued_vision",
    report_url: "https://swarmtester.com/api/qa/report?run_id=queue_2",
    findings: [],
    payload: {
      run_request: {
        run_id: "queue_2",
        target_url: "https://example.com",
        scope_mode: "core_20m",
        scenario_list: [],
        brand_persona: "Test persona",
        credentials: null,
        source: "qa_bot",
        metadata: {}
      },
      status_url: "https://swarmtester.com/api/qa/status?run_id=queue_2",
      queue: {
        status: "queued_vision",
        enqueued_at: "2026-03-04T00:00:00.000Z",
        attempt_count: 0,
        max_attempts: 3
      }
    }
  };

  const result = await claimNextQaRun({
    workerId: "worker-test",
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (_url, init = {}) => {
      callIndex += 1;
      if (!init.method || init.method === "GET") {
        return {
          ok: true,
          status: 200,
          async json() {
            return [queuedRow];
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
              ...queuedRow,
              ...body,
              payload: body.payload
            }
          ];
        }
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.runRequest.run_id, "queue_2");
  assert.equal(result.row.status, "processing");
  assert.equal(result.queue.queue_status, "processing");
  assert.equal(callIndex, 2);
});

test("getQaRunStatus treats terminal rows without payload.queue as report-ready", async () => {
  const row = {
    run_id: "run_terminal_no_queue",
    target: "example.com",
    owner_user_id: "user_owner",
    status: "partial",
    delivered_at: "2026-03-24T16:41:53.966Z",
    payload: {
      report_json: {
        status: "partial",
        findings: [{ id: "f1" }]
      }
    }
  };

  const result = await getQaRunStatus("run_terminal_no_queue", {
    owner_user_id: "user_owner",
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return [row];
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.queue.status, "partial");
  assert.equal(result.queue.queue_status, "partial");
});
