# analyst-deal

VC deal-flow workflows for Claude Code: project triage, IC memo synthesis, market intel scanning, Codex-powered report polish. Generated from the [AnalystPro](https://github.com/anzchy/analyst-pro) deal-analyst + market-intel agents.

| Command | Purpose |
|---|---|
| `/analyst-deal:deal-analysis [公司名]` | Phase 1 basic-info report + Phase 1.5 DD prep (checklist + question list) for a target company. Includes Chinese market data preflight (融资记录, 微信舆情, 工商, 招聘, 上市数据). |
| `/analyst-deal:memo [公司名]` | Synthesize an IC memo draft from accumulated evidence (requires prior `deal-analysis` run). |
| `/analyst-deal:codex-polish-report [公司名]` | Polish an existing deal-DD report through OpenAI Codex (GPT-5) for clarity and professional tone. |
| `/analyst-deal:news-scan [赛道]` | Daily / weekly market intel scan, scoped by sector or VC firm. |

## Install

```
/plugin marketplace add anzchy/analyst-pro-plugins
/plugin install analyst-deal@analyst-pro-marketplace
/reload-plugins
```

## Setup (one-time)

### Required: Jina AI CLI

All four commands use [`jina-ai/cli`](https://github.com/jina-ai/cli) for web search and content extraction. Install once:

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

All commands write to `./workspace/state/deals/...` relative to your current working directory:

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
```

## See also

- [Top-level marketplace README](../README.md) — repo overview, install all 3 plugins
- [USAGE.md](../docs/guide/USAGE.md) — comprehensive usage guide for all plugins
- [PLAN.md](../docs/PLAN.md) — design rationale and architecture
