# CLAUDE.md — analyst-dd

Plugin behavior rules (placeholder; will be expanded after Phase 1 plugin generation).

## Operating principles
- All web access via `jina-ai/cli` invoked through the `Bash(jina:*)` tool.
- All plugin-shipped knowledge files live under `${CLAUDE_PLUGIN_ROOT}/knowledge/`.
- All user-facing artifacts (reports, evidence) write to a shallow per-domain dir under the user's current working directory (`./deals/techdd/`); the command creates it with `mkdir -p`. User-supplied inputs stay in `./workspace/inbox/`.
- Each command begins with a Failure Mode Preflight that hard-fails on missing `jina` CLI, missing `JINA_API_KEY`, or unreadable cwd.
