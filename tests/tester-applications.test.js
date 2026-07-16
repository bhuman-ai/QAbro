const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getTesterApplication,
  isTesterOperatorEmail,
  listTesterApplications,
  markTesterApplicationQualifiedBySession,
  normalizeTesterApplicationPayload,
  updateTesterApplication,
  upsertTesterApplication
} = require("../lib/tester-applications");

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    }
  };
}

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

test("tester application direct URL is preserved by the SPA router", () => {
  const formatSource = fs.readFileSync(path.resolve(__dirname, "../src/lib/format.ts"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../src/App.tsx"), "utf8");

  assert.match(formatSource, /"\/testers\/apply"/);
  assert.match(formatSource, /"\/testers\/admin"/);
  assert.match(appSource, /pathname === "\/testers\/apply"/);
  assert.match(appSource, /pathname === "\/testers\/admin"/);
});

test("tester operator access uses an explicit email allowlist", () => {
  assert.equal(isTesterOperatorEmail("Don@BHuman.ai", { operatorEmails: "don@bhuman.ai, qa@example.com" }), true);
  assert.equal(isTesterOperatorEmail("other@example.com", { operatorEmails: ["don@bhuman.ai"] }), false);
  assert.equal(isTesterOperatorEmail("don@bhuman.ai", { operatorEmails: "" }), false);
});

test("tester application payload keeps only supported choices", () => {
  const result = normalizeTesterApplicationPayload({
    owner_user_id: " user-123 ",
    owner_email: " Tester@Example.com ",
    name: "  Maya Tester  ",
    country: " Canada ",
    experience_level: "SOME",
    devices: ["ios", "computer", "ios", "browser-extension"],
    availability: "flexible",
    can_record: true,
    source: "Homepage Hero!!"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    owner_user_id: "user-123",
    owner_email: "tester@example.com",
    name: "Maya Tester",
    country: "Canada",
    experience_level: "some",
    devices: ["ios", "computer"],
    availability: "flexible",
    can_record: true,
    source: "homepage_hero"
  });
});

test("tester application requires a device and recording consent", () => {
  const base = {
    owner_user_id: "user-123",
    owner_email: "tester@example.com",
    name: "Maya Tester",
    country: "Canada",
    experience_level: "new",
    availability: "weekdays"
  };

  const missingDevice = normalizeTesterApplicationPayload({ ...base, can_record: true });
  assert.equal(missingDevice.ok, false);
  assert.equal(missingDevice.error, "Choose at least one device");

  const missingConsent = normalizeTesterApplicationPayload({ ...base, devices: ["computer"] });
  assert.equal(missingConsent.ok, false);
  assert.equal(missingConsent.error, "Confirm that you can record your screen and speak in English");
});

test("tester application lookup is scoped to the signed-in user", async () => {
  let capturedUrl = "";
  const result = await getTesterApplication(
    { owner_user_id: "user-123" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return jsonResponse([
          {
            id: "application-1",
            name: "Maya Tester",
            country: "Canada",
            experience_level: "some",
            devices: ["computer", "ios"],
            availability: "flexible",
            can_record: true,
            status: "applied",
            created_at: "2026-07-14T12:00:00.000Z",
            updated_at: "2026-07-14T12:00:00.000Z"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.application.id, "application-1");
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.pathname, "/rest/v1/swarmtest_tester_applications");
  assert.equal(requestUrl.searchParams.get("owner_user_id"), "eq.user-123");
  assert.equal(requestUrl.searchParams.get("limit"), "1");
});

test("tester operator list returns newest applications first", async () => {
  let capturedUrl = "";
  const result = await listTesterApplications(
    { status: "applied", limit: 500 },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return jsonResponse([
          {
            id: "application-1",
            owner_email: "tester@example.com",
            name: "Maya Tester",
            country: "Canada",
            experience_level: "some",
            devices: ["computer"],
            availability: "flexible",
            can_record: true,
            status: "applied",
            source: "freelancer_outreach"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.items[0].owner_email, "tester@example.com");
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.searchParams.get("order"), "created_at.desc");
  assert.equal(requestUrl.searchParams.get("status"), "eq.applied");
  assert.equal(requestUrl.searchParams.get("limit"), "200");
});

test("tester operator links an application to one qualification session", async () => {
  let capturedInit = null;
  const result = await updateTesterApplication(
    {
      id: "application-1",
      status: "invited",
      qualification_session_id: "trial-1"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init) => {
        capturedInit = init;
        return jsonResponse([
          {
            id: "application-1",
            owner_email: "tester@example.com",
            name: "Maya Tester",
            country: "Canada",
            experience_level: "some",
            devices: ["computer"],
            availability: "flexible",
            can_record: true,
            status: "invited",
            qualification_session_id: "trial-1"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(capturedInit.method, "PATCH");
  assert.deepEqual(JSON.parse(capturedInit.body), {
    status: "invited",
    qualification_session_id: "trial-1"
  });

  const missingSession = await updateTesterApplication(
    { id: "application-1", status: "invited" },
    { supabaseUrl: "https://supabase.example", serviceKey: "service-key", fetchImpl: async () => jsonResponse([]) }
  );
  assert.equal(missingSession.ok, false);
  assert.match(missingSession.error, /Qualification session id/);
});

test("scoring advances only the application linked to that qualification", async () => {
  let capturedUrl = "";
  let capturedInit = null;
  const result = await markTesterApplicationQualifiedBySession("trial-1", {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return jsonResponse([]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.application, null);
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.searchParams.get("qualification_session_id"), "eq.trial-1");
  assert.equal(requestUrl.searchParams.get("status"), "eq.invited");
  assert.deepEqual(JSON.parse(capturedInit.body), { status: "qualified" });
});

test("tester admin endpoint rejects signed-in users outside the operator allowlist", async (t) => {
  const auth = require("../lib/auth");
  const applications = require("../lib/tester-applications");

  t.mock.method(auth, "requireDashboardOrServiceAuth", async () => ({
    ok: true,
    is_service_token: false,
    user: { id: "user-1", email: "other@example.com" }
  }));
  t.mock.method(applications, "isTesterOperatorEmail", () => false);

  const handlerPath = require.resolve("../api/tester-applications");
  delete require.cache[handlerPath];
  const handler = require(handlerPath);
  const req = { method: "GET", query: { scope: "admin" }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Tester operator access required");
});

test("tester application upsert preserves server-managed status", async () => {
  let capturedUrl = "";
  let capturedInit = null;
  const result = await upsertTesterApplication(
    {
      owner_user_id: "user-123",
      owner_email: "tester@example.com",
      name: "Maya Tester",
      country: "Canada",
      experience_level: "professional",
      devices: ["computer"],
      availability: "weekdays",
      can_record: true,
      source: "outreach"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse([
          {
            id: "application-1",
            name: "Maya Tester",
            country: "Canada",
            experience_level: "professional",
            devices: ["computer"],
            availability: "weekdays",
            can_record: true,
            status: "qualified"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.application.status, "qualified");
  assert.equal(new URL(capturedUrl).searchParams.get("on_conflict"), "owner_user_id");
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Prefer, "resolution=merge-duplicates,return=representation");
  const payload = JSON.parse(capturedInit.body);
  assert.equal(payload.owner_user_id, "user-123");
  assert.equal(payload.status, undefined);
  assert.equal(payload.qualification_session_id, undefined);
});

test("tester application endpoint ignores owner fields from the browser", async (t) => {
  const auth = require("../lib/auth");
  const applications = require("../lib/tester-applications");
  let capturedInput = null;

  t.mock.method(auth, "requireDashboardAuth", async () => ({
    ok: true,
    user: { id: "real-user", email: "real@example.com" }
  }));
  t.mock.method(applications, "upsertTesterApplication", async (input) => {
    capturedInput = input;
    return {
      ok: true,
      status: 201,
      application: { id: "application-1", status: "applied" }
    };
  });

  const handlerPath = require.resolve("../api/tester-applications");
  delete require.cache[handlerPath];
  const handler = require(handlerPath);
  const req = {
    method: "POST",
    body: {
      owner_user_id: "attacker-user",
      owner_email: "attacker@example.com",
      name: "Maya Tester"
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(capturedInput.owner_user_id, "real-user");
  assert.equal(capturedInput.owner_email, "real@example.com");
  assert.equal(capturedInput.name, "Maya Tester");
});
