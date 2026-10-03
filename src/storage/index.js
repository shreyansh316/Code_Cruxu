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
 * - NO dependency on the domain or application layers
 *
 * The database file is stored in VS Code's globalStorageUri.fsPath.
 * During unit tests, an in-memory database is used.
 *
 * Initial relational schema is defined in Phase 003.
 * Connection lifecycle is implemented in Phase 006 and versioned migrations
 * in Phase 007; typed core repositories are implemented in Phase 009.
 */
export { CORE_SCHEMA_SQL, initializeCoreSchema } from './schema';
export { SqliteConnection, SqliteConnectionError } from './SqliteConnection';
export { createDatabaseBackupService } from './DatabaseBackup';
export { runDataRetention } from './DataRetention';
export { applyMigrations, SCHEMA_MIGRATIONS, SqliteMigrationError, } from './migrations';
export * from './repositories';
