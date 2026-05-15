# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Flattened default output paths**: generated reports/evidence now write to shallow per-domain dirs at the working-directory root — `./deals/`, `./portfolio/`, `./intel/`, `./research/` — instead of the legacy nested `./workspace/state/<domain>/`. Deliverables sit ≤2 levels from the project root. `./workspace/inbox/` (user-supplied input materials) is preserved unchanged, since inputs are semantically distinct from outputs.
  - `scripts/translation-rules.ts` `PATH_REPLACEMENTS` rewritten: `workspace/state/` → `./`, bare `state/<domain>/` → `./<domain>/`, `state/intelligence/` → `./intel/`; `workspace/inbox/` and `inbox/` preserved as `./workspace/inbox/`.
  - The `./workspace/` setup preflight (AskUserQuestion to create it) is removed; commands now auto-create the shallow output dir with `mkdir -p` and fall back to read-only mode if the CWD is unwritable.
  - Hand-written commands (`portfolio-tracking.md`, `competitor-enricher.md`) and the 3 plugin-native knowledge files registered in `scripts/plugin-manifest.ts` so `cleanStaleCommands`/`cleanStaleKnowledge` no longer delete them on rebuild (`manual-handwritten` mode).
  - `.gitignore` updated: new `/portfolio/`, `/deals/`, `/intel/`, `/research/` output trees ignored alongside `workspace/`.
  - Docs (READMEs, user guide, per-plugin CLAUDE.md, issue-01 design doc, financial-analyzer plan) updated to the new scheme.

## [0.1.1] - 2026-05-09

### Added

- **`/analyst-deal:competitor-enricher <公司1>[, <公司2>, …] [--out <目录>]`** — standalone slash command wrapping the existing `competitor-enricher` sub-agent so analysts can run ad-hoc competitive scans without invoking the full `/portfolio-tracking` 5-section quarterly report. Accepts space- or comma-separated company names; each card writes to a user-chosen folder (default cwd) as `{NN}_{name-slug}.md`. Cards stay schema-compatible with `/portfolio-tracking`'s `competitors/` cache so they can be reused as input to a quarterly report later.
  - Interactive flow: D0b output directory → D1 project context (A 对比模式 / B 纯客观模式) → D2 plan confirmation with Jina budget回显 → batched parallel dispatch (≤ 4 per batch) → immediate per-card disk write so partial results survive interruption.
  - Sub-agent description relaxed: `analyst-deal/agents/competitor-enricher.md` no longer restricted to internal `/portfolio-tracking` invocation; same hard rules (zero fabrication, ≥ `YYYY-MM` time precision, conflict两列, no subjective判断, jina-only) apply on both code paths.
- **Incremental write + xlsx sync** for `/analyst-deal:portfolio-tracking` (commit `66f60d3`):
  - Step 4.4 establishes a skeleton + placeholder anchors in `$REPORT_PATH` so Step 5/6/7 each Edit-into-place after their work, keeping main-context token usage bounded.
  - Step 5.5 syncs `current_quarter_financials.yml` into `*历年财务报表*.xlsx` via `openpyxl`, dynamically locating the insertion column from row-1 datetime cells (works for any quarter end). Idempotent on rerun; hard-fails on Excel lock files instead of silently corrupting state.

### Documentation

- `docs/guide/analyst-pro-user-guide.md` updated for the new command: command-table row, Quick Start example, full Per-command section with classic examples, output-filename layout, and bridging notes back to `/portfolio-tracking`.

---

## [0.0.2] - 2026-05-06

### Added (`analyst-deal` only — other plugins unchanged at 0.0.1)

- **`/analyst-deal:portfolio-tracking [公司名] [季度]`** — quarterly post-investment tracking report generator (issue [#1](https://github.com/anzchy/analyst-pro-plugins/issues/1)). Orchestrates two new sub-agents:
  - `analyst-deal/agents/financial-analyzer.md` — extracts 三表 from 合并报表, normalizes to 万元, computes 5 financial ratios. Hard rule: numbers must be traceable to source line items; LLM does not generate numbers. Output capped at ≤2,500 tokens; includes Evidence Ledger for audit.
  - `analyst-deal/agents/competitor-enricher.md` — researches one competitor via Jina (≤8 calls each), outputs a structured card. Multiple instances dispatched in parallel for the competitor list. Output capped at ≤800 tokens. Tools restricted to `Bash, Read, Glob` (no `WebFetch`) per the plugin's jina-only web-access policy.
- Three new knowledge files supporting the above:
  - `analyst-deal/knowledge/portfolio_tracking_template.md` — 5-section report skeleton (mirrors field-tested format)
  - `analyst-deal/knowledge/financial_ratios.md` — ratio formulas as constants (毛利率 / 销售费用率 / 管理费用率 / 研发费用率 / 财务费用率), unit conversion rules, audit guarantees
  - `analyst-deal/knowledge/competitor_card_schema.md` — output schema for competitor-enricher with synthetic worked sample (all data fabricated; for shape reference only)
- Per-company persistent state files reused across quarters: `./workspace/state/portfolio/<slug>/project_baseline.yml` (investment terms) and `competitors.yml` (editable competitor list).
- **Auto-detect inputs in Step 3**: command scans `./workspace/state/portfolio/<slug>/` for filename patterns matching 合并报表 / 上期投后报告 / 董事会材料 / 访谈纪要 / 新闻 and presents AskUserQuestion with `A) Use auto-detected (recommended)` / `B) Override with custom paths`. Drop quarterly materials into the project directory and the command needs zero path-typing. Mirrors the auto-detect pattern from `analyst-dd:interview-notes-enricher`.
- Design doc at `docs/designs/issue-01-portfolio-tracking.md` capturing premises (P1–P6), architecture (Approach B with two sub-agents), and locked decisions on the four open questions.
- Prompt-injection guards added to the new command and both sub-agents — external content (PDFs, prior reports, fetched competitor pages) is treated as untrusted data, never instructions.
- Manifest version bumped: `analyst-deal/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` analyst-deal entry both `0.0.1` → `0.0.2` (patch bump — additive scope on a pre-1.0 plugin). Other plugins (`analyst-dd`, `analyst-research`) remain at `0.0.1`.

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
  - `docs/guide/analyst-pro-user-guide.md` (formerly `USAGE.md`) — comprehensive end-user + maintainer guide
  - `knowledge-audit.md` — sensitivity audit verdict per knowledge file (TODO-4)
  - `TODOs.md` — open items tracker (Phase 1 closed, Phase 2+ candidates listed)

### Changed

- **`interview-notes-enricher`**: generalized from project-specific (hardcoded 矽睿 filename + glob + 8-row mapping table) to project-agnostic. Step 0 `AskUserQuestion` collects `MEMO_PATH` / `TRANSCRIPT_GLOB` / `PROJECT_NAME` with auto-detected defaults (TODO-1).
- **`cn-data-sources.md`**: replaced verbatim browse-cn dump (~250 lines, AnalystPro-Secretary-specific) with focused 4-level fallback chain reference (~135 lines, plugin-portable). Same content shipped in both `analyst-deal` and `analyst-research` (TODO-2).
- **`bp_framework.md`**: minor wording adjustment (deliberate citation of two Chinese hardtech VC firms retained as methodology attribution per audit verdict).

### Security / Privacy

- Knowledge sensitivity audit (TODO-4) verified all 16 unique knowledge files contain zero LP names, fund-level data, cap-table specifics, real portfolio company names paired with internal judgments, paid database摘录, or personal info. Repo is structurally clean for public release.
- Repository remains **private** at v0.1.0 release; visibility flip is the maintainer's call.

[Unreleased]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/anzchy/analyst-pro-plugins/releases/tag/v0.1.0
