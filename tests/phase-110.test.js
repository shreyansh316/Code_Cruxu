import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { COMMANDS } from '../src/constants';

describe('Phase 110 — command-center objective intake', () => {
    it('routes a payload-free webview action through the existing objective command', () => {
        let receiveMessage;
        const webview = {
            html: '', postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
        };
        const panel = { visible: true, webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        vscode.commands.executeCommand.mockResolvedValue(undefined);
        const commandCenter = new CommandCenterPanel(() => createCommandCenterSnapshot({ objectives: [], tasks: [] }));
        commandCenter.show();

        receiveMessage({ type: 'newObjective', title: 'untrusted webview payload' });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(COMMANDS.NEW_OBJECTIVE);
        expect(vscode.commands.executeCommand.mock.calls[0]).toHaveLength(1);
        expect(webview.html).toContain('New objective');
        expect(webview.html).toContain("api.postMessage({ type: 'newObjective' })");
        commandCenter.dispose();
    });
});
