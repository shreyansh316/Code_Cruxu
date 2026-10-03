# HEADROOM

HEADROOM is the VS Code extension maintained in the `Code_Cruxu` repository.

HEADROOM is an AI-powered **Visual Studio Code extension** being built as a hierarchical operating system for planning, executing, and verifying development work. It runs in the VS Code Extension Host; this repository is not a website or a Next.js application.

The intended organization is:

```text
CEO
└─ AI Director
   └─ Office Head Manager
      └─ Department Manager
         └─ Four AI Employees
```

Communication is designed to follow adjacent levels of this hierarchy. Employees do not communicate with one another, department managers do not communicate directly, and cross-department coordination is routed through the Office Head Manager. This describes the planned architecture; agent orchestration is not implemented yet.

## Current implementation

The repository currently provides the VS Code extension foundation, architecture boundaries, and a verified initial SQLite schema. The extension activates, registers commands, displays a status bar item, and shows a first-activation welcome message.

| Command | Current behavior |
|---|---|
| `HEADROOM: Show Status` | Reports whether the extension context initialized. |
| `HEADROOM: Open CEO Dashboard` | Placeholder message; the dashboard UI is planned for a later phase. |
| `HEADROOM: New Objective` | Placeholder message; objective intake is planned for a later phase. |
| `HEADROOM: Pause Execution` | Placeholder message; execution controls are planned for a later phase. |
| `HEADROOM: Resume Execution` | Placeholder message; execution controls are planned for a later phase. |

The Activity Bar container and Organization and Active Tasks views are contributed in the extension manifest; tree data providers are not implemented yet. The SQLite schema defines the initial relational model and is covered by in-memory tests, but the extension does not yet open a runtime database, run migrations, or use repositories. AI provider settings are declared, but no AI provider is connected. No production users, projects, or task records are included.

Phases 001–003 established the extension foundation, architecture and SQLite compatibility, and canonical SQLite schema. The reconstructed 100-phase plan is in `headroom_100_phase_roadmap.md`; later phases remain planned until implemented and verified.

## Requirements

- Visual Studio Code 1.100 or newer
- Node.js 22 or newer
- npm (included with Node.js)

The `better-sqlite3` dependency includes a native Node module. If installation or loading fails on your platform, use the SQLite compatibility check below to see the native-module error.

## Set up for development

1. Open this repository folder in VS Code.
2. Install the project dependencies:

   ```sh
   npm install
   ```

3. Press **F5** and select **Run HEADROOM Extension**. The launch configuration compiles the extension and opens a separate Extension Development Host window.

To compile from a terminal:

```sh
npm run compile
```

The compiled extension entry point is written to `out/extension.js`. Build output is generated and is not committed.

## Verify changes

Run the TypeScript check and complete unit-test suite:

```sh
npx tsc --noEmit
npm test
```

The unit tests run with Vitest in Node.js and use the repository's VS Code API mock where needed. They do not launch the VS Code Extension Host.

Verify that the installed native SQLite module can open and use both in-memory and temporary file databases:

```sh
npm run check:sqlite
```

## Package locally

Build a local VS Code extension package (`.vsix`) with:

```sh
npm run package
```

This runs the extension build and VS Code packaging tool; it does not publish or deploy HEADROOM. Packaging is currently blocked when a local `.env` file is present: VS Code's packaging tool refuses to include environment files. Do not bypass that protection with `--allow-package-env-file`. The package command also reports that repository and license metadata and an explicit packaging file allowlist are missing. A valid installable `.vsix` has not yet been verified; packaging hardening is tracked as a later roadmap milestone. Any successfully generated `.vsix` is ignored by Git.

## Project structure

```text
src/
  extension.ts       VS Code extension activation and deactivation
  core/              Extension context, commands, and lifecycle
  domain/            Domain layer boundary
  application/       Application use-case boundary
  infrastructure/    External adapter boundary
  storage/           SQLite compatibility check and initial schema
  agents/             Agent runtime boundary
  constants.ts       Extension identifiers and shared constants
tests/               Phase-focused Vitest tests
scripts/             Standalone development checks
media/               Extension assets
headroom_100_phase_roadmap.md
                     Reconstructed project roadmap and phase criteria
```

The intended dependency direction is VS Code integration → application → domain → infrastructure → storage. The boundaries exist, but later layers are not yet implemented; the roadmap records their planned phases.

## Extension settings

The extension contributes these settings in VS Code:

| Setting | Default | Purpose |
|---|---:|---|
| `headroom.ai.provider` | `mock` | Selects the configured provider name (`mock`, `gemini`, or `openai`); provider integration is not implemented yet. |
| `headroom.ai.defaultModel` | `gemini-2.0-flash` | Default model setting for future standard tasks. |
| `headroom.ai.reasoningModel` | `gemini-2.5-pro` | Model setting for future reasoning tasks. |
| `headroom.execution.maxRetries` | `2` | Configured maximum retry count for future execution behavior. |
| `headroom.execution.parallelLimit` | `4` | Configured concurrency limit for future execution behavior. |
| `headroom.debug.verbose` | `false` | Verbose-debug setting. |

These are manifest settings only; API credentials and provider calls are not part of the current implementation.

## Roadmap and project status

The roadmap records the evidence used to reconstruct the missing 100-phase plan, acceptance criteria, verification approach, and expected commit for each milestone. Phase 004 is limited to restoring accurate extension documentation. Do not treat future roadmap phases as completed features.
