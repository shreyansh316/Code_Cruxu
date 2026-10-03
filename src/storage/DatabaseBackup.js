import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { lstat, open, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DomainInvariantError } from '../domain/errors';

const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

/** Consistent SQLite backup, portable JSON export, and verified restore operations. */
export function createDatabaseBackupService({ connection } = {}) {
    if (typeof connection?.database?.backup !== 'function' || typeof connection.databasePath !== 'string') {
        throw new TypeError('Database backup requires an open HEADROOM SQLite connection.');
    }
    return Object.freeze({
        backup: async (destination) => {
            const output = await reserveNewDestination(destination, connection.databasePath);
            try {
                await connection.database.backup(output);
                const verified = verifyDatabase(output);
                return Object.freeze({ path: output, sha256: await hashFile(output), ...verified });
            }
            catch {
                await rm(output, { force: true });
                throw new DomainInvariantError('database-backup-failed', 'SQLite backup could not be created and integrity-verified.');
            }
        },
        exportJson: async (destination) => {
            const output = await reserveNewDestination(destination, connection.databasePath);
            try {
                const payload = exportDatabase(connection.database);
                const serialized = JSON.stringify(payload);
                if (Buffer.byteLength(serialized, 'utf8') > MAX_EXPORT_BYTES) {
                    throw new DomainInvariantError('database-export-limit', 'Database export exceeds the configured byte limit.');
                }
                await writeFile(output, serialized, { encoding: 'utf8', flag: 'w' });
                return Object.freeze({ path: output, sha256: createHash('sha256').update(serialized).digest('hex'),
                    schemaVersion: payload.schemaVersion, tableCount: Object.keys(payload.tables).length,
                    rowCount: Object.values(payload.tables).reduce((count, rows) => count + rows.length, 0),
                    sizeBytes: Buffer.byteLength(serialized, 'utf8') });
            }
            catch (error) {
                await rm(output, { force: true });
                if (error instanceof DomainInvariantError) throw error;
                throw new DomainInvariantError('database-export-failed', 'SQLite data export could not be created.');
            }
        },
        verify: async (backupPath) => {
            const path = resolvePath(backupPath);
            const verified = verifyDatabase(path);
            return Object.freeze({ path, sha256: await hashFile(path), ...verified });
        },
        restore: async (backupPath, destination) => {
            const source = resolvePath(backupPath);
            const sourceReport = verifyDatabase(source);
            const output = await reserveNewDestination(destination, connection.databasePath);
            try {
                const backup = new Database(source, { readonly: true, fileMustExist: true });
                try { await backup.backup(output); }
                finally { backup.close(); }
                const restored = verifyDatabase(output);
                if (JSON.stringify(sourceReport.tableRows) !== JSON.stringify(restored.tableRows)
                    || sourceReport.schemaVersion !== restored.schemaVersion) {
                    throw new DomainInvariantError('database-restore-mismatch', 'Restored database does not match the verified backup.');
                }
                return Object.freeze({ path: output, sha256: await hashFile(output), ...restored });
            }
            catch (error) {
                await rm(output, { force: true });
                if (error instanceof DomainInvariantError) throw error;
                throw new DomainInvariantError('database-restore-failed', 'SQLite backup could not be restored and verified.');
            }
        },
    });
}

function verifyDatabase(path) {
    let database;
    try {
        database = new Database(path, { readonly: true, fileMustExist: true });
        const integrity = database.pragma('integrity_check');
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
            throw new DomainInvariantError('database-integrity-failed', 'SQLite integrity check reported corruption.');
        }
        const foreignKeys = database.pragma('foreign_key_check');
        if (foreignKeys.length !== 0) throw new DomainInvariantError('database-foreign-key-failed', 'SQLite backup contains foreign-key violations.');
        const tableRows = getTableRows(database);
        return Object.freeze({ integrity: 'ok', foreignKeyViolations: 0,
            schemaVersion: readSchemaVersion(database), tableCount: Object.keys(tableRows).length,
            rowCount: Object.values(tableRows).reduce((count, rows) => count + rows, 0), tableRows: Object.freeze(tableRows) });
    }
    catch (error) {
        if (error instanceof DomainInvariantError) throw error;
        throw new DomainInvariantError('database-integrity-failed', 'SQLite backup could not be opened or checked.');
    }
    finally { database?.close(); }
}

function exportDatabase(database) {
    const transaction = database.transaction(() => {
        const tables = {};
        const names = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
        let estimatedBytes = 0;
        for (const { name } of names) {
            const rows = [];
            const statement = database.prepare(`SELECT * FROM ${quoteIdentifier(name)}`);
            for (const row of statement.iterate()) {
                rows.push(row);
                estimatedBytes += Buffer.byteLength(JSON.stringify(row), 'utf8');
                if (estimatedBytes > MAX_EXPORT_BYTES) throw new DomainInvariantError('database-export-limit', 'Database export exceeds the configured byte limit.');
            }
            tables[name] = rows;
        }
        return { format: 'HEADROOM_SQLITE_JSON_V1', schemaVersion: readSchemaVersion(database), tables };
    });
    return transaction.deferred();
}

function getTableRows(database) {
    const output = {};
    const names = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    for (const { name } of names) output[name] = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get().count;
    return output;
}
function readSchemaVersion(database) {
    const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!exists) return null;
    return database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version ?? 0;
}
function quoteIdentifier(identifier) { return `"${identifier.replaceAll('"', '""')}"`; }
async function reserveNewDestination(destination, source) {
    const output = resolvePath(destination);
    if (output === source) throw new DomainInvariantError('database-backup-path-conflict', 'Backup destination must differ from the live database.');
    try { await lstat(output); throw new DomainInvariantError('database-destination-exists', 'Backup and restore operations never overwrite an existing destination.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const reservation = await open(output, 'wx');
    await reservation.close();
    return output;
}
function resolvePath(value) {
    if (typeof value !== 'string' || !value.trim() || value === ':memory:') {
        throw new DomainInvariantError('invalid-database-path', 'A filesystem database path is required.');
    }
    return resolve(value);
}
async function hashFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
