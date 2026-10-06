/** Phase 327 — start authorized employee work durably before adapter invocation. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskExecutionLifecycle } from '../src/application/taskExecutionLifecycle';
import { AgentRole, TaskStatus } from '../src/constants';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, OrganizationRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 327 — persisted task execution lifecycle', () => {
    let connection; let database; let taskRepository; let task; let auditRepository; let events; let lifecycle; let sequence;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-327', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-327', 'org-327', 'Office', 'office-327');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-327', 'office-327', 'Department', 'department-327');
        const agents = new AgentRepository(database);
        agents.create({ id: 'manager-327', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-327' });
        const employee = agents.create({ id: 'employee-327', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-327' });
        taskRepository = new TaskRepository(database);
        task = taskRepository.create({ id: 'task-327', taskCode: 'PH327-001', title: 'Execute task', creatorId: 'manager-327',
            assigneeId: employee.id, status: TaskStatus.ASSIGNED,
            acceptanceCriteria: [{ id: 'criterion-327', description: 'Result validated', required: true, met: false }] });
        auditRepository = new AuditLogRepository(database); events = new SqliteEventBus(database); sequence = 0;
        lifecycle = createTaskExecutionLifecycle({ taskRepository, auditRepository, eventPublisher: events,
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date('2026-10-06T00:00:00.000Z') },
            idFactory: () => `event-327-${++sequence}` });
    });
    afterEach(() => connection.close());

    it('transitions assigned work to in-progress with ordered audit and domain events', () => {
        expect(lifecycle.onStart(task)).toBe(true);
        expect(taskRepository.getById(task.id).status).toBe(TaskStatus.IN_PROGRESS);
        expect(auditRepository.listByEntity('task', task.id).map(({ details }) => details.to)).toEqual(['STARTED', 'IN_PROGRESS']);
        expect(database.prepare('SELECT type FROM events ORDER BY rowid').all().map(({ type }) => type))
            .toEqual(['TASK_STARTED', 'TASK_PROGRESS']);
    });

    it('does not duplicate lifecycle events for an already in-progress rework task', () => {
        taskRepository.update(task.id, { status: TaskStatus.IN_PROGRESS });
        expect(lifecycle.onStart(task)).toBe(false);
        expect(auditRepository.listByEntity('task', task.id)).toHaveLength(0);
        expect(database.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(0);
    });

    it('rejects tasks that have moved to a non-runnable state', () => {
        taskRepository.update(task.id, { status: TaskStatus.CANCELLED });
        expect(() => lifecycle.onStart(task)).toThrow(/Only an assigned task/);
        expect(taskRepository.getById(task.id).status).toBe(TaskStatus.CANCELLED);
    });

    it('rolls back lifecycle changes when audit persistence fails', () => {
        const failing = createTaskExecutionLifecycle({ taskRepository,
            auditRepository: { append: () => { throw new Error('audit unavailable'); } }, eventPublisher: events,
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date('2026-10-06T00:00:00.000Z') },
            idFactory: () => `rollback-327-${++sequence}` });
        expect(() => failing.onStart(task)).toThrow('audit unavailable');
        expect(taskRepository.getById(task.id).status).toBe(TaskStatus.ASSIGNED);
        expect(database.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(0);
    });
});
