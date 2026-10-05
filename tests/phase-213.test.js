/** Phase 213 — stale asynchronous workspace snapshots cannot replace newer state. */
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel } from '../src/core/CommandCenterPanel';

describe('Phase 213 — asynchronous Command Center refresh ordering', () => {
    it('discards a slower earlier snapshot after a newer refresh has completed', async () => {
        const pending = [];
        const readSnapshot = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
        const webview = { html: '', onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })), postMessage: vi.fn().mockResolvedValue(true) };
        const panel = { webview, reveal: vi.fn(), dispose: vi.fn(), visible: true,
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const commandCenter = new CommandCenterPanel(readSnapshot);
        commandCenter.show();
        commandCenter.refresh();

        pending[1]({ revision: 2 });
        await Promise.resolve();
        expect(webview.postMessage).toHaveBeenCalledTimes(1);
        expect(webview.postMessage).toHaveBeenCalledWith({ type: 'snapshot', snapshot: { revision: 2 } });

        pending[0]({ revision: 1 });
        await Promise.resolve();
        expect(webview.postMessage).toHaveBeenCalledTimes(1);
        commandCenter.dispose();
    });

    it('reports a generic load error only for the most recent failed read', async () => {
        let rejectSnapshot;
        const webview = { html: '', onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })), postMessage: vi.fn().mockResolvedValue(true) };
        const panel = { webview, reveal: vi.fn(), dispose: vi.fn(), visible: true,
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const commandCenter = new CommandCenterPanel(() => new Promise((resolve, reject) => { rejectSnapshot = reject; }));
        commandCenter.show();
        rejectSnapshot(new Error('private Git output or path'));
        await Promise.resolve();
        await Promise.resolve();
        expect(webview.postMessage).toHaveBeenCalledWith({ type: 'loadError' });
        expect(JSON.stringify(webview.postMessage.mock.calls)).not.toContain('private Git output or path');
        commandCenter.dispose();
    });
});
