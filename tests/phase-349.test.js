/** Phase 349 — consume persisted grants and revalidate async authorization before model execution. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedAgentRuntime, createWorkspaceFingerprint } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { createPersistedTaskToolsProvider, createWorkspaceFileAdapter } from '../src/infrastructure';
import { AgentRepository, OrganizationRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

const CRITERION = { id: 'criterion-349', description: 'Read an authorized file', required: true, met: false };
describe('Phase 349 — persisted task tools and async authorization recheck', () => {
    let workspace; let permissions;
    let connection; let database; let agents; let tasks; let employee; let task; let execute;
    beforeEach(async () => {
        workspace = await mkdtemp(join(tmpdir(), 'headroom-phase349-'));
        permissions = { readFiles: ['src/readme.txt'], writeFiles: ['src/result.txt'], commands: [],
            workspaceFingerprint: await createWorkspaceFingerprint(workspace) };
        await mkdir(join(workspace, 'src'));
        await writeFile(join(workspace, 'src', 'readme.txt'), 'authorized content');
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-349', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-349', 'organization-349', 'Office', 'office-349');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-349', 'office-349', 'Department', 'department-349');
        agents = new AgentRepository(database);
        const manager = agents.create({ id: 'manager-349', name: 'Manager', role: AgentRole.DEPT_MANAGER,
            managedDepartmentId: 'department-349' });
        employee = agents.create({ id: 'employee-349', name: 'Employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-349' });
        agents.create({ id: 'employee-349-b', name: 'Other employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-349' });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-349', taskCode: 'PH349-001', title: 'Use scoped tools', creatorId: manager.id,
            assigneeId: employee.id, status: TaskStatus.IN_PROGRESS, acceptanceCriteria: [CRITERION], toolPermissions: permissions });
        execute = vi.fn(async () => ({ summary: 'done', acceptanceCriteria: [{ criterionId: CRITERION.id,
            met: true, evidence: 'read' }] }));
    });
    afterEach(async () => { connection?.close(); if (workspace) await rm(workspace, { recursive: true, force: true }); });

    function hierarchyProvider() {
        return { getSnapshot: () => ({ organization: { id: 'organization-349', name: 'Org' },
            offices: [{ id: 'office-349', organizationId: 'organization-349', name: 'Office', slug: 'office-349', status: 'ACTIVE' }],
            departments: [{ id: 'department-349', officeId: 'office-349', name: 'Department', slug: 'department-349', status: 'ACTIVE' }],
            agents: agents.list() }) };
    }

    it('constructs runtime tools from persisted grants and denies non-granted paths', async () => {
        const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: workspace });
        const toolsProvider = createPersistedTaskToolsProvider({ workspaceRoot: workspace,
            filesystem, processRunner: { execute: vi.fn() } });
        const tools = await toolsProvider.forTask({ actor: employee, task });

        expect(await tools.filesystem.readFile('src/readme.txt')).toBe('authorized content');
        await tools.filesystem.writeFile('src/result.txt', 'approved output');
        expect(await readFile(join(workspace, 'src', 'result.txt'), 'utf8')).toBe('approved output');
        await expect(tools.filesystem.readFile('package.json')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
    });

    it('fails closed when a task has no saved grant manifest', async () => {
        const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: workspace });
        const toolsProvider = createPersistedTaskToolsProvider({ workspaceRoot: workspace,
            filesystem, processRunner: { execute: vi.fn() } });
        const tools = await toolsProvider.forTask({ actor: employee, task: { ...task, toolPermissions: null } });

        await expect(tools.filesystem.readFile('src/readme.txt')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
    });

    it('refuses to apply a saved grant manifest to a different workspace folder', async () => {
        const otherWorkspace = await mkdtemp(join(tmpdir(), 'headroom-phase349-other-'));
        try {
            const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: workspace });
            const provider = createPersistedTaskToolsProvider({ workspaceRoot: otherWorkspace, filesystem,
                processRunner: { execute: vi.fn() } });
            await expect(provider.forTask({ actor: employee, task }))
                .rejects.toMatchObject({ code: 'task-tool-workspace-mismatch' });
        } finally { await rm(otherWorkspace, { recursive: true, force: true }); }
    });

    it('rechecks persisted assignee and hierarchy after asynchronous tool-scope resolution', async () => {
        let resolveTools;
        const toolScope = { filesystem: { readFile: vi.fn(), writeFile: vi.fn() }, process: { execute: vi.fn() } };
        const useCase = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks,
            hierarchyProvider: hierarchyProvider(), adapter: { execute },
            taskToolsProvider: { forTask: () => new Promise((resolve) => { resolveTools = resolve; }) },
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => 'request-349' });
        const pending = useCase.run({ agentId: employee.id, taskId: task.id, signal: new AbortController().signal });
        await vi.waitFor(() => expect(resolveTools).toBeDefined());
        tasks.update(task.id, { assigneeId: 'employee-349-b' });
        resolveTools(toolScope);

        const result = await pending;
        expect(result.value).toMatchObject({ outcome: 'FAILED', errorCode: 'task-authorization-changed' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('returns cancellation promptly while asynchronous tool scopes are still resolving', async () => {
        let resolveTools;
        const useCase = createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks,
            hierarchyProvider: hierarchyProvider(), adapter: { execute },
            taskToolsProvider: { forTask: () => new Promise((resolve) => { resolveTools = resolve; }) },
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => 'request-349' });
        const controller = new AbortController();
        const pending = useCase.run({ agentId: employee.id, taskId: task.id, signal: controller.signal });
        await vi.waitFor(() => expect(resolveTools).toBeDefined());
        controller.abort();

        const result = await pending;
        resolveTools({ filesystem: { readFile: vi.fn(), writeFile: vi.fn() }, process: { execute: vi.fn() } });
        expect(result.value).toMatchObject({ outcome: 'CANCELLED' });
        expect(execute).not.toHaveBeenCalled();
    });
});
