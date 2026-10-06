/** Phase 353 — workspace-bound task grants are filtered before execution confirmation. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';
import { executeAssignedTask } from '../src/core/HeadroomTaskExecutionCommands';
import { ExecutionControl } from '../src/domain';
import { createWorkspaceFingerprint } from '../src/shared/workspaceFingerprint';
import { AgentRepository, ExecutionQueueRepository, OrganizationRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 353 — workspace-bound task execution prompt', () => {
    it('does not offer or queue a task whose grants were approved for another workspace', async () => {
        const activeWorkspace = await mkdtemp(join(tmpdir(), 'headroom-phase353-active-'));
        const grantedWorkspace = await mkdtemp(join(tmpdir(), 'headroom-phase353-granted-'));
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        try {
            applyMigrations(database);
            new OrganizationRepository(database).create({ id: 'organization-353', name: 'Org' });
            database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('office-353', 'organization-353', 'Office', 'office-353');
            database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('department-353', 'office-353', 'Department', 'department-353');
            const agents = new AgentRepository(database);
            agents.create({ id: 'manager-353', name: 'Manager', role: 'DEPT_MANAGER', managedDepartmentId: 'department-353' });
            agents.create({ id: 'employee-353', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-353' });
            new TaskRepository(database).create({ id: 'task-353', taskCode: 'PH353-001', title: 'Workspace-bound task',
                creatorId: 'manager-353', assigneeId: 'employee-353', status: 'ASSIGNED',
                toolPermissions: { readFiles: ['src/file.txt'], writeFiles: [], commands: [],
                    workspaceFingerprint: await createWorkspaceFingerprint(grantedWorkspace) } });
            new TaskRepository(database).create({ id: 'task-353-valid', taskCode: 'PH353-002', title: 'Matching workspace task',
                creatorId: 'manager-353', assigneeId: 'employee-353', status: 'ASSIGNED',
                toolPermissions: { readFiles: ['src/file.txt'], writeFiles: [], commands: [],
                    workspaceFingerprint: await createWorkspaceFingerprint(activeWorkspace) } });
            vscode.workspace.workspaceFolders = [{ name: 'active', uri: { fsPath: activeWorkspace } }];
            const queueRead = vi.spyOn(ExecutionQueueRepository.prototype, 'getByTaskId');

            await executeAssignedTask({ database, context: { secrets: { get: vi.fn() } },
                configuration: { aiProvider: 'gemini' }, executionControl: new ExecutionControl(),
                activity: new ExecutionActivityFeed() });

            expect(vscode.window.showQuickPick).toHaveBeenCalledOnce();
            expect(vscode.window.showQuickPick.mock.calls.at(-1)[0].map(({ task }) => task.id)).toEqual(['task-353-valid']);
            expect(queueRead.mock.calls).toEqual([['task-353-valid']]);
        } finally {
            vi.restoreAllMocks();
            vscode.workspace.workspaceFolders = [];
            connection.close();
            await rm(activeWorkspace, { recursive: true, force: true });
            await rm(grantedWorkspace, { recursive: true, force: true });
        }
    });
});
