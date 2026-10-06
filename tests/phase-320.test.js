/** Phase 320 — bind owner-scoped employee and task memories to authorized agent packets. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime, createEmployeeTaskMemoryProvider } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { AgentRepository, MemoryRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

const NOW = '2026-10-06T00:00:00.000Z';

describe('Phase 320 — authorized task memory context', () => {
    let connection; let database; let agents; let tasks; let memories; let hierarchyProvider;
    let task; let captured;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-320', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-320', 'org-320', 'Office', 'office-320');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-320', 'office-320', 'Department', 'department-320');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-320', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-320' });
        agents.create({ id: 'employee-320-a', name: 'Employee A', role: AgentRole.EMPLOYEE, departmentId: 'department-320' });
        agents.create({ id: 'employee-320-b', name: 'Employee B', role: AgentRole.EMPLOYEE, departmentId: 'department-320' });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-320-a', taskCode: 'PH320-001', title: 'Build cache', description: 'Persist cache between restarts.',
            creatorId: 'manager-320', assigneeId: 'employee-320-a', status: TaskStatus.IN_PROGRESS,
            acceptanceCriteria: [{ id: 'criterion-320', description: 'Cache survives restarts', required: true, met: false }] });
        tasks.create({ id: 'task-320-b', taskCode: 'PH320-002', title: 'Other task', description: 'Separate task.',
            creatorId: 'manager-320', assigneeId: 'employee-320-b', status: TaskStatus.IN_PROGRESS,
            acceptanceCriteria: [{ id: 'criterion-320-b', description: 'Separate', required: true, met: false }] });
        hierarchyProvider = { getSnapshot: () => ({ organization: { id: 'org-320', name: 'Org' },
            offices: [{ id: 'office-320', organizationId: 'org-320', name: 'Office', slug: 'office-320', status: 'ACTIVE' }],
            departments: [{ id: 'department-320', officeId: 'office-320', name: 'Department', slug: 'department-320', status: 'ACTIVE' }],
            agents: agents.list() }) };
        memories = new MemoryRepository(database);
        memories.create({ id: 'employee-memory-320-a', scope: 'EMPLOYEE', agentId: 'employee-320-a', title: 'Preference', content: 'Use small focused tests.' });
        memories.create({ id: 'employee-memory-320-b', scope: 'EMPLOYEE', agentId: 'employee-320-b', title: 'Private', content: 'Do not expose to A.' });
        memories.create({ id: 'task-memory-320-a', scope: 'TASK', taskId: task.id, title: 'Constraint', content: 'Use atomic file writes.' });
        memories.create({ id: 'task-memory-320-b', scope: 'TASK', taskId: 'task-320-b', title: 'Other task', content: 'Do not expose to A.' });
        memories.create({ id: 'expired-memory-320', scope: 'EMPLOYEE', agentId: 'employee-320-a', title: 'Expired', content: 'Not available.', expiresAt: '2026-10-05T23:59:59.999Z' });
        captured = undefined;
    });
    afterEach(() => connection.close());

    function runtime(memoryContextProvider) {
        return createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks, hierarchyProvider,
            memoryContextProvider, clock: { now: () => NOW }, idFactory: () => 'request-320',
            adapter: { execute: vi.fn(async (request) => {
                captured = request;
                return { summary: 'Cache is implemented.', acceptanceCriteria: [
                    { criterionId: 'criterion-320', met: true, evidence: 'Focused cache tests passed.' },
                ] };
            }) } });
    }

    it('injects only the assignee-owned employee and current-task memories, excluding expired rows', async () => {
        const provider = createEmployeeTaskMemoryProvider({ memoryRepository: memories, now: () => NOW });
        const useCase = runtime(provider);
        const result = await useCase.run({ agentId: 'employee-320-a', taskId: task.id, signal: new AbortController().signal,
            memoryContext: { employee: [{ id: 'forged', title: 'Injected', category: null, content: 'caller injection', verified: false }], task: [] } });
        expect(result.ok).toBe(true);
        expect(captured.memoryContext.employee.map(({ id }) => id)).toEqual(['employee-memory-320-a']);
        expect(captured.memoryContext.task.map(({ id }) => id)).toEqual(['task-memory-320-a']);
        expect(JSON.stringify(captured.memoryContext)).not.toContain('Do not expose to A');
        expect(JSON.stringify(captured.memoryContext)).not.toContain('Not available');
        expect(JSON.stringify(captured.memoryContext)).not.toContain('caller injection');
    });

    it('rejects direct memory assembly when the actor does not own the active task', () => {
        const provider = createEmployeeTaskMemoryProvider({ memoryRepository: memories, now: () => NOW });
        expect(() => provider.forTask({ actor: agents.getById('employee-320-b'), task }))
            .toThrow(/only to the persisted task assignee/);
    });
});
