/** Phase 041 — deterministic recovery of claims left by host interruption. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecutionRecoveryUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 041 — execution recovery', () => {
    let connection;
    let database;
    let tasks;
    let queue;
    let audit;
    let events;
    let id;
    let recover;

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-041', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-041', 'organization-041', 'Office', 'office-041');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-041', 'office-041', 'Department', 'department-041');
        new AgentRepository(database).create({ id: 'employee-041', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-041' });
        tasks = new TaskRepository(database);
        queue = new ExecutionQueueRepository(database);
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);
        id = 0;
        recover = makeRecovery();
    });
    afterEach(() => connection.close());

    function makeRecovery(eventPublisher = events) {
        return createExecutionRecoveryUseCase({ taskRepository: tasks, queueRepository: queue,
            auditRepository: audit, eventPublisher, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => `generated-041-${++id}` });
    }

    function seed(taskId, status) {
        tasks.create({ id: taskId, taskCode: `CODE-${taskId}`, title: taskId, status,
            assigneeId: 'employee-041', acceptanceCriteria: [] });
        queue.enqueue({ id: `queue-${taskId}`, taskId });
        queue.transition(taskId, 'QUEUED', 'CLAIMED');
    }

    it('requeues interrupted assignments and is idempotent', async () => {
        seed('task-assigned', TaskStatus.ASSIGNED);
        const first = await recover.run();
        const second = await recover.run();
        expect(first.value).toEqual([{ taskId: 'task-assigned', outcome: 'REQUEUED', queueState: 'QUEUED' }]);
        expect(second.value).toEqual([]);
        expect(queue.getByTaskId('task-assigned').state).toBe('QUEUED');
        expect(tasks.getById('task-assigned').status).toBe(TaskStatus.ASSIGNED);
        expect(audit.listByTask('task-assigned')).toHaveLength(1);
        expect(events.database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'TASK_QUEUED' }]);
    });

    it('marks interrupted active tasks blocked instead of completed', async () => {
        seed('task-running', TaskStatus.IN_PROGRESS);
        const outcome = await recover.run();
        expect(outcome.value[0]).toMatchObject({ outcome: 'BLOCKED', queueState: 'CANCELLED' });
        expect(tasks.getById('task-running')).toMatchObject({ status: TaskStatus.BLOCKED,
            blockerReason: expect.stringContaining('host restart') });
        expect(queue.getByTaskId('task-running').state).toBe('CANCELLED');
        expect(events.database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'TASK_BLOCKED' }]);
    });

    it('reconciles already completed and non-runnable task states explicitly', async () => {
        seed('task-done', TaskStatus.COMPLETED);
        seed('task-review', TaskStatus.REVIEW);
        seed('task-cancelled', TaskStatus.CANCELLED);
        const outcome = await recover.run();
        expect(Object.fromEntries(outcome.value.map(({ taskId, outcome: value }) => [taskId, value]))).toEqual({
            'task-done': 'ALREADY_COMPLETED',
            'task-review': 'REVIEW_PENDING',
            'task-cancelled': 'NOT_RUNNABLE',
        });
        expect(queue.getByTaskId('task-done').state).toBe('COMPLETED');
        expect(queue.getByTaskId('task-review').state).toBe('CANCELLED');
        expect(tasks.getById('task-done').status).toBe(TaskStatus.COMPLETED);
    });

    it('rolls back task, queue, and audit recovery if event persistence fails', async () => {
        seed('task-rollback', TaskStatus.IN_PROGRESS);
        const failing = makeRecovery({ append: () => { throw new Error('event persistence failed'); } });
        const outcome = await failing.run();
        expect(outcome.ok).toBe(false);
        expect(tasks.getById('task-rollback').status).toBe(TaskStatus.IN_PROGRESS);
        expect(queue.getByTaskId('task-rollback').state).toBe('CLAIMED');
        expect(audit.listByTask('task-rollback')).toEqual([]);
    });
});
