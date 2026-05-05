# Knowledge Sensitivity Audit (TODO-4)

> Output of TODO-4 from `TODOs.md`. Per-file verdict against the 7-item checklist from `docs/PLAN.md` § "Knowledge 敏感性审计". This is the gate before `gh repo edit --visibility public`.

**Audit date**: 2026-05-05
**Auditor**: Claude Code (Sonnet 4.6) via TODO-4 workflow
**Repo at audit**: `anzchy/analyst-pro-plugins` (currently PRIVATE)
**Files audited**: 16 unique knowledge files (some duplicated across plugins)

## 7-item checklist (from `docs/PLAN.md`)

| # | Check |
|---|---|
| 1 | Specific company names (other than well-known public companies) → replace with `[公司A]` |
| 2 | LP / fund / cap-table data → 脱敏 or move to plugin-private |
| 3 | IC memo template real cases → generalize |
| 4 | Scoring weights (commercial-sensitive) → assess publication |
| 5 | Paid database摘录 → remove or replace with placeholders |
| 6 | Personal info (emails, phones, internal links) → remove |
| 7 | Git history scrub if any sensitive version was committed |

---

## Per-file verdicts

### Summary

| Verdict | Count |
|---|---|
| ✅ PUBLISHABLE AS-IS | 13 |
| ⚠️ PUBLISHABLE WITH NOTE | 3 (`bp_framework.md`, `report_template.md`, `triage_rules.md` — see per-file notes) |
| ❌ KEEP PRIVATE | 0 |

**Net verdict**: ready for public visibility flip.

---

### `bp_framework.md` — ⚠️ PUBLISHABLE WITH NOTE

| # | Finding |
|---|---|
| 1 | Names 2 specific VC firms as methodology citations: 耀途资本 (Yaotu Capital, "不是第一梯队的技术团队直接 pass") and 元禾璞华 (Yuanhe Puhua, "80–90% 项目聚焦国产替代"). Both firms are well-known Chinese hardtech-focused VCs, and both rules of thumb are paraphrases of publicly-stated methodology. |
| 2-7 | Clean |

**Recommendation**: PUBLISH AS-IS. Attribution of public methodologies to their originators is normal industry citation practice (analogous to "Sequoia's grading rubric says..." in English VC writing). The references are factual citations, not implied endorsements or quotations from private channels. If a future maintainer wants to neutralize the citations to generic phrasing ("顶级深科技 VC 经验法则" / "国资半导体基金经验法则"), it's a 2-line edit that doesn't change semantics.

---

### `dd_checklist_template.md` — ✅ PUBLISHABLE AS-IS

Pure DD document checklist template (~200 lines, ~67 numbered items across 业务/财务/法务/技术 DD). All placeholder fields. Industry-standard framework — every Chinese VC has equivalent.

| # | Finding |
|---|---|
| 1-7 | Clean |

---

### `dd_question_list_template.md` — ✅ PUBLISHABLE AS-IS

DD interview question template (~265 lines, 6 sections × 5-7 questions). Pure framework with `**为什么问：**` rationales. Industry-standard interview structure.

| # | Finding |
|---|---|
| 1-7 | Clean |

---

### `ic_memo_template.md` — ✅ PUBLISHABLE AS-IS

IC memo template with placeholders only. 9 standard sections (摘要 / 投资逻辑 / 公司概况 / 竞品 / 风险 / 估值 / 红队攻防 / 历史一致性检查 / 投资建议).

| # | Finding |
|---|---|
| 1 | Uses `[公司名称]` / `[合伙人姓名]` placeholders only — clean |
| 2-7 | Clean |

**Note**: this template is the kind of asset that competitors might want to copy, but it's also the kind of thing every VC has internally. Publishing it advances the field; doesn't disclose proprietary judgment.

---

### `past_ic_decisions.md` — ✅ PUBLISHABLE AS-IS

History format spec for tracking IC decisions. Has ONE example using `[公司 A]` placeholder data, clearly marked `> 以下为模板示例，请用真实数据替换。`.

| # | Finding |
|---|---|
| 1-7 | Clean (example uses placeholder; user fills with their real history privately) |

**Note**: USERS will populate with real decision history. That data stays in their private workspace (`./workspace/state/...`), NOT in this repo. The template itself is safe to publish.

---

### `red_flags.md` — ✅ PUBLISHABLE AS-IS

Investment red-flag checklist organized by category (团队 / 财务 / 技术 / 市场 / 合规 / 交易结构 + 硬科技专项). All categorical, no specific cases.

| # | Finding |
|---|---|
| 1-7 | Clean. The 严重程度分级 (RED/YELLOW/GREEN) is industry-standard, not weighted methodology. |

---

### `report_template.md` — ⚠️ PUBLISHABLE WITH NOTE

Phase 1 basic-info report template. Contains the **6-dimension weighted scoring rubric** (团队 25% / 技术 25% / 客户 15% / 供应链 15% / 资本效率 10% / 国产替代 10%) and **5-bucket discrete grading** (0/25/50/75/100).

| # | Finding |
|---|---|
| 1-3 | Clean |
| 4 | **Scoring weights ARE commercial methodology IP**. They reflect AnalystPro/operator's deliberate judgment about what matters most for hardtech VC investing. |
| 5-7 | Clean |

**Recommendation**: PUBLISH ANYWAY. Reasons:
- The 6 dimensions chosen (team / tech / customer / supply chain / capital efficiency / 国产替代) are public-knowledge VC concerns; competitors already think about them.
- The specific weighting (25/25/15/15/10/10) is what someone could reasonably arrive at in 30 minutes of thought.
- Discrete 5-bucket scoring is a known anti-bias technique (avoids middle-of-the-road scores).
- The hard-stop checklist (Phase 1 §八) is also publishable — it's clearly defensive triage, not secret sauce.

If you disagree and want to keep the weights private, the fix is: replace `权重` column with `[配置]` placeholder + add a sentence "weights are user-configured per-fund". ~5 min edit. But I recommend keep as-is.

---

### `source_list.md` — ✅ PUBLISHABLE AS-IS

Categorized list of public + paid information sources by tier (二级市场公告 / 一级市场 VC 动态 / 技术前沿 / Twitter/X / 微信公众号 / 监管 / 专利 / 学术 / 政府资助 / 供应链 / 招聘 / 出口管制).

| # | Finding |
|---|---|
| 1 | Mentions specific media/database names (东方财富, Wind, 36氪, IT 桔子, Crunchbase, PitchBook, 烯牛数据, etc.) — all PUBLIC SERVICES |
| 5 | Lists paid databases (Wind, PitchBook, 烯牛数据, 清科) by NAME ONLY — no摘录 of paid content |
| 6 | Mentions specific Twitter handles (`@OpenAI`, `@AnthropicAI`, `@dyaborskiy`, `@chinamoneynet`) — all public accounts; following them is public |
| 2-3, 4, 7 | Clean |

**Note**: This is essentially a "what to read" recommendation list. Publishing it is equivalent to publishing a reading-list blog post.

---

### `tech_checklist.md` (analyst-deal + analyst-dd, identical) — ✅ PUBLISHABLE AS-IS

Hard-tech DD checklist with sector-specific benchmarks (semiconductor / fusion / 先进封装 / 新材料 / 可回收火箭). Specific industry benchmark thresholds for RED FLAG triggering (e.g., "声称 Q > 10 = RED FLAG", "TSV < 1μm 无演示 = RED FLAG").

| # | Finding |
|---|---|
| 1 | Mentions specific real benchmarks (NIF Q ≈ 1.5, ASML EUV, Falcon 9 reuse > 20×, etc.) — all PUBLIC SCIENCE |
| 4 | Has industry benchmark thresholds + 20% deviation rule — these are reasoned engineering thresholds, not secret weights |
| 2-3, 5-7 | Clean |

**Note**: This file is the most technically valuable asset in the marketplace — it's distilled hardtech-DD wisdom. Publishing it accelerates the field. Don't artificially withhold.

---

### `triage_rules.md` — ⚠️ PUBLISHABLE WITH NOTE

Market-intel scoring rules: 5-level scale (1-5) + dimension weights (相关性 / 时效性 / 决策影响力 / 信息独特性) + auto-Score-5 trigger conditions.

| # | Finding |
|---|---|
| 1-3 | Clean |
| 4 | **Scoring methodology IS commercial IP** (similar to report_template.md). The auto-Score-5 trigger conditions ("被投企业出现负面新闻 → push") describe a real operational workflow. |
| 5 | Clean |
| 6 | Mentions Telegram as integration target — no specific bot/chat IDs, just integration name |
| 7 | Clean |

**Recommendation**: PUBLISH ANYWAY (same logic as `report_template.md`). The methodology is reasonable + reverse-engineerable. The auto-trigger conditions are user-configurable starting points. If you want to keep it private, replace specific weight numbers (`+1`/`+2`/`-1`) with `[user-tunable]` — ~5 min edit. I recommend keep as-is.

---

### `vc_watchlist.md` — ✅ PUBLISHABLE AS-IS

List of VC firms to monitor, organized by region (国际头部 / 中国头部 / 硬科技专项), with sector focus + monitoring frequency per firm.

| # | Finding |
|---|---|
| 1 | Names many specific VC firms — a16z, Benchmark, Sequoia, Founders Fund, Lux, DCVC, Eclipse, 红杉中国, 高瓴, IDG, 华登国际, 中芯聚源, 武岳峰, 国投创合, Commonwealth Fusion 投资方, Breakthrough Energy Ventures, 国科嘉和. **All are public investment firms; following them is public information; this list is methodology, not intelligence.** |
| 6 | Mentions Peter Thiel by name in "Twitter (Thiel 等)" context — but Thiel's Twitter is public; following it is public action |
| 2-5, 7 | Clean |

**Note**: This is a "who to read" list. Equivalent to a blog post titled "10 VCs every hardtech founder should follow."

---

### `glossary.md` (analyst-dd + analyst-research, identical) — ✅ PUBLISHABLE AS-IS

Terminology dictionary: Semiconductor / Advanced Packaging / Nuclear Fusion / Advanced Materials / Reusable Rockets / VC-PE terms.

| # | Finding |
|---|---|
| 1 | Mentions companies (TSMC, Nvidia, ARM, Synopsys) only as examples of categories — public reference |
| 2-7 | Clean |

---

### `industry_map.md` — ✅ PUBLISHABLE AS-IS

ASCII industry-chain diagrams for: 半导体 / 先进封装 / 核聚变 / AI 硬件. Names public industry leaders by tier (TSMC, ASML, Samsung, Intel, Nvidia, ITER, Commonwealth Fusion, etc.).

| # | Finding |
|---|---|
| 1 | All companies named are PUBLIC INDUSTRY LEADERS — no portfolio companies, no insider info |
| 2-7 | Clean |

---

### `competitors.md` (analyst-research only) — ✅ PUBLISHABLE AS-IS

Empty competitor template — every sector entry is `[待填写]` placeholder.

| # | Finding |
|---|---|
| 1-7 | Clean (no actual data to leak; user populates privately) |

---

### `export_control_rules.md` (analyst-dd only) — ✅ PUBLISHABLE AS-IS

Public regulatory reference: BIS / Entity List / ECCN / FDPR / Wassenaar / 中国出口管制法 + sector-specific notes (半导体 / 核聚变 / 火箭).

| # | Finding |
|---|---|
| 1 | Mentions ASML, LAM, AMAT (公开 industry leaders) |
| 2-7 | Clean |

---

### `cn-data-sources.md` (analyst-deal + analyst-research, identical, hand-written in TODO-2) — ✅ PUBLISHABLE AS-IS

Just-written reference doc covering 4-level fallback chain for Chinese data. No sensitive content.

| # | Finding |
|---|---|
| 1-7 | Clean |

---

## Aggregate findings

### What's actually in the knowledge base?

The 16 files break down into 5 categories:

| Category | Files | Public-safe? |
|---|---|---|
| **Pure templates** (placeholders only) | `dd_checklist_template`, `dd_question_list_template`, `ic_memo_template`, `report_template`, `past_ic_decisions`, `competitors` | YES |
| **Industry-standard checklists** | `red_flags`, `tech_checklist`, `bp_framework` | YES |
| **Public terminology / regulatory ref** | `glossary`, `export_control_rules` | YES |
| **Public reading lists** | `source_list`, `vc_watchlist`, `industry_map` | YES |
| **Operational methodology** (scoring/triage) | `report_template` (weights), `triage_rules` (score rules), `cn-data-sources` (fallback chain) | YES (with optional note) |

**Zero files contain**: LP names, fund-level data, cap-table specifics, real portfolio company names paired with internal judgments, paid database摘录, personal info beyond public Twitter handles, internal Slack/email links.

### Why is this knowledge base so clean?

Because the source files in `analyst-pro/workspace/knowledge/` were authored as **templates**, not as a working analyst's notes. AnalystPro's design separates **structure** (in `knowledge/`) from **state** (in `state/deals/...`). Real company names, IC decisions, etc. live in `state/` which the plugin distribution explicitly does not ship.

The plan's premise (TODO-4 might surface heavy sanitization needs) was conservative — the actual working files were already publication-ready by design.

### Git history scrub (#7)

The `analyst-pro-plugins` repo has 8 commits and was created today (2026-05-05). All commits since `dea1568` (initial scaffold) had clean templated knowledge files. **No sensitive past versions exist in this repo's history** to scrub.

The upstream `analyst-pro` repo's history (where these knowledge files originated) is not affected by anything done here. If users ever need to share concerns about the upstream repo's history, that's a separate audit.

### Sanitization deliberately not applied

`bp_framework.md` retains its 2 specific VC firm citations (耀途资本, 元禾璞华) as deliberate methodology attribution. See per-file note above. If the maintainer wants to neutralize these to generic phrasing, the diff is 2 lines.

---

## Recommendation: ready for public

The repo is **ready for public visibility flip**. Run:

```bash
gh repo edit anzchy/analyst-pro-plugins \
  --visibility public \
  --accept-visibility-change-consequences
```

### Optional follow-ups (not blocking)

1. **License attribution**: After flip, consider adding `analyst-deal/knowledge/LICENSE`, `analyst-dd/knowledge/LICENSE`, `analyst-research/knowledge/LICENSE` files (CC-BY-NC-4.0 full text). Already in `TODOs.md` Phase 2+ list.

2. **Methodology citation note**: For `report_template.md` and `triage_rules.md`, you could add a one-line "this scoring rubric is one reasonable starting point — fork and tune to your fund's strategy" preamble. Not required, but signals to users that this is opinionated methodology, not gospel.

3. **README.md credit line**: Top-level README could acknowledge that the templates draw on standard hardtech VC practice (no specific firm citations needed).

---

**Audit complete. Verdict: READY FOR PUBLIC.**
