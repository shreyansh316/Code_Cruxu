/** Phase 391 — expose confirmed debugging-session stop while preserving evidence. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { stopDebuggingSession } from '../src/core/HeadroomDebuggingCommands';
import { createWorkspaceFingerprint } from '../src/shared/workspaceFingerprint';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 391 — stop debugging session', () => {
    let connection;
    afterEach(() => { connection?.close(); connection = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });

    it('requires a confirmation, stops the active session and retains its steps with an audit record', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-391', name: 'Organization' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-391', 'org-391', 'Office', 'office-391');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-391', 'office-391', 'Department', 'department-391');
        new AgentRepository(database).create({ id: 'employee-391', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-391' });
        const workspaceRoot = process.cwd();
        const fingerprint = await createWorkspaceFingerprint(workspaceRoot);
        new TaskRepository(database).create({ id: 'task-391', taskCode: 'PH391-001', title: 'Debug issue',
            assigneeId: 'employee-391', status: 'IN_PROGRESS', toolPermissions: { readFiles: [], writeFiles: [],
                commands: [], workspaceFingerprint: fingerprint } });
        const sessions = new DebuggingSessionRepository(database);
        const startedAt = new Date().toISOString();
        sessions.create({ id: 'session-391', taskId: 'task-391', createdByAgentId: 'employee-391', startedAt,
            maxAttempts: 2, fileBudget: 2, commandBudget: 2, tokenBudget: 1000, timeBudgetMs: 60_000 });
        sessions.recordStep({ id: 'step-391-reproduce', sessionId: 'session-391', stage: 'REPRODUCE', outcome: 'PASS',
            summary: 'Reproduced failure.', files: [], commandsRun: 0, tokensUsed: 0, durationMs: 10 });
        sessions.recordStep({ id: 'step-391', sessionId: 'session-391', stage: 'INSPECT', outcome: 'PASS',
            summary: 'Reproduced failure.', files: ['src/failure.js'], commandsRun: 0, tokensUsed: 0, durationMs: 10,
            toolAction: 'READ_FILE' });
        const previousFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = [{ name: 'headroom', uri: { fsPath: workspaceRoot } }];
        vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => items[0]);
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('Waiting for clarification.');
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Stop session');
        try {
            await stopDebuggingSession({ database });
            expect(sessions.getById('session-391')).toMatchObject({ status: 'STOPPED', stopReason: 'user-requested' });
            expect(sessions.listSteps('session-391')).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'step-391', files: ['src/failure.js'], toolAction: 'READ_FILE' }),
            ]));
            expect(new AuditLogRepository(database).listByTask('task-391')).toEqual(expect.arrayContaining([
                expect.objectContaining({ action: 'DEBUGGING_SESSION_STOPPED', actorId: 'employee-391' }),
            ]));
        } finally { vscode.workspace.workspaceFolders = previousFolders; }
    });
});
