# Multi-AI Agent Contribution Workflow

This document defines the official, auditable, and secure contribution workflow for autonomous AI coding agents contributing to the HEADROOM project repository (`https://github.com/shreyansh316/Code_Cruxu`).

---

## 1. Core Workflow Architecture

HEADROOM employs a hub-and-spoke branch model where `main` is strictly protected:

```text
                         HEADROOM
                            │
                         GitHub
                            │
                     protected main
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        Codex             Claude            Gemini
          │                 │                 │
    ai/codex/*        ai/claude/*       ai/gemini/*
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                           PR
                            │
                           CI
                            │
                     Automated checks
                            │
                     Human / reviewer
                            │
                         Approval
                            │
                            ↓
                           main
```

- **Protected Main**: `main` is the stable integration branch. AI agents must **never** commit or push directly to `main`.
- **Dedicated Branching**: Every agent creates and works within an isolated task branch matching `ai/<agent>/<task>`.
- **GitHub Copilot**: Operates through GitHub-native feature branches and PR review suggestions.

---

## 2. Supported AI Coding Agents

1. **OpenAI Codex**: Operates via cloud, runner, or CLI sessions on dedicated branches (`ai/codex/<task>`).
2. **Claude Code**: Operates via Anthropic CLI and agentic execution sessions on dedicated branches (`ai/claude/<task>`).
3. **Google Gemini**: Operates via Google Antigravity or Gemini CLI environments on dedicated branches (`ai/gemini/<task>`).
4. **GitHub Copilot**: Operates within the GitHub IDE and PR review workflows.
5. **Other AI Coding Agents**: Open-source or specialized agents operating on dedicated branches (`ai/<agent>/<task>`).

---

## 3. Branch Naming Convention

All AI agents must work on dedicated, task-scoped branches:

```text
ai/codex/<task>
ai/claude/<task>
ai/gemini/<task>
ai/copilot/<task>
ai/<agent>/<task>
```

### Examples:
- `ai/codex/phase-463`
- `ai/claude/security-review`
- `ai/gemini/reliability-audit`
- `ai/copilot/ui-improvement`
- `ai/antigravity/ai-agent-workflow`

### Strict Branching Invariants:
* **Never push directly to `main`**: All modifications enter `main` exclusively through pull requests.
* **Never force-push**: Commands such as `git push --force` or `--force-with-lease` are strictly forbidden.
* **Never rewrite shared history**: Rebase operations must not be performed on public branches.
* **No shared agent branches**: Two agents must never commit to the same branch simultaneously.

---

## 4. Standard Agent Lifecycle

```text
Task Inception
      ↓
Agent Assignment & Ownership
      ↓
Create Branch (ai/<agent>/<task>)
      ↓
Inspect Repository & Prior Art
      ↓
Minimal-Change Implementation
      ↓
Run Unit Tests (`npm test`)
      ↓
Run Static Gates (`typecheck`, `lint`, `compile`)
      ↓
Review Diff & Whitespace (`git diff --check`)
      ↓
Commit with Conventional Message
      ↓
Push Dedicated Branch
      ↓
Open Pull Request
      ↓
Continuous Integration (CI)
      ↓
Review (Adversarial / Human)
      ↓
Human Approval & Merge
```

---

## 5. Agent Responsibilities

Every AI coding agent contributing to HEADROOM must adhere to these three phases:

### Phase 1: Before Coding
1. **Inspect Branch**: Confirm working tree is on the dedicated `ai/<agent>/<task>` branch, not `main`.
2. **Inspect Repository Status**: Run `git status` to verify clean working tree and no uncommitted residue.
3. **Read Instructions**: Review authoritative project instructions in `AGENTS.md` and `CONTRIBUTING.md`.
4. **Inspect Prior Art & Roadmap**: Search `tests/`, `src/`, and open PRs for existing implementations to prevent duplicate functionality.
5. **Identify Dependencies**: Check database migrations, invariants, and package requirements.
6. **Define Acceptance Criteria**: Outline concrete, machine-verifiable requirements before writing code.

### Phase 2: During Coding
* **Minimal-Change Discipline**: Touch only files strictly required for the assigned task scope.
* **Preserve Architecture**: Adhere strictly to the downward layered architecture (`src/core/` → `src/application/` → `src/domain/` → `src/infrastructure/` → `src/storage/`).
* **Reuse Existing Code**: Never re-implement functionality that already exists in shared utilities or domain libraries.
* **No Speculative Features**: Do not add unnecessary abstractions or speculative capabilities.
* **Zero Secrets**: Never stage or commit API tokens, passwords, private keys, or `.env` files.
* **Preserve Licenses & Attribution**: Maintain MIT license headers and attribution for imported Agency Agents reference material.
* **Runtime Integrity**: Ensure Node.js `>= 20.0.0` and VS Code `1.101.0+` compatibility.

### Phase 3: After Coding
1. **Run Unit Tests**: Execute `npm test` and record actual outcomes.
2. **Run Linter**: Execute `npm run lint`.
3. **Run Typecheck**: Execute `npm run typecheck` (validates AST across 430+ JS files).
4. **Run Compilation**: Execute `npm run compile` to verify esbuild bundling into `out/extension.js`.
5. **Run Security Checks**: Execute `npm run test:security` where applicable.
6. **Check Diff Hygiene**: Execute `git diff --check` to guarantee zero whitespace errors or merge markers.
7. **Verify Changed Files**: Inspect `git status` to confirm no unintended or temporary files are staged.
8. **Clean Commit**: Create a focused commit following Conventional Commits format.
9. **Push & Open PR**: Push to the dedicated remote branch and open a PR targeting `main` using the PR template.
10. **Report Results Honestly**: Disclose passing tests, failing tests, and blockers transparently.

---

## 6. Agent Identity & GitHub Authentication

### Critical Rule: No Fake AI Accounts
Never invent GitHub usernames or fabricate collaborators named `codex`, `claude`, `gemini`, or `copilot`.

* AI products authenticate through their own verified GitHub integration, OAuth flow, GitHub App installation, CLI credentials, or the user's authenticated development environment.
* HEADROOM decouples internal employee roles from external Git credentials:
  $$\text{Employee Role} \neq \text{Execution Agent} \neq \text{AI Model} \neq \text{Authenticated GitHub Credential}$$
* GitHub identity is an external execution credential, never hard-coded in workforce databases or application code.

---

## 7. GitHub Permissions Model (Least Privilege)

```text
AI Agent
   ↓
Authenticated Execution Environment
   ↓
Repository Write Access (Branch Creation & Push)
   ↓
Pull Request
   ↓
CI Quality Gates
   ↓
Human Review & Approval
   ↓
Merge to main
```

Agents must **never** be granted:
- Repository Administrator or Owner privileges
- Branch protection bypass permissions
- Repository deletion or transfer rights
- Secrets administration rights

Write access should only be granted where the actual execution environment requires branch creation and pushing.

---

## 8. Concurrent AI Agent Collaboration

HEADROOM supports multiple AI agents working concurrently on different subsystems:

```text
Codex   ──► ai/codex/phase-463         ──► PR #10 ──┐
Claude  ──► ai/claude/security-review  ──► PR #11 ──┼──► CI ──► Review ──► Merge to main
Gemini  ──► ai/gemini/test-audit       ──► PR #12 ──┘
```

### Conflict Avoidance Rules:
1. **Isolated Branches**: Each agent works on its own dedicated branch. Agents never commit to a shared branch.
2. **Pre-Flight Discovery**: Before beginning work, agents inspect active PRs and open branches (`git branch -a`, `gh pr list`) to ensure no other agent is working on the same task.
3. **Integration via PR**: If two agents modify adjacent modules, conflict resolution occurs transparently during PR review on GitHub, never by overwriting working trees.

---

## 9. Task Ownership & Review Responsibilities

Each task packet should define explicit ownership and review roles to leverage complementary agent strengths:

| Role | Responsibility | Typical Assignment |
|---|---|---|
| **Author / Implementer** | Minimal-change code implementation & verification | OpenAI Codex / Gemini / Claude |
| **Architectural Reviewer** | Invariant validation & boundary audit | Claude Code |
| **Verification & Audit** | Test coverage & security regression checks | Google Gemini |
| **Editor Assistant** | In-editor interaction and inline assistance | GitHub Copilot |
| **Final Sign-Off** | Approval and merge authorization | Repository Owner (`@shreyansh316`) |

---

## 10. Standard Agent Result Format

Completed agent executions must report machine evidence using this structured format:

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

Vague completion claims (such as *"Everything should work"*) are rejected without concrete evidence.

---

## 11. Security & Credential Rules

* **Zero Secret Commitment**: API keys (OpenAI, Anthropic, Gemini, GitHub), private keys, `.env` files, and `SecretStorage` entries must never be staged or committed.
* **Automated Redaction**: Ensure all outputs pass through HEADROOM's redaction pipeline.
* **Pre-Commit Verification**: Run `git diff` and verify `.gitignore` patterns before staging files.

---

## 12. Automated Merge Policy

AI agents must **never** automatically merge their own pull requests into `main`.

* Merges to `main` require CI quality gates to pass and human repository owner approval.
* Automated systems may run tests, apply labels, post evidence reports, and run security scans, but the final integration decision remains with the human engineer.

---

## 13. Adding a New AI Agent (Onboarding Guide)

Follow this 13-step checklist to onboard a new AI coding agent:

1. **Authenticate**: Log in the agent's execution environment using verified GitHub credentials (`gh auth login`, SSH key, or GitHub App token).
2. **Check Permissions**: Verify least-privilege Write access to `shreyansh316/Code_Cruxu`.
3. **Create Branch**: Check out a fresh branch matching `ai/<agent>/<task>`.
4. **Read Guidelines**: Read `AGENTS.md`, `CONTRIBUTING.md`, and this workflow guide.
5. **Inspect Task**: Read the assigned GitHub issue or task packet.
6. **Inspect Existing Code**: Search for existing implementations before creating new modules.
7. **Implement Changes**: Write focused, minimal-change code adhering to layered architecture.
8. **Run Verification**: Execute `npm run typecheck`, `npm run lint`, `npm run compile`, `npm test`, and `git diff --check`.
9. **Check Secrets**: Confirm no keys, tokens, or `.env` files were created or modified.
10. **Commit Cleanly**: Commit with a clear Conventional Commit message.
11. **Push Branch**: Push exclusively to `origin ai/<agent>/<task>`.
12. **Open PR**: Open a pull request targeting `main` using `.github/pull_request_template.md`.
13. **Await Review**: Respond to review feedback; do not attempt to merge directly into `main`.
