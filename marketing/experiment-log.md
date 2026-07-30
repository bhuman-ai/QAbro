# Experiment log

## Experiment 4

- Name: Product Hunt — QA MCP launch seed
- Status: Package ready; publication approval required
- Role: One-to-many launch exposure that seeds the live, compounding `/qa-mcp` search asset
- Audience: Product Hunt builders using coding agents to ship web apps
- Hypothesis: For builders whose coding agent has declared a feature done, a browser-evidence-first launch will produce install actions because it closes the gap between generated code and release confidence.
- Reusable asset: Product Hunt listing package in `marketing/product-hunt-launch.md`
- Expansion lever: Product Hunt discovery, ecosystem citations, launch feedback, and reuse of the launch creative
- Manual dependency: One maker-owned submission, an honest maker comment, and launch-day replies
- Destination: `https://beforeusersdo.com/qa-mcp?utm_source=product_hunt&utm_medium=launch&utm_campaign=qa_mcp_launch`
- Primary event: `first_qa_report_completed`
- Diagnostic campaign: `product_hunt / launch / qa_mcp_launch`
- Start condition: The Product Hunt listing is published and can produce attributable exposure
- Observation window: Seven days or 100 attributed landing visits, whichever is later
- Continue if: At least one completed QA report, or at least five percent of attributed visitors choose the install CTA while activation volume is still small
- Stop or change if: Product Hunt exposure sends no attributable visitors, or 100 attributed visitors produce no install clicks
- Completed preparation: Listing copy, tracked destination, first-comment scaffold, 240 × 240 site-brand thumbnail, and two 1270 × 760 gallery captures from the live QA MCP page
- Approval gate: Confirm a personal maker account, the truthful pricing tag, the honest one-sentence maker story, any required terms, and external publication
- Next action: Obtain explicit approval immediately before Product Hunt submission.

## Experiment 3

- Name: High-intent search — QA MCP for coding agents
- Status: Live
- Primary channel: Organic search discovery
- Audience: Founders and small teams searching for QA MCP, browser-testing MCP, or a way for coding agents to verify finished features
- Hypothesis: For builders with an active release-confidence problem, an evidence-first QA MCP page will produce install actions because it distinguishes a complete QA handoff from raw browser control.
- Reusable asset: `/qa-mcp`
- Expansion lever: Search indexing, internal links, official Registry authority, and future ecosystem citations
- Manual dependency: Periodic evidence and copy updates from observed search and activation data
- Destination: `https://beforeusersdo.com/qa-mcp`
- Primary event: `first_qa_report_completed`
- Diagnostic key: `landing_path=/qa-mcp`
- Observation window: 45 days or 100 qualified page visitors, whichever is later
- Continue if: At least one completed QA report, or at least five percent of qualified visitors choose the install CTA before activation volume is sufficient
- Stop or change if: 100 qualified visitors produce no install clicks, or install clicks repeatedly fail to reach MCP activation
- Launched at: 2026-07-30T20:21:39Z
- Production evidence: Vercel completed deployment of merge commit `7f69e358`; `/qa-mcp`, `/robots.txt`, and `/sitemap.xml` return 200, and the raw page HTML contains the route title, description, canonical URL, and `SoftwareApplication` structured data before JavaScript runs.
- Measurement evidence: A controlled `codex_test / qa / qa_mcp_search_production` visit produced exactly one offer view and one install click, then reached `/dashboard?panel=coding_agents`. No signup or activation was fabricated.
- GitHub discovery evidence: The public repository now uses the QA MCP page as its homepage and exposes eight relevant discovery topics.
- Observed result: The traffic surface and measurement path are live; no real qualified-search cohort exists yet.
- Next action: Use the prepared Product Hunt launch as the active one-to-many seed for this search asset.

## Experiment 2

- Name: Official MCP Registry — hosted QA discovery
- Status: Live
- Primary channel: Official MCP Registry distribution
- Audience: Builders actively discovering MCP servers for coding agents
- Hypothesis: A registry listing for browser-backed QA will produce qualified installs without proportional founder outreach.
- Reusable asset: `server.json`
- Expansion lever: Downstream MCP aggregators and marketplaces that consume the official registry
- Manual dependency: One authenticated publication and occasional versioned metadata updates
- Destination: `https://beforeusersdo.com/docs?utm_source=mcp_registry&utm_medium=marketplace&utm_campaign=official_registry#start`
- Primary event: `first_qa_report_completed`
- Observation window: 30 days after publication or until 30 attributed visitors, whichever is later
- Continue if: At least one attributed completed QA report and no material onboarding failure
- Stop or change if: 30 attributed visitors produce no completed report, or registry clients cannot complete token setup
- Published at: 2026-07-30T20:03:36Z
- Publication evidence: GitHub Actions run `30577491029` authenticated with GitHub OIDC and reported `Successfully published` for `io.github.bhuman-ai/beforeusersdo` version `1.0.0`.
- Registry evidence: The official Registry API returned exactly one matching record with status `active`, `isLatest: true`, version `1.0.0`, the attributed docs URL, and the hosted streamable-HTTP endpoint.
- Validation: Official 2025-12-11 JSON Schema passed; the hosted health endpoint returned 200; the MCP endpoint returned the expected 401 authentication challenge; the attributed docs URL preserved all campaign fields in a real browser.
- Observed result: Publication is verified; real traffic and activation data have not reached an observation checkpoint yet.
- Next action: Keep the Registry record active as authority and downstream distribution while Experiment 3 becomes the active traffic engine.

## Experiment

- Name: Founder outreach — one newly shipped flow
- Status: Archived as optional validation; not the acquisition engine
- Bottleneck: Five recipients and messages are prepared, but the founder-owned Reddit sender account is not confirmed.
- Hypothesis: For founders publicly shipping AI-coded web apps, a specific offer to test one newly shipped flow will produce at least three qualified replies and one completed first QA report from 15 personalized contacts because it removes the uncertainty between “the agent says done” and “safe to ship.”
- Audience: Founders or solo builders who publicly launched or substantially updated a web app built with Codex, Bolt, Lovable, Replit, v0, or another agentic coding workflow within the previous 30 days.
- Channel: Personalized replies or direct messages on the same public platform where the builder invited product feedback. No scraped emails and no unsolicited follow-up sequence.
- Offer: “I’ll help you run one browser-backed QA pass on the flow you just shipped, then return the evidence to your coding agent so it can fix what we find.”
- Creative variants:
  - Pain: “The risky bugs are the ones your coding agent cannot see after it says done.”
  - Outcome: “Get one newly shipped flow to a fix-ready QA report without leaving your agent workflow.”
  - Mechanism: “One MCP install gives the agent browser evidence, console/network proof, and a report it can act on.”
- Destination: `https://beforeusersdo.com/?utm_source=founder_outreach&utm_medium=direct&utm_campaign=first_flow_qa&utm_content={pain|outcome|mechanism}`
- Primary event: `first_qa_report_completed`
- Budget cap: USD 0 media spend; 15 hand-written contacts; no more than five per day.
- Start criteria: Production client and API hooks deployed from a clean source state; the full production test journey passes; 15 prospects meet the audience and recency rules; every message refers to a real flow the recipient publicly shipped.
- Stop criteria: Stop immediately on tracking failure, platform-policy concern, misleading message match, recipient objection, or any request not to contact. Stop the cohort after 15 delivered contacts or seven days, whichever comes later.
- Continue criteria: Continue to a second cohort only if the first produces at least three qualified replies or two installs and at least one completed first QA report. Treat smaller signals as directional, not proof.
- Started at: Not started.
- Ended at: Not started.

## Result

- Spend: Not started.
- Qualified arrivals: Not started.
- Primary conversions: Not started.
- Downstream quality: Not started.
- Observed result: Not started.
- Measurement caveats: The cohort is intentionally too small for statistical certainty; it is designed to detect an obvious audience-message-path failure before scaling.

## Decision

- Interpretation: The delivery gate passed. A controlled production account completed all eight attributed milestones and received its first report in 96 seconds.
- Decision: Archive the five-message cohort as optional message validation. Do not use it as the acquisition engine.
- Next action: None unless a later Registry experiment needs qualitative message research.
