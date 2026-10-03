/**
 * HEADROOM — Storage Layer
 *
 * SQLite database access via better-sqlite3.
 * Responsible for:
 * - Database connection lifecycle
 * - Schema migrations (versioned SQL files)
 * - Repository implementations for all entities
 * - Audit log persistence
 * - Memory persistence
 * - AI usage tracking
 *
 * Dependencies:
 * - better-sqlite3 (native Node.js SQLite driver)
 * - NO dependency on VS Code APIs
 * - NO dependency on domain/application layers
 *
 * The database file is stored in VS Code's globalStorageUri.fsPath.
 * During unit tests, an in-memory database is used.
 *
 * Implemented starting Phase 006 (database connection) through Phase 009.
 */
export {};
