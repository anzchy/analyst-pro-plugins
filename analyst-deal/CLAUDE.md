# CLAUDE.md — analyst-deal

Plugin behavior rules (placeholder; will be expanded after Phase 1 plugin generation).

## Operating principles
- All web access via `jina-ai/cli` invoked through the `Bash(jina:*)` tool.
- All plugin-shipped knowledge files live under `${CLAUDE_PLUGIN_ROOT}/knowledge/`.
- All user-facing artifacts (reports, evidence) write to shallow per-domain dirs under the user's current working directory (`./deals/`, `./portfolio/`, `./intel/`); the command creates them with `mkdir -p`. User-supplied inputs stay in `./workspace/inbox/`.
- Each command begins with a Failure Mode Preflight that hard-fails on missing `jina` CLI, missing `JINA_API_KEY`, or unreadable cwd.

## Python environment

- Any Python invoked by a command/agent (`python3 ...`, inline `python3 - <<PY`) must run inside the **`web-scrape` conda env**. Activate it first:
  ```bash
  source "$(conda info --base)/etc/profile.d/conda.sh" && conda activate web-scrape
  ```
- Verified in `web-scrape` (2026-05-15): `openpyxl` 3.1.5, `pandas` 2.2.3, `pytest` 7.4.4.
- **NOT present in `web-scrape` or base: `PyYAML` (`import yaml` fails).** Any code path that does `import yaml` (portfolio-tracking Step 5.5.2, `financial-analyzer` agent Step 4.5, and the planned `merge_financials.py`) will `ModuleNotFoundError` until `pip install pyyaml` is run in `web-scrape`, OR the side-file format is switched to stdlib `json`. Preflights must check `import yaml` (or json), not just `import openpyxl`.
