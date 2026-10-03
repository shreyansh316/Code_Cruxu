/** Phase 007 — versioned SQLite schema migrations. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { applyMigrations, SCHEMA_MIGRATIONS, SqliteMigrationError, } from '../src/storage/migrations';
const connections = [];
const contexts = [];
const temporaryDirectories = [];
const latestVersion = SCHEMA_MIGRATIONS.at(-1).version;
const expectedMigrationVersions = SCHEMA_MIGRATIONS.map(({ version }) => ({ version }));
function makeConnection() {
    const connection = new SqliteConnection();
    connections.push(connection);
    connection.open(':memory:');
    return connection;
}
afterEach(() => {
    for (const context of contexts.splice(0))
        context.dispose();
    for (const connection of connections.splice(0))
        connection.close();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});
describe('Phase 007 — versioned SQLite schema migrations', () => {
    it('applies the current schema and records each versioned migration on a fresh database', () => {
        const database = makeConnection().database;
        expect(applyMigrations(database)).toBe(latestVersion);
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'organizations'").get()).toEqual({ name: 'organizations' });
        expect(database.prepare('SELECT version, name FROM schema_migrations').all()).toEqual([
            { version: 1, name: 'initial-core-schema' },
            { version: 2, name: 'durable-event-delivery' },
            { version: 3, name: 'memory-scope-ownership' },
            ...SCHEMA_MIGRATIONS.slice(3).map(({ version, name }) => ({ version, name })),
        ]);
        expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    });
    it('does not reapply an already-recorded migration or disturb existing data', () => {
        const database = makeConnection().database;
        expect(applyMigrations(database)).toBe(latestVersion);
        database.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-1', 'Example');
        expect(applyMigrations(database)).toBe(latestVersion);
        expect(database.prepare('SELECT id, name FROM organizations').all()).toEqual([
            { id: 'org-1', name: 'Example' },
        ]);
        expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual(expectedMigrationVersions);
    });
    it('recognizes the applied version after reopening a file database', () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase007-file-'));
        temporaryDirectories.push(directory);
        const databasePath = join(directory, 'headroom.sqlite');
        const firstConnection = new SqliteConnection();
        connections.push(firstConnection);
        const firstDatabase = firstConnection.open(databasePath);
        expect(applyMigrations(firstDatabase)).toBe(latestVersion);
        firstDatabase.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-1', 'Persistent');
        firstConnection.close();
        const reopenedConnection = new SqliteConnection();
        connections.push(reopenedConnection);
        const reopenedDatabase = reopenedConnection.open(databasePath);
        expect(applyMigrations(reopenedDatabase)).toBe(latestVersion);
        expect(reopenedDatabase.prepare('SELECT name FROM organizations WHERE id = ?').get('org-1'))
            .toEqual({ name: 'Persistent' });
        expect(reopenedDatabase.prepare('SELECT version FROM schema_migrations').all()).toEqual(expectedMigrationVersions);
    });
    it('applies pending migrations in order and reaches the latest version', () => {
        const database = makeConnection().database;
        const migrations = [
            ...SCHEMA_MIGRATIONS,
            {
                version: latestVersion + 1,
                name: 'add-migration-check',
                up: (db) => db.exec('CREATE TABLE migration_check (id INTEGER PRIMARY KEY)'),
            },
        ];
        expect(applyMigrations(database, migrations)).toBe(latestVersion + 1);
        expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
            .toEqual([...expectedMigrationVersions, { version: latestVersion + 1 }]);
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_check'").get()).toEqual({ name: 'migration_check' });
    });
    it('rolls back schema changes and ledger records when any pending migration fails', () => {
        const database = makeConnection().database;
        const brokenMigrations = [
            {
                version: 1,
                name: 'first-change',
                up: (db) => db.exec('CREATE TABLE should_rollback (id INTEGER PRIMARY KEY)'),
            },
            {
                version: 2,
                name: 'broken-change',
                up: (db) => db.exec('CREATE TABL invalid_syntax (id INTEGER)'),
            },
        ];
        expect(() => applyMigrations(database, brokenMigrations)).toThrowError(SqliteMigrationError);
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('should_rollback', 'schema_migrations')").all()).toEqual([]);
    });
    it('rejects a non-contiguous migration sequence before changing the database', () => {
        const database = makeConnection().database;
        expect(() => applyMigrations(database, [{
                version: 2,
                name: 'skipped-version',
                up: () => undefined,
            }])).toThrow(/contiguous and start at 1/);
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").all()).toEqual([]);
    });
    it('applies migrations to the existing global-storage connection during extension initialization', async () => {
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: () => undefined,
        });
        vi.mocked(vscode.commands.registerCommand).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
            name: '', text: '', tooltip: '', command: '',
            show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
        });
        const storagePath = mkdtempSync(join(tmpdir(), 'headroom-phase007-'));
        temporaryDirectories.push(storagePath);
        const extensionContext = {
            subscriptions: [],
            globalState: { get: () => true, update: vi.fn().mockResolvedValue(undefined) },
            globalStorageUri: { fsPath: storagePath },
        };
        const context = new HeadroomContext(extensionContext);
        contexts.push(context);
        await context.initialize();
        expect(context.databaseConnection.databasePath).toBe(join(storagePath, 'headroom.sqlite'));
        expect(context.databaseConnection.database.prepare('SELECT version FROM schema_migrations').all()).toEqual(expectedMigrationVersions);
        expect(existsSync(join(storagePath, 'headroom.sqlite'))).toBe(true);
        context.dispose();
    });
});
