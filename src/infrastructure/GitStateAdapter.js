import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { DomainInvariantError } from '../domain/errors';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30_000;

/** Read branch, status, and diffs from Git without invoking any mutating command. */
export async function createGitStateAdapter({ workspaceRoot, gitExecutable = 'git', timeoutMs = 10_000,
    maxOutputBytes = MAX_OUTPUT_BYTES } = {}) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim() || typeof gitExecutable !== 'string'
        || !gitExecutable.trim() || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS
        || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_OUTPUT_BYTES) invalid();
    const root = await realpath(workspaceRoot);
    const run = (args) => runGit(gitExecutable, root, args, timeoutMs, maxOutputBytes);
    return Object.freeze({
        getState: async () => {
            const branchResult = await run(['branch', '--show-current']);
            const headResult = await run(['rev-parse', '--verify', 'HEAD']);
            const statusResult = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
            const staged = await run(['diff', '--no-ext-diff', '--no-color', '--binary', '--cached', '--']);
            const working = await run(['diff', '--no-ext-diff', '--no-color', '--binary', '--']);
            return Object.freeze({ branch: branchResult.stdout.trim() || null, head: headResult.stdout.trim(),
                status: Object.freeze(parseStatus(statusResult.stdout)), stagedDiff: staged.stdout,
                workingDiff: working.stdout });
        },
    });
}

function parseStatus(output) {
    const fields = output.split('\0');
    const records = [];
    for (let index = 0; index < fields.length;) {
        const entry = fields[index++];
        if (!entry) continue;
        if (entry.length < 4 || entry[2] !== ' ') invalid();
        const x = entry[0];
        const y = entry[1];
        const path = entry.slice(3);
        if (x === '?' && y === '?') {
            records.push(Object.freeze({ index: '?', worktree: '?', path, untracked: true }));
        }
        else if (x === 'R' || y === 'R' || x === 'C' || y === 'C') {
            const originalPath = fields[index++];
            if (!originalPath) invalid();
            records.push(Object.freeze({ index: x, worktree: y, path, originalPath, untracked: false }));
        }
        else records.push(Object.freeze({ index: x, worktree: y, path, untracked: false }));
    }
    return records;
}

function runGit(executable, cwd, args, timeoutMs, maxOutputBytes) {
    return new Promise((resolveResult, reject) => {
        const child = spawn(executable, ['--no-optional-locks', '-C', cwd, ...args], {
            shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        });
        const chunks = [];
        let captured = 0;
        let settled = false;
        let timedOut = false;
        let truncated = false;
        const stderr = [];
        let stderrBytes = 0;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            const remaining = maxOutputBytes - captured;
            const accepted = chunk.subarray(0, Math.max(0, remaining));
            if (accepted.length) chunks.push(accepted);
            captured += accepted.length;
            if (accepted.length < chunk.length) { truncated = true; child.kill(); }
        });
        child.stderr.on('data', (chunk) => {
            const accepted = chunk.subarray(0, Math.max(0, Math.min(4096 - stderrBytes, chunk.length)));
            if (accepted.length) stderr.push(accepted);
            stderrBytes += accepted.length;
        });
        child.once('error', () => {
            if (!settled) { settled = true; clearTimeout(timer); reject(new DomainInvariantError('git-unavailable', 'Git could not be started for read-only workspace inspection.')); }
        });
        child.once('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (timedOut) reject(new DomainInvariantError('git-timeout', 'Git inspection exceeded its time limit.'));
            else if (truncated) reject(new DomainInvariantError('git-output-limit', 'Git inspection exceeded its output limit.'));
            else if (code !== 0) reject(new DomainInvariantError('git-inspection-failed', 'Git could not inspect the workspace state.'));
            else resolveResult({ stdout: Buffer.concat(chunks).toString('utf8') });
        });
    });
}
function invalid() {
    throw new DomainInvariantError('invalid-git-state-options', 'Git inspection options are malformed or exceed their bounds.');
}
