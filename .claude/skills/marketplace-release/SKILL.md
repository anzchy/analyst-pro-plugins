---
name: marketplace-release
description: >-
  Project-scoped release skill for the analyst-pro-plugins marketplace repo.
  Analyzes both committed (since last tag) AND uncommitted skill/plugin
  changes, then adaptively proposes per-artifact version bumps (repo
  tag/CHANGELOG, each plugin.json, marketplace.json — command/agent edits roll
  up to their owning plugin) for confirmation. Default (full) mode updates
  CHANGELOG, tags, pushes, and publishes the GitHub release. `--bump-only`
  mode stops after applying + committing the version bumps and a local
  annotated tag — no push, no GitHub release. Use this (not the global
  /gh-release) when cutting a versioned release of THIS repo so plugin +
  marketplace versions stay in sync.
---

# marketplace-release

Project-scoped variant of `gh-release` for **this repo only**. Same release
flow, plus a model-driven **Step 0** that proposes per-artifact version bumps
(repo tag/CHANGELOG, each `plugin.json`, and the mirrored `marketplace.json`
entries — command/agent/knowledge edits roll up to their owning plugin) from
**both** the commits since the last release **and** any uncommitted
working-tree changes. The global `/gh-release` skill is intentionally left
without Step 0; this project-local skill owns that behavior. Has two modes:
**full** (default — bump → CHANGELOG → tag → push → GitHub release) and
**`--bump-only`** (bump + local tag, then stop — no push, no release).

## Usage

```
/marketplace-release              # full release: bump + CHANGELOG + tag + push + gh release
/marketplace-release v1.2.3       # repo tag pre-supplied; Step 0 still bumps the rest
/marketplace-release --bump-only  # bump manifests + local tag only; no push, no gh release
/marketplace-release v1.2.3 --bump-only   # both: fixed tag, local-only
```

## Invocation modes

This skill has two modes. Parse the argument string before Step 0:

| Mode | Trigger | Stops after |
|---|---|---|
| **full** (default) | no `--bump-only` flag | Step 7 (pushed + GitHub release published) |
| **bump-only** | `--bump-only` anywhere in args | Step 6a (manifests + CHANGELOG committed, **local** annotated tag created) — **no `git push`, no `gh release create`** |

- A bare version token (e.g. `v1.2.3`) is still the **repo release tag** and
  pre-answers Step 2, in either mode.
- `--bump-only` is the adaptive "sync the versions, don't ship yet" entry
  point: it runs the same Step 0 analysis, applies + commits the bumps,
  writes the CHANGELOG, and lays down a local annotated tag, then **stops** so
  the analyst can review and push manually later. The full mode is the only
  one that touches the remote or GitHub.
- Set `MODE=full` or `MODE=bump-only` from this parse and carry it forward;
  Step 6 branches on it.

## Workflow

When this skill is invoked, follow these steps.

> If invoked with a version argument (`/marketplace-release v1.2.3`), that is
> the **repo release tag** — Step 2 is pre-answered, but Step 0 still runs (it
> bumps the *other* artifacts and sanity-checks the supplied tag against the
> commit history). The `--bump-only` flag is a mode switch, not a tag.

### Step 0: Version bump analysis (model-driven, propose + confirm)

Goal: from the committed **and** uncommitted changes, decide which
version-bearing artifacts changed and propose a semver bump for each. **The
model makes the semver judgment; the user confirms before anything is
written.** This step runs identically in both `full` and `--bump-only` mode.

**0.1 — Range + changed files.** The trigger model is adaptive: it folds in
**both** committed changes since the last tag **and** anything still
uncommitted in the working tree (staged or not). This makes the skill work
whether the analyst already committed their skill edits or is calling it
straight off a dirty tree.

```bash
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
RANGE=$([ -n "$PREV_TAG" ] && echo "${PREV_TAG}..HEAD" || echo "")

# (a) committed since last tag — commit subjects drive the semver class
git log ${RANGE} --no-merges --pretty='%h %s'

# (b) changed paths = committed ∪ uncommitted (staged + unstaged + untracked)
{
  git diff ${PREV_TAG}..HEAD --name-only 2>/dev/null || git ls-files
  git diff --name-only            # unstaged tracked edits
  git diff --name-only --cached    # staged
  git ls-files --others --exclude-standard   # new untracked files
} | sort -u
```

- The **union** of (a) and (b) is the changed-path set Step 0.3 maps to
  owning artifacts.
- For paths that appear **only** in the uncommitted set (no commit yet),
  there is no Conventional-Commit type to read. Infer the change class from
  the nature of the edit and **state the inference explicitly** in the Step
  0.5 proposal (e.g. "competitor-enricher.md edited, uncommitted — treating
  as `feat` → analyst-deal minor; confirm or correct"). When in doubt,
  propose the smaller bump and let the user escalate in the Edit branch.
- Untracked files under `.claude/` (session/editor config) and other paths
  unrelated to a versioned artifact are noise — exclude them from the
  artifact mapping, don't let them force a bump.

**0.2 — Discover version-bearing artifacts** (skip any that don't exist):

| Artifact | Version source | "Owns" these paths |
|---|---|---|
| Repo / release | git tag + `CHANGELOG.md` heading | everything (the tag always bumps) |
| Each plugin | `*/.claude-plugin/plugin.json` `version` | that plugin dir — **including** its `commands/`, `agents/`, `knowledge/` |
| Marketplace | `.claude-plugin/marketplace.json` `plugins[].version` | mirror each plugin's number 1:1 |
| Package | root `package.json` `version` | only if it has historically tracked releases — check `git log -p -- package.json`; if it was frozen across prior tags, **leave it and say so** |

> **There is no per-command / per-agent / per-skill version field in this
> repo.** Command, agent, and knowledge markdown frontmatter carry `name` /
> `description` / `model` / `allowed-tools` but **no `version:`**, and there
> are no sibling `VERSION` files. "Skill version" therefore means **the
> version of the plugin that owns that command/agent**. A change to e.g.
> `analyst-deal/commands/competitor-enricher.md` or
> `analyst-deal/agents/competitor-enricher.md` rolls **up** to
> `analyst-deal/.claude-plugin/plugin.json` `version`, and
> `marketplace.json`'s `analyst-deal` entry mirrors that same number. Never
> invent a frontmatter `version:` on a command/agent to "bump the skill" —
> bump the owning plugin instead, and mirror it in `marketplace.json`.
>
> This repo's known cadence: `package.json` is `"private": true` and has
> stayed `0.0.1` across v0.1.0/v0.1.1/v0.1.2 — leave it unless told
> otherwise. Per-plugin versions are independent of the repo tag
> (`analyst-deal` was at `0.0.2` while the repo was `v0.1.1`); respect that,
> don't force-sync.

**0.3 — Map commits → owning artifact.** For each changed path, attribute it to
the narrowest owning artifact above. A commit can touch several artifacts.

**0.4 — Classify per artifact and propose a bump** (Conventional Commits):

- `BREAKING CHANGE:` / `!:` → **major** (or, for `0.y.z` pre-1.0 artifacts,
  **minor** — pre-1.0 has no stability guarantee; state this explicitly).
- `feat:` → **minor** (pre-1.0: minor, or patch if the artifact is barely
  past 0.0.x — use judgment and explain).
- `fix:` / `perf:` → **patch**.
- `docs:` / `refactor:` / `chore:` / `test:` only → **no bump** for that
  artifact (but the **repo tag still bumps** — a release always tags).
- The repo tag/CHANGELOG version: bump by the **highest** change class across
  all artifacts, unless the user passed an explicit tag argument.

Respect existing per-artifact cadence — if a plugin has deliberately lagged
(e.g., stayed `0.0.x` while the repo went `0.1.x`), say so and propose the
in-line next number, don't silently leap it to match the repo.

**0.5 — Present the plan via `AskUserQuestion`** (one question, the proposed
table in the question body; options: Approve / Edit / Cancel). Format:

```
Proposed version bumps — since <PREV_TAG> (<N> commits + <M> uncommitted paths)
Mode: <full | bump-only>

  <artifact>            <cur> -> <new>   (<why: commit type, or "uncommitted edit — inferred <class>">)
  ...
  repo tag / CHANGELOG  <prev> -> <new>  (highest class: <feat|fix|...>)

  package.json          0.0.1 (unchanged — frozen, private build tooling)
```

State the mode in the proposal so the user knows whether approving will
publish (full) or stop locally (`--bump-only`).

- **Approve** → apply as proposed.
- **Edit** → ask which line(s) to change, collect new numbers, re-confirm.
- **Cancel** → stop the whole skill, write nothing.

**0.6 — Apply** (only after Approve):

- Edit each `plugin.json` and the matching `marketplace.json` `plugins[]`
  entry with `Edit` (exact string; never reformat the JSON). There are **no**
  command/agent/skill version fields to touch — those bumps are expressed
  entirely through the owning plugin's number.
- Validate every touched JSON parses (`python3 -c 'import json,sys;json.load(open(sys.argv[1]))' <f>`).
- Do **not** touch `CHANGELOG.md` here — Step 5.5 owns it (it will use the
  repo version confirmed in this step).
- Commit the manifest bumps as their own commit:

```bash
git add <each edited manifest>
git commit -m "chore(release): bump artifact versions for <repo-tag>

<one line per bumped artifact: name cur -> new>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Carry the confirmed **repo tag** forward — Step 2 must use it, not re-ask.

> Skip Step 0 entirely only if the user explicitly says "don't bump versions".
> If no version-bearing artifacts exist at all, Step 0 reduces to: confirm the
> repo tag (Step 2) and let Step 5.5 record the CHANGELOG — nothing else.

### Step 1: Check Current State

Run these commands to understand the current state:

```bash
# Get latest tags
git tag --sort=-v:refname | head -10

# Get current branch
git branch --show-current

# Get latest commit
git log -1 --oneline

# Check if there are uncommitted changes
git status --porcelain
```

### Step 2: Version Tag

**If Step 0 already ran**, the repo tag was proposed and confirmed there (or
passed as the `/marketplace-release <tag>` argument) — **use that, do not
re-ask**. Only fall through to the prompt below if Step 0 was skipped and no
argument was supplied.

Use `AskUserQuestion` to ask the user for the version tag:

```
Question: "What version tag should this release have?"
Options:
- Suggest next version based on latest tag (e.g., if latest is v1.2.0, suggest v1.2.1, v1.3.0, v2.0.0)
- Custom (let user type their own)
```

**Version format examples:**
- `v1.0.0` - Semantic versioning
- `2026.2.1` - Date-based versioning
- `v1.0.0-beta.1` - Pre-release

### Step 3: Gather Commits Since Last Release

```bash
# Get the previous tag
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# If no previous tag, get all commits
if [ -z "$PREV_TAG" ]; then
  git log --oneline --no-merges | head -50
else
  git log ${PREV_TAG}..HEAD --oneline --no-merges
fi
```

### Step 4: Categorize Changes

Parse commit messages and categorize them:

**Categories:**
- **Features** - `feat:`, `feature:`, `add:`
- **Fixes** - `fix:`, `bugfix:`, `hotfix:`
- **Documentation** - `docs:`, `doc:`
- **Performance** - `perf:`
- **Refactoring** - `refactor:`
- **Security** - `security:`, commits mentioning CVE/CWE/GHSA
- **Breaking Changes** - commits with `BREAKING CHANGE:` or `!:`
- **Other** - everything else

### Step 5: Generate Release Notes

Create release notes with this structure:

```markdown
## <App Name> <Version>

### Changes

#### Features
- <feature description> (#<PR number>) Thanks @<contributor>

#### Fixes
- <fix description> (#<PR number>) Thanks @<contributor>

#### Documentation
- <doc changes>

#### Security
- <security fixes with CVE/CWE references if applicable>

#### Other
- <other changes>

### Contributors
Thanks to all contributors: @user1, @user2, ...

### Full Changelog
https://github.com/<owner>/<repo>/compare/<prev-tag>...<new-tag>
```

### Step 5.5: Update CHANGELOG.md (before tagging)

This step runs **before** creating the git tag so the CHANGELOG commit is included in
the release. If `CHANGELOG.md` does not exist in the repo root, create it with the
standard Keep a Changelog header and `## [Unreleased]` section before proceeding.

**Rules (non-negotiable):**
- Always use `Edit` with exact `old_string` — never `Write` on CHANGELOG.md.
- Never delete, reorder, or replace existing entries. Insert only.
- Preserve any existing `## [Unreleased]` section exactly as found.

**1. Read the file to find the insertion point.**

```bash
head -80 CHANGELOG.md
```

Find the first line that matches `^## \[` followed by a version number (not `Unreleased`).
That line is the `<first-versioned-section>` anchor used in the Edit below.

If no versioned section exists yet (file is empty or only has `[Unreleased]`), insert
after the last line of the `[Unreleased]` block (or after the header if no Unreleased).

**2. Format the entry** using the categorized changes from Step 4:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- <user-facing description> (closes #N)

### Fixed
- <user-facing description> (closes #N)

### Changed
- <user-facing description>

### Security
- <description> (CVE/GHSA reference if applicable)

---

```

- Omit any category that has no entries.
- Write from the user's perspective ("You can now…" → just "Description").
- Include issue/PR references as `(closes #N)` where known.
- End the block with `---` and a blank line so it visually separates from the next entry.

**3. Insert using Edit:**

```
old_string: "<first-versioned-section>"   ← exact text of that ## [...] line
new_string:  "<new entry>\n\n<first-versioned-section>"
```

**4. Update the link references** at the bottom of CHANGELOG.md:

- Update `[Unreleased]` to compare against the new tag: `compare/vX.Y.Z...HEAD`
- Add a new link for the version: `[X.Y.Z]: https://github.com/<owner>/<repo>/compare/v<prev>...vX.Y.Z`

**5. Commit the CHANGELOG update:**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG entry for vX.Y.Z

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Do **not** push yet — the tag creation in Step 6 will be a separate push.

---

### Step 6: Create Tag and Release

**Step 6a — Local annotated tag (BOTH modes).**

```bash
git tag -a <version> -m "Release <version>"
```

**Step 6b — Push + GitHub release (FULL mode only).**

> **Gate:** run Step 6b *only* if `MODE=full`. If `MODE=bump-only`, **skip
> all of 6b** — do not `git push`, do not `gh release create`. The bump-only
> run ends here with the manifests + CHANGELOG committed and a local-only
> annotated tag, exactly as the analyst requested. Jump straight to Step 7
> and report the local-only result.

```bash
# Push branch + tag together so CHANGELOG commit and tag land atomically
git push origin HEAD <version>

# Create GitHub release
gh release create <version> \
  --title "<App Name> <version>" \
  --notes "$(cat <<'EOF'
<generated release notes>
EOF
)"
```

> Even in `full` mode, treat `git push` / `gh release create` as
> remote-visible actions: state that you are about to push and publish before
> running 6b. (`--bump-only` sidesteps this entirely by never reaching 6b.)

### Step 7: Report Result

**Full mode** — after publishing, display:
- Release URL
- Tag name
- Number of commits included
- Previous version (if any)
- Per-artifact version bumps applied in Step 0
- Whether CHANGELOG.md was updated

**Bump-only mode** — display instead:
- Per-artifact version bumps applied in Step 0 (cur → new, with the driving change)
- The local annotated tag created (`<version>`) — **not pushed**
- Commits created (manifest bump commit + CHANGELOG commit)
- Whether CHANGELOG.md was updated
- The exact follow-up command to ship later, e.g.:
  `git push origin HEAD <version> && gh release create <version> ...`
  (or "re-run `/marketplace-release <version>` in full mode")
- Reminder that nothing was pushed and no GitHub release exists yet

## Options

### Draft Release
```bash
gh release create <version> --draft --notes "..."
```

### Pre-release
```bash
gh release create <version> --prerelease --notes "..."
```

### With Assets
```bash
gh release create <version> --notes "..." ./build/*.zip
```

## Examples

### Basic Release
```
User: /marketplace-release
Claude: Step 0 — proposes per-artifact bumps from commits since last tag,
        confirms via AskUserQuestion, applies + commits manifests
        Then: checks state, generates notes, tags, publishes release
```

### Repo tag pre-supplied
```
User: /marketplace-release v0.2.0
Claude: Step 0 — repo tag fixed to v0.2.0, still proposes plugin
        bumps (rolled up from command/agent edits); rest of the flow proceeds
```

### Bump-only (sync versions, don't ship)
```
User: /marketplace-release --bump-only
Claude: Step 0 — folds in committed + uncommitted edits, proposes bumps,
        confirms, applies + commits manifests, writes CHANGELOG, creates a
        LOCAL annotated tag, then STOPS. No push, no GitHub release.
        Reports the follow-up push command for when the analyst is ready.
```

## Error Handling

- If uncommitted changes exist: this is **expected input**, not an error —
  Step 0.1 folds them into the bump analysis. Only warn if they look
  unrelated to a versioned artifact (and never let `.claude/` session config
  block the run).
- If tag already exists, offer to use a different tag
- In **full mode**, if `gh` CLI not authenticated, provide `gh auth login`
  instructions. In **bump-only mode**, `gh` is never invoked — don't gate on it.
- If no commits **and** no uncommitted changes since last tag, warn user

## Commit Message Parsing

The skill parses conventional commits format:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Special patterns recognized:**
- `Thanks @username` or `by @username` - contributor attribution
- `(#123)` or `Closes #123` - PR/issue references
- `BREAKING CHANGE:` - breaking change marker
- `CVE-`, `CWE-`, `GHSA-` - security references

## Requirements

- Git repository (local) — sufficient for `--bump-only`
- **Full mode only:** `gh` CLI installed and authenticated, a remote origin,
  push access for tags, and write access to create releases. `--bump-only`
  needs none of these — it never touches the remote.
