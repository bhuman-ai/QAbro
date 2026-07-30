# Acquisition instrumentation

## User job

Let a prospective Before Users Do customer arrive, install the QA connection, and reach a first completed report without analytics changing or interrupting the product flow.

## Touched surfaces

- Homepage and public documentation offer views.
- Homepage and documentation install CTA clicks.
- Authentication method handoff and recent-signup association.
- MCP configuration copy.
- Server-confirmed MCP key, first-use, first-request, and first-report milestones.

## Interaction contract

- Tracking is first-party, asynchronous, and non-blocking.
- The browser may record only public offer, CTA, install-copy, and recent-signup events.
- The server derives authenticated ownership and rejects browser attempts to emit activation milestones.
- First-touch attribution never stores email addresses, access tokens, target URLs, report contents, typed form values, IP addresses, or full referrers.
- Database event keys make milestone retries idempotent.
- Test campaigns use `utm_source=codex_test` and are excluded from normal reporting.

## States

- Analytics unavailable: product action continues without an error shown to the user.
- Existing authenticated account: no `signup_completed` event is emitted.
- Duplicate event: accepted without creating a second row.
- Server milestone: created only from persisted MCP token or QA report state.

## Verification

- Focused acquisition tests cover sanitization, endpoint authorization, idempotency, first-touch persistence, and reporting.
- The production database triggers were verified with `is_test=true` records on 2026-07-30.
