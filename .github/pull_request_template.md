## Summary

<!-- Concise description of what changed and why it was needed. -->

## Related Task / Phase

- **Task / Phase Reference**: <!-- e.g. Phase 463, Issue #12, Task T-042 -->
- **Branch**: <!-- e.g. ai/codex/phase-463, ai/claude/review-463, ai/gemini/task-name -->

## Changes

<!-- Clear bullet points of what changed. Explain architectural intent. -->
<!-- - Feature / fix description -->

## Tests

<!-- Detail what was tested and what was NOT tested. Include exact command outputs. -->
- [ ] Unit tests (`npm test`): <!-- passed / failed / not applicable -->
- [ ] Extension Host tests (`npm run test:vscode`): <!-- passed / not run -->
- [ ] Native SQLite compatibility (`npm run check:sqlite`): <!-- passed / failed -->

## Verification

<!-- Provide machine evidence. Do not claim tests passed without executing them. -->
- [ ] Static typecheck (`npm run typecheck`): <!-- passed / failed -->
- [ ] Linter hygiene (`npm run lint`): <!-- passed / failed -->
- [ ] Extension compile (`npm run compile`): <!-- passed / failed -->
- [ ] Git diff and whitespace hygiene (`git diff --check`): <!-- clean / warnings -->

## Security Considerations

- [ ] Zero secrets, tokens, API keys, private keys, or `.env` files staged or committed.
- [ ] All process spawning uses `shell: false` with explicit argument lists.
- [ ] Path canonicalization and workspace containment verified.
- [ ] Automatic secret redaction preserved.

## Files Changed

<!-- List the modified, added, or removed files. Confirm no unrelated files were touched. -->

## AI Assistance

- **AI Coding Agent**: <!-- e.g. OpenAI Codex, Claude Code, Google Gemini, GitHub Copilot, None -->
- **Authenticated GitHub Identity**: <!-- Actual GitHub username or verified GitHub App used to push/open PR -->
- **Verification Performed**: <!-- Human review and machine-checked verification steps performed on AI output -->

## Known Limitations

<!-- Disclose any partial implementations, environment limitations, or deferred work. -->

## Blockers

<!-- State any blockers, upstream issues, or 'NONE'. -->
