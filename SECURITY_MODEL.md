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
| Forged objective organization reference | Objective intake resolves the requested organization through persisted storage before generating or writing an objective | `tests/phase-306.test.js` |
| Unauthorized or cross-organization objective submission | Intake requires an active persisted CEO in the same organization; UI offers only organizations with exactly one active CEO | `tests/phase-308.test.js`, `tests/phase-032.test.js` |
| Expired organization memory | Expiration timestamps are validated, filtered at owner/context retrieval, and cleaned in bounded batches | `tests/phase-307.test.js` |
| Cross-tenant memory transfer by owner mutation | Memory owner columns and scope are immutable after creation in repository and SQLite update paths | `tests/phase-309.test.js`, `tests/phase-026.test.js` |
| Reassignment of persisted objective or agent across organizations | SQLite prevents changing an already assigned organization owner; legacy null-owned rows may receive their initial organization once | `tests/phase-310.test.js` |
| Residual project/task data after organization deletion | A database trigger deletes each owned project's task tree and project rows before organization/objective cascades complete; unrelated organizations remain | `tests/phase-311.test.js` |
| Expired memory left on disk when age-retention is disabled | Retention always deletes explicitly expired memory in bounded batches, independently of the age-based memory retention setting | `tests/phase-312.test.js`, `tests/phase-068.test.js` |
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

Phase 313 applies memory expiration to repository-wide reads as well as owner-scoped reads: `list`, `listByScope`, and `getById` exclude rows whose expiry is at or before the query instant. Each read accepts an optional canonical UTC `now` value for deterministic boundary checks. Insert readback remains available for legacy expired rows so inserting/importing them does not fail after persistence; subsequent public reads hide them.

Phase 314 adds a SQLite insert trigger that enforces the scope-to-owner-column shape for memory rows, including exactly one explicit owner for DECISION and KNOWLEDGE scopes. This protects direct database writes in addition to repository validation; foreign keys continue to validate that the chosen owner exists.

Phase 315 validates memory expiry timestamps in SQLite on insert and update, preventing malformed strings or impossible dates from bypassing lexicographic expiry reads and cleanup. Repository validation now enforces the same fixed-width canonical UTC representation.

Phase 317 adds employee-scoped memory owned by an agent id. The version 19 migration preserves existing memory rows, enforces one matching owner column for the new scope at SQLite and repository boundaries, supports authorized bounded context retrieval, and deletes an employee's memories with that employee. Cross-employee retrieval remains denied by the caller-supplied authorization boundary plus exact owner filtering.

Phase 318 adds durable engineering decision records with context, alternatives, selected and rejected options, rationale, trade-offs, evidence, author, task, timestamp, and bounded confidence. The use case verifies persisted task participation, commits the record with an audit attribution in one transaction, redacts common secret patterns, and SQLite prevents record edits or deletion.

Phase 319 adds VS Code commands to record a task-linked decision from explicit user input and inspect a selected task's stored decisions as JSON. Empty rejected-option, trade-off, or evidence lists remain empty when the author has nothing to record; confidence is stored as the author's estimate, not as a calibrated system score.

Migration 27 stores immutable decision lineage. `SUPERSEDES` edges are cycle-checked in SQLite and both relationship types are constrained to decisions whose task/project/objective chains resolve to the same organization. The application workflow additionally requires its author to participate in both tasks and writes the link plus its audit record in one transaction.

Phase 320 adds optional memory context to authorized agent requests. The provider retrieves only the assigned agent's own employee-scoped memories and the active task's memories, applies expiry/authorization/bounds/redaction through context assembly, and the agent contract validates the exact bounded shape before adapter delivery. Caller-supplied memory context is not forwarded.

Phase 321 carries repository-resolved agent capabilities and task requirements in the immutable execution request. The runtime rechecks the current assignment against those persisted capabilities before calling the adapter, so stale assignments stop when skills change.

Phase 322 enforces the task's persisted time budget at the authorized runtime boundary. When the deadline expires, the runtime aborts the adapter signal and returns the stable `task-time-budget-exceeded` failure even if the adapter ignores cancellation; a zero budget prevents adapter startup. Caller cancellation remains a separate `CANCELLED` outcome. This bounds the wait at the application boundary but cannot forcibly stop non-cooperative adapter work already running in-process.

Phase 323 requires a native platform `AbortSignal` at the child-process runner boundary. Duck-typed cancellation objects are rejected before process startup, preventing forged event methods from throwing after a child has spawned and bypassing cleanup.

Phase 324 canonicalizes trailing dots and spaces plus executable extensions before applying the shell denylist, closing Win32 aliases such as `cmd.exe.` and `powershell.exe ` in both process allowlists and task-specific command grants. Phase 325 adds `npm run test:security`, which runs Phase 091 and requires all 50 security-phase fixtures (276–325) to exist before invoking Vitest; missing fixtures fail closed.

Phase 326 adds a scheduler adapter that derives the employee id from the scheduled task's persisted assignee and requires the authorized runtime response to correlate to that same employee and task before returning a validated task result to orchestration. The adapter does not itself provide a provider or workspace tool implementation.

Phase 327 provides the scheduler's synchronous start hook: an assigned task enters `STARTED` then `IN_PROGRESS` inside one transaction with matching audit records and domain events. Already in-progress rework does not emit duplicate start events. An audit failure rolls both status transitions and event inserts back.

Phase 328 composes that lifecycle hook with the authorized scheduler/runtime bridge and verifies the actual persisted task status before adapter execution. The extension has no configured code-capable employee provider/tool implementation yet, so this composition remains an application port and is not an extension-host execution feature.

Phase 329 returns only a validated stable error code from scheduler failures. Adapter error messages and stack data are excluded from scheduler results, and objective reports retain the safe code for diagnosis.

Phase 330 maps the authorized task's remaining retry count, time limit, and aggregate token ceiling onto bounded provider generation. The budget policy charges at least the exact input-token count to each attempt even if a failed provider response reports zero usage, limits fallback output to the remaining aggregate allowance, and converts an over-budget fallback response into a stable failure without exposing its output. Provider usage records continue to represent provider-reported usage; the additional conservative reservation is used to prevent further calls.

Phases 331–332 add irreversible, owner-scoped memory invalidation. SQLite validates invalidation timestamps and forbids clearing or changing an existing invalidation; all active memory reads filter tombstones. Privacy invalidation and its metadata-only audit entry share a transaction, so an audit failure restores the still-visible memory. Phase 333 includes invalidated records in the existing bounded retention purge, allowing the text to be physically removed without an unbounded cleanup operation.

Phase 334 adds partial composite indexes per memory owner type so active owner queries can narrow on scope and owner while retaining expiration and stable-order columns. The focused SQLite query-plan fixture checks the organization-owner path and verifies each owner index exists.

### Memory provenance and recall

Schema migration 25 records each memory source kind/reference and verification actor/time/note. New verified rows require a non-AI evidence source and attribution. Source identity is immutable; verification attribution freezes once verified. Existing records migrate as LEGACY and are not treated as verified evidence during retrieval or agent-context assembly. Memory source references and review notes are redacted before persistence. The user-note use case always creates USER_NOTE rows with verified=false and records actor attribution in the audit log. Decision recall enforces organization scope through the persisted task/project/objective relationship and a separate fail-closed authorization port.

The database triggers prevent accidental invalid verified writes and attribution edits. They are not an authentication boundary against an attacker who can directly alter the SQLite schema or drop triggers; application write access remains a trusted process boundary.

Memory retrieval can filter by a bounded set of source kinds. The filter is applied after owner-scoped reads and before context assembly; it does not replace authorization, verification provenance, or response bounds.

Memory verification uses a separate application workflow. It rejects legacy and AI-generated notes, checks reviewer authorization, prevents the audited user-note author from self-verifying, then updates verification metadata and appends MEMORY_VERIFIED in one transaction. This is an application-level workflow; service callers still need to compose a trustworthy authorization adapter.

### Controlled debugging records

Debugging sessions persist their authorized task/agent identity, ordered stage, remaining attempt count, cumulative distinct files/commands/tokens, and absolute deadline. Each recorded step is bounded and redacted; low-confidence hypotheses, blockers, repeated failed tests, and exhausted resource budgets stop or escalate the session. Expired sessions are eligible for the bounded debugging retention category. A session record does not itself run shell commands or edit workspace files; such actions must be supplied by the existing permission-checked execution adapters.

On debugging escalation, the workflow marks the task BLOCKED and publishes the existing TASK_ESCALATED event with the next hierarchy role and stable reason; successful VERIFY returns it to IN_PROGRESS. Escalation-event or audit failure rolls the transition back. The session API still records steps reported by an authorized caller rather than independently observing all shell/file operations.

Phase 387's action adapter resolves workspace and process operations only through the persisted task permission provider. Reads and commands are stage-limited, command execution is capped by the session deadline and runner timeout, and patches require an explicit per-change confirmation in addition to a persisted task write grant. A session actor must still be the current task assignee. The adapter returns only bounded redacted output and records a bounded summary. Phase 388 exposes the workflow through VS Code commands, with focused integration tests for starting sessions and executing a granted inspection.

Phase 389 persists the debugging action kind, canonical file references, and a bounded secret-redacted exact command/argument summary in each immutable step; the matching audit event receives the same attribution so command and file actions remain reviewable after the session.

Phase 392 routes VS Code progress cancellation to the bounded command runner through a native `AbortSignal`. A user cancellation ends the session with `user-cancelled`, records a session-stop audit, and does not increment failed-test attempts or store cancelled output as a test result. Session deadline expiration remains separately reported as `time-budget-exceeded`.

Phase 397 makes ordinary session stop status workflow-owned (`STOPPED`). Callers cannot set `ESCALATED` through the stop request; escalation remains reachable only through the bounded step state machine, which blocks the task and publishes its hierarchy event and Director question transactionally.

Phase 398 task cancellation, task result submission into review, and terminal execution failure close any active debugging session and append its stop attribution within the same SQLite unit of work as the task transition. A session audit failure rolls the task transition back as well; optional composition ports preserve compatibility for non-debugging task workflows.

Review-finding memory records include a per-finding creation audit with source reference, evidence IDs, and SHA-256 content hash. Verification rechecks this attribution and rejects content substituted after persistence. Once verified, source text, title, category, importance, verifier, timestamp, and review note are immutable; verified state cannot be downgraded.

Task execution reports require an application authorization policy and a current persisted actor. Reports join task and assignee identity with bounded AI usage, debugging steps, and a recent audit window; they omit arbitrary audit payloads and redact model, provider, command, result, and summary text before rendering. Provider attribution is a separate optional usage field so older usage rows migrate without fabricated provenance.
