/** Phase 280 — reject Windows trailing-dot and trailing-space path aliases. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter, isSensitiveWorkspacePath } from '../src/infrastructure';

const roots = [];
async function makeWorkspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-winpath-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 280 — Windows path alias denial', () => {
    it('rejects trailing-dot/space aliases before filesystem resolution', async () => {
        const workspaceRoot = await makeWorkspace();
        await writeFile(join(workspaceRoot, '.env'), 'api_key=private');
        await writeFile(join(workspaceRoot, 'source.txt'), 'safe');
        const files = await createWorkspaceFileAdapter({ workspaceRoot });
        for (const path of ['.env.', '.env ', '.env .', '.. /outside.txt', 'source.txt.']) {
            await expect(files.readFile(path)).rejects.toMatchObject({ code: 'invalid-workspace-path' });
        }
        expect(isSensitiveWorkspacePath('.env .')).toBe(true);
    });

    it('refuses aliases in task permission paths and grants', async () => {
        const workspaceRoot = await makeWorkspace();
        const base = { workspaceRoot, filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
            processRunner: { execute: vi.fn() } };
        await expect(createTaskScopedTools({ ...base, permissions: { readFiles: ['source.txt.'], writeFiles: [], commands: [] } }))
            .rejects.toMatchObject({ code: 'invalid-task-tool-permissions' });
    });
});
