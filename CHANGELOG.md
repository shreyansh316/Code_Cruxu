# Changelog

## Unreleased

- Extracted the Director request flows (objective analysis, plan proposal, approved-plan task creation, selection explanation and review) from `HeadroomContext` into `HeadroomDirectorCommands.js`, shrinking the context from 1112 to 745 lines with behavior preserved and the interactive Director tests passing unchanged.
- Completed the duplicate-logic burn-down: extracted the single-workspace fingerprint guard (`workspaceAccess.js`), the assigned-in-progress task rule and task-read authorization (`authorizedTaskAccess.js`), and removed duplicated budget-snapshot logic — zero cross-file duplicated logic windows remain, and the duplicate-logic audit now blocks any new one.
- Refined the duplicate-logic audit to flag only windows carrying control-flow or function tokens, excluding parallel data literals that are legitimate separate definitions.
- Extracted the director request guards, director provider factory, and operational health model out of `HeadroomContext` into pure, unit-tested modules (`directorRequestFlow.js`, `operationalHealth.js`), reducing the context to 1112 lines with identical behavior.
- Added a duplicate-logic audit (`npm run audit:duplicate-logic`) that detects cross-file 10-statement duplicated windows against a recorded baseline, and removed the task budget-snapshot duplication between `aiRequestPolicy.js` and `taskAIRequestBudget.js` (14 → 10 duplicate groups).
- Added per-position permission scope templates to the position catalog (workspace path scopes with a strict grammar that cannot express upward escapes). CEO grant writes and runtime tool creation now reject manifests exceeding a catalog-mapped employee's scope; explicit persisted grants remain required and `TaskScopedTools` remains the final operation boundary.
- Added the native employee position catalog (`src/domain/positionCatalog.js`): all eighty blueprint positions across four offices and twenty departments with capability labels, verification expectations, and provenance, plus a configuration bridge (`buildDepartmentWorkforceConfig`) that builds department rosters from catalog positions.
- Added game-engine project detection (`src/infrastructure/gameEngineDetection.js`) for Unity, Unreal, Godot, Roblox/Rojo, and Blender at the honest L1/L2 levels of the L0-L7 capability scale, with every engine's execution capability recorded as UNAVAILABLE until a verified adapter exists.
- Added native shared workforce skills re-engineered from the imported Agency Agents material: a bounded six-skill registry (`src/application/workforceSkills.js`) resolvable through existing `requiredCapabilities` task routing, with per-skill MIT provenance and blueprint cross-check tests.
- Added a deterministic dead-export audit (`npm run audit:dead-code`) with a zero-finding Phase 452 baseline; removed the dead `CONFIG`, `EXTENSION_ID`, and `EXTENSION_NAME` constants and un-exported the internally used `OBJECTIVE_TRANSITIONS` and `CORE_SCHEMA_SQL` symbols.
- Added a deterministic per-file complexity audit (`npm run audit:complexity`) that records the current worst src/ file sizes, function counts, and branch counts as the Phase 451 baseline and fails when any file exceeds it.
- Added Director-mediated cross-office dependency routing with Office Head handoff validation and durable audit records.
- Added file-backed objective recovery coverage across an Extension Host database close/reopen.
- Added a production readiness review with release owners, platform evidence requirements, and Marketplace rollback guidance.
- Added migration-backed SQLite query indexes and repeatable local performance checks.
- Added configurable workload bounds, prompt cancellation settlement, and operational health reporting.
- Hardened extension activation and cleanup; expanded Extension Host and VSIX installation verification.
- Defined extension, native target, and SQLite migration compatibility policy.
