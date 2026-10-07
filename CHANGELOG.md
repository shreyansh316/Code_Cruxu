# Changelog

## Unreleased

- Added a deterministic dead-export audit (`npm run audit:dead-code`) with a zero-finding Phase 452 baseline; removed the dead `CONFIG`, `EXTENSION_ID`, and `EXTENSION_NAME` constants and un-exported the internally used `OBJECTIVE_TRANSITIONS` and `CORE_SCHEMA_SQL` symbols.
- Added a deterministic per-file complexity audit (`npm run audit:complexity`) that records the current worst src/ file sizes, function counts, and branch counts as the Phase 451 baseline and fails when any file exceeds it.
- Added Director-mediated cross-office dependency routing with Office Head handoff validation and durable audit records.
- Added file-backed objective recovery coverage across an Extension Host database close/reopen.
- Added a production readiness review with release owners, platform evidence requirements, and Marketplace rollback guidance.
- Added migration-backed SQLite query indexes and repeatable local performance checks.
- Added configurable workload bounds, prompt cancellation settlement, and operational health reporting.
- Hardened extension activation and cleanup; expanded Extension Host and VSIX installation verification.
- Defined extension, native target, and SQLite migration compatibility policy.
