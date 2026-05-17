// Purpose: Per-plugin definition of which commands belong, which agent prompt
// each command inlines, which knowledge files to copy, and which MCP servers
// to declare. Imported by build-from-source.ts.

/** Special-case transform mode for commands that can't be done by pure regex. */
export type TransformMode =
  | 'auto'              // standard transformer pipeline
  | 'manual-copy'       // already generic; just rewrite frontmatter (e.g., enrich-report)
  | 'manual-generalize' // (legacy) emit a stub with TODO banner; user generalizes once
  | 'manual-handwritten' // file is human-owned: if exists, preserve; if missing, emit stub (idempotent)

/** Source location of a command's SKILL.md, plus optional agent and transform mode. */
export interface CommandSource {
  /**
   * Source path. Conventions:
   *   - "ANALYST_PRO/..." — resolved against the AnalystPro repo root (../analyst-pro)
   *   - "HOME/..."        — resolved against ~ (user-level Claude skills)
   */
  readonly source: string

  /**
   * Optional agent whose prompt gets inlined as "## Subagent Behavior" in the
   * command body. If 'secretary' (or absent), no inlining — the command body
   * is used as-is. Maps to a key in AGENT_DEFINITIONS below.
   */
  readonly agent?: string

  readonly transform: TransformMode
}

export interface PluginDefinition {
  readonly commands: Record<string, CommandSource>
  /** Source filenames from ANALYST_PRO/workspace/knowledge/. cp'd verbatim. */
  readonly knowledge: readonly string[]
  /**
   * Knowledge files generated from non-knowledge sources (e.g., extracting
   * browse-cn's fallback chain into cn-data-sources.md). For MVP these are
   * cp'd with a TODO header — manual refinement happens post-build.
   */
  readonly knowledgeGenerated?: ReadonlyArray<{
    readonly out: string
    readonly source: string
    readonly transform: 'extract-fallback-chain'
  }>
  /** MCP servers declared in plugin's `.mcp.json`. Empty = no .mcp.json file. */
  readonly mcpServers: readonly string[]
}

export const PLUGIN_MANIFEST: Record<string, PluginDefinition> = {
  'analyst-deal': {
    commands: {
      'deal-analysis': {
        source: 'ANALYST_PRO/electron/skills/deal-analysis/SKILL.md',
        agent: 'deal-analyst',
        transform: 'auto',
      },
      memo: {
        source: 'ANALYST_PRO/electron/skills/memo/SKILL.md',
        agent: 'secretary', // No subagent — uses Secretary's main role; no prompt inline
        transform: 'auto',
      },
      'codex-polish-report': {
        source: 'ANALYST_PRO/electron/skills/codex-polish-report/SKILL.md',
        agent: 'secretary',
        transform: 'auto',
      },
      'news-scan': {
        source: 'ANALYST_PRO/electron/skills/news-scan/SKILL.md',
        agent: 'market-intel',
        transform: 'auto',
      },
      // Plugin-native, hand-written (no AnalystPro/HOME source). Registered so
      // cleanStaleCommands keeps them and manual-handwritten preserves edits
      // across rebuilds. Source path is a self-reference (never read while the
      // file exists). See each file's header banner.
      'portfolio-tracking': {
        source: 'analyst-deal/commands/portfolio-tracking.md',
        transform: 'manual-handwritten',
      },
      'competitor-enricher': {
        source: 'analyst-deal/commands/competitor-enricher.md',
        transform: 'manual-handwritten',
      },
      // Standalone /financial-analyzer (added in b5c5cdd, PR1). Was committed
      // to analyst-deal/commands/ but never registered here, so every
      // `npm run build:plugins` cleanStaleCommands() deleted it. Registered
      // as manual-handwritten (self-reference source) like its siblings.
      'financial-analyzer': {
        source: 'analyst-deal/commands/financial-analyzer.md',
        transform: 'manual-handwritten',
      },
    },
    // Union of all knowledge files referenced by:
    //   - deal-analyst.ts (8 files: bp/dd/ic/past_ic/red/report/tech)
    //   - market-intel.ts (3 files: source_list/triage_rules/vc_watchlist)
    //   - memo SKILL.md (1 file: ic_memo_template — already in set)
    knowledge: [
      'bp_framework.md',
      'dd_checklist_template.md',
      'dd_question_list_template.md',
      'ic_memo_template.md',
      'past_ic_decisions.md',
      'red_flags.md',
      'report_template.md',
      'source_list.md',
      'tech_checklist.md',
      'triage_rules.md',
      'vc_watchlist.md',
      // Plugin-native, hand-maintained (no AnalystPro source). Listed so
      // cleanStaleKnowledge keeps them; copyKnowledge skips (missing src) and
      // preserves the in-repo copy. Referenced by portfolio-tracking /
      // competitor-enricher.
      'competitor_card_schema.md',
      'financial_ratios.md',
      'portfolio_tracking_template.md',
    ],
    knowledgeGenerated: [
      {
        out: 'cn-data-sources.md',
        source: 'ANALYST_PRO/electron/skills/browse-cn/SKILL.md',
        transform: 'extract-fallback-chain',
      },
    ],
    mcpServers: ['codex'], // codex-polish-report uses Codex MCP
  },

  'analyst-dd': {
    commands: {
      'tech-dd': {
        source: 'ANALYST_PRO/electron/skills/tech-dd/SKILL.md',
        agent: 'hardtech-dd',
        transform: 'auto',
      },
      'interview-notes-enricher': {
        // Source kept for reference; the actual command is hand-written in
        // analyst-dd/commands/interview-notes-enricher.md and preserved across
        // rebuilds by the manual-handwritten mode (TODO-1 generalization done).
        source: 'HOME/.claude/skills/interview-notes-enricher/SKILL.md',
        transform: 'manual-handwritten',
      },
    },
    knowledge: [
      'tech_checklist.md',
      'export_control_rules.md',
      'dd_checklist_template.md',
      'dd_question_list_template.md',
      'glossary.md',
    ],
    mcpServers: [], // no .mcp.json
  },

  'analyst-research': {
    commands: {
      'industry-research': {
        source: 'ANALYST_PRO/electron/skills/industry-research/SKILL.md',
        agent: 'industry-researcher',
        transform: 'auto',
      },
      'enrich-report': {
        source: 'HOME/.claude/skills/enrich-report/SKILL.md',
        transform: 'manual-copy',
      },
    },
    // industry-researcher.ts refs: competitors, glossary, industry_map.
    // industry-research SKILL.md refs: competitors, industry_map (subset).
    // report_template.md was previously misplaced here — it's deal-analyst's
    // Phase 1 report structure, not an industry-research artifact.
    knowledge: ['industry_map.md', 'competitors.md', 'glossary.md'],
    knowledgeGenerated: [
      {
        out: 'cn-data-sources.md',
        source: 'ANALYST_PRO/electron/skills/browse-cn/SKILL.md',
        transform: 'extract-fallback-chain',
      },
    ],
    mcpServers: [],
  },
}

/**
 * Map agent name → source .ts file. Used by extract-prompt.ts to pull the
 * `prompt:` template literal out of an AgentDefinition export.
 *
 * 'secretary' is intentionally absent — commands keyed to secretary do NOT
 * inline any prompt (the command body alone is the runtime instruction).
 */
export const AGENT_DEFINITIONS: Record<string, string> = {
  'deal-analyst': 'ANALYST_PRO/electron/agents/definitions/deal-analyst.ts',
  'hardtech-dd': 'ANALYST_PRO/electron/agents/definitions/hardtech-dd.ts',
  'industry-researcher':
    'ANALYST_PRO/electron/agents/definitions/industry-researcher.ts',
  'market-intel': 'ANALYST_PRO/electron/agents/definitions/market-intel.ts',
}
