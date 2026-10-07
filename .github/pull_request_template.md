## Pull Request Summary

<!-- Provide a concise summary of the task, implementation, and problem solved. -->

## Contributor / Agent Identity

- **Branch Name**: `ai/<agent>/<task>` (or feature branch)
- **Execution Agent**: (e.g. Codex / Claude Code / Gemini / Copilot / Human)
- **Authenticated GitHub Identity**: <!-- GitHub username or GitHub App used to push/open PR -->
- **Task / Issue Reference**: <!-- e.g. Fixes #123, Phase 463 -->

## HEADROOM AI Contribution Checklist

Please verify before requesting review or merge:

- [ ] Branch conforms to `ai/<agent>/<task>` naming (agents must NOT work on `main`).
- [ ] Changes adhere to HEADROOM architecture and project roadmap.
- [ ] No unrelated files or directories modified.
- [ ] No secrets, tokens, API keys, private keys, or `.env` files committed.
- [ ] Existing licenses and attribution preserved (including imported Agency Agents MIT attribution).
- [ ] Static typecheck passed (`npm run typecheck`).
- [ ] Lint hygiene passed (`npm run lint`).
- [ ] Extension compilation passed (`npm run compile`).
- [ ] Unit tests and verification executed (`npm test`).
- [ ] Native SQLite compatibility checked (`npm run check:sqlite`).
- [ ] Packaging / extension host tests passed where applicable (`npm run package` / `npm run test:vscode`).
- [ ] Failures, blockers, or partial implementations honestly reported.
