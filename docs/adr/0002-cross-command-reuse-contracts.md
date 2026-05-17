# portfolio-tracking 复用 standalone 产物：固化两条跨命令契约

`portfolio-tracking` 不再每季无条件 dispatch `financial-analyzer` 子 agent 与 `competitor-enricher`，而是先复用分析师此前用 standalone `/financial-analyzer` 与 `/competitor-enricher` 留下的产物。这把两条原本是"某命令内部实现细节"的产物路径**提升为冻结的跨命令契约**：(1) **fin-cache 留底** `<folder>/.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>{.json,_section.md}`——其中 `.json` 已由 `docs/designs/fin-sidecar-contract.md` 冻结，本 ADR 追加冻结同目录的 `_section.md`（成品 prose）；(2) **竞对档案块** 按 `competitor_card_schema.md`，文件名 `{NN}_{name-slug}.md`。理由：分析师真实工作流是先在文档根目录跑 standalone 命令、再跑投后报告，重复抽取/调研既烧 LLM 成本又（竞对侧）反复撞 jina 配额；而这两类产物本就是确定性、可定位、自带来源标注的，复用是低风险高收益。把路径/命名固化为契约，是因为复用方与产出方是两个独立命令文件，隐式耦合若无文档会在未来改名时静默失效。

## Considered Options

- **fin-cache 复用——直接读"分析结果 xlsx"跳过 financial-analyzer**：分析师口语称"复用已生成的 xlsx"。否决：报告章节三-二是 prose，`financial-analyzer` 从不产"分析 xlsx"；**历年财务报表 xlsx** 是并表目标而非报告正文，xlsx→prose 需重新叙述。可复用的唯一既是报告正文又是结构化数据的产物是 fin-cache 的 `_section.md`+`.json`。
- **fin-cache 定位——强制分析师在 `./portfolio/{slug}/` 跑 standalone**：hash 自然对得上，零定位逻辑。否决：改变既有工作习惯（分析师在文档根目录跑），且 SHA8 由文件夹绝对路径决定，换目录即 miss。改为 AskUserQuestion 确认扫描文件夹（默认 CWD 根、备选 `./portfolio/{slug}/`），重算该文件夹 SHA8 定位。
- **fin-cache 命中——宽松匹配（目录内唯一 `_section.md` 即复用）**：更少 miss。否决：重新引入"文件名日期 ≠ 报告期"bug 类（曾导致 `InputValidationError`）。改为严格按 `{季度}` 派生的期末日 token 精确匹配 + 留底须比合并报表新（鲜度），miss/陈旧静默回退 dispatch。
- **竞对复用——选一个独占源文件夹**：不混用两源、最可预测。否决：已生成档案会散落在 CWD 根与 `./portfolio/{slug}/competitors/` 两地，独占选择会漏复用、多撞 jina。改为 `competitors.yml` 顶层全局有序 `档案搜索路径`，逐家有序回退、全链未命中才 jina。
- **竞对复用——含 ⚠️ 数据完整性声明 的 card 禁止复用、强制 jina 重查**：数据质量最稳。否决：jina 配额耗尽正是这类 card 产生的原因，强制重查在配额耗尽时形成"耗尽→无法重查→被堵死"死循环，与省配额初衷相悖。改为原样复用 + Output 逐家显式标注来源路径/查询日期/是否含 jina不可用·数据缺口·未核验关键词。

## Consequences

- `docs/designs/fin-sidecar-contract.md` 仍 FROZEN 不动；本 ADR **不**修改它，只追加 `_section.md` 进同一冻结契约。今后改 `financial-analyzer.md` 的 fin-cache 命名/SHA8 公式即破坏 `portfolio-tracking` 复用——属契约变更，需同步本 ADR 与两命令。
- 仅改 `commands/portfolio-tracking.md`（Step 2 competitors.yml schema + 档案搜索路径、Step 5 财务复用闸门、Step 5.5 喂 cache JSON、Step 6 竞对有序回退、Step 8/Output 标注、Step 9 回写路径列表）；`financial-analyzer.md`/`competitor-enricher.md`/agents 不动。
- 命令文件改动须 source 端（marketplace）与 runtime cache（`cache/.../0.1.1/`）**双端同步**——runtime 才是实际加载位；本 ADR/CONTEXT 是文档，仅留 source 端、不入 cache。
- 复用是默认且静默回退：财务 miss/陈旧、竞对全链未命中均自动走原 dispatch/jina，不新增计划外 AskUserQuestion（遵守已 commit 的 AskUserQuestion 调用契约）。复用决策点各暴露恰一个批级 AskUserQuestion（财务：复用/重抽；竞对：按预览走/改路径重扫/全 jina）。
- 复用未核验/陈旧 card 的残余风险由 Output 显式逐家标注承接，不静默——治理责任移交分析师人工审阅（与 HITL 一致）。

## Amendment 2026-05-17 — fin-cache 扁平化（移除 sha8 子目录）

**变更**：fin-cache 留底路径由 `<folder>/.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>{.json,_section.md}`
改为**扁平** `<folder>/.fin-cache/<YYYYMMDD>{.json,_section.md}`。JSON *shape*（`fin-sidecar/v1`）不变，仅路径变。

**动因**：sha8 由文件夹**绝对路径**决定。分析师真实工作流是先在生成目录跑
standalone、再把产物**移入** `./portfolio/{slug}/`——移动后绝对路径变 → sha8 变 →
`portfolio-tracking` 静默 miss → 重读 PDF。此脆弱点与已修的「文件名日期 ≠ 报告期」
period-key bug 相互独立，是分析师反复看到"又重新读 PDF"的第二条成因。`.fin-cache`
物理位于公司 target_folder 内，本就提供文件夹级隔离，sha8 子目录在此前提下冗余。

**隔离边界（取代 sha8 的前提约束）**：一个 `.fin-cache` 只服务一个公司
target_folder；不得把多公司 standalone 抽取灌进单一共享根的 `.fin-cache`（扁平后
无命名空间，同报告期跨公司互覆盖）。每公司各自文件夹各自一份 `.fin-cache` 即安全。

**向后兼容（不孤立旧缓存）**：reader（`portfolio-tracking.md` Step 5.1.5）同时接受
新扁平路径与旧 `.fin-cache/<sha8>/<YYYYMMDD>.*` 嵌套；旧嵌套层用 `find -maxdepth 2`
枚举（**非 glob**：zsh 未匹配 glob 会 `no matches found` 报错；**不重算 sha8**：移动
文件夹后仍命中），token 文件名仍精确匹配 `<YYYYMMDD>_section.md`，鲜度守卫不变。

**同步落点**：本 ADR + `docs/designs/fin-sidecar-contract.md`（path-only 注记）+
`commands/financial-analyzer.md` Step 1.4（writer 扁平）+ `commands/portfolio-tracking.md`
Step 5.1.5（reader 双兼容）。仍须 source↔runtime cache 双端同步方在运行位生效。

**未触动**：`.fin-cache` 名本身、`<YYYYMMDD>` token 派生（仍由 financial-analyzer
1.2.2 硬闸门保证取纠正后报告期）、JSON schema、competitor 复用链、严格匹配 +
鲜度回退语义。
