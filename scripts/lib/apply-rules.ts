// Purpose: Pure functions that apply translation rules to text + frontmatter.
// Used by build-from-source.ts. All functions here are pure — no I/O, fully
// testable.

import {
  ALLOWED_TOOLS_PATCH,
  AGENT_PROMPT_CLEANSING,
  DROP_FIELDS,
  MANAGED_BLOCKS,
  MODEL_MAP,
  PATH_REPLACEMENTS,
  WEB_TOOL_REPLACEMENTS,
} from '../translation-rules.js'

/** Apply path-replacement rules in declared order. Each rule is a regex with global flag. */
export function applyPathReplacements(text: string): string {
  let out = text
  for (const { regex, to } of PATH_REPLACEMENTS) {
    out = out.replace(regex, to)
  }
  return out
}

/** Apply agent-prompt cleansing rules (Task tool refs, subagent dispatch language). */
export function applyAgentPromptCleansing(text: string): string {
  let out = text
  for (const { regex, replaceWith } of AGENT_PROMPT_CLEANSING) {
    out = out.replace(regex, replaceWith)
  }
  return out
}

/** Apply web-tool replacements (WebSearch / WebFetch / browser_* → jina CLI). */
export function applyWebToolReplacements(text: string): string {
  let out = text
  for (const { regex, replaceWith } of WEB_TOOL_REPLACEMENTS) {
    out = out.replace(regex, replaceWith)
  }
  return out
}

/**
 * Drop ap-* and AnalystPro-private frontmatter fields, returning a new object.
 * Does not mutate input. Order-preserving.
 */
export function dropFrontmatterFields(
  fm: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const dropSet = new Set<string>(DROP_FIELDS)
  for (const [k, v] of Object.entries(fm)) {
    if (!dropSet.has(k)) out[k] = v
  }
  return out
}

/** Rewrite short model name to canonical plugin model ID. Pass-through if unknown. */
export function rewriteModel(model: unknown): unknown {
  if (typeof model !== 'string') return model
  return MODEL_MAP[model] ?? model
}

/**
 * Patch the `allowed-tools` frontmatter value:
 *   - Removes any tool in ALLOWED_TOOLS_PATCH.remove
 *   - Adds each tool in ALLOWED_TOOLS_PATCH.add (deduped, append at end)
 *
 * Accepts either a comma-separated string or a YAML list (string[]). Returns
 * the same shape as input (string in → string out, array in → array out).
 */
export function patchAllowedTools(value: unknown): unknown {
  if (value == null) return ALLOWED_TOOLS_PATCH.add.join(', ')

  const wasString = typeof value === 'string'
  const list = wasString
    ? (value as string)
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : Array.isArray(value)
      ? (value as unknown[]).map(v => String(v).trim()).filter(s => s.length > 0)
      : []

  const removeSet = new Set<string>(ALLOWED_TOOLS_PATCH.remove)
  const filtered = list.filter(t => !removeSet.has(t))

  // Append `add` items if not already present (preserve order).
  for (const tool of ALLOWED_TOOLS_PATCH.add) {
    if (!filtered.includes(tool)) filtered.push(tool)
  }

  return wasString ? filtered.join(', ') : filtered
}

/**
 * Re-sync every managed block in `text` to its canonical value from
 * `MANAGED_BLOCKS`. A managed region is delimited by HTML comment markers:
 *
 *   <!-- BEGIN MANAGED:<id> ...optional note... -->
 *   ...inner text (replaced wholesale)...
 *   <!-- END MANAGED:<id> -->
 *
 * The BEGIN/END marker lines are preserved verbatim; only the text between
 * them is replaced with the canonical content. Idempotent — applying twice
 * yields identical output. Text with no managed markers (or markers for an
 * id not in MANAGED_BLOCKS) is returned unchanged.
 */
export function applyManagedBlocks(text: string): string {
  let out = text
  for (const [id, content] of Object.entries(MANAGED_BLOCKS)) {
    const escId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `(<!-- BEGIN MANAGED:${escId}[^\\n]*?-->)[\\s\\S]*?(<!-- END MANAGED:${escId} -->)`,
      'g',
    )
    out = out.replace(
      re,
      (_m, begin: string, end: string) => `${begin}\n${content}\n${end}`,
    )
  }
  return out
}

/** Apply path-replacements + web-tool-replacements to plugin command body text. */
export function transformCommandBody(text: string): string {
  return applyWebToolReplacements(applyPathReplacements(text))
}

/**
 * Apply path-replacements + agent-prompt-cleansing + web-tool-replacements to
 * extracted agent prompt. Agent prompts also reference WebSearch / WebFetch /
 * browser_* — they need the same Jina CLI translation as command bodies.
 */
export function transformAgentPrompt(text: string): string {
  return applyWebToolReplacements(
    applyAgentPromptCleansing(applyPathReplacements(text)),
  )
}
