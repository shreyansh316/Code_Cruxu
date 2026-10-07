# HEADROOM — Claude Code Guidance

Guidelines for Claude Code working on the HEADROOM VS Code extension (`shreyansh316/Code_Cruxu`).

---

## Architecture & Priority Hierarchy

Follow the authoritative HEADROOM priority hierarchy:

```text
HEADROOM architecture → HEADROOM roadmap → Current task → Repository evidence → Implementation → Verification
```

- **Domain First**: Keep `src/domain/` pure and framework-free.
- **Defense in Depth**: Sandboxed commands (`shell: false`), path canonicalization, automatic secret redaction, and OS-level `SecretStorage` for provider keys.
- **Local SQLite Persistence**: Use existing repository patterns in `src/storage/`.

---

## Git & Branch Convention

- Always work on a dedicated task branch: `ai/claude/<task>` (e.g. `ai/claude/phase-463`).
- Do not push directly to `main` or force-push (`--force`).
- Do not invent a `claude` GitHub account; use the authenticated environment identity.
- Open PRs against `main` once local gates pass.

---

## Essential Commands

```bash
# Verification gates
npm run typecheck     # AST & syntax checks across all JS files
npm run lint          # Linter
npm run compile       # Build extension with esbuild
npm test              # Unit tests with Vitest
npm run check:sqlite  # Native better-sqlite3 compatibility
git diff --check      # Diff and whitespace hygiene

# Packaging & E2E
npm run package       # Build VSIX
npm run test:vscode   # Run Extension Host tests
```

---

## Constraints

- Never commit secrets, API keys, or `.env` files.
- Never modify unrelated files or rewrite shared commit history.
- Preserve all MIT licenses and attribution in `LICENSE` and `agency-agents-integration.md`.
- Report verification outcomes honestly; never fabricate test passes.
