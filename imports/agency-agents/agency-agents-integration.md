# Agency Agents — Native Integration Status

Source: `imports/agency-agents/` (MIT, Copyright (c) 2025 AgentLand Contributors — see `ATTRIBUTION.md` and `LICENSE` there; upstream classification inventory in `manifest.json`). This document records what was transformed into native HEADROOM capabilities, what stayed reference-only, what was rejected, and what remains. Status follows the integration prompt's definition of done.

**Integration status: PARTIAL** (first native slice complete; remaining slices tracked below).

## Inspected

- Upstream import: 381 files inspected at import time; 140 imported (93 classified A, 47 B; 86 C and 155 D excluded at import). 124 persona files (median 13.5 KB) plus playbooks/runbooks and metadata.
- Native workforce reality: `src/constants.js` (`OFFICE_CATALOG` with all four blueprint office slugs; `DEPARTMENTS` covering the Website office), `src/domain/departmentWorkforce.js` (`EMPLOYEE_SLOTS = 4`, `validateDepartmentWorkforce`), `src/domain/assignmentValidation.js` (`requiredCapabilities` matched case-insensitively against `assignee.capabilities`), `src/infrastructure/TaskScopedTools.js` (permission-manifest tool scoping), `src/agents/employeeExecutionContract.js` (bounded, immutable task packets; no production caller yet), `src/application/promptRegistry.js` (versioned AI contracts with untrusted-data rules).
- Blueprint: `agency-agents-workforce-map.json` — 4 offices, 20 departments, 80 employee positions, 6 shared skills, 6 manager absorptions. Planning artifact; no runtime code existed for it.

## Integrated (native)

**Phase 453 — shared workforce skills registry** (`src/application/workforceSkills.js`):

| Native slug | Upstream source | Re-engineering |
| --- | --- | --- |
| `skill:minimal-change-discipline` | `engineering/engineering-minimal-change-engineer.md` | Critical rules kept; persona prose, examples, and roleplay dropped |
| `skill:evidence-collection` | `testing/testing-evidence-collector.md` | Aligned with HEADROOM's evidence-based completion rules |
| `skill:code-review-critique` | `engineering/engineering-code-reviewer.md` | Severity model and finding discipline kept; emoji/comment etiquette dropped |
| `skill:git-pr-workflow` | `engineering/engineering-git-workflow-master.md` | Adapted to HEADROOM's never-force-push rule; branching menu dropped |
| `skill:technical-documentation` | `engineering/engineering-technical-writer.md` | Standards kept; upstream tooling assumptions dropped |
| `skill:secret-redaction-discipline` | `security/security-secrets-credential-engineer.md` | Aligned with native `redactSecrets`/SecretStorage architecture |

Contract: slugs are identical to the blueprint so plan `requiredCapabilities` labels resolve directly (`resolveWorkforceSkills`, case-insensitive like `assertRequiredCapabilities`); `buildSkillInstructionBlock` produces a bounded, slug-marked instruction block for future task-packet injection. Catalog, resolution, and bounds are enforced by `tests/phase-453.test.js`, which cross-checks every skill against the committed blueprint (slugs, roles, tools, provenance paths, license).

**Measured (real, enforced by tests):** all six instruction texts total ≈ 2.7 KB in one packet block (max 526 chars per skill) versus a 13.5 KB median for a single upstream persona — no per-employee prompt duplication. No unverified percentage claims are made beyond these byte counts.

## Reference-only / rejected

- The 80 employee-position profiles (capabilities, permissions, verification per position) remain blueprint data. They map to future roadmap phases (workforce architecture is 701–900; game-engine integration is 901–1400). Offices other than Website are already marked "Future" in `src/constants.js`; no premature activation.
- Playbooks/runbooks (`strategy/`) and per-tool metadata (`metadata/tools.json`) are reference material for later orchestration and environment-adapter phases.
- No second hierarchy, runtime, task protocol, or memory system was created; nothing in the import bypasses `TaskScopedTools` permission manifests.

## Provenance

- Committed in-repo: `manifest.json`, `agency-agents-workforce-map.json`, `agency-agents-workforce-map.md`, `ATTRIBUTION.md`, `LICENSE`, and this file.
- Local-only (untracked): the 124 upstream persona files under `imports/agency-agents/<category>/`. Their SHA-256 hashes are recorded in `manifest.json`; skill provenance strings point at their import paths. They remain available locally per the cleanup rule; committing them is an owner decision.
- Every skill records `license: 'MIT'`, `adaptation: 'REENGINEERED'`, and its upstream source path; nothing is presented as independently authored.

## Remaining slices (not claimed complete)

1. Employee-capability profiles: native representation for the 80 positions when the workforce-architecture phase lands.
2. Runtime injection: `buildSkillInstructionBlock` wired into `createEmployeeTaskPacket` when the agent-runtime phase gives packets a production caller.
3. Skill-driven permission mapping: `requiredTools` checked against `TaskScopedTools` manifests at execution time.
4. Verification expectations: `verification` strings consumed by the verification pipeline.
5. Position-level provenance proven on integration (currently proven for shared skills only).

## Known limitations

- Skills are instruction contracts only; no AI behavior change occurs until runtime injection lands.
- The provenance file-existence test passes only where the import directory is present (fresh clones verify via `manifest.json` hashes instead).
