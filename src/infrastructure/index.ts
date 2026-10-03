/**
 * HEADROOM — Infrastructure Layer
 *
 * Adapters for external systems:
 * - AI provider implementations (Gemini, OpenAI, Mock)
 * - Storage repository implementations
 * - Git integration
 * - Workspace file system operations
 * - Terminal command runner
 * - Verification pipeline (lint, tsc, test, build)
 *
 * Dependencies:
 * - domain/ (interfaces it must satisfy)
 * - storage/ (database client)
 * - VS Code APIs (workspace, terminal, git)
 *
 * Implemented in Phase 021 onwards.
 */
export {};
