/** Phase 218 — refresh workspace snapshot on editor and folder changes. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel } from '../src/core/CommandCenterPanel';

afterEach(() => {
    delete vscode.window.onDidChangeActiveTextEditor;
    delete vscode.workspace.onDidChangeWorkspaceFolders;
});

describe('Phase 218 — workspace-triggered Command Center refresh', () => {
    it('refreshes promptly and disposes editor and workspace listeners with the panel', () => {
        let editorChanged;
        let foldersChanged;
        const editorSubscription = { dispose: vi.fn() };
        const folderSubscription = { dispose: vi.fn() };
        vscode.window.onDidChangeActiveTextEditor = vi.fn((callback) => { editorChanged = callback; return editorSubscription; });
        vscode.workspace.onDidChangeWorkspaceFolders = vi.fn((callback) => { foldersChanged = callback; return folderSubscription; });
        const webview = { html: '', onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })), postMessage: vi.fn().mockResolvedValue(true) };
        const panel = { webview, reveal: vi.fn(), dispose: vi.fn(), visible: true,
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const readSnapshot = vi.fn(() => ({ workspace: { activeFile: 'active.js' } }));
        const commandCenter = new CommandCenterPanel(readSnapshot);
        commandCenter.show();
        const initialReads = readSnapshot.mock.calls.length;

        editorChanged();
        foldersChanged();
        expect(readSnapshot).toHaveBeenCalledTimes(initialReads + 2);

        commandCenter.dispose();
        expect(editorSubscription.dispose).toHaveBeenCalledOnce();
        expect(folderSubscription.dispose).toHaveBeenCalledOnce();
    });
});
