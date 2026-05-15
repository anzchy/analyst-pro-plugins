// Purpose: Rules-as-data for transforming AnalystPro SKILL.md + agent .ts files
// into Claude Code plugin command files. Imported by build-from-source.ts.
//
// See docs/PLAN.md § "Active design (Jina CLI)" for the full design rationale.

/** A regex-based path replacement applied to the command body. */
export interface PathReplacement {
  readonly regex: RegExp
  readonly to: string
}

/** A regex replacement applied to agent prompt text or command body. */
export interface RegexReplacement {
  readonly regex: RegExp
  readonly replaceWith: string
}

/**
 * Frontmatter fields to drop entirely. These are AnalystPro-private extensions
 * (`ap-*`) or fields that are standard in Anthropic Skills but unsupported by
 * Claude Code plugin commands (`agent`, `context`).
 */
export const DROP_FIELDS = [
  'agent',
  'context',
  'ap-type',
  'ap-ui-response',
  'ap-icon',
  'ap-tags',
] as const

/** Map AnalystPro short model names to plugin canonical model IDs. */
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  opus: 'claude-opus-4-7',
}

/**
 * Canonical output-domain aliases. AnalystPro nested every generated artifact
 * under `workspace/state/<domain>/`; the plugin flattens these to `./<alias>/`
 * so deliverables sit two levels from the project root. Most domains keep
 * their name; `intelligence` abbreviates to `intel`. This is the single source
 * of truth shared by the path-replacement rules (below) and the Output
 * Location section (build-from-source.ts) — add a domain here and both pick
 * it up automatically.
 */
export const DOMAIN_ALIASES: Record<string, string> = {
  deals: 'deals',
  portfolio: 'portfolio',
  intelligence: 'intel',
  research: 'research',
}

/**
 * Shared left-boundary guard for every path rule. Refuses to rewrite a path
 * segment that is glued to a longer token — i.e. preceded by a word char,
 * `.`, `/`, or `-`. This (a) blocks absolute paths (`/abs/workspace/state/…`)
 * and hyphen-glued tokens (`foo-state/…`) from being mangled, and (b) makes
 * every rule idempotent: the slash-prefixed output of an earlier rule
 * (`./deals/`, `${CLAUDE_PLUGIN_ROOT}/knowledge/`, `./workspace/inbox/`) can
 * never be re-matched on a second pass.
 */
const PATH_LB = '(?<![\\w./-])'

/**
 * Path replacements applied to command body (and to extracted agent prompt).
 * Read-only knowledge ships with the plugin (${CLAUDE_PLUGIN_ROOT}/knowledge/).
 * Generated artifacts write to a shallow per-domain dir at the cwd root
 * (./deals/, ./portfolio/, ./intel/, ./research/) — the legacy
 * ./workspace/state/ wrapper was dropped so deliverables sit two levels from
 * the project root. User-supplied input materials still live under
 * ./workspace/inbox/ (distinct from outputs).
 *
 * Order matters:
 *  1. The memo-specific `$ARGUMENTS-slug` rule runs before the broad
 *     `workspace/state/` fallback so memo's evidence path stays aligned with
 *     where deal-analysis actually writes it (`./deals/processing/<slug>/`).
 *  2. Explicit per-domain `workspace/state/<domain>/` rules run before the
 *     broad fallback so abbreviated aliases (intelligence → intel) survive —
 *     prefix-only stripping would otherwise leave `./intelligence/`.
 *  3. The broad `workspace/state/` fallback catches any non-aliased domain.
 *  4. Bare `state/<domain>/` forms (agent-prompt style) run last.
 */
function buildPathReplacements(): PathReplacement[] {
  const rules: PathReplacement[] = [
    {
      regex: new RegExp(`${PATH_LB}workspace\\/knowledge\\/`, 'g'),
      to: '${CLAUDE_PLUGIN_ROOT}/knowledge/',
    },
    // memo synthesizes from evidence that deal-analysis writes to
    // ./deals/processing/<slug>/. Upstream memo SKILL.md references
    // `workspace/state/$ARGUMENTS-slug/`; realign it to that contract before
    // the broad fallback strips it to a bare, wrong `./$ARGUMENTS-slug/`.
    {
      regex: new RegExp(`${PATH_LB}workspace\\/state\\/\\$ARGUMENTS-slug\\/`, 'g'),
      to: './deals/processing/$ARGUMENTS-slug/',
    },
  ]
  for (const [domain, alias] of Object.entries(DOMAIN_ALIASES)) {
    rules.push({
      regex: new RegExp(`${PATH_LB}workspace\\/state\\/${domain}\\/`, 'g'),
      to: `./${alias}/`,
    })
  }
  rules.push(
    { regex: new RegExp(`${PATH_LB}workspace\\/state\\/`, 'g'), to: './' },
    {
      regex: new RegExp(`${PATH_LB}workspace\\/inbox\\/`, 'g'),
      to: './workspace/inbox/',
    },
    {
      regex: new RegExp(`${PATH_LB}knowledge\\/`, 'g'),
      to: '${CLAUDE_PLUGIN_ROOT}/knowledge/',
    },
  )
  for (const [domain, alias] of Object.entries(DOMAIN_ALIASES)) {
    rules.push({
      regex: new RegExp(`${PATH_LB}state\\/${domain}\\/`, 'g'),
      to: `./${alias}/`,
    })
  }
  rules.push({
    regex: new RegExp(`${PATH_LB}inbox\\/`, 'g'),
    to: './workspace/inbox/',
  })
  return rules
}

export const PATH_REPLACEMENTS: PathReplacement[] = buildPathReplacements()

/**
 * Cleansing regexes applied ONLY to extracted agent prompts (not command body).
 * Removes references to AnalystPro's Secretary→subagent dispatch model.
 */
export const AGENT_PROMPT_CLEANSING: RegexReplacement[] = [
  // "派遣 X subagent" → "直接执行" (just the dispatch phrase, not trailing context)
  { regex: /派遣\s*[\w-]+\s*subagent/g, replaceWith: '直接执行' },
  // "delegate ... to X subagent via Task tool" → "handle ... directly"
  {
    regex: /delegate\s+([^.]+?)\s+to\s+[\w-]+\s+subagent\s+via\s+Task\s+tool\.?/gi,
    replaceWith: 'handle $1 directly.',
  },
  // Remove standalone "Use Task tool to <verb> ..." sentences
  { regex: /Use\s+Task\s+tool\s+to\s+[^.\n]*\.?\s*/gi, replaceWith: '' },
  // Remove standalone "Has Task tool — <description>" capability mentions
  { regex: /Has\s+Task\s+tool[^.\n]*\.?\s*/gi, replaceWith: '' },
]

/**
 * Web tool replacements — translate AnalystPro browser_* / WebSearch / WebFetch
 * usage patterns to jina-ai/cli invocations.
 *
 * Order matters: more-specific (URL-bearing) patterns must come before generic
 * (bare-token) fallback patterns. Each regex is intentionally tight on the URL
 * shape — match only `http(s)://...` or domain-shaped args, never raw prose.
 */
const URL_LIKE = `(?:https?:\\/\\/[^\\s\`'"<>)\\]]+|[a-z][\\w.-]+\\.[a-z]{2,}[^\\s\`'"<>)\\]]*)`

export const WEB_TOOL_REPLACEMENTS: RegexReplacement[] = [
  // WebSearch with quoted query (allow optional surrounding backticks for inline-code form).
  {
    regex: /\bWebSearch\s+`?"([^"]+)"`?/g,
    replaceWith: 'Run via Bash: `jina search "$1" --json`',
  },
  // WebFetch with backtick-wrapped or bare URL/domain.
  {
    regex: new RegExp(`\\bWebFetch\\s+\`?(${URL_LIKE})\`?`, 'g'),
    replaceWith: 'Run via Bash: `jina read $1 --json`',
  },
  // browser_navigate with quoted URL.
  {
    regex: new RegExp(`\\bbrowser_navigate\\s+"(${URL_LIKE})"`, 'g'),
    replaceWith: 'Run via Bash: `jina read $1 --json`',
  },
  // browser_navigate with bare URL (no quotes).
  {
    regex: new RegExp(`\\bbrowser_navigate\\s+(${URL_LIKE})`, 'g'),
    replaceWith: 'Run via Bash: `jina read $1 --json`',
  },
  // browser_snapshot — recommended replacement for extracting content; treat as jina read URL.
  {
    regex: /\bbrowser_snapshot\b/g,
    replaceWith: '`jina read URL --json` 获取页面文本树',
  },
  // Standalone bare-token references (when keyword appears in prose without arg).
  {
    regex: /\bbrowser_navigate\b/g,
    replaceWith: '`jina read URL --json`',
  },
  {
    regex: /\bbrowser_extract_text\b/g,
    replaceWith: '解析 jina read 输出的 markdown content 字段',
  },
  {
    regex: /\bbrowser_extract_links\b/g,
    replaceWith: '`jina read URL --links --json` 从 links 字段取链接',
  },
  {
    regex: /\bbrowser_screenshot\b/g,
    replaceWith: '`jina screenshot URL -o /tmp/X.png` (仅在需要图像时)',
  },
  {
    regex: /\bbrowser_cookie_(import|status)\b/g,
    replaceWith:
      '此步需要登录态 — AskUserQuestion 让用户打开 URL 登录后把内容粘回来 ($1)',
  },
  // browser_click / browser_fill / browser_type — HITL fallback.
  {
    regex: /\bbrowser_(click|fill|type)\b/g,
    replaceWith: '此步需要交互 — AskUserQuestion 让用户在浏览器完成 ($1) 后继续',
  },
]

/**
 * `allowed-tools` frontmatter patch: tools to remove + tools to add.
 * Applied to the parsed allowed-tools list (whether it's a string or array).
 */
export const ALLOWED_TOOLS_PATCH = {
  add: ['Bash(jina:*)'],
  remove: [
    'Task',
    'browser_navigate',
    'browser_extract_text',
    'browser_extract_links',
    'browser_click',
    'browser_fill',
    'browser_screenshot',
    'browser_cookie_import',
    'browser_cookie_status',
  ],
} as const

/** Standard "Failure Mode Preflight" section injected at the top of every command body. */
export const FAILURE_MODE_PREFLIGHT = `## Failure Mode Preflight (hard-fail by default)

Run these checks before Step 1; abort on any failure.

1. **\`jina\` CLI + \`JINA_API_KEY\` available**:
   - Run via Bash: \`which jina && [ -n "\${JINA_API_KEY}" ] && echo OK || echo FAIL\`
   - On FAIL → output exactly:
     "本命令需要 jina-cli + JINA_API_KEY。请：
      pip install jina-cli
      export JINA_API_KEY=jina_xxxxxx
      然后重启 Claude Code 重试。"
     Then end the session — do NOT continue.

2. **Plugin-shipped knowledge files readable**: each knowledge file referenced below
   should be readable via \`Read \${CLAUDE_PLUGIN_ROOT}/knowledge/<file>.md\`. If a
   read fails, output "Plugin install may be corrupted (knowledge file missing).
   Please reinstall: /plugin uninstall <name> && /plugin install <name>." and end.

3. **CWD writable**: write a marker file \`.analyst-write-test\` then delete it.
   - On failure → switch to read-only mode (output report content to chat, do not
     write files). Tell the user explicitly that no files will be written.

4. **Output directory auto-created**: reports write to a shallow per-domain dir
   under the current working directory (e.g. \`./deals/<slug>/\`,
   \`./portfolio/<slug>/\`, \`./intel/\`). The command creates it with
   \`mkdir -p\`; no \`./workspace/\` setup is required. If the CWD is not
   writable, fall back to read-only mode per check 3.
   - **Slug safety**: derive every \`<slug>\` from the company/project name only —
     lowercase, hyphen-separated, ASCII transliteration of CJK (CJK chars may be
     kept verbatim). Strip any \`/\`, \`..\`, leading \`.\`, \`~\`, or absolute-path
     prefix before it is interpolated into a path. A slug that is not a single
     plain path segment is a HARD FAIL — never \`mkdir\`/write outside the
     per-domain dir.
`

/**
 * Per-command extra preflight checks injected after the standard preflight,
 * keyed by command name.
 */
export const COMMAND_EXTRA_PREFLIGHT: Record<string, string> = {
  'codex-polish-report': `

5. **Codex MCP available**: verify the \`mcp__plugin_analyst-deal_codex__codex\`
   tool is in your tool list.
   - If missing → output "Codex MCP not available. Run \`codex login\` in your
     terminal, then restart Claude Code." and end.
`,
  memo: `

5. **Evidence file required**: this command synthesizes from accumulated evidence.
   - Verify \`./deals/processing/<company-slug>/evidence.md\` exists and is non-empty
     (this is where \`/analyst-deal:deal-analysis\` writes it).
   - If missing or empty → HARD FAIL: "memo command needs prior evidence.
     Run \`/analyst-deal:deal-analysis $ARGUMENTS\` first to accumulate evidence."
`,
  'interview-notes-enricher': `

5. **Transcript glob has matches**: use Glob to verify the transcript glob (provided
   by user in Step 0) actually matches files.
   - If 0 matches → HARD FAIL: "No transcript files found matching the pattern.
     Please verify the directory or adjust the glob."
`,
}
