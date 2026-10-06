import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';

const directories = [];
function setup() {
    const directory = mkdtempSync(join(tmpdir(), 'headroom-084-'));
    directories.push(directory);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined });
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
    return { directory, extension: { subscriptions: [], globalState: { get: () => true, update: vi.fn() },
        globalStorageUri: { fsPath: directory } } };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Phase 084 — extension lifecycle hardening', () => {
    it('shares concurrent initialization and disposes every registration in reverse order once', async () => {
        const registrations = [];
        const disposals = [];
        const created = [];
        const disposable = (label) => {
            created.push(label);
            return { dispose: vi.fn(() => disposals.push(label)) };
        };
        vi.mocked(vscode.window.registerTreeDataProvider).mockImplementation((id) => {
            registrations.push(`tree:${id}`);
            return disposable(`tree:${id}`);
        });
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id) => {
            registrations.push(`command:${id}`);
            return disposable(`command:${id}`);
        });
        vi.mocked(vscode.window.createStatusBarItem).mockImplementation(() => ({
            show: vi.fn(), hide: vi.fn(), ...disposable('statusbar'),
        }));
        const { directory, extension } = setup();
        const context = new HeadroomContext(extension);
        await Promise.all([context.initialize(), context.initialize()]);
        expect(context.isInitialized).toBe(true);
        expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(26);
        expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledTimes(4);
        expect(extension.subscriptions).toHaveLength(registrations.length + 6);
        context.dispose();
        context.dispose();
        expect(disposals).toEqual([...created].reverse());
        expect(extension.subscriptions).toEqual([]);
        expect(context.databaseConnection.isOpen).toBe(false);
        expect(context.isInitialized).toBe(false);
        expect(directory).toBeDefined();
    });

    it('rolls back earlier registrations and closes SQLite when a later command registration fails', async () => {
        const disposed = [];
        let registrations = 0;
        vi.mocked(vscode.window.registerTreeDataProvider).mockImplementation((id) => ({ dispose: () => disposed.push(`tree:${id}`) }));
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id) => {
            registrations += 1;
            if (registrations === 3) throw new Error('registration failed');
            return { dispose: () => disposed.push(`command:${id}`) };
        });
        const { extension } = setup();
        const context = new HeadroomContext(extension);
        await expect(context.initialize()).rejects.toThrow('registration failed');
        expect(context.databaseConnection.isOpen).toBe(false);
        expect(context.isInitialized).toBe(false);
        expect(extension.subscriptions).toEqual([]);
        expect(disposed).toHaveLength(6);
        expect(disposed[0]).toMatch(/^command:/);
        expect(disposed.at(-1)).toBe(`tree:headroom.organizationView`);
    });

    it('requires explicit confirmation before cancelling execution and treats repeat cancellation as idempotent', async () => {
        const { extension } = setup();
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.commands.registerCommand).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Cancel Execution');
        const context = new HeadroomContext(extension);
        await context.initialize();

        const cancel = vi.mocked(vscode.commands.registerCommand).mock.calls
            .find(([command]) => command === 'headroom.cancelExecution')[1];
        await cancel();
        expect(context.executionState).toBe('CANCELLED');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Cancel the current HEADROOM execution? This action cannot be undone.',
            { modal: true }, 'Cancel Execution');

        vi.mocked(vscode.window.showWarningMessage).mockClear();
        await cancel();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        context.dispose();
    });
});
