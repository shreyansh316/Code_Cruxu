# Dependency and license review

Reviewed: 2026-10-04

## Shipped dependency set

The VSIX package allowlist in `package.json` includes the runtime portions of `better-sqlite3` and its two runtime helpers. The included license files are reviewed with the packages:

| Package | Locked version | License | Role |
|---|---:|---|---|
| `better-sqlite3` | 11.10.0 | MIT | Native SQLite binding |
| `bindings` | 1.5.0 | MIT | Native addon lookup helper |
| `file-uri-to-path` | 1.0.0 | MIT | Helper used by `bindings` |

The VSIX allowlist excludes development dependencies, source tests, benchmarks, environment files, and unrelated transitive install tooling. Phase 089 verified packaging and installed extension activation for `win32-x64`, `linux-x64`, and `darwin-x64`; the artifacts contain the platform-specific SQLite addon. The native addon must be rebuilt for the VS Code Electron runtime on each platform. `better-sqlite3` declares an install script and has prebuilt/native-build paths; CI uses Python and the platform toolchain to support node-gyp fallback builds.

## Lockfile provenance

The lockfile contains 476 package entries at review time. Every third-party entry has a resolved URL on `registry.npmjs.org`, an integrity hash, and a license field. The lockfile root engine metadata now matches `package.json` (`node >=20.0.0`, VS Code `^1.101.0`). No alternative registries, git URLs, local file dependencies, missing integrity hashes, or missing third-party license fields were found.

Direct dependency versions at review time were `better-sqlite3` 11.10.0, `@electron/rebuild` 4.2.0, `@vscode/test-electron` 2.5.2, `@vscode/vsce` 3.9.2, `esbuild` 0.25.12, and `vitest` 2.1.0. The package manifest ranges and lockfile pin the install graph. No dependency update was retained in this phase: attempted major updates to VSCE and Vitest selected an incompatible Vite 8 / esbuild 0.25 peer combination and failed clean-install validation. The known-good versions remain in place; Phase 089's CI run verified the locked install and checks on all three supported targets.

## Advisory review

The registry audit on the reviewed baseline reported **zero production vulnerabilities**. The full development-inclusive audit reported 11 findings: 1 critical, 7 high, and 3 moderate. They affect development/build tooling, including Vitest/Vite and VSCE's secretlint/glob dependency chain. `npm audit --omit=dev` reported zero vulnerabilities. These findings are documented rather than represented as fixed; the affected test/packaging tools are not included in the VSIX. They remain a maintenance risk for contributors and CI, and should be updated in a separately validated dependency change.

The dependency update check found newer versions available for several direct tools and the native module. The current versions remain within the manifest ranges. Major updates to `@vscode/vsce` and `better-sqlite3` need their own packaging/native compatibility verification; Vitest updates must keep Vite and esbuild peers aligned. No automated `npm audit fix` was applied.

## Project license status

The repository has no top-level `LICENSE`, `LICENSE.md`, or `LICENSE.txt`; VSCE reports this during packaging. A project license is an owner decision and was not inferred from dependency licenses. The existing Marketplace release policy still requires resolving this warning before publication.
