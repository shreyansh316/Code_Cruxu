# Contributing to HEADROOM

Welcome to the HEADROOM project repository (`https://github.com/shreyansh316/Code_Cruxu`).

HEADROOM is an open-source VS Code extension providing an autonomous AI workforce and command center. This repository supports contributions from both **human engineers** and **multiple AI coding agents**, including OpenAI Codex, Claude Code, Google Gemini, GitHub Copilot, and other agentic systems.

---

## 1. Official AI Contribution Workflow

All contributors—human and AI agents alike—must follow the official HEADROOM contribution workflow:

```text
Issue / Task
    ↓
Agent Branch
    ↓
Implementation
    ↓
Tests
    ↓
Lint / Typecheck / Build
    ↓
Security / Diff Review
    ↓
Pull Request
    ↓
CI
    ↓
Human Review
    ↓
Merge
```

---

## 2. Core AI Contribution Policy & Rules

HEADROOM embraces multi-agent collaboration with strict quality, security, and architectural guardrails:

```text
                 HEADROOM GitHub Repository
                          │
                         main
                       /  |  \
                      /   |   \
                     ↓    ↓    ↓
                 Codex  Claude Gemini
                   │      │      │
                   ↓      ↓      ↓
                  PR     PR     PR
                    \     |     /
                     \    |    /
                       Review
                          ↓
                         CI
                          ↓
                  Human approval
                          ↓
                        main
```

### The 16 Immutable Contribution Rules:

1. **Branch Creation**: AI agents may create branches adhering to the designated branch naming convention.
2. **Commit Authorization**: AI agents may commit their own work when authorized in their execution session.
3. **Dedicated Pushing**: AI agents must push to their own dedicated branches when GitHub credentials/access are available.
4. **Pull Requests**: AI agents must open PRs targeting `main` when their environment supports GitHub PR creation.
5. **No Force-Pushes**: AI agents must never force-push (`git push --force` or `--force-with-lease`) unless explicitly authorized.
6. **No History Rewrites**: AI agents must never rewrite shared git history or rebase public branches.
7. **No Protection Bypass**: AI agents must not attempt to bypass branch protection rules.
8. **No Self-Merging**: AI agents must not merge their own PRs unless explicitly authorized by repository policy; `main` merges require human review and approval.
9. **No Unrelated Modifications**: AI agents must not modify unrelated files, refactor out of scope, or introduce stylistic churn.
10. **Pre-PR Verification**: AI agents must run appropriate repository verification commands before opening a PR.
11. **Honest Reporting**: AI agents must honestly report test outcomes, execution failures, platform discrepancies, and technical blockers. Never fabricate passing results.
12. **Zero Secret Leaks**: No API keys, tokens, OAuth credentials, passwords, or `.env` files may ever be committed.
13. **License Preservation**: Existing licenses (MIT) and copyright attributions must be strictly preserved across all files.
14. **Agency Agents Attribution**: Imported Agency Agents material under `imports/` must retain all required MIT licensing and attribution notices.
15. **Architectural Conformance**: AI-generated changes must conform to HEADROOM's layered architecture (`src/domain/`, `src/application/`, `src/infrastructure/`, `src/storage/`, `src/core/`).
16. **Protected Main**: `main` remains the stable, protected integration branch. No direct pushes to `main` are allowed.

---

## 3. Branch Naming Convention

All AI coding agents must use isolated, dedicated branches with the following convention:

```text
ai/codex/<task>
ai/claude/<task>
ai/gemini/<task>
ai/copilot/<task>
ai/<agent>/<task>
```

### Examples:

- `ai/codex/phase-463`
- `ai/claude/review-463`
- `ai/gemini/reliability-audit`
- `ai/copilot/command-center`

Agents must **never** work directly on `main` or push to branches owned by other agents without explicit handoff coordination.

---

## 4. Source of Truth

The repository code and documentation remain the absolute source of truth:

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

External model defaults, generic prompts, or vendor guidelines must never override repository-specific architecture, domain invariants, or project policies.

---

## 5. Local Verification Commands

Before opening a pull request or requesting review, execute the relevant verification commands available in `package.json`:

```bash
# Type checking (JavaScript AST verification across 430+ files)
npm run typecheck

# Code hygiene and linting
npm run lint

# Extension compilation via esbuild
npm run compile

# Unit test suite
npm test

# Native SQLite compatibility check
npm run check:sqlite

# Git diff and whitespace hygiene
git diff --check

# Extension packaging (VSIX generation)
npm run package

# Extension Host integration tests
npm run test:vscode
```

Only report checks as passed if they actually executed and succeeded in your local environment.

---

## 6. Security & Credential Isolation

- Never hardcode or stage secrets, API tokens (OpenAI, Anthropic, Gemini, GitHub), SSH keys, or certificates.
- Verify `.gitignore` rules before adding new files.
- HEADROOM utilizes VS Code OS-backed `SecretStorage` for runtime provider credentials. No credential is ever written into workspace storage or Git history.
- Process execution is sandboxed with `shell: false` and strict path containment.

---

## 7. Additional Documentation

For deeper details on AI GitHub setup, permissions, and identity separation, refer to:

- [docs/ai-agent-contribution-workflow.md](docs/ai-agent-contribution-workflow.md) — Multi-AI Agent Contribution Workflow Specification.
- [docs/ai-github-collaboration.md](docs/ai-github-collaboration.md) — Comprehensive Multi-AI GitHub Collaboration Guide.
- [docs/github-branch-protection.md](docs/github-branch-protection.md) — GitHub Branch Protection Configuration Guide.
- [GITHUB_MANUAL_SETUP.md](GITHUB_MANUAL_SETUP.md) — Repository Owner Branch Protection & GitHub Settings Guide.
- [SECURITY_MODEL.md](SECURITY_MODEL.md) — HEADROOM Defense-in-Depth Security Specification.
