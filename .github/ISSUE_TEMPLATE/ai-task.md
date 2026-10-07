---
name: "AI Agent Task Packet"
about: "Structured task specification for AI coding agents (Codex, Claude, Gemini, Copilot)"
title: "[Task]: "
labels: ["ai-task", "automated-agent"]
assignees: []
---

<!-- HEADROOM Structured AI Task Packet -->

## Objective

<!-- Concise description of the overall goal and intended outcome. -->

## Requirements

<!-- Strict, non-negotiable architectural and functional requirements. -->
<!-- - Requirement 1 -->

## Relevant Context

<!-- Relevant files, previous decisions, invariants, and architectural constraints. -->
- **Workspace Paths**: <!-- relevant paths -->
- **Architectural Layer**: <!-- domain / application / infrastructure / storage / core -->
- **Reference Docs**: <!-- relevant doc files -->

## Dependencies

<!-- Prerequisite tasks, database migrations, or upstream PRs. -->
- None

## Acceptance Criteria

<!-- Verifiable criteria that must pass before the task can be marked complete. -->
<!-- - [ ] Acceptance criterion 1 -->

## Verification Requirements

<!-- Concrete machine checks the agent must run before opening a PR. -->
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run compile`
- [ ] `npm test`
- [ ] `git diff --check`

## Assigned Agent

- **Target Agent**: <!-- Codex / Claude Code / Gemini / Copilot / Human -->
- **Assigned Branch**: `ai/<agent>/<task>`
- **Expected Result Format**:
  ```text
  STATUS: COMPLETED
  RESULT: <summary>
  FILES: <changed files>
  TESTS: <test evidence>
  BLOCKERS: NONE
  ```
