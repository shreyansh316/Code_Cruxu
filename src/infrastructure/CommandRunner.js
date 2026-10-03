import { spawn } from 'child_process';
import { resolve } from 'path';
import { DomainInvariantError } from '../domain/errors';

const HARD_MAX_TIMEOUT_MS = 120_000;
const HARD_MAX_OUTPUT_BYTES = 1024 * 1024;

/** Build a no-shell command runner limited to explicit executable paths. */
export function createCommandRunner({ allowedCommands, timeoutMs = 30_000, maxOutputBytes = 256 * 1024 }) {
    if (!Array.isArray(allowedCommands) || allowedCommands.length === 0
        || allowedCommands.some((command) => typeof command !== 'string' || command.trim() === '')
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > HARD_MAX_TIMEOUT_MS
        || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > HARD_MAX_OUTPUT_BYTES) {
        throw new DomainInvariantError('invalid-command-runner-options', 'Runner requires commands and bounded timeout/output limits.');
    }
    const allowlist = new Set(allowedCommands.map((command) => resolve(command)));

    return Object.freeze({
        execute({ command, args = [], cwd, signal } = {}) {
            const executable = typeof command === 'string' ? resolve(command) : '';
            if (!allowlist.has(executable)) {
                return Promise.reject(new DomainInvariantError('command-not-allowed', 'Executable is not on the command allowlist.'));
            }
            if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
                return Promise.reject(new DomainInvariantError('invalid-command-arguments', 'Command arguments must be strings.'));
            }
            if (cwd !== undefined && (typeof cwd !== 'string' || cwd.trim() === '')) {
                return Promise.reject(new DomainInvariantError('invalid-command-working-directory', 'Working directory must be a non-empty path.'));
            }
            if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean')) {
                return Promise.reject(new DomainInvariantError('invalid-command-signal', 'Cancellation signal is invalid.'));
            }
            return runProcess(executable, args, cwd, signal, timeoutMs, maxOutputBytes);
        },
    });
}

function runProcess(command, args, cwd, signal, timeoutMs, maxOutputBytes) {
    return new Promise((resolveResult, reject) => {
        if (signal?.aborted) {
            resolveResult({ exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, aborted: true, outputTruncated: false });
            return;
        }
        let child;
        try {
            child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        }
        catch (error) {
            reject(error);
            return;
        }
        const chunks = { stdout: [], stderr: [] };
        let capturedBytes = 0;
        let timedOut = false;
        let aborted = false;
        let outputTruncated = false;
        let settled = false;
        const stop = (reason) => {
            if (reason === 'timeout') timedOut = true;
            else if (reason === 'abort') aborted = true;
            child.kill();
        };
        const timer = setTimeout(() => stop('timeout'), timeoutMs);
        const onAbort = () => stop('abort');
        signal?.addEventListener('abort', onAbort, { once: true });

        for (const streamName of ['stdout', 'stderr']) {
            child[streamName].on('data', (chunk) => {
                const remaining = Math.max(0, maxOutputBytes - capturedBytes);
                const accepted = chunk.subarray(0, remaining);
                if (accepted.length > 0) chunks[streamName].push(accepted);
                capturedBytes += accepted.length;
                if (accepted.length < chunk.length) {
                    outputTruncated = true;
                    child.kill();
                }
            });
        }
        child.once('error', (error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                reject(error);
            }
        });
        child.once('close', (exitCode, processSignal) => {
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolveResult({
                exitCode,
                signal: processSignal,
                stdout: Buffer.concat(chunks.stdout).toString('utf8'),
                stderr: Buffer.concat(chunks.stderr).toString('utf8'),
                timedOut,
                aborted,
                outputTruncated,
            });
        });
    });
}
