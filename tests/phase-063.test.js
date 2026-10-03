import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitTaskWorkspaceAdapter } from '../src/infrastructure/GitTaskWorkspaceAdapter';

describe('Phase 063 — isolated task worktrees', () => {
    let root; let worktrees; let adapter;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'headroom-063-repo-'));
        worktrees = await mkdtemp(join(tmpdir(), 'headroom-063-worktrees-'));
        const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
        git(['init', '-b', 'main']); git(['config', 'user.email', 'phase@example.invalid']); git(['config', 'user.name', 'Phase Test']);
        await writeFile(join(root, 'base.txt'), 'base'); git(['add', 'base.txt']); git(['commit', '-m', 'base']);
        adapter = await createGitTaskWorkspaceAdapter({ repositoryRoot: root, worktreeRoot: worktrees });
    });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); await rm(worktrees, { recursive: true, force: true }); });
    it('creates and recovers a uniquely named task branch and preserves dirty changes during cleanup', async () => {
        const created = await adapter.create({ taskId: 'task-063' });
        expect(created).toMatchObject({ branch: 'codex/headroom/task-063', status: 'ACTIVE' });
        expect(await adapter.recover('task-063')).toMatchObject({ path: created.path, head: created.head, status: 'RECOVERED' });
        await writeFile(join(created.path, 'uncommitted.txt'), 'keep');
        await expect(adapter.cleanup('task-063')).rejects.toMatchObject({ code: 'task-workspace-dirty' });
        expect((await adapter.recover('task-063')).status).toBe('RECOVERED');
    });
    it('removes only a clean task worktree and rejects duplicate task isolation', async () => {
        await adapter.create({ taskId: 'task-063-clean' });
        await expect(adapter.create({ taskId: 'task-063-clean' })).rejects.toMatchObject({ code: 'task-workspace-exists' });
        expect(await adapter.cleanup('task-063-clean')).toMatchObject({ status: 'REMOVED' });
        await expect(adapter.recover('task-063-clean')).rejects.toMatchObject({ code: 'task-workspace-not-found' });
    });
});
