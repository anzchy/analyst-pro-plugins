# analyst-deal

VC deal-flow workflows for Claude Code: project triage, IC memo synthesis, market intel scanning, Codex-powered report polish. Generated from the [AnalystPro](https://github.com/anzchy/analyst-pro) deal-analyst + market-intel agents.

| Command | Purpose |
|---|---|
| `/analyst-deal:deal-analysis [公司名]` | Phase 1 basic-info report + Phase 1.5 DD prep (checklist + question list) for a target company. Includes Chinese market data preflight (融资记录, 微信舆情, 工商, 招聘, 上市数据). |
| `/analyst-deal:memo [公司名]` | Synthesize an IC memo draft from accumulated evidence (requires prior `deal-analysis` run). |
| `/analyst-deal:codex-polish-report [公司名]` | Polish an existing deal-DD report through OpenAI Codex (GPT-5) for clarity and professional tone. |
| `/analyst-deal:news-scan [赛道]` | Daily / weekly market intel scan, scoped by sector or VC firm. |
| `/analyst-deal:portfolio-tracking [公司名] [季度]` | Generate quarterly post-investment tracking report. Orchestrates two sub-agents: `financial-analyzer` (extracts 三表 + ratios from 合并报表) and `competitor-enricher` (parallel jina research per competitor). |

## Install

```
/plugin marketplace add anzchy/analyst-pro-plugins
/plugin install analyst-deal@analyst-pro-marketplace
/reload-plugins
```

## Setup (one-time)

### Required: Jina AI CLI

All five commands use [`jina-ai/cli`](https://github.com/jina-ai/cli) for web search and content extraction (the new `portfolio-tracking` command also delegates to two sub-agents that follow the same jina-only policy). Install once:

```bash
pip install jina-cli
# or: uv pip install jina-cli

# Get an API key at https://jina.ai/?sui=apikey (free tier: 1M tokens/month)
export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx

# Persist across shell sessions
echo 'export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx' >> ~/.zshrc
```

**Critical**: launch Claude Code from a shell where `JINA_API_KEY` is already exported — Claude Code only inherits env vars at launch.

### Optional: Codex CLI (for `codex-polish-report` only)

Skip this if you don't need the polish command.

```bash
npm install -g @openai/codex
codex login        # follows browser-based OAuth with your ChatGPT Plus/Pro account
```

After install, restart Claude Code and verify with `/mcp` — you should see `plugin:analyst-deal:codex · ✓ connected · 2 tools`.

## Usage

### `/analyst-deal:deal-analysis [公司名]`

Project triage → Phase 1 basic-info report → Phase 1.5 DD prep package.

```
/analyst-deal:deal-analysis 寒武纪
```

The command will:

1. Run preflight (Jina available + cwd writable + workspace check).
2. Ask if it should create `./workspace/` if missing (recommended: yes).
3. Run Chinese market data preflight using Jina across multiple data tiers (see `${CLAUDE_PLUGIN_ROOT}/knowledge/cn-data-sources.md` for the 4-level fallback chain).
4. Write Phase 1 basic-info report to `./workspace/state/deals/processing/<slug>/<DATE>_<slug>_basic_info.md`.
5. Append a YAML scorecard with 6-dimension scoring (team / market / tech / business / 国产替代 / 估值合理性) and hard-stop checks.
6. Present a HITL gate: Continue to Phase 1.5 DD prep / Hold / Reject.
7. If Continue: write `dd_checklist.md` + `dd_questions.md` to the same directory and present a Gate 2 (Send to founder / Edit then send / Skip founder meeting).

Real example output: scoring rubric finds Cambricon 70/100 with hard-stop #6 triggered (thesis mismatch — listed company, not VC investable). User can override Continue to proceed to DD prep anyway.

### `/analyst-deal:memo [公司名]`

Synthesizes an IC memo from accumulated evidence.

```
/analyst-deal:memo 寒武纪
```

Requires that `./workspace/state/deals/<slug>/evidence.md` exists (built up during `deal-analysis` runs). Hard-fails with a clear error if evidence is missing.

Output: `./workspace/state/deals/<slug>/<DATE>_<slug>_ic_memo_draft.md`.

### `/analyst-deal:codex-polish-report [公司名]`

Polishes an existing deal-DD report through Codex (GPT-5).

```
/analyst-deal:codex-polish-report 寒武纪
```

Requires `codex login` to have run successfully. The command checks for `mcp__plugin_analyst-deal_codex__codex` tool availability at preflight; hard-fails with a clear "Run codex login then restart Claude Code" message if missing.

### `/analyst-deal:news-scan [赛道]`

Scans market intel for a sector. Optional argument; defaults to all-sector daily scan.

```
/analyst-deal:news-scan                    # daily multi-sector
/analyst-deal:news-scan 半导体              # semiconductor only
/analyst-deal:news-scan vc                 # VC firm activity
/analyst-deal:news-scan policy             # regulatory updates
```

Output: per-sector intel briefing markdown at `./workspace/state/intel/<DATE>-news-scan.md`.

### `/analyst-deal:portfolio-tracking [公司名] [季度]`

Generates a quarterly post-investment tracking report following the field-tested 5-section format (项目概况 / 股权变更 / 业务发展 / 行业发展 / 小结).

```
/analyst-deal:portfolio-tracking 矽昌通信 2025Q4
```

Architecture: the main command orchestrates two specialist sub-agents:

- **`financial-analyzer`** — extracts 资产负债表 / 利润表 / 现金流量表 from one or more 合并报表 PDFs/xlsx, normalizes to 万元, computes 5 ratios (毛利率 / 销售费用率 / 管理费用率 / 研发费用率 / 财务费用率), writes the financial section. **Numbers are extracted, not generated** — the agent is forbidden from inventing or rounding outside the rules in `knowledge/financial_ratios.md`.
- **`competitor-enricher`** — researches one competitor via Jina (≤8 calls budget per company), produces a structured card (股权结构 / 产品方向 / 融资进展 / Evidence URLs) matching `knowledge/competitor_card_schema.md`. Multiple instances dispatched in parallel for the competitor list.

First-time setup per company writes `project_baseline.yml` (one-time investment terms) and `competitors.yml` (editable competitor list). Subsequent quarterly runs reuse both files; user can edit competitors in-flight via AskUserQuestion.

Required inputs:
- 合并报表 PDF/xlsx (current period; optional 1-3 历史 periods for year-over-year)
- Optional: previous tracking report (auto-inherits Section 二 historical equity changes), board materials, interview notes, news clippings

**Default input directory**: `./workspace/state/portfolio/<slug>/`. The command auto-scans this directory at Step 3 for filename patterns matching each material type (`*合并报表*.pdf` / `*财务报表*.pdf` / `*投后跟进报告*.md` / `*董事会*.md` / `*访谈*.md` / `*新闻*.md` etc.) and presents the auto-detected paths via `AskUserQuestion` with two options: **A) Use auto-detected (recommended)** or **B) Override with custom paths**. Drop your quarterly materials into that directory before running and you skip all path-typing.

Output: `./workspace/state/portfolio/<slug>/<YYYYQX>_post_investment_tracking.md`.

**Hard guarantees**:
- Financial numbers traceable to specific 合并报表 line items; gaps shown as `—` and listed in 数据缺口 section
- Competitor data points all carry source URLs; conflicts between sources are listed side-by-side
- 主上下文 token 用量峰值控制在 ≤ 30k（sub-agents 隔离了 jina raw scrape）

See [`docs/designs/issue-01-portfolio-tracking.md`](../docs/designs/issue-01-portfolio-tracking.md) for the full design doc.

## Troubleshooting

### Preflight fails with "本命令需要 jina-cli + JINA_API_KEY"

`jina` not on PATH or `JINA_API_KEY` unset in Claude Code's process env.

Fix:
```bash
which jina                       # if empty: pip install jina-cli
echo "${JINA_API_KEY:0:10}..."   # if empty: export JINA_API_KEY=jina_xxxxxx
```
Then **fully restart Claude Code** (not just `/reload-plugins`).

### `/mcp` shows `plugin:analyst-deal:codex · ✗ failed`

Codex CLI not installed or not authenticated. Run `npm install -g @openai/codex && codex login`, then `/plugin uninstall analyst-deal && /plugin install analyst-deal@analyst-pro-marketplace && /reload-plugins`.

If the failure persists, check `~/.npm/_npx/<hash>/` for stuck npm cache entries and clear them: `rm -rf ~/.npm/_npx`.

### Anti-bot Chinese site (aiqicha, tianyancha, etc.) returns empty

Expected behavior — the command escalates to **Level 3 HITL** and asks you to manually paste the page content. See `${CLAUDE_PLUGIN_ROOT}/knowledge/cn-data-sources.md` for the full fallback chain.

### `/analyst-deal:memo` fails with "needs prior evidence"

You haven't run `deal-analysis` first for that company. The memo command synthesizes from accumulated evidence; it doesn't research from scratch.

```
/analyst-deal:deal-analysis 公司名     # build up evidence first
/analyst-deal:memo 公司名              # then synthesize
```

## Output locations

All commands write to `./workspace/state/...` relative to your current working directory:

```
./workspace/state/deals/
├── processing/<slug>/                  ← deal-analysis, memo
│   ├── <DATE>_<slug>_basic_info.md
│   ├── <DATE>_<slug>_dd_checklist.md
│   ├── <DATE>_<slug>_dd_questions.md
│   ├── evidence.md                      (accumulated; consumed by memo)
│   └── <DATE>_<slug>_ic_memo_draft.md
├── archived/                            (deals that progressed past Phase 2)
└── rejected/                            (deals declined at HITL gates)
./workspace/state/intel/                 ← news-scan
└── <DATE>-news-scan.md
./workspace/state/portfolio/<slug>/      ← portfolio-tracking
├── project_baseline.yml                 (one-time investment terms; reused each quarter)
├── competitors.yml                      (editable competitor list; reused each quarter)
└── <YYYYQX>_post_investment_tracking.md (one report per quarter)
```

## See also

- [Top-level marketplace README](../README.md) — repo overview, install all 3 plugins
- [AnalystPro User Guide](../docs/guide/analyst-pro-user-guide.md) — comprehensive usage guide for all plugins
- [PLAN.md](../docs/PLAN.md) — design rationale and architecture
