# Plan: 把 `financial-analyzer` 提取为独立命令 `/analyst-deal:financial-analyzer`

Date: 2026-05-15
Status: PLAN — 待实现
Mode: Builder
作者: Claude Code (应 jack 要求)

---

## 1. 目标

新增一个独立命令 `/analyst-deal:financial-analyzer <target_folder>`，让分析师**不跑完整投后报告**也能：

1. 扫描 `target_folder` 下的「财务报表 PDF」与「历年财务报表 xlsx / csv」
2. 让用户确认扫到的文件 + 每份 PDF 对应的报告期
3. 调用**现有的** `analyst-deal:financial-analyzer` 子 agent 从 PDF 抽数（零 LLM 编造）
4. 把抽出的三表数字**逐期并入**历年财务报表 xlsx / csv（每份 PDF 一列，按报告期从早到晚）

> 命名空间已确认：归 `analyst-deal` 插件，命令文件 `analyst-deal/commands/financial-analyzer.md`，调用 `/analyst-deal:financial-analyzer`。与已有 `/analyst-deal:competitor-enricher` 完全对称——后者就是把 `competitor-enricher` 子 agent 包成独立命令的先例，本命令照抄其骨架。

**附加目标（见第 8 节）**：`/analyst-deal:portfolio-tracking` 能直接**复用**这两个独立 skill 已产出的成果——`competitor-enricher` 生成的竞对 md 档案、`financial-analyzer` 处理好的项目财务报告（xlsx/csv + 当期 markdown 段）——来更新 `2026Q1_post_investment_tracking.md`，**不重复**派发子 agent / 不重复抽数。

---

## 2. 现状：portfolio-tracking 里这块怎么实现的（可借鉴的资产）

financial-analyzer 在主命令里横跨 **Step 5 + Step 5.5** 两段，两个组件清晰可拆：

### 2.1 子 agent `agents/financial-analyzer.md`（**原样复用，零改动**）

- **输入契约**（parent 传入）：

  ```yaml
  合并报表路径列表:
    - path: <路径>
      报告期: <YYYYMMDD>
  公司名: <str>
  报告期: <YYYYQX>            # 仅用于 markdown 章节标题
  当期报告期日期: <YYYY-MM-DD>  # 决定哪一期写进 YAML 侧文件
  YAML 输出路径: <路径>
  ```

- **双重产出**：
  1. **返回值** = 章节三(二) 完整 markdown（资产负债表/利润表/现金流量表 + 5 个比率 + 文字解读 + Evidence Ledger）
  2. **侧文件** = `current_quarter_financials.yml`，只含「当期报告期日期」那一期的全部抽取行，**key 逐字使用合并报表行项原文**（`货币资金`、`一、营业总收入`…），value 统一万元保留 2 位小数，缺数据写 `null`

- **硬规则**：数字零幻觉（每项可溯源行号，否则 `—`）、公式从 `knowledge/financial_ratios.md` 读、元→万元系数 10000、比率 1 位小数、扫描件无文本层直接 abort（不 OCR）、prompt injection guard。

**结论**：抽数 + 单位换算 + 比率 + YAML 侧文件，子 agent 已经全包了。新命令**不碰子 agent**，只负责"扫文件 → 排期 → 派发 → 把 YAML 并进表格"。

### 2.2 Step 5.5 的 xlsx 合并 Python（**抽成可复用脚本**）

主命令 Step 5.5 那段 inline Python 是现成的合并算法，逻辑：

- `openpyxl.load_workbook(data_only=False)` 保留公式
- 定位 sheet `三大财务报表`
- 在 row 1 找**最晚的 datetime 单元格**作为锚点列
- 决策：`TARGET == latest` → 原地清空覆盖（idempotent 重跑）；`TARGET > latest` → `insert_cols` 新列；`TARGET < latest` → abort（不向回写）
- 行分类 `classify()`：`SILENT_IGNORE`（列头/分段标签，不计 missing）/ `SKIP_EXACT` + `*合计/*小计/*率` 后缀（小计与比率行交给 Excel 公式）/ `write`（detail 行按 A 列原文精确匹配 YAML key 写值）
- 报告 written / skipped / missing（label drift 检测）
- 通用季度：不硬编码列字母，靠"最晚 datetime + 1"动态前进

**结论**：xlsx 分支直接复用这段算法，只需把它**参数化**（`XLSX_PATH` / `YAML_PATH` / `TARGET_DATE`）并支持**循环多期**调用。

### 2.3 命令骨架可借鉴 `commands/competitor-enricher.md`

Preflight 段、Prompt Injection Guard 段、`$ARGUMENTS` 解析、并发分批派发、单批返回即落盘 + 释放内存、HITL 不自动 commit——结构整段照搬，把"竞对"换成"财报"。

---

## 3. 与现状的差异 / 净新增工作

| # | 差异 | 处理 |
|---|---|---|
| D1 | 输入是任意 `target_folder`，不是 `portfolio/{slug}/` | 新扫描逻辑：glob PDF + xlsx/csv，AskUserQuestion 确认 |
| D2 | 无 `{季度}` 参数 | 每份 PDF 的报告期从**文件名 `YYYYMMDD` 或 PDF 表头**识别，用户确认 |
| D3 | 多份 PDF 全部并入（已确认） | 按期**循环**：每份 PDF 各派一次子 agent（该期作 `当期`）→ 各得一份 YAML → 按报告期从早到晚依次 merge |
| D4 | 历年文件可能是 **csv**（用户明确提到） | 新增 csv 分支：openpyxl 只吃 xlsx；csv 用 pandas / `csv` 模块实现等价的"插列 + 行分类 + 写值"。**净新增模块，需单测** |
| D5 | 无 baseline → 缺 `公司名` | AskUserQuestion 收一次（仅用于 markdown 标题，可选；不影响 xlsx 合并） |
| D6 | 子 agent 单期 YAML，多期需多次调用 | 子 agent 不改；命令层循环 N 次，单元素 `合并报表路径列表`，每次换 `当期报告期日期` 与独立 YAML 路径 |

---

## 4. 命令设计 `analyst-deal/commands/financial-analyzer.md`

Frontmatter（仿 competitor-enricher）：

```yaml
---
name: financial-analyzer
description: 独立调用 financial-analyzer 子 agent，扫描目标文件夹的财报 PDF + 历年财务报表 xlsx/csv，抽取三表数字并按报告期逐列并入表格。当用户只需把财报 PDF 数字整合进 Excel、不需要完整投后报告时触发。
argument-hint: '<target_folder> [--xlsx <历年表路径>] [--company <公司名>]'
model: claude-sonnet-4-6
allowed-tools: Read, Write, Edit, AskUserQuestion, Bash, Glob, Agent
---
```

> 注意：**不需要** `Bash(jina:*)`（财报抽取不联网，纯本地 PDF/Excel），与 competitor-enricher 的关键区别。

### Step 0 — Preflight（hard-fail）

照搬 competitor-enricher 模式，去掉 jina 检查：

1. `${CLAUDE_PLUGIN_ROOT}/knowledge/financial_ratios.md` 可读，否则 reinstall 提示
2. `Glob ${CLAUDE_PLUGIN_ROOT}/agents/financial-analyzer.md` 必须命中
3. `target_folder` 存在且可写（要写 YAML 侧文件 + 改 xlsx）
4. `python3 -c "import openpyxl"` 可用；若历年文件是 xlsx 必需，缺则提示 `pip install openpyxl`；csv 分支需 `pandas` 或退回标准库 `csv`

### Step 1 — 解析 `$ARGUMENTS` + 扫描 target_folder

- `$ARGUMENTS` 第一段 = `target_folder`（必填，缺则 AskUserQuestion 收）
- 可选 `--xlsx <path>` 显式指定历年表；`--company <名>` 跳过 D2 提问

扫描（Bash glob，`2>/dev/null`）：

```bash
TF="<target_folder>"
# 财报 PDF：财务报表 / 合并报表 / YYYYMMDD 命名
ls -la "$TF"/*财务报表*.pdf "$TF"/*合并报表*.pdf \
       "$TF"/[0-9][0-9][0-9][0-9][0-1][0-9][0-3][0-9]*.pdf 2>/dev/null
# 历年财务报表 xlsx / csv（排除 Excel 锁文件 ~$）
ls -la "$TF"/*历年财务报表*.xlsx "$TF"/*历年财务报表*.csv \
       "$TF"/*财务报表*.xlsx 2>/dev/null | grep -v '/~\$'
```

每份 PDF 的报告期识别顺序：① 文件名 `YYYYMMDD` ② 失败则标 `?` 待用户在 D1 填。

### Step 2 — D1：确认文件清单 + 报告期映射

AskUserQuestion（带 ELI10 / Stakes / Recommendation / Net，与现有命令风格一致）：

```
D1 — 扫描结果确认
财报 PDF（N 份，按报告期排序）：
  1. 20231231-...合并报表.pdf   → 报告期 2023-12-31
  2. 20241231-...合并报表.pdf   → 报告期 2024-12-31
  3. 20251231-...合并报表.pdf   → 报告期 2025-12-31
历年财务报表：./...历年财务报表.xlsx   （或 "未找到 → 仅生成 markdown，不并表"）

A) 全部并入（recommended）
B) 改报告期 / 增删 PDF（再追问）
C) 取消
```

- 无 PDF → abort："target_folder 下未发现财报 PDF"
- 无历年表 → 允许继续，只产出 per-period markdown + YAML，**跳过合并**（Output 提示用户放历年表后重跑）
- 历年表锁文件 `~$...` 存在 → hard-fail（照搬 Step 5.5.1 提示，要求关 Excel 重跑）

可选 D2 收 `公司名`（仅 markdown 标题用；用户给 `--company` 则跳过）。

### Step 3 — 按期循环派发 `analyst-deal:financial-analyzer`

PDF 按报告期**从早到晚**排序。分批并发（每批 ≤ 4，同 message 多个 Agent tool call），每份独立 input：

```yaml
合并报表路径列表:
  - path: <该期 PDF>
    报告期: <YYYYMMDD>
公司名: <Step 2 收的，或 "（未指定）">
报告期: <YYYYQX 由 YYYYMMDD 派生：0331→Q1 / 0630→Q2 / 0930→Q3 / 1231→Q4>
当期报告期日期: <YYYY-MM-DD>
YAML 输出路径: <target_folder>/.fin-cache/<YYYYMMDD>_financials.yml
```

> `.fin-cache/` 作为 per-period YAML 缓存目录（类比 competitor-enricher 的 `competitors/` 缓存）。已存在且非空则**跳过该期 dispatch**，直接复用——支持中断重跑。

单批返回后：把每份返回的 markdown 写 `<target_folder>/.fin-cache/<YYYYMMDD>_section.md`（审计/留底），主 agent 仅留 `{period, yaml_path, done:true}`，丢弃 markdown 全文（控内存，照搬现有"释放工作内存"模式）。

校验每份 YAML 侧文件已写出（`test -s`），MISSING 的期在 Output 标注并跳过其合并。

### Step 4 — 把各期 YAML 逐列并入历年表（核心净新增）

抽出可复用脚本 **`analyst-deal/scripts/merge_financials.py`**（把 Step 5.5.2 的 inline Python 参数化 + 加 csv 分支 + 加 `__main__` CLI）：

```
python3 scripts/merge_financials.py \
    --target  <历年表 xlsx 或 csv> \
    --yaml    <某期 financials.yml> \
    --date    <YYYY-MM-DD>
```

命令层**按报告期从早到晚**对每份 YAML 调用一次。脚本内部：

- **xlsx 分支**：原样复用 Step 5.5.2 算法（最晚 datetime 锚点 → insert/overwrite/abort、`SILENT_IGNORE`/`SKIP_EXACT`/后缀分类、A 列原文精确匹配、written/skipped/missing 报告、idempotent 重跑）。常量 `SHEET="三大财务报表"`、`SILENT_IGNORE`、`SKIP_EXACT` 原样搬过来。
- **csv 分支（净新增）**：等价语义——读 csv→DataFrame，row 0 当表头找最晚日期列，按同一 `classify()` 决定 insert/overwrite，按首列原文 label 匹配 YAML key 写值，回写 csv。csv 无公式，小计/比率行只能留空（Output 提示需手工补或转 xlsx 用 SUM）。
- 多次调用天然处理多期：第一份（最早期）可能 insert，后续每份按各自 date 继续 insert/overwrite，列从早到晚自然排布。

stdout（OK / INSERT / NOTE / Missing labels）原样汇总进 Output。

### Step 5 — Output

1. 历年表绝对路径 + 每期写入哪一列（列字母/索引 + 日期）
2. per-period 缓存目录 `<target_folder>/.fin-cache/`（写入/复用清单）
3. 各期 written / skipped(小计·比率) / missing(label drift) 计数；有 missing 列出具体 label
4. 提醒：小计/比率列待手工补或改 SUM 公式；csv 目标无公式；下次重跑会复用 `.fin-cache/` 并 idempotent 覆盖同期列
5. HITL：不自动 commit/分发，仅打印路径 + 摘要

---

## 5. 净新增文件清单

| 文件 | 类型 | 来源 |
|---|---|---|
| `analyst-deal/commands/financial-analyzer.md` | 新建 | 骨架仿 `commands/competitor-enricher.md`，Step 5.5 提示语复用 |
| `analyst-deal/scripts/merge_financials.py` | 新建 | Step 5.5.2 inline Python 参数化 + csv 分支 + CLI |
| `analyst-deal/scripts/test_merge_financials.py` | 新建 | 单测：insert / overwrite-idempotent / 拒绝向回写 / 行分类 / label drift / xlsx & csv 两分支 |
| `analyst-deal/commands/portfolio-tracking.md` | **改** | 第 8 节：Step 5.0 预产物探测 + D-FIN 决策 + Step 5.5 调共用脚本；Step 6 加 `--competitors-dir` 兜底；行为默认不变（未命中即回退现状） |
| `agents/financial-analyzer.md` | **不改** | 原样复用，避免回归 portfolio-tracking |
| `docs/designs/issue-XX-financial-analyzer.md` | 可选 | 若走 issue 流程，补设计文档 |

> 重构建议：Step 5.5.2 在 `portfolio-tracking.md` 里是 inline Python。提取 `merge_financials.py` 后，**两处共用同一脚本**——portfolio-tracking Step 5.5 改成调 `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/merge_financials.py ...`，消除复制粘贴。属可选改进，需回归测 portfolio-tracking 不破。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 多份 PDF = 多次子 agent 派发，成本/时延 | 分批并发（≤4/批）；`.fin-cache/` 跳过已抽期 |
| csv 分支与 xlsx 语义不一致 | 单测对拍：同一 YAML 写 xlsx 与 csv，detail 行值必须一致 |
| label drift（子 agent 行项原文 vs 历年表 A 列）| 复用现有 missing 报告；Output 显式列出，不静默 |
| 扫描件 PDF 无文本层 | 子 agent 已 abort（不 OCR）；命令层把该期标 failed 跳过，不影响其他期 |
| 子 agent 改动波及 portfolio-tracking | 本计划**不改子 agent**；仅命令层 + 新脚本 |
| 历年表被 Excel 打开 | 复用 Step 5.5.1 锁文件 hard-fail 提示 |
| 报告期早于历年表已有最新列 | 复用脚本 `TARGET < latest → abort` 规则，不向回写 |
| 预产物认领误用旧 section.md（PDF 已更新但缓存没刷新） | D-FIN 决策点给用户 B 选项强制重 dispatch；幂等 merge 可覆盖 |
| 改 portfolio-tracking 引入回归 | 预产物**未命中时行为完全不变**（纯增量分支）；回归测：无预产物场景跑一遍确认与改前一致 |
| 竞对/财务预产物部分缺失 | per-家 / per-期 粒度回退 dispatch，已有的复用（沿用 Step 6.2 现有粒度） |

---

## 7. 实施步骤（建议顺序）

1. 抽 `scripts/merge_financials.py`：搬 Step 5.5.2 算法 → 参数化 → 加 `argparse` CLI → 加 csv 分支
2. 写 `scripts/test_merge_financials.py`，覆盖第 5 节列出的 6 类 case，`python3 -m pytest` 绿
3. 写 `commands/financial-analyzer.md`（Preflight→Step1 扫描→D1 确认→Step3 派发→Step4 调脚本→Output）
4. 端到端验证：用 `docs/reference/20251231-202512矽昌通信合并报表.pdf` 单期跑通；构造一份 `历年财务报表.xlsx` 跑多期 insert + idempotent 重跑
5. 回填 portfolio-tracking Step 5.5 改调共用脚本（消除 inline Python 复制），回归 portfolio-tracking 无预产物场景
6. **第 8 节集成**：portfolio-tracking 加 Step 5.0 财务预产物探测 + D-FIN 决策；Step 6 加 `--competitors-dir` 兜底参数；验证三种场景——(i) 无预产物=行为不变 (ii) 仅财务预产物 (iii) 财务+竞对都预产物（走完整 8.4 端到端序列）
7. CHANGELOG + README 命令清单补条目；若用 build-from-source 流程，命令文件加 `<!-- Hand-written ... -->` 头（与 portfolio-tracking 一致，避免被 regenerate 覆盖）

---

## 8. 把独立 skill 产物回灌进 `/analyst-deal:portfolio-tracking`

目标：分析师可以先**分别**跑 `/analyst-deal:competitor-enricher` 和 `/analyst-deal:financial-analyzer` 把竞对档案、财务表准备好（人工审过），再跑 `/analyst-deal:portfolio-tracking 矽昌通信 2026Q1`，主命令**自动认领**这些成果生成 `2026Q1_post_investment_tracking.md`，跳过对应的子 agent 派发。

### 8.1 复用机制现状（好消息：竞对侧已存在）

portfolio-tracking **Step 6.2「中断恢复（重跑友好）」已经实现竞对复用**：

> 如 `./portfolio/{slug}/competitors/{NN}_{name-slug}.md` 已存在且与 `competitors.yml` 当前条目匹配，主 Agent **跳过** dispatch，直接 Read 已缓存的 card 走 6.1(b)(c) 追加到主报告。

并且独立 `competitor-enricher` 命令的 Step 4 Output 已经明确提示用户把产物挪进 `portfolio/{slug}/competitors/`（命名 `{NN}_{name-slug}.md`）复用。**竞对侧的复用约定已成形，只差把"手工挪文件"自动化**。

财务侧目前**没有**复用：portfolio-tracking Step 5 无条件 dispatch financial-analyzer、Step 5.5 无条件跑 merge。本节为财务侧补一个对称的"预产物认领"路径。

### 8.2 设计原则：约定优先，显式参数兜底

| 方式 | 说明 | 取舍 |
|---|---|---|
| **A) 约定路径自动发现（推荐）** | 两个独立 skill 默认就把产物写进 portfolio slug 目录的标准缓存子目录；portfolio-tracking 原样靠现有 Step 6.2 式探测自动认领，**零新参数** | 与现有 Step 6.2 哲学一致；用户跑独立 skill 时只需把 `--out` / `target_folder` 指向 slug 目录 |
| B) 显式参数兜底 | portfolio-tracking 新增 `--competitors-dir <path>` / `--financial-from <target_folder>`，产物在别处时手动指 | 灵活但增加参数面；作为 A 的 fallback |

推荐 **A 为主、B 兜底**。统一约定路径（slug = portfolio 命令算出的项目 slug）：

- 竞对档案：`./portfolio/{slug}/competitors/{NN}_{name-slug}.md`（**已是现状约定**）
- 财务产物：
  - 历年表：`./portfolio/{slug}/*历年财务报表*.xlsx|csv`（**已是 Step 5.5 扫描约定**）
  - 当期 markdown 段 + YAML：`./portfolio/{slug}/.fin-cache/<当期YYYYMMDD>_section.md` / `_financials.yml`（独立 financial-analyzer 第 3 节定义的缓存目录）

→ 推论：独立 `financial-analyzer` 的 `target_folder` 默认建议设为 slug 目录时，产物天然落在 portfolio-tracking 认得的位置；竞对独立命令 `--out` 同理。**不强制**——B 兜底覆盖"产物在 Downloads 临时目录"场景。

### 8.3 portfolio-tracking 改动点（精确到 Step）

**(a) Step 6 竞对——把"手工挪"升级为"自动认领"**

现状已支持读 slug 缓存目录的 `{NN}_{name-slug}.md`。改动很小：

- 新增可选参数 `--competitors-dir <path>`（B 兜底）：若给，Step 6 先把该目录下 `{NN}_{name-slug}.md` 按 `competitors.yml` 匹配**软链/复制**进 slug `competitors/`，再走现有 6.2 复用逻辑
- 不给参数时：行为完全不变（现有 Step 6.2 已能复用 slug 目录里已有的 md）
- D2 竞对名单确认处增一句提示："检测到 {N} 家已有独立 enricher 档案缓存，将直接复用，不重新调研"

**(b) Step 5 / 5.5 财务——新增"预产物认领"分支**

在 Step 5.1 之后、5.2 dispatch 之前插入 **Step 5.0「预产物探测」**：

```
探测 ./portfolio/{slug}/.fin-cache/<当期YYYYMMDD>_section.md
  且 同目录 <当期YYYYMMDD>_financials.yml 存在
  且 历年表已含 <当期日期> 列（merge 脚本幂等可复查）
→ 命中："财务预产物已就绪（来自 /analyst-deal:financial-analyzer），复用"
   - Step 5.2/5.3 dispatch 跳过；直接 Read section.md → Edit 替换 FINANCIAL_PLACEHOLDER
   - Step 5.5 merge 跳过（独立 skill 已并表）；仅做幂等校验 test：历年表当期列已存在 ⇒ OK
→ 未命中：回退现状（dispatch financial-analyzer + 跑 Step 5.5），行为不变
```

并加一个 AskUserQuestion 决策点（仅在命中时弹，给用户否决权）：

```
D-FIN — 检测到财务预产物
ELI10: 你之前用 /analyst-deal:financial-analyzer 处理过本期财报，已生成当期段落 + 并好历年表。
Recommendation: 复用（省一次子 agent 派发 + 抽数）；除非你刚换了新版合并报表 PDF。
A) 复用预产物（recommended）
B) 忽略，重新 dispatch financial-analyzer（PDF 有更新时选）
Net: A 省时且与独立 skill 产物一致；B 用于 PDF 已更新需重抽。
```

**(c) 一致性护栏**

- 预产物认领时，主命令仍跑 Step 8 占位符/章节顺序校验——确保认领的 section.md 真的填进了 `FINANCIAL_PLACEHOLDER`、没有残留
- 竞对 / 财务任一类预产物**部分缺失**（如 3 家竞对只有 2 家有缓存）→ 缺的那部分回退正常 dispatch，已有的复用（与 Step 6.2 现有 per-家 粒度一致）
- `.fin-cache/` 的 YAML 与历年表当期列不一致风险：merge 脚本幂等，必要时 D-FIN 选 B 重跑即可覆盖；不静默信任

### 8.4 端到端使用序列（目标体验）

```
1. /analyst-deal:financial-analyzer ./portfolio/矽昌通信
      → 抽 PDF、并表、写 .fin-cache/20260331_section.md + _financials.yml
2. /analyst-deal:competitor-enricher 至成微 朗力 速通 \
      --out ./portfolio/矽昌通信/competitors
      → 写 01_至成微.md / 02_朗力.md / 03_速通.md
3. （分析师人工审阅上述产物，必要时手工订正）
4. /analyst-deal:portfolio-tracking 矽昌通信 2026Q1
      → Step 5.0 命中财务预产物 → 复用 section.md，跳过 dispatch + merge
      → Step 6.2 命中竞对缓存 → 复用 3 家 md，跳过 dispatch
      → 仅新跑 章节一/二/三(一)/五 → 落盘 2026Q1_post_investment_tracking.md
```

净效果：主命令从"全自动重算"变成"编排 + 认领人工已审过的预产物"，更快、且分析师对财务/竞对有人工 gate。

---

## 9. 一句话总结

子 agent（抽数+换算+比率+YAML）和 Step 5.5 合并算法都现成、可零改动复用；独立 `financial-analyzer` 命令净新增的只有「扫 target_folder → 确认报告期 → 按期循环派发 → 调参数化的 merge 脚本」这层编排 + 一个 csv 分支。竞对侧复用机制（Step 6.2）已存在，财务侧补一个对称的"预产物认领"分支（Step 5.0 + D-FIN），即可让 `/analyst-deal:portfolio-tracking` 直接吃两个独立 skill 人工审过的成果生成季度报告。骨架全程照抄 `competitor-enricher` 独立命令先例。

---

## GSTACK REVIEW REPORT

Generated by `/plan-eng-review` on 2026-05-15 · branch `master` · reviewer model Opus 4.7 · outside voice Codex (gpt-5.5)

### Verdict

**Plan is sound but its headline claim is wrong.** §9 says the sub-agent and Step 5.5 merge are "可零改动复用" (zero-change reuse). They are **not**: the YAML side-file contract is broken in the user's actual environment (PyYAML absent everywhere — `web-scrape` and base), so the existing `portfolio-tracking` Step 5.5.2 is *already* failing today, and the new command would inherit that failure. The review converts this from "thin orchestration glue" into a small but real engineering change with one contract migration.

### Decisions locked (interactive, user-confirmed)

| # | Area | Decision |
|---|------|----------|
| A1 | PR split | **PR1 = §1–7** (standalone command), **PR2 = §8** (portfolio-tracking pre-artifact claiming), built later |
| A2 | Side-file contract | **YAML → stdlib JSON.** Fixes existing breakage. **Invalidates §9 "零改动"** — agent Step 4.5 *must* change to `json.dump(..., ensure_ascii=False, indent=2)` |
| A3 | Python env pin | Preflight: `conda activate web-scrape` via absolute `conda.sh` path + discover-or-hard-fail. Recorded in `analyst-deal/CLAUDE.md` |
| A4 | CSV strategy | **stdlib `csv` only, mutate-in-place, value pipeline shared with xlsx branch.** Parity test mandatory. *(Codex #6 disagreed — overridden by User Sovereignty; deliberate cross-model divergence)* |
| CQ1 | Single source | `merge_financials.py` mandatory in PR1; `portfolio-tracking` Step 5.5.2 rewired to call it (no duplicated merge logic) |
| CQ2 | Cache staleness | mtime guard: re-dispatch iff PDF mtime > cache mtime. *(Codex #2 sha256-manifest refinement declined — cross-model divergence; mtime-goes-backward → stale is an accepted documented limitation)* |
| CQ3 | Period parser | First filename token that `datetime.strptime`-validates wins; none valid → `'?'` → D-question |
| T1 | Test contract | utf-8-sig read pinned + ISO `YYYY-MM-DD` period headers + csv encoding test matrix |
| P1 | Concurrency | Keep per-period N agent calls (no batching); document the per-period failure/recovery contract |
| OV1 | Backfill | **Replace `TARGET < latest → abort` with insert-in-order**: find first existing column with date > TARGET, insert before it; `==` → overwrite; newer-than-all → append. Regression fixture must cover backfill; quarterly-append path in `portfolio-tracking` must be re-verified |

### Codex findings dispositioned

- **Built into PR1** (user chose build-now over defer): `--extract-only` flag (#7); folder-scoped cache path `.fin-cache/<sha8(abs_folder)>/<pdf>.json` (#13); explicit anti-fabrication line in agent Step 4.5 — *missing/unreadable → null, never inferred*, piggybacks the JSON edit (#15); period-collision **hard-stop guard** — two PDFs → same period aborts with a D-question instead of silently emitting two half-empty columns (#4).
- **Cross-model divergences, user kept own decision** (User Sovereignty, recorded not auto-applied): #6 CSV-as-new-file rejected; #2 sha256 manifest rejected.
- **PR2-scoped, deferred**: #8, #9, #10, #14 — re-surface when PR2 (§8) is built.
- **Already covered** by the test plan: #5, #11, #12.

### Actual PR1 scope (corrected from §9)

NEW `analyst-deal/scripts/merge_financials.py` — extracted Step 5.5.2 + shared value pipeline + stdlib-csv branch + JSON side-file reader + **insert-in-order chronological merge** + folder-scoped cache path.
NEW `analyst-deal/scripts/test_merge_financials.py` — 15 tests incl. **#15 CRITICAL REGRESSION golden fixture** mirroring real `三大财务报表` sheet, plus backfill + period-collision cases.
NEW `analyst-deal/commands/financial-analyzer.md` — orchestration prompt; `--extract-only` flag; period-collision hard-stop; conda+absolute-path+discover preflight; copies `competitor-enricher` skeleton.
MODIFY `analyst-deal/commands/portfolio-tracking.md` Step 5.5.2 → call shared script (regression surface).
MODIFY `analyst-deal/agents/financial-analyzer.md` Step 4.5 → JSON not YAML **+ anti-fabrication line** (§9 "零改动" claim is **false** — this is a contract change).
MODIFY `analyst-deal/CLAUDE.md` → conda-env requirement (✅ already done during this review).

### NOT in scope (explicitly)

- §8 portfolio-tracking pre-artifact claiming → **PR2**, separate review when built.
- Multi-file-one-period auto-grouping (split 资产负债表/利润表/现金流量表 PDFs) → **documented limitation**, analyst pre-merges; only the collision *guard* (loud failure) is in PR1, not auto-merge.
- One-file-two-period (comparative columns in a single PDF) → agent-side concern, not addressed.
- sha256 content-hash cache key → declined; mtime-only ships.
- pip-installing PyYAML → rejected in favor of stdlib JSON (no new dependency).

### What already exists (reuse, do not rebuild)

- `agents/financial-analyzer.md` — extraction + 万元 conversion + `financial_ratios.md` ratios + prose. Reused; **only Step 4.5 serialization changes**.
- `commands/portfolio-tracking.md` Step 5.5.2 — the merge algorithm being extracted (source of truth for the regression golden fixture).
- `commands/competitor-enricher.md` — skeleton precedent (preflight, injection guard, batch dispatch, HITL) copied verbatim structurally.
- `commands/portfolio-tracking.md` Step 6.2 — competitor cache-reuse pattern that §8 (PR2) will mirror on the financial side.
- Plugin distribution: `marketplace.json` `source: ./analyst-deal` ships the whole dir incl. `scripts/`; `build-from-source.ts` manages only `commands/` + `knowledge/`, so hand-maintained `scripts/` is fine if committed.

### Failure modes (the command must handle each loudly, never silently)

1. PyYAML absent → resolved by JSON; preflight checks `import json` + `import openpyxl` (not openpyxl alone).
2. conda env ≠ `web-scrape` / conda missing → preflight hard-fail with activation hint.
3. xlsx locked (`~$` lockfile present) → hard-fail with close-Excel hint (reuse Step 5.5.1).
4. Scanned PDF, no text layer → that period marked failed; other periods unaffected.
5. **mtime goes backward** (file restore) → silently serves stale cache. **Accepted documented limitation** (CQ2).
6. Two PDFs → same period → hard-stop D-question (collision guard, PR1).
7. Multi-file split-statement filing → partial columns; documented limitation, analyst pre-merges.
8. Malformed / empty / missing JSON side-file → clean error message, not Python traceback (test G1).
9. Non-date period header in csv row 0 → clean error, not silent mis-merge (test G2/9).
10. Label in sheet ∉ JSON → reported as missing, not silently skipped (test case 5).

### Worktree parallelization strategy

Contract-first, then fan out:

- **Step 0 (serialize):** freeze the JSON side-file schema + `merge_financials.py` CLI signature in a one-page contract doc. Everything else depends on this.
- **WT-A** — `merge_financials.py` + `test_merge_financials.py` (the engine; largest, most isolated; owns the contract).
- **WT-B** — `commands/financial-analyzer.md` orchestration prompt (consumes WT-A's CLI; can stub against the frozen contract while WT-A is in flight).
- **WT-C** — the **contract-change pair** that must land in one commit: agent Step 4.5 (JSON + anti-fab) **and** `portfolio-tracking` Step 5.5.2 rewire. Splitting these breaks `portfolio-tracking` in the user's env.

Recommended: WT-A first (or freeze contract doc), then B and C in parallel. C is the regression-risk path — gate it on the golden-fixture test from WT-A going green.

### Confidence

Architecture 9/10 · Code Quality 8/10 · Test 9/10 (golden fixture is the linchpin) · Performance 8/10. Primary residual risk: the WT-C contract-change pair landing atomically and the regression golden fixture faithfully mirroring the real `三大财务报表` sheet.
