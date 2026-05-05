---
name: probe-mcp
description: Phase 0 spike — verify .mcp.json auto-load (Playwright server should be available after plugin install) AND discover real Playwright MCP tool names.
allowed-tools: Read, Bash
---

# Probe: .mcp.json auto-load + Playwright tool discovery

## Step 1: Confirm Playwright MCP loaded via plugin's .mcp.json

The plugin ships `.mcp.json` declaring the `playwright` MCP server. After install, that server should auto-start.

Try invoking any tool whose name starts with `mcp__playwright__`. If the tool list available to you contains tools starting with `mcp__playwright__` (e.g., `mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, etc.), report:

> PASS: .mcp.json auto-loaded. Available Playwright tools detected:
> - mcp__playwright__<tool1>
> - mcp__playwright__<tool2>
> - ... (list ALL of them — this is critical for the transformer's browserToolMap)

If no `mcp__playwright__*` tools are available, report:
> FAIL: .mcp.json did NOT auto-load. The user must add Playwright MCP manually.

## Step 2: Process count check

Run via Bash: `ps -ef | grep -i playwright | grep -v grep | wc -l`

Report the number. With form-A (single plugin declaring playwright), expected: 1.

## Step 3: Memory check

Run via Bash: `ps -eo pid,rss,command | grep -i playwright | grep -v grep`

Report RSS (KB) for any playwright process. We use this baseline in form-C to detect dedup behavior.
