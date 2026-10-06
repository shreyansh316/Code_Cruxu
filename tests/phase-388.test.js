/** Phase 388 — expose bounded debugging start/advance actions in VS Code. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createWorkspaceFingerprint } from '../src/shared/workspaceFingerprint';
import { advanceDebuggingSession, startDebuggingSession } from '../src/core/HeadroomDebuggingCommands';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 388 — debugging session VS Code entry point', () => {
    let connection;
    afterEach(() => { connection?.close(); connection = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });

    it('starts an authorized task session only after workspace grant selection and confirmation', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-388', name: 'Organization' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-388', 'org-388', 'Office', 'office-388');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-388', 'office-388', 'Department', 'department-388');
        new AgentRepository(database).create({ id: 'employee-388', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-388' });
        const workspaceRoot = process.cwd();
        const fingerprint = await createWorkspaceFingerprint(workspaceRoot);
        new TaskRepository(database).create({ id: 'task-388', taskCode: 'PH388-001', title: 'Fix regression',
            assigneeId: 'employee-388', status: 'IN_PROGRESS', toolPermissions: {
                readFiles: ['src/example.js'], writeFiles: ['src/example.js'],
                commands: [{ command: 'node', args: ['--version'] }], workspaceFingerprint: fingerprint,
            } });
        expect(new TaskRepository(database).getById('task-388')).toMatchObject({ status: 'IN_PROGRESS', toolPermissions: { workspaceFingerprint: fingerprint } });
        const previousFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = [{ name: 'headroom', uri: { fsPath: workspaceRoot } }];
        vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => items[0]);
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Start debugging');
        try {
            await startDebuggingSession({ database, configuration: { maxWorkspaceFileBytes: 1000,
                maxWorkspaceFilesPerScan: 100, maxProcessOutputBytes: 1000 } });
            expect(new DebuggingSessionRepository(database).listByTask('task-388')).toMatchObject([
                { status: 'ACTIVE', stage: 'REPRODUCE', createdByAgentId: 'employee-388', commandBudget: 1 },
            ]);
            expect(new AuditLogRepository(database).listByTask('task-388')).toEqual(expect.arrayContaining([
                expect.objectContaining({ action: 'DEBUGGING_SESSION_STARTED', actorId: 'employee-388' }),
            ]));
        } finally { vscode.workspace.workspaceFolders = previousFolders; }
    });

    it('advances an inspection stage through the persisted read grant and presents bounded file output', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-388-inspect', name: 'Organization' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-388-inspect', 'org-388-inspect', 'Office', 'office-388-inspect');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-388-inspect', 'office-388-inspect', 'Department', 'department-388-inspect');
        new AgentRepository(database).create({ id: 'employee-388-inspect', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-388-inspect' });
        const workspaceRoot = process.cwd();
        const fingerprint = await createWorkspaceFingerprint(workspaceRoot);
        new TaskRepository(database).create({ id: 'task-388-inspect', taskCode: 'PH388-002', title: 'Inspect source',
            assigneeId: 'employee-388-inspect', status: 'IN_PROGRESS', toolPermissions: {
                readFiles: ['README.md'], writeFiles: [], commands: [], workspaceFingerprint: fingerprint,
            } });
        const sessionRepository = new DebuggingSessionRepository(database);
        const startedAt = new Date().toISOString();
        const session = sessionRepository.create({ id: 'session-388-inspect', taskId: 'task-388-inspect',
            createdByAgentId: 'employee-388-inspect', startedAt, timeBudgetMs: 300_000, commandBudget: 1,
            fileBudget: 3, tokenBudget: 2000, maxAttempts: 3 });
        sessionRepository.recordStep({ id: 'step-388-reproduce', sessionId: session.id, stage: 'REPRODUCE',
            outcome: 'PASS', summary: 'Reproduced.', files: [], commandsRun: 0, tokensUsed: 0, durationMs: 0 });
        const previousFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = [{ name: 'headroom', uri: { fsPath: workspaceRoot } }];
        vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => items[0]);
        try {
            await advanceDebuggingSession({ database, configuration: { maxWorkspaceFileBytes: 1024 * 1024,
                maxWorkspaceFilesPerScan: 100, maxProcessOutputBytes: 1000 } });
            expect(sessionRepository.getById(session.id)).toMatchObject({ stage: 'HYPOTHESIS', attemptCount: 2 });
            expect(sessionRepository.listSteps(session.id)).toMatchObject([
                { stage: 'REPRODUCE' }, { stage: 'INSPECT', toolAction: 'READ_FILE', files: ['README.md'] },
            ]);
            expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'plaintext',
                content: expect.stringContaining('HEADROOM') }));
        } finally { vscode.workspace.workspaceFolders = previousFolders; }
    });
});
