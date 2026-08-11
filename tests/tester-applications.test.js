const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  approveVerifiedInviteTester,
  getTesterApplication,
  isTesterOperatorEmail,
  listTesterApplications,
  markTesterApplicationQualifiedBySession,
  normalizeTesterApplicationPayload,
  normalizeTesterPublicName,
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
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"));

  assert.match(formatSource, /"\/testers\/apply"/);
  assert.match(formatSource, /"\/testers\/admin"/);
  assert.match(formatSource, /"\/testers\/jobs"/);
  assert.match(appSource, /pathname === "\/testers\/apply"/);
  assert.match(appSource, /pathname === "\/testers\/admin"/);
  assert.match(appSource, /pathname === "\/testers\/jobs"/);
  assert.ok(
    vercelConfig.rewrites.some(
      (rewrite) => rewrite.source === "/testers/jobs" && rewrite.destination === "/index.html"
    )
  );
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
    public_name: " Maya ",
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
    metadata: { public_name: "Maya" },
    country: "Canada",
    experience_level: "some",
    devices: ["ios", "computer"],
    availability: "flexible",
    can_record: true,
    source: "homepage_hero"
  });
});

test("tester public name is explicit, first-name-only, and safe to show customers", () => {
  assert.equal(normalizeTesterPublicName(" Haley "), "Haley");
  assert.equal(normalizeTesterPublicName("Mary-Jane"), "Mary-Jane");
  assert.equal(normalizeTesterPublicName("O’Connor"), "O’Connor");
  assert.equal(normalizeTesterPublicName("Haley Birch"), null);
  assert.equal(normalizeTesterPublicName("<script>"), null);

  const legacy = normalizeTesterApplicationPayload({
    owner_user_id: "user-123",
    owner_email: "tester@example.com",
    name: "Maya Tester",
    country: "Canada",
    experience_level: "new",
    devices: ["computer"],
    availability: "weekdays",
    can_record: true,
    metadata: { public_name: "Injected" }
  });

  assert.equal(legacy.ok, true);
  assert.equal(legacy.payload.metadata, undefined);

  const invalidExplicitName = normalizeTesterApplicationPayload({
    ...legacy.payload,
    public_name: "Maya Tester"
  });
  assert.equal(invalidExplicitName.ok, false);
  assert.equal(invalidExplicitName.error, "Enter a first name using letters only");
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
            metadata: { public_name: " Maya " },
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
  assert.equal(result.application.public_name, "Maya");
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.pathname, "/rest/v1/swarmtest_tester_applications");
  assert.equal(requestUrl.searchParams.get("owner_user_id"), "eq.user-123");
  assert.equal(requestUrl.searchParams.get("limit"), "1");
  assert.match(requestUrl.searchParams.get("select"), /(?:^|,)metadata(?:,|$)/);
});

test("tester application lookup falls back to a verified invite email", async () => {
  const calls = [];
  const result = await getTesterApplication(
    { owner_user_id: "new-user-123", owner_email: "haley@example.com" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) return jsonResponse([]);
        return jsonResponse([
          {
            id: "application-haley",
            owner_email: "haley@example.com",
            name: "Haley Birch",
            country: "Not provided",
            experience_level: "some",
            devices: ["computer"],
            availability: "flexible",
            can_record: true,
            status: "approved",
            source: "verified_direct_invite"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.matched_by_email, true);
  assert.equal(result.application.status, "approved");
  assert.equal(new URL(calls[1]).searchParams.get("owner_email"), "eq.haley@example.com");
});

test("operator-verified direct invites become approved tester profiles idempotently", async () => {
  const calls = [];
  const result = await approveVerifiedInviteTester(
    {
      name: "Haley Birch",
      email: "haley@example.com",
      public_name: "Haley",
      qualification_session_id: "ciaro-session"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (init.method !== "POST") return jsonResponse([]);
        return jsonResponse([{ id: "application-haley", ...JSON.parse(init.body) }], 201);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.application.status, "approved");
  const inserted = JSON.parse(calls.find((call) => call.init.method === "POST").init.body);
  assert.equal(inserted.owner_email, "haley@example.com");
  assert.match(inserted.owner_user_id, /^verified-invite:/);
  assert.deepEqual(inserted.devices, ["computer"]);
  assert.equal(inserted.metadata.public_name, "Haley");
  assert.equal(inserted.metadata.profile_incomplete, true);
});

test("verified invite retention never reverses a declined tester", async () => {
  let wrote = false;
  const result = await approveVerifiedInviteTester(
    {
      name: "Internal Tester",
      email: "internal@example.com",
      qualification_session_id: "smoke-session"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init = {}) => {
        if (init.method) wrote = true;
        return jsonResponse([
          {
            id: "application-internal",
            owner_email: "internal@example.com",
            name: "Internal Tester",
            country: "US",
            experience_level: "some",
            devices: ["computer"],
            availability: "flexible",
            can_record: true,
            status: "declined",
            source: "production_e2e_smoke"
          }
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "declined_tester");
  assert.equal(wrote, false);
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
  assert.equal(result.items[0].public_name, null);
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
      public_name: "Maya",
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
            metadata: { public_name: "Maya" },
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
  assert.equal(result.application.public_name, "Maya");
  assert.equal(new URL(capturedUrl).searchParams.get("on_conflict"), "owner_user_id");
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Prefer, "resolution=merge-duplicates,return=representation");
  const payload = JSON.parse(capturedInit.body);
  assert.equal(payload.owner_user_id, "user-123");
  assert.deepEqual(payload.metadata, { public_name: "Maya" });
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
      name: "Maya",
      public_name: "Maya"
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(capturedInput.owner_user_id, "real-user");
  assert.equal(capturedInput.owner_email, "real@example.com");
  assert.equal(capturedInput.name, "Maya");
  assert.equal(capturedInput.public_name, "Maya");
});
