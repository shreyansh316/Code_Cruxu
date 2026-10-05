/** Phase 286 — exclude credential containers even when leaf names look ordinary. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkspaceFileAdapter, isSensitiveWorkspacePath } from '../src/infrastructure';

const roots = [];
async function makeWorkspace() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-secret-dir-'));
    roots.push(path);
    return path;
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 286 — secret container path protection', () => {
    it('skips common credential containers during recursive listing and direct access', async () => {
        const root = await makeWorkspace();
        await mkdir(join(root, 'credentials'));
        await mkdir(join(root, 'services', '.secrets'), { recursive: true });
        await writeFile(join(root, 'credentials', 'provider-config.json'), '{"token":"secret"}');
        await writeFile(join(root, 'services', '.secrets', 'runtime.json'), '{"api":"secret"}');
        await writeFile(join(root, 'app.js'), 'export const ready = true;');
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root });
        expect((await files.listFiles()).files).toEqual(['app.js']);
        await expect(files.readFile('credentials/provider-config.json'))
            .rejects.toMatchObject({ code: 'sensitive-workspace-file-forbidden' });
        expect(isSensitiveWorkspacePath('services/.secrets/runtime.json')).toBe(true);
    });
});
