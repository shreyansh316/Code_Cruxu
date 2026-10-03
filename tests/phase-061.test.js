import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareWorkspaceSnapshots, createWorkspaceSnapshot } from '../src/infrastructure/WorkspaceSnapshot';

describe('Phase 061 — workspace change snapshots', () => {
    let root;
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'headroom-061-')); await mkdir(join(root, 'src')); });
    afterEach(async () => rm(root, { recursive: true, force: true }));
    it('records actual hashes and detects additions, deletions, modifications, and content-preserving renames', async () => {
        await writeFile(join(root, 'src/unchanged.js'), 'same');
        await writeFile(join(root, 'src/old.js'), 'rename me');
        await writeFile(join(root, 'src/modified.js'), 'before');
        const before = await createWorkspaceSnapshot({ workspaceRoot: root, snapshotId: 'snapshot-before-061',
            paths: ['src/unchanged.js', 'src/old.js', 'src/modified.js'] });
        await rm(join(root, 'src/old.js'));
        await writeFile(join(root, 'src/new.js'), 'rename me');
        await writeFile(join(root, 'src/modified.js'), 'after');
        await writeFile(join(root, 'src/added.js'), 'new');
        const after = await createWorkspaceSnapshot({ workspaceRoot: root, snapshotId: 'snapshot-after-061',
            paths: ['src/unchanged.js', 'src/old.js', 'src/new.js', 'src/modified.js', 'src/added.js'] });
        const diff = compareWorkspaceSnapshots(before, after);
        expect(diff.added.map(({ path }) => path)).toEqual(['src/added.js']);
        expect(diff.deleted).toEqual([]);
        expect(diff.modified.map(({ path }) => path)).toEqual(['src/modified.js']);
        expect(diff.renamed).toMatchObject([{ from: 'src/old.js', to: 'src/new.js' }]);
        expect(before.files.find(({ path }) => path === 'src/unchanged.js').sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    it('represents deleted paths as missing and rejects traversal, symlinks, and oversized sets', async () => {
        const snapshot = await createWorkspaceSnapshot({ workspaceRoot: root, snapshotId: 'snapshot-missing-061', paths: ['src/deleted.js'] });
        expect(snapshot.files[0]).toMatchObject({ exists: false, sha256: null });
        await expect(createWorkspaceSnapshot({ workspaceRoot: root, snapshotId: 'snapshot-invalid-061', paths: ['../outside'] })).rejects.toMatchObject({ code: 'invalid-workspace-snapshot' });
        await expect(createWorkspaceSnapshot({ workspaceRoot: root, snapshotId: 'snapshot-limit-061', paths: Array(5001).fill('src/file.js') })).rejects.toMatchObject({ code: 'invalid-workspace-snapshot' });
    });
});
