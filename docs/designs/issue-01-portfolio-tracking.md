# Design: `/analyst-deal:portfolio-tracking`

Linked issue: [#1 feat: 新增投后跟踪报告完善 skill](https://github.com/anzchy/analyst-pro-plugins/issues/1)
Status: APPROVED — implementing
Date: 2026-05-06
Mode: Intrapreneurship (internal VC tooling)

---

## 1. Problem

VC 分析师每季度需要为每个被投企业产出一份结构化投后跟踪报告，覆盖股权变动、经营情况、财务表现、竞品动态、风险小结。现状：手工拼装，单份耗时 0.5–1 天；财务部分容易出现单位错算或与合并报表不一致；竞品部分需要重复跑公开信息检索。

## 2. Reference materials read

参照样本：
- `docs/reference/202603 矽昌通信2025Q4投后跟进报告.pdf` — 真实投后报告（5 章节，~30 页）
- `docs/reference/20251231-202512矽昌通信合并报表.pdf` — 同一公司同一时点的合并三表（元单位）

校核结果：投后报告 P9 资产负债表里「短期借款 7,657.44 万元」「未分配利润 -55,195.35 万元」与合并报表 P1 的 `76,574,411.15` / `-551,953,459.10` 元完全一致（元 → 万元）。**财务部分是从合并报表逐项搬运 + 比率计算 + 文字解读，绝无 LLM 编造数字的空间。**

## 3. Confirmed premises

| # | Premise | Status |
|---|---|---|
| P1 | 归属 `analyst-deal` 插件，命名 `/analyst-deal:portfolio-tracking` | ✅ confirmed |
| P2 | 财务环节严格不让 LLM 写数字 — 抽取 + 单位换算 + 比率公式作为常量，LLM 只写解读 | ✅ confirmed |
| P3 | 行业部分两阶段：AskUserQuestion 收竞对名单（继承上期可增删）→ 每家独立调研 | ✅ confirmed |
| P4 | 每季度输出一份完整新报告；章节一 / 章节二历史轮次从上期继承 | ✅ confirmed |
| P5 | 输入：合并报表（必备）+ 上期报告 / 董事会材料 / 访谈 / 新闻（可选）；输出 `./portfolio/{slug}/{YYYYQX}_post_investment_tracking.md` | ✅ confirmed |
| P6 | 财务环节单独抽成一个 sub-agent（不放主 skill 内联）— 与 competitor-enricher 同构 | ✅ confirmed (issue user request) |

## 4. Architecture

### Component map

```
analyst-deal/
├── commands/
│   └── portfolio-tracking.md          # 主命令：编排 + 章节 一/二/三(一)/五
├── agents/
│   ├── financial-analyzer.md          # sub-agent：合并报表 → 三表 + 比率 + 解读
│   └── competitor-enricher.md         # sub-agent：单家竞对 → 档案块（可并行多实例）
└── knowledge/
    ├── portfolio-tracking-template.md # 报告骨架 + 占位符（与样本结构 1:1）
    ├── financial-ratios.md            # 比率公式常量（毛利率/费用率/...）
    └── competitor-card-schema.md      # 竞对档案块输出 schema
```

### Call graph (one quarterly run)

```
User: /analyst-deal:portfolio-tracking 矽昌通信 2025Q4
  │
  ├─► [Preflight] jina + JINA_API_KEY 检查（沿用 deal-analysis 模式）
  │
  ├─► [Step 1 — Inputs] AskUserQuestion 收：合并报表路径 + 季度标识 + 上期报告（可选）
  │
  ├─► [Step 2 — 章节一/二（继承）] 若上期报告存在：抽取并附加新一轮股权变动；否则 AskUserQuestion 收基础信息
  │
  ├─► [Step 3 — 章节三(一) 经营情况]
  │       读 ./portfolio/{slug}/ 下的董事会材料 / 访谈 / 季报，按模板写经营段落
  │
  ├─► [Step 3.5 — 骨架写盘] Write 主报告 `$REPORT_PATH`，章节一/二/三(一) 实填，
  │       章节三(二)/四/五 留显式占位锚点（FINANCIAL_PLACEHOLDER /
  │       COMPETITORS_BEGIN…END / SECTION_5_PLACEHOLDER）
  │
  ├─► [Step 4 — 章节三(二) 财务情况] ─► dispatch financial-analyzer agent
  │       Agent 输入：合并报表 PDF 路径 + 历史 4 年数据（如有）
  │       Agent 输出：填充好的三表 markdown + 比率表 + 文字解读（~2k tokens）
  │       返回后立即 Edit 替换 FINANCIAL_PLACEHOLDER；主 Agent 仅留 1 句摘要
  │
  ├─► [Step 5 — 章节四 竞争对手] AskUserQuestion 收竞对名单（默认从上期继承）
  │       │
  │       └─► 分批并发 dispatch N × competitor-enricher agent（每批 ≤ 4 家）
  │             每个 Agent 输入：竞对名 + 编号 + 项目背景（行业 / 主产品）
  │             每个 Agent 输出：竞对档案块（~500 tokens，符合 schema）
  │             每家返回后 → Write 缓存 ./competitors/{NN}_{name}.md + Edit 追加主报告
  │             → 主 Agent 丢弃 card 全文，仅保留 {N: name, summary} 供 Step 6 引用
  │             重跑保护：缓存文件已存在则 Read 它，跳过 enricher dispatch
  │
  ├─► [Step 6 — 章节五 小结] Read `$REPORT_PATH` 拿前 4 章节内容，
  │       生成小结后 Edit 替换 SECTION_5_PLACEHOLDER（不保留全文于内存）
  │
  └─► [Step 7 — 终检] Read `$REPORT_PATH`，grep 残留占位锚点 / 检查章节顺序与
        竞对编号连续性；任一失败列入用户摘要，**不**自动修复
```

## 5. Component specs

### 5.1 Main command: `commands/portfolio-tracking.md`

**Frontmatter:**
```yaml
name: portfolio-tracking
description: 生成投后跟踪报告。从合并报表抽取财务、并行调研竞品、综合经营访谈材料。当用户提到"投后报告"、"季度跟进"、"投后跟踪"时触发。
argument-hint: '[公司名] [季度，如 2025Q4]'
model: claude-sonnet-4-6
allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash(jina:*), Agent
```

**Sections (mirrors deal-analysis style):**
1. Failure Mode Preflight — 沿用 jina/JINA_API_KEY/cwd 三件套
2. Step 0 — Parameter Collection（公司名、季度、合并报表路径、上期报告路径）
3. Inheritance — 解析上期报告 / 默认章节一/二骨架
4. Operations narrative — 内联完成（章节三(一)）
5. Initial skeleton write — 写章节一/二/三(一) + 占位锚点到 `$REPORT_PATH`
6. Financial dispatch — 调用 `financial-analyzer` agent → 返回后 Edit 替换 FINANCIAL_PLACEHOLDER
7. Competitor dispatch — AskUserQuestion 收名单 → 分批并发 ≤4 家 `competitor-enricher`；每家返回 → Write `competitors/{NN}_{name}.md` 缓存 + Edit 追加主报告 + 释放内存
8. Summary section — Read 主报告 → 生成章节五 → Edit 替换 SECTION_5_PLACEHOLDER
9. Finalize & verify — grep 残留占位 / 章节顺序 / 编号连续性，输出摘要

### 5.2 Sub-agent: `agents/financial-analyzer.md`

**职责：** 合并报表 PDF/Excel → 结构化三表（万元单位）→ 计算比率 → 写解读段。

**Frontmatter:**
```yaml
name: financial-analyzer
description: 从合并报表 PDF/Excel 抽取资产负债表/利润表/现金流量表，换算单位，计算财务比率，撰写文字解读。仅由 portfolio-tracking 调用。
tools: Read, Bash, Write
model: claude-sonnet-4-6
```

**输入契约：**
```yaml
合并报表路径: <path>
历史报表路径列表: [<path>, ...]   # 可选，用于 4 年同比
公司名: <str>
报告期: <YYYYQX>
```

**输出契约：** 一段固定结构的 markdown，可直接嵌入主报告：
```markdown
### (二) 财务情况
{公司名} 公司 {YYYY-N 年-YYYY 年}Q{X} 财务情况如下…
**1. 财务报表**
**(1) 资产负债表**
[标准 markdown 表格，万元单位，4 年对比]
[资产负债结构文字解读 ~150 字]

**(2) 利润表** ...
**(3) 现金流量表** ...

**2. 财务分析**
[比率表：毛利率/销售费用率/管理费用率/研发费用率/财务费用率，4 年对比]
[~150 字解读]
```

**关键约束：**
- 数字一律从抽取的结构化 JSON 中转写，**禁止任何形式的"约""估""大概"**
- 比率公式作为常量从 `knowledge/financial-ratios.md` 读入，例如：
  - 毛利率 = (营业收入 − 营业成本) / 营业收入
  - 研发费用率 = 研发费用 / 营业收入
- 单位换算系数为常量 `10000`（元 → 万元），不让模型自由发挥
- 解读文字只允许引用已抽取的数字与已计算的比率，不允许引入外部基准（如行业平均）

### 5.3 Sub-agent: `agents/competitor-enricher.md`

**职责：** 单家竞对 → 通过 jina search/read 抓股权结构 + 产品方向 + 融资进展 → 输出档案块。

**Frontmatter:**
```yaml
name: competitor-enricher
description: 调研单家竞品公司的股权结构、产品方向、融资进展，输出统一 schema 的档案块。仅由 portfolio-tracking 调用。
tools: Bash, Read, WebFetch
model: claude-sonnet-4-6
```

**输入契约：**
```yaml
竞对名: <str>
项目背景:
  所属行业: <str>      # e.g., "Wi-Fi 6/7 AP 芯片"
  主产品: <str>        # e.g., "WiFi AP 芯片"
  本公司名: <str>      # 用于差异化叙述
```

**Jina 调用预算：** 每家竞对 ≤ 8 次 jina 调用（避免成本失控）：
- 1× `jina search "{竞对名} 融资 site:36kr.com"`
- 1× `jina read aiqicha.baidu.com/{竞对名}` （工商）
- 1× `jina search "{竞对名} 产品 技术"`
- ≤ 5× `jina read <selected URL>` 取详情

**输出契约：**
```markdown
### N、{竞对名}

**股权结构：**
[markdown 表格：股东 / 持股比例 / 首次持股日期 / 关联机构]

**产品方向：**
{1-2 段 ~150 字，引用具体产品代号 / 客户}

**融资进展：**
[markdown 表格：融资日期 / 轮次 / 金额 / 投资方 / 来源]

**Evidence 来源：**
- {url 1}
- {url 2}
- ...
```

**关键约束：**
- 缺数据时显式标 `数据缺口：股权结构未公开（来源：未在工商系统检索到）`，不允许编造
- 融资金额 / 估值如来自不同源出现冲突，**两个都列出**并标来源
- 不携带主 skill 上下文 — agent 只看到自己的输入契约

### 5.4 Knowledge files

**`knowledge/portfolio-tracking-template.md`** — 报告骨架，含所有 5 章节占位符 + 矽昌样本作为格式参照（脱敏后保留结构）。

**`knowledge/financial-ratios.md`** — 比率公式列表 + 注释（每项注明出自哪一行）：
```yaml
ratios:
  - name: 毛利率
    formula: (营业收入 - 营业成本) / 营业收入
    source_lines: [营业总收入, 主营业务成本]
  - name: 销售费用率
    formula: 销售费用 / 营业收入
  ...
```

**`knowledge/competitor-card-schema.md`** — competitor-enricher 的输出 schema 与样例。

## 6. Distribution / Handoff

- 不需要新 CLI 二进制 — Claude Code plugin 机制覆盖发行
- 用户已通过 `/plugin install analyst-deal@analyst-pro-marketplace` 安装
- 命令在 `analyst-deal/commands/` 目录，agents 在 `analyst-deal/agents/`，符合 Claude Code plugin 标准布局
- CHANGELOG 加一行；analyst-deal/README.md 增加该命令章节
- marketplace 元数据无需变更（同一插件新增命令）

## 7. Decisions (locked)

1. **历史 4 年报表退化模式**：✅ 支持。缺年份在表格中显示 `—`，`financial-analyzer` 必须接受 1–4 年任意数量的合并报表输入，年份从文件名/内容自动识别。
2. **竞对名单跨季度沉淀**：✅ 持久化到 `./portfolio/{slug}/competitors.yml`。每季度从此读取作为默认值，AskUserQuestion 时允许增删；最新名单回写覆盖。
3. **章节一项目概况**：✅ 首次手工录入并存到 `./portfolio/{slug}/project_baseline.yml`，后续季度直接复用，不再询问。
4. **图片处理**：✅ v1 不处理图片。所有图位置留 `[图片占位 — 手工补充：{描述}]` 标记，让分析师事后手工插入。

## 8. Success criteria

- 端到端跑通矽昌通信 2025Q4 用例，输出报告与人工版对比，章节骨架 100% 对齐，财务数字 100% 一致
- 主 skill 上下文 token 用量峰值 ≤ 30k（确保不爆）
- 3 家竞对并行调研在 ≤ 90 秒完成（jina 限速允许）
- 财务环节零幻觉 — 测试用例：故意把合并报表里某行改 0，重跑，agent 必须输出 0 而非旧值

## 9. Next steps (post-approval)

1. 起 `feat/issue-01-portfolio-tracking` 分支
2. 起骨架 — 三个文件（main + 2 agents）+ 三个 knowledge 文件，先用矽昌样本喂入跑通
3. 写 `analyst-deal/agents/financial-analyzer.md` + `knowledge/financial-ratios.md`，单独可调用测试（用矽昌合并报表）
4. 写 `analyst-deal/agents/competitor-enricher.md` + 用至成微 / 爱科微跑单元测试
5. 写主命令编排 + 拼装逻辑
6. 在 `docs/reference/` 用矽昌样本端到端跑一遍
7. README + CHANGELOG + 关闭 issue #1 的 PR

---

**Implementation notes:** 所有 §7 中列出的 Decisions (locked) 已在主命令、两个 sub-agents、三个 knowledge 文件中实施。详见 PR #4 的 commit history。
