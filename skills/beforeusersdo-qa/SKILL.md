---
name: beforeusersdo-qa
description: Route and run BeforeUsersDo QA through its MCP tools. Use when a user asks to test, QA, review, or get feedback on a website, app, feature, preview, or user flow; asks for AI QA, a personal self-review, a real human tester, QA status, video, transcript, findings, or a completed BeforeUsersDo report.
---

# BeforeUsersDo QA

Use the four primary BeforeUsersDo MCP tools. Do not start with legacy tools.

## Choose the path

- Call `qa_ai_test` when an AI agent should test the product.
- Call `qa_self_review` when the user will personally test, speak, draw, or record feedback.
- Call `qa_hire_tester` when another real person, tester, or QA professional should test.
- Call `qa_continue` for every question, setup step, status check, and report retrieval after a flow starts.

For a generic request such as “test this,” use AI QA unless the user clearly asks for a person. “Someone,” “tester,” “human,” or “QA professional” means human QA. “I’ll test it” or “let me review it” means self-review.

## Follow the returned state

Treat the MCP response as authoritative:

- `needs_input`: Relay `question` plainly. After the answer, call `qa_continue` with the same `resume_token` and the answer fields.
- `needs_setup`: Perform `required_action`. For self-review, install the exact widget, load the target page, and call `qa_continue`; the server must detect the widget before sharing the review link.
- `running`: Report the current state. Call `qa_continue` when the response requests immediate polling or when the user asks for an update.
- `processing_report`: The test was submitted but evidence analysis is not ready. Do not call it complete.
- `needs_review`: Explain the exact missing evidence or failed gate. Do not call it complete.
- `complete`: Share `report_url`, the verdict, and the most important findings.
- `failed`: Explain the failure and what is needed next.

Do not replace a returned `next_tool` with a legacy status, wait, or report tool.

## Human QA rules

Never infer funding.

- Ask cash versus QA credit when `qa_hire_tester` returns a funding question.
- Require the exact `budget_usd` for cash or QA credit.
- Select `qualification_trial` only when the user explicitly asks for the free tester-and-buyer trial.
- Never describe a queued request as matching a tester until the MCP says it is available, assigned, or in progress.
- Never claim completion until the MCP returns `state: complete`. Human completion requires video evidence and completed video-and-transcript analysis.

## Change authorization

Default `after_feedback` to `report`.

Use `preview` only when the user asks to see or approve a proposed fix first. Use `fix_and_retest` only when the user explicitly asks the agent to implement fixes. A QA request alone does not authorize code changes or deployment.

## Safety

- Infer the target URL and goal from current work when clear; ask only for missing information returned by the MCP.
- Default access to `public_only`.
- Use `signup_allowed` only when creating a disposable account is acceptable.
- Use `test_account` only with a dedicated test login.
- Never pass personal credentials, API keys, cookies, or browser storage.
- Never allow purchases or irreversible actions without explicit user permission.
