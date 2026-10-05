import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitStateAdapter } from '../src/infrastructure/GitStateAdapter';

describe('Phase 062 — read-only Git state adapter', { timeout: 30000 }, () => {
    let root; let adapter;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'headroom-062-'));
        const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
        git(['init', '-b', 'phase-062-test']);
        git(['config', 'user.email', 'phase@example.invalid']);
        git(['config', 'user.name', 'Phase Test']);
        await writeFile(join(root, 'base.txt'), 'baseline\n');
        git(['add', 'base.txt']); git(['commit', '-m', 'baseline']);
        adapter = await createGitStateAdapter({ workspaceRoot: root });
    });
    afterEach(async () => rm(root, { recursive: true, force: true }));
    it('reports branch, staged/working changes, untracked files, and diffs without mutation', async () => {
        await writeFile(join(root, 'base.txt'), 'working edit\n');
        await writeFile(join(root, 'new.txt'), 'untracked\n');
        execFileSync('git', ['add', 'base.txt'], { cwd: root, stdio: 'ignore' });
        const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        const state = await adapter.getState();
        expect(state.branch).toBe('phase-062-test');
        expect(state.head).toMatch(/^[a-f0-9]{40,64}$/i);
        expect(state.status.map(({ path }) => path).sort()).toEqual(['base.txt', 'new.txt']);
        expect(state.status.find(({ path }) => path === 'new.txt').untracked).toBe(true);
        expect(state.stagedDiff).toContain('working edit');
        expect(state.workingDiff).toBe('');
        expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()).toBe(headBefore);
    });
    it('rejects invalid limits and reports a non-repository without changing it', async () => {
        await expect(createGitStateAdapter({ workspaceRoot: root, maxOutputBytes: 0 })).rejects.toMatchObject({ code: 'invalid-git-state-options' });
        const empty = await mkdtemp(join(tmpdir(), 'headroom-062-empty-'));
        try {
            const nonRepository = await createGitStateAdapter({ workspaceRoot: empty });
            await expect(nonRepository.getState()).rejects.toMatchObject({ code: 'git-inspection-failed' });
        }
        finally { await rm(empty, { recursive: true, force: true }); }
    });
});
