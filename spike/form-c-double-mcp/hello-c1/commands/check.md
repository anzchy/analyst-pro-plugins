---
name: check
description: Phase 0 spike form C — count Playwright MCP processes and report dedup behavior.
allowed-tools: Bash
---

# C1: Process & memory check

Run via Bash:

```bash
echo "=== Playwright process count ==="
ps -ef | grep -i playwright | grep -v grep | wc -l
echo "=== Playwright RSS detail ==="
ps -eo pid,rss,command | grep -i playwright | grep -v grep
echo "=== /mcp listing reminder ==="
echo "After this command, also run /mcp inside Claude Code and count playwright entries."
```

Expected outcomes:
- DEDUPED: process count = 1, /mcp shows playwright once
- NOT DEDUPED: process count = 2, /mcp shows playwright twice (or once with collision)
- COLLISION: process count varies, errors visible
