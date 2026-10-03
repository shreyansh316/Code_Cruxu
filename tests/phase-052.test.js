/** Phase 052 — CEO objective entry through the VS Code extension commands. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { ObjectiveRepository } from '../src/storage';

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

describe('Phase 052 — CEO objective interaction', () => {
    it('collects title and scope, persists through objective intake, and refreshes the view', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showInputBox)
            .mockResolvedValueOnce('  Ship the service  ')
            .mockResolvedValueOnce('  Deliver a secure, reliable service to customers.  ');
        try {
            await context.initialize();
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            const objectives = new ObjectiveRepository(context.databaseConnection.database).list();
            expect(objectives).toHaveLength(1);
            expect(objectives[0]).toMatchObject({ title: 'Ship the service',
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

    it('refreshes Objective tree providers using the VS Code tree-change event', async () => {
        const { context, handlers } = setup();
        vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Refresh view').mockResolvedValueOnce('Persist then refresh.');
        const registered = vi.mocked(vscode.window.registerTreeDataProvider).mock.calls;
        try {
            await context.initialize();
            const providers = registered.map(([, provider]) => provider);
            const objectiveChange = vi.spyOn(providers[0]._changeEmitter, 'fire');
            const taskChange = vi.spyOn(providers[1]._changeEmitter, 'fire');
            await handlers.get(COMMANDS.NEW_OBJECTIVE)();
            expect(objectiveChange).toHaveBeenCalledWith(undefined);
            expect(taskChange).toHaveBeenCalledWith(undefined);
        }
        finally { context.dispose(); }
    });
});
