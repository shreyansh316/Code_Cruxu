/** Phase 028 — append-only audit persistence. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogRepository, applyMigrations, SCHEMA_MIGRATIONS, SqliteConnection } from '../src/storage';

describe('Phase 028 — audit log repository', () => {
    let connection;
    let database;
    let audits;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        audits = new AuditLogRepository(database);
    });
    afterEach(() => connection.close());

    const record = (id, overrides = {}) => ({
        id, action: 'TASK_STATUS_CHANGED', entity: 'task', entityId: 'task-1',
        actorId: null, taskId: 'task-1', details: { from: 'IN_PROGRESS', to: 'COMPLETED' }, ...overrides,
    });

    it('appends and queries actor, entity, time, task, and structured context', () => {
        const first = audits.append(record('audit-1', { actorId: 'agent-1' }));
        audits.append(record('audit-2', { entity: 'objective', entityId: 'objective-1', taskId: null }));
        expect(first).toMatchObject({ id: 'audit-1', actorId: 'agent-1', entity: 'task',
            entityId: 'task-1', taskId: 'task-1', details: { from: 'IN_PROGRESS', to: 'COMPLETED' } });
        expect(first.createdAt).toEqual(expect.any(String));
        expect(audits.getById('audit-1')).toEqual(first);
        expect(audits.listByEntity('task', 'task-1')).toHaveLength(1);
        expect(audits.listByTask('task-1')).toHaveLength(1);
        expect(audits.listByEntity("task' OR 1=1 --", 'task-1')).toEqual([]);
    });

    it('enforces append-only records at SQLite and exposes no mutation methods', () => {
        audits.append(record('audit-immutable'));
        expect(audits.update).toBeUndefined();
        expect(audits.delete).toBeUndefined();
        expect(() => database.prepare('UPDATE audit_logs SET action = ? WHERE id = ?')
            .run('FORGED', 'audit-immutable')).toThrow(/append-only/);
        expect(() => database.prepare('DELETE FROM audit_logs WHERE id = ?').run('audit-immutable'))
            .toThrow(/append-only/);
        expect(audits.getById('audit-immutable').action).toBe('TASK_STATUS_CHANGED');
    });

    it('preserves existing audit data while removing mutable foreign-key behavior in the migration', () => {
        const legacyConnection = new SqliteConnection();
        const legacyDatabase = legacyConnection.open(':memory:');
        try {
            applyMigrations(legacyDatabase, SCHEMA_MIGRATIONS.slice(0, 3));
            legacyDatabase.prepare(`INSERT INTO audit_logs (id, action, entity, entity_id, details)
              VALUES (?, ?, ?, ?, ?)`)
                .run('legacy-audit', 'OBJECTIVE_CREATED', 'objective', 'objective-legacy', '{"source":"legacy"}');
            applyMigrations(legacyDatabase);
            const legacyRepository = new AuditLogRepository(legacyDatabase);
            expect(legacyRepository.getById('legacy-audit')).toMatchObject({
                id: 'legacy-audit', action: 'OBJECTIVE_CREATED', entityId: 'objective-legacy', details: { source: 'legacy' },
            });
            expect(legacyDatabase.pragma('foreign_key_check')).toEqual([]);
        }
        finally {
            legacyConnection.close();
        }
    });

    it('validates required values and bounds query limits', () => {
        expect(() => audits.append(record('bad', { action: '  ' }))).toThrow();
        const cyclic = {};
        cyclic.self = cyclic;
        expect(() => audits.append(record('bad-details', { details: cyclic }))).toThrow();
        expect(() => audits.listByTask('task-1', { limit: 1001 })).toThrow(/limit/);
    });
});
