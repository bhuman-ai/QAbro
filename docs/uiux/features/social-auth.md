# Social Authentication

## User Job

Let a new or returning Before Users Do customer open the protected page they chose without waiting for an email.

## Primary Action

`Continue with Google`

GitHub is the developer-focused alternative. Magic-link email remains visible as the fallback.

## Flow

1. The user starts on `/trials`, `/dashboard`, or `/reports`.
2. The app sends the selected provider and a same-origin return URL to `/api/auth/oauth`.
3. The server confirms that only Google or GitHub was requested and that the provider is enabled in Supabase.
4. Supabase completes provider authentication and returns access and refresh tokens to the original page.
5. The existing `/api/auth/exchange` path validates the user and creates the normal Before Users Do session cookies.

## Visible States

- Ready: Google, GitHub, and email are available in one auth card.
- Opening: the selected provider button says `Opening Google...` or `Opening GitHub...`; other submit actions are disabled.
- Provider unavailable: one short inline message asks the user to use email.
- Complete: the user returns to the page where sign-in started.

## Safety Rules

- Accept only `google` and `github` provider values.
- Reject off-site return URLs and fall back to the configured Before Users Do domain.
- Never expose provider client secrets to the browser.
- Keep the existing server-side token validation and session-cookie exchange as the only logged-in session path.

## Verification

- Unit coverage for both providers, redirect validation, disabled providers, unsupported providers, and provider-settings failures.
- TypeScript, production build, full regression suite, browser rendering, click behavior, and console checks.
