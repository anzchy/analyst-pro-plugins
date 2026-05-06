# analyst-dd

Hard-tech due diligence + interview-notes synthesis for Claude Code. Generated from the [AnalystPro](https://github.com/anzchy/analyst-pro) hardtech-dd agent.

| Command | Purpose |
|---|---|
| `/analyst-dd:tech-dd [公司名]` | Hard-tech DD: paper/patent search, technical feasibility checklist, expert-interview support, contradiction marking, export-control screening (BIS Entity List / ECCN). |
| `/analyst-dd:interview-notes-enricher [interviewee]` | Incrementally sync raw interview transcripts (per-person Markdown files) into a consolidated curated Q&A memo. Strictly additive — preserves existing Q&A, adds only missing items, keeps transcript wording verbatim. |

**Sectors covered (tech-dd)**: semiconductor (fab / fabless / EDA / equipment), advanced packaging (chiplet, 2.5D/3D, fan-out), nuclear fusion (MCF / ICF / private fusion), new materials (SiC / GaN / perovskite), reusable rockets and space tech.

## Install

```
/plugin marketplace add anzchy/analyst-pro-plugins
/plugin install analyst-dd@analyst-pro-marketplace
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

Unlike `analyst-deal`, this plugin ships no `.mcp.json`. All web access is via the Jina CLI invoked through the `Bash` tool — no Codex, no Playwright, no extra config.

## Usage

### `/analyst-dd:tech-dd [公司名]`

Hard-tech DD on a target company.

```
/analyst-dd:tech-dd 寒武纪
```

The command will:

1. Run preflight (Jina available + cwd writable + workspace + knowledge files).
2. Read sector-specific feasibility benchmarks from `${CLAUDE_PLUGIN_ROOT}/knowledge/tech_checklist.md`.
3. Execute the 6-step hardtech-dd pipeline:
   1. **Paper / patent search** — arXiv, Google Scholar, Espacenet via Jina (`jina search --arxiv`, `jina search "{topic} site:patents.google.com"`)
   2. **Technical feasibility checklist** — process node viability, yield ramp timeline, reliability data, mass production qualification cycle
   3. **Expert interview support** — generate technical expert interview guides
   4. **Contradiction marking** — compare founder's claims vs published literature; flag exaggerations as **RED FLAG** (deviation > 20% auto-flagged)
   5. **Export control screening** — check BIS Entity List / ECCN classification using `${CLAUDE_PLUGIN_ROOT}/knowledge/export_control_rules.md`
   6. **Supply chain concentration analysis** — key materials / equipment / foundry dependency risk
4. Write annotated DD report (with RED FLAG highlights) to `./workspace/state/deals/techdd/<slug>/<DATE>_<slug>_tech_dd_report.md`.

Real example: for Cambricon, the report flags TSMC dependency under Entity List FDPR, ~20% yield rumors on 7nm, customer concentration risk (top customer ~80%, top 5 88.66%), and IP origin questions (DianNao academic spinoff).

### `/analyst-dd:interview-notes-enricher [interviewee]`

Sync raw interview transcripts into a curated Q&A memo. Strictly additive.

```
# In a directory containing your memo + transcripts:
/analyst-dd:interview-notes-enricher 张三
```

The command will:

1. Run preflight (cwd writable + cwd has files).
2. **Step 0 AskUserQuestion** to collect parameters:
   - `MEMO_PATH` (default: largest `*纪要*final*.md`, `*memo*.md`, or `*interview*.md` in cwd)
   - `TRANSCRIPT_GLOB` (default: `./*访谈*.md`, `./*交流*.md`, `./*interview*.md`)
   - `PROJECT_NAME` (informational)
3. **Phase 1 (Scope)**: resolve transcript file via Glob matching the interviewee's name; locate target section in memo via Grep.
4. **Phase 2 (Read)**: read full transcript + current memo section.
5. **Phase 3 (Extract)**: build `(question_theme, transcript_quote)` candidate list.
6. **Phase 4 (Diff)**: compare candidates against existing memo content.
7. **Phase 5 (Apply)**: insert new Q&A under the most relevant `### N.M` sub-section, matching the memo's existing style (full-width vs half-width colons, bold Q markers).
8. **Phase 6 (Verify & Report)**: verify additive-only diff via `git diff`; report sections touched + Q&A items added.

**Hard rules**:
- Additive only by default. Removals require explicit user instruction.
- One section at a time. No batch-editing multiple interviewees in one turn.
- Wording fidelity: prefer transcript phrasing over polished prose.
- No fabrication: every Q&A must be backed by specific transcript text.

If `$ARGUMENTS` is empty, the command asks before processing all interviewees in batch (rarely the right default).

### Test the enricher in a sandbox

```bash
mkdir -p /tmp/enricher-test && cd /tmp/enricher-test
cat > test-纪要-final.md <<'EOF'
# Test Project 高管访谈纪要

## 访谈 1 | 张三 · CEO

### 1.1 公司背景

**Q：能简单介绍一下公司吗？**

A：我们成立于 2020 年。
EOF

cat > 20260101-test-张三-访谈.md <<'EOF'
张三: 我们公司是 2020 年成立的，目前 50 人。
李四: 那你们的主要客户是哪些行业？
张三: 主要是金融和制造业，金融占 60%。
EOF

claude
```

Then run `/analyst-dd:interview-notes-enricher 张三`. The command should add the customer-industry Q&A to the memo without rewriting the existing background paragraph.

## Troubleshooting

### Preflight fails with "本命令需要 jina-cli + JINA_API_KEY"

See [analyst-deal README](../analyst-deal/README.md#troubleshooting) — same fix.

### `interview-notes-enricher` says "no transcript files found"

The Glob in Step 0 didn't match anything in cwd. Verify:

```bash
ls -la *访谈*.md *交流*.md *interview*.md  # at least one should exist
```

If your transcripts use different naming, override `TRANSCRIPT_GLOB` in Step 0 with the actual pattern.

### `tech-dd` flags too many RED FLAGs

The 20%-deviation threshold is conservative. If the founder's published work is older than 18 months, deviations may reflect normal technology evolution. Cross-check with paper publication dates before treating as a hard signal.

### `tech-dd` returns thin results for non-Chinese hardtech

This plugin's data preflight prioritizes Chinese sources (36kr / huxiu / patenthub.cn / cnki.net). For US/EU companies, augment with manual `jina search "{company} site:semianalysis.com OR site:anandtech.com" --json` queries via Bash.

## Output locations

```
./workspace/state/deals/techdd/<slug>/
├── <DATE>_<slug>_tech_dd_report.md    ← tech-dd output
└── (no enricher output here — enricher edits memo file in place)
```

`interview-notes-enricher` edits the user's memo file **in place** at the `MEMO_PATH` provided in Step 0. It does not write to `./workspace/state/`. Commit your memo file before running for reversibility.

## See also

- [Top-level marketplace README](../README.md)
- [AnalystPro User Guide](../docs/guide/analyst-pro-user-guide.md) — comprehensive usage
- [PLAN.md](../docs/PLAN.md) — design rationale
- `${CLAUDE_PLUGIN_ROOT}/knowledge/tech_checklist.md` — sector-specific feasibility benchmarks (semiconductor, fusion, materials, space)
- `${CLAUDE_PLUGIN_ROOT}/knowledge/export_control_rules.md` — BIS Entity List / ECCN reference
