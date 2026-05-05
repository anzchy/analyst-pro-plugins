# AnalystPro Plugin Marketplace

Three Claude Code plugins for VC investment workflows, generated from [AnalystPro](https://github.com/anzchy/analyst-pro)'s internal skills via a transformer:

| Plugin | Commands | Purpose |
|---|---|---|
| **`analyst-deal`** | `deal-analysis`, `memo`, `codex-polish-report`, `news-scan` | Project triage → analysis → IC memo synthesis, market intel scanning |
| **`analyst-dd`** | `tech-dd`, `interview-notes-enricher` | Hard-tech due diligence + interview-notes synthesis |
| **`analyst-research`** | `industry-research`, `enrich-report` | Industry research + report enrichment from interview notes |

All three plugins are **independent** — install any one alone or all three. Each plugin's commands appear with its prefix:

```
/analyst-deal:deal-analysis 公司名
/analyst-dd:tech-dd 公司名
/analyst-research:industry-research 半导体先进封装
```

## Install

```bash
# 1. Add the marketplace to Claude Code
/plugin marketplace add anzchy/analyst-pro-plugins

# 2. Install one or more plugins
/plugin install analyst-deal@analyst-pro-marketplace
/plugin install analyst-dd@analyst-pro-marketplace
/plugin install analyst-research@analyst-pro-marketplace
```

## Setup (one-time)

All plugins use [Jina AI CLI](https://github.com/jina-ai/cli) for web search and content extraction:

```bash
pip install jina-cli
# or: uv pip install jina-cli

export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx
# Get a key at https://jina.ai/?sui=apikey

# Persist across shells:
echo 'export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx' >> ~/.zshrc
```

For `analyst-deal:codex-polish-report` you also need [Codex CLI](https://github.com/openai/codex):

```bash
npm install -g @openai/codex
codex login
```

Restart Claude Code after setup.

## How this repo is structured

```
analyst-pro-plugins/
├── .claude-plugin/marketplace.json   # marketplace manifest (3 plugins)
├── docs/
│   └── PLAN.md                        # design doc (full architecture)
├── scripts/                           # transformer (TypeScript)
│   ├── translation-rules.ts           # rules-as-data
│   ├── plugin-manifest.ts             # which command goes in which plugin
│   ├── build-from-source.ts           # main build entry
│   └── build-from-source.test.ts      # vitest
├── analyst-deal/                      # generated plugin (commands + knowledge)
├── analyst-dd/
├── analyst-research/
└── spike/                             # Phase 0 spike artifacts (history)
```

## Build (developer)

The plugin command files and knowledge templates are **generated** from the AnalystPro source repo (`../analyst-pro/`) by `scripts/build-from-source.ts`. To regenerate after upstream changes:

```bash
npm install
npm run build:plugins                  # rebuild all 3 plugins
npm run build:plugins:plugin analyst-deal  # rebuild just one
npm run build:plugins:check            # dry-run, show diff
npm test                               # transformer unit tests
```

## License

- **Plugin code (TypeScript scripts, READMEs, command files)**: MIT — see `LICENSE`
- **Knowledge templates (`*/knowledge/*.md`)**: CC-BY-NC-4.0 (non-commercial use, attribution required) — see `*/knowledge/LICENSE`

## Status

- **Phase 0**: ✅ Complete (all 6 Critical Unknowns resolved; pivoted to Jina CLI)
- **Phase 0.5**: pending — write transformer + run knowledge sensitivity audit
- **Phase 1-4**: pending — generate, test, polish, tag v0.1.0

See `docs/PLAN.md` § "Active design (Jina CLI)" for the implementation contract.
