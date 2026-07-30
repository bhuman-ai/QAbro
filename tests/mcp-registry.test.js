const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, "server.json"), "utf8"));

test("MCP Registry metadata names the public product and hosted transport", () => {
  assert.equal(metadata.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  assert.equal(metadata.name, "io.github.bhuman-ai/beforeusersdo");
  assert.equal(metadata.title, "Before Users Do");
  assert.match(metadata.description, /QA/i);
  assert.ok(metadata.description.length <= 100);
  assert.equal(metadata.repository.url, "https://github.com/bhuman-ai/QAbro");
  assert.deepEqual(
    metadata.remotes.map(({ type, url }) => ({ type, url })),
    [{ type: "streamable-http", url: "https://mcp.beforeusersdo.com/mcp" }]
  );
});

test("MCP Registry discovery hands users to an attributed install path", () => {
  const websiteUrl = new URL(metadata.websiteUrl);
  assert.equal(websiteUrl.origin, "https://beforeusersdo.com");
  assert.equal(websiteUrl.pathname, "/docs");
  assert.equal(websiteUrl.searchParams.get("utm_source"), "mcp_registry");
  assert.equal(websiteUrl.searchParams.get("utm_medium"), "marketplace");
  assert.equal(websiteUrl.searchParams.get("utm_campaign"), "official_registry");
  assert.equal(websiteUrl.hash, "#start");

  const authHeader = metadata.remotes[0].headers.find(({ name }) => name === "Authorization");
  assert.equal(authHeader.value, "Bearer {mcp_token}");
  assert.equal(authHeader.variables.mcp_token.isRequired, true);
  assert.equal(authHeader.variables.mcp_token.isSecret, true);
  assert.match(authHeader.variables.mcp_token.description, /utm_source=mcp_registry/);
});
