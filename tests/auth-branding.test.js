const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveMagicLinkRedirectTo } = require("../lib/auth");

const ROOT = path.resolve(__dirname, "..");

test("auth fallback redirects use the Before Users Do domain", () => {
  const previous = {
    AUTH_MAGIC_LINK_REDIRECT_BASE_URL: process.env.AUTH_MAGIC_LINK_REDIRECT_BASE_URL,
    AUTH_MAGIC_LINK_REDIRECT_URL: process.env.AUTH_MAGIC_LINK_REDIRECT_URL,
    QA_PUBLIC_APP_URL: process.env.QA_PUBLIC_APP_URL
  };

  delete process.env.AUTH_MAGIC_LINK_REDIRECT_BASE_URL;
  delete process.env.AUTH_MAGIC_LINK_REDIRECT_URL;
  delete process.env.QA_PUBLIC_APP_URL;

  try {
    assert.equal(resolveMagicLinkRedirectTo({ headers: {} }), "https://beforeusersdo.com/?auth_callback=1");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("Supabase magic-link branding uses Before Users Do", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts", "apply-supabase-magic-link-branding.mjs"), "utf8");
  const template = fs.readFileSync(path.join(ROOT, "supabase", "templates", "magic-link-beforeusersdo.html"), "utf8");

  assert.match(script, /Sign in to Before Users Do/);
  assert.match(template, /Sign in to Before Users Do/);
  assert.match(template, /Open Before Users Do/);
  assert.doesNotMatch(script, /Sign in to SwarmTester|magic-link-swarmtester/);
  assert.doesNotMatch(template, /SwarmTester/);
});
