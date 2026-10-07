# Multi-AI GitHub Collaboration Guide

This document establishes the architecture, workflow, permissions model, and security guidelines for multi-AI agent collaboration within the HEADROOM repository (`https://github.com/shreyansh316/Code_Cruxu`).

---

## 1. Supported AI Coding Agents

HEADROOM is engineered to work safely with multiple state-of-the-art AI coding agents:

1. **OpenAI Codex**: Used via cloud or CLI agentic environments.
2. **Claude Code**: Used via Anthropic CLI and agentic execution sessions.
3. **Google Gemini**: Used via Google Antigravity / Gemini CLI and agent workflows.
4. **GitHub Copilot**: Integrated directly through GitHub PRs and IDE interactions.
5. **Other AI Agents**: Open-source, local, or specialized agents participating via Git.

---

## 2. Real GitHub Identity vs. AI Product Names

### Crucial Principle: Do Not Fabricate GitHub Accounts

AI products do not inherently have standard GitHub user accounts named `codex`, `claude`, `gemini`, or `copilot`. Creating fake collaborator entries with unverified names is strictly prohibited.

Permissions and authentication belong to the **actual authenticated GitHub identity or GitHub App**:
- OAuth user token or personal access token (PAT) representing a real verified account (e.g. `@shreyansh316`).
- Verified GitHub App or installation token configured for automated CI/bot operations.
- The user's authenticated development environment (e.g. local Git credentials, `gh auth status`, SSH keys).

### Permissions Matrix

| Agent Platform | Authentication Mechanism | Target Permission | Notes |
|---|---|---|---|
| **Codex** | Environment Git / GitHub App / OAuth | `Write` (or PR-only fork) | Only grant write where branch creation and pushing are necessary. |
| **Claude Code** | Claude Code CLI authenticated session | `Write` (or PR-only fork) | Do not invent a `claude` GitHub account; use verified local/cloud credentials. |
| **Gemini** | Antigravity / Google Cloud / CLI auth | `Write` (or PR-only fork) | Do not invent a `gemini` GitHub account; authenticate via verified session. |
| **GitHub Copilot** | GitHub native account / enterprise settings | Configured via GitHub org | Governed by GitHub Copilot seat assignment and repo access. |
| **Other AI** | Standard Git credentials or fork | `Read` (Fork & PR) or `Write` | Prefer PR-only contribution when direct push is not needed. |

---

## 3. Separation of Agent Identity and Model Identity

HEADROOM maintains a fundamental architectural invariant:

$$\text{Employee Identity} \neq \text{AI Model} \neq \text{GitHub Identity}$$

In HEADROOM:
```text
HEADROOM Employee (Domain Role, e.g. Staff Engineer)
        ↓
Execution Agent (Runner / Orchestrator)
        ↓
AI Provider / Model (e.g. Gemini 2.5 Pro, Claude 3.7 Sonnet, GPT-4o)
        ↓
Authenticated GitHub Identity (External Credential / App)
        ↓
Branch (ai/<agent>/<task>)
        ↓
Commit
        ↓
Pull Request
```

### Key Principles:
- GitHub usernames are **never hard-coded** into HEADROOM's internal workforce system, database schemas, or position catalogs.
- GitHub credentials represent an **external execution transport**, not the internal employee identity.
- Any model or employee can be executed through any authorized GitHub account or bot installation without architectural coupling.

---

## 4. Branch Naming Convention

All AI agents must work on dedicated, task-scoped branches:

```text
ai/codex/<task>
ai/claude/<task>
ai/gemini/<task>
ai/copilot/<task>
ai/<agent>/<task>
```

### Real-world Examples:
- `ai/codex/phase-463`
- `ai/claude/review-463`
- `ai/gemini/reliability-audit`
- `ai/copilot/command-center`
- `ai/gemini/multi-agent-github-setup`

### Branch Invariants:
1. **Never work directly on `main`**: `main` is the protected production branch.
2. **Never share branches between different agents**: Each agent session creates its own isolated task branch.
3. **No force-pushing**: Never use `git push --force` or `--force-with-lease` on shared or integration branches.
4. **No history rewrites**: Do not rebase published PR branches unless explicitly requested.

---

## 5. End-to-End Collaboration Lifecycle

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

### Step 1: Issue / Task Inception
Every agent task begins with a concrete task specification, phase goal, or GitHub issue.

### Step 2: Branch Creation
Agent checks out a fresh branch from `main` (or active integration branch) following `ai/<agent>/<task>`.

### Step 3: Minimal-Change Implementation
Agent implements changes following HEADROOM architecture and the task scope. No unrelated refactoring or decorative edits.

### Step 4: Local Verification
Agent runs available repository gates:
- `npm run typecheck`
- `npm run lint`
- `npm run compile`
- `npm test`
- `npm run check:sqlite`
- `git diff --check`

### Step 5: Clean Commit & Push
Agent commits with a descriptive Conventional Commit message (e.g. `feat(storage): add sqlite migration ledger`) and pushes exclusively to its `ai/<agent>/<task>` remote branch.

### Step 6: Pull Request
Agent opens a PR targeting `main` using the repository template `.github/pull_request_template.md`.

### Step 7: Continuous Integration
GitHub Actions runs `.github/workflows/quality.yml` across Windows, Ubuntu, and macOS matrices.

### Step 8: Adversarial Review & Human Approval
Reviews are performed (by human maintainers and/or automated review agents). Stale reviews are dismissed on updates. Human repository owner merges the PR into `main`.

---

## 6. Safety & Security Guardrails

1. **Zero Secret Exposure**:
   - Provider API keys (OpenAI, Anthropic, Google AI, etc.) are never stored in source files, config files, or git commits.
   - All runtime keys must use VS Code `SecretStorage`.
   - `.gitignore` rigorously excludes `.env`, `*.key`, `*.pem`, `*.token`, and `*.secret`.

2. **No Fabricated Verification**:
   - Agents must never claim a test, lint, or build command succeeded unless it was executed and returned an exit code of 0.
   - Any runtime limitations (e.g. native node module architecture mismatch, headless display requirements) must be disclosed transparently in the PR description.

3. **Attribution & Licenses**:
   - The HEADROOM project is licensed under the MIT License (`LICENSE`).
   - Attribution for imported reference corpus material (`imports/agency-agents/`) must remain intact as documented in `agency-agents-integration.md`.
