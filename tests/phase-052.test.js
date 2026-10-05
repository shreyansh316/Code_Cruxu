/** Phase 052 — CEO objective entry through the VS Code extension commands. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { AgentRepository, AuditLogRepository, ObjectiveRepository, OrganizationRepository } from '../src/storage';

const temporaryDirectories = [];
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function setup() {
    const directory = mkdtempSync(join(tmpdir(), 'headroom-phase052-'));
    temporaryDirectories.push(directory);
    const handlers = new Map();
    vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
        handlers.set(command, handler);
        return { dispose: vi.fn() };
    });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined, update: vi.fn() });
    vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
        name: '', text: '', tooltip: '', command: '', show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
    });
    const context = new HeadroomContext({ subscriptions: [], globalState: { get: () => true, update: vi.fn() },
        globalStorageUri: { fsPath: directory }, secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() } });
    return { context, handlers };
}
function seedOrganization(context, id = 'org-052-default') {
    new OrganizationRepository(context.databaseConnection.database).create({ id, name: 'Organization' });
}

describe('Phase 052 — CEO objective interaction', () => {
    it('collects title and scope, persists through objective intake, and refreshes the view', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showInputBox)
            .mockResolvedValueOnce('  Ship the service  ')
            .mockResolvedValueOnce('  Deliver a secure, reliable service to customers.  ');
        try {
            await context.initialize();
            seedOrganization(context);
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            const objectives = new ObjectiveRepository(context.databaseConnection.database).list();
            expect(objectives).toHaveLength(1);
            expect(objectives[0]).toMatchObject({ organizationId: 'org-052-default', title: 'Ship the service',
                description: 'Deliver a secure, reliable service to customers.', status: 'NEW' });
            expect(vscode.window.showInputBox.mock.calls[0][0].validateInput('')).toMatch(/Title must/);
            expect(vscode.window.showInputBox.mock.calls[1][0].validateInput('x'.repeat(10_001))).toMatch(/Description must/);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('HEADROOM objective created and saved.');
        }
        finally { context.dispose(); }
    });

    it('handles cancellation and displays use-case validation without persisting bad input', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(undefined);
        try {
            await context.initialize();
            seedOrganization(context);
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            expect(new ObjectiveRepository(context.databaseConnection.database).list()).toEqual([]);
            vi.mocked(vscode.window.showInputBox).mockReset()
                .mockResolvedValueOnce('   ').mockResolvedValueOnce('A description');
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            expect(new ObjectiveRepository(context.databaseConnection.database).list()).toEqual([]);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'HEADROOM could not create the objective: Objective title must contain 1 to 200 characters.');
        }
        finally { context.dispose(); }
    });

    it('requires an explicit organization choice when creating objectives in a multi-organization workspace', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((items) =>
            items.find((item) => item.organization?.id === 'org-052-b'));
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Scoped objective').mockResolvedValueOnce('Owned by organization B.');
        try {
            await context.initialize();
            seedOrganization(context, 'org-052-a');
            seedOrganization(context, 'org-052-b');
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();

            expect(new ObjectiveRepository(context.databaseConnection.database).list())
                .toMatchObject([{ organizationId: 'org-052-b', title: 'Scoped objective' }]);
        }
        finally { context.dispose(); }
    });

    it('refreshes Objective tree providers using the VS Code tree-change event', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Refresh view').mockResolvedValueOnce('Persist then refresh.');
        const registered = vi.mocked(vscode.window.registerTreeDataProvider).mock.calls;
        try {
            await context.initialize();
            seedOrganization(context);
            const providers = registered.map(([, provider]) => provider);
            const objectiveChange = vi.spyOn(providers[0]._changeEmitter, 'fire');
            const taskChange = vi.spyOn(providers[1]._changeEmitter, 'fire');
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            expect(objectiveChange).toHaveBeenCalledWith(undefined);
            expect(taskChange).toHaveBeenCalledWith(undefined);
        }
        finally { context.dispose(); }
    });

    it('presents the full plan in VS Code and persists the CEO plan decision', async () => {
        const { context, handlers } = setup();
        try {
            await context.initialize();
            const database = context.databaseConnection.database;
            seedOrganization(context, 'org-052');
            new ObjectiveRepository(database).create({ id: 'objective-052', organizationId: 'org-052', title: 'Build release',
                description: 'Deliver the release.' });
            new AgentRepository(database).create({ id: 'ceo-052', organizationId: 'org-052', name: 'CEO', role: 'CEO' });
            const plan = { id: 'plan-052', objectiveId: 'objective-052', projects: [{ id: 'project-052', name: 'Project' }],
                milestones: [{ id: 'milestone-052', projectId: 'project-052', title: 'Release' }],
                tasks: [{ id: 'task-052', taskCode: 'PH052-001', title: 'Deliver', projectId: 'project-052', milestoneId: 'milestone-052',
                    acceptanceCriteria: [{ id: 'criterion-052', description: 'Release is ready', required: true, met: false }] }],
                dependencies: [] };
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Approve Plan', value: 'APPROVED' });
            const approved = await handlers.get(COMMANDS.REVIEW_PLAN)(plan);
            expect(approved.approval).toMatchObject({ decision: 'APPROVED', approverId: 'ceo-052', approverRole: 'CEO' });
            expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'json' }));
            expect(vscode.window.showTextDocument).toHaveBeenCalled();
            expect(new AuditLogRepository(database).listByEntity('execution-plan', 'plan-052'))
                .toMatchObject([{ action: 'PLAN_DECISION_RECORDED', actorId: 'ceo-052', details: { decision: 'APPROVED' } }]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Reject Plan', value: 'REJECTED' });
            await handlers.get(COMMANDS.REVIEW_PLAN)(plan);
            expect(new AuditLogRepository(database).listByEntity('execution-plan', 'plan-052')).toHaveLength(1);
        }
        finally { context.dispose(); }
    });
});
