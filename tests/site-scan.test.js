const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeScanUrl,
  isPrivateIpAddress,
  collectHtmlInsights,
  runSitePreviewScan
} = require("../lib/site-scan");

test("normalizeScanUrl accepts bare domains and strips hashes", () => {
  assert.equal(normalizeScanUrl("clusterseo.com#test"), "https://clusterseo.com/");
  assert.equal(normalizeScanUrl("https://example.com/path?q=1#frag"), "https://example.com/path?q=1");
  assert.equal(normalizeScanUrl("javascript:alert(1)"), null);
});

test("isPrivateIpAddress flags loopback and RFC1918 ranges", () => {
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.0.1.5"), true);
  assert.equal(isPrivateIpAddress("192.168.0.8"), true);
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
});

test("collectHtmlInsights extracts basic page structure", () => {
  const insights = collectHtmlInsights(`
    <html>
      <head>
        <title>ClusterSEO</title>
        <meta name="description" content="SEO platform" />
      </head>
      <body>
        <h1>Rank higher</h1>
        <form><label>Email</label><input type="email" /></form>
        <button>Continue</button>
        <img src="/hero.png" />
      </body>
    </html>
  `);

  assert.equal(insights.title, "ClusterSEO");
  assert.equal(insights.h1, "Rank higher");
  assert.equal(insights.formCount, 1);
  assert.equal(insights.buttonCount, 1);
  assert.equal(insights.imageCount, 1);
  assert.equal(insights.imagesWithoutAlt, 1);
});

test("runSitePreviewScan returns plain-English findings from fetched HTML", async () => {
  const result = await runSitePreviewScan("clusterseo.com", {
    lookupFn: async () => [{ address: "93.184.216.34" }],
    fetchFn: async () => ({
      status: 200,
      url: "https://clusterseo.com/login",
      headers: {
        get(name) {
          return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "";
        }
      },
      async text() {
        return `
          <html>
            <head><title>ClusterSEO Log in</title></head>
            <body>
              <form>
                <input type="password" />
                <button>Continue</button>
              </form>
              <p>Need an account? Sign up</p>
              <p>Already have one? Log in</p>
              <img src="/hero.png" />
            </body>
          </html>
        `;
      }
    })
  });

  assert.equal(result.ok, true);
  assert.match(result.summary, /flagged/i);
  assert.ok(Array.isArray(result.logs));
  assert.ok(result.logs[1].includes("Received HTML"));
  assert.ok(result.findings.some((finding) => /Login and sign-up are competing/i.test(finding.title)));
  assert.ok(result.findings.some((finding) => /alt text/i.test(finding.description)));
});

test("runSitePreviewScan blocks private targets", async () => {
  const result = await runSitePreviewScan("http://localhost:3000", {
    lookupFn: async () => [{ address: "127.0.0.1" }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /public websites/i);
});
