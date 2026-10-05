/** Phase 281 — deny Windows device aliases in workspace file and task paths. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter } from '../src/infrastructure';

const roots = [];
async function makeWorkspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-device-path-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 281 — Windows device path denial', () => {
    it('rejects reserved device names, including names with extensions, before file access', async () => {
        const root = await makeWorkspace();
        const filesystem = await createWorkspaceFileAdapter({ workspaceRoot: root });
        for (const path of ['NUL', 'CON', 'nul.txt', 'COM1.log', 'nested/LPT9.data']) {
            await expect(filesystem.readFile(path)).rejects.toMatchObject({ code: 'invalid-workspace-path' });
            await expect(filesystem.writeFile(path, 'blocked')).rejects.toMatchObject({ code: 'invalid-workspace-path' });
        }
    });

    it('refuses reserved names in task path grants before handing out tools', async () => {
        const root = await makeWorkspace();
        await expect(createTaskScopedTools({ workspaceRoot: root,
            filesystem: { readFile: vi.fn(), writeFile: vi.fn() }, processRunner: { execute: vi.fn() },
            permissions: { readFiles: ['NUL.txt'], writeFiles: [], commands: [] } }))
            .rejects.toMatchObject({ code: 'invalid-task-tool-permissions' });
    });
});
