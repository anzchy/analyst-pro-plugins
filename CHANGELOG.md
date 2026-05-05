# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-05

### Added

- **Three Claude Code plugins** for VC investment workflows, generated from upstream [AnalystPro](https://github.com/anzchy/analyst-pro):
  - `analyst-deal` — `/analyst-deal:deal-analysis`, `/analyst-deal:memo`, `/analyst-deal:codex-polish-report`, `/analyst-deal:news-scan`
  - `analyst-dd` — `/analyst-dd:tech-dd`, `/analyst-dd:interview-notes-enricher`
  - `analyst-research` — `/analyst-research:industry-research`, `/analyst-research:enrich-report`
- **Marketplace manifest** at `.claude-plugin/marketplace.json` with relative-path sources for the three plugins. Single-repo monorepo distribution validated by Phase 0 spike.
- **TypeScript transformer** (`scripts/build-from-source.ts`, 47 vitest tests) that reads upstream AnalystPro source (`electron/skills/<name>/SKILL.md` + `electron/agents/definitions/<agent>.ts`) and generates plugin command files + knowledge files. Three transform modes:
  - `auto` — standard pipeline (path replacements, frontmatter cleanup, agent prompt inlining, web-tool replacement)
  - `manual-copy` — for already-plugin-shaped commands (e.g., `enrich-report`)
  - `manual-handwritten` — preserve human-edited files across rebuilds (used for `interview-notes-enricher` after generalization in TODO-1)
- **Web access via [Jina AI CLI](https://github.com/jina-ai/cli)** invoked through the `Bash` tool. Replaces AnalystPro's Playwright/MCP browser tooling with `jina search` / `jina read` / `jina screenshot` / `jina pdf` / `jina bibtex`. Eliminates Chromium download and MCP namespace fragility.
- **15 knowledge files** distributed across the three plugins: BP analysis framework, IC memo template, DD checklist + question list templates, red flags checklist, sector-specific tech checklist, export control rules reference, source list, VC watchlist, industry map, glossary, China data sources fallback chain (`cn-data-sources.md`).
- **Codex MCP integration** (`analyst-deal/.mcp.json`) for the `codex-polish-report` command — automatically declared with `Failed to reconnect` warning suppressed at preflight.
- **Failure Mode Preflight** injected into every generated command: hard-fails on missing `jina` CLI, missing `JINA_API_KEY`, unreadable cwd, or missing knowledge files. Gives users clear remediation messages.
- **Comprehensive documentation**:
  - Top-level `README.md` — repo overview + install path
  - Per-plugin READMEs — self-contained install + setup + per-command usage + troubleshooting + output paths (TODO-3)
  - `docs/PLAN.md` — full design rationale, Phase 0 spike findings, architectural decisions
  - `docs/guide/USAGE.md` — comprehensive end-user + maintainer guide (635 lines)
  - `knowledge-audit.md` — sensitivity audit verdict per knowledge file (TODO-4)
  - `TODOs.md` — open items tracker (Phase 1 closed, Phase 2+ candidates listed)

### Changed

- **`interview-notes-enricher`**: generalized from project-specific (hardcoded 矽睿 filename + glob + 8-row mapping table) to project-agnostic. Step 0 `AskUserQuestion` collects `MEMO_PATH` / `TRANSCRIPT_GLOB` / `PROJECT_NAME` with auto-detected defaults (TODO-1).
- **`cn-data-sources.md`**: replaced verbatim browse-cn dump (~250 lines, AnalystPro-Secretary-specific) with focused 4-level fallback chain reference (~135 lines, plugin-portable). Same content shipped in both `analyst-deal` and `analyst-research` (TODO-2).
- **`bp_framework.md`**: minor wording adjustment (deliberate citation of two Chinese hardtech VC firms retained as methodology attribution per audit verdict).

### Security / Privacy

- Knowledge sensitivity audit (TODO-4) verified all 16 unique knowledge files contain zero LP names, fund-level data, cap-table specifics, real portfolio company names paired with internal judgments, paid database摘录, or personal info. Repo is structurally clean for public release.
- Repository remains **private** at v0.1.0 release; visibility flip is the maintainer's call.

[Unreleased]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anzchy/analyst-pro-plugins/releases/tag/v0.1.0
