import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createStructuredEmployeeRuntime, createWorkspaceFingerprint } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { configureTaskToolPermissions } from '../src/core/HeadroomAdministrationCommands';
import { createPersistedTaskToolsProvider, createWorkspaceFileAdapter } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ObjectiveRepository, OrganizationRepository, ProjectRepository,
    TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 350 — composed persisted employee execution runtime', () => {
    let workspace; let connection; let database; let agents; let tasks; let employee; let task;
    beforeEach(async () => {
        workspace = await mkdtemp(join(tmpdir(), 'headroom-phase350-'));
        await mkdir(join(workspace, 'src'));
        await writeFile(join(workspace, 'src', 'input.txt'), 'bounded evidence');
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-350', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-350', 'organization-350', 'Office', 'office-350');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-350', 'office-350', 'Department', 'department-350');
        agents = new AgentRepository(database);
        const manager = agents.create({ id: 'manager-350', name: 'Manager', role: AgentRole.DEPT_MANAGER,
            managedDepartmentId: 'department-350' });
        employee = agents.create({ id: 'employee-350', name: 'Employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-350' });
        tasks = new TaskRepository(database);
        const workspaceFingerprint = await createWorkspaceFingerprint(workspace);
        task = tasks.create({ id: 'task-350', taskCode: 'PH350-001', title: 'Inspect input', creatorId: manager.id,
            assigneeId: employee.id, status: TaskStatus.IN_PROGRESS,
            acceptanceCriteria: [{ id: 'criterion-350', description: 'Use observed evidence', required: true, met: false }],
            tokenBudget: 500, timeBudgetMs: 10_000, maxRetries: 1, retryCount: 0,
            toolPermissions: { readFiles: ['src/input.txt'], writeFiles: [], commands: [], workspaceFingerprint } });
    });
    afterEach(async () => { vscode.workspace.workspaceFolders = []; connection?.close();
        if (workspace) await rm(workspace, { recursive: true, force: true }); });

    it('executes structured model actions through a task-budgeted provider and persisted grants', async () => {
        const generated = [];
        const provider = { generate: vi.fn(async (request, options) => {
            generated.push({ request, options });
            return { finishReason: 'STOP', usage: { inputTokens: 12, outputTokens: 5 }, output: generated.length === 1
                ? { kind: 'TOOL', tool: 'readFile', arguments: { path: 'src/input.txt' } }
                : { kind: 'RESULT', result: { summary: 'Inspected the input.', acceptanceCriteria: [
                    { criterionId: 'criterion-350', met: true, evidence: 'File contained bounded evidence.' },
                ] } } };
        }) };
        const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: workspace });
        const taskToolsProvider = createPersistedTaskToolsProvider({ workspaceRoot: workspace, filesystem,
            processRunner: { execute: vi.fn() } });
        const runtime = createStructuredEmployeeRuntime({ agentRepository: agents, taskRepository: tasks,
            hierarchyProvider: { getSnapshot: () => ({ organization: { id: 'organization-350', name: 'Org' },
                offices: [{ id: 'office-350', organizationId: 'organization-350', name: 'Office', slug: 'office-350', status: 'ACTIVE' }],
                departments: [{ id: 'department-350', officeId: 'office-350', name: 'Department', slug: 'department-350', status: 'ACTIVE' }],
                agents: agents.list() }) },
            taskToolsProvider, provider, model: 'gemini-flash', idFactory: (() => { let id = 0; return () => `phase350-request-${++id}`; })(),
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') },
            baseBudget: { maxInputTokens: 1000, maxOutputTokens: 128, timeoutMs: 5000, maxRetries: 0,
                retryDelayMs: 0, maxTotalTokens: 400 },
        });

        const result = await runtime.run({ agentId: employee.id, taskId: task.id, signal: new AbortController().signal });

        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ outcome: 'SUCCEEDED', result: { summary: 'Inspected the input.' } });
        expect(provider.generate).toHaveBeenCalledTimes(2);
        expect(generated[0].options.budget).toMatchObject({ maxTotalTokens: 400, maxOutputTokens: 128, timeoutMs: 5000 });
        expect(generated[0].request.input.availableTools).toContain('readFile');
        expect(generated[1].request.input.interactions[0].output).toBe('bounded evidence');
    });

    it('does not call the provider when persisted task authorization no longer matches', async () => {
        const provider = { generate: vi.fn() };
        let hierarchyReads = 0;
        const runtime = createStructuredEmployeeRuntime({ agentRepository: agents, taskRepository: tasks,
            hierarchyProvider: { getSnapshot: () => ({ organization: { id: 'organization-350', name: 'Org' },
                offices: [{ id: 'office-350', organizationId: 'organization-350', name: 'Office', slug: 'office-350', status: 'ACTIVE' }],
                departments: [{ id: 'department-350', officeId: 'office-350', name: 'Department', slug: 'department-350', status: 'ACTIVE' }],
                agents: ++hierarchyReads === 1 ? agents.list() : agents.list().filter((agent) => agent.id !== employee.id) }) },
            taskToolsProvider: { forTask: vi.fn(async () => ({ filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
                process: { execute: vi.fn() } })) }, provider, model: 'gemini-flash', idFactory: () => 'phase350-request',
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') } });

        const result = await runtime.run({ agentId: employee.id, taskId: task.id, signal: new AbortController().signal });

        expect(result.value).toMatchObject({ outcome: 'FAILED', errorCode: 'task-authorization-changed' });
        expect(provider.generate).not.toHaveBeenCalled();
    });

    it('exposes CEO permission approval through the VS Code flow and persists the audited manifest', async () => {
        vscode.workspace.workspaceFolders = [{ name: 'phase350-workspace', uri: { fsPath: workspace } }];
        new ObjectiveRepository(database).create({ id: 'objective-350', organizationId: 'organization-350',
            title: 'Objective', description: 'Task tools', status: 'ACTIVE' });
        new ProjectRepository(database).create({ id: 'project-350', name: 'Project', objectiveId: 'objective-350' });
        const ceo = agents.create({ id: 'ceo-350', name: 'CEO', role: AgentRole.CEO, organizationId: 'organization-350' });
        tasks.update(task.id, { status: TaskStatus.ASSIGNED, projectId: 'project-350' });
        vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((items) => items.find((item) => item.task?.id === task.id));
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(JSON.stringify({
            readFiles: ['src/input.txt'], writeFiles: [], commands: [],
        }));
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Save permissions');

        await configureTaskToolPermissions({ database });
        vscode.workspace.workspaceFolders = [];

        expect(tasks.getById(task.id).toolPermissions).toMatchObject({ readFiles: ['src/input.txt'], writeFiles: [], commands: [],
            workspaceFingerprint: await createWorkspaceFingerprint(workspace) });
        expect(new AuditLogRepository(database).listRecent({ limit: 10 })).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'TASK_TOOL_PERMISSIONS_CONFIGURED', actorId: ceo.id, taskId: task.id,
                details: { readFileCount: 1, writeFileCount: 0, commandCount: 0 } }),
        ]));
    });
});
