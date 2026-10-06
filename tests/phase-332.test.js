/** Phase 332 — privacy invalidation and audit attribution commit atomically. */
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryPrivacyControls } from '../src/application/privacyControls';
import { createSqliteUnitOfWork } from '../src/infrastructure/SqliteUnitOfWork';
import { AuditLogRepository, MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

const NOW = '2026-10-06T00:00:00.000Z';

describe('Phase 332 — audited privacy invalidation', () => {
    let connection;
    afterEach(() => connection?.close());

    function setup(auditRepository) {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-332', name: 'Private' });
        const memories = new MemoryRepository(database);
        memories.create({ id: 'memory-332', scope: 'CEO', organizationId: 'org-332', title: 'Private', content: 'Sensitive text' });
        let id = 0;
        const audits = auditRepository ?? new AuditLogRepository(database);
        const controls = createMemoryPrivacyControls({ memoryRepository: memories, auditRepository: audits,
            unitOfWork: createSqliteUnitOfWork(database), actorId: 'actor-332', idFactory: () => `audit-332-${++id}`, now: () => NOW });
        return { database, memories, controls };
    }

    it('invalidates only the requested owner record and audits no memory content', () => {
        const { controls, database, memories } = setup();
        expect(controls.invalidateMemory({ scope: 'CEO', ownerId: 'org-other', memoryId: 'memory-332' })).toBe(false);
        expect(controls.invalidateMemory({ scope: 'CEO', ownerId: 'org-332', memoryId: 'memory-332' })).toBe(true);
        expect(controls.invalidateMemory({ scope: 'CEO', ownerId: 'org-332', memoryId: 'memory-332' })).toBe(false);
        expect(memories.getById('memory-332')).toBeUndefined();
        const audit = database.prepare('SELECT action, details FROM audit_logs').get();
        expect(audit.action).toBe('MEMORY_INVALIDATED_FOR_PRIVACY');
        expect(JSON.parse(audit.details)).toEqual({ scope: 'CEO' });
        expect(JSON.stringify(audit)).not.toContain('Sensitive text');
    });

    it('rolls back invalidation when audit persistence fails', () => {
        const { database, memories } = setup();
        const controls = createMemoryPrivacyControls({ memoryRepository: memories,
            auditRepository: { append() { throw new Error('audit unavailable'); } },
            unitOfWork: createSqliteUnitOfWork(database), actorId: 'actor-332', idFactory: () => 'audit-rollback-332', now: () => NOW });
        expect(() => controls.invalidateMemory({ scope: 'CEO', ownerId: 'org-332', memoryId: 'memory-332' }))
            .toThrow(/audit unavailable/);
        expect(memories.getById('memory-332')).toBeDefined();
    });
});
