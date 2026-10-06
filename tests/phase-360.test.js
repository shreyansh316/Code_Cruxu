/** Phase 360 — persist cited engineering review findings as unverified task memory. */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryVerificationUseCase, createPersistReviewFindingsUseCase } from '../src/application';
import { AgentRepository, AuditLogRepository, MemoryRepository, OrganizationRepository, TaskRepository,
    SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

const review = { area: 'SECURITY', selected: 'src/auth.js', findings: [{ id: 'finding-360', title: 'Authorization can be bypassed',
    severity: 'HIGH', confidence: 'UNASSESSED', whyItMatters: 'Unauthorized callers can read task data.',
    recommendedFix: 'Check the persisted actor before returning data.', alternatives: [], evidenceIds: ['auth-check'],
    evidenceQuotes: [{ evidenceId: 'auth-check', text: 'return taskRepository.getById(taskId);' }] }], speculations: [],
    evidence: [{ id: 'auth-check', type: 'source', label: 'src/auth.js:20', excerpt: 'return taskRepository.getById(taskId);' }] };

describe('Phase 360 — review finding memory', () => {
    it('requires explicit confirmation and persists cited, unverified findings with audit attribution', async () => {
        const memoryRepository = { create: vi.fn((record) => record) };
        const auditRepository = { append: vi.fn() };
        const useCase = createPersistReviewFindingsUseCase({ memoryRepository, taskRepository: { getById: () => ({ id: 'task-360', status: 'IN_PROGRESS' }) },
            agentRepository: { getById: () => ({ id: 'reviewer-360', role: 'CEO' }) }, auditRepository,
            unitOfWork: { run: (operation) => operation() }, authorize: () => true,
            idFactory: (() => { let n = 0; return () => `id-360-${++n}`; })() });
        const result = await useCase.run({ taskId: 'task-360', actorId: 'reviewer-360', actorRole: 'CEO', review, confirm: true });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject([{ scope: 'TASK', taskId: 'task-360', sourceKind: 'REVIEW_FINDING', verified: 0,
            sourceReference: 'review:task-360:finding-360', category: 'HIGH', importance: 3 }]);
        expect(JSON.parse(result.value[0].content)).toMatchObject({ finding: { evidenceIds: ['auth-check'] },
            evidence: [{ id: 'auth-check', label: 'src/auth.js:20' }] });
        expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVIEW_FINDINGS_STORED',
            actorId: 'reviewer-360', taskId: 'task-360', details: expect.objectContaining({ count: 1 }) }));
    });

    it('rejects unconfirmed or unauthorized storage and treats suspicions as non-findings', async () => {
        const useCase = createPersistReviewFindingsUseCase({ memoryRepository: { create: vi.fn() },
            taskRepository: { getById: () => ({ id: 'task-360', status: 'IN_PROGRESS' }) },
            agentRepository: { getById: () => ({ id: 'reviewer-360', role: 'CEO' }) }, auditRepository: { append: vi.fn() },
            unitOfWork: { run: (operation) => operation() }, authorize: () => false, idFactory: () => 'id-360' });
        expect((await useCase.run({ taskId: 'task-360', actorId: 'reviewer-360', actorRole: 'CEO', review, confirm: false })).error.code)
            .toBe('review-finding-persistence-not-confirmed');
        expect((await useCase.run({ taskId: 'task-360', actorId: 'reviewer-360', actorRole: 'CEO', review, confirm: true })).error.code)
            .toBe('review-finding-persistence-forbidden');
        expect((await useCase.run({ taskId: 'task-360', actorId: 'reviewer-360', actorRole: 'CEO',
            review: { ...review, findings: [], speculations: [{ hypothesis: 'Possible race', neededEvidence: 'Run a race test', evidenceIds: [] }] }, confirm: true })).value)
            .toEqual([]);
    });

    it('stores real cited findings in SQLite and rolls back when audit persistence fails', async () => {
        const connection = new SqliteConnection();
        try {
            const database = connection.open(':memory:'); applyMigrations(database);
            new OrganizationRepository(database).create({ id: 'org-360', name: 'Org' });
            database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('office-360', 'org-360', 'Office', 'office-360');
            database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('department-360', 'office-360', 'Department', 'department-360');
            new AgentRepository(database).create({ id: 'reviewer-360-db', name: 'Reviewer', role: 'DEPT_MANAGER', managedDepartmentId: 'department-360' });
            new AgentRepository(database).create({ id: 'second-reviewer-360', name: 'Second Reviewer', role: 'CEO', organizationId: 'org-360' });
            new TaskRepository(database).create({ id: 'task-360-db', taskCode: 'PH360-001', title: 'Review authorization', status: 'IN_PROGRESS' });
            const memories = new MemoryRepository(database); const audits = new AuditLogRepository(database);
            const options = { memoryRepository: memories, taskRepository: new TaskRepository(database),
                agentRepository: new AgentRepository(database), auditRepository: audits,
                unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
                idFactory: (() => { let n = 0; return () => `finding-memory-360-${++n}`; })() };
            const useCase = createPersistReviewFindingsUseCase(options);
            const saved = await useCase.run({ taskId: 'task-360-db', actorId: 'reviewer-360-db', actorRole: 'DEPT_MANAGER', review, confirm: true });
            expect(saved.ok).toBe(true);
            expect(memories.listByOwner('TASK', 'task-360-db')).toMatchObject([{ sourceKind: 'REVIEW_FINDING', verified: 0 }]);
            expect(audits.listByTask('task-360-db')).toEqual(expect.arrayContaining([
                expect.objectContaining({ action: 'REVIEW_FINDINGS_STORED', actorId: 'reviewer-360-db' }),
            ]));
            expect(audits.listByEntity('memory', saved.value[0].id)).toMatchObject([
                { action: 'REVIEW_FINDING_MEMORY_CREATED', actorId: 'reviewer-360-db', taskId: 'task-360-db' },
            ]);

            const failing = createPersistReviewFindingsUseCase({ ...options,
                auditRepository: { append: () => { throw new Error('audit unavailable'); } } });
            const rolledBack = await failing.run({ taskId: 'task-360-db', actorId: 'reviewer-360-db', actorRole: 'DEPT_MANAGER', review, confirm: true });
            expect(rolledBack.ok).toBe(false);
            expect(memories.listByOwner('TASK', 'task-360-db')).toHaveLength(1);
            const verify = createMemoryVerificationUseCase({ memoryRepository: memories, auditRepository: audits,
                unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
                clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => 'review-verified-360' });
            const originalContent = saved.value[0].content;
            memories.update(saved.value[0].id, { content: 'substituted finding with reused evidence IDs' });
            expect((await verify.run({ actorId: 'second-reviewer-360', actorRole: 'CEO', memoryId: saved.value[0].id,
                note: 'Checked the evidence.' })).error.code).toBe('memory-review-source-invalid');
            memories.update(saved.value[0].id, { content: originalContent });
            const verified = await verify.run({ actorId: 'second-reviewer-360', actorRole: 'CEO',
                memoryId: saved.value[0].id, note: 'I checked the cited source excerpt.' });
            expect(verified.ok).toBe(true);
            expect(verified.value).toMatchObject({ verified: 1, sourceKind: 'REVIEW_FINDING',
                verifiedByAgentId: 'second-reviewer-360' });
            expect(() => memories.update(verified.value.id, { content: 'rewrite' })).toThrow(/content cannot be changed/);
        } finally { connection.close(); }
    });
});
