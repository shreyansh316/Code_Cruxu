import { afterEach, describe, expect, it } from 'vitest';
import { classifyStoredData, createMemoryPrivacyControls, redactSensitiveText } from '../src/application/privacyControls';
import { createSqliteUnitOfWork } from '../src/infrastructure/SqliteUnitOfWork';
import { AuditLogRepository, MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 076 — local data privacy controls', () => {
    let connection;
    afterEach(() => connection?.close());
    function setup(auditRepository) {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-076', name: 'Private' });
        const memories = new MemoryRepository(database);
        memories.create({ id: 'memory-076', scope: 'CEO', category: 'note', title: 'Design', content: 'Private details',
            organizationId: 'org-076', importance: 1 });
        const audits = auditRepository ?? new AuditLogRepository(database);
        let id = 0;
        return { database, memories, audits, controls: createMemoryPrivacyControls({ memoryRepository: memories,
            auditRepository: audits, unitOfWork: createSqliteUnitOfWork(database), actorId: 'actor-076', idFactory: () => `privacy-audit-${++id}` }) };
    }

    it('classifies values and redacts credentials and personal contact details with a byte limit', () => {
        expect(classifyStoredData('apiCredential')).toBe('SECRET');
        expect(classifyStoredData('content')).toBe('SENSITIVE');
        expect(classifyStoredData('status')).toBe('INTERNAL');
        const redacted = redactSensitiveText('Authorization: Bearer abc.def; api_key=sk-proj-12345678901234567890; contact me@example.com');
        expect(redacted).not.toMatch(/abc\.def|sk-proj-|me@example\.com/);
        expect(redacted).toContain('[REDACTED]');
        expect(() => redactSensitiveText('x'.repeat(128 * 1024 + 1))).toThrow(/at most/);
    });

    it('exports/deletes only the exact owner memory and audits metadata without content', () => {
        const { controls, database } = setup();
        expect(controls.exportMemory({ scope: 'CEO', ownerId: 'org-other', memoryId: 'memory-076' })).toBeUndefined();
        expect(database.prepare('SELECT count(*) AS count FROM audit_logs').get().count).toBe(0);
        const exported = controls.exportMemory({ scope: 'CEO', ownerId: 'org-076', memoryId: 'memory-076' });
        expect(exported.content).toBe('Private details');
        expect(controls.deleteMemory({ scope: 'CEO', ownerId: 'org-other', memoryId: 'memory-076' })).toBe(false);
        expect(controls.deleteMemory({ scope: 'CEO', ownerId: 'org-076', memoryId: 'memory-076' })).toBe(true);
        expect(controls.deleteMemory({ scope: 'CEO', ownerId: 'org-076', memoryId: 'memory-076' })).toBe(false);
        const audit = database.prepare('SELECT action, details FROM audit_logs ORDER BY rowid').all();
        expect(audit.map(({ action }) => action)).toEqual(['MEMORY_EXPORTED_FOR_PRIVACY', 'MEMORY_DELETED_FOR_PRIVACY']);
        expect(JSON.stringify(audit)).not.toContain('Private details');
        expect(database.prepare("SELECT count(*) AS count FROM memories WHERE id = 'memory-076'").get().count).toBe(0);
    });

    it('rolls back deletion when its audit record cannot be persisted', () => {
        const { database, memories } = setup({ append() { throw new Error('audit unavailable'); } });
        const controls = createMemoryPrivacyControls({ memoryRepository: memories,
            auditRepository: { append() { throw new Error('audit unavailable'); } },
            unitOfWork: createSqliteUnitOfWork(database), actorId: 'actor-076', idFactory: () => 'audit-rollback' });
        expect(() => controls.deleteMemory({ scope: 'CEO', ownerId: 'org-076', memoryId: 'memory-076' })).toThrow(/audit unavailable/);
        expect(memories.getByOwner('CEO', 'org-076', 'memory-076')).toBeDefined();
    });
});
