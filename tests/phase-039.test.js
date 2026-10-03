/** Phase 039 — dependency-ready durable execution queue. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecutionQueueUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, OrganizationRepository,
    SqliteConnection, TaskDependencyRepository, TaskRepository, applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage';

describe('Phase 039 — execution queue', () => {
    let connection;
    let database;
    let agents;
    let tasks;
    let dependencyRepository;
    let queueRepository;
    let audit;
    let events;
    let id;
    let queue;

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-039', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-039', 'organization-039', 'Office', 'office-039');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-039', 'office-039', 'Department', 'department-039');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-039', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-039' });
        agents.create({ id: 'employee-039', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-039' });
        tasks = new TaskRepository(database);
        dependencyRepository = new TaskDependencyRepository(database);
        queueRepository = new ExecutionQueueRepository(database);
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);
        id = 0;
        queue = makeQueue();
        seedTasks();
    });
    afterEach(() => connection.close());

    function makeQueue(eventPublisher = events) {
        return createExecutionQueueUseCase({ taskRepository: tasks, dependencyRepository, queueRepository,
            hierarchyProvider: { getSnapshot: () => ({
                organization: { id: 'organization-039', name: 'HEADROOM' },
                offices: [{ id: 'office-039', organizationId: 'organization-039', name: 'Office', slug: 'office-039', status: 'ACTIVE' }],
                departments: [{ id: 'department-039', officeId: 'office-039', name: 'Department', slug: 'department-039', status: 'ACTIVE' }],
                agents: agents.list(),
            }) }, auditRepository: audit, eventPublisher, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => `generated-039-${++id}` });
    }

    function seedTasks() {
        const create = (taskId, status, priority = 0) => tasks.create({ id: taskId, taskCode: `CODE-${taskId}`,
            title: taskId, status, priority, creatorId: 'manager-039', assigneeId: 'employee-039',
            acceptanceCriteria: [] });
        create('prerequisite-complete', TaskStatus.COMPLETED);
        create('ready-independent', TaskStatus.ASSIGNED, 2);
        create('ready-after-complete', TaskStatus.ASSIGNED, 4);
        create('blocked-prerequisite', TaskStatus.IN_PROGRESS, 1);
        create('blocked-dependent', TaskStatus.ASSIGNED, 10);
        dependencyRepository.create({ id: 'edge-ready', dependentTaskId: 'ready-after-complete', dependencyTaskId: 'prerequisite-complete' });
        dependencyRepository.create({ id: 'edge-blocked', dependentTaskId: 'blocked-dependent', dependencyTaskId: 'blocked-prerequisite' });
    }

    it('persists only authorized dependency-ready work in deterministic priority order', async () => {
        const first = await queue.run();
        expect(first.ok).toBe(true);
        expect(first.value.queued).toHaveLength(2);
        expect(first.value.ready.map(({ task }) => task.id)).toEqual(['ready-after-complete', 'ready-independent']);
        expect((await queue.run()).value.queued).toEqual([]);
        expect(queueRepository.listByState()).toHaveLength(2);
        expect(audit.listByEntity('task', 'ready-independent')).toHaveLength(1);
        expect(database.prepare('SELECT type FROM events ORDER BY rowid').all()).toEqual([
            { type: 'TASK_QUEUED' }, { type: 'TASK_QUEUED' },
        ]);
    });

    it('uses compare-and-set queue states and rejects invalid transitions', async () => {
        await queue.run();
        expect(queueRepository.transition('ready-independent', 'QUEUED', 'CLAIMED').state).toBe('CLAIMED');
        expect(queueRepository.transition('ready-independent', 'QUEUED', 'CLAIMED')).toBeNull();
        expect(() => queueRepository.transition('ready-independent', 'CLAIMED', 'QUEUED')).not.toThrow();
        expect(() => queueRepository.transition('ready-independent', 'QUEUED', 'COMPLETED')).toThrow();
    });

    it('rolls back queue and audit persistence when event recording fails', async () => {
        const failing = makeQueue({ append: () => { throw new Error('event persistence failed'); } });
        const outcome = await failing.run();
        expect(outcome.ok).toBe(false);
        expect(queueRepository.listByState()).toEqual([]);
        expect(audit.listByEntity('task', 'ready-independent')).toEqual([]);
    });

    it('upgrades an existing v4 database without losing tasks', () => {
        const oldConnection = new SqliteConnection();
        const oldDatabase = oldConnection.open(':memory:');
        applyMigrations(oldDatabase, SCHEMA_MIGRATIONS.slice(0, 4));
        new OrganizationRepository(oldDatabase).create({ id: 'legacy-org-039', name: 'Legacy' });
        const legacyTasks = new TaskRepository(oldDatabase);
        legacyTasks.create({ id: 'legacy-task-039', taskCode: 'LEGACY-039', title: 'Preserve me',
            status: TaskStatus.ASSIGNED, acceptanceCriteria: [] });
        expect(applyMigrations(oldDatabase)).toBe(5);
        expect(new TaskRepository(oldDatabase).getById('legacy-task-039').title).toBe('Preserve me');
        expect(new ExecutionQueueRepository(oldDatabase).listByState()).toEqual([]);
        oldConnection.close();
    });
});
