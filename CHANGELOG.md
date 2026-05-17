# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-05-17

Plugin versions: **`analyst-deal` 0.1.2 → 0.1.3**
(plugin.json + marketplace.json). `analyst-dd` / `analyst-research` unchanged at `0.0.1`.

### Fixed

- `/financial-analyzer` could key the `.fin-cache` side-file on a filename delivery-date instead of the corrected reporting period. The period-key gate now hard-stops unless the cache key is a quarter-end date — the only exception being a non-quarter special report the user explicitly confirmed in the D1 prompt (an auditable flag the model cannot self-set), closing a residual bypass where a delivery-date was relabelled as user-supplied.
- `/portfolio-tracking` and `/financial-analyzer` directory scans used shell globs that hard-error under zsh when a pattern matches nothing (`no matches found`, not suppressible by `2>/dev/null`), causing false "no financial input" / "no PDF found" aborts. All such scans now use `find`.
- `/competitor-enricher` instructed bare-text `AskUserQuestion` calls (missing-company-name path and project-context A-branch) that hard-fail without an options array; both are now well-formed two-option questions with free text via the auto "Other" input.

### Changed

- `.fin-cache` side-file path flattened to `<folder>/.fin-cache/<YYYYMMDD>{.json,_section.md}` (sha8 sub-directory removed). The reader stays backward-compatible with the old nested layout, so moving a target folder no longer silently invalidates the cache and forces a PDF re-read.
- Competitor archive cards flattened to `./competitors/<name-slug>.md` (dropped the `NN_` numeric prefix and the output-directory prompt); `/portfolio-tracking` reuses them from that canonical location, prefix-insensitive for back-compat.
- `/financial-analyzer` is now registered in the plugin build manifest, so it is no longer deleted on every `npm run build:plugins`.

---

## [0.1.4] - 2026-05-17

Plugin versions: **`analyst-deal` 0.1.1 → 0.1.2**
(plugin.json + marketplace.json). `analyst-dd` / `analyst-research` unchanged at `0.0.1`.

### Added

- **`/analyst-deal:portfolio-tracking` 复用 standalone 产物，不再每季无条件 re-dispatch / re-jina** — 分析师真实工作流是先在文档根目录跑 standalone `/analyst-deal:financial-analyzer` 与 `/analyst-deal:competitor-enricher`，再跑投后报告。本版让 `portfolio-tracking` 先复用这些既有产物，命中即省一次子 agent / 一次 jina 调研。两条原本是「命令内部实现细节」的产物路径被提升为**冻结的跨命令契约**（新增 `docs/adr/0002-cross-command-reuse-contracts.md`）：fin-cache 留底 `<folder>/.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>{_section.md,.json}`、竞对档案块 `{NN}_{name-slug}.md`。
  - **Step 2**：`competitors.yml` 顶层新增有序全局 `档案搜索路径`（默认 `[./, ./portfolio/{slug}/competitors/]`），旧版文件缺该键时静默采用默认。
  - **Step 5.1.5（财务复用闸门）**：静默预扫 CWD 根与 slug 目录，按 `{季度}` 派生的报告期日期 token **严格精确匹配** `<YYYYMMDD>_section.md` 且校验留底 mtime 晚于合并报表（鲜度）；命中弹恰一个批级 `D4`（复用 / 重抽），miss 或陈旧**静默回退**原 dispatch，不报 `InputValidationError`、不弹计划外问题。`sha8` 公式与 standalone 完全一致。
  - **Step 5.5（喂历年表）**：复用时把 fin-cache JSON 侧文件拷为 `current_quarter_financials.json` 照常并表；仅有 `_section.md`、无 JSON → 跳过 5.5 并在 Output 标注「未同步历年表」。
  - **Step 6.0（竞对有序回退）**：对每家竞对按 `档案搜索路径` 逐路径回退（文件名含 name-slug、大小写不敏感、允许 `NN_` 前缀；歧义则 `#### …公司名` 表头兜底），全链未命中才走 jina；先跑一遍匹配并以恰一个批级 `D5`（按预览走 / 改路径重扫 / 全 jina）呈现每路径命中数 + 将走 jina 的逸名预览。
  - **Step 8 / Output**：逐家标注来源路径 + card 内查询日期 + 是否含 `jina 不可用 / 数据缺口 / 数据完整性声明 / 未核验` 关键词（原样复用、不阻断，治理责任经 HITL 移交分析师）。**Step 9** 把确认后的 `档案搜索路径` 回写 `competitors.yml`（stdlib，无 PyYAML）。
  - 设计经一轮 `/grill-with-docs` 锁定；`financial-analyzer.md` / `competitor-enricher.md` / agents / `docs/designs/fin-sidecar-contract.md`（FROZEN）不动。新增 `CONTEXT.md` 财务复用 / 竞对复用术语表条目；被取代的 standalone 计划归档到 `docs/plans/archive/`。
- **项目内 `marketplace-release` skill** — `gh-release` 的本仓库变体，新增 model-driven Step 0：从「上次发布以来的提交 ∪ 工作区未提交改动」按 owning artifact 提议每个 `plugin.json` / `marketplace.json` 镜像条目 + 仓库 tag/CHANGELOG 的逐项 semver bump（命令/agent 改动上卷到所属 plugin）；含 `--bump-only`（只 bump + 本地 tag，不 push、不发布）模式。

### Fixed

- **D 闸门绑定 `AskUserQuestion` schema + 文件名日期 vs 报告期交叉校验** — `InputValidationError: questions is missing` 根因：D 闸门（D0/D1/D-COLLIDE、D1/D2/D3）写成 ASCII 正文、未映射到 `AskUserQuestion` 工具 schema，模型把围栏当叙述输出、调用工具时漏 `questions`。触发点是 Step 1.2 把文件名 8 位 token（`20260429` = 交付日）当成报告期，而真实报告期（`2026-03-31`）只在 PDF 标题里，引出一个脱离 schema 的计划外确认。修复：`financial-analyzer.md` 增「AskUserQuestion 调用契约」硬规则 + 1.2.1 文件名日期/报告期交叉校验（读 PDF 标题、归一到期末日；cache/sidecar/`--date` 用校正后的报告期），并把校正折叠进单次 D1；`portfolio-tracking.md` 同步同一契约（含文本录入类仍需 ≥2 options）——D1/D2/D3 有同一潜在缺陷。本版的「严格期末日匹配」复用防线是该交叉校验的延伸。

## [0.1.3] - 2026-05-16

Plugin versions: **`analyst-deal` 0.1.0 → 0.1.1**
(plugin.json + marketplace.json). `analyst-dd` / `analyst-research` unchanged at `0.0.1`.

### Added

- **`/analyst-deal:competitor-enricher` 上市 / 拟 IPO 竞品深度档案** — 竞对档案块从一刀切（按非上市创业公司调优）扩成单 schema + 公司类型三分支（`listed` / `pre-ipo` / `non-listed`）。上市与拟 IPO 档新增四节必填：最近三年一期财务（报告原币种、不做汇率换算，缺期标 `截至 YYYY-MM 未披露`）、行业自适应芯片规格表（与本公司同赛道 Top 2-3 款）、管理层表（核心 3-5 人，董事长/CEO + CTO 必填）、客户与下游子节（具名客户 + 客户集中度）。公司类型由子 agent 首次股权检索零额外 jina 调用自动判定，可经可选输入 / `--type` 覆盖。
  - 分层 jina 预算 `listed ≤16 / pre-ipo ≤12 / non-listed ≤8`，分档长度上限 `1800 / 1400 / 800` tokens，溢出压缩序固定为 产品方向段 → 管理层表 → 客户与下游子节（股权/财务/芯片规格表保持完整）。
  - 财务文字解读边界与「不输出主观判断」硬规则配套：允许纯描述性趋势句（数值、YoY%、升/降/持平），禁因果归因与评价形容词（承压/恶化/强劲/反映竞争加剧等），schema 附允许/禁用词表。
  - `knowledge/cn-data-sources.md` 新增上市 / 拟 IPO 母文档源：巨潮 cninfo、台湾 MOPS、公司 IR 年报 PDF、招股说明书申报稿，及财务/管理层/客户集中度/芯片规格的 source-priority 行。
  - 新增仓库根 `CONTEXT.md`（领域术语表：三类竞品 / 同赛道业务段 / 客户集中度）与 `docs/adr/0001-competitor-card-single-schema-branched.md`（记录单 schema + 三分支决策及「竞品财务统一换算」被否备选）。
  - 改动文件：`knowledge/competitor_card_schema.md`、`agents/competitor-enricher.md`、`commands/competitor-enricher.md`、`knowledge/cn-data-sources.md`。`portfolio-tracking` / `competitors.yml` 刻意不动，保持自动识别、限爆炸半径。

## [0.1.2] - 2026-05-15

Plugin versions: **`analyst-deal` 0.0.2 → 0.1.0**
(plugin.json + marketplace.json — re-synced to a stable multi-command baseline:
`portfolio-tracking` + `competitor-enricher` + `financial-analyzer`).
`analyst-dd` / `analyst-research` unchanged at `0.0.1`.

### Added

- **`/analyst-deal:financial-analyzer <target_folder> [--xlsx <历年表>] [--company <名>] [--extract-only]`** — standalone slash command that scans a folder's 财报 PDFs + historical xlsx/csv, dispatches the existing `financial-analyzer` sub-agent once per reporting period (three-statement extraction, 万元 normalization, zero LLM fabrication), and merges each period into the historical table earliest→latest. A lightweight entry point for analysts who only need the PDF numbers folded into Excel/CSV without the full `/portfolio-tracking` 5-section report.
  - Folder-scoped per-period cache `.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>.json` with an mtime staleness guard (same-name PDFs in different folders never cross-pollute); `--extract-only` short-circuits the merge for analysts who only want the latest period's JSON.
  - Reporting period parsed from the filename via `datetime.strptime` (illegal dates like `20251331` rejected); ≥2 PDFs resolving to the same period is a hard-stop (`D-COLLIDE`) rather than silently producing half-empty overwriting columns. Per-period failure isolation: one unreadable PDF does not abort the others. Not networked (no jina preflight); HITL — no auto-commit.

### Changed

- **Financial side-file migrated YAML → stdlib JSON** (`fin-sidecar/v1`). PyYAML is absent from the user's `web-scrape`/base conda envs, so the prior `current_quarter_financials.yml` path was broken in practice. The `financial-analyzer` agent Step 4.5 now emits JSON via `json.dump`; the parent↔agent dispatch field is renamed `YAML 输出路径` → `侧文件输出路径`. Contract frozen at `docs/designs/fin-sidecar-contract.md`.
- **Extracted shared `analyst-deal/scripts/merge_financials.py`** — `portfolio-tracking` Step 5.5.2's ~150-line inline Python is replaced by a CLI call to this script (eliminating the copy and adding the conda activation it previously lacked). New: csv-target branch (utf-8-sig, in-place), and **insert-in-order column placement** (OV1) replacing the old `TARGET < latest → abort` rule — backfilling an earlier period now inserts the column in date order instead of silently failing; quarterly-append behavior is preserved byte-for-byte (regression-tested). 29 unit tests in `scripts/test_merge_financials.py`, green under `web-scrape`.
- **Flattened default output paths**: generated reports/evidence now write to shallow per-domain dirs at the working-directory root — `./deals/`, `./portfolio/`, `./intel/`, `./research/` — instead of the legacy nested `./workspace/state/<domain>/`. Deliverables sit ≤2 levels from the project root. `./workspace/inbox/` (user-supplied input materials) is preserved unchanged, since inputs are semantically distinct from outputs.
  - `scripts/translation-rules.ts` `PATH_REPLACEMENTS` rewritten: `workspace/state/` → `./`, bare `state/<domain>/` → `./<domain>/`, `state/intelligence/` → `./intel/`; `workspace/inbox/` and `inbox/` preserved as `./workspace/inbox/`.
  - The `./workspace/` setup preflight (AskUserQuestion to create it) is removed; commands now auto-create the shallow output dir with `mkdir -p` and fall back to read-only mode if the CWD is unwritable.
  - Hand-written commands (`portfolio-tracking.md`, `competitor-enricher.md`) and the 3 plugin-native knowledge files registered in `scripts/plugin-manifest.ts` so `cleanStaleCommands`/`cleanStaleKnowledge` no longer delete them on rebuild (`manual-handwritten` mode).
  - `.gitignore` updated: new `/portfolio/`, `/deals/`, `/intel/`, `/research/` output trees ignored alongside `workspace/`.
  - Docs (READMEs, user guide, per-plugin CLAUDE.md, issue-01 design doc, financial-analyzer plan) updated to the new scheme.

### Fixed

- **F1 — `_meta.period_date` cross-check hardened against agent LLM drift** (surfaced by the plan-step-4 end-to-end smoke test on the real `矽昌通信` PDF). The `financial-analyzer` agent's Step 4.5 template is correct, but the LLM drifted the key to `report_date` (+ stray keys) at runtime; `merge_financials._period_note` then silently skipped the `--date` vs sidecar mismatch NOTE. Now: `report_date` is accepted as a tolerated synonym, and when neither key is present a **visible** NOTE is emitted instead of vanishing silently. Producer contract unchanged; agent Step 4.5 gains a hard `_meta`-keys constraint. Regression-tested (`test_21`/`test_21b`).

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

[Unreleased]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/anzchy/analyst-pro-plugins/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/anzchy/analyst-pro-plugins/releases/tag/v0.1.0
