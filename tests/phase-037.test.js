/** Phase 037 — guarded structured task result submission. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskResultSubmissionUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 037 — task result submission', () => {
    let connection;
    let database;
    let tasks;
    let audit;
    let events;
    let id = 0;
    let workflow;
    const criteria = [
        { id: 'criterion-required', description: 'Required check passes', required: true, met: false },
        { id: 'criterion-optional', description: 'Optional check', required: false, met: false },
    ];
    const result = { summary: 'Implemented and verified.', acceptanceCriteria: [
        { criterionId: 'criterion-required', met: true, evidence: 'Check output confirms success.' },
        { criterionId: 'criterion-optional', met: false, evidence: 'Optional item deferred.' },
    ] };

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new AgentRepository(database).create({ id: 'agent-037', name: 'Employee', role: AgentRole.EMPLOYEE });
        tasks = new TaskRepository(database);
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);
        id = 0;
        tasks.create({ id: 'task-037', taskCode: 'PH037-001', title: 'Implement result submission',
            status: TaskStatus.IN_PROGRESS, assigneeId: 'agent-037', acceptanceCriteria: criteria });
        workflow = createTaskResultSubmissionUseCase({ taskRepository: tasks, auditRepository: audit,
            eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => `generated-037-${++id}` });
    });
    afterEach(() => connection.close());

    it('persists bounded structured evidence and moves a valid result into review', async () => {
        const submitted = await workflow.run({ taskId: 'task-037', agentId: 'agent-037', result });
        expect(submitted.ok).toBe(true);
        expect(submitted.value).toMatchObject({ status: TaskStatus.REVIEW, result,
            acceptanceCriteria: [{ met: true }, { met: false }] });
        expect(audit.listByTask('task-037')).toHaveLength(1);
        expect(events.database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'TASK_REVIEW_REQUIRED' }]);
    });

    it('rejects non-assignees and tasks outside the in-progress state without writes', async () => {
        const unauthorized = await workflow.run({ taskId: 'task-037', agentId: 'other-agent', result });
        expect(unauthorized.error.code).toBe('unauthorized-task-result');
        tasks.update('task-037', { status: TaskStatus.CREATED });
        const invalidState = await workflow.run({ taskId: 'task-037', agentId: 'agent-037', result });
        expect(invalidState.error.code).toBe('invalid-task-transition');
        expect(audit.listByTask('task-037')).toEqual([]);
        expect(events.database.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(0);
    });

    it('rejects missing, mismatched, or unmet required criteria', async () => {
        const missing = await workflow.run({ taskId: 'task-037', agentId: 'agent-037', result: { ...result,
            acceptanceCriteria: result.acceptanceCriteria.slice(1) } });
        const mismatched = await workflow.run({ taskId: 'task-037', agentId: 'agent-037', result: { ...result,
            acceptanceCriteria: result.acceptanceCriteria.map((entry) => ({ ...entry, criterionId: 'unknown' })) } });
        const unmet = await workflow.run({ taskId: 'task-037', agentId: 'agent-037', result: { ...result,
            acceptanceCriteria: result.acceptanceCriteria.map((entry) => ({ ...entry,
                met: entry.criterionId === 'criterion-required' ? false : entry.met })) } });
        expect([missing.error.code, mismatched.error.code, unmet.error.code]).toEqual([
            'invalid-task-result', 'invalid-task-result', 'task-acceptance-incomplete',
        ]);
        expect(tasks.getById('task-037').status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('rolls back task changes and audit records if event persistence fails', async () => {
        const failing = createTaskResultSubmissionUseCase({ taskRepository: tasks, auditRepository: audit,
            eventPublisher: { append: () => { throw new Error('event persistence failed'); } },
            unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => 'duplicate-result-id' });
        const submitted = await failing.run({ taskId: 'task-037', agentId: 'agent-037', result });
        expect(submitted.ok).toBe(false);
        expect(tasks.getById('task-037').status).toBe(TaskStatus.IN_PROGRESS);
        expect(tasks.getById('task-037').result).toBeNull();
        expect(audit.listByTask('task-037')).toEqual([]);
    });
});
