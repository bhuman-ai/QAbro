const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMcpTokenPrefix,
  createMcpToken,
  generateMcpToken,
  hashMcpToken,
  isMcpBearerToken,
  verifyMcpToken
} = require("../lib/qa-mcp-tokens");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test("MCP tokens use a recognizable prefix and hash with pepper", () => {
  const token = generateMcpToken({
    publicPart: "public123",
    secretPart: "secret456"
  });

  assert.equal(token, "mcp_public123_secret456");
  assert.equal(isMcpBearerToken(token), true);
  assert.equal(buildMcpTokenPrefix(token), "mcp_public123");
  assert.notEqual(hashMcpToken(token, { pepper: "one" }), hashMcpToken(token, { pepper: "two" }));
});

test("createMcpToken stores only hash and returns plaintext once", async () => {
  const token = "mcp_public123_secret456";
  let storedBody = null;
  const result = await createMcpToken(
    {
      owner_user_id: "user_123",
      owner_email: "owner@example.com",
      name: "Codex"
    },
    {
      supabaseUrl: "https://db.example.com",
      serviceKey: "service_key",
      pepper: "test_pepper",
      publicPart: "public123",
      secretPart: "secret456",
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://db.example.com/rest/v1/swarmtest_mcp_tokens");
        assert.equal(init.method, "POST");
        storedBody = JSON.parse(init.body);
        return jsonResponse([
          {
            id: "token_123",
            ...storedBody,
            created_at: "2026-06-30T00:00:00.000Z"
          }
        ], 201);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.token, token);
  assert.equal(result.item.token_prefix, "mcp_public123");
  assert.equal(storedBody.token_hash, hashMcpToken(token, { pepper: "test_pepper" }));
  assert.equal(storedBody.token_hash.includes("secret456"), false);
  assert.equal(storedBody.token_prefix.includes("secret456"), false);
});

test("verifyMcpToken resolves owner and updates last_used_at", async () => {
  const token = "mcp_public123_secret456";
  const seen = [];
  const result = await verifyMcpToken(token, {
    supabaseUrl: "https://db.example.com",
    serviceKey: "service_key",
    pepper: "test_pepper",
    waitForUsageUpdate: true,
    fetchImpl: async (url, init = {}) => {
      seen.push({ url, method: init.method || "GET" });
      const parsed = new URL(url);
      if ((init.method || "GET") === "PATCH") {
        assert.equal(parsed.searchParams.get("id"), "eq.token_123");
        return jsonResponse([], 200);
      }
      assert.equal(parsed.pathname, "/rest/v1/swarmtest_mcp_tokens");
      assert.equal(parsed.searchParams.get("token_hash"), `eq.${hashMcpToken(token, { pepper: "test_pepper" })}`);
      assert.equal(parsed.searchParams.get("revoked_at"), "is.null");
      return jsonResponse([
        {
          id: "token_123",
          owner_user_id: "user_123",
          owner_email: "owner@example.com",
          name: "Codex",
          token_prefix: "mcp_public123",
          created_at: "2026-06-30T00:00:00.000Z",
          metadata: {}
        }
      ]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.is_mcp_token, true);
  assert.equal(result.user.id, "user_123");
  assert.equal(result.user.email, "owner@example.com");
  assert.deepEqual(seen.map((item) => item.method), ["GET", "PATCH"]);
});

test("verifyMcpToken rejects revoked or unknown tokens", async () => {
  const result = await verifyMcpToken("mcp_public123_secret456", {
    supabaseUrl: "https://db.example.com",
    serviceKey: "service_key",
    updateUsage: false,
    fetchImpl: async () => jsonResponse([])
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error, "Invalid MCP token");
});
