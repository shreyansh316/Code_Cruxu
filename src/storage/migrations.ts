/**
 * HEADROOM — Versioned SQLite schema migrations
 *
 * Migrations run synchronously and atomically on a caller-owned connection.
 * They do not open or close the database handle.
 */
import type Database from 'better-sqlite3';
import { initializeCoreSchema } from './schema';

export interface SchemaMigration {
  readonly version: number;
  readonly name: string;
  /** Apply this schema change using the supplied database connection. */
  up(database: Database.Database): void;
}

export class SqliteMigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SqliteMigrationError';
  }
}

/** Initial, canonical relational schema defined in Phase 003. */
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    name: 'initial-core-schema',
    up: initializeCoreSchema,
  },
];

const CREATE_MIGRATION_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

/**
 * Apply pending migrations in ascending version order and return the current
 * schema version. Ledger writes and all pending schema changes share one
 * transaction, so a failed migration advances neither schema nor ledger.
 */
export function applyMigrations(
  database: Database.Database,
  migrations: readonly SchemaMigration[] = SCHEMA_MIGRATIONS,
): number {
  validateMigrations(migrations);

  try {
    database.pragma('foreign_keys = ON');
    return database.transaction(() => {
      database.exec(CREATE_MIGRATION_LEDGER_SQL);
      const applied = database.prepare(
        'SELECT version, name FROM schema_migrations ORDER BY version',
      ).all() as Array<{ version: number; name: string }>;

      if (applied.length > migrations.length) {
        throw new SqliteMigrationError(
          `Database has ${applied.length} migration records but only ${migrations.length} migrations are available.`,
        );
      }

      for (let index = 0; index < applied.length; index += 1) {
        const record = applied[index];
        const migration = migrations[index];
        if (record.version !== migration.version || record.name !== migration.name) {
          throw new SqliteMigrationError(
            `Migration history mismatch at version ${migration.version}.`,
          );
        }
      }

      const insertMigration = database.prepare(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      );
      for (const migration of migrations.slice(applied.length)) {
        migration.up(database);
        insertMigration.run(migration.version, migration.name);
      }

      return migrations.at(-1)?.version ?? 0;
    })();
  } catch (cause) {
    if (cause instanceof SqliteMigrationError) throw cause;
    throw new SqliteMigrationError('Failed to apply SQLite schema migrations.', { cause });
  }
}

function validateMigrations(migrations: readonly SchemaMigration[]): void {
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      throw new SqliteMigrationError(
        `Migration versions must be contiguous and start at 1; expected ${expectedVersion}, got ${migration.version}.`,
      );
    }
    if (!migration.name.trim()) {
      throw new SqliteMigrationError(`Migration ${migration.version} must have a name.`);
    }
  }
}
