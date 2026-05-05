<!-- TODO[Phase 2 manual refine]:
Generated from ANALYST_PRO/electron/skills/browse-cn/SKILL.md (extract-fallback-chain mode).
Phase 2 task: distill this into a focused "China data sources fallback chain"
reference (sogou search → WebFetch → browser → HITL), removing AnalystPro-specific
SkillPalette / Secretary references. See docs/PLAN.md § "browse-cn 怎么处理".
-->


# Browse-CN：中国市场数据采集

对 `$ARGUMENTS` 进行中国市场数据采集。输出结构化 Markdown 采集报告，可直接被 `/deal` 和 `/research` 复用。

---

## 数据源分层架构

按可访问性从高到低分层，优先使用 Level 1，Level 2 需要已导入的 Cookie，Level 3 仅作兜底。

### Level 1 — 公开可直接访问（无需登录）

| 分类 | 来源 | URL 模式 |
|------|------|----------|
| 创业/融资新闻 | 36Kr | `36kr.com/search?q={query}` |
| 创业/融资新闻 | 虎嗅 | `huxiu.com/search.html?query={query}` |
| 创业/融资新闻 | 钛媒体 | `tmtpost.com/search?q={query}` |
| 实时融资快讯 | 36Kr Newsflash | `36kr.com/newsflashes?q={query}` |
| A股财务数据 | 东方财富 | `quote.eastmoney.com/concept/{code}.html` |
| 研报库 | 东方财富研报 | `data.eastmoney.com/report/` |
| 新浪财经行情 | 新浪财经 | `finance.sina.com.cn/` |
| 上市公告 | 上交所 | `www.sse.com.cn/disclosure/` |
| 上市公告 | 深交所 | `www.szse.cn/disclosure/` |
| 北交所公告 | 北交所 | `www.bse.cn/disclosure/` |
| 监管/IPO审核 | 证监会 | `www.csrc.gov.cn/` |
| 工商注册（官方源） | 国家企信 | `gsxt.gov.cn/index.html` |
| 招聘/团队规模 | BOSS直聘公司页 | `www.zhipin.com/gongsi/{id}.html` |
| 招聘/团队规模 | 拉勾网 | `www.lagou.com/gongsi/` |
| App 排行 | 点点数据 | `www.diandian.com/rank` |

### Level 2 — 需要 Cookie（通过 browser 工具导入，见下方升级规则）

| 分类 | 来源 | 工具链 | 备注 |
|------|------|--------|------|
| 微信公众号文章 | 搜狗微信搜索 | `此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) sogou.com` → ``jina read URL --json`` → ``jina read URL --links --json` 从 links 字段取链接` → 逐篇 `解析 jina read 输出的 markdown content 字段` | 搜索入口；mp.weixin.qq.com 文章有链接后无需 Cookie |
| 工商/股权/诉讼 | 爱企查（百度） | `此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) aiqicha.baidu.com` → ``jina read URL --json`` → `解析 jina read 输出的 markdown content 字段` | BDUSS Cookie；比天眼查更易访问 |
| App 下载量估算 | 点点数据详情 | 不在白名单，用 WebSearch 替代 | 免费层仅排名，无法 cookie import |
| 职业社交 | 领英（中国） | 不在白名单，用 BOSS直聘代替 | PIPL 个人数据风险 |

### Level 3 — 高防护（仅在 Level 1/2 数据不足时尝试）

| 来源 | 问题 | 替代方案 |
|------|------|----------|
| 天眼查 | HTTP 419、JS 指纹、Robots 全封 | 爱企查（Level 2）或官方 API |
| 企查查 | Robots 封全部参数 URL | 爱企查（Level 2）或官方 API |
| IT桔子 | 返回 HTTP 412 作为 Bot 信号 | 36Kr 融资新闻（每周有汇总） |
| 雪球 | ToS 明确禁止 AI/RAG 使用 | **不使用** — 法律风险 |
| 脉脉 | 实名制，含个人隐私数据 | 受 PIPL 约束，**不使用** |

---

## Browser 工具升级规则

**优先顺序**：始终先尝试 WebSearch / WebFetch（更快，无浏览器开销）。仅在返回内容不完整（登录墙、反爬截断）时升级到 browser 工具。

**Cookie 导入（HITL 必须）**：

```
1. 此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (status) "{domain}" → 检查 Cookie 是否已存在
2. 若无 Cookie → AskUserQuestion: "即将从浏览器导入 {domain} 的 Cookie，确认继续？"
3. 用户确认后 → 此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) "{browser}" --domain {domain}
   支持的浏览器：arc / chrome / brave / edge
4. `jina read URL --json` → 解析 jina read 输出的 markdown content 字段 / `jina read URL --links --json` 从 links 字段取链接
```

**白名单域名**（仅以下域名支持 `此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import)`）：
`aiqicha.baidu.com`, `sogou.com`, `weixin.sogou.com`, `data.eastmoney.com`, `tianyancha.com`

其他被封锁的域名（天眼查、企查查等）不在白名单，直接用 WebSearch 替代，不要尝试 cookie import。

**若 gstack browse 未安装**：browser 工具不可用时返回安装提示，跳过 Level 2，仅输出 Level 1 数据并在报告中注明。

---

## 执行步骤

### Step 0 — 判断请求类型

- 若 `$ARGUMENTS` 是公司名 → 执行 **公司采集流程**
- 若 `$ARGUMENTS` 是行业/赛道 → 执行 **行业采集流程**
- 若两者都有（如"锂电池行业 + 宁德时代"）→ 两个流程均执行

---

### Step 1 — 公司采集流程

**1.1 融资与公司基本信息**

```
WebSearch: "{公司名} 融资 site:36kr.com"
WebSearch: "{公司名} 融资 site:huxiu.com"
WebSearch: "{公司名} 完成融资 OR 宣布融资 OR 亿元"
WebFetch:  36Kr 搜索结果页 → 提取融资轮次、金额、投资方、时间
WebFetch:  gsxt.gov.cn → 官方工商注册信息（无 Cookie 需求，但数据较基础）

# 爱企查（Level 2）— WebFetch 被拦截时升级：
此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (status) "aiqicha.baidu.com"
→ 若无 Cookie: AskUserQuestion 确认 → 此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) "{browser}" --domain aiqicha.baidu.com
Run via Bash: `jina read https://aiqicha.baidu.com/company?q={公司名} --json`
解析 jina read 输出的 markdown content 字段 → 解析：注册资本、股权结构、法定代表人、诉讼记录
```

**1.2 微信公众号文章**

```
# 先尝试 WebFetch（无需 Cookie）：
WebSearch: "site:weixin.sogou.com {公司名}"
WebFetch:  https://weixin.sogou.com/weixin?type=2&query={公司名}
           → 若返回完整搜索结果：WebFetch 每篇 mp.weixin.qq.com/s/{id} 全文

# WebFetch 被反爬拦截时升级到 browser 工具：
此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (status) "sogou.com"
→ 若无 Cookie: AskUserQuestion 确认 → 此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) "{browser}" --domain sogou.com
Run via Bash: `jina read https://weixin.sogou.com/weixin?type=2&query={公司名} --json`
`jina read URL --links --json` 从 links 字段取链接 → 筛选 mp.weixin.qq.com/s/... 链接（取前 5-10 篇）
对每篇文章: `jina read URL --json` {article_url} → 解析 jina read 输出的 markdown content 字段
```
注意：限速约 10 篇/会话，优先最新文章。mp.weixin.qq.com 文章全文有链接后无需 Cookie。

**1.3 招聘信号（团队规模 & 增长）**

```
WebSearch: "{公司名} site:zhipin.com"
WebFetch:  BOSS直聘公司主页 → 在招职位数、岗位类型分布、融资阶段标签
WebFetch:  拉勾网搜索 → 交叉验证岗位数量
```
解读：在招岗位数量趋势 = 业务扩张信号；大量技术岗 = 研发驱动型。

**1.4 上市公司 / 已有财务数据**

```
WebSearch: "{公司名} 股票代码" OR "{公司名} 上市"
若已上市:
  WebFetch: quote.eastmoney.com → 实时股价、市值、PE/PB
  WebFetch: data.eastmoney.com/report/ → 券商研报摘要
  API调用:  hq.sinajs.cn/list=sh{code} → 纯文本实时行情（无 JS，极快）
若未上市:
  记录为"未上市"，标注已知融资轮次
```

**1.5 新闻与舆情**

```
WebSearch: "{公司名} 最新 site:36kr.com OR site:huxiu.com OR site:tmtpost.com"
WebFetch:  前 3-5 篇相关报道全文
WebSearch: "{公司名} 负面 OR 风险 OR 诉讼 OR 处罚"  ← 红旗排查
```

---

### Step 2 — 行业采集流程

**2.1 行业规模数据**

```
WebSearch: "{行业} 市场规模 site:36kr.com"
WebSearch: "{行业} TAM 亿元 艾瑞 OR 易观 OR 头豹"
WebFetch:  36Kr / 虎嗅 引用研报数据的文章 → 提取关键数据点和来源
WebSearch: "{行业} 市场规模 filetype:pdf site:iresearch.cn"  ← 摘要可免费访问
```
注意：艾瑞、易观、头豹的完整报告需付费（3,000-30,000 元/份），但核心数据点通常被媒体引用——优先从 36Kr/虎嗅报道中提取，并注明原始出处。

**2.2 竞争格局**

```
WebSearch: "{行业} 主要玩家 融资 site:36kr.com"
WebSearch: "{行业} 竞争格局 2024 OR 2025"
WebFetch:  36Kr 行业专题页 → 融资地图、代表企业列表
WebFetch:  BOSS直聘各主要公司页 → 规模对比
```

**2.3 政策与监管**

```
WebSearch: "{行业} 政策 site:csrc.gov.cn OR site:gov.cn"
WebSearch: "{行业} 监管 新规 2024 OR 2025"
WebFetch:  证监会官网 → 相关政策文件
```

**2.4 微信行业观点**

```
# 先尝试 WebFetch：
WebFetch: https://weixin.sogou.com/weixin?type=2&query={行业}+投资+趋势
          → 若返回完整结果：WebFetch 每篇文章全文

# WebFetch 被拦截时升级到 browser 工具（复用已导入的 sogou Cookie）：
此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (status) "sogou.com"
→ 若无 Cookie: AskUserQuestion 确认 → 此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 (import) "{browser}" --domain sogou.com
Run via Bash: `jina read https://weixin.sogou.com/weixin?type=2&query={行业}+投资+趋势 --json`
`jina read URL --links --json` 从 links 字段取链接 → 筛选 mp.weixin.qq.com/s/... 链接
对每篇文章: `jina read URL --json` {article_url} → 解析 jina read 输出的 markdown content 字段
```
目标：头部 VC / 研究机构公众号的行业判断，优先近 3 个月内容。

---

## 输出格式

将采集结果写入以下路径：

- 公司采集：`./workspace/state/deals/processing/{company-slug}/YYYYMMDD_{company-slug}_cn_enrichment.md`
- 行业采集：`state/research/{sector_name}/YYYYMMDD_{sector_name}_cn_data.md`

```markdown
# {公司名/行业} — 中国市场数据采集报告

> 采集时间：{YYYY-MM-DD}  数据层级：Level {1/2}

## 融资记录
| 轮次 | 金额 | 投资方 | 时间 | 来源 |
|------|------|--------|------|------|

## 工商信息
- 注册资本：
- 法定代表人：
- 股权结构：
- 成立时间/地点：
- 来源：{gsxt.gov.cn / 爱企查}

## 微信公众号摘要
> 来源账号 | 发布时间
[文章摘要，100字以内]
[链接]

## 招聘信号
- 在招岗位数：{N}（来源：BOSS直聘，{日期}）
- 主要岗位类型：{技术/销售/运营…}
- 融资阶段标签（BOSS直聘）：{A轮/B轮…}

## 财务数据（上市公司）
- 股票代码：
- 市值：
- PE/PB：
- 最新研报评级：

## 舆情摘要
[正面/中性/负面，附链接]

## 数据可信度说明
- Level 1（公开数据）：{列出来源}
- Level 2（Cookie鉴权）：{列出来源，标注是否有Cookie}
- 缺失数据：{列出无法获取的字段及原因}
```

---

## 合规说明

- **不采集**：雪球（ToS 明确禁止 AI/RAG）、脉脉（PIPL 个人隐私）
- **谨慎使用**：天眼查/企查查的增值数据（官方 API 是合规路径）
- **政府数据**（gsxt.gov.cn、证监会、三大交易所）：完全合规，可直接使用
- WeChat 文章通过搜狗搜索访问，属公开内容，合规
