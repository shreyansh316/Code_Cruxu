/**
 * HEADROOM — SQLite Compatibility Verification
 * Phase 002: Native module check
 *
 * This module verifies that better-sqlite3 can:
 * 1. Be imported (native .node binary loads correctly)
 * 2. Open a database (file or in-memory)
 * 3. Execute DDL (CREATE TABLE)
 * 4. Execute DML (INSERT, SELECT)
 * 5. Close the database cleanly
 *
 * Used both as a service utility and as the basis for the
 * Phase 002 compatibility test suite.
 *
 * SAFETY:
 * - Unit tests always use ':memory:' — no files created.
 * - File-based tests use a temp path and clean up on close.
 * - This module never opens production database paths.
 */
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';

export interface CompatibilityResult {
  success: boolean;
  version?: string;
  error?: string;
  details: string[];
}

/**
 * Run a full SQLite compatibility check.
 *
 * @param dbPath - ':memory:' for in-memory, or an absolute path for file-based.
 *                 File-based paths are deleted on completion if cleanUp=true.
 * @param cleanUp - If true and dbPath is a file, delete it after the check.
 */
export function runCompatibilityCheck(
  dbPath: string = ':memory:',
  cleanUp: boolean = true,
): CompatibilityResult {
  const details: string[] = [];
  let db: Database.Database | undefined;

  try {
    // Step 1: Import and open
    db = new Database(dbPath);
    details.push('OPEN: ok');

    // Step 2: Read SQLite version
    const versionRow = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
    const version = versionRow.v;
    details.push(`VERSION: ${version}`);

    // Step 3: CREATE TABLE
    db.exec(`
      CREATE TABLE IF NOT EXISTS headroom_compat_check (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        key   TEXT    NOT NULL UNIQUE,
        value TEXT    NOT NULL
      )
    `);
    details.push('CREATE TABLE: ok');

    // Step 4: INSERT
    const insert = db.prepare(
      'INSERT OR REPLACE INTO headroom_compat_check (key, value) VALUES (?, ?)',
    );
    insert.run('phase', '002');
    insert.run('status', 'verified');
    details.push('INSERT: ok');

    // Step 5: SELECT and verify
    const rows = db
      .prepare('SELECT key, value FROM headroom_compat_check ORDER BY key')
      .all() as { key: string; value: string }[];

    if (rows.length !== 2) {
      throw new Error(`Expected 2 rows, got ${rows.length}`);
    }
    const phaseRow = rows.find(r => r.key === 'phase');
    const statusRow = rows.find(r => r.key === 'status');
    if (phaseRow?.value !== '002' || statusRow?.value !== 'verified') {
      throw new Error('SELECT verification failed: unexpected row values');
    }
    details.push(`SELECT: ok (${rows.length} rows verified)`);

    // Step 6: DROP the test table (clean internal state)
    db.exec('DROP TABLE headroom_compat_check');
    details.push('DROP TABLE: ok');

    // Step 7: Close
    db.close();
    db = undefined;
    details.push('CLOSE: ok');

    // Step 8: File cleanup if applicable
    if (cleanUp && dbPath !== ':memory:' && existsSync(dbPath)) {
      unlinkSync(dbPath);
      details.push('FILE CLEANUP: ok');
    }

    return { success: true, version, details };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    details.push(`ERROR: ${error}`);

    // Always attempt to close on failure
    try { db?.close(); } catch { /* ignore secondary failure */ }

    // Attempt cleanup on failure too
    if (cleanUp && dbPath !== ':memory:' && existsSync(dbPath)) {
      try { unlinkSync(dbPath); } catch { /* ignore */ }
    }

    return { success: false, error, details };
  }
}

/**
 * Quick check: can better-sqlite3 be imported at all?
 * Returns the module reference or throws.
 */
export function requireSQLite(): typeof Database {
  return Database;
}
