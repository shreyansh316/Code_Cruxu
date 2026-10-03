/**
 * HEADROOM — SQLite connection lifecycle
 *
 * Owns at most one better-sqlite3 handle. Database schema application and
 * migrations are intentionally handled by later storage phases.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
export class SqliteConnectionError extends Error {
    operation;
    constructor(operation, cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to ${operation} SQLite database: ${reason}`, { cause });
        this.name = 'SqliteConnectionError';
        this.operation = operation;
    }
}
export class SqliteConnection {
    _database;
    _databasePath;
    /** Open the path once, creating its parent directory for file databases. */
    open(databasePath) {
        const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath);
        if (this._database?.open) {
            if (this._databasePath !== resolvedPath) {
                throw new Error('SQLite connection is already open for a different database path.');
            }
            this._database.pragma('foreign_keys = ON');
            return this._database;
        }
        this._database = undefined;
        this._databasePath = undefined;
        let database;
        try {
            if (resolvedPath !== ':memory:') {
                mkdirSync(dirname(resolvedPath), { recursive: true });
            }
            database = new Database(resolvedPath);
            database.pragma('foreign_keys = ON');
            this._database = database;
            this._databasePath = resolvedPath;
            return database;
        }
        catch (cause) {
            try {
                if (database?.open)
                    database.close();
            }
            catch (closeError) {
                console.error('[HEADROOM] Failed to close SQLite after an open failure:', closeError);
            }
            throw new SqliteConnectionError('open', cause);
        }
    }
    /** Return the active handle, or fail explicitly if the connection is closed. */
    get database() {
        if (!this._database?.open) {
            throw new Error('SQLite database is not open.');
        }
        return this._database;
    }
    get isOpen() {
        return this._database?.open === true;
    }
    get databasePath() {
        return this.isOpen ? this._databasePath : undefined;
    }
    /** Close the owned handle; repeated calls after a successful close are safe. */
    close() {
        const database = this._database;
        if (!database || !database.open) {
            this._database = undefined;
            this._databasePath = undefined;
            return;
        }
        try {
            database.close();
            this._database = undefined;
            this._databasePath = undefined;
        }
        catch (cause) {
            // Keep the handle so callers can inspect it or retry cleanup.
            throw new SqliteConnectionError('close', cause);
        }
    }
}
