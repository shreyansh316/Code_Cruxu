/** Phase 398 — close active debugging sessions atomically with task cancellation and result submission. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskExecutionFailureRecovery, createTaskExecutionLifecycle, createTaskResultSubmissionUseCase } from '../src/application';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, ExecutionQueueRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';

const RESULT = { summary: 'Implemented and verified.', acceptanceCriteria: [
    { criterionId: 'criterion-398', met: true, evidence: 'Test output confirms success.' },
] };

describe('Phase 398 — debugging session and task lifecycle consistency', () => {
    let connection; let database; let tasks; let audits; let sessions; let ids;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new AgentRepository(database).create({ id: 'employee-398', name: 'Engineer', role: 'EMPLOYEE' });
        tasks = new TaskRepository(database); audits = new AuditLogRepository(database); sessions = new DebuggingSessionRepository(database);
        tasks.create({ id: 'task-398', taskCode: 'PH398-001', title: 'Finish debugging', assigneeId: 'employee-398',
            status: 'IN_PROGRESS', acceptanceCriteria: [{ id: 'criterion-398', description: 'Tests pass', required: true, met: false }] });
        ids = 0;
    });
    afterEach(() => { connection.close(); vi.restoreAllMocks(); });

    function startDebugging(id = 'session-398') {
        return sessions.create({ id, taskId: 'task-398', createdByAgentId: 'employee-398',
            startedAt: '2026-10-06T12:00:00.000Z', timeBudgetMs: 60_000 });
    }
    function lifecycle(auditRepository = audits) {
        return createTaskExecutionLifecycle({ taskRepository: tasks, auditRepository, eventPublisher: new SqliteEventBus(database),
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => '2026-10-06T12:01:00.000Z' },
            idFactory: () => `phase398-${++ids}`, debuggingSessionRepository: sessions });
    }
    function resultSubmission(auditRepository = audits) {
        return createTaskResultSubmissionUseCase({ taskRepository: tasks, auditRepository,
            eventPublisher: new SqliteEventBus(database), unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-06T12:01:00.000Z' }, idFactory: () => `phase398-${++ids}`,
            debuggingSessionRepository: sessions });
    }

    it('stops the active debugging session and audits it in the same transaction as task cancellation', () => {
        const session = startDebugging();
        expect(lifecycle().cancel('task-398')).toBe(true);
        expect(tasks.getById('task-398').status).toBe('CANCELLED');
        expect(sessions.getById(session.id)).toMatchObject({ status: 'STOPPED', stopReason: 'task-cancelled' });
        expect(audits.listByEntity('debugging-session', session.id)).toMatchObject([
            { action: 'DEBUGGING_SESSION_STOPPED', details: { trigger: 'TASK_STATE_CHANGED' } },
        ]);
    });

    it('stops the active debugging session when an assigned employee submits the task for review', async () => {
        const session = startDebugging();
        const result = await resultSubmission().run({ taskId: 'task-398', agentId: 'employee-398', result: RESULT });
        expect(result.ok).toBe(true);
        expect(result.value.status).toBe('REVIEW');
        expect(sessions.getById(session.id)).toMatchObject({ status: 'STOPPED', stopReason: 'task-entered-review' });
        expect(audits.listByEntity('debugging-session', session.id)).toHaveLength(1);
    });

    it('stops the active debugging session when exhausted execution retries mark the task failed', async () => {
        tasks.update('task-398', { maxRetries: 0 });
        new ExecutionQueueRepository(database).enqueue({ id: 'queue-398', taskId: 'task-398' });
        const session = startDebugging();
        const recovery = createTaskExecutionFailureRecovery({ taskRepository: tasks,
            queueRepository: new ExecutionQueueRepository(database), auditRepository: audits,
            eventPublisher: new SqliteEventBus(database), unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-06T12:01:00.000Z' }, idFactory: () => `phase398-${++ids}`,
            debuggingSessionRepository: sessions });
        const result = await recovery.run({ taskId: 'task-398', errorCode: 'provider-failed' });
        expect(result.ok).toBe(true);
        expect(result.value.outcome).toBe('FAILED');
        expect(tasks.getById('task-398').status).toBe('FAILED');
        expect(sessions.getById(session.id)).toMatchObject({ status: 'STOPPED', stopReason: 'task-failed' });
    });

    it('rolls task state and debug session state back together when shutdown audit fails', () => {
        const session = startDebugging();
        const append = audits.append.bind(audits);
        vi.spyOn(audits, 'append').mockImplementation((entry) => {
            if (entry.action === 'DEBUGGING_SESSION_STOPPED') throw new Error('debug audit unavailable');
            return append(entry);
        });
        expect(() => lifecycle().cancel('task-398')).toThrow('debug audit unavailable');
        expect(tasks.getById('task-398').status).toBe('IN_PROGRESS');
        expect(sessions.getById(session.id).status).toBe('ACTIVE');
        expect(audits.listByTask('task-398')).toEqual([]);
        expect(database.prepare('SELECT count(*) AS count FROM events').get().count).toBe(0);
    });
});
