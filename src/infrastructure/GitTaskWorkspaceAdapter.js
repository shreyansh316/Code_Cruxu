import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createEntityId, DomainInvariantError } from '../domain';

const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 30_000;

/** Create, recover, and safely clean up opt-in task branches and linked Git worktrees. */
export async function createGitTaskWorkspaceAdapter({ repositoryRoot, worktreeRoot, gitExecutable = 'git' } = {}) {
    if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim() || typeof worktreeRoot !== 'string'
        || !worktreeRoot.trim() || typeof gitExecutable !== 'string' || !gitExecutable.trim()) invalid();
    const repository = await realpath(repositoryRoot);
    const workspaceParent = await realpath(worktreeRoot);
    const run = (cwd, args, acceptedCodes = [0]) => runGit(gitExecutable, cwd, args, acceptedCodes);
    const topLevel = (await run(repository, ['rev-parse', '--show-toplevel'])).stdout.trim();
    if (await realpath(topLevel) !== repository) invalid();

    async function find(taskId) {
        const id = assertTaskId(taskId);
        const branch = `codex/headroom/${id}`;
        const list = await run(repository, ['worktree', 'list', '--porcelain']);
        const entries = parseWorktrees(list.stdout);
        const entry = entries.find((candidate) => candidate.branch === `refs/heads/${branch}`);
        if (!entry) return undefined;
        const expectedPath = resolve(workspaceParent, id);
        if (resolve(entry.path) !== expectedPath) throw new DomainInvariantError('task-worktree-path-conflict', 'Task branch is attached to an unexpected worktree path.');
        return { id, branch, path: expectedPath, head: entry.head };
    }

    return Object.freeze({
        create: async ({ taskId, baseRef = 'HEAD' } = {}) => {
            const id = assertTaskId(taskId);
            const branch = `codex/headroom/${id}`;
            if (typeof baseRef !== 'string' || !baseRef.trim() || baseRef.length > 256 || baseRef.startsWith('-')) invalid();
            if (await find(id)) throw new DomainInvariantError('task-workspace-exists', 'A task worktree already exists and must be recovered instead.');
            const commit = await run(repository, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]);
            const target = resolve(workspaceParent, id);
            try { await lstat(target); throw new DomainInvariantError('task-worktree-path-exists', 'Task worktree path already exists.'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            await run(repository, ['worktree', 'add', '-b', branch, target, commit.stdout.trim()]);
            return Object.freeze({ taskId: id, branch, path: target, head: commit.stdout.trim(), status: 'ACTIVE' });
        },
        recover: async (taskId) => {
            const found = await find(taskId);
            if (!found) throw new DomainInvariantError('task-workspace-not-found', 'No recoverable worktree exists for this task.');
            return Object.freeze({ taskId: found.id, branch: found.branch, path: found.path, head: found.head, status: 'RECOVERED' });
        },
        cleanup: async (taskId) => {
            const found = await find(taskId);
            if (!found) throw new DomainInvariantError('task-workspace-not-found', 'No worktree exists for this task.');
            const canonical = await realpath(found.path);
            if (canonical !== found.path) throw new DomainInvariantError('task-workspace-path-conflict', 'Task worktree path changed unexpectedly.');
            const status = await run(found.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
            if (status.stdout.length) throw new DomainInvariantError('task-workspace-dirty', 'Task worktree has changes; preserve or review them before cleanup.');
            await run(repository, ['worktree', 'remove', found.path]);
            return Object.freeze({ taskId: found.id, branch: found.branch, path: found.path, status: 'REMOVED' });
        },
    });
}

function parseWorktrees(output) {
    const entries = [];
    for (const block of output.trim().split(/\r?\n\r?\n/)) {
        const entry = {};
        for (const line of block.split(/\r?\n/)) {
            if (line.startsWith('worktree ')) entry.path = line.slice(9);
            else if (line.startsWith('HEAD ')) entry.head = line.slice(5);
            else if (line.startsWith('branch ')) entry.branch = line.slice(7);
        }
        if (entry.path && entry.head) entries.push(entry);
    }
    return entries;
}
function runGit(executable, cwd, args, acceptedCodes = [0]) {
    return new Promise((resolveResult, reject) => {
        const child = spawn(executable, ['--no-optional-locks', '-C', cwd, ...args], {
            shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
            env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        });
        const chunks = [];
        let bytes = 0;
        let timedOut = false;
        let exceeded = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT_MS);
        child.stdout.on('data', (chunk) => {
            const remaining = MAX_OUTPUT - bytes;
            const accepted = chunk.subarray(0, Math.max(0, remaining));
            if (accepted.length) chunks.push(accepted);
            bytes += accepted.length;
            if (accepted.length < chunk.length) { exceeded = true; child.kill(); }
        });
        child.once('error', () => { clearTimeout(timer); reject(new DomainInvariantError('git-unavailable', 'Git could not be started for task worktree management.')); });
        child.once('close', (code) => {
            clearTimeout(timer);
            if (timedOut) reject(new DomainInvariantError('git-timeout', 'Git task operation exceeded its time limit.'));
            else if (exceeded) reject(new DomainInvariantError('git-output-limit', 'Git task operation exceeded its output limit.'));
            else if (!acceptedCodes.includes(code)) reject(new DomainInvariantError('git-task-operation-failed', 'Git task worktree operation failed.'));
            else resolveResult({ stdout: Buffer.concat(chunks).toString('utf8'), code });
        });
    });
}
function assertTaskId(value) {
    try { return createEntityId(value); }
    catch { invalid(); }
}
function invalid() {
    throw new DomainInvariantError('invalid-task-workspace', 'Task workspace options or identity are invalid.');
}
