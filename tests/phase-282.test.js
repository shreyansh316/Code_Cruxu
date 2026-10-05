/** Phase 282 — enforce workspace byte limits during reads, not only before them. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkspaceFileAdapter } from '../src/infrastructure';

const roots = [];
async function makeWorkspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-bounded-read-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 282 — bounded workspace file reads', () => {
    it('reads an exact-limit file but rejects a file beyond the configured byte maximum', async () => {
        const root = await makeWorkspace();
        await writeFile(join(root, 'within.txt'), '12345678');
        await writeFile(join(root, 'oversize.txt'), '123456789');
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root, maxFileBytes: 8 });
        await expect(files.readFile('within.txt')).resolves.toBe('12345678');
        await expect(files.readFile('oversize.txt')).rejects.toMatchObject({ code: 'workspace-file-too-large' });
    });
});
