# QA MCP search acquisition

## User job

Help a founder or small product team who is actively searching for browser testing through MCP understand the difference between raw browser control and a complete QA handoff, then connect Before Users Do.

## Product archetype

Single-purpose developer-tool landing page using the existing public-docs grammar: one argument, one evidence model, one install action, and progressive detail below the fold.

## Primary action

Install Before Users Do by opening the existing focused Coding agents setup.

## Primary risk

The visitor assumes any browser-control MCP already provides a trustworthy QA verdict and leaves before understanding the evidence and handoff difference.

## Information budget

- One outcome: turn an agent-finished feature into evidence-backed QA.
- One distinction: browser actions are inputs; a verdict and fix-ready evidence are the QA output.
- One three-step workflow.
- Four evidence types.
- Four short objections.
- One primary install action; the docs link stays secondary.

## View model contract

- Primary user: a builder shipping an AI-coded web app with an MCP-capable coding agent.
- Current decision: whether this is worth connecting in addition to general browser tooling.
- Why now: the agent says the feature is done, but release confidence is missing.
- Next action: create an MCP key and connect the hosted endpoint.
- Top risk: setup feels like extra toolchain work before the first useful result.

## Content and claim contract

- Target the real language `QA MCP server`, `browser testing MCP`, and `coding agent QA` without keyword repetition.
- State only observed capabilities: hosted streamable-HTTP MCP, browser-backed testing, screenshots, console and network evidence, explicit outcomes, and fix-ready reports.
- Never claim that a clean run always passes.
- Never invent customer counts, ratings, benchmarks, guarantees, or compatibility beyond remote MCP clients the setup supports.
- Describe durable test suites as complementary, not obsolete.

## Discovery contract

- `/qa-mcp` serves crawlable route-specific HTML metadata before JavaScript runs.
- The canonical URL is `https://beforeusersdo.com/qa-mcp`.
- `robots.txt` exposes the sitemap while excluding private product routes.
- `sitemap.xml` includes only the homepage, QA MCP page, and public docs.
- Organic acquisition is inspectable by the first-touch `landing_path=/qa-mcp` even when no UTM is present.

## Responsive contract

- Preserve one reading column on small screens.
- Keep the primary CTA visible in the header without crowding navigation.
- Convert comparison and workflow rows to stacked blocks on narrow screens.
- Keep all actions text-labeled and at least 44px tall.

## Verification

- Validate route metadata, canonical URL, sitemap, robots rules, route rewrite, and acquisition hooks in automated tests.
- Verify the production HTML response before relying on client-side rendering.
- Exercise arrival and CTA in a real browser with test attribution.
