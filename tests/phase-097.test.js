import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createExecutionRecoveryUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 097 — durable objective execution restart', () => {
    let directory;
    let connection;
    afterEach(() => {
        if (connection?.isOpen) connection.close();
        if (directory) rmSync(directory, { recursive: true, force: true });
    });

    it('reopens persisted objective work, recovers an interrupted claim, and preserves truthful task state', async () => {
        directory = mkdtempSync(join(tmpdir(), 'headroom-097-'));
        const databasePath = join(directory, 'headroom.sqlite');
        connection = new SqliteConnection();
        let database = connection.open(databasePath);
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-097', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-097', 'organization-097', 'Office', 'office-097');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-097', 'office-097', 'Department', 'department-097');
        new AgentRepository(database).create({ id: 'employee-097', name: 'Employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-097', status: 'IDLE' });
        database.prepare("INSERT INTO objectives (id, title, description, status, priority) VALUES (?, ?, ?, ?, ?)")
            .run('objective-097', 'Long running', 'Restart-safe objective', 'ACTIVE', 1);
        database.prepare("INSERT INTO projects (id, name, status, priority, objective_id) VALUES (?, ?, ?, ?, ?)")
            .run('project-097', 'Persistent project', 'ACTIVE', 1, 'objective-097');
        const tasks = new TaskRepository(database);
        tasks.create({ id: 'task-097', taskCode: 'TASK-097', title: 'Continue after restart', status: TaskStatus.ASSIGNED,
            priority: 1, projectId: 'project-097', assigneeId: 'employee-097', acceptanceCriteria: [] });
        const queue = new ExecutionQueueRepository(database);
        queue.enqueue({ id: 'queue-097', taskId: 'task-097' });
        queue.transition('task-097', 'QUEUED', 'CLAIMED');
        connection.close();

        connection = new SqliteConnection();
        database = connection.open(databasePath);
        const reopenedTasks = new TaskRepository(database);
        const reopenedQueue = new ExecutionQueueRepository(database);
        const audit = new AuditLogRepository(database);
        const events = new SqliteEventBus(database);
        const recovery = createExecutionRecoveryUseCase({ taskRepository: reopenedTasks, queueRepository: reopenedQueue,
            auditRepository: audit, eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-04T00:00:00.000Z' }, idFactory: () => 'phase097-recovery-audit' });
        const recovered = await recovery.run();

        expect(recovered.ok).toBe(true);
        expect(recovered.value).toEqual([{ taskId: 'task-097', outcome: 'REQUEUED', queueState: 'QUEUED' }]);
        expect(reopenedTasks.getById('task-097')).toMatchObject({ status: TaskStatus.ASSIGNED, projectId: 'project-097' });
        expect(reopenedQueue.getByTaskId('task-097').state).toBe('QUEUED');
        expect(audit.listByTask('task-097')).toHaveLength(1);
        expect(database.prepare('SELECT type FROM events WHERE aggregate_id = ?').all('task-097')).toEqual([{ type: 'TASK_QUEUED' }]);
        expect((await recovery.run()).value).toEqual([]);
    });
});
