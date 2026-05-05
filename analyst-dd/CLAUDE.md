# CLAUDE.md — analyst-dd

Plugin behavior rules (placeholder; will be expanded after Phase 1 plugin generation).

## Operating principles
- All web access via `jina-ai/cli` invoked through the `Bash(jina:*)` tool.
- All plugin-shipped knowledge files live under `${CLAUDE_PLUGIN_ROOT}/knowledge/`.
- All user-facing artifacts (reports, evidence) write to `./workspace/state/` in the user's current working directory.
- Each command begins with a Failure Mode Preflight that hard-fails on missing `jina` CLI, missing `JINA_API_KEY`, or unreadable cwd.
