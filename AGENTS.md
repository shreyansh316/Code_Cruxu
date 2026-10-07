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
- **Dedicated Branch**: Always create a branch matching `ai/<agent>/<task>` (e.g., `ai/codex/task-name`, `ai/claude/task-name`, `ai/gemini/task-name`, `ai/copilot/task-name`).
- **No Force Pushing**: Never run `git push --force` or `--force-with-lease`.
- **No Shared Branches**: Do not commit to another agent's active branch without explicit handoff.
- **No History Rewrites**: Never rebase shared branches.

---

## 3. Implementation Rules

1. **Minimal-Change Discipline**: Touch only files strictly required for the assigned task. Avoid out-of-scope refactoring or aesthetic rewriting.
2. **Layered Architecture**: Preserve separation of concerns:
   - `src/domain/`: Pure business rules, entities, and invariants. No VS Code or external storage imports.
   - `src/application/`: Use cases, orchestrators, and prompt/context assembly.
   - `src/storage/`: SQLite repositories, connections, migrations, and backups.
   - `src/infrastructure/`: Filesystem containment, process sandboxing (`shell: false`), secret redactor.
   - `src/core/`: VS Code UI, tree views, commands, and extension lifecycle.
3. **Defense-in-Depth Security**:
   - Never commit API keys, tokens, or `.env` files.
   - Always run process execution with `shell: false`.
   - Contain paths to prevent traversal and block access to sensitive files.
   - Redact credentials from all outputs, reports, and logs.
4. **Attribution & Licenses**: Maintain the MIT license and preserve existing notices in `LICENSE` and `agency-agents-integration.md`.

---

## 4. Verification Requirements

Before committing or opening a PR, run the verified repository checks:

```bash
npm run typecheck    # JavaScript static syntax & AST check
npm run lint         # Code hygiene
npm run compile      # Bundles to out/extension.js via esbuild
npm test             # Vitest test suite
npm run check:sqlite # SQLite native module compatibility
git diff --check     # Git diff and whitespace hygiene
```

Report execution results truthfully. Never claim tests passed if they were skipped or failed.
