const MAX_REPORTED_VIOLATIONS = 100;

/** Inspect SQLite and migration metadata without mutating or repairing the database. */
export function diagnoseDatabaseIntegrity(database) {
    if (!database || typeof database.pragma !== 'function' || typeof database.prepare !== 'function') {
        throw new TypeError('Database diagnostics require an open SQLite handle.');
    }
    const issues = [];
    let integrity;
    let foreignKeys;
    let schemaVersion = null;
    try {
        integrity = database.pragma('integrity_check').map((row) => row.integrity_check);
        if (integrity.length !== 1 || integrity[0] !== 'ok') {
            issues.push({ code: 'sqlite-integrity-failed', message: 'SQLite integrity_check reported one or more problems.', details: integrity.slice(0, MAX_REPORTED_VIOLATIONS) });
        }
        foreignKeys = database.pragma('foreign_key_check').slice(0, MAX_REPORTED_VIOLATIONS).map((row) => ({
            table: row.table, rowId: row.rowid, parent: row.parent, constraint: row.fk,
        }));
        if (foreignKeys.length) {
            issues.push({ code: 'foreign-key-violations', message: 'Rows reference missing parent records.', details: foreignKeys });
        }
        const hasMigrations = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
        if (!hasMigrations) {
            issues.push({ code: 'migration-ledger-missing', message: 'The schema migration ledger is missing.' });
        } else {
            const migrations = database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
            schemaVersion = migrations.at(-1)?.version ?? 0;
            for (let index = 0; index < migrations.length; index += 1) {
                if (migrations[index].version !== index + 1 || typeof migrations[index].name !== 'string' || !migrations[index].name) {
                    issues.push({ code: 'migration-ledger-invalid', message: 'The migration ledger has a gap or malformed entry.', details: { index, version: migrations[index].version } });
                    break;
                }
            }
        }
        return Object.freeze({ status: issues.length ? 'DEGRADED' : 'HEALTHY', repaired: false,
            integrity: integrity?.[0] === 'ok' && integrity.length === 1 ? 'ok' : 'failed',
            foreignKeyViolations: foreignKeys?.length ?? null, schemaVersion,
            issues: Object.freeze(issues.map((issue) => Object.freeze(issue))) });
    } catch {
        return Object.freeze({ status: 'UNAVAILABLE', repaired: false, integrity: 'unavailable',
            foreignKeyViolations: null, schemaVersion, issues: Object.freeze([
                Object.freeze({ code: 'database-diagnostics-failed', message: 'SQLite checks could not be completed; no repair was attempted.' }),
            ]) });
    }
}
