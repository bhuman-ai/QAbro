const test = require("node:test");
const assert = require("node:assert/strict");

const { inferRoutesFromGitHubTree } = require("../lib/qa-github-routes");

test("inferRoutesFromGitHubTree extracts likely routes from common app structures", () => {
  const routes = inferRoutesFromGitHubTree([
    { path: "apps/web/app/page.tsx", type: "blob" },
    { path: "apps/web/app/pricing/page.tsx", type: "blob" },
    { path: "apps/web/app/blog/[slug]/page.tsx", type: "blob" },
    { path: "apps/web/pages/api/health.ts", type: "blob" },
    { path: "apps/web/pages/settings/profile.tsx", type: "blob" },
    { path: "apps/web/app/routes/dashboard.$teamId.tsx", type: "blob" }
  ]);

  assert.deepEqual(
    routes.map((route) => route.path),
    ["/", "/pricing", "/blog/:slug", "/dashboard/:teamId", "/settings/profile"]
  );
  assert.equal(routes[0].framework, "next");
  assert.equal(routes[3].framework, "remix_like");
});
