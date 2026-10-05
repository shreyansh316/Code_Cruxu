/** Phase 279 — block Windows alternate data stream paths at workspace boundaries. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter } from '../src/infrastructure';

const roots = [];
async function workspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-ads-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 279 — alternate data stream path denial', () => {
    it('rejects stream syntax even when the base file exists in the workspace', async () => {
        const root = await workspace();
        await writeFile(join(root, 'source.txt'), 'ordinary file');
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root });
        await expect(files.readFile('source.txt:private')).rejects.toMatchObject({ code: 'invalid-workspace-path' });
        await expect(files.writeFile('source.txt:private', 'hidden')).rejects.toMatchObject({ code: 'invalid-workspace-path' });
        await expect(files.renameFile('source.txt', 'source.txt:hidden')).rejects.toMatchObject({ code: 'invalid-workspace-path' });
    });

    it('rejects alternate stream syntax in task permission manifests and tool calls', async () => {
        const root = await workspace();
        const filesystem = { readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn(), deleteFile: vi.fn(), renameFile: vi.fn() };
        const base = { workspaceRoot: root, filesystem, processRunner: { execute: vi.fn() } };
        await expect(createTaskScopedTools({ ...base, permissions: { readFiles: ['source.txt:private'], writeFiles: [], commands: [] } }))
            .rejects.toMatchObject({ code: 'invalid-task-tool-permissions' });
        const tools = await createTaskScopedTools({ ...base, permissions: { readFiles: ['source.txt'], writeFiles: [], commands: [] } });
        expect(() => tools.filesystem.readFile('source.txt:private'))
            .toThrow(expect.objectContaining({ code: 'invalid-task-tool-permissions' }));
        expect(filesystem.readFile).not.toHaveBeenCalled();
    });
});
