# HEADROOM

**Plan, organize, and verify AI-assisted development work inside Visual Studio Code.**

HEADROOM is an early-stage VS Code extension for bringing more structure to software development workflows. It provides objective capture, work tracking, and supporting planning and verification capabilities in the editor.

## Current status

HEADROOM is under active development. The extension currently supports creating and storing objectives, browsing organization and task views, pausing and resuming execution state, and configuring an AI provider credential through VS Code's secure credential storage. Some dashboard and end-to-end AI-assisted workflows are still in development. See [Production readiness](PRODUCTION_READINESS.md) for verified release status and known limitations.

## Requirements

- Visual Studio Code 1.101 or newer
- Node.js 20 or newer for development
- npm

## Try the extension from source

1. Clone this repository and open its folder in VS Code.
2. Install dependencies with `npm install`.
3. Press **F5** and select **Run HEADROOM Extension** to open an Extension Development Host.

To compile the extension from a terminal, run:

```sh
npm run compile
```

## Verify changes

```sh
npm test
npm run typecheck
npm run lint
npm run check:sqlite
npm run audit:complexity
npm run test:vscode
```

To test activation of the packaged extension as well, run `npm run test:vscode:vsix`.

## Package locally

```sh
npm run package
```

This creates a platform-specific `.vsix` file for local review. Packaging does not publish the extension. The project license must be selected by the project owner before a public release.

## Recovery and release information

- [Production readiness](PRODUCTION_READINESS.md) — release evidence, platform qualification, and outstanding decisions.
- [Operational recovery](OPERATIONS_RECOVERY.md) — recovery guidance for extension data and development fixtures.
