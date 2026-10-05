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
| Path traversal, symlink escape, or Windows path alias access | Canonical root checks; exact task path grants; write symlink rejection; colon denial blocks alternate data streams; trailing-dot/space and reserved-device denial block Win32 path aliases | `tests/phase-022.test.js`, `tests/phase-055.test.js`, `tests/phase-091.test.js`, `tests/phase-279.test.js`, `tests/phase-280.test.js`, `tests/phase-281.test.js` |
| Oversized or non-regular workspace file reads | Requires regular files and enforces configured bytes before and during chunked reads | `tests/phase-022.test.js`, `tests/phase-282.test.js` |
| Credential/private-key file access or filesystem exhaustion | Sensitive path policy rejects common credential/key names and credential containers in direct and task-scoped operations; listings skip sensitive directories; each adapter has a lifetime operation budget | `tests/phase-277.test.js`, `tests/phase-286.test.js` |
| Unapproved process or altered arguments | Absolute executable allowlist; exact task command/argument match; shell interpreter denial; argument count and byte limits | `tests/phase-023.test.js`, `tests/phase-055.test.js`, `tests/phase-075.test.js`, `tests/phase-091.test.js` |
| Runaway process or output | Hard timeout/output ceilings, abort propagation, child environment filtering, and common-secret redaction/caps in returned command and verification results plus activity previews | `tests/phase-023.test.js`, `tests/phase-276.test.js`, `tests/phase-291.test.js` |
| Cross-scope memory disclosure | Explicit actor authorization port, exact owner column for ambiguous decision/knowledge scopes, deterministic bounded context | `tests/phase-026.test.js`, `tests/phase-027.test.js`, `tests/phase-072.test.js`, `tests/phase-284.test.js` |
| Provider prompt/output abuse | Request and HTTP response byte ceilings, hard timeout during token counting or generation even when an adapter ignores cancellation, actual usage ceilings, correlation/schema validation, strict proposal schemas, bounded fallback policy | `tests/phase-044.test.js`, `tests/phase-047.test.js`, `tests/phase-073.test.js`, `tests/phase-074.test.js`, `tests/phase-278.test.js`, `tests/phase-283.test.js`, `tests/phase-285.test.js` |
| Prompt injection through AI organization packet values | Director and department-manager prompt contracts explicitly treat packet values as untrusted and reject embedded attempts to override role, policy, authorization, schema, or tool permissions | `tests/phase-293.test.js` |
| Credential disclosure | VS Code SecretStorage; credential-free result contracts; provider errors map to stable codes; URL passwords and Basic auth are redacted from captured command text | `tests/phase-045.test.js`, `tests/phase-046.test.js`, `tests/phase-091.test.js`, `tests/phase-290.test.js` |
| Secrets echoed in persisted employee results | Canonical task-result validation redacts common credentials from summaries and acceptance evidence before returning data to application and storage callers | `tests/phase-294.test.js` |
| Secrets in employee file/test/blocker metadata | Employee execution contract sanitizes auxiliary text fields before they leave the agent boundary | `tests/phase-295.test.js` |
| Secrets in human review evidence | Review bundle verification logs use the shared URI, Basic, bearer, token, and API-key redactor after enforcing the byte cap | `tests/phase-296.test.js` |
| Secrets or unbounded content in audit details | Audit persistence recursively redacts string keys/values and rejects serialized details above 64 KiB | `tests/phase-297.test.js` |
| Legacy secrets in audit reads | Audit row mapping also sanitizes preexisting JSON details and drops values under credential-like keys | `tests/phase-298.test.js` |
| Credentials in retrieved memory context | Bounded context assembly sanitizes memory title, category, and content before returning context to an AI caller | `tests/phase-299.test.js` |
| Credential echoes in CEO reports | Report projection sanitizes objective titles and blocker reasons before display | `tests/phase-300.test.js` |
| Credential echoes in command-center text | Shared bounded text projection redacts common credentials in titles, questions, answers, identity labels, and other displayed metadata | `tests/phase-301.test.js` |
| Unbounded or secret-bearing provider usage metadata | Persisted model/purpose metadata enforces field limits, redacts secret forms on write, and sanitizes values on read | `tests/phase-302.test.js` |
| Secrets or oversized payloads in durable events | Event persistence sanitizes nested values, rejects payloads over 64 KiB, and redacts bounded subscriber error details | `tests/phase-303.test.js` |
| PEM private key disclosure in captured text | Shared redactor removes supported PEM and OpenSSH private-key blocks before normal output truncation | `tests/phase-304.test.js` |
| Cross-organization CEO report access | CEO execution reports require persisted CEO organization ownership to exactly match the objective organization | `tests/phase-305.test.js` |
| Secret-like task or agent identifiers in activity metadata | Activity identifiers pass through the same bounded secret redactor before in-memory retention and UI projection | `tests/phase-292.test.js` |
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

## Phases 276–278 regression review

Phase 276 limits inherited child-process environment variables to a small operating-system baseline and explicit non-secret allowlist entries; common credential patterns are redacted in returned command output and activity previews. Phase 277 prevents common credential, cloud configuration, repository metadata, and private-key paths from being listed or accessed and bounds total calls per workspace adapter instance. Phase 278 validates provider response correlation, schema, output fields, and reported usage at the budgeted-provider boundary; timeout and caller cancellation stop waiting even if the provider adapter ignores its abort signal. Phase 279 blocks colon-bearing paths at both filesystem and task-grant boundaries to prevent Windows alternate data stream access. Phase 280 rejects trailing-dot and trailing-space path segments, which can alias other names under Win32 filesystem rules. Phase 281 rejects reserved Win32 device names, including extension forms such as `NUL.txt`, before filesystem resolution. Phase 282 restricts reads to regular files and reads bounded chunks so file growth between metadata checks cannot bypass the memory limit. Phase 283 bounds streamed Gemini response bodies before JSON parsing for both generation and token counting. These controls have focused adversarial fixtures. They remain defense-in-depth, not an OS sandbox or proof that all secret-bearing content or filenames can be recognized.

Phase 284 makes DECISION and KNOWLEDGE retrieval require an explicit owner column (`organizationId`, `projectId`, etc.) at the repository, privacy-control, and context-assembly boundaries. This avoids cross-owner disclosure when distinct entity types contain the same identifier.

Phase 285 races the token-count operation against the request abort signal, so the total provider timeout still resolves if the tokenizer ignores cancellation. A timeout is recorded with zero usage and generation is not started.

Phase 286 treats common `credentials`, `secrets`, certificate, and private-key directory names as sensitive containers, including nested paths with otherwise ordinary filenames. Phase 287 covers common cloud/deployment credential directories and generic cloud config leaf names. Phase 288 broadens private-key and certificate filename detection, including service-account and credential/secrets filename variants. Phase 289 centralizes Win32 path-alias checks and covers console stream names and superscript numbered device aliases.

Phase 290 extends text redaction to URI userinfo passwords and HTTP Basic authorization values before they are returned or placed in activity previews.

Phase 291 repeats redaction and output bounds at the verification pipeline boundary, so injected command adapters cannot bypass output sanitation by returning raw strings.

Phase 292 applies the activity feed's bounded credential redactor to task and agent identifiers as well as event text before retaining the metadata for command-center display. Ordinary identifiers remain unchanged and identifier length remains capped.

Phase 293 strengthens the Director and department-manager prompt contracts so objective descriptions, clarification answers, task packets, repository excerpts, and similar supplied values cannot override the contract's role, policy, authorization, schema, or tool permissions. Output validation and application authorization remain the actual enforcement boundaries; prompt text is defense-in-depth.

Phase 294 applies the common credential redactor inside canonical task-result validation so provider or tool output cannot persist common credential strings in employee summaries or acceptance evidence. Ordinary result text remains unchanged. This is best-effort pattern filtering and does not identify arbitrary sensitive content.

Phase 295 applies the same redaction and 2,000-character cap to employee file references, test evidence, blockers, and relevant-context strings carried through the employee execution contract.

Phase 296 replaces the review bundle's narrower ad-hoc regex with the shared bounded credential redactor for verification stdout/stderr. The original byte-size rejection still occurs before redaction.

Phase 297 makes audit-log append a final size and redaction boundary: nested strings and keys are sanitized, and JSON details exceeding 64 KiB are rejected before SQLite insertion. Existing audit details already on disk are not rewritten by this append-time control.

Phase 298 applies audit detail sanitation while mapping records from SQLite, protecting callers that read legacy rows created before the append-time control. Credential-like property names such as `token`, `password`, and `authorization` cause their entire values to be replaced.

Phase 299 sanitizes bounded memory titles, categories, and content before context selection returns them to an AI caller. Authorization and owner scoping still happen before memory retrieval; redaction is applied before ranking/context emission.

Phase 300 sanitizes objective titles and task blocker text at the CEO report projection boundary, preventing legacy or injected records from echoing common credential forms into the report UI.

Phase 301 applies the same redaction in the shared Command Center text projection, including objective/task titles and employee identity labels. Credential values remain hidden at display boundaries even when the persisted value predates result/audit sanitation.

Phase 302 bounds AI usage model and purpose metadata and redacts credential patterns on both repository writes and reads. Token counts, duration, cost, and request attribution retain their existing numeric validation.

Phase 303 sanitizes event payload strings and credential-like keys before durable insertion, applies the same handling when reading older rows, caps event payloads at 64 KiB, and redacts subscriber exception messages before storing or returning them.

Phase 304 extends shared text filtering to complete RSA, EC, DSA, OpenSSH, generic, and encrypted PEM private-key blocks. Ordinary prose that merely mentions a private key is preserved.

Phase 305 closes a cross-organization report boundary: a CEO identity without an organization, or whose organization differs from the objective owner, cannot retrieve that objective's task, audit, or usage report.
