/** Phase 022 — safe workspace file adapter. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkspaceFileAdapter } from '../src/infrastructure';
import { DomainInvariantError } from '../src/domain';

const temporaryDirectories = [];
async function temporaryDirectory() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-files-'));
    temporaryDirectories.push(path);
    return path;
}
afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('Phase 022 — workspace file adapter', () => {
    it('reads and writes relative paths within the configured workspace', async () => {
        const root = await temporaryDirectory();
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root, maxFileBytes: 20 });
        await adapter.writeFile('notes.txt', 'workspace data');
        expect(await adapter.readFile('notes.txt')).toBe('workspace data');
        expect(await readFile(join(root, 'notes.txt'), 'utf8')).toBe('workspace data');
    });

    it('rejects traversal, absolute paths, missing parents, and oversized reads/writes', async () => {
        const root = await temporaryDirectory();
        const outside = join(await temporaryDirectory(), 'outside.txt');
        await writeFile(outside, 'external');
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root, maxFileBytes: 4 });
        for (const path of ['../outside.txt', outside, '']) {
            await expect(adapter.readFile(path)).rejects.toBeInstanceOf(DomainInvariantError);
            await expect(adapter.writeFile(path, 'safe')).rejects.toBeInstanceOf(DomainInvariantError);
        }
        await expect(adapter.writeFile('large.txt', '12345')).rejects.toThrowError(/4-byte/);
        await writeFile(join(root, 'large.txt'), '12345');
        await expect(adapter.readFile('large.txt')).rejects.toThrowError(/4-byte/);
        await expect(adapter.writeFile('missing/child.txt', 'x')).rejects.toThrow();
    });

    it('rejects symlinks that point outside the workspace', async () => {
        const root = await temporaryDirectory();
        const outside = await temporaryDirectory();
        await writeFile(join(outside, 'secret.txt'), 'outside');
        await symlink(outside, join(root, 'external'), 'junction');
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root });
        await expect(adapter.readFile('external/secret.txt')).rejects.toThrowError(/outside/);
        await expect(adapter.writeFile('external/new.txt', 'x')).rejects.toThrowError(/outside/);
    });

    it('bounds configuration and requires text writes', async () => {
        const root = await temporaryDirectory();
        await expect(createWorkspaceFileAdapter({ workspaceRoot: root, maxFileBytes: 10 * 1024 * 1024 + 1 }))
            .rejects.toBeInstanceOf(DomainInvariantError);
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root });
        await expect(adapter.writeFile('x.txt', Buffer.from('no'))).rejects.toBeInstanceOf(DomainInvariantError);
    });
});
