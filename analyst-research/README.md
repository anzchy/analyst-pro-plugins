# analyst-research

Industry research + report enrichment workflows for Claude Code. Generated from the [AnalystPro](https://github.com/anzchy/analyst-pro) industry-researcher agent + the standalone `enrich-report` skill.

| Command | Purpose |
|---|---|
| `/analyst-research:industry-research [行业]` | Deep industry research with Chinese data preflight: market size, competitive landscape, policy environment, top players. |
| `/analyst-research:enrich-report` | Integrate scattered interview notes / field research into an existing base report. Section-by-section, attribution-preserving, never deletes original content. |

## Install

```
/plugin marketplace add anzchy/analyst-pro-plugins
/plugin install analyst-research@analyst-pro-marketplace
/reload-plugins
```

## Setup (one-time)

### Required: Jina AI CLI

```bash
pip install jina-cli
# or: uv pip install jina-cli

# Get an API key at https://jina.ai/?sui=apikey
export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx

# Persist
echo 'export JINA_API_KEY=jina_xxxxxxxxxxxxxxxx' >> ~/.zshrc
```

**Critical**: launch Claude Code from a shell where `JINA_API_KEY` is already exported.

### No MCP servers required

Like `analyst-dd`, this plugin ships no `.mcp.json`. All web access is via the Jina CLI invoked through `Bash`.

## Usage

### `/analyst-research:industry-research [行业]`

Industry deep-research with Chinese data source preflight.

```
/analyst-research:industry-research 半导体先进封装
/analyst-research:industry-research AI芯片
/analyst-research:industry-research 商业航天
/analyst-research:industry-research 可控核聚变
```

The command will:

1. Run preflight (Jina available + cwd writable + knowledge files).
2. Read industry baseline from `${CLAUDE_PLUGIN_ROOT}/knowledge/industry_map.md` and competitor inventory from `${CLAUDE_PLUGIN_ROOT}/knowledge/competitors.md`.
3. Execute the multi-source preflight chain (see `${CLAUDE_PLUGIN_ROOT}/knowledge/cn-data-sources.md`):
   - `jina search "{行业} 市场规模 site:36kr.com" --json` — startup-side coverage
   - `jina search "{行业} site:huxiu.com OR site:tmtpost.com" --json` — major business media
   - `jina search "{行业} 政策 site:gov.cn" --json` — central + ministry policy
   - `jina search "{行业} 标准 site:samr.gov.cn" --json` — industry standards
   - Sogou WeChat search for top-tier VC institution公众号 perspectives
   - `jina search "{行业}" --arxiv --json` — academic preprints (for tech-deep sectors)
4. Synthesize into structured industry report covering:
   - 市场规模 (TAM / SAM / SOM with explicit data sources cited)
   - 关键玩家 (top 5-10 incumbents + emerging challengers)
   - 政策环境 (recent regulations, subsidies, restrictions)
   - 技术拐点 (current tech maturity, expected next-gen transitions)
   - 投资机会窗口 (where capital is flowing, valuation benchmarks)
5. Write report to `./research/<industry-slug>/<DATE>_industry-report.md`.

Real example: for "AI芯片", the report will pull recent 36kr coverage, 国务院 policy on chip self-sufficiency, eastmoney research on listed players (英伟达 / 寒武纪 / 海光 / 平头哥), and arxiv preprints on chip architectures.

### `/analyst-research:enrich-report`

Integrate scattered interview notes / field research into an existing base report.

```
/analyst-research:enrich-report
```

The command will:

1. Run preflight.
2. **Step 0** ask via AskUserQuestion for three inputs (or extract from `@`-tagged files):
   - **Interview notes folder** — path to directory containing interview transcripts (`.md` or `.txt`)
   - **Base report path** — path to the report to enrich (default: largest `.md` in cwd)
   - **Output mode** — `overwrite` (edit in place; default) or `copy` (create `<name>-enriched.md`)
3. **Phase 1 (Discovery)**: read all interview files, build per-file index of (interviewee, role, key topics, data points); read full base report; identify thin sections.
4. **Phase 2 (Plan)**: create section-by-section integration plan listing which interview-derived insights map to which report sections.
5. **Phase 3 (Execute)**: apply edits — only ADD attributed content (e.g., `[据张三访谈, 2026-04-15]: 客户集中度...`), never delete or modify original prose.
6. **Phase 4 (Verify)**: confirm additive-only diff; report sections touched + insights added.

Use cases:
- Enrich an investment proposal with founder interview takeaways
- Update a DD report with expert-network-call insights
- Augment industry research with field research from analyst conversations
- Cross-reference a competitor analysis with interview data

**Hard rules**:
- Additive-only by default. Original content is never deleted or rewritten.
- Every added insight must cite source interview filename + interviewee name.
- Preserve the base report's existing structure, headings, and tone.

### Real-world example

```bash
mkdir -p /tmp/enrich-test && cd /tmp/enrich-test

# Base report
cat > industry-report.md <<'EOF'
# 半导体先进封装行业研究

## 市场规模

全球先进封装市场 2024 年约 380 亿美元。

## 主要玩家

TSMC、三星、Intel、长电科技、通富微电。
EOF

# Interview folder
mkdir -p interviews
cat > interviews/2026-04-15-tsmc-vp-interview.md <<'EOF'
张总 (TSMC VP): 3D 封装良率从 65% 提升到 80% 用了 18 个月。
分析师: 那 CoWoS 产能扩张计划呢？
张总: 2026 年底前增加 60% 产能，主要面向 AI 芯片客户。
EOF

claude
```

Then in Claude Code:
```
/analyst-research:enrich-report
```

When prompted, point to `./industry-report.md` (base) and `./interviews/` (folder), choose `copy` mode. The command will produce `industry-report-enriched.md` with the original content preserved + new attributed paragraphs in 主要玩家 (CoWoS capacity) and 市场规模 (3D yield improvement timeline).

## Troubleshooting

### Preflight fails with "本命令需要 jina-cli + JINA_API_KEY"

See [analyst-deal README](../analyst-deal/README.md#troubleshooting) — same fix.

### `industry-research` returns thin coverage for niche sectors

For very narrow sectors (e.g., specific quantum computing modalities), Jina's site-filtered Chinese sources may have limited coverage. Augment with:

```
jina search "{topic} site:semiwiki.com OR site:tomshardware.com" --json
jina search "{topic} site:nature.com OR site:science.org" --json
```

via Bash inside the command session.

### `enrich-report` says "no interview files found"

Verify your interview folder has `.md` or `.txt` files:

```bash
ls -la interviews/  # adjust path
```

The command does NOT auto-convert `.docx` files. If your transcripts are Word documents, convert first:

```bash
brew install pandoc
for f in interviews/*.docx; do pandoc "$f" -o "${f%.docx}.md"; done
```

### `enrich-report` deletes content from the base report

This should never happen — the command's hard rule is additive-only. If it does, file a bug. Workaround: always run `enrich-report` on a git-committed file, or use `copy` mode (creates a new `-enriched` file, leaves original untouched).

## Output locations

```
./research/<industry-slug>/
└── <DATE>_industry-report.md          ← industry-research output
```

`enrich-report` edits the user's base report **in place** (or creates `<name>-enriched.md` in `copy` mode) at the path provided in Step 0. It does not write to any per-domain output dir.

## See also

- [Top-level marketplace README](../README.md)
- [AnalystPro User Guide](../docs/guide/analyst-pro-user-guide.md) — comprehensive usage
- [PLAN.md](../docs/PLAN.md) — design rationale
- `${CLAUDE_PLUGIN_ROOT}/knowledge/industry_map.md` — known industry baselines and category definitions
- `${CLAUDE_PLUGIN_ROOT}/knowledge/competitors.md` — sector-tagged competitor inventory
- `${CLAUDE_PLUGIN_ROOT}/knowledge/cn-data-sources.md` — 4-level fallback chain for Chinese data
