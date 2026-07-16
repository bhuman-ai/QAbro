# MCP Activation Flow

## User Job

Connect Before Users Do to a coding agent and run the first real test without learning the rest of the dashboard.

## Primary Action

`Create key`

## Flow

1. The user chooses `Get MCP key` from the homepage or public docs.
2. If signed out, the user signs in or creates an account with Google, GitHub, or one email field.
3. The dashboard opens `panel=coding_agents` even when the account has no brand or project.
4. The user creates one key and copies the generated MCP config.
5. The coding agent calls `qa_check_work` for a reachable preview URL.
6. If the browser is still running, the MCP returns `continue_polling: true` and the agent immediately calls `qa_wait_for_run` again.
7. Only a final report can be labeled `Passed` or `Needs review`.

## First-Run Truthfulness

- No invented satisfaction score.
- No fake live tester, email, duration, or activity.
- Queued and running work says `In progress`.
- `partial`, `failed`, `blocked`, or any report with findings says `Needs review`.
- A finished report with no findings says `Passed`.

## Progressive Disclosure

Brand settings, repository connection, automations, personas, and detailed run history remain available after activation. They do not block creating the first MCP key.

## Verification

- Source regression tests cover the one-field signup, direct route, and truthful empty state.
- MCP unit tests cover bounded wait slices and the required polling handoff.
- Production verification uses a clean account and a generic MCP SDK client.
