# HEADROOM local execution threat model

Phase 091 manual threat review, 2026-10-04. This document records the current extension boundary; it is not a certification or a claim that arbitrary workspace code is safe.

## Assets and boundaries

- Provider credentials live in VS Code SecretStorage. They must not enter prompts, task packets, audit details, or diagnostics.
- SQLite contains objectives, tasks, scoped memories, usage, and append-only audit records. Repository methods parameterize values; migrations enforce structural constraints.
- Workspace files are accessed through a canonical workspace root, path containment checks, symlink checks, and byte limits.
- Processes are started with `shell: false`, explicit absolute executable allowlists, exact task argument grants, workspace-contained working directories, timeouts, output caps, and cancellation.
- AI output and permission manifests are untrusted input. Application/domain validation remains authoritative for state changes, routing, and acceptance.

## Threats and controls

| Threat | Control | Regression evidence |
| --- | --- | --- |
| Path traversal or symlink escape | Canonical root checks; exact task path grants; write symlink rejection | `tests/phase-022.test.js`, `tests/phase-055.test.js`, `tests/phase-091.test.js` |
| Unapproved process or altered arguments | Absolute executable allowlist; exact task command/argument match; shell interpreter denial; argument count and byte limits | `tests/phase-023.test.js`, `tests/phase-055.test.js`, `tests/phase-075.test.js`, `tests/phase-091.test.js` |
| Runaway process or output | Hard timeout/output ceilings and abort propagation | `tests/phase-023.test.js` |
| Cross-scope memory disclosure | Explicit actor authorization port, exact owner query, deterministic bounded context | `tests/phase-026.test.js`, `tests/phase-027.test.js`, `tests/phase-072.test.js` |
| Provider prompt/output abuse | Request byte ceilings, cancellation and usage budgets, strict proposal schemas, bounded fallback policy | `tests/phase-044.test.js`, `tests/phase-047.test.js`, `tests/phase-073.test.js`, `tests/phase-074.test.js`, `tests/phase-091.test.js` |
| Credential disclosure | VS Code SecretStorage; credential-free result contracts; provider errors map to stable codes | `tests/phase-045.test.js`, `tests/phase-046.test.js`, `tests/phase-091.test.js` |
| Unauthorized hierarchy routing | Adjacent-role and same-office/department checks; manager routes stay within their organization edge | `tests/phase-050.test.js`, `tests/phase-057.test.js`, `tests/phase-091.test.js` |
| Upgrade corruption or downgrade | Inspect migration ledger before applying transactional migrations; block unknown future/inconsistent versions | `tests/phase-007.test.js`, `tests/phase-070.test.js` |

## Trust assumptions and residual risks

- The local user and installed VS Code extensions are trusted with the user's account permissions. A hostile local extension or process can bypass HEADROOM's in-process controls.
- Workspace files and repository configuration may be malicious. Commands must remain narrowly allowlisted and must not pass user-controlled text to an interpreter.
- Provider output is advisory. It never grants authorization or bypasses deterministic domain checks.
- Local SQLite encryption is not provided by the current storage driver. Filesystem and OS account protections apply; users should not store secrets in memory records.
- The task authorization callback is a required trusted application port. Context assembly fails closed when it denies or throws.
- Workspace confinement is an in-process check. A hostile local process that can mutate workspace paths concurrently may race filesystem checks; HEADROOM does not provide an OS sandbox.
- Prompt instructions cannot make an AI model trustworthy. Structured output validation and application authorization remain the security boundary; prompt text is defense-in-depth only.

## Phase 091 manual review

Reviewed the requested path, command, prompt, credential, and routing boundaries against their implementation and executable adversarial fixtures. The focused regression suite is `tests/phase-091.test.js`; earlier phase tests remain the detailed component coverage. Prompt contracts are immutable and proposal schemas exclude approval fields. Secret values are accepted only in the provider adapter header and are absent from its stable error responses. Route authorization is checked against the persisted hierarchy snapshot, so a caller-supplied cross-office target cannot grant itself access.

No external service calls, arbitrary workspace execution, or real provider credentials are used by this suite. The residual risks above remain in scope. Security tests verify these controls in local fixtures; they do not replace platform-specific review or an external penetration test.
