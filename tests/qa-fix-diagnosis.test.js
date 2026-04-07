const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../lib/qa-fix-diagnosis");

const {
  buildFallbackDiagnosis,
  inferBestRepositoryForBrand,
  selectCandidateFiles,
  tokenizeText
} = __private;

test("selectCandidateFiles prefers homepage and marketing files for homepage skepticism", () => {
  const tree = [
    { type: "blob", path: "src/app/page.tsx", sha: "sha-home", size: 1800 },
    { type: "blob", path: "src/components/marketing/hero.tsx", sha: "sha-hero", size: 1200 },
    { type: "blob", path: "src/features/billing/credits-table.tsx", sha: "sha-billing", size: 1400 },
    { type: "blob", path: "README.md", sha: "sha-readme", size: 300 }
  ];
  const tokens = Array.from(
    new Set([
      ...tokenizeText("Customer skepticism 1"),
      ...tokenizeText("I want to know how credit earning works and what happens after I start.")
    ])
  );

  const selected = selectCandidateFiles(tree, { tokens, targetPath: "/" }, 4);

  assert.equal(selected.length, 4);
  assert.equal(selected[0].path, "src/components/marketing/hero.tsx");
  assert.equal(selected[1].path, "src/app/page.tsx");
  assert.equal(selected[2].path, "src/features/billing/credits-table.tsx");
});

test("buildFallbackDiagnosis produces repo-aware fix guidance with likely files", () => {
  const diagnosis = buildFallbackDiagnosis({
    point: {
      title: "Customer skepticism 1",
      severity: "medium",
      description: "I want proof this works and clearer first steps.",
      recommended_fix: null
    },
    repoFullName: "owner/product",
    routes: [{ path: "/" }, { path: "/signup" }],
    candidateFiles: [
      { path: "src/app/page.tsx" },
      { path: "src/components/marketing/hero.tsx" }
    ]
  });

  assert.equal(diagnosis.repo_full_name, "owner/product");
  assert.match(diagnosis.repo_understanding, /owner\/product/);
  assert.match(diagnosis.repo_understanding, /\/signup/);
  assert.match(diagnosis.likely_fix_location, /src\/app\/page\.tsx/);
  assert.deepEqual(diagnosis.suspected_files, [
    "src/app/page.tsx",
    "src/components/marketing/hero.tsx"
  ]);
  assert.match(diagnosis.developer_prompt, /Likely files to inspect: src\/app\/page\.tsx, src\/components\/marketing\/hero\.tsx/);
});

test("inferBestRepositoryForBrand matches the project repo from owner installation access", () => {
  const matched = inferBestRepositoryForBrand({
    brandKey: "clusterseo.com",
    targetUrl: "https://www.clusterseo.com/",
    repositories: [
      { full_name: "bhuman-ai/QAbro", name: "QAbro" },
      { full_name: "bhuman-ai/clusterseo", name: "clusterseo" },
      { full_name: "bhuman-ai/shared-marketing", name: "shared-marketing" }
    ]
  });

  assert.equal(matched.full_name, "bhuman-ai/clusterseo");
});
