# Experiment log

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
- Next action: Run `npm run marketing:report` on 2026-08-06 and inspect the `mcp_registry / marketplace / official_registry` cohort.

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
