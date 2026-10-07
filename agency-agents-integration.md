# Agency Agents capability integration

## Status and boundaries

The imported repository remains an attributed reference corpus under `imports/agency-agents/`. Its workforce map is a proposal, not a second persisted organization. HEADROOM's hierarchy, four-employee department invariant, capability assignment checks, task protocol, task-scoped tools, and verification path remain authoritative. No imported runtime, employee identities, dependencies, database schema, or tool grants were added.

The import manifest records 381 upstream files inspected: 93 selected as import class A, 47 as class B, and 86/155 excluded as classes C/D. Those are import-selection classifications, not integration results. HEADROOM's six shared skills correspond to the blueprint and are the only imported capability instructions integrated into the runtime. All other imported files remain reference-only. The imported workforce map, source files, MIT license, and attribution record are preserved.

## Native integration

The existing `src/application/workforceSkills.js` registry already defines six compact HEADROOM skills: minimal-change discipline, evidence collection, code review, Git workflow, technical documentation, and secret redaction. This integration connects that registry to `src/application/structuredEmployeeTaskAdapter.js`. At each structured employee execution, HEADROOM resolves skills from the task's existing `requiredCapabilities` labels and adds only their instructions and verification expectations to the trusted system prompt. Tasks without a registered shared skill keep the base prompt unchanged. The existing 8 KiB instruction-block bound remains in force.

The existing `tests/phase-453.test.js` checks that the six skills match the workforce blueprint, preserve source provenance and MIT licensing, remain bounded, and resolve deterministically. `tests/agency-agents-runtime-integration.test.js` covers prompt injection and verifies that skill selection does not add tools.

The resolver now enforces the plan's existing capability input limits (up to 32 labels, each a non-empty string of at most 100 characters) instead of coercing arbitrary values to strings. Its optional instruction budget must be an integer within the existing 8 KiB maximum. Regression cases cover malformed values, boundary violations, duplicate resolution, and attempts to exceed the prompt budget. This tightens the adapter boundary without changing valid task routing or the existing duplicate-collapse behavior.

| Native HEADROOM skill | Mapping and source provenance |
|---|---|
| `skill:minimal-change-discipline` | Engineering across offices; `engineering/engineering-minimal-change-engineer.md` |
| `skill:evidence-collection` | QA/testing and evidence-driven tasks; `testing/testing-evidence-collector.md` |
| `skill:code-review-critique` | Code review and defect analysis; `engineering/engineering-code-reviewer.md` |
| `skill:git-pr-workflow` | Git hygiene where the task already grants Git; `engineering/engineering-git-workflow-master.md` |
| `skill:technical-documentation` | Documentation and decision records; `engineering/engineering-technical-writer.md` |
| `skill:secret-redaction-discipline` | Security and credential tasks; `security/security-secrets-credential-engineer.md` |

These are shared capabilities, not employee identities. Department-specific task capabilities remain stored and matched through the existing employee records. No new router, hierarchy, task packet, memory system, or orchestration layer was created. Imported manager/orchestration roles remain mapped to HEADROOM's existing Director and manager responsibilities.

**Native position catalog (phase 454).** `src/domain/positionCatalog.js` registers all eighty blueprint positions natively — four offices, twenty departments, exactly four positions each — carrying each position's specialization, kebab capability labels (the blueprint `taskTypes`), verification expectation, and upstream provenance. Catalog invariants (80 positions, 4-slot groups, distinct specializations, label shape) are validated at module load and cross-checked against the committed blueprint by `tests/phase-454.test.js`, including alignment of the Website office's department slugs with `src/constants.js`. `src/application/positionWorkforceInput.js` bridges the catalog to the existing workforce-configuration use case: `buildDepartmentWorkforceConfig` produces a department's four-employee roster input from catalog positions, so office setup can be driven by the re-engineered blueprint instead of hand-invented rosters. Capability labels remain open for extension while guaranteeing the catalog baseline; task-time grants still flow only through `TaskScopedTools` permission manifests.

**Position scope enforcement (phase 456 follow-through).** Each catalog position carries the blueprint's declared `readScope`, `writeScope`, and `commandScope`, validated by the shared path-scope grammar in `src/domain/scopeMatch.js`. The pure audit now lives in `src/domain/positionManifestAudit.js`. When an employee's persisted `specialization` exactly maps to a unique catalog entry, CEO grant writes reject out-of-scope manifests and `PersistedTaskToolsProvider` repeats the check before exposing runtime tools. The position scopes only restrict the existing persisted task grant; they never create tools or permissions. Legacy/custom specializations without a unique catalog match continue to use the existing explicit task grant policy.

## Tools, permissions, and security

The skill registry's `requiredTools` field is descriptive; it is not an authorization grant. Skills are added only as static developer-authored system-prompt guidance. The model still receives only tools present in the current task-scoped interface, and operations remain enforced by `TaskScopedTools` and persisted task permission manifests. The skill resolver does not read imported files or project content at runtime. Existing untrusted-data, redaction, capability assignment, and execution-time authorization rules remain in force.

## Game development and other domain capabilities

The workforce blueprint provides coverage descriptions for Unreal, Unity, Godot, Roblox, Blender, gameplay, graphics/shaders, technical art, animation, audio, multiplayer, optimization, testing, build pipelines, and editor tooling. The eighty positions are now native catalog entries (phase 454), and game-engine **project detection is implemented (phase 455)**: `src/infrastructure/gameEngineDetection.js` recognizes Unity, Unreal, Godot, Roblox/Rojo, and Blender projects from real workspace markers through the task-scoped workspace adapter and reads engine metadata (Unity `m_EditorVersion`, Unreal `EngineAssociation`, Godot `config_version`, Rojo project trees) for L2 inspection claims, with unreadable metadata degrading honestly to L1 marker claims.

Capability levels follow the L0-L7 scale in `src/domain/gameEngines.js`. Detection can demonstrate at most **L2**; `createEngineCapabilityClaim` rejects DETECTION-origin claims above L2 by construction. Engine execution (L4+) is **UNAVAILABLE** for every engine — `ENGINE_EXECUTION_AVAILABILITY` names the missing adapter per engine (Unity editor/CLI, Unreal Build Tool, Godot headless, Studio automation, Blender process). The extension does not call official engine/editor APIs, run engine builds, execute playtests, or validate engine assets; generic workspace file operations and process execution still require explicit task grants and do not establish official engine support. The same evidence standard applies to app, web, mobile, XR, and research profiles: a profile description is not a demonstrated integration.

## Provenance, classification, and optimization

`agency-agents-capability-map.json` records each of the six re-engineered skill sources and the status of the remaining import corpus. The full imported-file inventory and its original A/B selection classes remain in `imports/agency-agents/manifest.json`; class C/D excluded sources are not in the imported corpus. A shared skill's source, MIT license, and `REENGINEERED` status are retained by the existing registry. Persona identity text, duplicate orchestration, unrelated role descriptions, broad tool catalogs, and unverified workflows are not copied into runtime code.

Selection uses existing exact `requiredCapabilities` routing labels; context is loaded only for explicitly requested shared skills. This removes the need to repeat each shared procedure in employee definitions. No before/after token benchmark exists, so measured token reduction is **UNVERIFIED**. The existing 8 KiB bound controls the maximum shared-skill instruction block.

The roadmap was not changed and no phase is claimed complete by this integration.

## Available upstream snapshot comparison

Compared the available filesystem snapshot at `D:\codex room\agency-agents-main\agency-agents-main` to the imported corpus by normalized relative path and SHA-256. The source tree has 381 files; 138 imported source files are byte-identical to their upstream paths, no overlapping source file differs, 243 upstream files are absent from the import, and seven HEADROOM-local manifest/map/attribution files have no upstream counterpart. The source folder has no `.git` metadata, so its commit, date, and true new-versus-removed history are unavailable; the 243 are accurately described as *unimported from this snapshot*, not as proven upstream additions. The unimported inventory includes 17 engineering, 2 security, and 2 project-management profiles; none in `game-development` or `testing`. The threat-intelligence and blockchain-auditor profiles were reviewed as role guidance but require external feeds or blockchain toolchains not available in HEADROOM, and the Jira workflow steward assumes a Jira connector that HEADROOM does not have. They remain reference-only. No upstream files were bulk-copied.

## Disposition summary

* **Re-engineered**: the six shared-skill sources named above (connected to the structured employee execution prompt); the eighty blueprint positions (`src/domain/positionCatalog.js`, with the configuration bridge in `src/application/positionWorkforceInput.js`).
* **Implemented natively (detection only)**: game-engine project detection for Unity, Unreal, Godot, Roblox/Rojo, and Blender at honest L1/L2 levels; execution levels remain UNAVAILABLE until verified adapters exist.
* **Reference-only**: remaining imported profiles, metadata, and runbooks. This includes engine build/playtest workflows until concrete official-tool and verification integrations exist.
* **Rejected as runtime architecture**: a separate Agency Agents hierarchy/runtime, duplicate orchestration, employee-to-employee messaging, or a parallel tool/permission model. This rejects those architectural patterns, not the upstream source material.
* **Excluded**: the manifest's class C and D material was not imported and remains excluded.

The import files under `imports/` were already untracked when inspected and are preserved (persona files remain local-only with SHA-256 hashes recorded in the committed `manifest.json`; the blueprint, attribution, and license are committed). Current status of this document: skills, position catalog, configuration bridge, and engine detection are implemented and tested; commits and pushes follow the owner's workflow.
