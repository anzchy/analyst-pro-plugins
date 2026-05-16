# China Data Sources — Fallback Chain Reference

When AnalystPro plugins need Chinese-language market data (融资记录, 工商信息, 招聘信号, 行业政策, 微信舆情, 司法涉诉, 等), follow this 4-level fallback chain. Each level escalates from cheap/automated to expensive/manual.

## Level 1 — Jina Search with `site:` filters (default, try first)

Fast, cheap (~1 credit per call), works for most public Chinese media. Use these site-filter patterns:

### General business media

- `jina search "{公司名} 融资 site:36kr.com" --json` — startup funding news
- `jina search "{公司名} site:huxiu.com OR site:tmtpost.com OR site:caixin.com" --json` — major business media coverage
- `jina search "{公司名} site:eastmoney.com" --json` — 上市公司公告 + 研报摘要

### Government / policy / regulatory

- `jina search "{行业} 政策 site:gov.cn" --json` — central + ministry policy
- `jina search "{公司名} 工商 site:gsxt.gov.cn" --json` — basic business registration (free, no login)
- `jina search "{公司名} site:court.gov.cn" --json` — 涉诉公开 (judicial disclosures)
- `jina search "{行业} 标准 site:sac.gov.cn OR site:samr.gov.cn" --json` — industry standards / regulators

### Sector-specific signals

- `jina search "{公司名} site:zhipin.com" --json` — 招聘信号 (BOSS直聘 — usually returns the company's public hiring page)
- `jina search "{公司名} site:tianyancha.com" --json` — sometimes returns free pages (basic info, key personnel)
- `jina search "{论文/技术} site:patenthub.cn" --json` — Chinese patent search
- `jina search "{论文/技术} site:cnki.net" --json` — academic Chinese papers (abstracts free)
- `jina search "{topic} site:arxiv.org" --json` (English; for hardtech-dd) — preprint papers

### WeChat 公众号 (微信公众号 articles)

WeChat articles aren't directly indexed by Google. Use Sogou's WeChat search as a proxy:

1. `jina read https://weixin.sogou.com/weixin?type=2&query={query} --json` returns the search result page; extract `mp.weixin.qq.com/s/...` URLs from the output's `links` field.
2. For each article URL: `jina read https://mp.weixin.qq.com/s/<id> --json` — most public articles return clean markdown.

WeChat search results expire (sogou caches roll over weekly); cite retrieval date in evidence ledger.

### Listed / Pre-IPO filing sources（上市 / 拟 IPO 竞品专用）

`competitor-enricher` 的 listed / pre-ipo 档位需要定期报告级数据（三年一期财务、管理层、客户集中度）。年报 / 招股书申报稿是**一份覆盖股权+财务+管理层+客户的母文档**——优先整本拿全（大 PDF 用分页 `jina read`），再补单点。

**母文档（优先级 1）：**

- A 股 / 港股年报、招股说明书申报稿、问询函回复：`jina search "{公司名} 年报 site:cninfo.com.cn" --json`（巨潮资讯网，证监会指定披露平台，免费）→ 取 PDF 链接 `jina read`
- 台股年报 / 财报：`jina search "{公司名} annual report site:mops.twse.com.tw" --json`（公开资讯观测站 MOPS）或公司 IR 站 `jina read https://{公司域名}/.../annual_report.pdf`
- 公司投资者关系页（最快拿到当年年报 PDF）：`jina search "{公司名} investor relations annual report" --json` → 官网 IR PDF

**三年一期财务补点（优先级 2）：**

- `jina search "{公司名} 营收 毛利率 site:eastmoney.com" --json`（东方财富，A 股财务摘要 + 研报）
- `jina search "{公司名} 财务数据 site:10jqka.com.cn" --json`（同花顺）
- 台股月营收 / 季报：`jina read https://mops.twse.com.tw/...`（MOPS 月营收公告，季报有时滞）

**管理层 / 客户集中度（优先级 4，通常已在母文档内）：**

- 管理层：年报 / 招股书的「董事、监事及高级管理人员」/「董事及经理人」章节——母文档拿到即可，无需额外调用
- 客户集中度：年报 / 招股书的「前五大客户」/「主要客户」段；A 股招股书必披露前五大客户合计占比，台股年报披露程度不一
- 具名客户补点：`jina search "{公司名} 客户 中标 site:36kr.com OR site:eastmoney.com" --json`

> 反爬注意：cninfo / MOPS 的 PDF 通常 `jina read` 可直出 markdown；若返回 < 200 字或验证码页 → 按下方 Level 3 HITL。eastmoney 研报全文 PDF 多为付费，按 Level 3。

## Level 2 — Jina Read for known URLs

When you already have a specific URL (from Level 1 results, founder-provided, or prior research), skip search and read directly:

```bash
jina read https://36kr.com/p/<id> --json
jina read https://m.36kr.com/p/<id> --json   # mobile variant
jina read https://www.huxiu.com/article/<id>.html --json
```

Jina ReaderLM-v2 handles JS rendering automatically; returns clean markdown with extracted links.

**Anti-bot detection signals** — if `jina read` returns:
- `< 200 chars` of body content
- A page containing `"机器人验证"`, `"请登录后查看"`, `"验证码"`, `"Cloudflare"`, `"403"`
- Just navigation/header HTML stripped of article content

→ Escalate to **Level 3** for that URL.

## Level 3 — HITL fallback for login-walled / anti-bot sites

Some Chinese data sources cannot be accessed without authenticated cookies or pass anti-bot challenges that Jina cannot solve. Fall back to a human-in-the-loop pattern.

### Sites that typically require Level 3

- **aiqicha.baidu.com** — 股权结构, 历史变更, 关键人员关系图 (free tier limits, login-walled detail)
- **tianyancha.com** — full-detail business info beyond Level 1's free pages (paid tier)
- **qcc.com** — 企查查 paid pages
- **xueqiu.com** — some 雪球 mobile-walled long-form content
- **eastmoney.com PDF reports** — broker research PDFs (paid downloads)
- **cyzone.cn / 投中网** — some paid-only investor data
- **wsj.com / nytimes.com** — global paywalls (rarely needed but happens)

### HITL pattern (output to user)

```
此数据源需要登录态: <site-domain>

请你:
1. 在浏览器登录该站
2. 打开 URL: <specific-url>
3. 复制相关内容 (e.g., 股权结构表, 关键人员列表) 并粘贴回来
我会继续解析和写入证据台账。
```

Wait for the user's pasted content. Then continue analysis treating the pasted text as the data source. **Cite both the URL AND the date the content was retrieved** in evidence ledger:

```
- 股权结构: aiqicha.baidu.com (2026-05-05 user-provided): [content summary]
```

## Level 4 — Unreachable, declare gap in evidence ledger

When Levels 1-3 all fail (no public coverage, login attempt failed, paid wall, deleted articles, or user opted to skip the HITL step):

1. **Stop trying to fetch** that data source; do not retry indefinitely
2. Mark the data point in the evidence ledger as a documented gap:
   ```
   - <field>: 公开数据缺失, 来源 <site> 不可达 (尝试 Level 1-3 均失败)
   ```
3. Continue with other data points — incomplete data is acceptable, fabricated data is not
4. In the final report, list all "Public data unavailable" gaps in a dedicated subsection so reviewers can decide whether to invest manual research time

**Hard rule**: Never fabricate. Never use stale general LLM knowledge to fill a Level 4 gap. Better to ship a report with documented gaps than fabricated certainty.

---

## Source priority by data type

| Data need | Level 1 (try first) | Level 2/3 (escalate) |
|---|---|---|
| 融资历史 | 36kr, huxiu, tmtpost (Level 1) | aiqicha (Level 3) |
| 工商基本信息 | gsxt.gov.cn (free, no login) | tianyancha (Level 3 if more detail needed) |
| 股权结构 | (rarely free) | aiqicha (Level 3) |
| 司法涉诉 | court.gov.cn (Level 1) | (deeper detail = Level 3) |
| 招聘信号 / 团队规模 | zhipin.com (Level 1) | (mostly free) |
| 政策 / 监管动态 | gov.cn site filters (Level 1) | (free, just slow) |
| 微信公众号舆情 | sogou WeChat search → mp.weixin.qq.com (Level 1+2) | (most articles public) |
| 上市公司公告 | eastmoney 研报摘要 (Level 1) | full PDFs via Level 3 |
| 三年一期财务（上市/拟IPO竞品） | cninfo / MOPS 年报、招股书申报稿；eastmoney/同花顺财务摘要 (Level 1+2) | 年报全文 PDF via Level 3 |
| 管理层（董事/经理人） | 年报「董监高」/招股书「董事及经理人」章节 (Level 1+2，母文档内) | (母文档拿到即可) |
| 客户集中度（前五大客户） | A 股招股书必披露；年报「主要客户」段 (Level 1+2) | 具名客户 = founder-provided (Level 3) |
| 芯片/产品规格 datasheet | 公司官网产品页 / datasheet PDF (Level 1+2) | 付费规格库 (Level 4) |
| 论文 / 专利 | patenthub, cnki, arxiv (Level 1+2) | (free for abstracts) |
| 行业研究 | tmtpost, 36kr industry features (Level 1+2) | paid databases (Level 3-4) |
| 客户名单 / 供应链 | (rarely free) | founder-provided (Level 3) |

---

## Notes for plugin commands

- Plugin commands using this chain (e.g., `/analyst-deal:deal-analysis`, `/analyst-research:industry-research`) should `Read ${CLAUDE_PLUGIN_ROOT}/knowledge/cn-data-sources.md` at the start of their data-collection step.
- Commands should annotate which fallback level was used per data point in the evidence ledger:
  ```
  - 融资 A 轮金额: 1 亿美元, 国投领投 (Level 1: 36kr 2017-08-18)
  - 股权结构: 陈天石 35.55% 实控人 (Level 3: aiqicha 2026-05-05 user-provided)
  - 第一大客户身份: 公开数据缺失 (Level 4)
  ```
- If a command repeatedly hits Level 3 HITL on the same data source, the user should consider configuring a Playwright MCP (Phase 2 candidate) to automate the cookie-walled access. See `docs/PLAN.md` § "Anti-bot 中文站 HITL fallback".
