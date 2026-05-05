# TODOs

Open items carried from Phase 0.5 transformer output. Each TODO is referenced by an inline `<!-- TODO[...]: -->` banner in the generated file so it doesn't get lost.

## Phase 1 — Polish before v0.1.0 release

### TODO-1: Generalize `interview-notes-enricher` (manual-generalize stub)

- **File**: `analyst-dd/commands/interview-notes-enricher.md`
- **Source**: `~/.claude/skills/interview-notes-enricher/SKILL.md`
- **Issue**: Original SKILL.md hardcodes the 矽睿 project (`矽睿高管访谈纪要-final.md` filename, `20260*-矽睿*访谈.md` glob).
- **Action**:
  1. Replace hardcoded filenames + glob with an `AskUserQuestion` Step 0 that collects:
     - `memo_path` (default: largest `*纪要*.md` or `*final*.md` in cwd)
     - `transcript_glob` (default: `./*访谈*.md`, `./*交流*.md`, `./*interview*.md`)
     - `project_name` (used for the `## 访谈 N | 姓名 · 角色` heading prefix)
  2. Re-test with a non-矽睿 transcript directory.
  3. Replace stub frontmatter description with the real one.
  4. Remove the `<!-- TODO[Phase 2 manual generalize]: -->` banner.
- **Estimate**: ~1 hour.
- **Effort scope**: write directly in `analyst-dd/commands/interview-notes-enricher.md` (not transformer-generated; one-time human edit).

### TODO-2: Distill `cn-data-sources.md` (×2 plugins)

- **Files**:
  - `analyst-deal/knowledge/cn-data-sources.md`
  - `analyst-research/knowledge/cn-data-sources.md`
- **Source**: `../analyst-pro/electron/skills/browse-cn/SKILL.md` (verbatim copy with TODO banner)
- **Issue**: Currently contains AnalystPro-specific Secretary / SkillPalette references. Need to distill to a clean "China data sources fallback chain" reference doc (Jina read → HITL).
- **Action**:
  1. Write a focused 1-page reference covering the 4 fallback levels:
     - Level 1: `jina search "{q} site:36kr.com"` + WebSearch with site filters
     - Level 2: `jina read URL` for known article URLs
     - Level 3: For login-walled sites (aiqicha, tianyancha, zhihu): HITL fallback
     - Level 4: When all else fails: tell user this data source is currently unreachable
  2. List specific Chinese data sources by tier (free, login-required, paid).
  3. Apply identical content to both plugins (copy is fine; or generate from a single source via `knowledgeGenerated.transform: 'extract-fallback-chain-clean'` in a future transformer iteration).
  4. Remove the `<!-- TODO[Phase 2 manual refine]: -->` banner.
- **Estimate**: ~30 min for the doc + 5 min to copy to both plugins.

### TODO-3: Per-plugin READMEs

- **Files**:
  - `analyst-deal/README.md`
  - `analyst-dd/README.md`
  - `analyst-research/README.md`
- **Issue**: Currently stub READMEs pointing to top-level. End users installing a single plugin should get a self-contained doc.
- **Action**: For each plugin, write:
  1. One-paragraph "what this plugin does"
  2. Install command: `/plugin install <name>@analyst-pro-marketplace`
  3. Setup checklist (Jina CLI + `JINA_API_KEY`; Codex only for analyst-deal)
  4. Per-command usage example with real-world inputs and expected outputs
  5. Troubleshooting (missing tools, MCP issues)
- **Estimate**: ~30 min per plugin (1.5 hours total).

### TODO-4: Knowledge sensitivity audit (A4-B from `docs/PLAN.md`)

- **Files**: all `analyst-*/knowledge/*.md`
- **Issue**: Plugin code is MIT but `knowledge/` is CC-BY-NC-4.0 with sensitivity concerns. Need to audit before public release.
- **Action**: Run the 7-item checklist from `docs/PLAN.md` § "Knowledge 敏感性审计" against each knowledge file:
  1. Specific company names → replace with `[公司A]`
  2. LP / fund / cap-table data →脱敏 or move to plugin-private
  3. IC memo template real cases → generalize
  4. Scoring weights (commercial-sensitive) → assess publication
  5. Paid database摘录 → remove or replace with placeholders
  6. Personal info (emails, phones, internal links) → remove
  7. Git history scrub if any sensitive version was committed
- **Output**: `analyst-pro-plugins/knowledge-audit.md` with verdict per file.
- **Estimate**: ~1 hour.

---

## Phase 2+ — Future work (not blocking v0.1.0)

### Add knowledge LICENSE files

After audit (TODO-4), create:
- `analyst-deal/knowledge/LICENSE` — CC-BY-NC-4.0 full text
- `analyst-dd/knowledge/LICENSE` — CC-BY-NC-4.0
- `analyst-research/knowledge/LICENSE` — CC-BY-NC-4.0

### Smoke-test script

Per `docs/PLAN.md` § "Smoke Test": write `scripts/smoke-test.sh` that does the static lint (no `(...照抄...)` placeholders, knowledge dirs + LICENSE present). E2E test pending CU #6 verification (headless `claude` CLI invocation).

### Transformer enhancements

- Phase 2 candidate: extract `cn-data-sources.md` from browse-cn automatically (would convert TODO-2's manual work into a transformer rule).
- Phase 2 candidate: when `model: opus` is requested in source, default to `claude-opus-4-7` only for cost-tolerant commands; haiku for high-frequency.
- Add `--watch` mode for transformer (rebuild on AnalystPro source change).

### v0.2.0 — Optional Playwright fallback

Per `docs/PLAN.md` § "Anti-bot 中文站 HITL fallback": currently login-walled sites go to HITL. v0.2.0 candidate: add opt-in Playwright support. Plugin commands detect `mcp__plugin_*_playwright__*` tool availability and use it if present, else fall back to HITL.

### v0.2.0 — `analyst-pro-marketplace` npm package

Some Claude Code users may prefer `npm install -g @anzchy/analyst-pro-marketplace` over GitHub-based marketplace add. Investigate npm distribution path.
