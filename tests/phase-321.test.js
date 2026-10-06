/** Phase 321 — revalidate required capabilities at execution and expose persisted skills. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { AgentRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

const CRITERION = { id: 'criterion-321', description: 'Meets the requested capability', required: true, met: false };

describe('Phase 321 — deterministic employee capability routing', () => {
    let connection; let database; let agents; let tasks; let employee; let task; let execute; let useCase;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-321', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-321', 'org-321', 'Office', 'office-321');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-321', 'office-321', 'Department', 'department-321');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-321', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-321' });
        employee = agents.create({ id: 'employee-321', name: 'Specialist', role: AgentRole.EMPLOYEE,
            departmentId: 'department-321', capabilities: ['SQLite', 'Testing'] });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-321', taskCode: 'PH321-001', title: 'Build persistent cache', creatorId: 'manager-321',
            assigneeId: employee.id, status: TaskStatus.IN_PROGRESS, requiredCapabilities: ['sqlite'], acceptanceCriteria: [CRITERION] });
        const hierarchyProvider = { getSnapshot: () => ({ organization: { id: 'org-321', name: 'Org' },
            offices: [{ id: 'office-321', organizationId: 'org-321', name: 'Office', slug: 'office-321', status: 'ACTIVE' }],
            departments: [{ id: 'department-321', officeId: 'office-321', name: 'Department', slug: 'department-321', status: 'ACTIVE' }],
            agents: agents.list() }) };
        execute = vi.fn(async () => ({ summary: 'Cache complete.', acceptanceCriteria: [
            { criterionId: CRITERION.id, met: true, evidence: 'Persistence tests passed.' },
        ] }));
        useCase = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks, hierarchyProvider,
            adapter: { execute }, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => 'request-321' });
    });
    afterEach(() => connection.close());

    it('passes immutable capabilities resolved from storage into the employee request', async () => {
        let request;
        execute.mockImplementationOnce(async (value) => { request = value; return {
            summary: 'Cache complete.', acceptanceCriteria: [{ criterionId: CRITERION.id, met: true, evidence: 'Tests passed.' }],
        }; });
        const result = await useCase.run({ agentId: employee.id, taskId: task.id, signal: new AbortController().signal });
        expect(result.ok).toBe(true);
        expect(request.agent.capabilities).toEqual(['SQLite', 'Testing']);
        expect(request.task.requiredCapabilities).toEqual(['sqlite']);
        expect(Object.isFrozen(request.agent.capabilities)).toBe(true);
        expect(Object.isFrozen(request.task.requiredCapabilities)).toBe(true);
    });

    it('blocks execution if persisted capabilities no longer satisfy the task', async () => {
        agents.update(employee.id, { capabilities: ['Testing'] });
        const result = await useCase.run({ agentId: employee.id, taskId: task.id, signal: new AbortController().signal });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('invalid-assignment');
        expect(execute).not.toHaveBeenCalled();
    });
});
