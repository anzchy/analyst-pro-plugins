// Purpose: Extract the `prompt:` template literal value from an AgentDefinition
// .ts file. Used by build-from-source to inline subagent prompts into plugin
// command bodies as "## Subagent Behavior" sections.
//
// Strategy: scan-with-state-machine to handle escaped backticks (\`) and
// template-literal expressions (${...}) inside the prompt string. Throws on
// missing `prompt:` field or unbalanced backticks.

export interface ExtractedPrompt {
  /** The raw prompt string (backslash-escaped backticks unescaped to literal). */
  readonly text: string
  /** Source file path for error messages. */
  readonly source: string
}

const PROMPT_OPENER = /\bprompt:\s*`/

/**
 * Extract the prompt template literal from agent .ts source.
 *
 * Limitations: assumes the file has exactly one `prompt:` field, declared at
 * top level of an exported object literal, with backtick-delimited string. Does
 * NOT handle prompts split across multiple template literals, prompts loaded
 * from external files via fs.readFileSync, or prompts that use `${expression}`
 * interpolation that would need evaluation.
 */
export function extractPrompt(src: string, sourcePath: string): ExtractedPrompt {
  const opener = PROMPT_OPENER.exec(src)
  if (!opener) {
    throw new Error(`extractPrompt(${sourcePath}): no \`prompt:\` field found`)
  }

  const start = opener.index + opener[0].length
  let i = start
  let escapeNext = false

  while (i < src.length) {
    const c = src[i]

    if (escapeNext) {
      escapeNext = false
      i++
      continue
    }

    if (c === '\\') {
      escapeNext = true
      i++
      continue
    }

    if (c === '`') {
      // Closing backtick of the template literal.
      const raw = src.slice(start, i)
      // Unescape backticks: \` → `
      const text = raw.replace(/\\`/g, '`')
      // Detect template-literal interpolation that we can't evaluate.
      if (/\$\{[^}]+\}/.test(text)) {
        // Allow as-is but warn — the placeholder will appear in plugin output.
        // For our agent prompts, ${...} should not appear; if it does, output
        // file will contain the literal expression for later manual cleanup.
        process.stderr.write(
          `[extractPrompt] WARNING: ${sourcePath} contains template-literal \${...} expressions; emitted as-is.\n`,
        )
      }
      return { text, source: sourcePath }
    }

    i++
  }

  throw new Error(
    `extractPrompt(${sourcePath}): unterminated template literal starting at offset ${start}`,
  )
}
