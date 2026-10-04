import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 101 — command center panel foundation', () => {
    beforeEach(() => vi.clearAllMocks());

    it('builds a bounded snapshot from objectives and non-terminal tasks without leaking extra fields', () => {
        const snapshot = createCommandCenterSnapshot({
            executionStatus: 'PAUSED',
            objectives: [{ id: 'secret-id', title: 'Ship release', status: 'ACTIVE', description: 'secret context' }],
            tasks: [{ title: 'Verify package', status: 'REVIEW' }, { title: 'Done', status: 'COMPLETED' }],
        });
        expect(snapshot).toEqual({
            executionStatus: 'PAUSED',
            objectives: [{ title: 'Ship release', status: 'ACTIVE' }],
            activeTasks: [{ title: 'Verify package', status: 'REVIEW' }],
        });
        expect(JSON.stringify(snapshot)).not.toContain('secret-id');
        expect(JSON.stringify(snapshot)).not.toContain('secret context');
        expect(Object.isFrozen(snapshot.objectives)).toBe(true);
    });

    it('creates one secure panel, refreshes current state, and renders record text safely', () => {
        let receiveMessage;
        let disposed;
        const webview = {
            cspSource: 'vscode-webview://test', html: '',
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
            postMessage: vi.fn().mockResolvedValue(true),
        };
        const panel = {
            webview, reveal: vi.fn(), dispose: vi.fn(),
            onDidDispose: vi.fn((handler) => { disposed = handler; return { dispose: vi.fn() }; }),
        };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const readSnapshot = vi.fn(() => createCommandCenterSnapshot({ objectives: [], tasks: [], executionStatus: 'RUNNING' }));
        const commandCenter = new CommandCenterPanel(readSnapshot);

        commandCenter.show();
        commandCenter.show();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        expect(panel.reveal).toHaveBeenCalledTimes(1);
        expect(webview.html).toContain("default-src 'none'");
        expect(webview.html).toContain('textContent = record.title');
        expect(webview.html).not.toContain('innerHTML');
        expect(webview.postMessage).toHaveBeenCalledTimes(2);
        receiveMessage({ type: 'other' });
        expect(readSnapshot).toHaveBeenCalledTimes(2);
        receiveMessage({ type: 'refresh' });
        expect(readSnapshot).toHaveBeenCalledTimes(3);

        disposed();
        commandCenter.show();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
        commandCenter.dispose();
        expect(panel.dispose).toHaveBeenCalledTimes(1);
    });

    it('sends a generic load error without exposing repository details', () => {
        const webview = {
            postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
        };
        const panel = { webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const commandCenter = new CommandCenterPanel(() => { throw new Error('private database path'); });
        commandCenter.show();
        expect(webview.postMessage).toHaveBeenCalledWith({ type: 'loadError' });
        expect(JSON.stringify(webview.postMessage.mock.calls)).not.toContain('private database path');
        commandCenter.dispose();
    });
});
