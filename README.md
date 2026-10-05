# HEADROOM

<p align="center">
  <img
    src="./assets/headroom-banner.png"
    alt="HEADROOM"
    width="100%"
  />
</p>

<p align="center">
  <strong>Structured planning, task-based execution, and automated verification for AI-assisted software development in Visual Studio Code.</strong>
</p>

<p align="center">
  <a href="https://github.com/shreyansh316/Code_Cruxu/issues">Issues</a> ·
  <a href="https://github.com/shreyansh316/Code_Cruxu/releases">Releases</a>
</p>

---

## Overview

HEADROOM is a local-first Visual Studio Code extension designed to bring discipline, structure, and accountability to AI-assisted software engineering.

Rather than treating AI as an unstructured chat interface or an unconstrained code generator, HEADROOM structures development work around explicit engineering workflows: defining high-level objectives, proposing and approving implementation plans, decomposing plans into discrete tasks, running bounded work within isolated tool permissions, and verifying results against machine-checked criteria before changes are reviewed.

All state—including objectives, task graphs, execution queues, audit logs, and context—is persisted locally in an embedded SQLite database. The developer retains complete visibility and control over what gets planned, what tools are granted, and what gets committed to the codebase.

## Why HEADROOM

AI models can write code rapidly, but real-world software development requires much more than token generation. Without systematic structure, AI-assisted development frequently suffers from common problems:

* **Disorganized Workflows**: Conversations grow long and unmanageable, causing important requirements, edge cases, and design decisions to be lost in scrolling chat histories.
* **Disconnected Planning and Implementation**: Architecture plans drafted in chat rarely map directly to executed file edits, resulting in drift between intended designs and actual code.
* **Inconsistent Verification**: Language models frequently hallucinate completion, claiming a bug is fixed or a feature is implemented without running tests, checking exit codes, or verifying outputs.
* **Context Degradation**: Supplying an entire codebase into an AI prompt exhausts token limits and degrades reasoning quality, while supplying too little context leads to invalid assumptions and broken imports.

HEADROOM addresses these challenges by introducing formal engineering boundaries around every step of AI-assisted work.

## Core Capabilities

The following capabilities are implemented and verified in the current codebase:

* **Objective Lifecycle Management**: Track high-level engineering goals through deterministic lifecycle states (`NEW` → `ANALYZING` → `PLANNING` → `ACTIVE` → `COMPLETED`).
* **Plan Proposal & Approval**: Decompose objectives into projects, milestones, tasks, and dependency DAGs that require explicit developer approval before execution.
* **Task Queue & Scheduling**: Transactional scheduling with dependency resolution, priority ordering, retry policies, and execution cancellation.
* **Task-Scoped Tool Permissions**: Restrict worker filesystem access to explicit path allowlists and command execution to approved executables with validated arguments.
* **Automated Result Verification**: Execute bounded verification commands (test runners, custom scripts, syntax checkers) to collect concrete machine evidence before work can be marked as complete.
* **Review Evidence Bundling**: Automatically assemble before-and-after workspace snapshots, Git status diffs, and verification logs for developer review.
* **Append-Only Audit Logging**: Record every state transition, hierarchy handoff, plan decision, and tool execution in a local SQLite audit ledger.
* **Secure Credential Storage**: Isolate provider credentials using VS Code's native `SecretStorage` API, ensuring API keys never enter prompts, audit logs, or git history.
* **Secret Redaction**: Automatically redact tokens, passwords, Basic/Bearer auth headers, and private keys from captured command outputs, logs, and activity feeds.
* **Local-First SQLite Persistence**: Complete offline persistence powered by `better-sqlite3` with transactional, forward-migrating schema management.
* **VS Code Native Views**: Dedicated sidebar views for Organizations, Objectives, Tasks, and Health, paired with an integrated Command Center panel.

## How HEADROOM Works

HEADROOM coordinates the engineering lifecycle through a structured flow:

```text
Developer (CEO)
      │
      ▼
  Objective
      │
      ▼
  Planning (Director)
      │
      ▼
Tasks & Dependencies
      │
      ▼
AI-Assisted Work (Employee)
      │
      ▼
 Scoped Verification
      │
      ▼
Evidence Review & Completion
```

1. **Objective**: The developer submits a concrete engineering objective for an organization.
2. **Planning**: The AI Director analyzes requirements, resolves ambiguities, and proposes a structured execution plan.
3. **Approval**: The developer reviews and approves the plan, establishing the baseline tasks and dependencies.
4. **Execution**: Tasks are queued and dispatched to authorized workers operating within restricted file and command boundaries.
5. **Verification**: Task-scoped verification commands run to independently confirm that acceptance criteria are met.
6. **Result**: The developer inspects the assembled evidence bundle (code diffs, test outputs, execution logs) to approve completion or request rework.

## Development Workflow

The general development cycle in HEADROOM follows five clear stages:

```text
Plan  ──►  Organize  ──►  Execute  ──►  Verify  ──►  Review
```

* **Plan**: Establish the objective scope, identify constraints, and structure milestones with verifiable criteria.
* **Organize**: Break milestones into dependent tasks with defined creator and assignee hierarchies.
* **Execute**: Run task implementations with explicit tool grants, preventing unintended modifications outside the task scope.
* **Verify**: Execute automated verification commands to collect deterministic machine proof of correctness.
* **Review**: Evaluate the evidence bundle and make informed acceptance decisions.

## AI-Assisted Development

HEADROOM treats AI models as tools operating under strict engineering contracts rather than autonomous decision-makers:

* **Structured Work**: Work is broken down into small, isolated units with bounded inputs, outputs, and token budgets.
* **Project Context**: Relevant context (task criteria, dependencies, bounded memory) is assembled deterministically rather than dumping entire codebases into prompts.
* **Task-Based Execution**: Workers execute only within explicitly granted filesystem paths and executable allowlists.
* **Machine Verification**: Model-generated completion claims are untrusted until verified by deterministic checks, compiler output, or test suites.
* **Developer Control**: The developer remains the authoritative decision-maker at every critical stage—authorizing plans, granting permissions, and accepting results.

## Architecture

The codebase follows a clean, layered architecture where dependencies point strictly downward:

```text
┌────────────────────────────────────────────────────────┐
│  VS Code Integration (src/core/, src/extension.js)     │
│  Tree views, command center, secret storage, commands   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Application Layer (src/application/)                  │
│  Use cases: intake, planning, scheduling, verification │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Domain Layer (src/domain/)                            │
│  Invariants, state machines, validation, contracts     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Infrastructure Layer (src/infrastructure/)            │
│  Process runners, verification pipelines, adapters     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Storage Layer (src/storage/)                          │
│  SQLite connection, repositories, schema migrations    │
└────────────────────────────────────────────────────────┘
```

* **VS Code Integration (`src/core/`)**: Connects extension lifecycle, sidebar tree providers, webview panels, and native editor integration.
* **Application Layer (`src/application/`)**: Coordinates business workflows and encapsulates use cases such as objective intake, task decomposition, queue orchestration, and evidence generation.
* **Domain Layer (`src/domain/`)**: Pure domain entities, state transition machines, assignment rules, and structural invariants without external dependencies.
* **Infrastructure Layer (`src/infrastructure/`)**: Concrete adapters for the workspace filesystem, process execution, Git status, secret redaction, and verification check pipelines.
* **Storage Layer (`src/storage/`)**: Local persistence layer managing SQLite connections, transactional migrations, and strongly typed repository ports.

## Verification & Reliability

HEADROOM enforces rigorous engineering standards across the entire development and packaging pipeline:

* **Unit Test Suite**: 179+ test suites with 540+ automated unit tests running under Vitest.
* **Extension Host Integration Tests**: Headless VS Code Extension Host testing (`@vscode/test-electron`) verifying end-to-end workflows in isolated test environments.
* **Multi-Platform Packaging Validation**: Native package build and packaged extension host verification (`test:vscode:vsix`) across Windows (`win32-x64`), Linux (`linux-x64`), and macOS (`darwin-x64`).
* **SQLite Native Compatibility**: Dedicated runtime verification ensuring `better-sqlite3` native bindings compile and execute correctly across target platforms.
* **Complexity Auditing**: Automated complexity gate (`scripts/complexity-audit.js`) enforcing strict line, branch, and function ceilings across core modules to prevent code bloat.
* **Static Quality Gates**: Deterministic syntax verification (`typecheck`) and code hygiene checks (`lint`) executed before every commit and in continuous integration.

## Security & Privacy

HEADROOM is designed with a defense-in-depth local security model:

* **Local-First Storage**: All project state, task data, audit logs, and memories reside in a local SQLite file within your workspace. No external telemetry or cloud database is required.
* **Isolated Credential Storage**: Provider API keys are stored via VS Code's OS-backed `SecretStorage`. Credentials are never written to disk, included in prompts, or stored in git.
* **Process Sandboxing**: External commands are spawned without shell interpolation (`shell: false`), constrained to explicit executable paths, and bound by execution timeouts and output caps.
* **Filesystem Path Containment**: Path canonicalization prevents directory traversal, symlink jumping, and Windows alternate data stream access. Sensitive paths (such as `.env` and private keys) are rejected by default.
* **Automatic Secret Redaction**: All captured outputs, verification previews, audit entries, and report strings pass through a redaction pipeline that strips API tokens, SSH/PEM keys, and auth headers.
* **Organization Boundaries**: Domain validation strictly enforces tenant boundaries, ensuring tasks, agents, and reports cannot leak across organization boundaries.

## Current Status

HEADROOM is an active, early-stage open-source project. Current progress is divided as follows:

| Area | Status | Description |
| --- | --- | --- |
| **Local Storage & Migrations** | Implemented | Transactional SQLite persistence with schema migration ledger. |
| **Objective & Task Lifecycle** | Implemented | State machines, transitions, and domain invariants for goals and tasks. |
| **Task Queue & Scheduler** | Implemented | Dependency-aware execution queue with concurrency controls. |
| **Task-Scoped Tooling** | Implemented | Path-restricted filesystem adapter and allowlisted process runner. |
| **Verification Pipeline** | Implemented | Automated check runner collecting exit codes, outputs, and status. |
| **Evidence Bundling** | Implemented | Snapshot comparisons, Git diff inspection, and review packages. |
| **CI Quality Gates** | Implemented | Automated testing across Windows, macOS, and Linux runners. |
| **Interactive Command Center** | Actively Developing | Webview UI panels for active execution feeds and task status trees. |
| **Code Explainability** | Actively Developing | Structured explanation contracts with bounded prompt assembly. |
| **Adversarial Code Review** | Actively Developing | Multi-perspective automated review against acceptance criteria. |
| **Memory Expiration & Pruning**| Actively Developing | Expiration timestamps and bounded cleanup routines for stored context. |
| **Multi-Provider Routing** | Planned | Dynamic model selection and fallback routing based on task needs. |
| **External Issue Sync** | Planned | Optional two-way synchronization with external issue trackers. |

## Roadmap

The project progresses through broad development stages:

1. **Stage 1: Foundation & Data Architecture** *(Completed)*
   * Layered architecture, embedded SQLite engine, migration framework, domain invariants.
2. **Stage 2: Core Workflow & Verification** *(Completed)*
   * Objective intake, plan proposals, queue scheduling, scoped tools, verification pipelines, review bundles.
3. **Stage 3: Security & Multi-Tenant Isolation** *(Completed)*
   * SecretStorage integration, path policy enforcement, secret redaction, organization boundaries.
4. **Stage 4: Interactive Command Center & UX** *(In Progress)*
   * Enhanced webview dashboards, execution activity streaming, improved tree views, keyboard navigation.
5. **Stage 5: Engineering Review & Explainability** *(In Progress)*
   * Automated adversarial review, code explanation contracts, decision memory logging.
6. **Stage 6: Reliability & Performance Optimization** *(Planned)*
   * Token budget management, context pruning, performance benchmarks, failure recovery automation.
7. **Stage 7: Ecosystem & Public Release** *(Planned)*
   * Marketplace packaging, formal licensing, telemetry-free distribution, documentation expansion.

## Project Structure

```text
headroom/
├── assets/                     # Visual assets and project banner
├── media/                      # Icons and webview UI assets
├── scripts/                    # Quality gates, linting, and complexity audit
├── src/
│   ├── application/            # Use cases (intake, planning, scheduling, review)
│   ├── core/                   # VS Code extension integration and UI views
│   ├── domain/                 # Domain entities, invariants, and lifecycle rules
│   ├── infrastructure/         # Filesystem adapters, process runner, redactor
│   ├── shared/                 # Common utilities, constants, and policies
│   └── storage/                # SQLite connection, repositories, and migrations
├── test/
│   ├── runTest.js              # VS Code Extension Host test orchestrator
│   └── suite/                  # Extension Host integration test suite
├── tests/                      # Unit test suites (179+ Vitest specifications)
├── package.json                # VS Code extension manifest and scripts
└── esbuild.js                  # Production and development bundling configuration
```

## Development Principles

HEADROOM is guided by practical engineering principles:

* **Verify Before Claiming Completion**: Software changes are not finished because a model says so. Completion requires passing verification checks and concrete machine evidence.
* **Keep Developer Control**: The human engineer sets the objectives, approves plans, and makes review decisions. The system assists rather than dictates.
* **Prefer Simple Solutions**: Avoid premature abstractions and bloated dependencies. Keep modules small, focused, and testable.
* **Enforce Strict Boundaries**: Restrict tools to the minimal set of files and executables required for each specific task.
* **Protect Secrets and Code Privacy**: Operate locally by default. Never log credentials or let sensitive files leave the developer's machine.
* **Maintain Deterministic Quality**: Every pull request must pass static checks, unit tests, SQLite verification, and multi-platform Extension Host tests.

## Contributing

HEADROOM is under active development. Community contributions, technical feedback, and bug reports are welcome.

To get started with local development:

```bash
# Clone the repository
git clone https://github.com/shreyansh316/Code_Cruxu.git
cd Code_Cruxu

# Install dependencies
npm ci

# Run unit tests
npm test

# Run quality checks
npm run typecheck
npm run lint
npm run check:sqlite
npm run audit:complexity

# Run Extension Host tests
npm run test:vscode
```

Please ensure all tests and quality checks pass before submitting pull requests.

## Issues

If you encounter bugs, have questions, or want to propose technical improvements, please open an issue on the [GitHub Issues](https://github.com/shreyansh316/Code_Cruxu/issues) page.

## License

HEADROOM's licensing terms will be formally established prior to the public v1.0 release. All rights are currently reserved by the project maintainers during the initial development phase.

## Acknowledgments

HEADROOM is built upon and inspired by excellent open-source tools:

* **[Visual Studio Code](https://github.com/microsoft/vscode)** and the VS Code Extension API.
* **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** for high-performance, embedded SQLite persistence.
* **[esbuild](https://github.com/evanw/esbuild)** for fast JavaScript bundling.
* **[Vitest](https://github.com/vitest-dev/vitest)** for rapid and deterministic unit testing.
* **[@vscode/test-electron](https://github.com/microsoft/vscode-test-electron)** for headless Extension Host testing.
