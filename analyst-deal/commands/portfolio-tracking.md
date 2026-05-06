---
name: portfolio-tracking
description: 生成被投企业的季度投后跟踪报告。从合并报表抽取财务三表、按 competitors.yml 并行调研竞品、综合经营访谈材料按 5 章节模板输出。当用户提到"投后报告"、"投后跟踪"、"季度跟进"、"投后管理分析"时触发。
argument-hint: '[公司名] [季度，如 2025Q4]'
model: claude-sonnet-4-6
allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash, Bash(jina:*), Agent
---

<!-- Hand-written for analyst-pro-plugins (manual-handwritten mode). Do NOT regenerate via build-from-source.ts — your edits will be preserved across rebuilds. -->

# Portfolio Tracking（投后跟踪报告）

为 `$ARGUMENTS` 生成季度投后跟踪报告，输出到 `./workspace/state/portfolio/{slug}/{YYYYQX}_post_investment_tracking.md`。

报告 5 章节结构（来自 `${CLAUDE_PLUGIN_ROOT}/knowledge/portfolio_tracking_template.md`）：
1. 项目概况（首次手工录入，跨季度复用）
2. 投资后股权变更
3. 业务发展（经营情况 内联 + 财务情况 dispatch `financial-analyzer`）
4. 行业发展（并行 dispatch N × `competitor-enricher`）
5. 小结

## Failure Mode Preflight (hard-fail by default)

Run these checks before Step 0; abort on any failure.

1. **`jina` CLI + `JINA_API_KEY` available**:
   - Run via Bash: `which jina && [ -n "${JINA_API_KEY}" ] && echo OK || echo FAIL`
   - On FAIL → output exactly:
     "本命令需要 jina-cli + JINA_API_KEY。请：
      pip install jina-cli
      export JINA_API_KEY=jina_xxxxxx
      然后重启 Claude Code 重试。"
     Then end the session — do NOT continue.

2. **Plugin-shipped knowledge files readable**: each of the following must Read successfully:
   - `${CLAUDE_PLUGIN_ROOT}/knowledge/portfolio_tracking_template.md`
   - `${CLAUDE_PLUGIN_ROOT}/knowledge/financial_ratios.md`
   - `${CLAUDE_PLUGIN_ROOT}/knowledge/competitor_card_schema.md`
   If any read fails → output "Plugin install may be corrupted (knowledge file missing). Please reinstall: /plugin uninstall analyst-deal && /plugin install analyst-deal." and end.

3. **CWD writable**: write `.analyst-write-test` then delete it. If fails → HARD FAIL: "CWD 不可写；本命令需写入 ./workspace/state/portfolio/。"

4. **Sub-agents discoverable**: `Glob ${CLAUDE_PLUGIN_ROOT}/agents/financial-analyzer.md` and `${CLAUDE_PLUGIN_ROOT}/agents/competitor-enricher.md` must both exist. If missing → HARD FAIL with reinstall hint.

## Step 0: Parameter Collection

### 0.1 Parse `$ARGUMENTS`

约定：`$ARGUMENTS` 形式为 `<公司名> <季度>`，如 `矽昌通信 2025Q4`。
- 缺公司名 → AskUserQuestion 收
- 缺季度 → AskUserQuestion 收（默认上一个完整季度）

### 0.2 Compute slug

公司名 → slug：保留中文，去空格 + 特殊字符。
例：`矽昌通信` → `矽昌通信`；`DeepFusion Energy` → `deepfusion-energy`。

### 0.3 Ensure project directory

```bash
mkdir -p ./workspace/state/portfolio/{slug}/
```

## Step 1: Load or Create `project_baseline.yml`

路径：`./workspace/state/portfolio/{slug}/project_baseline.yml`

### 1.1 If file exists

Read 并解析；记入 in-memory baseline 用于章节一占位符填充。

### 1.2 If file missing (首次跑此 skill)

通过 AskUserQuestion 引导用户录入基础信息（一次性，后续季度复用）：

```
D1 — 录入项目基线信息（一次性）
Project/branch/task: 投后跟踪 — {公司名} {季度}
ELI10: 这是首次为该公司生成投后报告。需要录入投资协议核心条款，会保存到 project_baseline.yml，今后每季度自动复用，不再问。
Stakes if we pick wrong: 章节一项目概况会缺数据；后续季度仍要补录。
Recommendation: 现在花 2 分钟录入；信息可后续手工编辑 yml 文件修正。
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) 现在录入（recommended）
  ✅ 一次性投入，后续季度免询问
  ❌ 需要手边有投资协议或建议书
B) 跳过，章节一留 [待补充] 占位
  ✅ 可立即生成其他章节
  ❌ 报告不完整；后续季度还得回来补
Net: A 是正路，B 是应急。
```

如选 A，依次收集（每项一个 AskUserQuestion 文本输入）：
- 基金主体名称
- 投资协议签署日期（YYYY-MM-DD）
- 投前估值（亿元）
- 投资金额（万元）
- 持股比例（%）
- 对应注册资本（万元）
- 每股注册资本（元）
- 打款日期（YYYY-MM-DD）
- 工商变更完成日期（YYYY-MM-DD）
- 投资完成时点股权结构表（粘贴 markdown 表格 — 5 列：序号 / 股东 / 认缴出资额 / 持股比例 / 备注）

写入 `project_baseline.yml`：

```yaml
# project_baseline.yml — 由 /analyst-deal:portfolio-tracking 维护
# 首次创建时间: <ISO datetime>
公司名: <str>
基金主体: <str>
投资协议签署日期: <YYYY-MM-DD>
投前估值_亿元: <float>
投资金额_万元: <float>
持股比例_pct: <float>
对应注册资本_万元: <float>
每股注册资本_元: <float>
打款日期: <YYYY-MM-DD>
工商变更完成日期: <YYYY-MM-DD>
初始股权结构_md: |
  | 序号 | 股东 | 认缴出资额（万元）| 持股比例 | 备注 |
  ...
```

如选 B，跳过此步，章节一相关字段填 `[待补充]`。

## Step 2: Load or Initialize `competitors.yml`

路径：`./workspace/state/portfolio/{slug}/competitors.yml`

### 2.1 If file exists

Read 并解析为竞对名单；显示给用户：

```
D2 — 确认竞对名单
当前 competitors.yml 中有 N 家竞对：
  1. {name1}
  2. {name2}
  ...

如何处理本季度竞对名单？
A) 沿用全部（recommended，如果这是常规季度跟踪）
B) 增删调整（再追问一次具体增删）
C) 全部重写
```

### 2.2 If file missing

AskUserQuestion 让用户输入 3-5 家竞对（每家一个文本框），写入：

```yaml
# competitors.yml — 由 /analyst-deal:portfolio-tracking 维护
# 末次更新: <ISO datetime>
竞对列表:
  - 名称: <str>
    备注: <str>          # 可选
  - ...
```

### 2.3 Capture project context for enricher

为后续 Step 5 dispatch 准备：

```yaml
项目背景:
  本公司名: <从 baseline / 命令参数>
  所属行业: <AskUserQuestion 一次，写入 baseline 复用>
  主产品: <AskUserQuestion 一次，写入 baseline 复用>
  本公司差异点提示: <可选；AskUserQuestion>
```

如 baseline 已有这些字段则直接复用，不重问。

## Step 3: Collect Quarterly Inputs

AskUserQuestion 收集本季度新材料路径，全部为可选：

```
D3 — 本季度材料路径（全部可选）
- 合并报表 PDF/xlsx 路径（必备 — 本期 + 历史 1-3 期）
- 上期投后报告路径（用于继承章节二的累积股权变更段落）
- 董事会材料目录或文件
- 本季度访谈纪要目录或文件
- 本季度新闻清单或目录
```

合并报表至少 1 期；缺则 abort。

## Step 4: Build Sections 1, 2, 3(I)

### 4.1 章节一：项目概况

从 `portfolio_tracking_template.md` 取章节一模板，用 baseline 字段填充占位符。如 baseline 缺失（用户在 Step 1.2 选 B），全部相关字段填 `[待补充]`。

### 4.2 章节二：股权变更

如有上期报告路径：
- Read 上期报告，定位「二、我司投资后公司股权变更情况」整段，复制到本季度报告作为基础
- 询问 AskUserQuestion：本季度是否有新增轮次 / 反摊薄触发 / 新增工商变更？
  - A) 有 — 收集本轮信息（轮次代号、投前估值、投资金额、新股权结构 md 表格）追加到段末
  - B) 无 — 段落保持与上期一致，仅在末尾加一句「{季度} 期间股权结构无变动」

如无上期报告（首次或丢失）：
- 提示用户手工提供本段全部内容（粘贴 md），或填 `[待补充]`

### 4.3 章节三(一)：经营情况

读 Step 3 提供的董事会/访谈/季报/新闻材料，按模板 4 个子段（重大事项、子公司、业务数据、研发进度、重点客户）撰写。

**约束**：
- 时间精度 ≥ `YYYY 年 M 月`，禁止"近期/目前/最近"
- 数字（销量、营收、客户订单）必须可溯源到输入材料；不能溯源时写 `[来源待确认]` 占位
- 段落长度参考样本（每子段 1-3 段，每段 100-200 字）

无输入材料时，整段填 `[待补充 — 缺本季度董事会/访谈/季报材料]`。

## Step 5: Dispatch `financial-analyzer` Agent

Agent tool 调用，子任务名 `financial-analyzer`，输入：

```yaml
合并报表路径列表:
  - path: {Step 3 收到的本期合并报表}
    报告期: {YYYYMMDD，从文件名 / 内容自动识别}
  - ... # 历史期次（如有）
公司名: {baseline.公司名}
报告期: {季度，如 2025Q4}
```

Agent 返回：章节三(二) 完整 markdown 段（详见 `agents/financial-analyzer.md`）。

将返回内容**原样嵌入**章节三(二) 位置。

## Step 6: Parallel Dispatch `competitor-enricher`

对 `competitors.yml` 中的每家竞对，发起一次 Agent 调用 — **同一 message 内多个 Agent tool call 实现并行**。

每家 input：

```yaml
竞对名: {name}
档案块编号: {从 1 开始的整数，按 competitors.yml 顺序}
项目背景: {Step 2.3 收集的项目背景}
```

并行返回后，按编号排序拼接成章节四 主体（含小标题 `(一) 竞争对手情况`）。

如 `competitors.yml` 中有 5+ 家竞对，**分批**：每批 ≤ 4 家并发，避免 jina API 限速；批间无需 sleep。

## Step 7: Build Section 5 (小结)

读完前 4 章节内容（已组装在内存中），按以下结构生成：

```markdown
## 五、小结

### 1. 经营层面
{1-2 点观察，必须引用章节三(一) 的具体事件 / 数字}

### 2. 财务层面
{1-2 点观察，必须引用章节三(二) 的具体比率变化}

### 3. 行业层面
{1-2 点观察，必须引用章节四 的具体竞品动作}

### 4. 风险预警
{1-3 点，必须可溯源至前文}

### 5. 下季度跟进事项
{1-3 项 actionable，须包含具体跟进对象（人/事/时间）}

### 6. 数据缺口
{若前文有 [待补充] 或 — 占位，逐项列出}
```

**约束**：
- 禁止泛泛"建议关注"、"持续观察"等无具体动作的措辞
- 每个跟进事项必须包含：对象 + 期望产出 + deadline（如有）
- 不引入前 4 章节没有的新数据 / 新论断

## Step 8: Assemble + Write

按 `portfolio_tracking_template.md` 顺序拼接 5 章节，写入：

```
./workspace/state/portfolio/{slug}/{YYYYQX}_post_investment_tracking.md
```

文件名末尾追加 `_post_investment_tracking.md`；如同名文件已存在（用户重跑），追加 `-{ISO timestamp}.md` 副本，不覆盖原文件。

## Step 9: Update `competitors.yml` (lazy persist)

如 Step 2.1/2.2 中竞对名单有调整，把最终名单回写到 `competitors.yml`，更新 `末次更新` 字段。

## Output

向用户输出：
1. 报告文件路径（绝对路径）
2. 5 章节字数统计 + 数据缺口数量摘要
3. 下次跑此命令需要的提醒（缺哪些材料 / 哪些占位需要手工补）

## Style Contract

- 报告语言：与样本一致（中文，正式书面体，第一人称用「我司」）
- 数字格式：万元单位保留 2 位小数；百分比 1 位小数
- 表格：标准 markdown 表格；列对齐推荐使用 `:---:` 等标记
- 标题层级：与模板一致（一/二/三/四/五 → `##`，(一)(二) → `###`，1/2 → `####`，(1)(2) → `#####`）

## HITL

报告生成后**不**自动 push / commit / 分发；仅打印路径 + 摘要。分析师人工审阅后再决定是否分发。
