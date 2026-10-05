/** Phase 277 — prevent task tools from reading and changing common credential files. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTaskScopedTools, createWorkspaceFileAdapter, isSensitiveWorkspacePath } from '../src/infrastructure';

const roots = [];
async function root() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-sensitive-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 277 — sensitive workspace file protection', () => {
    it('hides credential and private-key paths from listing and denies direct adapter access', async () => {
        const workspaceRoot = await root();
        await mkdir(join(workspaceRoot, '.aws'));
        await mkdir(join(workspaceRoot, '.git'));
        await mkdir(join(workspaceRoot, 'credentials'));
        await mkdir(join(workspaceRoot, '.secrets'));
        await mkdir(join(workspaceRoot, '.kube'));
        await mkdir(join(workspaceRoot, '.docker'));
        await mkdir(join(workspaceRoot, 'config', '.ssh'), { recursive: true });
        await writeFile(join(workspaceRoot, '.env'), 'api_key=private');
        await writeFile(join(workspaceRoot, '.env.example'), 'api_key=replace-me');
        await writeFile(join(workspaceRoot, 'server.pem'), 'private key');
        await writeFile(join(workspaceRoot, '.aws', 'credentials'), '[default]');
        await writeFile(join(workspaceRoot, '.git', 'config'), '[remote]');
        await writeFile(join(workspaceRoot, 'credentials', 'provider-config.json'), '{"api":"private"}');
        await writeFile(join(workspaceRoot, '.secrets', 'production.json'), '{"token":"private"}');
        await writeFile(join(workspaceRoot, '.kube', 'config'), 'cluster credentials');
        await writeFile(join(workspaceRoot, '.docker', 'config.json'), '{"auths":{}}');
        await writeFile(join(workspaceRoot, 'config', '.ssh', 'id_ed25519'), 'private key');
        await writeFile(join(workspaceRoot, 'src.js'), 'safe source');
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot });

        expect((await adapter.listFiles()).files).toEqual(['.env.example', 'src.js']);
        for (const path of ['.env', 'server.pem', '.aws/credentials', '.git/config',
            'credentials/provider-config.json', '.secrets/production.json', '.kube/config', '.docker/config.json']) {
            await expect(adapter.readFile(path)).rejects.toMatchObject({ code: 'sensitive-workspace-file-forbidden' });
            await expect(adapter.writeFile(path, 'replacement')).rejects.toMatchObject({ code: 'sensitive-workspace-file-forbidden' });
        }
        expect(await readFile(join(workspaceRoot, '.env'), 'utf8')).toBe('api_key=private');
        expect(isSensitiveWorkspacePath('C:\\repo\\.ssh\\id_ed25519')).toBe(true);
        expect(isSensitiveWorkspacePath('.env.template')).toBe(false);
        expect(isSensitiveWorkspacePath('.env.production.example')).toBe(true);
        await expect(adapter.deleteFile('.env')).rejects.toMatchObject({ code: 'sensitive-workspace-file-forbidden' });
        await expect(adapter.renameFile('src.js', '.env')).rejects.toMatchObject({ code: 'sensitive-workspace-file-forbidden' });
    });

    it('enforces the sensitive path policy in task grants even when they explicitly name the path', async () => {
        const workspaceRoot = await root();
        const filesystem = { readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn(), deleteFile: vi.fn(), renameFile: vi.fn() };
        const tools = await createTaskScopedTools({ workspaceRoot, filesystem, processRunner: { execute: vi.fn() },
            permissions: { readFiles: ['.env'], writeFiles: ['.env'], commands: [] } });
        await expect(tools.filesystem.readFile('.env')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        await expect(tools.filesystem.writeFile('.env', 'x')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        expect(filesystem.readFile).not.toHaveBeenCalled();
        expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('stops filesystem work at a configured lifetime operation budget', async () => {
        const workspaceRoot = await root();
        await writeFile(join(workspaceRoot, 'source.js'), 'safe');
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot, maxOperations: 1 });
        expect((await adapter.listFiles()).files).toEqual(['source.js']);
        await expect(adapter.readFile('source.js')).rejects.toMatchObject({ code: 'workspace-operation-limit' });
        await expect(createWorkspaceFileAdapter({ workspaceRoot, maxOperations: 10_001 }))
            .rejects.toMatchObject({ code: 'invalid-workspace-file-options' });
    });
});
