/** Phase 289 — block less common Win32 console and superscript device aliases. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter } from '../src/infrastructure';

const roots = [];
async function makeWorkspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-win-device-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 289 — extended Win32 device aliases', () => {
    it('rejects console devices and superscript numbered device names before opening files', async () => {
        const root = await makeWorkspace();
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root });
        for (const path of ['CONIN$', 'CONOUT$', 'COM¹.txt', 'LPT³.log']) {
            await expect(files.readFile(path)).rejects.toMatchObject({ code: 'invalid-workspace-path' });
        }
    });

    it('rejects the same device aliases in task grants', async () => {
        const root = await makeWorkspace();
        await expect(createTaskScopedTools({ workspaceRoot: root, filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
            processRunner: { execute: vi.fn() }, permissions: { readFiles: ['CONIN$'], writeFiles: [], commands: [] } }))
            .rejects.toMatchObject({ code: 'invalid-task-tool-permissions' });
    });
});
