# Experiment log

## Experiment

- Name: Founder outreach — one newly shipped flow
- Status: ready for founder approval
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
- Decision: Keep the five-message cohort staged; do not send until the founder-owned Reddit account is confirmed and the public post checks are refreshed.
- Next action: Confirm the sender account, re-open the five source profiles, and approve the prepared messages in `marketing/prospect-cohort.md`.
