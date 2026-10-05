/** Phase 214 — reuse Git inspectors across Command Center refreshes. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';

afterEach(() => { vscode.workspace.workspaceFolders = []; });

describe('Phase 214 — Git inspector refresh reuse', () => {
    it('creates one read-only adapter per active folder and reads fresh status each refresh', async () => {
        vscode.workspace.workspaceFolders = [{ name: 'repo', uri: { fsPath: 'C:\\workspace\\repo' } }];
        const getChangedFiles = vi.fn().mockResolvedValueOnce([{ path: 'one.js', status: 'MODIFIED' }])
            .mockResolvedValueOnce([{ path: 'two.js', status: 'ADDED' }]);
        const createAdapter = vi.fn().mockResolvedValue({ getChangedFiles });
        const context = new HeadroomContext({});

        const first = await context._readWorkspaceChangedFiles(createAdapter);
        const second = await context._readWorkspaceChangedFiles(createAdapter);

        expect(createAdapter).toHaveBeenCalledTimes(1);
        expect(getChangedFiles).toHaveBeenCalledTimes(2);
        expect(first).toEqual([{ path: 'one.js', status: 'MODIFIED', originalPath: undefined }]);
        expect(second).toEqual([{ path: 'two.js', status: 'ADDED', originalPath: undefined }]);
        context.dispose();
    });

    it('does not retain a rejected adapter construction promise', async () => {
        vscode.workspace.workspaceFolders = [{ name: 'repo', uri: { fsPath: 'C:\\workspace\\repo' } }];
        const createAdapter = vi.fn().mockRejectedValueOnce(new Error('private path'))
            .mockResolvedValueOnce({ getChangedFiles: async () => [] });
        const context = new HeadroomContext({});
        await context._readWorkspaceChangedFiles(createAdapter);
        await context._readWorkspaceChangedFiles(createAdapter);
        expect(createAdapter).toHaveBeenCalledTimes(2);
        context.dispose();
    });
});
