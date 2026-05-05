---
name: probe-root
description: Phase 0 spike — verify ${CLAUDE_PLUGIN_ROOT} resolves in command body Read directive. Run via /hello-a:probe-root.
---

# Probe: ${CLAUDE_PLUGIN_ROOT} in body Read

## Step 1: Read the test knowledge file

Read `${CLAUDE_PLUGIN_ROOT}/knowledge/test.md` and quote back the line that contains "MAGIC_TOKEN:" verbatim.

If you cannot read the file because the path contains a literal `${CLAUDE_PLUGIN_ROOT}` string (variable not interpolated), report:
> FAIL: ${CLAUDE_PLUGIN_ROOT} not interpolated in body Read directive.

If you read it successfully, report:
> PASS: variable resolved to <actual path>. Token: <verbatim MAGIC_TOKEN line>

## Step 2: Print the resolved path

Tell the user the literal value of `${CLAUDE_PLUGIN_ROOT}` you observed. We need this for the findings doc.
