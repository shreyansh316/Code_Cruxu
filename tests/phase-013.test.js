/** Phase 013 — deterministic pause and resume execution controls. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { ExecutionControl } from '../src/domain';
import { HeadroomContext } from '../src/core/HeadroomContext';

const temporaryDirectories = [];

function makeContext(directory) {
    return {
        subscriptions: [],
        globalState: { get: () => true, update: vi.fn().mockResolvedValue(undefined) },
        globalStorageUri: { fsPath: directory },
    };
}

function configureCommands() {
    const handlers = new Map();
    vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
        handlers.set(command, handler);
        return { dispose: vi.fn() };
    });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined });
    vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
        name: '', text: '', tooltip: '', command: '',
        show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
    });
    return handlers;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('Phase 013 — execution controls', () => {
    it('starts running and makes pause and resume idempotent', () => {
        const control = new ExecutionControl();
        expect(control.status).toBe('RUNNING');
        expect(control.pause()).toEqual({ status: 'PAUSED', changed: true });
        expect(control.pause()).toEqual({ status: 'PAUSED', changed: false });
        expect(control.resume()).toEqual({ status: 'RUNNING', changed: true });
        expect(control.resume()).toEqual({ status: 'RUNNING', changed: false });
    });

    it('exposes idempotent state changes and current state through VS Code commands', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase013-'));
        temporaryDirectories.push(directory);
        const handlers = configureCommands();
        const context = new HeadroomContext(makeContext(directory));
        await context.initialize();
        expect(context.executionState).toBe('RUNNING');

        handlers.get(COMMANDS.PAUSE_EXECUTION)();
        expect(context.executionState).toBe('PAUSED');
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('HEADROOM: Execution paused.');
        handlers.get(COMMANDS.PAUSE_EXECUTION)();
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('HEADROOM: Execution is already paused.');

        handlers.get(COMMANDS.SHOW_STATUS)();
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('HEADROOM Status: Active — Execution paused.');

        handlers.get(COMMANDS.RESUME_EXECUTION)();
        expect(context.executionState).toBe('RUNNING');
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('HEADROOM: Execution resumed.');
        handlers.get(COMMANDS.RESUME_EXECUTION)();
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('HEADROOM: Execution is already running.');
        context.dispose();
    });
});
