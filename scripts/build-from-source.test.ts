// Vitest tests for the transformer pipeline. All tests use synthetic fixtures —
// no I/O against the real AnalystPro repo. The integration test (full
// transformCommand on a real SKILL.md) lives in build-from-source.integration.test.ts
// and is gated by ANALYST_PRO_ROOT existence.

import { describe, expect, it } from 'vitest'

import { extractPrompt } from './lib/extract-prompt.js'
import {
  applyAgentPromptCleansing,
  applyPathReplacements,
  applyWebToolReplacements,
  dropFrontmatterFields,
  patchAllowedTools,
  rewriteModel,
  transformAgentPrompt,
  transformCommandBody,
} from './lib/apply-rules.js'

// ─── PATH_REPLACEMENTS ──────────────────────────────────────────────────────

describe('applyPathReplacements', () => {
  it('replaces workspace/knowledge/X with ${CLAUDE_PLUGIN_ROOT}/knowledge/X', () => {
    const out = applyPathReplacements('Read workspace/knowledge/tech_checklist.md')
    expect(out).toBe('Read ${CLAUDE_PLUGIN_ROOT}/knowledge/tech_checklist.md')
  })

  it('drops workspace/state/ wrapper, leaving a shallow domain dir', () => {
    const out = applyPathReplacements('Write workspace/state/deals/foo/report.md')
    expect(out).toBe('Write ./deals/foo/report.md')
  })

  it('maps workspace/state/portfolio to ./portfolio', () => {
    const out = applyPathReplacements('Write workspace/state/portfolio/acme/q4.md')
    expect(out).toBe('Write ./portfolio/acme/q4.md')
  })

  it('replaces workspace/inbox/X with ./workspace/inbox/X', () => {
    const out = applyPathReplacements('Check workspace/inbox/analyst.inbox.md')
    expect(out).toBe('Check ./workspace/inbox/analyst.inbox.md')
  })

  it('replaces bare knowledge/ form (in agent prompts) with plugin root', () => {
    const out = applyPathReplacements('See knowledge/glossary.md for terms.')
    expect(out).toBe(
      'See ${CLAUDE_PLUGIN_ROOT}/knowledge/glossary.md for terms.',
    )
  })

  it('replaces bare state/deals/ form with shallow cwd-relative dir', () => {
    const out = applyPathReplacements('Output: state/deals/techdd/[company]/report.md')
    expect(out).toBe('Output: ./deals/techdd/[company]/report.md')
  })

  it('maps bare state/intelligence/ to ./intel/', () => {
    const out = applyPathReplacements('Archive to state/intelligence/news_archive/')
    expect(out).toBe('Archive to ./intel/news_archive/')
  })

  it('handles multiple occurrences in same string', () => {
    const input =
      'Read workspace/knowledge/a.md and workspace/knowledge/b.md, write to workspace/state/deals/x.md'
    const out = applyPathReplacements(input)
    expect(out).toBe(
      'Read ${CLAUDE_PLUGIN_ROOT}/knowledge/a.md and ${CLAUDE_PLUGIN_ROOT}/knowledge/b.md, write to ./deals/x.md',
    )
  })

  it('does NOT corrupt unrelated text containing similar substrings', () => {
    const out = applyPathReplacements('My workspace.md is fine.')
    expect(out).toBe('My workspace.md is fine.')
  })
})

// ─── AGENT_PROMPT_CLEANSING ─────────────────────────────────────────────────

describe('applyAgentPromptCleansing', () => {
  it('removes 派遣 X subagent dispatch language', () => {
    const out = applyAgentPromptCleansing('Secretary 将派遣 deal-analyst subagent 处理。')
    expect(out).toBe('Secretary 将直接执行 处理。')
  })

  it('rewrites English subagent delegation', () => {
    const out = applyAgentPromptCleansing(
      'For hard tech sectors, delegate technical DD to hardtech-dd subagent via Task tool.',
    )
    expect(out).toBe('For hard tech sectors, handle technical DD directly.')
  })

  it('removes "Use Task tool to ..." sentences', () => {
    const out = applyAgentPromptCleansing('Use Task tool to spawn the helper. Then continue.')
    expect(out.trim()).toBe('Then continue.')
  })

  it('removes "Has Task tool" capability mentions', () => {
    const out = applyAgentPromptCleansing(
      'Has Task tool — can spawn subagents. Operates as leaf node.',
    )
    expect(out.trim()).toBe('Operates as leaf node.')
  })

  it('leaves prompts without dispatch language unchanged', () => {
    const input =
      'You are deal-analyst. Output reports to state/deals/.'
    const out = applyAgentPromptCleansing(input)
    expect(out).toBe(input)
  })
})

// ─── WEB_TOOL_REPLACEMENTS ─────────────────────────────────────────────────

describe('applyWebToolReplacements', () => {
  it('translates WebSearch quoted query to jina search', () => {
    const out = applyWebToolReplacements('WebSearch "TSMC 3nm 良率"')
    expect(out).toBe('Run via Bash: `jina search "TSMC 3nm 良率" --json`')
  })

  it('translates WebFetch URL to jina read', () => {
    const out = applyWebToolReplacements('WebFetch https://36kr.com/p/abc')
    expect(out).toBe('Run via Bash: `jina read https://36kr.com/p/abc --json`')
  })

  it('translates browser_navigate URL to jina read', () => {
    const out = applyWebToolReplacements('browser_navigate "https://weixin.sogou.com/x?q=foo"')
    expect(out).toBe('Run via Bash: `jina read https://weixin.sogou.com/x?q=foo --json`')
  })

  it('translates standalone browser_extract_text reference', () => {
    const out = applyWebToolReplacements(
      'After loading, use browser_extract_text to get content.',
    )
    expect(out).toBe(
      'After loading, use 解析 jina read 输出的 markdown content 字段 to get content.',
    )
  })

  it('translates browser_extract_links to jina read --links', () => {
    const out = applyWebToolReplacements('Then browser_extract_links from the page.')
    expect(out).toContain('jina read URL --links --json')
  })

  it('translates browser_screenshot to jina screenshot', () => {
    const out = applyWebToolReplacements('Use browser_screenshot for visual proof.')
    expect(out).toContain('jina screenshot URL')
  })

  it('translates browser_cookie_status / browser_cookie_import to HITL', () => {
    const a = applyWebToolReplacements('Check browser_cookie_status before proceeding.')
    const b = applyWebToolReplacements('Then browser_cookie_import to authenticate.')
    expect(a).toContain('AskUserQuestion')
    expect(a).toContain('status')
    expect(b).toContain('AskUserQuestion')
    expect(b).toContain('import')
  })

  it('translates browser_click / browser_fill to HITL', () => {
    const a = applyWebToolReplacements('browser_click the submit button.')
    expect(a).toContain('AskUserQuestion')
  })

  it('does NOT match browser_navigate followed by non-URL prose word "URL"', () => {
    // Earlier bug: regex matched `browser_navigate sogou search URL → ...`
    // and replaced "sogou" as if it were a URL. The URL-shaped guard fixes this.
    const out = applyWebToolReplacements(
      'browser_navigate sogou search URL → browser_snapshot',
    )
    // The bare-form fallback still rewrites the keyword, but "sogou" must NOT
    // become a fake URL argument.
    expect(out).not.toMatch(/jina read sogou --json/)
    expect(out).toContain('jina read URL --json')
  })

  it('does NOT eat trailing prose when WebFetch arg is backtick-wrapped domain', () => {
    // Earlier bug: WebFetch \`gsxt.gov.cn\`（无需登录）；... matched too far.
    const out = applyWebToolReplacements('优先 WebFetch `gsxt.gov.cn`（无需登录）；其他')
    expect(out).toContain('jina read gsxt.gov.cn --json')
    expect(out).toContain('（无需登录）；其他') // trailing prose preserved
    expect(out).not.toContain('（无需登录）；其他 --json') // not consumed into URL match
  })

  it('translates standalone browser_snapshot to jina read URL hint', () => {
    const out = applyWebToolReplacements('Use browser_snapshot to capture page state.')
    expect(out).toContain('jina read URL --json')
  })

  it('translates standalone browser_navigate (no URL arg) to jina read URL hint', () => {
    const out = applyWebToolReplacements('用 `browser_navigate` 跳转到列表页')
    expect(out).toContain('jina read URL --json')
  })

  it('translates browser_type to HITL', () => {
    const out = applyWebToolReplacements('Then browser_type into the form field.')
    expect(out).toContain('AskUserQuestion')
    expect(out).toContain('type')
  })
})

// ─── dropFrontmatterFields ──────────────────────────────────────────────────

describe('dropFrontmatterFields', () => {
  it('drops all DROP_FIELDS', () => {
    const fm = {
      name: 'foo',
      description: 'bar',
      agent: 'deal-analyst',
      context: 'fork',
      'ap-type': 'agent',
      'ap-ui-response': 'pipeline',
      'ap-icon': '🔍',
      'ap-tags': ['投资'],
      model: 'sonnet',
    }
    const out = dropFrontmatterFields(fm)
    expect(out).toEqual({ name: 'foo', description: 'bar', model: 'sonnet' })
  })

  it('does not mutate input object', () => {
    const fm = { name: 'a', agent: 'x' }
    dropFrontmatterFields(fm)
    expect(fm.agent).toBe('x') // input still has agent
  })

  it('preserves non-dropped fields verbatim including arrays', () => {
    const fm = { 'allowed-tools': ['Read', 'Write'], description: 'x' }
    const out = dropFrontmatterFields(fm)
    expect(out['allowed-tools']).toEqual(['Read', 'Write'])
  })
})

// ─── rewriteModel ───────────────────────────────────────────────────────────

describe('rewriteModel', () => {
  it.each([
    ['sonnet', 'claude-sonnet-4-6'],
    ['haiku', 'claude-haiku-4-5'],
    ['opus', 'claude-opus-4-7'],
  ])('rewrites %s → %s', (input, expected) => {
    expect(rewriteModel(input)).toBe(expected)
  })

  it('passes through unknown model name', () => {
    expect(rewriteModel('claude-3.5-sonnet')).toBe('claude-3.5-sonnet')
  })

  it('passes through non-string', () => {
    expect(rewriteModel(undefined)).toBe(undefined)
    expect(rewriteModel(null)).toBe(null)
  })
})

// ─── patchAllowedTools ──────────────────────────────────────────────────────

describe('patchAllowedTools', () => {
  it('removes Task and browser_* from comma-separated string', () => {
    const out = patchAllowedTools(
      'Read, Write, Task, browser_navigate, browser_extract_text, AskUserQuestion',
    )
    expect(out).toBe('Read, Write, AskUserQuestion, Bash(jina:*)')
  })

  it('removes Task and browser_* from YAML list (array)', () => {
    const out = patchAllowedTools([
      'Read',
      'Task',
      'browser_navigate',
      'AskUserQuestion',
    ])
    expect(out).toEqual(['Read', 'AskUserQuestion', 'Bash(jina:*)'])
  })

  it('does not duplicate Bash(jina:*) if already present', () => {
    const out = patchAllowedTools(['Read', 'Bash(jina:*)'])
    expect(out).toEqual(['Read', 'Bash(jina:*)'])
  })

  it('handles empty / nullish input', () => {
    expect(patchAllowedTools(null)).toBe('Bash(jina:*)')
    expect(patchAllowedTools(undefined)).toBe('Bash(jina:*)')
  })

  it('handles empty array', () => {
    expect(patchAllowedTools([])).toEqual(['Bash(jina:*)'])
  })

  it('preserves output shape: string in → string out, array in → array out', () => {
    expect(typeof patchAllowedTools('Read')).toBe('string')
    expect(Array.isArray(patchAllowedTools(['Read']))).toBe(true)
  })

  it('removes ALL browser_* variants', () => {
    const input = [
      'Read',
      'browser_navigate',
      'browser_click',
      'browser_fill',
      'browser_extract_text',
      'browser_extract_links',
      'browser_screenshot',
      'browser_cookie_import',
      'browser_cookie_status',
    ]
    const out = patchAllowedTools(input)
    expect(out).toEqual(['Read', 'Bash(jina:*)'])
  })
})

// ─── transformAgentPrompt (integration of path + cleansing) ────────────────

describe('transformAgentPrompt', () => {
  it('applies both path replacement and cleansing', () => {
    const input = `You are deal-analyst.

派遣 hardtech-dd subagent 处理技术分析。
Read workspace/knowledge/tech_checklist.md before evaluating.`
    const out = transformAgentPrompt(input)
    expect(out).toContain('${CLAUDE_PLUGIN_ROOT}/knowledge/tech_checklist.md')
    expect(out).toContain('直接执行')
    expect(out).not.toContain('派遣')
    expect(out).not.toContain('subagent')
  })
})

// ─── transformCommandBody (integration of path + web tools) ────────────────

describe('transformCommandBody', () => {
  it('applies both path replacement and web tool replacement', () => {
    const input = `## Step 1
WebSearch "X 融资"
WebFetch https://36kr.com/foo
Read workspace/knowledge/red_flags.md`
    const out = transformCommandBody(input)
    expect(out).toContain('jina search "X 融资" --json')
    expect(out).toContain('jina read https://36kr.com/foo --json')
    expect(out).toContain('${CLAUDE_PLUGIN_ROOT}/knowledge/red_flags.md')
  })
})

// ─── extractPrompt ─────────────────────────────────────────────────────────

describe('extractPrompt', () => {
  it('extracts prompt: `...` template literal', () => {
    const src = `import x from 'y'
export const def = {
  model: 'sonnet',
  prompt: \`You are X.

Hello world.\`,
}`
    const { text } = extractPrompt(src, 'test.ts')
    expect(text).toBe('You are X.\n\nHello world.')
  })

  it('handles escaped backticks inside the template literal', () => {
    const src = `export const x = {
  prompt: \`Use the \\\`dd_status\\\` field.\`,
}`
    const { text } = extractPrompt(src, 'test.ts')
    expect(text).toBe('Use the `dd_status` field.')
  })

  it('throws when prompt: field is missing', () => {
    expect(() => extractPrompt('export const x = { model: "sonnet" }', 't.ts'))
      .toThrow(/no `prompt:` field found/)
  })

  it('throws when template literal is unterminated', () => {
    expect(() => extractPrompt('prompt: `unterminated', 't.ts')).toThrow(
      /unterminated/,
    )
  })

  it('handles multi-line prompts with markdown headers', () => {
    const src = `export const x = {
  prompt: \`# Heading

## Subheading

- bullet
\`,
}`
    const { text } = extractPrompt(src, 'test.ts')
    expect(text).toContain('# Heading')
    expect(text).toContain('## Subheading')
    expect(text.trim().endsWith('- bullet')).toBe(true)
  })
})
