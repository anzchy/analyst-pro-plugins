# Plan: `portfolio-tracking` 复用 standalone 产物（固化两条跨命令契约）

Date: 2026-05-17
Status: PLAN — 待实现（设计已锁定，勿重新设计）
Mode: Builder
作者: Claude Code（应 jack 要求，由 `/office-hours` 合并 ADR 0001 + ADR 0002 + handoff-20260517 而成）
来源: `docs/adr/0001-competitor-card-single-schema-branched.md`、`docs/adr/0002-cross-command-reuse-contracts.md`、`docs/adr/handoff-20260517.md`
术语: 见 `CONTEXT.md`（glossary）——务必区分 合并报表 / 历年财务报表 xlsx / fin-cache 留底 / 报告期日期 vs 文件名 token

> **本计划只覆盖 ADR 0002 + handoff 的"复用机制"实现。** ADR 0001 的竞对档案块单 schema + 三分支已随 commit `a36e1ec` 实现并随 0.1.1 发布——它在本计划中是**治理契约（已发布，不改动）**，作为复用机制必须遵守的约束出现（见第 4 节），不是待办工作。

---

## 1. 目标

把已锁定的设计实现进 `commands/portfolio-tracking.md`：让 `/analyst-deal:portfolio-tracking` 先**复用**分析师此前用 standalone `/financial-analyzer` 与 `/competitor-enricher` 留下的产物，而不是每季无条件 re-dispatch 子 agent / re-jina。

把两条原本是"某命令内部实现细节"的产物路径**提升为冻结的跨命令契约**：

1. **fin-cache 留底** — `<folder>/.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>{.json,_section.md}`
   `.json` 已由 `docs/designs/fin-sidecar-contract.md` 冻结；本计划**追加冻结**同目录的 `_section.md`（成品 prose）。
2. **竞对档案块** — 按 `competitor_card_schema.md`，文件名 `{NN}_{name-slug}.md`。

> **这是 prompt-engineering 改动**（改的是命令 `.md` 指令文件），不是常规代码。`/tdd` 的适配方式见第 8 节。

---

## 2. 背景与现状

**为什么做：** 分析师真实工作流是先在文档根目录跑 standalone 命令（`/financial-analyzer`、`/competitor-enricher`），再跑投后报告。每季无条件重复抽取/调研既烧 LLM 成本，又（竞对侧）反复撞 jina 配额。而这两类产物本就是确定性、可定位、自带来源标注的——复用是低风险高收益。

**为什么固化为契约：** 复用方（`portfolio-tracking.md`）与产出方（`financial-analyzer.md`/`competitor-enricher.md`）是两个独立命令文件。这种隐式耦合若无文档，未来任一方改名/改路径会**静默失效**。固化路径/命名为冻结契约，把耦合显式化。

**已就位的资产（同会话产物，可直接当复用 fixture）：** 6 个竞对 card 在
`/Users/jackcheng/Documents/00_已投项目/2021年 格兰菲项目/7、投后管理/3、项目投后管理执行材料/20260513-2026年第一季度跟进/`
（CWD 根，即 `01_英伟达.md` … `06_景嘉微.md`，其中 `05_龙芯中科.md`/`06_景嘉微.md` 带 ⚠️ 数据完整性声明）。

**计划血缘：** 前序计划 `docs/plans/archive/financial-analyzer-standalone-command.md`（已实现、已归档）第 8 节把"portfolio-tracking 复用这两个独立 skill 的产出"列为附加目标。本计划即把该附加目标正式落地。

---

## 3. 待改文件（双端同步——硬要求）

仅一个 runtime 文件，**source + runtime cache 双端同步**（上一个 commit 的教训：runtime 才是实际加载位）：

| 角色                 | 路径                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------- |
| canonical source   | `.../analyst-pro-marketplace/analyst-deal/commands/portfolio-tracking.md`                     |
| runtime（实际加载，必须同步） | `.../plugins/cache/analyst-pro-marketplace/analyst-deal/0.1.1/commands/portfolio-tracking.md` |

**不动：** `financial-analyzer.md` / `competitor-enricher.md` / 任何 agents / `docs/designs/fin-sidecar-contract.md`（FROZEN）。
ADR / CONTEXT / 本计划 仅 source 端，**不入 cache**。

---

## 4. 治理契约（已冻结 / 已发布——本计划不改动，只须遵守）

复用机制必须在以下既有契约之上运作，**任一处不得放宽或改写**：

### 4.1 fin-sidecar 契约（FROZEN）

`docs/designs/fin-sidecar-contract.md` 冻结 `<YYYYMMDD>.json`（`fin-sidecar/v1`）。本计划**只追加**冻结同目录 `_section.md`，**不修改**该文件。今后改 `financial-analyzer.md` 的 fin-cache 命名 / SHA8 公式即破坏 `portfolio-tracking` 复用——属契约变更，需同步 ADR 0002 + 本计划 + 两命令。

### 4.2 竞对档案块单 schema + 三分支（ADR 0001，已随 0.1.1 发布）

- `knowledge/competitor_card_schema.md` 保留**单一 schema**，按「公司类型」分三档：**上市竞品 / 拟 IPO 竞品 / 非上市创业竞品**（互斥），各档不同必填节、jina 预算、长度上限（上市 ≤1800 / 拟 IPO ≤1400 / 创业 ≤800 tokens）。
- 复用机制据此依赖的稳定面：**文件名 ****`{NN}_{name-slug}.md`**；档案块自带来源标注；上市/拟 IPO 档含财务/管理层/芯片规格/客户子节，创业档以股权+融资为主。
- 竞品财务表保留报告**原币种 + 明标单位**，不做汇率换算（schema 硬规则「零编造」）——复用时**原样搬运**，不重算、不统一口径。
- 财务节走轻量独立表，**不复用** `financial-analyzer` 三表抽取管道（那是投后公司上传报表专用、口径万元）；二者刻意分离，复用机制不得把竞对财务并入 fin-cache 流程。

### 4.3 AskUserQuestion 调用契约（已 commit，在 `portfolio-tracking.md` 文件内）

所有新增 AskUserQuestion 必须：非空 `questions`、每项 ≥2 `options`、不只回显 ASCII、**不开计划外确认**。复用 miss 一律**静默回退**，不新增计划外问题。

---

## 5. 锁定的设计决策（ADR 0002——附被否方案，勿重开）

设计经 `/grill-with-docs` 逐问确认，9 个问题用户全选推荐项 (A)。**不要再问设计问题。**

### 5.1 财务复用

- **复用对象 = fin-cache 的 ****`_section.md`****(prose) + ****`.json`****(JSON 侧文件)。**
  否决"读分析结果 xlsx 跳过 financial-analyzer"：报告章节三-二是 prose，`financial-analyzer` 从不产"分析 xlsx"；历年财务报表 xlsx 是并表目标而非报告正文。
- **定位 = AskUserQuestion 确认扫描文件夹**（默认 CWD 根、备选 `./portfolio/{slug}/`），按该文件夹绝对路径重算 SHA8。
  否决"强制分析师在 `./portfolio/{slug}/` 跑 standalone"：改变既有工作习惯，且 SHA8 由绝对路径决定，换目录即 miss。
- **命中 = 严格按 ****`{季度}`****→期末日 token 精确匹配 + 留底须比合并报表新（鲜度）。**
  否决"目录内唯一 `_section.md` 即复用"的宽松匹配：会重新引入"文件名日期 ≠ 报告期"bug 类（曾致 `InputValidationError`）。

### 5.2 竞对复用

- **路径 = ****`competitors.yml`**** 顶层全局有序 ****`档案搜索路径`****，逐家有序回退，全链未命中才 jina。**
  否决"选一个独占源文件夹":已生成档案散落 CWD 根与 `./portfolio/{slug}/competitors/` 两地，独占会漏复用、多撞 jina。
- **含 ⚠️ 数据完整性声明 的 card 原样复用 + Output 标注，不强制 jina 重查。**
  否决"含 ⚠️ 禁止复用、强制 jina 重查":配额耗尽正是这类 card 的成因，强制重查会形成"耗尽→无法重查→堵死"死循环。

### 5.3 Consequences（落地约束）

- 复用是**默认且静默回退**：财务 miss/陈旧、竞对全链未命中均自动走原 dispatch/jina，不新增计划外 AskUserQuestion。
- 复用决策点各暴露**恰一个批级** AskUserQuestion（财务：复用/重抽；竞对：按预览走/改路径重扫/全 jina）。
- 复用未核验/陈旧 card 的残余风险由 Output 显式逐家标注承接，**不静默**——治理责任移交分析师人工审阅（与 HITL 一致）。
- 仅改 `commands/portfolio-tracking.md`；`financial-analyzer.md`/`competitor-enricher.md`/agents 不动。

---

## 6. 改动点（锚定到现有 `portfolio-tracking.md` 步骤）

### 6.1 财务（Step 5 / 5.5）

- **Step 5 前加**：AskUserQuestion 确认 fin-cache 扫描文件夹（默认 CWD 根、备选 `./portfolio/{slug}/`），重算
  `sha8 = printf '%s' "$folder" | shasum -a 256 | cut -c1-8`，定位 `<folder>/.fin-cache/<SHA8>/`。
- **命中判定**：严格按 `{季度}`→期末日 token（Step 5.1 现有派生表：Q1→`YYYY-03-31`→`20260331`）精确匹配 `<YYYYMMDD>_section.md`，**且**其 mtime 晚于原始合并报表 PDF（鲜度）。
- **命中且鲜度 OK** → 一个 AskUserQuestion（默认 **A=复用 ****`_section.md`**** 填 ****`FINANCIAL_PLACEHOLDER`**** + 不跑子 agent** / B=丢弃重抽走现有 Step 5.2 dispatch）；**miss 或陈旧** → 静默走现有 Step 5.2，不新增问题。
- **Step 5.5**：复用时把 fin-cache `<YYYYMMDD>.json` 拷贝/指为 `./portfolio/{slug}/current_quarter_financials.json`，照常并表；缺 JSON → 跳 5.5 并 Output 标注「未同步历年表」。

### 6.2 竞对（Step 2 / 6 / 8 / 9）

- **Step 2 ****`competitors.yml`**** schema**：顶层加全局有序 `档案搜索路径:`，默认 `[./, ./portfolio/{slug}/competitors/]`。
  （`competitors.yml` / `portfolio-tracking` 刻意**不加**公司类型字段，以限制爆炸半径——类型由 enricher 首次股权 jina search 顺手判定，可经可选输入覆盖。）
- **Step 6**：每家**有序回退链**——路径1未命中→路径2→都没→jina；匹配 = 文件名含 `name-slug`（大小写不敏感、允许 `NN_` 前缀）优先，0/歧义则 grep `#### …<公司名>` 表头兜底。
- **Step 6 前**：先跑一遍匹配，**一个批级** AskUserQuestion 含每路径命中数 + 将走 jina 的逸名预览（A=按预览走 / B=改搜索路径重扫 / C=全 jina）。
- **Step 8 / Output**：逐家标注来源路径 + card 内查询日期 + 是否含 `jina 不可用 / 数据缺口 / 数据完整性声明 / 未核验` 关键词（原样复用，不阻断）。
- **Step 9**：把确认后的 `档案搜索路径` 列表回写 `competitors.yml`。

---

## 7. 硬约束（勿违反）

- 所有新增 AskUserQuestion 符合文件内 "## AskUserQuestion 调用契约（硬约束）"——非空 `questions`、每项 ≥2 `options`、不只回显 ASCII、不开计划外确认。
- 复用 miss 一律**静默回退**，不新增计划外问题。
- 双端同步（source + runtime cache）后才算改完。
- `sha8` 公式必须与 standalone `financial-analyzer` **完全一致**：`printf '%s' "$abs_folder" | shasum -a 256 | cut -c1-8`（见 `fin-sidecar-contract.md` 的 `.fin-cache/<sha8(abs_folder)>/`）。
- HITL：改完**不要自动 commit/push**，除非用户明确要求；提示用户审阅后再定。

---

## 8. 测试策略（`/tdd` 适配 prompt 改动）

无单测 runner。把"红"定义为可复现的命令行为缺陷，"绿"为修订指令后该场景走对。反馈环参考 `/diagnose` Phase 1 思路。

### 8.1 Fixture（仿当前真实场景）

一个目录 `<dir>`，含：

- `<dir>/.fin-cache/<sha8(dir)>/20260331_section.md` + `20260331.json`
- 一个 `*合并报表*.pdf`（mtime **早于**留底）
- 6 个 `0N_<name>.md` 竞对 card（含 `05`/`06` 带 ⚠️ banner 的）
- 一个 `competitors.yml`

> 同会话已有的 6 个竞对 card（第 2 节路径）可直接当竞对侧 fixture。

### 8.2 验收场景（逐条对修订后指令 dry-run 推演，必要时实跑）

| # | 场景                                                         | 期望（绿）                                                              |
| - | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 | 命中 + 鲜度 OK                                                 | 弹复用闸门、默认 A；选 A 后 `_section.md` 进报告且**不** dispatch agent            |
| 2 | 文件名 token ≠ 报告期（缓存名 `20260429`，报告期 `20260331`）             | 严格匹配 miss → **静默** dispatch（**不**报 `InputValidationError`、不弹计划外问题） |
| 3 | 留底比 PDF 旧                                                  | 判陈旧 → 静默 dispatch                                                  |
| 4 | 缺 JSON，只有 `_section.md`                                    | 复用正文但跳 Step 5.5 + Output 标注「未同步历年表」                                |
| 5 | 竞对：4 家命中 CWD 根、2 家仅在 `portfolio/competitors/`、05/06 不在任何路径 | 预览正确、逐家回退、仅缺失家走 jina                                               |
| 6 | 05/06 复用                                                   | Output 显式列出 ⚠️ 关键词与来源路径                                            |

### 8.3 验收门槛

上述场景全绿 + 现有未触及步骤行为**不回归** + AskUserQuestion 调用契约不被新问题违反。每改一处指令，重跑全部场景断言（回归）。

---

## 9. 关键背景 / 陷阱

- **jina 配额**：本会话 batch 2（龙芯/景嘉微）撞 `API quota exhausted`，故 `05_龙芯中科.md`/`06_景嘉微.md` 是训练知识回退、带 ⚠️ 数据完整性声明。复用治理决策（原样复用 + Output 标注）正是为此类 card。
- **"文件名日期 ≠ 报告期" 是本工作起源 bug**：standalone financial-analyzer 文件名 `20260429` vs 报告期 `20260331` 触发 `InputValidationError`。上一个 commit `69266f2` 已在 `financial-analyzer.md`/`portfolio-tracking.md` 加 AskUserQuestion 契约 + 文件名日期交叉校验。本次复用的"严格期末日匹配"是同一防线的延伸——**勿放宽成模糊匹配**。
- **报告章节三-二是 prose**；历年财务报表 xlsx 是**并表目标**而非报告正文；可复用的唯一既是报告正文又是结构化数据的产物是 fin-cache 的 `_section.md` + `.json`。
- **竞对复用是沿 ****`档案搜索路径`**** 的有序回退链**（逐家、两地、再 jina），**不是**选一个独占源文件夹。

---

## 10. 下一步建议技能

1. `/tdd` — 主驱动（按第 8 节"测试策略"适配 prompt 改动）。
2. 实现后可选 `/analyst-deal:portfolio-tracking 格兰菲 2026Q1` 实跑一次做端到端验证（fixture 已就位）。
3. 改动落定且用户要求留痕：`/gh-commit` 或按既有 `-F` message file 方式 commit（**source + runtime cache 双端同步后一起提交**）。

---

## 附:与源文档的对应关系

| 源                                                         | 并入本计划的位置                                     |
| --------------------------------------------------------- | -------------------------------------------- |
| `docs/adr/0001-competitor-card-single-schema-branched.md` | §4.2（治理契约——已发布，复用须遵守）                        |
| `docs/adr/0002-cross-command-reuse-contracts.md`          | §1 决策 / §5 锁定设计 + 被否方案 / §5.3 Consequences   |
| `docs/adr/handoff-20260517.md`                            | §3 待改文件 / §6 改动点 / §8 测试策略 / §9 陷阱 / §10 下一步 |
| `CONTEXT.md`                                              | 顶部术语指针 + §5.1/§9 术语区分                        |

