const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const acquisition = fs.readFileSync(path.join(ROOT, "src", "lib", "acquisition.ts"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "src", "App.tsx"), "utf8");
const docs = fs.readFileSync(path.join(ROOT, "src", "PublicDocsPage.tsx"), "utf8");

test("browser acquisition capture is first-party, first-touch, and UTM-limited", () => {
  assert.match(acquisition, /beforeusersdo:first_touch:v1/);
  assert.match(acquisition, /utm_source.*utm_medium.*utm_campaign.*utm_content.*utm_term/);
  assert.match(acquisition, /if \(existing\) \{\s*return existing;/);
  assert.match(acquisition, /keepalive: true/);
  assert.doesNotMatch(acquisition, /\b(email|access_token|refresh_token|target_url|report_markdown)\s*:/);
});

test("public offer, CTA, signup, and install-copy actions are instrumented", () => {
  assert.match(app, /trackOfferViewed\("homepage", "\/"\)/);
  assert.match(docs, /trackOfferViewed\("public_docs", "\/docs"\)/);
  assert.match(app, /trackInstallClicked\("homepage"\)/);
  assert.match(app, /trackInstallClicked\("public_docs"\)/);
  assert.match(app, /trackSignupCompleted\(\)/);
  assert.match(app, /rememberAcquisitionAuthMethod\("email"\)/);
  assert.match(app, /rememberAcquisitionAuthMethod\(provider\)/);
  assert.match(app, /"mcp_config"/);
  assert.match(docs, /trackingStep="mcp_config"/);
});
