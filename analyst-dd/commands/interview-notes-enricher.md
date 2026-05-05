---
name: interview-notes-enricher
description: Incrementally sync raw interview transcripts (per-person Markdown files) into a consolidated curated Q&A memo. Strictly additive — preserves existing Q&A, adds only missing items, keeps transcript wording verbatim. Trigger when the user asks to 整理 / 补充 / 扩写 / 继续 / 更新 访谈纪要, or to sync a final memo with raw transcripts.
argument-hint: "[interviewee name — optional, defaults to all]"
model: claude-sonnet-4-6
allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash
---

<!-- Hand-written for analyst-pro-plugins (manual-handwritten mode). Do NOT regenerate via build-from-source.ts — your edits will be preserved across rebuilds. -->

# Interview Notes Enricher

Incrementally sync raw interview transcripts into a consolidated Q&A memo. Strictly additive: preserve existing content, add only missing items, keep transcript wording.

## Failure Mode Preflight (hard-fail by default)

Run these checks before Step 0; abort on any failure.

1. **Working directory readable**: run `pwd && ls -la` via Bash. Confirm cwd has files. If empty → HARD FAIL: "No files found in cwd. Please cd to the project directory containing the memo + transcripts."

2. **Plugin-shipped knowledge files readable**: this command does not consume any `${CLAUDE_PLUGIN_ROOT}/knowledge/` files. Skip this check.

3. **CWD writable**: write `.analyst-write-test` then delete it. If fails → HARD FAIL: "CWD not writable; this command edits an existing memo file in place and needs write access."

## Step 0: Parameter Collection (replaces 矽睿-hardcoded values)

This command was historically scoped to one specific project (filenames + glob hardcoded). Generalized version uses `AskUserQuestion` to gather:

1. **Auto-detect the consolidated memo file**:
   ```bash
   # Search cwd for likely memo files (by filename hints)
   ls -la *纪要*final*.md *纪要-final.md *memo*.md *interview*.md 2>/dev/null
   ```
   Pick the largest matching file as the default. If none found, ask user to specify path.

2. **Auto-detect transcript files**:
   ```bash
   # Try common patterns in order
   ls -la 20[0-9][0-9][01][0-9][0-3][0-9]-*访谈.md 20[0-9][0-9][01][0-9][0-3][0-9]-*交流.md *interview*.md 2>/dev/null
   ```
   Pick the broadest matching pattern. Default examples: `./*访谈*.md`, `./*交流*.md`, `./*interview*.md`.

3. **AskUserQuestion** to confirm or override:

   ```
   D1 — Inputs for interview-notes-enricher
   Project/branch/task: $ARGUMENTS (or "all interviewees" if blank)
   ELI10: Tell the command which file to update and where the raw transcripts are. The command will scan the memo for "## 访谈 N | 姓名 · 角色" headings, find each transcript by matching the name, and add missing Q&A.
   Stakes if we pick wrong: command may edit the wrong file or miss transcripts.
   Recommendation: confirm the auto-detected paths if they look right.
   Note: options differ in coverage — use the textual response form below.
   Pros / cons:
   A) Use auto-detected paths shown above (recommended)
     ✅ Fast — no typing required
     ❌ Auto-detection may pick the wrong file if cwd has multiple matches
   B) Override with custom paths
     ✅ Explicit; works for any project layout
     ❌ User must type 2-3 paths
   Net: A is faster; B is exact. Use A unless the auto-detection looks wrong.
   ```

   Then collect (free-text follow-ups for the 3 paths):
   - `MEMO_PATH`: full path to the consolidated memo file
   - `TRANSCRIPT_GLOB`: glob pattern for transcript files (e.g., `./*访谈*.md`)
   - `PROJECT_NAME`: short project identifier used in the section heading prefix (e.g., from `## 访谈 N | 姓名 · 角色`, default heading shape is preserved automatically — this is informational only)

4. If `$ARGUMENTS` is non-empty, scope all subsequent phases to **that interviewee only**. Otherwise prompt the user via a second AskUserQuestion before processing all interviewees in batch (rarely the right default — usually one-at-a-time).

## Style Contract (match the existing memo exactly)

Read 5-10 lines of the existing memo to detect its style. Most memos in this format use:

- **Full-width colons** (`：` not `:`) in Q and A markers
- **Bold Q line**, plain A line:
  ```markdown
  **Q：<问题>？**

  A：<回答原话或最小改写>
  ```
- Sub-sections: `### N.M 主题` (e.g., `### 1.2-1.3 成本结构与供应链`). Place new Q&A under the most relevant existing sub-section; only create a new sub-section when clearly warranted.
- "访谈口径是…" / "访谈口径约…" prefix when the transcript asserts something that sounds like interviewer interpretation rather than a clear interviewee statement.
- Numbers: keep transcript figures (亿元 / 万美金 / %) verbatim; do not round or convert.
- No emojis. No headings like "补充" or "新增". New Q&A must look indistinguishable from existing entries.

If the memo uses a different style (e.g., half-width `:` markers, plain-text Q lines), match that style instead — but record the deviation in the final report.

## Workflow

Follow these phases in order. Each phase has a tight deliverable — do not skip ahead.

### Phase 1 — Scope

1. Confirm which interviewee(s) to update (from `$ARGUMENTS` or AskUserQuestion in Step 0).
2. Resolve transcript file by Glob: search the user's `TRANSCRIPT_GLOB` for files whose name contains the interviewee's Chinese name OR pinyin OR role keyword.
3. Locate the target section in the memo with `Grep` for the section heading pattern: `## 访谈 \\d+ \\| <name>` or `## .*<name>.*\\|` (be liberal — heading conventions vary).
4. If multiple transcript files match the same interviewee, ask the user which to use.
5. If no transcript file matches, hard-fail with the list of unmatched interviewee names and the glob that was searched.

### Phase 2 — Read

1. Read the full transcript for the scoped person. Transcripts are long and conversational; read in chunks if needed, but **cover the whole file** before editing — interviewer questions and key answers are scattered throughout.
2. Read the current memo section end-to-end (from its `## 访谈 N | <name>` to the next `## 访谈` or `---` separator).

### Phase 3 — Extract Candidate Q&A from Transcript

Transcripts are raw speaker dialogue, not pre-formatted Q&A. Identify Q&A as follows:

- **Q candidates**: lines from investor-side or interviewer speakers (typically named `XXX 公司`, or just a name like `成勇`, `岳磊磊`) that are explicit questions — ending in `？`/`?`, or starting with "那 / 你们 / 比如说 / 现在 / 能不能 / 是不是 / 有没有 / 怎么 / 如何" and requesting information.
- **A candidates**: the interviewee's response immediately following, possibly spanning several turns until the topic changes.
- Merge multi-turn answers on the same topic into one `A：` block, preserving wording.
- Discard chit-chat, scheduling, AV setup, and off-topic asides.

Produce a working list of `(question_theme, transcript_quote)` pairs in your response context. Do not write to the memo file yet.

### Phase 4 — Diff Against Memo

For each candidate:

1. `Grep` the current memo section for the same theme (by keyword, not exact string). If present with equivalent content → **skip**.
2. If the memo section has a thinner/incomplete answer and the transcript has concrete detail (numbers, names, timelines) → **queue as an addition** under the same Q, or as a follow-up Q.
3. If the theme is absent → queue as a new Q&A under the most relevant `### N.M` sub-section.

### Phase 5 — Apply Edits

1. Use `Edit` with enough surrounding context (the preceding Q&A block) to uniquely locate the insertion point. Insert new Q&A where it logically belongs — **not** dumped at the end of the section.
2. Keep wording close to the transcript. Light clean-up of filler ("那个 / 就是 / 对对对"), speech repetitions, and obvious speech-to-text artifacts is allowed. Do not rephrase into high-level summary.
3. Never delete or rewrite existing lines unless the user explicitly asks to correct a factual mismatch.
4. Do not renumber existing sub-sections or `## 访谈 N` headings. If the memo skips a number (e.g., `## 访谈 6` is intentionally absent), preserve the gap.

### Phase 6 — Verify & Report

1. Run `git diff -- <MEMO_PATH>` and confirm the diff is **additive only** (no `-` lines except trailing-whitespace artifacts). If the project is not a git repo, skip this check and rely on `Edit` tool's exact-match safety.
2. In the final response, list:
   - Which interviewee section was updated
   - How many Q&A items were added
   - One-line summaries of each addition
   - Any style deviations from the memo's existing convention (rare; flag if found)

Keep the report brief; the diff is the source of truth.

## Editing Rules (hard constraints)

- **Additive only** by default. Removals require explicit user instruction.
- **One section at a time.** Do not batch-edit multiple interviewees in a single turn unless the user explicitly asks.
- **Wording fidelity.** Prefer the transcript's phrasing over polished prose. If the transcript is ambiguous, mark with `访谈口径是…` rather than asserting.
- **Style match.** Detect the memo's existing Q/A marker style (full-width `：` is most common) and match it exactly.
- **Traceability.** Every new Q&A must be backed by specific transcript text. If nothing in the transcript supports it, do not add it.
- **No fabrication.** Do not infer numbers, dates, or names that are not in the transcript.

## Common Pitfalls

- Mixing half-width and full-width colons within the same memo — match whichever the existing entries use.
- Appending all new Q&A at the bottom of the section instead of placing them in the relevant `### N.M` sub-section.
- Summarizing a 5-minute answer into one sentence — losing the concrete details the user wants preserved.
- Treating investor interjections ("嗯", "对对对", "好的") as questions.
- Rewriting existing Q&A wording as a side effect of an `Edit` — always scope `old_string` to the insertion anchor only.
- Renumbering around an intentionally-skipped section number.
- Assuming the memo is in a git repo — fall back to byte-level Edit safety if not.

## Completion Criteria

- Scoped interviewee section is updated in place.
- All added content is traceable to specific transcript text (state which transcript filename each addition came from in the report).
- All pre-existing content is preserved byte-for-byte (verified via `git diff` if applicable).
- Final response states: interviewee name, sub-sections touched, and a short bullet list of added Q&A themes.

## Output Location

This command **edits the user's memo file in place** at the `MEMO_PATH` specified in Step 0. It does NOT write to `./workspace/state/...`. The memo file is the user's, not a plugin artifact.

If the user wants to preserve the original before edits, ask them to commit it first or save a backup copy outside the command.
