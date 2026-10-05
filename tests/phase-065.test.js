import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { AgentRepository, AuditLogRepository, ObjectiveRepository, OrganizationRepository, ProjectRepository, TaskRepository } from '../src/storage';

const directories = [];
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

function setup() {
    const directory = mkdtempSync(join(tmpdir(), 'headroom-065-'));
    directories.push(directory);
    const handlers = new Map();
    vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => { handlers.set(command, handler); return { dispose: vi.fn() }; });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined, update: vi.fn() });
    vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ show: vi.fn(), dispose: vi.fn() });
    return { handlers, context: new HeadroomContext({ subscriptions: [], globalState: { get: () => true, update: vi.fn() },
        globalStorageUri: { fsPath: directory }, secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() } }) };
}
const bundle = { schemaVersion: 1, taskId: 'task-065', provenance: { head: 'a'.repeat(40),
    beforeSnapshotId: 'before-065', afterSnapshotId: 'after-065' }, changes: {}, git: {}, checks: [], acceptance: {
        summary: 'Done', criteria: [{ criterionId: 'criterion-065', met: true, evidence: 'Passed' }],
    } };
function seedReviewScope(database) {
    new OrganizationRepository(database).create({ id: 'org-065', name: 'Task Organization' });
    new OrganizationRepository(database).create({ id: 'org-065-other', name: 'Other Organization' });
    new ObjectiveRepository(database).create({ id: 'objective-065', organizationId: 'org-065', title: 'Review objective', description: 'Scoped' });
    new ProjectRepository(database).create({ id: 'project-065', objectiveId: 'objective-065', name: 'Review project' });
    new AgentRepository(database).create({ id: 'ceo-065', organizationId: 'org-065', name: 'CEO', role: 'CEO' });
    new AgentRepository(database).create({ id: 'ceo-065-other', organizationId: 'org-065-other', name: 'Other CEO', role: 'CEO' });
}

describe('Phase 065 — human code review gate', () => {
    it('shows evidence before an explicit approval action and audits the exact evidence decision', async () => {
        const { context, handlers } = setup();
        try {
            await context.initialize();
            const db = context.databaseConnection.database;
            seedReviewScope(db);
            new TaskRepository(db).create({ id: 'task-065', taskCode: 'TASK-065', title: 'Review code', status: 'REVIEW', projectId: 'project-065',
                acceptanceCriteria: [{ id: 'criterion-065', description: 'Change is correct', required: true, met: true }],
                result: { summary: 'Done', acceptanceCriteria: [{ criterionId: 'criterion-065', met: true, evidence: 'Passed' }] } });
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Approve Changes', value: 'APPROVE' });
            await handlers.get(COMMANDS.REVIEW_TASK_CHANGES)('task-065', bundle);
            expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'json' }));
            expect(vscode.window.showTextDocument).toHaveBeenCalled();
            expect(new AuditLogRepository(db).listByTask('task-065')).toMatchObject([{ action: 'CODE_CHANGES_APPROVED', actorId: 'ceo-065' }]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Approve Changes', value: 'APPROVE' });
            const duplicate = await handlers.get(COMMANDS.REVIEW_TASK_CHANGES)('task-065', bundle);
            expect(duplicate).toBeUndefined();
            expect(new AuditLogRepository(db).listByTask('task-065')).toHaveLength(1);
        }
        finally { context.dispose(); }
    });
    it('records nothing when the human closes the decision picker', async () => {
        const { context, handlers } = setup();
        try {
            await context.initialize();
            const db = context.databaseConnection.database;
            seedReviewScope(db);
            new TaskRepository(db).create({ id: 'task-065', taskCode: 'TASK-065', title: 'Review code', status: 'REVIEW', projectId: 'project-065' });
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);
            await handlers.get(COMMANDS.REVIEW_TASK_CHANGES)('task-065', bundle);
            expect(new AuditLogRepository(db).listByTask('task-065')).toEqual([]);
        }
        finally { context.dispose(); }
    });
});
