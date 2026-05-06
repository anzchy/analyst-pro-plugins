# AnalystPro Plugins — Usage Guide

Comprehensive guide for both **end users** (install + use the plugins in Claude Code) and **maintainers** (publish to GitHub, update versions, accept contributions).

> If you're an end user who just wants to use the plugins, jump straight to [Quick Start](#quick-start).
> If you're a maintainer / publisher, read [Repo Strategy](#repo-strategy-1-repo-vs-3) first.

---

## Table of Contents

- [What these plugins do](#what-these-plugins-do)
- [Quick Start (end users)](#quick-start)
- [Repo strategy: 1 GitHub repo vs 3](#repo-strategy-1-repo-vs-3)
- [Publishing to GitHub (maintainer)](#publishing-to-github)
- [End-user installation walkthrough](#end-user-installation-walkthrough)
- [Per-command usage examples](#per-command-usage-examples)
- [Updating plugins](#updating-plugins)
- [Uninstalling plugins](#uninstalling-plugins)
- [Troubleshooting](#troubleshooting)
- [Architecture & design](#architecture--design)
- [Contributing](#contributing)

---

## What these plugins do

Three independent Claude Code plugins for VC investment workflows. Each plugin's commands appear with its own slash-prefix in Claude Code's command palette:

| Plugin                 | Commands                                                                                                                                                | Typical use                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **`analyst-deal`**     | `/analyst-deal:deal-analysis`, `/analyst-deal:memo`, `/analyst-deal:codex-polish-report`, `/analyst-deal:news-scan`, `/analyst-deal:portfolio-tracking` | Project triage → analysis → IC memo synthesis, market intel scanning, quarterly post-investment tracking |
| **`analyst-dd`**       | `/analyst-dd:tech-dd`, `/analyst-dd:interview-notes-enricher`                                                                                           | Hard-tech due diligence + interview-notes synthesis                                                      |
| **`analyst-research`** | `/analyst-research:industry-research`, `/analyst-research:enrich-report`                                                                                | Industry research + report enrichment from interview notes                                               |

All three use [Jina AI CLI](https://github.com/jina-ai/cli) for web search and content extraction (no Playwright headache, no Chromium download). One plugin (`analyst-deal`) additionally uses [Codex MCP](https://github.com/openai/codex) for the `codex-polish-report` command.

---

## Quick Start

If you just want to install and use one plugin (skip the design context):

```
# 1. Add the marketplace once
/plugin marketplace add anzchy/analyst-pro-plugins

# 2. Install whichever plugins you need
/plugin install analyst-deal@analyst-pro-marketplace
/plugin install analyst-dd@analyst-pro-marketplace
/plugin install analyst-research@analyst-pro-marketplace

# 3. Reload
/reload-plugins
```

Then in your shell (one-time setup):

```bash
# Required: install Jina CLI + set API key
pip install jina-cli   # or: uv pip install jina-cli
export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx
echo 'export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx' >> ~/.zshrc   # persist

# Optional (only for analyst-deal:codex-polish-report)
npm install -g @openai/codex
codex login
```

Restart Claude Code (so it picks up the new env var). Then use:

```
/analyst-deal:deal-analysis 某半导体公司
/analyst-deal:portfolio-tracking 某被投公司 2026Q1
/analyst-dd:tech-dd 某半导体公司
/analyst-research:industry-research 半导体先进封装
```

---

## Repo strategy: 1 repo vs 3

**Decision: 1 GitHub repo (********`anzchy/analyst-pro-plugins`********\*\*\*\*) hosts all 3 plugins as subdirectories.**

### Why 1 repo (recommended)

The Anthropic plugin spec supports a single `marketplace.json` listing multiple plugins, each pointing to a subdirectory via relative path. Phase 0 spike form-A confirmed this works:

```json
{
  "name": "analyst-pro-marketplace",
  "owner": { "name": "anzchy" },
  "plugins": [
    { "name": "analyst-deal", "version": "0.0.2", "source": "./analyst-deal", ... },
    { "name": "analyst-dd", "version": "0.0.1", "source": "./analyst-dd", ... },
    { "name": "analyst-research", "version": "0.0.1", "source": "./analyst-research", ... }
  ]
}
```

End users:

- Add **one** marketplace: `/plugin marketplace add anzchy/analyst-pro-plugins`
- Install **selectively** from that marketplace: `/plugin install analyst-deal@analyst-pro-marketplace`
- Update **once** for all plugins: `/plugin marketplace update analyst-pro-marketplace` then re-install

Maintainers:

- One repo to push, tag, version, open issues against
- Coordinated release of related plugins (e.g., shared knowledge file updates land together)
- Single CI pipeline runs the transformer + tests across all plugins

### Why NOT 3 separate repos

Considered alternative: `anzchy/analyst-deal-plugin`, `anzchy/analyst-dd-plugin`, `anzchy/analyst-research-plugin`.

Tradeoffs that made us reject this:

| Aspect                   | 3-repo                              | 1-repo          |
| ------------------------ | ----------------------------------- | --------------- |
| User adds N marketplaces | 3                                   | 1               |
| Coordinated release      | Hard (3 separate tags)              | Easy (1 commit) |
| Shared transformer       | Needs duplication or cross-repo dep | Same dir        |
| Issue tracking           | Fragmented across 3 repos           | Single tracker  |
| Knowledge file dedup     | Hard                                | Trivial         |
| Discoverability          | 3 repos = harder to GitHub-search   | Easier          |

The only argument for 3 repos was "users only want one plugin and don't want the others' weight" — but in 1-repo mode, \*\*only the requested plugin's files are pulled into the user's \*\***`~/.claude/plugins/`** during install. The other plugin directories sit unused in the marketplace clone but cost nothing at runtime. Marketplace clone itself is \~few MB, not a real concern.

### When you might split later (v0.2+)

Three triggers would justify splitting:

1. **Different release cadence** — if `analyst-deal` ships every week and `analyst-research` ships every quarter, the noise of unrelated tags on each repo's release feed becomes painful.
2. **Different ownership** — if `analyst-research` gets co-maintained by a different team that wants their own GitHub access boundary.
3. **License divergence** — if `analyst-dd`'s knowledge files end up needing a stricter license than the others.

None of these apply now. Stay single until they do.

---

## Publishing to GitHub

Step-by-step for the maintainer publishing for the first time, or pushing a new version.

### First publish (one-time setup)

```bash
cd /path/to/analyst-pro-plugins

# 1. Run the transformer + tests to confirm a clean build
npm install
npm test                                # 47 vitest tests should pass
npm run build:plugins                   # generates all 8 commands + 15 knowledge files

# 2. Verify nothing is uncommitted
git status                              # should be clean (or only .DS_Store etc.)

# 3. Create the GitHub repo (if not already)
gh repo create anzchy/analyst-pro-plugins --public \
  --description "AnalystPro Claude Code plugin marketplace: deal-flow, due-diligence, and research workflows for VC investors" \
  --source=. \
  --push

# 4. Tag the first release
git tag analyst-pro-plugins-v0.0.1
git push --tags

# 5. (optional) Create a GitHub Release with notes
gh release create analyst-pro-plugins-v0.0.1 \
  --title "v0.0.1 — initial scaffold" \
  --notes "First public release. Three plugins generated by the transformer from AnalystPro source."
```

### Subsequent publishes (push an update)

```bash
# 1. Make changes to AnalystPro source files (the SKILL.md or agent .ts you want to update)
#    OR edit translation-rules.ts / plugin-manifest.ts directly.

# 2. Regenerate the plugins
npm run build:plugins

# 3. Verify what changed
git diff analyst-deal/ analyst-dd/ analyst-research/

# 4. Bump version in the affected plugin's plugin.json AND in marketplace.json
#    (semver: patch for prompt tweaks, minor for new commands, major for breaking changes)

# 5. Commit + tag + push
git add -A
git commit -m "feat(analyst-deal): improve deal-analysis Step 2 China sources"
git tag analyst-pro-plugins-v0.0.2
git push --tags
```

### What end users do after you publish an update

Their installed plugins do **not** auto-update. They manually run:

```
/plugin marketplace update analyst-pro-marketplace
/plugin install analyst-deal@analyst-pro-marketplace   # re-install latest
/reload-plugins
```

(See [Updating plugins](#updating-plugins) below for a clean walkthrough.)

---

## End-user installation walkthrough

A complete first-time installation, from "I just heard about this" to "the commands work in my terminal".

### Step 1: Add the marketplace

In Claude Code:

```
/plugin marketplace add anzchy/analyst-pro-plugins
```

You should see: `Successfully added marketplace: analyst-pro-marketplace`.

> ⚠️ Note on URL forms:
>
> - **Works**: `anzchy/analyst-pro-plugins` (GitHub shorthand) or `./relative/path` (local dev)
> - **Does NOT work**: `file:///absolute/path/...` (silently no-ops in current Claude Code)

### Step 2: Pick which plugins to install

You don't have to install all three. Install just what you need:

```
# Most users: all three
/plugin install analyst-deal@analyst-pro-marketplace
/plugin install analyst-dd@analyst-pro-marketplace
/plugin install analyst-research@analyst-pro-marketplace

# OR: only deal-flow
/plugin install analyst-deal@analyst-pro-marketplace

# OR: only research workflows
/plugin install analyst-research@analyst-pro-marketplace
```

Each install reports `✓ Installed <name>. Run /reload-plugins to apply.`

### Step 3: Reload

```
/reload-plugins
```

Output should show the plugins counted in `<N> plugin MCP servers · <N> plugin LSP server` (analyst-deal contributes 1 plugin MCP server: Codex).

### Step 4: Set up Jina CLI

All three plugins use [Jina AI CLI](https://github.com/jina-ai/cli) for web search and content extraction. Install it once:

```bash
# In your shell (NOT inside Claude Code)
pip install jina-cli
# or with uv
uv pip install jina-cli

# Get an API key at https://jina.ai/?sui=apikey (free tier: 1M tokens/month)
export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx

# Persist across shell sessions
echo 'export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx' >> ~/.zshrc
source ~/.zshrc

# Verify
which jina && echo "${JINA_API_KEY:0:10}..."
# Expected: /path/to/jina followed by jina_xxxxxx...
```

### Step 5: (optional) Set up Codex CLI

Only if you plan to use `/analyst-deal:codex-polish-report`:

```bash
npm install -g @openai/codex
codex login
# follows browser-based OAuth flow with your ChatGPT Plus/Pro account
```

### Step 6: Restart Claude Code

**This is mandatory** — Claude Code only inherits env vars from the shell at launch. Quit and re-open Claude Code (or `cmd+q`/`cmd+w` on Mac, then re-launch from the same terminal where `JINA_API_KEY` is exported).

### Step 7: Verify

```
/mcp
```

You should see (relevant lines):

- `plugin:analyst-deal:codex · ✓ connected · 2 tools` (only if you installed analyst-deal AND ran `codex login`)

If `codex` shows `✗ failed`, see [Troubleshooting](#troubleshooting).

```
/analyst-deal:deal-analysis 测试公司
```

You should see the command execute its Failure Mode Preflight (which checks `which jina` and `$JINA_API_KEY`), then proceed.

If preflight fails, follow the error message — it tells you exactly what's missing.

---

## Per-command usage examples

### `/analyst-deal:deal-analysis [公司名]`

Project triage with Chinese market data preflight (融资记录, 微信舆情, 工商信息, 招聘信号, 上市数据).

```
/analyst-deal:deal-analysis 寒武纪
```

Output: a structured basic-info report at `./workspace/state/deals/processing/han-wu-ji/YYYYMMDD_han-wu-ji_basic_info.md`, with a Phase 1 scorecard appended.

If `./workspace/` doesn't exist, the command asks you to create it (or specify another path, or skip workspace mode).

### `/analyst-deal:memo [公司名]`

Synthesizes IC memo draft from accumulated evidence.

```
/analyst-deal:memo 寒武纪
```

Requires a prior `deal-analysis` run on the same company (it reads `./workspace/state/<slug>/evidence.md`). Hard-fails if evidence is missing.

### `/analyst-deal:codex-polish-report [公司名]`

Polishes an existing deal-DD report through Codex (GPT-5) for clarity and professional tone.

```
/analyst-deal:codex-polish-report 寒武纪
```

Requires `codex login` to have run successfully. Hard-fails with a clear message if Codex MCP isn't available.

### `/analyst-deal:news-scan [赛道]`

Scans market intel for a sector. Optional argument; defaults to all-sector daily scan.

```
/analyst-deal:news-scan                    # daily multi-sector
/analyst-deal:news-scan 半导体              # semiconductor only
/analyst-deal:news-scan vc                 # VC firm activity
/analyst-deal:news-scan policy             # regulatory updates
```

Output: per-sector intel briefing markdown at `./workspace/state/intel/YYYYMMDD-news-scan.md`.

### `/analyst-deal:portfolio-tracking [公司名] [季度]`

Quarterly post-investment tracking report following the field-tested 5-section format (项目概况 / 股权变更 / 业务发展 / 行业发展 / 小结). Added in `analyst-deal` v0.0.2 (issue [#1](https://github.com/anzchy/analyst-pro-plugins/issues/1)).

```
/analyst-deal:portfolio-tracking 矽昌通信 2026Q1
```

**Architecture**: the main command orchestrates 5 sections, dispatching two specialist sub-agents (the first agents to ship in this marketplace):

- **`financial-analyzer`** — extracts 资产负债表 / 利润表 / 现金流量表 from one or more 合并报表 PDF/xlsx files, normalizes 元 → 万元 via constant `10000`, computes 5 financial ratios (毛利率 / 销售费用率 / 管理费用率 / 研发费用率 / 财务费用率) per the formulas in `knowledge/financial_ratios.md`. **Numbers are extracted, not generated**: every number is traceable to a specific 合并报表 line; gaps render as `—` and surface in a 数据缺口 section. Output capped at ≤ 2,500 tokens; includes an Evidence Ledger appendix for audit.
- **`competitor-enricher`** — researches one competitor via Jina (≤ 8 calls budget per company), produces a structured card matching `knowledge/competitor_card_schema.md` (股权结构 / 产品方向 / 融资进展 / Evidence URLs). Multiple instances dispatched in parallel for the competitor list. Output capped at ≤ 800 tokens. Tools restricted to `Bash, Read, Glob` (no `WebFetch`) to honor the plugin's jina-only web policy.

**Default input directory**: `./workspace/state/portfolio/<slug>/`. Step 3 auto-scans this directory for filename patterns matching each material type (`*合并报表*.pdf` / `*财务报表*.pdf` / `*投后跟进报告*.{md,pdf,docx}` / `*董事会*.md` / `*访谈*.md` / `*新闻*.md` etc.) and presents them via `AskUserQuestion` with two options:

- **A) Use auto-detected paths (recommended)** — zero typing if you've dropped quarterly materials into the project directory
- **B) Override with custom paths** — for materials still in `~/Downloads/` or scattered locations

If A is chosen but no 合并报表 was discovered, the command refuses A (合并报表 is required) and asks you to either drop the file in or fall back to B.

**Per-company persistent state files** reused across quarters:

- `./workspace/state/portfolio/<slug>/project_baseline.yml` — one-time investment terms (基金主体 / 投资协议日期 / 投前估值 / 投资金额 / 持股比例 / 投资完成时点股权结构表). First run prompts; subsequent runs reuse without asking.
- `./workspace/state/portfolio/<slug>/competitors.yml` — editable competitor list. Step 2 lets you add/remove/reorder before the parallel dispatch.

**Hard guarantees**:

- Financial numbers traceable to specific 合并报表 line items; gaps shown as `—` and listed in 数据缺口
- Every competitor data point carries a source URL; conflicts between sources are listed side-by-side
- Prompt-injection guards in parent + both agents: external content (PDFs, prior reports, fetched competitor pages) is treated as untrusted data, never instructions
- 主上下文 token 用量峰值控制在 ≤ 30k tokens (sub-agents isolate raw scrape from main context)

Output: `./workspace/state/portfolio/<slug>/<YYYYQX>_post_investment_tracking.md`.

See [`docs/designs/issue-01-portfolio-tracking.md`](../designs/issue-01-portfolio-tracking.md) for the full design doc with premises (P1–P6), architecture rationale, and locked decisions.

### `/analyst-dd:tech-dd [公司名]`

Hard-tech due diligence — paper/patent search, technical feasibility checklist, expert-interview support, contradiction marking, export-control screening.

```
/analyst-dd:tech-dd 寒武纪
```

Output: annotated DD report at `./workspace/state/deals/techdd/han-wu-ji/`.

Sectors covered: semiconductor (fab/fabless/EDA), advanced packaging, nuclear fusion, new materials, reusable rockets / space tech.

### `/analyst-dd:interview-notes-enricher [interviewee?]`

Incrementally syncs raw per-person interview transcripts into a consolidated curated Q\&A memo. Strictly additive — preserves existing Q\&A, adds only missing items, keeps transcript wording verbatim. Trigger when you ask to 整理 / 补充 / 扩写 / 继续 / 更新 访谈纪要.

```
/analyst-dd:interview-notes-enricher                # batch mode (rare default)
/analyst-dd:interview-notes-enricher 张三           # only sync interviewee 张三
```

Step 0 auto-detects the consolidated memo file and transcript files in `cwd` (`*纪要*final*.md` / `*memo*.md` / `*访谈*.md` / `*交流*.md`) and presents `AskUserQuestion` with:

- **A) Use auto-detected paths (recommended)**
- **B) Override with custom paths** — for project layouts that don't match the default patterns

Generalized in v0.1.0 (TODO-1) — was previously hardcoded to one project. Now project-agnostic.

### `/analyst-research:industry-research [行业]`

Industry deep-research with Chinese data source preflight (36kr/huxiu/tmtpost articles, eastmoney research, gov.cn policy, Sogou WeChat search).

```
/analyst-research:industry-research 半导体先进封装
```

Output: structured industry report at `./workspace/state/research/<industry-slug>/<YYYYMMDD>_industry-report.md`.

### `/analyst-research:enrich-report`

Integrates scattered interview notes / field research into an existing base report. Section-by-section, attribution-preserving, never deletes or rewrites original content.

```
/analyst-research:enrich-report
# Then answer the AskUserQuestion prompt with:
#   - interview folder path
#   - base report path
#   - output mode (overwrite | copy)
```

Output: the base report updated in place (or as a `-enriched` copy if you chose `copy` mode).

---

## Updating plugins

When the maintainer pushes an update, end users do:

```
# 1. Refresh marketplace metadata (pulls latest manifest from GitHub)
/plugin marketplace update analyst-pro-marketplace

# 2. Re-install whichever plugins you have to get the new versions
/plugin install analyst-deal@analyst-pro-marketplace
/plugin install analyst-dd@analyst-pro-marketplace
/plugin install analyst-research@analyst-pro-marketplace

# 3. Reload
/reload-plugins
```

Notes:

- Re-install **does NOT touch your ************`./workspace/`************ files**. Reports, evidence, and inbox files are yours.
- The plugin's `~/.claude/plugins/<name>/` directory gets overwritten with the new version.
- If a command's `allowed-tools` field changed, Claude Code may prompt you for permission on first run after update.

To check installed versions:

```
/plugin list
```

---

## Uninstalling plugins

```
# Single plugin
/plugin uninstall analyst-deal

# All three
/plugin uninstall analyst-deal
/plugin uninstall analyst-dd
/plugin uninstall analyst-research

# Optional: remove the marketplace itself
/plugin marketplace remove analyst-pro-marketplace
```

What gets removed:

- Plugin files in `~/.claude/plugins/<name>/`
- Plugin's MCP server entries from your active session

What stays:

- **Your ************`./workspace/`************ directory** — reports, evidence, inboxes
- **`JINA_API_KEY`**\*\* env var\*\* — if you want to fully clean up, also unset it from `~/.zshrc`
- Codex CLI install — also untouched

If you want a totally clean slate:

```bash
# Remove env var
sed -i '' '/JINA_API_KEY/d' ~/.zshrc        # macOS sed
# OR: sed -i '/JINA_API_KEY/d' ~/.zshrc     # Linux sed

# Optional: clean up Jina CLI install
pip uninstall jina-cli

# Remove your workspace artifacts (DESTRUCTIVE — back up first!)
# rm -rf ./workspace/
```

---

## Troubleshooting

### Symptom: `/analyst-deal:deal-analysis` fails preflight with "本命令需要 jina-cli + JINA\_API\_KEY"

**Cause**: One of these:

- `jina` is not on PATH — `which jina` returns empty
- `JINA_API_KEY` is unset in the shell that launched Claude Code
- You set the env var AFTER launching Claude Code (it doesn't pick up shell changes mid-session)

**Fix**:

```bash
which jina                       # if empty, run: pip install jina-cli
echo "${JINA_API_KEY:0:10}..."   # if empty, run: export JINA_API_KEY=jina_xxxxxx
```

Then **fully restart Claude Code** (quit + reopen, not just /reload-plugins).

### Symptom: `/mcp` shows `plugin:analyst-deal:codex · ✗ failed`

**Cause**: Codex CLI not installed or not authenticated.

**Fix**:

```bash
which codex      # if empty: npm install -g @openai/codex
codex login      # follows browser OAuth
```

Then `/plugin uninstall analyst-deal && /plugin install analyst-deal@analyst-pro-marketplace && /reload-plugins`.

### Symptom: `/plugin marketplace add anzchy/analyst-pro-plugins` succeeds but `/plugin install` says "no plugin found"

**Cause**: Marketplace cache is stale.

**Fix**:

```
/plugin marketplace update analyst-pro-marketplace
/plugin install analyst-deal@analyst-pro-marketplace
```

### Symptom: `/plugin marketplace add file:///path/to/repo` does nothing (silent return)

**Cause**: Claude Code's `/plugin marketplace add` does NOT support `file://` URL form (silently no-ops).

**Fix**: For local dev, use a relative path:

```
/plugin marketplace add ./relative/path/to/analyst-pro-plugins
```

For published plugins, use the GitHub shorthand:

```
/plugin marketplace add anzchy/analyst-pro-plugins
```

### Symptom: Jina returns 401 Unauthorized

**Cause**: API key invalid, expired, or rate-limited.

**Fix**:

```bash
# Verify key is set correctly
env | grep JINA_API_KEY

# Test directly
echo "https://example.com" | jina read

# If 401: regenerate key at https://jina.ai/?sui=apikey
```

### Symptom: Plugin installs but `/<plugin>:<command>` returns "Unknown command"

**Cause**: Plugin install state stuck (Claude Code bug observed during Phase 0 spike).

**Fix**:

```
/plugin uninstall <name>
/reload-plugins
/plugin install <name>@analyst-pro-marketplace
/reload-plugins
```

If still stuck, restart Claude Code and try again.

### Symptom: Anti-bot Chinese site (aiqicha, tianyancha) fails

**Cause**: Jina can't bypass cookie-walled login pages.

**This is expected behavior in v0.0.x.** The command will enter HITL mode:

> "目标 URL: [https\://aiqicha.baidu.com/](https://aiqicha.baidu.com/)...
> 此站需登录看股权结构。请你: 在浏览器登录, 打开 URL, 复制内容, 粘贴回来。"

You paste the content. Plugin continues.

v0.2.0 candidate: opt-in Playwright fallback for these sites.

---

## Architecture & design

For deep design rationale, read [`docs/PLAN.md`](../PLAN.md), specifically the `## ✅ Active design (Jina CLI)` section.

Quick summary:

```
analyst-pro-plugins/                         (this repo)
├── .claude-plugin/marketplace.json          (3 plugins, "./<name>" sources)
├── package.json + scripts/                  (transformer in TypeScript)
│   ├── translation-rules.ts                 (rules-as-data: path, web tools, frontmatter)
│   ├── plugin-manifest.ts                   (per-plugin command/agent/knowledge listing)
│   ├── lib/extract-prompt.ts                (extract `prompt:` from agent .ts)
│   ├── lib/apply-rules.ts                   (pure transform functions)
│   ├── build-from-source.ts                 (main entry)
│   └── build-from-source.test.ts            (47 vitest tests)
├── analyst-deal/                            (mostly generated; ships to users)
│   ├── .claude-plugin/plugin.json           (version 0.0.2)
│   ├── .mcp.json                            (codex only)
│   ├── README.md, CLAUDE.md
│   ├── commands/<5 .md files>               (4 transformer-generated + portfolio-tracking hand-written)
│   ├── agents/<2 .md files>                 (financial-analyzer + competitor-enricher; for portfolio-tracking)
│   └── knowledge/<13 .md files>             (10 transformer-generated + 3 hand-written for portfolio-tracking)
├── analyst-dd/                              (generated; interview-notes-enricher hand-written after TODO-1)
│   ├── .claude-plugin/plugin.json           (version 0.0.1)
│   └── ...
└── analyst-research/                        (generated)
    ├── .claude-plugin/plugin.json           (version 0.0.1)
    └── ...
```

Source of truth: `../analyst-pro/electron/skills/<name>/SKILL.md` + `../analyst-pro/electron/agents/definitions/<name>.ts` (the parent AnalystPro Electron app's repo).

The transformer reads from there, applies rules, writes to this repo. Re-run `npm run build:plugins` after upstream AnalystPro changes.

---

## Contributing

Contributions welcome! Workflow:

1. **Identify whether you're changing source or transformer**:
   - Improving a workflow's prompt content → edit the AnalystPro source (`../analyst-pro/electron/skills/<name>/SKILL.md`), then `npm run build:plugins` to regenerate.
   - Improving the transformer itself (new rule, fix existing) → edit `scripts/translation-rules.ts` or `scripts/lib/apply-rules.ts`, add a vitest test.
   - Improving plugin metadata (description, README) → edit the relevant `.claude-plugin/plugin.json` or `README.md` directly.

2. **Run tests + build**:

   ```bash
   npm test                      # 47 unit tests must pass
   npm run build:plugins:check   # dry-run shows what would change
   npm run build:plugins         # actually regenerate
   ```

3. **Verify**: install the affected plugin from your local working copy:

   ```
   /plugin marketplace add ./relative/path/to/analyst-pro-plugins
   /plugin install analyst-deal@analyst-pro-marketplace
   ```

   Test the changed command end-to-end.

4. **Commit + PR**:

   ```bash
   git add -A
   git commit -m "feat(analyst-deal): ..."
   gh pr create
   ```

For larger changes, please open an issue first describing the problem you're solving and proposed approach.

---

## Status

- **Marketplace v0.1.0** (2026-05-05, [released](https://github.com/anzchy/analyst-pro-plugins)) — Phase 1 polish: initial scaffold + transformer + 8 commands generated, 4 manual TODOs closed (TODO-1 generalized `interview-notes-enricher`, TODO-2 distilled `cn-data-sources.md`, TODO-3 expanded per-plugin READMEs, TODO-4 knowledge sensitivity audit verdict READY FOR PUBLIC).
- **`analyst-deal`**** v0.0.2** (2026-05-06, [PR #4](https://github.com/anzchy/analyst-pro-plugins/pull/4) — closes [#1](https://github.com/anzchy/analyst-pro-plugins/issues/1)) — added `/analyst-deal:portfolio-tracking` skill with 2 sub-agents (`financial-analyzer`, `competitor-enricher`) + 3 knowledge files. First sub-agents to ship in this marketplace. Other plugins (`analyst-dd`, `analyst-research`) remain at 0.0.1.
- **v0.2.0 (planned)** — opt-in Playwright fallback for anti-bot Chinese sites; possible npm packaging of the marketplace; possible plugin consolidation to a single plugin if maintenance pain emerges.

Open issues: [#2 — feat: 基于矽睿建议书完善深度分析报告模板](https://github.com/anzchy/analyst-pro-plugins/issues/2) (next deal-analysis template upgrade).

See `docs/PLAN.md` for the complete design doc + Phase 0 spike findings, and `docs/designs/` for per-issue design docs.
