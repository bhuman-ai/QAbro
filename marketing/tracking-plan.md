# Tracking plan

## Decision

- Primary conversion event: `first_qa_report_completed`
- Analytics destination: The existing Supabase project, using one append-only `swarmtest_acquisition_events` table alongside `swarmtest_mcp_tokens` and `swarmtest_reports`.
- Attribution model: First-touch attribution. Persist the first valid UTM set and landing page, then copy that snapshot onto the primary conversion event.
- Reporting location: A read-only Supabase SQL view or saved query grouped by UTC day, source, medium, and campaign.
- Test traffic: Every event supports `is_test`; test campaigns use `utm_source=codex_test` and are excluded from normal reporting.

The primary event means one authenticated owner has received their first terminal, usable QA report. A page view, signup, MCP key, or queued run is diagnostic—not a conversion.

## Common event contract

Every event records:

- `event_name`: one stable name from the table below.
- `event_key`: an idempotency key so retries cannot create duplicate milestones.
- `occurred_at`: server timestamp for server-confirmed events; client timestamp retained only as an optional property.
- `visitor_id`: random first-party UUID stored in the browser; never an advertising identifier.
- `owner_user_id`: added only after authentication and inferred by the server.
- `landing_path`: path only, without arbitrary query parameters.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`: sanitized strings from the first qualified arrival.
- `is_test`: explicit boolean.
- `properties`: small JSON object containing only the event-specific fields below.

Do not store MCP keys, access tokens, email addresses, target URLs, report content, typed form values, IP addresses, or full referrers in acquisition events.

## Events

| Event | Exact trigger | Required properties | Destination | Implemented | Verified |
|---|---|---|---|---|---|
| `offer_viewed` | Once per visitor when `/` or `/docs` becomes visible in the browser. | `surface`, `path` | `swarmtest_acquisition_events` | Client and API wired locally; journal live | Browser-to-production-journal test verified |
| `primary_cta_clicked` | The visitor activates an `Install BeforeUsersDo` control. | `surface`, `cta_label`, `destination_path` | `swarmtest_acquisition_events` | Client and API wired locally; journal live | Browser-to-production-journal test verified |
| `signup_completed` | A recent account becomes authenticated; requesting a magic link and returning existing users do not count. | `auth_method` | `swarmtest_acquisition_events` | Client and API wired locally; journal live | Unit verified; real auth return pending |
| `mcp_key_created` | A new MCP token row is persisted. The API hook is a non-blocking duplicate safeguard. | `token_id`, `source` | Event journal plus existing `swarmtest_mcp_tokens.created_at` | Production database trigger live; API safeguard local | Production trigger verified with test row |
| `agent_install_step_copied` | Clipboard write succeeds for the MCP config or skill command. | `step` = `mcp_config` or `skill_command` | `swarmtest_acquisition_events` | Client and API wired locally; journal live | Both copy steps browser-to-production-journal verified |
| `mcp_key_first_used` | A valid MCP token updates from never used to first used. | `token_id` | Event journal plus existing `swarmtest_mcp_tokens.last_used_at` | Production database trigger live with first-touch attribution | Production trigger verified with test row |
| `first_qa_requested` | The first owned QA report row is inserted. | `run_id`, `launch_surface`, `qa_mode` | Event journal plus existing `swarmtest_reports` row | Production database trigger live | Production trigger verified with test row |
| `first_qa_report_completed` | The owner’s first report row reaches persisted `completed` status. Other statuses do not fire. | `run_id`, `report_status`, `finding_count`, `activation_latency_seconds` | Event journal plus existing `swarmtest_reports` row | Production database trigger live | Production trigger verified with test row |

## Attribution

- UTM capture: On the first visit to `/` or `/docs`, accept only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`; trim values and cap their length.
- Persistence: Store the first valid attribution snapshot and `visitor_id` in first-party local storage. Do not overwrite it on later visits.
- Auth association: After authentication, send the current `visitor_id` to the server; the server infers `owner_user_id` from the session and links subsequent events.
- Conversion record: When `first_qa_report_completed` is written, resolve the earliest attribution snapshot for that owner and copy it onto the conversion event.
- First/last touch behavior: Report first touch only for the initial learning loop. Later-touch data may be retained on individual events but must not replace the first-touch snapshot.
- Missing attribution: Classify a conversion with no stored UTM as `direct` or `unknown`; never infer a campaign from email addresses, target URLs, or report contents.

## Idempotency and truth rules

- Use deterministic keys for milestones: `signup_completed:{owner_user_id}`, `mcp_key_created:{token_id}`, `mcp_key_first_used:{token_id}`, `first_qa_requested:{owner_user_id}`, and `first_qa_report_completed:{owner_user_id}`.
- Let the server supply `owner_user_id`; never trust it from a browser payload.
- `first_qa_report_completed` fires once per owner, after the completed report has been stored successfully.
- A report is usable only when its persisted status is terminal and the existing report contract considers it complete. Inconclusive and failed work remain diagnostic outcomes.
- Client events may explain drop-off but cannot establish signup, first use, request, or conversion.

## Reporting

Show absolute counts and these rates only when their denominators are available:

- CTA rate = unique `primary_cta_clicked` visitors / unique `offer_viewed` visitors.
- Signup rate = unique `signup_completed` owners / unique CTA visitors.
- Key creation rate = unique `mcp_key_created` owners / unique signed-up owners.
- MCP activation rate = unique `mcp_key_first_used` owners / unique key-created owners.
- QA request rate = unique `first_qa_requested` owners / unique first-use owners.
- First-report rate = unique `first_qa_report_completed` owners / unique first-request owners.
- Landing conversion rate = unique first-report owners / unique offer visitors.
- Median activation time = median time from first attributed offer view to first completed report.

At low volume, display the absolute numerator and denominator next to every rate.

## End-to-end test

- Test URL: `https://beforeusersdo.com/?utm_source=codex_test&utm_medium=qa&utm_campaign=install_funnel_v1&utm_content=hero`
- Test identity or record: A designated internal test account with `is_test=true`; do not put its email in this document.
- Conversion completed: A synthetic report lifecycle reached completed status; a real authenticated browser-to-report journey remains pending.
- Primary event observed: Yes, as an `is_test=true` `first_qa_report_completed` event.
- Attribution observed: Yes. The browser events and database milestones retained the `codex_test` source, `qa` medium, and `install_funnel_v1` campaign.
- Evidence: Browser-driven offer, CTA, and both install-copy events were observed in production Supabase. Temporary MCP token and report rows produced all four database milestones and were deleted after verification. Their harmless `is_test=true` acquisition evidence remains for audit and is excluded from the normal report.
- Tested at: 2026-07-30.

## Known gaps

- The three acquisition migrations are live in production Supabase. The web client and serverless API hooks are isolated on `codex/hotfix-launch-funnel`, based directly on the production commit, and remain pending merge plus deployment from `main`.
- Clipboard events can confirm a successful copy action, not that the user completed the external installation.
- Magic links opened on a different browser or device may lose browser-only attribution unless the pending snapshot is also bound to the auth flow.
- A complete real-account journey from production landing page through authentication, installation, and first QA report remains unverified.
- `npm run marketing:report` and `marketing/acquisition-report.sql` are live inspection paths. The default report excluded all synthetic test traffic and showed zero real acquisition events at 2026-07-30T14:47:12Z.
