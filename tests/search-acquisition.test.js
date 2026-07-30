const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

test("QA MCP search page ships crawlable metadata and structured product facts", () => {
  const html = read("qa-mcp.html");
  assert.match(html, /<title>QA MCP Server for Coding Agents \| Before Users Do<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/beforeusersdo\.com\/qa-mcp"/);
  assert.match(html, /<meta name="robots" content="index,follow"/);
  assert.match(html, /"@type": "SoftwareApplication"/);
  assert.doesNotMatch(html, /aggregateRating|reviewCount|price/);
});

test("search discovery files expose only public acquisition routes", () => {
  const robots = read("public", "robots.txt");
  const sitemap = read("public", "sitemap.xml");
  assert.match(robots, /Sitemap: https:\/\/beforeusersdo\.com\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/dashboard/);
  assert.match(sitemap, /<loc>https:\/\/beforeusersdo\.com\/qa-mcp<\/loc>/);
  assert.doesNotMatch(sitemap, /dashboard|reports|trial|testers|qa-credits/);
});

test("QA MCP route uses its static entry and the measured install path", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const route = vercel.rewrites.find(({ source }) => source === "/qa-mcp");
  assert.deepEqual(route, { source: "/qa-mcp", destination: "/qa-mcp.html" });

  const app = read("src", "App.tsx");
  const format = read("src", "lib", "format.ts");
  const page = read("src", "QaMcpPage.tsx");
  assert.match(app, /pathname === "\/qa-mcp"/);
  assert.match(format, /"\/qa-mcp"/);
  assert.match(app, /trackInstallClicked\("qa_mcp"\)/);
  assert.match(page, /trackOfferViewed\("qa_mcp", "\/qa-mcp"\)/);
  assert.match(page, /Install BeforeUsersDo/);
});
