/** Phase 123 — cancel an active Director provider request from the extension command. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { ObjectiveRepository, OrganizationRepository } from '../src/storage';

const directories = [];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Phase 123 — Director request cancellation', () => {
    it('aborts the in-flight Gemini request and leaves no clarification record', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase-123-'));
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
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ objectiveId: 'objective-cancel-123' });
        vi.mocked(vscode.window.showWarningMessage)
            .mockResolvedValueOnce('Send to Gemini')
            .mockResolvedValueOnce('Cancel Execution');
        let generateSignal;
        const fetchMock = vi.fn(async (url, options) => {
            if (String(url).endsWith(':countTokens')) return { ok: true, json: async () => ({ totalTokens: 10 }) };
            generateSignal = options.signal;
            return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const context = new HeadroomContext({ subscriptions: [],
            globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory },
            secrets: { get: vi.fn(async () => 'test-gemini-credential'), store: vi.fn(), delete: vi.fn() },
        });
        try {
            await context.initialize();
            const database = context._databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'organization-cancel-123', name: 'Cancellation Test' });
            new ObjectiveRepository(database).create({ id: 'objective-cancel-123', organizationId: 'organization-cancel-123',
                title: 'Clarify launch target', description: 'Plan the mobile application launch.' });

            const analysis = registrations.get('headroom.analyzeObjective')();
            await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
            await registrations.get('headroom.cancelExecution')();
            await analysis;

            expect(generateSignal.aborted).toBe(true);
            expect(context.executionState).toBe('CANCELLED');
            expect(database.prepare('SELECT COUNT(*) AS count FROM director_questions').get().count).toBe(0);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('The Director request was cancelled.');
        } finally {
            context.dispose();
        }
    });
});
