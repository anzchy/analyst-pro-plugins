# Phase 0 Findings — AnalystPro Claude Code Plugins

> Fill this in as you run the spike (see `README.md`). Phase 0.5 (transformer) reads from this file.

**Date run**: 2026-05-05 (form A by user; form B/C prep + CU #4 by Claude)
**Claude Code version**: _user to fill_
**Node version**: _user to fill (probe ran on user's node)_
**Platform**: macOS Apple Silicon (probe machine)
**Playwright MCP version probed**: `@playwright/mcp@1.60.0-alpha-1777669338000`

---

## CU #1 — `${CLAUDE_PLUGIN_ROOT}` resolution (form A) ✅ FULL PASS

| Context | Verdict | Notes |
|---|---|---|
| Body `Read` directive | ✅ **PASS** | `Read ${CLAUDE_PLUGIN_ROOT}/knowledge/test.md` resolved correctly, MAGIC_TOKEN retrieved verbatim |
| `$ARGUMENTS` substitution | ✅ **PASS (provisional)** | User passed empty — cannot distinguish "interpolated to empty" vs "literal stripped", but the `$ARGUMENTS` literal did not survive in output. **Needs one re-run with non-empty arg to fully confirm** |
| String interpolation in body prose (3/3 sentences) | ✅ **PASS** | All 3 sentences resolved to absolute paths; transformer can use `${CLAUDE_PLUGIN_ROOT}` in plain prose |

**Observed value of `${CLAUDE_PLUGIN_ROOT}`**: `/Users/jackcheng/Documents/01_Coding/mac-app/analyst-pro/analyst-plugins-spike/form-a-monorepo/hello-a`

**Decision**: ✅ Transformer can use `${CLAUDE_PLUGIN_ROOT}` everywhere we currently plan to (Read directives, knowledge file refs, string composition). The variable resolution is robust.

---

## CU #2 — marketplace.json schema ✅ PASS (with one footnote)

| Form | `/plugin marketplace add` succeeded? | `/plugin install` succeeded? | Errors |
|---|---|---|---|
| A (relative path `"source": "./hello-a"`) | ✅ **YES** | ✅ **YES** | — |
| B (`git-subdir`) | _NOT TESTED — moot since A works_ | — | — |

**Footnote — file:// URL form silently no-ops**: `/plugin marketplace add file:///<absolute-path>` returns "(no content)" — neither succeeds nor errors. Only `./relative-path` form worked. **Plan should document this in user-facing README**: install command must use a path Claude Code's CLI accepts (relative path from cwd, or GitHub source like `anzchy/analyst-pro`), NOT a `file://` URL.

**Decision**: ✅ ship with form A schema. README install instructions use GitHub source for distribution.

---

## CU #3 — `.mcp.json` auto-load ✅ PASS (after npx cache fix)

**Resolved 2026-05-05 run 3**: user ran `rm -rf ~/.npm/_npx/9833c18b2d85bc59` (the wedged ENOTEMPTY directory), reinstalled hello-c1, and `/mcp` now shows:

```
plugin:hello-c1:playwright · ✓ connected · 23 tools
```

H1 (wedged npx cache) was the root cause. Fresh npx install succeeded, MCP server spawned, 23 tools registered — count matches my earlier stdio probe of `@playwright/mcp@1.60` exactly.

**Operational note for plan**: the npx cache wedge can re-occur for any user who has a partial/aborted `npx -y @playwright/mcp@latest` run. Plugin README's troubleshooting section should mention `rm -rf ~/.npm/_npx/<hash>/` (where `<hash>` is whichever directory holds the partial playwright-core install) as the first thing to try if `/mcp` shows `plugin:<name>:playwright · ✗ failed`.

### History (kept for context):
**Re-confirmed 2026-05-05 (run 2)** — same result, even after fresh form-A install:

| Test | Result |
|---|---|
| Plugin install registers `.mcp.json` entry | ✅ **YES** — `/reload-plugins` shows "2 plugin MCP servers" with form A installed |
| `/mcp` shows the entry | ✅ **YES** — listed as `plugin:hello-a:playwright · ✗ failed` |
| `mcp__playwright__*` tools available to commands | ❌ **NO** — `ToolSearch playwright` returns "No matching deferred tools found"; `/hello-a:probe-mcp` Step 1 confirmed no playwright tools available |
| Playwright server process running | ❌ **NO** — `ps -ef \| grep playwright` returns 0 |
| `/reload-plugins` reports load errors | ⚠️ **YES** — "1 error during load" |

**Diagnosis**: `.mcp.json` registration works perfectly. The spawn step (`npx -y @playwright/mcp@latest`) fails silently from inside Claude Code's MCP launcher.

**Possible causes** (untested, ranked by likelihood):
1. Wedged npx cache (`ENOTEMPTY` state observed earlier in `~/.npm/_npx/9833c18b2d85bc59/`)
2. Claude Code's MCP launcher uses minimal PATH not containing user's `npx`
3. `.mcp.json` schema mismatch (would need exact error from `claude --debug`)

**Decision**: CU #3 = **FAIL for auto-load, but plan has fallback already**. The plan's CU #3 fallback row says: "改成在 plugin README 里指导用户手动加 MCP server，UX 退化" — that path is now active. **Phase 0.5 (transformer) is NOT blocked** — it can proceed with the documentation-fallback path. The plugin's `.mcp.json` is shipped (will work for users whose env is healthy); the README documents manual fallback for users whose env doesn't auto-spawn.

**Future**: if user resolves the spawn issue locally (likely just `rm -rf ~/.npm/_npx/9833c18b2d85bc59`), `.mcp.json` auto-load may start working — at which point we get the better UX for free without changing the plan.

---

## CU #4 — Real Playwright MCP tool names ✅ ANSWERED (2026-05-05)

> **Answered without needing the plugin install loop** — Claude probed `@playwright/mcp@1.60.0-alpha-1777669338000` directly via stdio JSON-RPC. Full tool list saved to `scripts/playwright-tools-1.60.json`. Probe script: `scripts/probe-playwright-tools.mjs`.

**23 tools discovered**:

```
mcp__playwright__browser_close
mcp__playwright__browser_resize
mcp__playwright__browser_console_messages
mcp__playwright__browser_handle_dialog
mcp__playwright__browser_evaluate
mcp__playwright__browser_file_upload
mcp__playwright__browser_drop
mcp__playwright__browser_fill_form
mcp__playwright__browser_press_key
mcp__playwright__browser_type
mcp__playwright__browser_navigate
mcp__playwright__browser_navigate_back
mcp__playwright__browser_network_requests
mcp__playwright__browser_network_request
mcp__playwright__browser_run_code_unsafe
mcp__playwright__browser_take_screenshot
mcp__playwright__browser_snapshot
mcp__playwright__browser_click
mcp__playwright__browser_drag
mcp__playwright__browser_hover
mcp__playwright__browser_select_option
mcp__playwright__browser_tabs
mcp__playwright__browser_wait_for
```

### ⚠️ CRITICAL FINDING: AnalystPro browser tools ≠ Playwright MCP browser tools

AnalystPro's existing skill files reference 8 browser tools. **Half of them don't exist in vanilla Playwright MCP** — they were custom-named in AnalystPro's own MCP integration. The transformer's `browserToolMap` cannot be a 1:1 rename — it must encode strategy changes:

| AnalystPro current name | Vanilla Playwright MCP | Action needed |
|---|---|---|
| `browser_navigate` | `mcp__playwright__browser_navigate` | ✅ rename only |
| `browser_click` | `mcp__playwright__browser_click` | ✅ rename only |
| `browser_fill` | `mcp__playwright__browser_fill_form` | ⚠️ rename (different name) |
| `browser_screenshot` | `mcp__playwright__browser_take_screenshot` | ⚠️ rename (different name) |
| `browser_extract_text` | **no equivalent** | ❌ rewrite logic — use `browser_snapshot` (accessibility tree, recommended) or `browser_evaluate` with JS like `document.body.innerText` |
| `browser_extract_links` | **no equivalent** | ❌ rewrite logic — use `browser_snapshot` (sees `<a>` href in tree) or `browser_evaluate` with `[...document.querySelectorAll('a')].map(a=>a.href)` |
| `browser_cookie_import` | **no equivalent** | ❌ Plugin can't import cookies. Options: (a) document manual setup via Playwright's user-data-dir; (b) use `browser_evaluate` to read `document.cookie` (limited — won't access HttpOnly); (c) drop cookie-gated sites from MVP scope |
| `browser_cookie_status` | **no equivalent** | ❌ same as above; plugin commands can probe via `browser_navigate` to a known login-redirect URL and check final URL |

**Implication for the plan**: the transformer's `browserToolMap` was wrong in spirit. Tool names won't auto-translate. Several AnalystPro skill steps need actual logic rewrites, not just regex replace. Plan section "Approach B+" must reflect this.

---

## CU #5 — MCP dedup behavior (form C) ⚠️ PARTIAL ANSWER

| Metric | Value | Note |
|---|---|---|
| Playwright process count from `ps` | 0 | 3 hits seen but all are unrelated `find @playwright` shells (RSS 1-5 KB) |
| `/reload-plugins` MCP server registration count | 2 → 4 (with hello-c1 + hello-c2) | **Both plugin's `.mcp.json` entries WERE registered** |
| `mcp__playwright__*` tools available | 0 in both forms | spawn never succeeded |
| Profile collision warning | not observable | spawn never reached profile-init step |

### CU #5 final answer: **dedup by `command + URL`, automatically**

**Definitive finding (2026-05-05 from `/doctor` after running form A + form C concurrently)**:

```
plugin:hello-c1:playwright [hello-c1]: MCP server "playwright" skipped
  — same command/URL as server provided by plugin "hello-a"
plugin:hello-c2:playwright [hello-c2]: MCP server "playwright" skipped
  — same command/URL as server provided by plugin "hello-a"
```

`/reload-plugins` showed "3 plugin MCP servers" — 2 baseline + 1 effective Playwright (not 3 separate Playwrights). Confirms: **Claude Code dedups MCP servers when their `command + args` config is identical**. Only the first plugin to declare it actually spawns the server; subsequent plugins' identical declarations are skipped with a `/doctor` informational message.

**What this changes for the plan**:
- ✅ All 3 plugins (`analyst-deal`, `analyst-dd`, `analyst-research`) **can safely ship `.mcp.json` declaring Playwright**. Auto-dedup means one process, no OOM/profile risk
- ✅ Each plugin becomes **self-sufficient** — install any one alone and Playwright works. Drops the "must install analyst-deal first" UX wart
- ⚠️ Plugin README adds a footnote: "If `/doctor` shows `playwright skipped — same command/URL` after installing 2+ AnalystPro plugins, that's normal Claude Code dedup behavior, not an error"
- ✅ Conservative-path safety net dropped — better engineering wins

### Tool name format — answered ✅ (option B confirmed)

**2026-05-05 ToolSearch run**: tools exposed as **`mcp__plugin_<plugin-name>_<server-name>__<tool-name>`** (with underscores `_`, not colons `:`).

Example from form-A+C concurrent install: `mcp__plugin_hello-c1_playwright__browser_navigate`.

This means:
- Tool name follows the plugin that **actually spawned** the server (the dedup winner)
- If `analyst-deal` wins dedup (likely first alphabetically in our 3-plugin design), all browser tools are `mcp__plugin_analyst-deal_playwright__*`
- If user uninstalls the dedup winner, election re-runs and tool names CHANGE to follow the new winner — silently breaking all commands that referenced the old prefix

This creates a **hard architectural decision** for the 3-plugin design with shared MCP. See "Architectural decision (Q)" below.

### Architectural decision (Q): only `analyst-deal` declares Playwright

Given the dedup-by-command + namespaced-tool-names interaction, the cleanest approach with 3 plugins is:

- **Only `analyst-deal/.mcp.json`** declares Playwright
- Commands in `analyst-dd` and `analyst-research` that need browser tools have `allowed-tools` referencing `mcp__plugin_analyst-deal_playwright__*`
- README of `analyst-dd` and `analyst-research` says: "Install `analyst-deal` first — it provides Playwright MCP that this plugin uses for browser-based data sources. If you skip `analyst-deal`, browser-using commands will fail with a clear error."
- Plugin manifest in `scripts/plugin-manifest.ts`: only `analyst-deal` has `mcpServers: ['playwright']`
- Other 2 plugins reference the analyst-deal-namespaced tools

Trade-off accepted: cross-plugin dependency. Justified because the 3 plugins ARE a suite — anyone using DD or research workflows in earnest will install deal anyway. Marketplace README will say "install all 3 for full coverage".

**Alternatives considered and rejected**:
- (S) Each plugin's `.mcp.json` uses different `--user-data-dir` args to escape dedup → 3× Playwright instances (~450MB), wasteful
- (R) Drop 3-plugin design, single `analyst-pro` plugin → loses the user's explicit `/analyst-deal:` / `/analyst-dd:` / `/analyst-research:` namespace separation
- (T) Don't ship `.mcp.json` at all, require user-level Playwright config → worst UX

### Bonus regression observed (worth filing as Claude Code bug?)

After `/plugin uninstall hello-a` followed by `/plugin install hello-a@spike-form-a` + `/reload-plugins`:
- Plugin install reports ✓ Installed
- `/reload-plugins` reports plugins counted
- BUT `/hello-a:probe-*` commands return "Unknown command"
- Plugin entries seem stuck in disabled state in `.claude/settings.local.json` despite reinstall

Workaround: not investigated; not blocking the plan. Consider filing as Claude Code issue if reproducible in clean environment.

**Decision for plan**: declare Playwright in **`analyst-deal` only**. The other two plugins' commands assume Playwright is available via `analyst-deal`. README of `analyst-dd` and `analyst-research` says: "Browser-using commands need `analyst-deal` installed (it provides Playwright MCP). If you don't want `analyst-deal`, manually add `.mcp.json` to your project."

This is a **conservative path** that's safe regardless of spawn-issue resolution.

### Spawn-layer dedup — still unknown but doesn't matter

If three `analyst-deal`-only declarations don't help (because there's only one), we never face the dedup-or-not-three-processes question. We sidestep CU #5's ambiguity entirely by structural design. Good engineering.

---

## ⚠️ Diagnostic plan — Playwright MCP spawn failure (CU #3 follow-up)

The whole plan's MCP strategy hinges on getting `npx -y @playwright/mcp@latest` to spawn from a plugin's `.mcp.json`. Currently fails. Three hypotheses, ordered by likelihood:

### H1 (most likely): wedged npx cache

Claude's earlier direct stdio probe of Playwright MCP hit:
```
npm error code ENOTEMPTY
npm error path /Users/jackcheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core
npm error dest /Users/jackcheng/.npm/_npx/9833c18b2d85bc59/node_modules/.playwright-core-U7JsQsj6
```

This is a stuck-rename in the npm `_npx` cache. Claude Code's MCP spawn runs `npx -y @playwright/mcp@latest`, which uses the same cache directory. Until the user clears it, every spawn attempt will fail the same way.

**Fix**:
```bash
rm -rf ~/.npm/_npx/9833c18b2d85bc59
# Optional: also clear all _npx if other packages are wedged
# rm -rf ~/.npm/_npx
```

After cleanup, restart Claude Code, then `/plugin uninstall hello-a` + `/plugin install hello-a@spike-form-a` to retrigger spawn.

### H2: PATH issue in MCP spawn environment

Claude Code may launch MCP servers with a minimal PATH that doesn't include the user's nvm/homebrew node. Test by replacing `.mcp.json` `command: "npx"` with absolute path:

```bash
which npx
# e.g., /Users/jackcheng/.nvm/versions/node/v20.x/bin/npx
```

Then update `analyst-plugins-spike/form-a-monorepo/hello-a/.mcp.json`:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "/Users/jackcheng/.nvm/versions/node/v20.x/bin/npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

(For real plugin distribution, this absolute path won't work for other users — but for diagnosis it isolates whether PATH is the problem.)

### H3: `.mcp.json` schema mismatch

If H1 + H2 both fail, the issue is the `.mcp.json` schema itself. `claude --debug` should show the actual error. Possible: Claude Code expects `type: "stdio"` field, or the args format is different.

### How to diagnose in order

```bash
# Step 1: Find the actual error
claude --debug 2>&1 | grep -i playwright | head -50
# Or: tail -f ~/.claude/logs/* (whatever path it uses)

# Step 2: If H1 is the cause, clean cache:
rm -rf ~/.npm/_npx/9833c18b2d85bc59
# Restart Claude Code, /plugin uninstall hello-a && /plugin install hello-a@spike-form-a

# Step 3: If still failing, try absolute npx path (H2)
which npx                 # capture path
# Edit analyst-plugins-spike/form-a-monorepo/hello-a/.mcp.json with absolute path
# Reinstall plugin

# Step 4: If still failing, paste claude --debug output back to me
```

### Why this affects the transformer

Once spawn works, run `/hello-a:probe-mcp` and check whether tool names in the available tool list are:
- (A) `mcp__playwright__browser_navigate`  — the standard MCP tool name format we assumed
- (B) `mcp__plugin:hello-a:playwright__browser_navigate`  — a namespaced format following the `/mcp` display

If (B), then **`browserToolMap` cannot be simple — tool names become plugin-specific**, and the transformer must inject the running plugin's name into each generated `allowed-tools` field. This is solvable but adds complexity. Need spawn-success to confirm one way or the other.

---

## CU #7 — ⏭ OBSOLETED by CLI pivot (2026-05-05)

User decision: **skip MCP-based Jina entirely; use the official `jina-ai/cli` package via `Bash` tool**. Reasons:

1. Jina CLI is **explicitly designed for AI agents with shell access** (per README: "An agent with shell access needs only `run(command='jina search ...')` instead of managing 20 separate tool definitions")
2. CLI completely sidesteps the MCP namespace / env-interpolation question
3. Plugin commands invoke `jina ...` via `Bash` tool with `--json` flag
4. `JINA_API_KEY` is just a normal shell env var (standard CLI auth, no `.mcp.json` magic)

CU #7's original concern (does `${JINA_API_KEY}` interpolate in `.mcp.json` headers?) is no longer relevant.

### Historical attempt (kept for record)

**Why this mattered before**: project pivoted to Jina-AI as default web access provider (replaces Playwright as primary, leaves Playwright as v0.2 opt-in fallback). Plan needed to know whether plugin can ship its own Jina config (clean UX) or whether user must add Jina to user-level `.mcp.json` (degraded UX).

| Test | Expected | Actual |
|---|---|---|
| `/mcp` shows `plugin:hello-a:jina-ai · ✓ connected · 4 tools` | ✓ connected | _user to fill_ |
| ToolSearch "jina" returns 4 tools | 4 results | _user to fill_ |
| Tool name format | `mcp__plugin_hello-a_jina-ai__read_url` (or similar namespaced) | _user to paste verbatim_ |
| Live `search_web "hello world"` returns results | results | _user to confirm_ |
| If 401 / auth error appears | (not expected if env var supported) | _paste error if any_ |

**Decision tree**:
- ✅ Connected + tools found + live call works → `${JINA_API_KEY}` interpolation works in `.mcp.json` headers. **Plugin ships its own `.mcp.json` declaring jina-ai**. User just sets `JINA_API_KEY` once in shell. Clean UX.
- ❌ Connected but auth fails → env var NOT interpolated; plugin's `.mcp.json` ships unauthenticated server. **Plan changes**: plugin doesn't ship Jina config; README requires user to add Jina to their own `.mcp.json` with hardcoded key. Degraded UX but plan still works.
- ❌ Not connected at all → either env var error OR HTTP MCP type unsupported in plugin context. Need `claude --debug` to diagnose.

**Why this is the LAST Phase 0 unknown**: previous CUs (1-6) covered stdio MCP, command markdown, and marketplace schema. CU #7 covers HTTP MCP type + env var interpolation — both new dimensions introduced when project pivoted to Jina.

---

## CU #6 — `claude` CLI headless plugin invocation

| Test | Result |
|---|---|
| `claude --help` shows non-interactive flag (`-p`, `exec`, etc.)? | _yes/no — paste relevant flag if yes_ |
| `claude -p "/hello-a:probe-root"` (or equivalent) returns probe output? | _PASS / FAIL_ |
| Output time (cold): | _seconds_ |

**Decision**: PASS → smoke-test.sh can be fully automated. FAIL → smoke-test.sh stays as manual checklist (acceptable, plan already accounts for this).

---

## Spike Summary (CU #7 pending Jina test)

| CU | Verdict | Plan needs update? |
|---|---|---|
| 1 | ✅ **FULL PASS** (3 contexts confirmed) | no |
| 2 | ✅ **PASS form A** + footnote (file:// URL silently no-ops) | minor — README install instruction updated |
| 3 | ✅ **PASS** after `rm -rf ~/.npm/_npx/<hash>/` (wedged npx cache was H1) | README troubleshooting section adds npx cache cleanup |
| 4 | ✅ **FULLY captured** (23 Playwright tools, 4 AnalystPro tools have NO equivalent) | **Largely OBSOLETED** by Jina pivot; only Playwright fallback (v0.2 opt-in) needs this |
| 5 | ✅ **answered**: dedup by `command + args`; tool names namespaced; **Q decision = single source of truth plugin** | YES — Q decision applies to whichever MCP server (Playwright historical, Jina now) plugins share |
| 6 | _not tested — optional, smoke-test stays manual_ | no |
| **7** | ⏭ **OBSOLETED** — pivoted to `jina-ai/cli` (Python package, invoked via `Bash` tool). MCP-based approach abandoned | YES — `browserToolMap` 简化为 CLI 命令模板，plugin `.mcp.json` 只剩 Codex |

**Are we cleared to start Phase 0.5 (transformer)?** ✅ **YES** (2026-05-05).

What's changed since project pivoted to **Jina CLI** as default web access:

1. Web access via `jina-ai/cli` Python package, invoked through `Bash` tool. Commands: `jina read URL --json`, `jina search QUERY --json`, `jina search --arxiv QUERY`, `jina pdf URL`, `jina screenshot URL`, `jina bibtex QUERY`. All support `--json` for structured pipe-friendly output.
2. Playwright drops to **v0.2 opt-in fallback** for anti-bot Chinese sites (aiqicha, tianyancha, etc.)
3. `browserToolMap` becomes a small CLI-command template table (~10 lines), not a 4-kind strategy parser
4. Plugin's `.mcp.json` only ships **Codex** (in `analyst-deal` for `codex-polish-report`); `analyst-dd` and `analyst-research` have **no `.mcp.json` at all**
5. **Architectural Decision Q is OBSOLETED** — 3 plugins are fully independent, no `dependsOn` chain
6. `${PREFIX}` templating in transformer is **OBSOLETED** — Bash commands don't need plugin namespace

User-side requirements:
- `pip install jina-cli` (one-time)
- `export JINA_API_KEY=jina_xxx` (one-time)
- `codex login` if using `analyst-deal:codex-polish-report` (analyst-deal only)

Everything else: plugins install + run, no extra setup.

---

## Surprises / unknowns surfaced during spike

> Anything the spike revealed that wasn't in the plan's Critical Unknowns table.

1. **AnalystPro browser tool names ≠ Playwright MCP tool names** (HIGH severity). 4 of the 8 tools the AnalystPro skills currently use have **no equivalent at all** in vanilla Playwright MCP. This means the plugin commands need actual logic rewrites for "extract text/links" and "cookie status/import" steps — not just renames. **Action**: update Approach B+ section in plan, expand `translation-rules.ts` design to cover strategy substitution (snapshot or evaluate) instead of pure renaming. Affected commands: `deal-analysis`, `industry-research`, `news-scan`, `browse-cn` (the China-data preflight chain). `tech-dd`, `memo`, `enrich-report`, `interview-notes-enricher` are unaffected (no browser tools).
2. **Cookie-gated Chinese data sources lose a capability**. The original `browse-cn` chain relied on `browser_cookie_status` to detect when a site needed login. Without it, plugin commands can't elegantly handle cookie-gated sites like `aiqicha.baidu.com`. Workarounds: navigate + check redirect URL, navigate + look for login keywords in `browser_snapshot`, or scope-out cookie-gated sites from MVP and document them as "manual lookup" steps.
3. **`browser_run_code_unsafe` exists** in Playwright MCP but is documented as "RCE-equivalent". The plan should NOT use it. Plugin commands should use `browser_evaluate` (safer scoped JS eval) for any logic that needs in-page execution.
4. **`browser_snapshot` is recommended over `browser_take_screenshot`** by Playwright MCP itself ("better than screenshot" per tool description). It returns an accessibility tree which is text-friendly and AI-readable. The transformer should default to `browser_snapshot` everywhere AnalystPro currently uses screenshot — except where the user genuinely needs an image (rare in investment workflows).
