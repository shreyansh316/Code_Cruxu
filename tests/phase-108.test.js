import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 108 — command-center webview readiness', () => {
    it('resends the latest snapshot when the webview confirms its message listener is ready', () => {
        let receiveMessage;
        const webview = {
            html: '', postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
        };
        const panel = { visible: true, webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const readSnapshot = vi.fn(() => createCommandCenterSnapshot({ objectives: [], tasks: [] }));
        const commandCenter = new CommandCenterPanel(readSnapshot);

        commandCenter.show();
        expect(webview.postMessage).toHaveBeenCalledTimes(1);
        receiveMessage({ type: 'ready' });
        expect(webview.postMessage).toHaveBeenCalledTimes(2);
        expect(readSnapshot).toHaveBeenCalledTimes(2);
        expect(webview.html).toContain("api.postMessage({ type: 'ready' })");
        commandCenter.dispose();
    });
});
