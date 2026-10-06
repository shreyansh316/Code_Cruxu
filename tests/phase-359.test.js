/** Phase 359 — independent memory verification is attributed and transactional. */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryVerificationUseCase } from '../src/application';
import { AgentRepository, AuditLogRepository, MemoryRepository, OrganizationRepository, TaskRepository,
    SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

describe('Phase 359 — memory verification', () => {
    it('requires an authorized independent reviewer and persists immutable attribution with an audit event', async () => {
        const memory = { id: 'memory-359', scope: 'TASK', taskId: 'task-359', sourceKind: 'USER_NOTE',
            sourceReference: 'memory-note:memory-359', verified: 0 };
        const audit = [];
        const memoryRepository = { getById: () => memory, update: vi.fn((id, changes) => Object.assign(memory, changes)) };
        const auditRepository = { listByEntity: () => [{ action: 'MEMORY_NOTE_CREATED', actorId: 'author-359' }], append: (entry) => audit.push(entry) };
        const useCase = createMemoryVerificationUseCase({ memoryRepository, auditRepository,
            unitOfWork: { run: (operation) => operation() }, authorize: vi.fn(() => true),
            clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => 'audit-359' });
        const result = await useCase.run({ actorId: 'reviewer-359', actorRole: 'DIRECTOR', memoryId: memory.id,
            note: 'Confirmed against the source evidence.' });
        expect(result.ok).toBe(true);
        expect(memoryRepository.update).toHaveBeenCalledWith(memory.id, expect.objectContaining({ verified: 1,
            verifiedByAgentId: 'reviewer-359', verifiedAt: '2026-10-06T12:00:00.000Z' }));
        expect(audit).toMatchObject([{ action: 'MEMORY_VERIFIED', actorId: 'reviewer-359', entityId: memory.id }]);
    });

    it('rejects author self-review, AI claims, and unauthorized reviewers', async () => {
        let current = { id: 'memory-359', scope: 'TASK', taskId: 'task-359', sourceKind: 'USER_NOTE', sourceReference: 'ref', verified: 0 };
        const useCase = createMemoryVerificationUseCase({ memoryRepository: { getById: () => current, update: () => current },
            auditRepository: { listByEntity: () => [{ action: 'MEMORY_NOTE_CREATED', actorId: 'author-359' }], append: vi.fn() },
            unitOfWork: { run: (operation) => operation() }, authorize: () => false,
            clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => 'audit-359' });
        expect((await useCase.run({ actorId: 'author-359', actorRole: 'CEO', memoryId: current.id, note: 'Reviewed.' })).error.code)
            .toBe('memory-self-verification-forbidden');
        expect((await useCase.run({ actorId: 'reviewer-359', actorRole: 'CEO', memoryId: current.id, note: 'Reviewed.' })).error.code)
            .toBe('memory-verification-forbidden');
        current = { ...current, sourceKind: 'AI_GENERATED' };
        expect((await useCase.run({ actorId: 'reviewer-359', actorRole: 'CEO', memoryId: current.id, note: 'Reviewed.' })).error.code)
            .toBe('invalid-memory-verification');
    });

    it('rolls back verified status when the audit append fails in SQLite', async () => {
        const connection = new SqliteConnection();
        try {
            const database = connection.open(':memory:'); applyMigrations(database);
            new OrganizationRepository(database).create({ id: 'org-359', name: 'Org' });
            database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('office-359', 'org-359', 'Office', 'office-359');
            database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('department-359', 'office-359', 'Department', 'department-359');
            const agents = new AgentRepository(database);
            agents.create({ id: 'author-359-db', name: 'Author', role: 'EMPLOYEE', departmentId: 'department-359' });
            agents.create({ id: 'reviewer-359-db', name: 'Reviewer', role: 'DEPT_MANAGER', managedDepartmentId: 'department-359' });
            new TaskRepository(database).create({ id: 'task-359-db', taskCode: 'PH359-001', title: 'Test review' });
            const memories = new MemoryRepository(database);
            const saved = memories.create({ id: 'memory-359-db', scope: 'TASK', taskId: 'task-359-db', title: 'Note',
                content: 'Evidence', importance: 1, verified: 0, sourceKind: 'USER_NOTE', sourceReference: 'memory-note:359' });
            const audits = new AuditLogRepository(database);
            audits.append({ id: 'audit-359-created', action: 'MEMORY_NOTE_CREATED', entity: 'memory', entityId: saved.id, actorId: 'author-359-db' });
            const useCase = createMemoryVerificationUseCase({ memoryRepository: memories,
                auditRepository: { listByEntity: (...args) => audits.listByEntity(...args), append: () => { throw new Error('audit unavailable'); } },
                unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
                clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => 'audit-359-failed' });
            expect((await useCase.run({ actorId: 'reviewer-359-db', actorRole: 'DEPT_MANAGER', memoryId: saved.id,
                note: 'Checked evidence.' })).ok).toBe(false);
            expect(memories.getById(saved.id).verified).toBe(0);
        } finally { connection.close(); }
    });
});
