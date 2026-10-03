import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseBackupService, OrganizationRepository, SqliteConnection, applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage';

describe('Phase 067 — consistent data export, backup, and verified restore', () => {
    const currentSchemaVersion = SCHEMA_MIGRATIONS.at(-1).version;
    let directory; let connection; let service; let sourcePath;
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'headroom-067-'));
    });
    afterEach(async () => {
        if (connection?.isOpen) connection.close();
        await rm(directory, { recursive: true, force: true });
    });
    async function prepare() {
        const root = directory;
        sourcePath = join(root, 'headroom.sqlite');
        connection = new SqliteConnection();
        const database = connection.open(sourcePath);
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-067', name: 'HEADROOM' });
        database.prepare('INSERT INTO audit_logs (id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
            .run('audit-067', 'BACKUP_FIXTURE', 'organization', 'organization-067', JSON.stringify({ safe: true }));
        service = createDatabaseBackupService({ connection });
        return root;
    }
    it('backs up a consistent migrated database, checks integrity, and restores every table row', async () => {
        const root = await prepare();
        const backupPath = join(root, 'backup.sqlite');
        const backup = await service.backup(backupPath);
        expect(backup).toMatchObject({ integrity: 'ok', foreignKeyViolations: 0, schemaVersion: currentSchemaVersion });
        expect(backup.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect((await service.verify(backupPath)).tableRows).toEqual(backup.tableRows);
        const restorePath = join(root, 'restored.sqlite');
        const restored = await service.restore(backupPath, restorePath);
        expect(restored).toMatchObject({ integrity: 'ok', schemaVersion: currentSchemaVersion, tableRows: backup.tableRows });
        const restoredConnection = new SqliteConnection();
        try {
            const restoredDb = restoredConnection.open(restorePath);
            expect(new OrganizationRepository(restoredDb).getById('organization-067').name).toBe('HEADROOM');
            expect(restoredDb.prepare('SELECT action FROM audit_logs WHERE id = ?').get('audit-067').action).toBe('BACKUP_FIXTURE');
        }
        finally { restoredConnection.close(); }
        await expect(service.backup(backupPath)).rejects.toMatchObject({ code: 'database-destination-exists' });
    });
    it('exports structured data and rejects corrupt or invalid backup sources', async () => {
        const root = await prepare();
        const exportPath = join(root, 'export.json');
        const exported = await service.exportJson(exportPath);
        const data = JSON.parse(await readFile(exportPath, 'utf8'));
        expect(data).toMatchObject({ format: 'HEADROOM_SQLITE_JSON_V1', schemaVersion: currentSchemaVersion });
        expect(data.tables.organizations).toContainEqual(expect.objectContaining({ id: 'organization-067', name: 'HEADROOM' }));
        expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/);
        const corruptPath = join(root, 'corrupt.sqlite');
        await writeFile(corruptPath, 'not a sqlite database');
        await expect(service.verify(corruptPath)).rejects.toMatchObject({ code: 'database-integrity-failed' });
        await expect(service.restore(corruptPath, join(root, 'should-not-exist.sqlite')))
            .rejects.toMatchObject({ code: 'database-integrity-failed' });
        await expect(readFile(join(root, 'should-not-exist.sqlite'))).rejects.toBeDefined();
    });
});
