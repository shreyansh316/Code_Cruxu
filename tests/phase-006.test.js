/** Phase 006 — SQLite connection ownership and lifecycle. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { SqliteConnection, SqliteConnectionError } from '../src/storage';
import { HeadroomContext } from '../src/core/HeadroomContext';
const temporaryDirectories = [];
function makeTempDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'headroom-phase006-'));
    temporaryDirectories.push(directory);
    return directory;
}
function makeExtensionContext(storagePath) {
    return {
        subscriptions: [],
        globalState: { get: () => true, update: vi.fn().mockResolvedValue(undefined) },
        globalStorageUri: { fsPath: storagePath },
    };
}
function configureVscodeMocks() {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: () => undefined,
    });
    vi.mocked(vscode.commands.registerCommand).mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
        name: '', text: '', tooltip: '', command: '',
        show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
    });
    vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
}
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});
describe('Phase 006 — SQLite connection lifecycle', () => {
    it('opens one in-memory connection with foreign keys enabled and closes idempotently', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        expect(connection.isOpen).toBe(true);
        expect(connection.database).toBe(database);
        expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
        expect(connection.open(':memory:')).toBe(database);
        expect(() => connection.open(join(tmpdir(), 'other-headroom.db'))).toThrow(/different database path/);
        connection.close();
        connection.close();
        expect(connection.isOpen).toBe(false);
        expect(connection.databasePath).toBeUndefined();
        expect(() => connection.database).toThrow('SQLite database is not open.');
    });
    it('creates the parent directory and preserves file database contents across reopen', () => {
        const directory = makeTempDirectory();
        const databasePath = join(directory, 'nested', 'headroom.sqlite');
        const firstConnection = new SqliteConnection();
        const database = firstConnection.open(databasePath);
        expect(existsSync(databasePath)).toBe(true);
        expect(firstConnection.databasePath).toBe(databasePath);
        database.exec('CREATE TABLE lifecycle_check (value TEXT NOT NULL)');
        database.prepare('INSERT INTO lifecycle_check (value) VALUES (?)').run('persisted');
        firstConnection.close();
        const secondConnection = new SqliteConnection();
        expect(secondConnection.open(databasePath)
            .prepare('SELECT value FROM lifecycle_check').get()).toEqual({ value: 'persisted' });
        secondConnection.close();
    });
    it('surfaces open failures and leaves no active connection', () => {
        const directory = makeTempDirectory();
        const pathOccupiedByFile = join(directory, 'not-a-directory');
        writeFileSync(pathOccupiedByFile, 'fixture');
        const connection = new SqliteConnection();
        expect(() => connection.open(join(pathOccupiedByFile, 'headroom.sqlite')))
            .toThrowError(SqliteConnectionError);
        expect(connection.isOpen).toBe(false);
    });
    it('opens the global-storage database during activation and closes it on dispose', async () => {
        configureVscodeMocks();
        const directory = makeTempDirectory();
        const context = new HeadroomContext(makeExtensionContext(directory));
        const expectedPath = join(directory, 'headroom.sqlite');
        await context.initialize();
        expect(context.databaseConnection.isOpen).toBe(true);
        expect(context.databaseConnection.databasePath).toBe(expectedPath);
        expect(context.databaseConnection.database.pragma('foreign_keys', { simple: true })).toBe(1);
        expect(existsSync(expectedPath)).toBe(true);
        context.dispose();
        expect(context.databaseConnection.isOpen).toBe(false);
        context.dispose();
    });
    it('closes the connection and registered resources when initialization fails after open', async () => {
        configureVscodeMocks();
        vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => {
            throw new Error('configuration read failed');
        });
        const directory = makeTempDirectory();
        const context = new HeadroomContext(makeExtensionContext(directory));
        await expect(context.initialize()).rejects.toThrow('configuration read failed');
        expect(context.databaseConnection.isOpen).toBe(false);
        expect(context.isInitialized).toBe(false);
    });
    it('surfaces a failure to create the global-storage database to the caller', async () => {
        configureVscodeMocks();
        const directory = makeTempDirectory();
        const pathOccupiedByFile = join(directory, 'not-a-directory');
        writeFileSync(pathOccupiedByFile, 'fixture');
        const context = new HeadroomContext(makeExtensionContext(pathOccupiedByFile));
        await expect(context.initialize()).rejects.toMatchObject({
            name: 'SqliteConnectionError',
            operation: 'open',
        });
        expect(context.databaseConnection.isOpen).toBe(false);
        expect(context.isInitialized).toBe(false);
    });
});
