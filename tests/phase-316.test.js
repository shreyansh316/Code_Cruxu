/** Phase 316 — authorized agent execution accepts native cancellation signals only. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { AgentRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 316 — trusted cancellation signal', () => {
    let connection; let useCase; let execute;
    beforeEach(() => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-316', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-316', 'org-316', 'Office', 'office-316');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-316', 'office-316', 'Department', 'department-316');
        const agents = new AgentRepository(database);
        agents.create({ id: 'manager-316', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-316' });
        agents.create({ id: 'employee-316', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-316' });
        const tasks = new TaskRepository(database);
        tasks.create({ id: 'task-316', taskCode: 'PH316-001', title: 'Task', creatorId: 'manager-316', assigneeId: 'employee-316',
            status: TaskStatus.IN_PROGRESS, acceptanceCriteria: [{ id: 'criterion-316', description: 'Pass', required: true, met: false }] });
        const hierarchyProvider = { getSnapshot: () => ({ agents: agents.list(), organization: { id: 'org-316', name: 'Org' },
            offices: [{ id: 'office-316', organizationId: 'org-316', name: 'Office', slug: 'office-316', status: 'ACTIVE' }],
            departments: [{ id: 'department-316', officeId: 'office-316', name: 'Department', slug: 'department-316', status: 'ACTIVE' }] }) };
        execute = vi.fn(async () => ({ summary: 'done', acceptanceCriteria: [{ criterionId: 'criterion-316', met: true, evidence: 'passed' }] }));
        useCase = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks, hierarchyProvider,
            adapter: { execute }, clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => 'request-316' });
    });
    afterEach(() => connection.close());

    it('rejects forged duck-typed signals before the execution adapter runs', async () => {
        const result = await useCase.run({ taskId: 'task-316', agentId: 'employee-316',
            signal: { aborted: false, addEventListener() {} } });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('invalid-agent-request');
        expect(execute).not.toHaveBeenCalled();
    });

    it('still accepts the platform AbortSignal', async () => {
        const result = await useCase.run({ taskId: 'task-316', agentId: 'employee-316', signal: new AbortController().signal });
        expect(result.ok).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });
});
