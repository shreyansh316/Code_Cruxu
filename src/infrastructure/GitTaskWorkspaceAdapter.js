import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
            const baseRecord = `refs/headroom/task-bases/${id}`;
            if (typeof baseRef !== 'string' || !baseRef.trim() || baseRef.length > 256 || baseRef.startsWith('-')) invalid();
            if (await find(id)) throw new DomainInvariantError('task-workspace-exists', 'A task worktree already exists and must be recovered instead.');
            const commit = await run(repository, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]);
            const target = resolve(workspaceParent, id);
            try { await lstat(target); throw new DomainInvariantError('task-worktree-path-exists', 'Task worktree path already exists.'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            await run(repository, ['update-ref', baseRecord, commit.stdout.trim(), '0'.repeat(40)]);
            try { await run(repository, ['worktree', 'add', '-b', branch, target, commit.stdout.trim()]); }
            catch (error) {
                try { await run(repository, ['update-ref', '-d', baseRecord, commit.stdout.trim()]); } catch { /* Keep the original failure. */ }
                throw error;
            }
            return Object.freeze({ taskId: id, branch, path: target, head: commit.stdout.trim(), status: 'ACTIVE' });
        },
        recover: async (taskId) => {
            const found = await find(taskId);
            if (!found) throw new DomainInvariantError('task-workspace-not-found', 'No recoverable worktree exists for this task.');
            return Object.freeze({ taskId: found.id, branch: found.branch, path: found.path, head: found.head, status: 'RECOVERED' });
        },
        getRollbackPrecondition: async (taskId) => {
            const found = await find(taskId);
            if (!found) throw new DomainInvariantError('task-workspace-not-found', 'No worktree exists for this task.');
            const state = await readTaskState(found.path, run);
            if (state.untrackedFileCount > 0) throw new DomainInvariantError('task-workspace-untracked', 'Rollback is unavailable while untracked files are present.');
            return Object.freeze({ taskId: found.id, branch: found.branch, head: state.head,
                stateHash: state.stateHash, untrackedFileCount: state.untrackedFileCount });
        },
        rollback: async ({ taskId, expectedHead, expectedStateHash } = {}) => {
            const found = await find(taskId);
            if (!found) throw new DomainInvariantError('task-workspace-not-found', 'No worktree exists for this task.');
            const baseRecord = `refs/headroom/task-bases/${found.id}`;
            const baseCommit = (await run(repository, ['rev-parse', '--verify', '--end-of-options', `${baseRecord}^{commit}`])).stdout.trim();
            const state = await readTaskState(found.path, run);
            if (typeof expectedHead !== 'string' || !/^[a-f0-9]{40,64}$/i.test(expectedHead)
                || typeof expectedStateHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedStateHash)
                || state.head !== expectedHead || state.stateHash !== expectedStateHash) {
                throw new DomainInvariantError('task-rollback-conflict', 'Task worktree changed since rollback was reviewed; capture a new precondition.');
            }
            const ancestry = await run(repository, ['merge-base', '--is-ancestor', baseCommit, state.head], [0, 1]);
            if (ancestry.code !== 0) throw new DomainInvariantError('task-rollback-conflict', 'Task branch no longer descends from its recorded base commit.');
            if (state.untrackedFileCount > 0) throw new DomainInvariantError('task-workspace-untracked', 'Rollback cannot remove or overwrite untracked files.');
            if (state.head === baseCommit && state.statusBytes === '') {
                throw new DomainInvariantError('task-rollback-empty', 'Task worktree has no tracked changes to roll back.');
            }
            await run(found.path, ['reset', '--hard', baseCommit]);
            return Object.freeze({ taskId: found.id, branch: found.branch, path: found.path,
                previousHead: state.head, restoredHead: baseCommit, status: 'ROLLED_BACK' });
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
async function readTaskState(path, run) {
    const head = (await run(path, ['rev-parse', '--verify', 'HEAD'])).stdout.trim();
    const statusBytes = (await run(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
    const stagedDiff = (await run(path, ['diff', '--no-ext-diff', '--no-color', '--binary', '--cached', '--'])).stdout;
    const workingDiff = (await run(path, ['diff', '--no-ext-diff', '--no-color', '--binary', '--'])).stdout;
    const untrackedFileCount = statusBytes.split('\0').filter((record) => record.startsWith('?? ')).length;
    const stateHash = createHash('sha256').update(JSON.stringify({ head, statusBytes, stagedDiff, workingDiff })).digest('hex');
    return { head, statusBytes, stagedDiff, workingDiff, untrackedFileCount, stateHash };
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
    try {
        const id = createEntityId(value);
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id === '.' || id === '..') invalid();
        return id;
    }
    catch { invalid(); }
}
function invalid() {
    throw new DomainInvariantError('invalid-task-workspace', 'Task workspace options or identity are invalid.');
}
