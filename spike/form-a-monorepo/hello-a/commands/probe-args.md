---
name: probe-args
description: Phase 0 spike — verify $ARGUMENTS substitution + ${CLAUDE_PLUGIN_ROOT} in string interpolation context.
argument-hint: "[any string]"
---

# Probe: $ARGUMENTS + ${CLAUDE_PLUGIN_ROOT} in string interpolation

## Step 1: Echo the arguments

The user passed: `$ARGUMENTS`

If the literal string `$ARGUMENTS` appears above instead of the user's actual input, report:
> FAIL: $ARGUMENTS not substituted.

Otherwise:
> PASS ($ARGUMENTS): "<actual user input>"

## Step 2: String interpolation of ${CLAUDE_PLUGIN_ROOT}

The plugin root is at `${CLAUDE_PLUGIN_ROOT}`. The knowledge directory should be at `${CLAUDE_PLUGIN_ROOT}/knowledge`. The plugin manifest should be at `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

Inspect the three sentence above. Each contains `${CLAUDE_PLUGIN_ROOT}`. Report whether each occurrence shows the literal string `${CLAUDE_PLUGIN_ROOT}` (FAIL) or an actual filesystem path (PASS).

> Sentence 1: <PASS/FAIL>
> Sentence 2: <PASS/FAIL>
> Sentence 3: <PASS/FAIL>
