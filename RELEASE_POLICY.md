# Release and compatibility policy

## Extension releases

The VS Code extension version in `package.json` is the release identifier and follows SemVer. The current `0.1.0` version is pre-1.0; minor releases may change behavior while the product is evolving. After `1.0.0`, major releases may include documented breaking behavior, minor releases add backward-compatible capabilities, and patch releases contain compatible fixes. Every release updates `CHANGELOG.md` before packaging. A release is not published by the build or verification commands.

The supported VS Code engine range starts at `1.101.0` (`^1.101.0`). The extension host runs on Node.js 20 or newer. `test/runTest.js` pins the host integration runtime to VS Code `1.101.0`; changing that baseline requires updating the manifest range and passing both source and VSIX Extension Host runs.

## Native package targets

The packaged extension includes `better-sqlite3`, a native module. Each VSIX is rebuilt for the VS Code Electron runtime and labeled with the current operating system and architecture, such as `win32-x64`. A VSIX is not portable across operating systems or architectures. Each additional release target needs its own native rebuild, VSIX install check, and Extension Host run before it is claimed as supported.

## SQLite data compatibility

SQLite schema migration versions are independent of the extension SemVer. Migration versions are positive, contiguous integers; applied migration names and meanings are immutable. A schema change adds a migration and never edits an already released migration.

On startup, HEADROOM inspects the migration ledger before applying pending migrations. Fresh databases initialize from version 0. Supported older ledgers migrate forward transactionally to the latest schema bundled with the extension. A newer database version or mismatched ledger blocks startup without attempting a downgrade or repair. Users must open that database with a compatible newer release or restore a verified backup.

The latest migration is the authoritative schema version (`SCHEMA_MIGRATIONS.at(-1).version`); the current schema is version 8. Compatibility tests cover fresh/current/older ledgers, forward migration, malformed history, and future-version rejection.

## Release checks

Before a release, run the full unit suite, compile, SQLite compatibility check, JavaScript-only source/test scan, `npm run test:vscode`, `npm run package`, and `npm run test:vscode:vsix`. The package command builds only for the current target. Do not claim another target until its package and host checks pass. Review the VSCE warning about the missing top-level license file before any Marketplace publication.

## Continuous integration

The `Quality gates` workflow runs on pushes and pull requests to `main`. It runs the JavaScript static checks and lint, unit tests, compile, native SQLite check, source Extension Host test, VSIX packaging, and packaged Extension Host test. Its current runner is Windows x64, matching the only native VSIX target verified by this policy. The workflow uploads a generated VSIX for 14 days; GitHub retains the full job log according to repository settings.

HEADROOM has no semantic static type system. `npm run typecheck` parses every JavaScript source and test file with Node and enforces the JavaScript-only source rule; it does not claim TypeScript-style type analysis. `npm run lint` checks for debugger statements, trailing whitespace, and unresolved merge markers.

Repository administrators must mark the `Windows x64 quality gates` check as required in GitHub branch protection to block merges when it fails. A workflow file cannot enable that repository-level setting. Release validation still requires the checks listed above; CI does not publish a release.
