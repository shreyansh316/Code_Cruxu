/** Phase 352 — selected task runs through one isolated queue and complete result lifecycle. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionQueueUseCase, createSelectedTaskExecution, createTaskExecutionFailureRecovery,
    createTaskExecutionLifecycle, createTaskResultSubmissionUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { ExecutionControl } from '../src/domain';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, OrganizationRepository,
    TaskDependencyRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 352 — selected task execution workflow', () => {
    let connection; let database; let tasks; let agents; let queueRepository; let audit; let eventBus;
    let selected; let other; let lifecycle; let queueWorkflow; let resultSubmission; let recovery; let executionControl;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-352', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-352', 'organization-352', 'Office', 'office-352');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-352', 'office-352', 'Department', 'department-352');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-352', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-352' });
        agents.create({ id: 'employee-352-a', name: 'Employee A', role: AgentRole.EMPLOYEE, departmentId: 'department-352' });
        agents.create({ id: 'employee-352-b', name: 'Employee B', role: AgentRole.EMPLOYEE, departmentId: 'department-352' });
        tasks = new TaskRepository(database);
        const criteria = [{ id: 'criterion-352', description: 'Evidence-backed outcome', required: true, met: false }];
        selected = tasks.create({ id: 'task-352-selected', taskCode: 'PH352-001', title: 'Selected', creatorId: 'manager-352',
            assigneeId: 'employee-352-a', status: TaskStatus.ASSIGNED, acceptanceCriteria: criteria });
        other = tasks.create({ id: 'task-352-other', taskCode: 'PH352-002', title: 'Must remain queued elsewhere', creatorId: 'manager-352',
            assigneeId: 'employee-352-b', status: TaskStatus.ASSIGNED, acceptanceCriteria: criteria });
        const hierarchyProvider = { getSnapshot: () => ({ organization: { id: 'organization-352', name: 'Org' },
            offices: [{ id: 'office-352', organizationId: 'organization-352', name: 'Office', slug: 'office-352', status: 'ACTIVE' }],
            departments: [{ id: 'department-352', officeId: 'office-352', name: 'Department', slug: 'department-352', status: 'ACTIVE' }],
            agents: agents.list() }) };
        audit = new AuditLogRepository(database); eventBus = new SqliteEventBus(database);
        const uow = createSqliteUnitOfWork(database); let counter = 0;
        const idFactory = () => `phase352-generated-${++counter}`;
        queueRepository = new ExecutionQueueRepository(database);
        queueWorkflow = createExecutionQueueUseCase({ taskRepository: tasks,
            dependencyRepository: new TaskDependencyRepository(database), queueRepository, hierarchyProvider,
            auditRepository: audit, eventPublisher: eventBus, unitOfWork: uow,
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        lifecycle = createTaskExecutionLifecycle({ taskRepository: tasks, auditRepository: audit,
            eventPublisher: eventBus, unitOfWork: uow, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        resultSubmission = createTaskResultSubmissionUseCase({ taskRepository: tasks, auditRepository: audit,
            eventPublisher: eventBus, unitOfWork: uow, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        recovery = createTaskExecutionFailureRecovery({ taskRepository: tasks, queueRepository, auditRepository: audit,
            eventPublisher: eventBus, unitOfWork: uow, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory });
        executionControl = new ExecutionControl();
    });
    afterEach(() => connection.close());

    it('queues, starts, authorizes, submits, and completes only the selected task', async () => {
        const result = createSelectedTaskExecution({ taskId: selected.id, queueWorkflow, queueRepository,
            agentRuntime: { run: vi.fn(async ({ taskId, agentId }) => ({ ok: true, value: { taskId, agentId,
                outcome: 'SUCCEEDED', result: { summary: 'Completed selected work.', acceptanceCriteria: [
                    { criterionId: 'criterion-352', met: true, evidence: 'Observed successful result.' },
                ] } } })) }, taskLifecycle: lifecycle, resultSubmissionUseCase: resultSubmission,
            executionFailureRecovery: recovery, taskRepository: tasks, executionControl, parallelLimit: 1 });

        const outcome = await result.run();

        expect(outcome).toMatchObject({ ok: true, value: { taskStatus: TaskStatus.REVIEW,
            attempts: [{ taskId: selected.id, status: 'SUCCEEDED' }] } });
        expect(queueRepository.getByTaskId(selected.id).state).toBe('COMPLETED');
        expect(queueRepository.getByTaskId(other.id)).toBeUndefined();
        expect(tasks.getById(other.id).status).toBe(TaskStatus.ASSIGNED);
        expect(audit.listByEntity('task', selected.id).map(({ action }) => action)).toEqual([
            'TASK_QUEUED', 'TASK_STATE_CHANGED', 'TASK_STATE_CHANGED', 'TASK_RESULT_SUBMITTED',
        ]);
    });

    it('does not enqueue unrelated tasks when selected readiness fails', async () => {
        new TaskDependencyRepository(database).create({ id: 'dependency-352', dependentTaskId: selected.id,
            dependencyTaskId: other.id });
        tasks.update(other.id, { status: TaskStatus.FAILED });
        const result = await queueWorkflow.run({ taskId: selected.id });
        expect(result.ok).toBe(true);
        expect(result.value.queued).toEqual([]);
        expect(queueRepository.getByTaskId(other.id)).toBeUndefined();
    });

    it('cancels the active selected task and persists matching task and queue states', async () => {
        const runtime = { run: vi.fn(() => new Promise(() => {})) };
        const session = createSelectedTaskExecution({ taskId: selected.id, queueWorkflow, queueRepository,
            agentRuntime: runtime, taskLifecycle: lifecycle, resultSubmissionUseCase: resultSubmission,
            executionFailureRecovery: recovery, taskRepository: tasks, executionControl, parallelLimit: 1 });
        const pending = session.run();
        await vi.waitFor(() => expect(runtime.run).toHaveBeenCalledOnce());
        session.cancel();
        const result = await pending;

        expect(result.value).toMatchObject({ taskStatus: TaskStatus.CANCELLED,
            attempts: [{ taskId: selected.id, status: 'CANCELLED', persisted: true }] });
        expect(queueRepository.getByTaskId(selected.id).state).toBe('CANCELLED');
        expect(audit.listByEntity('task', selected.id).at(-1).action).toBe('TASK_CANCELLED');
    });
});
