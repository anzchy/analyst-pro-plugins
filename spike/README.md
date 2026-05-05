# Phase 0 Spike — AnalystPro Claude Code Plugins

Goal: validate the 6 Critical Unknowns from `docs/plans/20260505-analyst-claude-plugins.md` before writing the transformer (Phase 0.5) or any real plugin (Phase 1+).

**Time budget**: 30–60 min. Most of it is waiting for `npx -y @playwright/mcp@latest` to download Chromium on first run.

This directory has **three forms** to test independently:

```
analyst-plugins-spike/
├── form-a-monorepo/           # Tests: relative-path source ("./hello-a")
├── form-b-gitsubdir/          # Tests: git-subdir schema
└── form-c-double-mcp/         # Tests: two plugins both declaring playwright (dedup)
```

The plan needs at least one of A/B to work for the marketplace layout decision. C is independent (MCP dedup behavior).

---

## Critical Unknowns being tested (mapped to plan section)

| CU # | What we test                                   | Where                                                | Pass means                                                               |
| ---- | ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | `${CLAUDE_PLUGIN_ROOT}` resolves in 3 contexts | form-a `/hello-a:probe-root` + `/hello-a:probe-args` | All 3 sentences PASS in probe-args output                                |
| 2    | marketplace.json schema for monorepo           | form-a + form-b `/plugin marketplace add`            | At least one form succeeds                                               |
| 3    | `.mcp.json` in plugin auto-loads               | form-a `/hello-a:probe-mcp` Step 1                   | `mcp__playwright__*` tools listed                                        |
| 4    | Real Playwright MCP tool names                 | form-a `/hello-a:probe-mcp` Step 1 (verbose list)    | Capture full list to `phase0-findings.md`                                |
| 5    | Two plugins → MCP dedup or duplication         | form-c `/hello-c1:check` after both installed        | Process count = 1 (deduped) or = 2 (we accept and add `--user-data-dir`) |
| 6    | `claude` CLI headless plugin invocation        | Manual: `claude -p "/hello-a:probe-root"` from shell | Returns the probe output without launching interactive UI                |
| **7** | **`.mcp.json` headers support `${JINA_API_KEY}` env var interpolation** | **form-a `/hello-a:probe-jina`** | **`mcp__plugin_hello-a_jina-ai__*` tools available; live `search_web` returns results** |

---

## Step-by-step walkthrough

### Step 0: Pre-flight (1 min)

```bash
which claude       # confirm Claude Code CLI on PATH
which npx          # required for Playwright MCP
node --version     # >= 18 recommended
claude --version   # note version — record in findings
```

If `claude` isn't on PATH, you can still run the spike inside Claude Code's interactive UI; just skip CU #6.

### Step 1: Form A — relative-path source (5–10 min)

```bash
# In a NEW Claude Code session inside this repo:
/plugin marketplace add ./analyst-pro/analyst-plugins-spike/form-a-monorepo
```

Expected: marketplace named `spike-form-a` is registered. If you see an error about schema/source/path, record the exact error text in `phase0-findings.md` row CU #2 and skip to Step 2.

If add succeeded:

```
/plugin install hello-a@spike-form-a

# after the up install, run this
/reload-plugins
```

Expected: plugin installs, three commands become available:

- `/hello-a:probe-root`
- `/hello-a:probe-args`
- `/hello-a:probe-mcp`

Run them in order:

```
/hello-a:probe-root
/hello-a:probe-args some arbitrary input here
/hello-a:probe-mcp
```

Record:

- For `probe-root`: PASS/FAIL + the literal value of `${CLAUDE_PLUGIN_ROOT}` you observed
- For `probe-args`: which of the 3 sentences PASS
- For `probe-mcp`: full list of Playwright MCP tool names + process count + RSS

### Step 2: Form B — git-subdir schema (5 min)

Form B requires a git repo because `git-subdir` source resolves via git. Init a throwaway repo:

```bash
cd /Users/jackcheng/Documents/01_Coding/mac-app/analyst-pro/analyst-plugins-spike/form-b-gitsubdir
git init -q && git add -A && git commit -qm "spike form B"
```

Then in Claude Code:

```
/plugin marketplace add ./analyst-plugins-spike/form-b-gitsubdir
/plugin install hello-b@spike-form-b
/hello-b:probe-root
```

Record PASS/FAIL.

> If form A worked and form B also works → both schemas valid, prefer form A (simpler).
> If only one works → that's the schema we use in real plan.
> If neither works → plan needs to switch to "separate repo per plugin" fallback.

### Step 3: Form C — MCP dedup (10–15 min, includes Chromium re-download)

```bash
# Start clean — uninstall form A's hello-a first if it's still loaded,
# so Playwright MCP isn't already running from a previous step
```

In Claude Code:

```
/plugin uninstall hello-a               # (if still installed from Step 1)
/plugin marketplace add file:///Users/jackcheng/Documents/01_Coding/mac-app/analyst-pro/analyst-plugins-spike/form-c-double-mcp
/plugin install hello-c1@spike-form-c
/plugin install hello-c2@spike-form-c
/hello-c1:check
```

Record from probe-mcp output:

- Playwright process count (1 = deduped, 2 = not deduped)
- Total RSS across all Playwright processes
- Whether Chromium profile collision warnings appear in stderr

### Step 4 (optional): CU #6 — headless CLI

```bash
# In a fresh terminal, NOT inside Claude Code's interactive session:
claude -p "/hello-a:probe-root" 2>&1 | head -50
```

Or whatever the actual headless-invocation flag is for your `claude` version. If `claude --help` doesn't show a way to invoke a plugin command non-interactively, mark CU #6 as "headless not supported" — that downgrades smoke-test.sh to a manual checklist.

### Step 5: CU #7 — Jina HTTP MCP + `${JINA_API_KEY}` env interpolation (5 min)

This is the new test that decides whether plugins can ship Jina config out of the box (clean UX) or require user-level Jina setup (degraded UX).

**Prereq**: you have `JINA_API_KEY` set in your shell. Verify:
```bash
echo "${JINA_API_KEY:0:10}..."   # first 10 chars to confirm it's set
```
If empty, get a key from https://jina.ai/ first and `export JINA_API_KEY=jina_...` in your shell rc.

**Reinstall hello-a** so the updated `.mcp.json` (now declaring `jina-ai`) takes effect:

```
/plugin uninstall hello-a
/plugin install hello-a@spike-form-a
/reload-plugins
```

**Expected `/mcp` listing**: a new entry like `plugin:hello-a:jina-ai · ✓ connected · 4 tools` alongside the playwright entry.

**Run the probe**:

```
/hello-a:probe-jina
```

It will:
1. ToolSearch for "jina" and report the tool name format (clean `mcp__jina-ai__*` vs namespaced `mcp__plugin_hello-a_jina-ai__*`)
2. If tools are found, do a live `search_web "hello world"` to confirm `${JINA_API_KEY}` actually got interpolated into a valid Authorization header

**Verdict to fill into `phase0-findings.md`**:
- ✅ Tools found + live search returns results → env interpolation works, plugin can ship its own Jina config
- ❌ Tools missing or auth error → env interpolation does NOT work in `.mcp.json` headers; plan changes to "user must add Jina to user-level `.mcp.json`"

---

## Filling in `phase0-findings.md`

Open `phase0-findings.md` (template provided alongside this README) and fill each row as you go. **The transformer (Phase 0.5) reads from this file** — its `browserToolMap` table comes directly from CU #4's tool list, and its emit-strategy for `${CLAUDE_PLUGIN_ROOT}` depends on CU #1's per-context results.

When all 7 CUs have a PASS / FAIL / NEEDS-FALLBACK verdict and the file is committed, you're cleared to start Phase 0.5.

---

## Cleanup (after spike done)

```
/plugin uninstall hello-a
/plugin uninstall hello-b
/plugin uninstall hello-c1
/plugin uninstall hello-c2
/plugin marketplace remove spike-form-a
/plugin marketplace remove spike-form-b
/plugin marketplace remove spike-form-c
```

Keep the `analyst-plugins-spike/` directory committed as a baseline — `hello-plugin/` is referenced in the plan as the "regression baseline" for any future plugin-system uncertainty.
