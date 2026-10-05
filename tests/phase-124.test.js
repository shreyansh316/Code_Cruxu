/** Phase 124 — paused execution prevents new Director provider work. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';

const directories = [];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Phase 124 — execution pause gates Director requests', () => {
    it('refuses both analysis and plan requests without opening the objective picker or calling a provider', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase-124-'));
        directories.push(directory);
        const registrations = new Map();
        const disposable = { dispose: vi.fn() };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: (key) => ({ 'ai.provider': 'gemini', 'ai.reasoningModel': 'gemini-test-model' })[key],
        });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue(disposable);
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
            registrations.set(id, handler);
            return disposable;
        });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ ...disposable, show: vi.fn() });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const context = new HeadroomContext({ subscriptions: [],
            globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory },
            secrets: { get: vi.fn(async () => 'test-gemini-credential'), store: vi.fn(), delete: vi.fn() },
        });
        try {
            await context.initialize();
            await registrations.get('headroom.pauseExecution')();
            await registrations.get('headroom.analyzeObjective')();
            await registrations.get('headroom.proposePlan')();

            expect(context.executionState).toBe('PAUSED');
            expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Execution is paused. Resume execution before starting a Director request.');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(3);
        } finally {
            context.dispose();
        }
    });
});
