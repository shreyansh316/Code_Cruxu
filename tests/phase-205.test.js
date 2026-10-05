/** Phase 205 — workspace changed-file status visibility. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitStateAdapter } from '../src/infrastructure/GitStateAdapter';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

const roots = [];
async function temporaryDirectory() {
    const root = await mkdtemp(join(tmpdir(), 'headroom-changes-'));
    roots.push(root);
    return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 205 — changed files', () => {
    it('reads bounded Git status without returning file contents and scopes paths to nested workspace roots', async () => {
        const repositoryRoot = await temporaryDirectory();
        const git = (args, cwd = repositoryRoot) => execFileSync('git', args, { cwd, stdio: 'ignore' });
        git(['init', '--quiet']);
        git(['config', 'user.email', 'phase@example.invalid']);
        git(['config', 'user.name', 'HEADROOM Test']);
        await mkdir(join(repositoryRoot, 'workspace'));
        await writeFile(join(repositoryRoot, 'outside.txt'), 'untracked outside');
        await writeFile(join(repositoryRoot, 'workspace', 'tracked.txt'), 'baseline');
        git(['add', 'workspace/tracked.txt']);
        git(['commit', '-m', 'baseline']);
        await writeFile(join(repositoryRoot, 'workspace', 'tracked.txt'), 'modified file with private content');
        await writeFile(join(repositoryRoot, 'workspace', 'new.txt'), 'untracked content');

        const adapter = await createGitStateAdapter({ workspaceRoot: join(repositoryRoot, 'workspace') });
        const changed = await adapter.getChangedFiles();
        expect(changed.map(({ path, status }) => [path, status])).toEqual([
            ['new.txt', 'UNTRACKED'], ['tracked.txt', 'MODIFIED'],
        ]);
        expect(JSON.stringify(changed)).not.toContain('private content');
        expect(JSON.stringify(changed)).not.toContain('outside.txt');
    });

    it('renders sanitized status paths in a bounded Command Center snapshot', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], changedFiles: [
            { path: 'src/token=secret-value.js', status: 'MODIFIED' }, { path: 'new.js', status: 'BAD_STATUS' },
        ] });
        expect(snapshot.changedFiles).toEqual([
            { path: 'src/token=[redacted]', originalPath: '', status: 'MODIFIED' },
            { path: 'new.js', originalPath: '', status: 'UNKNOWN' },
        ]);
        expect(renderCommandCenterHtml()).toContain('Changed files');
        expect(JSON.stringify(snapshot)).not.toContain('secret-value');
    });
});
