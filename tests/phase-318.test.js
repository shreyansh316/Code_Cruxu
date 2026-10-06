/** Phase 318 — store complete, immutable, attributed engineering decisions. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngineeringDecisionUseCase } from '../src/application';
import { AgentRepository, AuditLogRepository, EngineeringDecisionRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

const decision = {
    context: 'The task needs a durable local cache.',
    options: ['SQLite cache', 'In-memory cache', 'No cache'],
    selectedOption: 'SQLite cache',
    rejectedOptions: ['In-memory cache', 'No cache'],
    reason: 'The cache must survive extension restarts.',
    tradeOffs: ['Adds schema and migration ownership.'],
    evidence: ['Requirement: retain state after restart.', 'Test: persistence across connection reopen.'],
    confidence: 0.88,
};

describe('Phase 318 — engineering decision memory', () => {
    let connection; let database; let tasks; let agents; let decisions; let audits; let nextId;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-318', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-318', 'org-318', 'Office', 'office-318');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-318', 'office-318', 'Department', 'department-318');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-318', name: 'Manager', role: 'DEPT_MANAGER', managedDepartmentId: 'department-318' });
        agents.create({ id: 'employee-318', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-318' });
        agents.create({ id: 'stranger-318', name: 'Stranger', role: 'EMPLOYEE', departmentId: 'department-318' });
        tasks = new TaskRepository(database);
        tasks.create({ id: 'task-318', taskCode: 'PH318-001', title: 'Implement cache', creatorId: 'manager-318', assigneeId: 'employee-318' });
        decisions = new EngineeringDecisionRepository(database); audits = new AuditLogRepository(database);
        let id = 0; nextId = () => `decision-generated-318-${++id}`;
    });
    afterEach(() => connection.close());

    function workflow(auditRepository = audits) {
        return createEngineeringDecisionUseCase({ decisionRepository: decisions, taskRepository: tasks, agentRepository: agents,
            auditRepository, unitOfWork: createSqliteUnitOfWork(database), idFactory: nextId });
    }

    it('persists the full decision payload and a separate attribution event', async () => {
        const result = await workflow().run({ ...decision, taskId: 'task-318', authorId: 'employee-318' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ ...decision, taskId: 'task-318', authorId: 'employee-318' });
        expect(decisions.listByTask('task-318')).toHaveLength(1);
        expect(audits.listByEntity('engineering-decision', result.value.id)).toMatchObject([
            { action: 'ENGINEERING_DECISION_RECORDED', actorId: 'employee-318', taskId: 'task-318' },
        ]);
    });

    it('rejects authors unrelated to the task and malformed alternative selections', async () => {
        const unauthorized = await workflow().run({ ...decision, taskId: 'task-318', authorId: 'stranger-318' });
        const malformed = await workflow().run({ ...decision, selectedOption: 'Unlisted', taskId: 'task-318', authorId: 'employee-318' });
        expect(unauthorized.error.code).toBe('decision-author-forbidden');
        expect(malformed.ok).toBe(false);
        expect(decisions.listByTask('task-318')).toEqual([]);
    });

    it('permits honest empty rejected-option, trade-off, or evidence lists', async () => {
        const result = await workflow().run({ ...decision, rejectedOptions: [], tradeOffs: [], evidence: [],
            taskId: 'task-318', authorId: 'manager-318' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ rejectedOptions: [], tradeOffs: [], evidence: [] });
    });

    it('redacts secrets and blocks direct mutation and deletion', async () => {
        const result = await workflow().run({ ...decision, reason: 'Chosen after api_key=AIzaSyA-1234567890123456789012345678901234 review',
            taskId: 'task-318', authorId: 'manager-318' });
        expect(result.value.reason).not.toContain('AIzaSyA-1234567890123456789012345678901234');
        expect(() => database.prepare('UPDATE engineering_decisions SET reason = ? WHERE id = ?').run('rewrite', result.value.id))
            .toThrow(/immutable/);
        expect(() => database.prepare('DELETE FROM engineering_decisions WHERE id = ?').run(result.value.id)).toThrow(/immutable/);
    });

    it('rolls back the decision if audit attribution cannot be recorded', async () => {
        const failingAudit = { append: vi.fn(() => { throw new Error('audit failure'); }) };
        const result = await workflow(failingAudit).run({ ...decision, taskId: 'task-318', authorId: 'employee-318' });
        expect(result.ok).toBe(false);
        expect(decisions.listByTask('task-318')).toEqual([]);
    });
});
