import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('Phase 107 — visible command-center refresh', () => {
    it('refreshes persisted state every five seconds while visible and releases its timer on dispose', () => {
        vi.useFakeTimers();
        const webview = {
            postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
        };
        const panel = { visible: true, webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const readSnapshot = vi.fn(() => createCommandCenterSnapshot({ objectives: [], tasks: [] }));
        const commandCenter = new CommandCenterPanel(readSnapshot);

        commandCenter.show();
        expect(readSnapshot).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5000);
        expect(readSnapshot).toHaveBeenCalledTimes(2);
        panel.visible = false;
        vi.advanceTimersByTime(10_000);
        expect(readSnapshot).toHaveBeenCalledTimes(2);
        commandCenter.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });
});
