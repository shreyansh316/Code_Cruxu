import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 105 — persisted command-center section preferences', () => {
    it('accepts only known section identifiers and removes duplicate preferences', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            collapsedSections: ['tasks', 'invalid-section', 'tasks', 'activity'] });
        expect(snapshot.collapsedSections).toEqual(['tasks', 'activity']);
        expect(Object.isFrozen(snapshot.collapsedSections)).toBe(true);
    });

    it('persists only well-formed visibility changes from the webview', () => {
        let receiveMessage;
        const webview = {
            html: '', postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
        };
        const panel = { webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const persist = vi.fn().mockResolvedValue(true);
        const commandCenter = new CommandCenterPanel(() => createCommandCenterSnapshot({ objectives: [], tasks: [] }), persist);
        commandCenter.show();

        receiveMessage({ type: 'setSectionCollapsed', section: 'tasks', collapsed: true });
        receiveMessage({ type: 'setSectionCollapsed', section: 'tasks', collapsed: 'yes' });
        receiveMessage({ type: 'setSectionCollapsed', section: 'account-data', collapsed: true });
        expect(persist).toHaveBeenCalledTimes(1);
        expect(persist).toHaveBeenCalledWith('tasks', true);
        expect(webview.html).toContain('aria-controls="director-questions"');
        expect(webview.html).toContain("api.postMessage({ type: 'setSectionCollapsed', section, collapsed })");
        expect(renderCommandCenterHtml()).toContain('snapshot.collapsedSections');
        commandCenter.dispose();
    });
});
