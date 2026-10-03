import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitTaskWorkspaceAdapter } from '../src/infrastructure/GitTaskWorkspaceAdapter';

describe('Phase 066 — precondition-checked task rollback', () => {
    let root; let worktrees; let adapter; let taskPath;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'headroom-066-repo-'));
        worktrees = await mkdtemp(join(tmpdir(), 'headroom-066-worktrees-'));
        const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
        git(['init', '-b', 'main']); git(['config', 'user.email', 'phase@example.invalid']); git(['config', 'user.name', 'Phase Test']);
        await writeFile(join(root, 'source.js'), 'baseline\n'); git(['add', 'source.js']); git(['commit', '-m', 'baseline']);
        adapter = await createGitTaskWorkspaceAdapter({ repositoryRoot: root, worktreeRoot: worktrees });
        taskPath = (await adapter.create({ taskId: 'task-066' })).path;
    });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); await rm(worktrees, { recursive: true, force: true }); });
    it('restores only tracked task changes after matching exact head and diff preconditions', async () => {
        await writeFile(join(taskPath, 'source.js'), 'task change\n');
        const oldPrecondition = await adapter.getRollbackPrecondition('task-066');
        await writeFile(join(taskPath, 'source.js'), 'unreviewed change\n');
        await expect(adapter.rollback({ taskId: 'task-066', expectedHead: oldPrecondition.head,
            expectedStateHash: oldPrecondition.stateHash })).rejects.toMatchObject({ code: 'task-rollback-conflict' });
        const current = await adapter.getRollbackPrecondition('task-066');
        const result = await adapter.rollback({ taskId: 'task-066', expectedHead: current.head, expectedStateHash: current.stateHash });
        expect(result.status).toBe('ROLLED_BACK');
        expect((await readFile(join(taskPath, 'source.js'), 'utf8')).replace(/\r\n/g, '\n')).toBe('baseline\n');
    });
    it('refuses rollback when untracked files could be lost or overwritten', async () => {
        await writeFile(join(taskPath, 'source.js'), 'task change\n');
        await writeFile(join(taskPath, 'untracked.txt'), 'keep me');
        await expect(adapter.getRollbackPrecondition('task-066')).rejects.toMatchObject({ code: 'task-workspace-untracked' });
        await expect(adapter.rollback({ taskId: 'task-066', expectedHead: 'a'.repeat(40), expectedStateHash: 'b'.repeat(64) }))
            .rejects.toMatchObject({ code: 'task-rollback-conflict' });
        expect(await readFile(join(taskPath, 'untracked.txt'), 'utf8')).toBe('keep me');
    });
});
