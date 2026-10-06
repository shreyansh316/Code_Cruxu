/** Phase 328 — exercise the authorized scheduler, lifecycle, and employee runtime as one composition. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime, createAuthorizedTaskScheduler, createTaskExecutionLifecycle } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { ExecutionControl } from '../src/domain';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, OrganizationRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 328 — authorized employee scheduler composition', () => {
    let connection; let database; let agents; let tasks; let task; let execute; let queueRepository; let lifecycle;
    let auditRepository; let runtime;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-328', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-328', 'org-328', 'Office', 'office-328');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-328', 'office-328', 'Department', 'department-328');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-328', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-328' });
        const employee = agents.create({ id: 'employee-328', name: 'Employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-328', capabilities: ['Testing'] });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-328', taskCode: 'PH328-001', title: 'Execute through scheduler',
            creatorId: 'manager-328', assigneeId: employee.id, status: TaskStatus.ASSIGNED,
            requiredCapabilities: ['testing'], timeBudgetMs: 1_000,
            acceptanceCriteria: [{ id: 'criterion-328', description: 'Verified output', required: true, met: false }] });
        execute = vi.fn(async () => ({ summary: 'Employee completed the assigned work.', acceptanceCriteria: [
            { criterionId: 'criterion-328', met: true, evidence: 'Runtime result satisfies the criterion.' },
        ] }));
        const hierarchyProvider = { getSnapshot: () => ({ organization: { id: 'org-328', name: 'Org' },
            offices: [{ id: 'office-328', organizationId: 'org-328', name: 'Office', slug: 'office-328', status: 'ACTIVE' }],
            departments: [{ id: 'department-328', officeId: 'office-328', name: 'Department', slug: 'department-328', status: 'ACTIVE' }],
            agents: agents.list() }) };
        let sequence = 0;
        const idFactory = () => `phase-328-id-${++sequence}`;
        auditRepository = new AuditLogRepository(database);
        lifecycle = createTaskExecutionLifecycle({ taskRepository: tasks, auditRepository,
            eventPublisher: new SqliteEventBus(database), unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        runtime = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks, hierarchyProvider,
            adapter: { execute }, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        queueRepository = { state: 'QUEUED', transition: vi.fn((_taskId, from, to) => {
            if (queueRepository.state !== from) return undefined;
            queueRepository.state = to;
            return { id: 'queue-328', taskId: task.id, state: to };
        }) };
    });
    afterEach(() => connection.close());

    it('starts the persisted task before authorized adapter execution and returns the validated task result', async () => {
        const scheduler = createAuthorizedTaskScheduler({ queueWorkflow: { run: async () => ({ ok: true,
            value: { ready: [{ task }] } }) }, queueRepository, agentRuntime: runtime, taskLifecycle: lifecycle,
        executionControl: new ExecutionControl(), parallelLimit: 1 });
        const result = await scheduler.run();
        expect(result.ok).toBe(true);
        expect(result.value.started[0]).toMatchObject({ taskId: task.id, status: 'SUCCEEDED', value: { summary: 'Employee completed the assigned work.' } });
        expect(tasks.getById(task.id).status).toBe(TaskStatus.IN_PROGRESS);
        expect(auditRepository.listByEntity('task', task.id).map(({ details }) => details.to)).toEqual(['STARTED', 'IN_PROGRESS']);
        expect(queueRepository.state).toBe('COMPLETED');
        expect(execute).toHaveBeenCalledOnce();
    });

    it('requires the transactional lifecycle hook before constructing an authorized scheduler', () => {
        expect(() => createAuthorizedTaskScheduler({ agentRuntime: runtime }))
            .toThrow(/persisted task lifecycle start hook/);
    });
});
