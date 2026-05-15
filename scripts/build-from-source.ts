#!/usr/bin/env tsx
// Purpose: Generate plugin command files + knowledge files from AnalystPro source.
//
// Reads from ../analyst-pro/electron/skills/<name>/SKILL.md, applies translation
// rules from translation-rules.ts, optionally inlines agent prompt from
// electron/agents/definitions/<agent>.ts, writes to <plugin>/commands/<name>.md
// + copies knowledge files to <plugin>/knowledge/.
//
// Usage:
//   tsx scripts/build-from-source.ts                       # rebuild all 3 plugins
//   tsx scripts/build-from-source.ts --plugin analyst-deal # rebuild one plugin
//   tsx scripts/build-from-source.ts --check               # dry-run, print diff summary
//
// See docs/PLAN.md § "Active design (Jina CLI)" for the full design.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import matter from 'gray-matter'

import { extractPrompt } from './lib/extract-prompt.js'
import {
  applyManagedBlocks,
  dropFrontmatterFields,
  patchAllowedTools,
  rewriteModel,
  transformAgentPrompt,
  transformCommandBody,
} from './lib/apply-rules.js'
import {
  COMMAND_EXTRA_PREFLIGHT,
  FAILURE_MODE_PREFLIGHT,
} from './translation-rules.js'
import {
  AGENT_DEFINITIONS,
  PLUGIN_MANIFEST,
  type CommandSource,
  type PluginDefinition,
} from './plugin-manifest.js'

// ─── Path resolution ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const ANALYST_PRO_ROOT = resolve(REPO_ROOT, '..', 'analyst-pro')

function resolveSource(p: string): string {
  if (p.startsWith('HOME/')) return join(homedir(), p.slice('HOME/'.length))
  if (p.startsWith('ANALYST_PRO/'))
    return resolve(ANALYST_PRO_ROOT, p.slice('ANALYST_PRO/'.length))
  return resolve(REPO_ROOT, p)
}

// ─── CLI args ────────────────────────────────────────────────────────────────

interface CliArgs {
  check: boolean
  plugin: string | null
  verbose: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { check: false, plugin: null, verbose: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check') args.check = true
    else if (a === '--plugin') args.plugin = argv[++i] ?? null
    else if (a === '--verbose' || a === '-v') args.verbose = true
  }
  return args
}

// ─── Build counters ──────────────────────────────────────────────────────────

interface BuildStats {
  pluginsBuilt: number
  commandsAuto: number
  commandsManualGeneralize: number
  commandsManualCopy: number
  commandsManualHandwrittenPreserved: number
  commandsManualHandwrittenStubbed: number
  knowledgeCopied: number
  knowledgeGenerated: number
  warnings: string[]
  errors: string[]
}

function makeStats(): BuildStats {
  return {
    pluginsBuilt: 0,
    commandsAuto: 0,
    commandsManualGeneralize: 0,
    commandsManualCopy: 0,
    commandsManualHandwrittenPreserved: 0,
    commandsManualHandwrittenStubbed: 0,
    knowledgeCopied: 0,
    knowledgeGenerated: 0,
    warnings: [],
    errors: [],
  }
}

// ─── Frontmatter transform pipeline ──────────────────────────────────────────

function transformFrontmatter(
  fm: Record<string, unknown>,
): Record<string, unknown> {
  let out = dropFrontmatterFields(fm)
  if ('model' in out) out.model = rewriteModel(out.model)
  if ('allowed-tools' in out) out['allowed-tools'] = patchAllowedTools(out['allowed-tools'])
  return out
}

// ─── Subagent Behavior section builder ───────────────────────────────────────

function buildSubagentBehaviorSection(agentName: string): string {
  const agentSrcPath = AGENT_DEFINITIONS[agentName]
  if (!agentSrcPath) {
    throw new Error(
      `buildSubagentBehaviorSection: unknown agent "${agentName}" — add to AGENT_DEFINITIONS or use 'secretary' / omit`,
    )
  }
  const tsSource = readFileSync(resolveSource(agentSrcPath), 'utf8')
  const { text } = extractPrompt(tsSource, agentSrcPath)
  const cleansed = transformAgentPrompt(text)
  return `## Subagent Behavior (inlined from AnalystPro \`${agentName}\` agent definition)

> Generated from \`${agentSrcPath}\` by build-from-source.ts. Do not edit
> directly — re-run \`npm run build:plugins\` after upstream changes.

${cleansed.trim()}
`
}

// ─── Output Location section ─────────────────────────────────────────────────

// Per-command output-domain overrides. Most commands inherit their plugin's
// default domain, but a few write elsewhere — e.g. news-scan lives in the
// analyst-deal plugin but emits market intelligence into ./intel/ with dated
// (not per-slug) filenames. Keyed by command name.
const COMMAND_OUTPUT_OVERRIDE: Record<
  string,
  { base: string; slugless?: boolean }
> = {
  'news-scan': { base: './intel', slugless: true },
}

function buildOutputLocationSection(pluginName: string, cmdName: string): string {
  // Conservative default — most commands write under a shallow ./<command-domain>/
  const domains: Record<string, string> = {
    'analyst-deal': './deals',
    'analyst-dd': './deals/techdd',
    'analyst-research': './research',
  }
  const override = COMMAND_OUTPUT_OVERRIDE[cmdName]
  const base = override?.base ?? domains[pluginName] ?? '.'
  const target = override?.slugless ? `\`${base}/\`` : `\`${base}/<slug>/\``
  const slugNote = override?.slugless
    ? 'Filenames are date-prefixed to avoid overwrites.'
    : 'Use the company/project name as the slug (lowercase, hyphen-separated, ASCII transliteration of CJK if applicable).'
  return `## Output Location

Reports and evidence write to ${target} in the user's current working
directory. The command creates this directory with \`mkdir -p\`; no
\`./workspace/\` wrapper is required. ${slugNote}
`
}

// ─── Per-command transform ───────────────────────────────────────────────────

function transformCommand(
  pluginName: string,
  cmdName: string,
  cmdSource: CommandSource,
): string {
  const sourcePath = resolveSource(cmdSource.source)
  if (!existsSync(sourcePath)) {
    throw new Error(
      `transformCommand(${pluginName}/${cmdName}): source not found at ${sourcePath}`,
    )
  }
  const raw = readFileSync(sourcePath, 'utf8')
  const parsed = matter(raw)
  const newFm = transformFrontmatter(parsed.data)

  let body = parsed.content

  // Apply body transforms (path replacements + web tool replacements)
  body = transformCommandBody(body)

  // Inject Failure Mode Preflight at the top of the body (after the H1 if present).
  body = injectAfterH1(body, FAILURE_MODE_PREFLIGHT)

  // Inject command-specific extra preflight (additional checks).
  const extra = COMMAND_EXTRA_PREFLIGHT[cmdName]
  if (extra) {
    // Insert right after the standard preflight section ends.
    body = body.replace(
      /(## Failure Mode Preflight[\s\S]*?)(\n## )/,
      `$1${extra}\n$2`,
    )
  }

  // Append Output Location section.
  body = body.trimEnd() + '\n\n' + buildOutputLocationSection(pluginName, cmdName)

  // Append Subagent Behavior section if agent is real (not 'secretary' or absent).
  if (cmdSource.agent && cmdSource.agent !== 'secretary') {
    body = body.trimEnd() + '\n\n' + buildSubagentBehaviorSection(cmdSource.agent)
  }

  // Build header + frontmatter
  const generatedHeader = `<!-- Generated by analyst-pro-plugins/scripts/build-from-source.ts from ${cmdSource.source}. Do not edit directly. -->\n`

  return generatedHeader + matter.stringify(body.trimStart() + '\n', newFm)
}

/** Insert `block` immediately after the first H1 heading (or at the top if no H1). */
function injectAfterH1(body: string, block: string): string {
  const h1Match = body.match(/^# .+\n+(?:.+\n+)?/m)
  if (h1Match) {
    const idx = h1Match.index! + h1Match[0].length
    return body.slice(0, idx) + '\n' + block.trimEnd() + '\n\n' + body.slice(idx)
  }
  return block.trimEnd() + '\n\n' + body
}

// ─── Manual-copy / manual-generalize handlers ────────────────────────────────

/** For commands already plugin-shaped (e.g., enrich-report). Transform frontmatter + body, no agent inlining. */
function transformManualCopy(
  pluginName: string,
  cmdName: string,
  cmdSource: CommandSource,
): string {
  const sourcePath = resolveSource(cmdSource.source)
  if (!existsSync(sourcePath)) {
    throw new Error(
      `transformManualCopy(${pluginName}/${cmdName}): source not found at ${sourcePath}`,
    )
  }
  const raw = readFileSync(sourcePath, 'utf8')
  const parsed = matter(raw)
  const newFm = transformFrontmatter(parsed.data)
  let body = transformCommandBody(parsed.content)
  body = injectAfterH1(body, FAILURE_MODE_PREFLIGHT)
  const extra = COMMAND_EXTRA_PREFLIGHT[cmdName]
  if (extra) {
    body = body.replace(
      /(## Failure Mode Preflight[\s\S]*?)(\n## )/,
      `$1${extra}\n$2`,
    )
  }
  body =
    body.trimEnd() + '\n\n' + buildOutputLocationSection(pluginName, cmdName)
  const header = `<!-- Generated by analyst-pro-plugins/scripts/build-from-source.ts from ${cmdSource.source} (manual-copy mode). Do not edit directly. -->\n`
  return header + matter.stringify(body.trimStart() + '\n', newFm)
}

/**
 * For commands that hardcode project-specific values (e.g., interview-notes-enricher
 * hardcodes 矽睿). Emit a starter file with the original content + a TODO header
 * asking the implementer to generalize. NOT auto-shippable — Phase 2 task.
 */
function transformManualGeneralize(
  pluginName: string,
  cmdName: string,
  cmdSource: CommandSource,
): string {
  const sourcePath = resolveSource(cmdSource.source)
  if (!existsSync(sourcePath)) {
    throw new Error(
      `transformManualGeneralize(${pluginName}/${cmdName}): source not found at ${sourcePath}`,
    )
  }
  const raw = readFileSync(sourcePath, 'utf8')
  // Strip the original frontmatter via regex (don't parse — source frontmatter
  // may contain YAML-hostile characters like `|` or backticks in description).
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n+/, '')
  const body = transformCommandBody(stripped)

  // Emit a minimal stub frontmatter that the user will refine in Phase 2.
  const stubFm = {
    name: cmdName,
    description: `STUB — needs Phase 2 generalization. See TODO banner below. Source: ${cmdSource.source}`,
    'allowed-tools': 'Read, Write, Edit, Grep, Glob, Bash(jina:*), AskUserQuestion',
  }

  const todoBanner = `<!-- TODO[Phase 2 manual generalize]:
This command was emitted by build-from-source.ts in 'manual-generalize' mode.
The original SKILL.md hardcodes project-specific values (e.g., filenames,
glob patterns, project name). Phase 2 task is to:

  1. Replace hardcoded values with AskUserQuestion-collected parameters
     (memo path, transcript glob, project name).
  2. Verify the resulting command works in any directory, not just the
     original project.
  3. Replace this stub frontmatter description with the real one.
  4. Remove this TODO banner once generalized.

See docs/PLAN.md § "interview-notes-enricher（需通用化）" for the spec.
-->

`
  const header = `<!-- Generated by analyst-pro-plugins/scripts/build-from-source.ts from ${cmdSource.source} (manual-generalize mode — NEEDS HUMAN REVIEW). -->\n`
  return header + matter.stringify(todoBanner + body, stubFm)
}

// ─── Knowledge file copying ──────────────────────────────────────────────────

function copyKnowledge(
  pluginName: string,
  filenames: readonly string[],
  stats: BuildStats,
  check: boolean,
): void {
  const srcDir = resolve(ANALYST_PRO_ROOT, 'workspace/knowledge')
  const dstDir = resolve(REPO_ROOT, pluginName, 'knowledge')
  ensureDir(dstDir)

  for (const file of filenames) {
    const src = join(srcDir, file)
    const dst = join(dstDir, file)
    if (!existsSync(src)) {
      stats.warnings.push(
        `knowledge file missing: ${src} (skipping; ${pluginName}/knowledge/${file} not written)`,
      )
      continue
    }
    if (check) {
      const same = existsSync(dst) && readFileSync(src) .equals(readFileSync(dst))
      if (!same) console.log(`[check] would copy ${pluginName}/knowledge/${file}`)
    } else {
      copyFileSync(src, dst)
    }
    stats.knowledgeCopied++
  }
}

function generateKnowledge(
  pluginName: string,
  generated: PluginDefinition['knowledgeGenerated'],
  stats: BuildStats,
  check: boolean,
): void {
  if (!generated || generated.length === 0) return
  const dstDir = resolve(REPO_ROOT, pluginName, 'knowledge')
  ensureDir(dstDir)

  for (const item of generated) {
    const dst = join(dstDir, item.out)

    // Preserve-on-existence: if file exists with no TODO-banner sentinel, treat
    // it as hand-refined and never overwrite. This mirrors manual-handwritten
    // mode for commands. Initial stub generation runs once when file is missing.
    if (existsSync(dst)) {
      const existingContent = readFileSync(dst, 'utf8')
      const isStillStub = existingContent.includes(
        '<!-- TODO[Phase 2 manual refine]:',
      )
      if (!isStillStub) {
        // File has been hand-refined; preserve untouched.
        if (check) {
          // No-op in check mode (already preserved).
        }
        stats.knowledgeGenerated++ // count as accounted-for
        continue
      }
      // else: still a stub — proceed to regeneration below.
    }

    const src = resolveSource(item.source)
    if (!existsSync(src)) {
      stats.warnings.push(
        `knowledge-generated source missing: ${src} (${pluginName}/knowledge/${item.out} skipped)`,
      )
      continue
    }
    if (item.transform === 'extract-fallback-chain') {
      const raw = readFileSync(src, 'utf8')
      // Strip frontmatter, keep body, prepend TODO banner.
      const parsed = matter(raw)
      const banner = `<!-- TODO[Phase 2 manual refine]:
Generated from ${item.source} (extract-fallback-chain mode).
Phase 2 task: distill this into a focused "China data sources fallback chain"
reference (sogou search → WebFetch → browser → HITL), removing AnalystPro-specific
SkillPalette / Secretary references. See docs/PLAN.md § "browse-cn 怎么处理".
-->

`
      const body = transformCommandBody(parsed.content)
      if (check) {
        const exists = existsSync(dst)
        const same = exists && readFileSync(dst, 'utf8') === banner + body
        if (!same)
          console.log(
            `[check] would write ${pluginName}/knowledge/${item.out}`,
          )
      } else {
        writeFileSync(dst, banner + body)
      }
      stats.knowledgeGenerated++
    }
  }
}

// ─── Per-plugin builder ──────────────────────────────────────────────────────

function buildPlugin(
  name: string,
  def: PluginDefinition,
  stats: BuildStats,
  check: boolean,
  verbose: boolean,
): void {
  const cmdsDir = resolve(REPO_ROOT, name, 'commands')
  const knowledgeDir = resolve(REPO_ROOT, name, 'knowledge')
  ensureDir(cmdsDir)
  ensureDir(knowledgeDir)

  // Clean stale commands and knowledge first (only in non-check mode).
  if (!check) {
    cleanStaleCommands(cmdsDir, def.commands)
    cleanStaleKnowledge(knowledgeDir, def)
  }

  // Process each command.
  for (const [cmdName, cmdSource] of Object.entries(def.commands)) {
    const dst = join(cmdsDir, `${cmdName}.md`)

    // 'manual-handwritten' preserves the hand-written file, but any MANAGED
    // block embedded in it is re-synced to its canonical value so a shared
    // region (e.g. the jina key preflight) can never silently drift. Only
    // emit a stub if the file doesn't exist yet (first-time scaffold).
    if (cmdSource.transform === 'manual-handwritten' && existsSync(dst)) {
      const current = readFileSync(dst, 'utf8')
      const synced = applyManagedBlocks(current)
      if (synced !== current) {
        if (check) {
          stats.errors.push(
            `${name}/${cmdName}: managed-block drift — run \`npm run build:plugins\` to re-sync`,
          )
          console.log(
            `[check] managed-block drift in ${name}/commands/${cmdName}.md`,
          )
        } else {
          writeFileSync(dst, synced)
          if (verbose)
            console.log(
              `synced managed blocks in ${name}/commands/${cmdName}.md`,
            )
        }
      } else if (verbose) {
        console.log(
          `preserved ${name}/commands/${cmdName}.md (manual-handwritten)`,
        )
      }
      stats.commandsManualHandwrittenPreserved++
      continue
    }

    let output: string
    try {
      switch (cmdSource.transform) {
        case 'auto':
          output = transformCommand(name, cmdName, cmdSource)
          stats.commandsAuto++
          break
        case 'manual-copy':
          output = transformManualCopy(name, cmdName, cmdSource)
          stats.commandsManualCopy++
          break
        case 'manual-generalize':
          output = transformManualGeneralize(name, cmdName, cmdSource)
          stats.commandsManualGeneralize++
          break
        case 'manual-handwritten':
          // File doesn't exist (caught above) — emit a one-time stub so the
          // human contributor sees the source content + TODO banner.
          output = transformManualGeneralize(name, cmdName, cmdSource)
          stats.commandsManualHandwrittenStubbed++
          break
        default: {
          const _exhaustive: never = cmdSource.transform
          throw new Error(`unknown transform: ${_exhaustive}`)
        }
      }
    } catch (err) {
      stats.errors.push(
        `${name}/${cmdName}: ${err instanceof Error ? err.message : String(err)}`,
      )
      continue
    }

    if (check) {
      const exists = existsSync(dst)
      const same = exists && readFileSync(dst, 'utf8') === output
      if (!same)
        console.log(`[check] would write ${name}/commands/${cmdName}.md`)
      else if (verbose)
        console.log(`[check] up-to-date  ${name}/commands/${cmdName}.md`)
    } else {
      writeFileSync(dst, output)
      if (verbose) console.log(`wrote ${name}/commands/${cmdName}.md`)
    }
  }

  // Knowledge files.
  copyKnowledge(name, def.knowledge, stats, check)
  generateKnowledge(name, def.knowledgeGenerated, stats, check)

  stats.pluginsBuilt++
}

/** Remove .md files in cmdsDir that aren't in the manifest's command list. */
function cleanStaleCommands(
  cmdsDir: string,
  commands: Record<string, CommandSource>,
): void {
  if (!existsSync(cmdsDir)) return
  const expected = new Set<string>(Object.keys(commands).map(c => `${c}.md`))
  for (const entry of readdirSync(cmdsDir)) {
    if (entry === '.gitkeep') continue
    if (!entry.endsWith('.md')) continue
    if (!expected.has(entry)) {
      const full = join(cmdsDir, entry)
      if (statSync(full).isFile()) rmSync(full)
    }
  }
}

/** Remove .md files in knowledgeDir that aren't in the manifest's knowledge + knowledgeGenerated list. */
function cleanStaleKnowledge(
  knowledgeDir: string,
  def: PluginDefinition,
): void {
  if (!existsSync(knowledgeDir)) return
  const expected = new Set<string>(def.knowledge)
  for (const item of def.knowledgeGenerated ?? []) expected.add(item.out)
  // Always keep LICENSE files (TODO-2 future) and .gitkeep
  expected.add('LICENSE')
  expected.add('.gitkeep')
  for (const entry of readdirSync(knowledgeDir)) {
    if (!entry.endsWith('.md') && entry !== 'LICENSE') continue
    if (!expected.has(entry)) {
      const full = join(knowledgeDir, entry)
      if (statSync(full).isFile()) rmSync(full)
    }
  }
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

// ─── Entry ───────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const stats = makeStats()

  if (!existsSync(ANALYST_PRO_ROOT)) {
    console.error(
      `ERROR: AnalystPro source not found at ${ANALYST_PRO_ROOT}.`,
    )
    console.error(
      `Expected sibling repo at ../analyst-pro relative to ${REPO_ROOT}.`,
    )
    process.exit(2)
  }

  const targets = args.plugin
    ? { [args.plugin]: PLUGIN_MANIFEST[args.plugin] }
    : PLUGIN_MANIFEST

  if (args.plugin && !PLUGIN_MANIFEST[args.plugin]) {
    console.error(
      `ERROR: unknown plugin "${args.plugin}". Known: ${Object.keys(PLUGIN_MANIFEST).join(', ')}`,
    )
    process.exit(2)
  }

  for (const [name, def] of Object.entries(targets)) {
    if (!def) continue
    if (args.verbose) console.log(`\n=== ${name} ===`)
    buildPlugin(name, def, stats, args.check, args.verbose)
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(
    `\nBuild ${args.check ? 'check' : 'complete'}: ${stats.pluginsBuilt} plugin(s); ` +
      `${stats.commandsAuto} auto, ${stats.commandsManualCopy} manual-copy, ` +
      `${stats.commandsManualGeneralize} manual-generalize, ` +
      `${stats.commandsManualHandwrittenPreserved} hand-written preserved, ` +
      `${stats.commandsManualHandwrittenStubbed} hand-written stubbed; ` +
      `${stats.knowledgeCopied} knowledge copied, ${stats.knowledgeGenerated} generated.`,
  )

  if (stats.warnings.length > 0) {
    console.log(`\nWarnings (${stats.warnings.length}):`)
    for (const w of stats.warnings) console.log(`  - ${w}`)
  }

  if (stats.errors.length > 0) {
    console.error(`\nErrors (${stats.errors.length}):`)
    for (const e of stats.errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  if (stats.commandsManualGeneralize > 0) {
    console.log(
      `\nNOTE: ${stats.commandsManualGeneralize} command(s) emitted in manual-generalize mode and need human review.`,
    )
    console.log(
      `      Search generated files for "TODO[Phase 2 manual generalize]" headers.`,
    )
  }
}

// Run only when invoked as script (allows test imports without side effects).
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main()
}

export { buildPlugin, makeStats, parseArgs, resolveSource, transformCommand }
