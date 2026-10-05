/** Phase 206 — confined create/delete/rename workspace file operations. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter } from '../src/infrastructure';

const roots = [];
async function temporaryDirectory() {
    const root = await mkdtemp(join(tmpdir(), 'headroom-file-ops-'));
    roots.push(root);
    return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 206 — workspace file operations', () => {
    it('creates exclusively, renames without overwriting, and deletes regular files', async () => {
        const root = await temporaryDirectory();
        const onActivity = vi.fn();
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root, onActivity });
        await files.createFile('created.txt', 'safe content');
        await expect(files.createFile('created.txt', 'replacement')).rejects.toThrow();
        await files.renameFile('created.txt', 'renamed.txt');
        expect(await readFile(join(root, 'renamed.txt'), 'utf8')).toBe('safe content');
        await writeFile(join(root, 'existing.txt'), 'keep me');
        await expect(files.renameFile('renamed.txt', 'existing.txt')).rejects.toMatchObject({ code: 'workspace-file-already-exists' });
        await files.deleteFile('renamed.txt');
        await expect(readFile(join(root, 'renamed.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(onActivity.mock.calls.map(([event]) => event.operation)).toEqual(['create', 'create', 'rename', 'rename', 'delete']);
    });

    it('rejects path escapes, symlinks, and missing sources', async () => {
        const root = await temporaryDirectory();
        const outsideRoot = await temporaryDirectory();
        await writeFile(join(outsideRoot, 'secret.txt'), 'outside');
        await symlink(outsideRoot, join(root, 'outside-link'), 'junction');
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root });
        await expect(files.createFile('../outside.txt', 'x')).rejects.toMatchObject({ code: 'workspace-path-escape' });
        await expect(files.renameFile('missing.txt', 'new.txt')).rejects.toThrow();
        await expect(files.deleteFile('../secret.txt')).rejects.toMatchObject({ code: 'workspace-path-escape' });
        await expect(files.deleteFile('outside-link/secret.txt')).rejects.toMatchObject({ code: 'workspace-path-escape' });
    });

    it('applies the task write grant to create, delete, and both sides of rename', async () => {
        const root = await temporaryDirectory();
        const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: root });
        const tools = await createTaskScopedTools({ workspaceRoot: root, filesystem,
            processRunner: { execute: async () => ({ exitCode: 0 }) },
            permissions: { readFiles: [], writeFiles: ['allowed.txt', 'renamed.txt'], commands: [] } });
        await tools.filesystem.createFile('allowed.txt', 'granted');
        await expect(tools.filesystem.createFile('denied.txt', 'no')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        await expect(tools.filesystem.renameFile('allowed.txt', 'denied.txt')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        await tools.filesystem.renameFile('allowed.txt', 'renamed.txt');
        await tools.filesystem.deleteFile('renamed.txt');
    });
});
