# HEADROOM local execution threat model

Phase 075 review, 2026-10-04. This document records the current extension boundary; it is not a certification or a claim that arbitrary workspace code is safe.

## Assets and boundaries

- Provider credentials live in VS Code SecretStorage. They must not enter prompts, task packets, audit details, or diagnostics.
- SQLite contains objectives, tasks, scoped memories, usage, and append-only audit records. Repository methods parameterize values; migrations enforce structural constraints.
- Workspace files are accessed through a canonical workspace root, path containment checks, symlink checks, and byte limits.
- Processes are started with `shell: false`, explicit absolute executable allowlists, exact task argument grants, workspace-contained working directories, timeouts, output caps, and cancellation.
- AI output and permission manifests are untrusted input. Application/domain validation remains authoritative for state changes, routing, and acceptance.

## Threats and controls

| Threat | Control | Regression evidence |
| --- | --- | --- |
| Path traversal or symlink escape | Canonical root checks; exact task path grants; write symlink rejection | `tests/phase-022.test.js`, `tests/phase-055.test.js` |
| Unapproved process or altered arguments | Absolute executable allowlist; exact task command/argument match; shell interpreter denial; argument count and byte limits | `tests/phase-023.test.js`, `tests/phase-055.test.js`, `tests/phase-075.test.js` |
| Runaway process or output | Hard timeout/output ceilings and abort propagation | `tests/phase-023.test.js` |
| Cross-scope memory disclosure | Explicit actor authorization port, exact owner query, deterministic bounded context | `tests/phase-026.test.js`, `tests/phase-027.test.js`, `tests/phase-072.test.js` |
| Provider prompt/output abuse | Request byte ceilings, cancellation and usage budgets, schema validation, bounded fallback policy | `tests/phase-044.test.js`, `tests/phase-047.test.js`, `tests/phase-073.test.js`, `tests/phase-074.test.js` |
| Upgrade corruption or downgrade | Inspect migration ledger before applying transactional migrations; block unknown future/inconsistent versions | `tests/phase-007.test.js`, `tests/phase-070.test.js` |

## Trust assumptions and residual risks

- The local user and installed VS Code extensions are trusted with the user's account permissions. A hostile local extension or process can bypass HEADROOM's in-process controls.
- Workspace files and repository configuration may be malicious. Commands must remain narrowly allowlisted and must not pass user-controlled text to an interpreter.
- Provider output is advisory. It never grants authorization or bypasses deterministic domain checks.
- Local SQLite encryption is not provided by the current storage driver. Filesystem and OS account protections apply; users should not store secrets in memory records.
- The task authorization callback is a required trusted application port. Context assembly fails closed when it denies or throws.

Security tests verify these controls in local fixtures. They do not replace platform-specific review or an external penetration test.
