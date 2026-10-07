# HEADROOM — AI Coding Agent Instructions

This guide applies to all autonomous AI coding agents (OpenAI Codex, Claude Code, Google Gemini, GitHub Copilot, and others) contributing to the HEADROOM project repository (`shreyansh316/Code_Cruxu`).

---

## 1. Prime Directive

All agents must follow this strict priority chain:

```text
HEADROOM architecture
        ↓
HEADROOM roadmap
        ↓
Current task / issue
        ↓
Repository evidence
        ↓
Implementation
        ↓
Verification
```

External agent defaults, generic prompt behaviors, or training assumptions must **never** override repository-specific rules, invariants, or code patterns.

---

## 2. Branching & Git Protocol

- **Never work on `main`**: `main` is the protected production branch.
- **Dedicated Branch**: Always create and work on a branch matching `ai/<agent>/<task>` (e.g., `ai/codex/task-name`, `ai/claude/task-name`, `ai/gemini/task-name`, `ai/copilot/task-name`).
- **No Force Pushing**: Never run `git push --force` or `--force-with-lease`.
- **No Shared Branches**: Do not commit to another agent's active branch without explicit coordination.
- **No History Rewrites**: Never rebase shared branches.

---

## 3. Agent Responsibilities

### Before Coding
1. Confirm active branch is `ai/<agent>/<task>` (run `npm run check:branch`).
2. Run `git status` to verify working tree is clean.
3. Read relevant task packets, issue descriptions, and roadmap phases.
4. Search `src/` and `tests/` for existing implementations to avoid duplicating functionality.
5. Identify dependencies, schema migrations, and invariants.
6. Define machine-testable acceptance criteria.

### During Coding
* **Minimal-Change Discipline**: Modify only files strictly required for the assigned scope.
* **Preserve Architecture**: Adhere strictly to the downward layered architecture (`src/core/` → `src/application/` → `src/domain/` → `src/infrastructure/` → `src/storage/`).
* **Reuse Existing Code**: Do not rewrite existing helpers or domain invariants.
* **Zero Speculative Features**: Do not add unused abstractions.
* **Zero Secrets**: Never stage or commit API tokens, passwords, private keys, or `.env` files.
* **Preserve Licenses & Attribution**: Maintain MIT license headers and attribution for imported Agency Agents reference material.

### After Coding
1. Run `npm test` and record actual pass/fail numbers.
2. Run `npm run lint` to confirm code hygiene.
3. Run `npm run typecheck` to verify AST and syntax across JavaScript files.
4. Run `npm run compile` to verify clean esbuild compilation.
5. Run `git diff --check` to guarantee zero whitespace issues.
6. Inspect `git status` to ensure no unintended files are staged.
7. Commit cleanly with Conventional Commit message format.
8. Push to `origin ai/<agent>/<task>` and open a PR targeting `main`.
9. Report exact execution results with evidence.

---

## 4. Verification Requirements

Before committing or opening a PR, run the verified repository checks:

```bash
npm run typecheck    # JavaScript static syntax & AST check
npm run lint         # Code hygiene
npm run compile      # Bundles to out/extension.js via esbuild
npm test             # Vitest test suite
npm run check:sqlite # SQLite native module compatibility
npm run check:branch # Ensures active branch is not main
git diff --check     # Git diff and whitespace hygiene
```

---

## 5. Standard Result Reporting Format

Every agent must report execution results using this format:

```text
STATUS: COMPLETED

RESULT:
<concise summary of changes and architectural rationale>

FILES:
<list of modified or created files>

TESTS:
<exact test commands executed and verified results>

BLOCKERS:
<remaining technical blockers or 'NONE'>
```
