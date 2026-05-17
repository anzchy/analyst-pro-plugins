# AnalystPro Plugins

投研分析师的投后/尽调插件集。本文件是领域术语表（glossary only），不含实现细节。

## Language

### 竞对调研

**竞对档案块 (Competitor Card)**:
单家竞品公司的自包含 markdown 块，由 `competitor-enricher` 子 agent 产出、按 `competitor_card_schema.md` 契约拼入主报告章节四。
_Avoid_: 竞品报告、画像（口语可用，正式契约统一称档案块）

**上市竞品 (Listed Competitor)**:
已在境内外任一证券交易所挂牌、有公开定期财报的竞品公司。
_Avoid_: 上市公司（泛指时可用，作分类档位时统一称「上市竞品」）

**拟 IPO 竞品 (Pre-IPO Competitor)**:
尚未挂牌但已进入 IPO 辅导且存在招股说明书申报稿/问询函的竞品公司——其招股书提供接近上市级的财务/管理层/客户数据。
_Avoid_: 准上市、Pre-IPO（中英混用时统一中文）

**非上市创业竞品 (Non-listed Startup Competitor)**:
无公开定期财报、也无招股书申报稿的早中期创业竞品；调研重心在股权与融资。
_Avoid_: 初创、未上市公司（作分类档位时统一称「非上市创业竞品」）

**同赛道业务段 (Comparable Business Segment)**:
竞品财报披露的、与本公司主产品处于同一细分赛道的那个收入分部（如瑞昱的「通讯网络 IC」段对本公司的 Wi-Fi AP 赛道）。
_Avoid_: 相关板块、对标业务（统一称「同赛道业务段」）

**客户集中度 (Customer Concentration)**:
定期报告/招股书披露的前若干大客户合计收入占比；当客户名未披露时这是唯一可得的客户量化口径。
_Avoid_: 客户依赖度

### 财务复用

**合并报表 (Raw Consolidated Statements)**:
被投企业上传的原始财务报表 PDF/xlsx，是 `financial-analyzer` 的抽取输入；文件名里的日期 token 可能是交付日而非报告期。
_Avoid_: 财报、报表（泛指时可用，作抽取输入时统一称「合并报表」）

**历年财务报表 xlsx (Cumulative Model)**:
命令写出并逐季增量并入一列的累计模型，是 `merge_financials.py` 的**并表目标**，不是报告正文。
_Avoid_: 分析结果 xlsx、生成的 xlsx（该产物不存在；勿用以指代报告章节三-二）

**fin-cache 留底 (Cached Section / Side-file)**:
standalone `/financial-analyzer` 在 `<跑财务的文件夹>/.fin-cache/<sha8(该文件夹绝对路径)>/` 下按报告期存的 `<YYYYMMDD>_section.md`（成品 prose）+ `<YYYYMMDD>.json`（`fin-sidecar/v1`）。
_Avoid_: 缓存（泛指时可用，作跨命令复用对象时区分 section.md 与 JSON 侧文件）

**报告期日期 (Reporting-Period Date)**:
由 `{季度}` 确定性派生（Q1→YYYY-03-31），是 fin-cache 文件名 token，也是历年表列锚点。
_Avoid_: 报表日期（合并报表文件名 token 可能是交付日，与报告期日期不同）

### 竞对复用

**档案搜索路径 (Card Search Path)**:
`competitors.yml` 顶层的有序、文件夹级、全局列表，默认 `[./, ./portfolio/{slug}/competitors/]`，供逐家有序回退使用。
_Avoid_: 缓存目录（单一目录概念无法表达"有序两地回退"）

**有序回退链 (Ordered Fallback Chain)**:
对每家竞对独立地按档案搜索路径依次找命中，全部未命中才走 jina；同批内部分复用 + 部分 jina 是允许的。
_Avoid_: 选独占源文件夹（那会漏掉散落两地的已有档案）

## Relationships

- 一个 **竞对档案块** 描述恰好一家竞品，属于 **上市竞品** / **拟 IPO 竞品** / **非上市创业竞品** 三类之一（互斥）
- **fin-cache 留底** 由 **报告期日期** 命名；portfolio-tracking 复用时严格按 `{季度}` 派生的 **报告期日期** 精确匹配，并校验留底比 **合并报表** 新（鲜度）
- **历年财务报表 xlsx** 的当期列由 fin-cache 的 JSON 侧文件（或子 agent 产的同格式侧文件）并入；复用留底但 JSON 缺失时该列不同步
- 一家竞对的档案按 **有序回退链** 沿 **档案搜索路径** 解析，命中即复用其 **竞对档案块**，全链未命中才 jina
- **上市竞品** 与 **拟 IPO 竞品** 的档案块必含财务表、管理层表、芯片规格表、客户与下游子节
- **非上市创业竞品** 的档案块以股权结构 + 融资进展为主，上述四节为可选
- **同赛道业务段** 营收/占比是 **上市竞品** 财务表的必填列之一
- **客户集中度** 在客户名未披露时替代具名客户列表出现在「客户与下游」子节

## Example dialogue

> **分析师:** "物奇微电子算上市竞品吗？它在 IPO 辅导第十期。"
> **领域负责人:** "不是上市竞品——还没挂牌。但如果它已报招股书申报稿，就是**拟 IPO 竞品**：财务/管理层/客户按招股书填到上市级深度，股权和融资仍按**非上市创业竞品**那套查。招股书没出，就退回纯**非上市创业竞品**。"

## Flagged ambiguities

- "上市公司" 同时被用于泛指与分类档位 — 已厘清：作竞品分类档位时统一称 **上市竞品**，与 **拟 IPO 竞品**、**非上市创业竞品** 三档互斥
- "客户" 既指具名客户也指集中度口径 — 已厘清：优先具名客户列表；仅披露占比时用 **客户集中度** 字段
- "复用已生成的 xlsx" — 已厘清：报告章节三-二是 prose，**历年财务报表 xlsx** 是并表目标而非报告正文；可复用的是 **fin-cache 留底**（section.md + JSON），不是任何 xlsx
- "复用文件夹" — 已厘清：竞对复用是沿 **档案搜索路径** 的 **有序回退链**（逐家、两地、再 jina），不是选一个独占源文件夹
