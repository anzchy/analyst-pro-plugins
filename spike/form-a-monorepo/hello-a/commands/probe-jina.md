---
name: probe-jina
description: Phase 0 spike CU #7 — verify .mcp.json headers support ${JINA_API_KEY} env interpolation, AND discover Jina MCP tool name format under plugin namespace.
---

# Probe: Jina HTTP MCP — env var interpolation + tool naming

## Step 1: Tool availability probe

The plugin's `.mcp.json` declares `jina-ai` as an HTTP MCP server pointing at `https://mcp.jina.ai/v1?include_tools=read_url,search_web,search_arxiv,search_ssrn`, with `headers.Authorization: "Bearer ${JINA_API_KEY}"`. After install, Claude Code should resolve `${JINA_API_KEY}` from environment, then connect.

**Expected**: 4 Jina tools become available (`read_url`, `search_web`, `search_arxiv`, `search_ssrn`) — under whatever plugin namespace prefix Claude Code uses.

Run ToolSearch with query "jina" max_results 10. List the verbatim `name` field of every result. Then report:

> **Tool count found**: N
> **Tool name format observed** (paste the exact verbatim names):
> - mcp__<...>__read_url
> - mcp__<...>__search_web
> - ...
> **Verdict on `${JINA_API_KEY}` env interpolation**:
> - PASS — tools available means Claude Code did resolve the env var into the Authorization header successfully
> - FAIL — tools missing or 401-equivalent error → env interpolation in `.mcp.json` headers is NOT supported

## Step 2: Live invocation test (only if Step 1 PASS)

If Step 1 found Jina tools, invoke `search_web` (or whatever the namespaced equivalent is) with a trivial query like `"hello world"`. Report:

> **Live call result**: PASS (returned results) / FAIL (error: <exact text>)

If FAIL with auth error → confirms env var did NOT interpolate to a valid header even though tools registered.
If PASS → CU #7 fully resolved, env var interpolation works.

## Step 3: Cross-check against /mcp UI display

Tell the user to also run `/mcp` (separately, after this command) and paste back the line for `jina-ai`. Expected:

> `plugin:hello-a:jina-ai · ✓ connected · 4 tools`

If `✗ failed` instead, paste the error message Claude Code shows when you select the entry (Enter or details).

---

## Why this matters

If `${JINA_API_KEY}` interpolation works in `.mcp.json` headers, the plugin can ship its own Jina config and users just need to set the env var once — clean UX. If it doesn't work, the plan changes: plugin doesn't ship Jina config, README requires user to add `jina-ai` to user-level or project-level `.mcp.json` themselves with a hardcoded API key. UX degrades, but plan still works.
