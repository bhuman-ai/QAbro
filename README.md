# Before Users Do

Browser-backed QA for coding agents.

Before Users Do is a hosted MCP server that lets Codex, Cursor, and other compatible coding agents test a reachable web app, collect browser evidence, and return a fix-ready report before the feature ships.

[Install the QA MCP](https://beforeusersdo.com/qa-mcp) · [Read the setup guide](https://beforeusersdo.com/docs) · [View the official MCP Registry record](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.bhuman-ai%2Fbeforeusersdo)

## What the agent gets

- Browser-backed flow testing against a reachable preview
- Screenshots and recordings tied to the affected step
- Console errors, page errors, and failed network requests
- An explicit `pass`, `needs_fix`, `needs_review`, or `timed_out` outcome
- A focused report the coding agent can use for the next change

## Hosted MCP endpoint

```text
https://mcp.beforeusersdo.com/mcp
```

Create an MCP key through the [public setup guide](https://beforeusersdo.com/docs#start), then add the hosted connection to your MCP-capable coding agent.

## Why QA MCP instead of browser control alone?

A browser tool can click and type. Before Users Do adds the QA contract around those actions: a test goal, an evidence trail, a trustworthy outcome, and a handoff back to the code.

Durable Playwright or end-to-end test suites are still valuable for known regressions. Before Users Do is designed to help the agent inspect the newly finished flow and catch problems that have not become tests yet.
