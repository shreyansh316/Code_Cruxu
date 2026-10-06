/** Phase 322 — enforce persisted task time budgets at the authorized runtime boundary. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { AgentRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

const CRITERION = { id: 'criterion-322', description: 'Complete within deadline', required: true, met: false };

describe('Phase 322 — task execution deadline', () => {
    let connection; let tasks; let task; let execute; let useCase;
    beforeEach(() => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-322', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-322', 'org-322', 'Office', 'office-322');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-322', 'office-322', 'Department', 'department-322');
        const agents = new AgentRepository(database);
        agents.create({ id: 'manager-322', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-322' });
        const employee = agents.create({ id: 'employee-322', name: 'Specialist', role: AgentRole.EMPLOYEE, departmentId: 'department-322' });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-322', taskCode: 'PH322-001', title: 'Bounded execution', creatorId: 'manager-322',
            assigneeId: employee.id, status: TaskStatus.IN_PROGRESS, timeBudgetMs: 1_000, acceptanceCriteria: [CRITERION] });
        const hierarchyProvider = { getSnapshot: () => ({ organization: { id: 'org-322', name: 'Org' },
            offices: [{ id: 'office-322', organizationId: 'org-322', name: 'Office', slug: 'office-322', status: 'ACTIVE' }],
            departments: [{ id: 'department-322', officeId: 'office-322', name: 'Department', slug: 'department-322', status: 'ACTIVE' }],
            agents: agents.list() }) };
        execute = vi.fn(async () => ({ summary: 'Done', acceptanceCriteria: [
            { criterionId: CRITERION.id, met: true, evidence: 'Finished.' },
        ] }));
        useCase = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks, hierarchyProvider,
            adapter: { execute }, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => 'request-322' });
    });
    afterEach(() => connection.close());

    it('aborts an over-budget adapter and returns a stable failed response even if it ignores cancellation', async () => {
        tasks.update(task.id, { timeBudgetMs: 15 });
        let adapterSignal;
        execute.mockImplementationOnce((request, { signal }) => {
            adapterSignal = signal;
            return new Promise(() => {});
        });
        const response = await useCase.run({ agentId: 'employee-322', taskId: task.id, signal: new AbortController().signal });
        expect(response.ok).toBe(true);
        expect(response.value.outcome).toBe('FAILED');
        expect(response.value.errorCode).toBe('task-time-budget-exceeded');
        expect(adapterSignal.aborted).toBe(true);
    });

    it('does not start an adapter when the persisted task budget is zero', async () => {
        tasks.update(task.id, { timeBudgetMs: 0 });
        const response = await useCase.run({ agentId: 'employee-322', taskId: task.id, signal: new AbortController().signal });
        expect(response.ok).toBe(true);
        expect(response.value.outcome).toBe('FAILED');
        expect(response.value.errorCode).toBe('task-time-budget-exceeded');
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not reset the task wall-clock deadline when a persisted retry starts late', async () => {
        tasks.update(task.id, { startedAt: '2026-10-05T23:59:59.500Z', timeBudgetMs: 500 });
        const response = await useCase.run({ agentId: 'employee-322', taskId: task.id,
            signal: new AbortController().signal });
        expect(response.ok).toBe(true);
        expect(response.value.outcome).toBe('FAILED');
        expect(response.value.errorCode).toBe('task-time-budget-exceeded');
        expect(execute).not.toHaveBeenCalled();
    });

    it('propagates caller cancellation and classifies it separately from a deadline', async () => {
        let adapterSignal;
        execute.mockImplementationOnce((request, { signal }) => {
            adapterSignal = signal;
            return new Promise(() => {});
        });
        const controller = new AbortController();
        const pending = useCase.run({ agentId: 'employee-322', taskId: task.id, signal: controller.signal });
        await vi.waitFor(() => expect(adapterSignal).toBeDefined());
        controller.abort();
        const response = await pending;
        expect(response.ok).toBe(true);
        expect(response.value.outcome).toBe('CANCELLED');
        expect(adapterSignal.aborted).toBe(true);
    });
});
