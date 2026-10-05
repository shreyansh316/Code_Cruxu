import { spawn } from 'child_process';
import { basename } from 'path';
import { DomainInvariantError } from '../domain/errors';
import { redactSecrets } from '../shared/redactSecrets';
import { normalizeAllowedExecutable, validateCommandArguments } from './commandPolicy';

const HARD_MAX_TIMEOUT_MS = 120_000;
const HARD_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_ENVIRONMENT_KEYS = Object.freeze(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']);
const FORBIDDEN_ENVIRONMENT_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|PROXY|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|DYLD|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|JAVA_TOOL_OPTIONS)/i;

/** Build a no-shell command runner limited to explicit executable paths. */
export function createCommandRunner({ allowedCommands, timeoutMs = 30_000, maxOutputBytes = 256 * 1024,
    allowedEnvironmentVariables = [], onActivity = () => undefined }) {
    if (!Array.isArray(allowedCommands) || allowedCommands.length === 0
        || allowedCommands.some((command) => typeof command !== 'string' || command.trim() === '')
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > HARD_MAX_TIMEOUT_MS
        || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > HARD_MAX_OUTPUT_BYTES
        || !Array.isArray(allowedEnvironmentVariables) || allowedEnvironmentVariables.length > 64
        || new Set(allowedEnvironmentVariables).size !== allowedEnvironmentVariables.length
        || allowedEnvironmentVariables.some((name) => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)
            || FORBIDDEN_ENVIRONMENT_NAME.test(name))
        || typeof onActivity !== 'function') {
        throw new DomainInvariantError('invalid-command-runner-options', 'Runner requires commands and bounded timeout/output limits.');
    }
    const allowlist = new Set(allowedCommands.map(normalizeAllowedExecutable));

    return Object.freeze({
        execute({ command, args = [], cwd, signal } = {}) {
            let executable = '';
            try { executable = normalizeAllowedExecutable(command); }
            catch { return Promise.reject(new DomainInvariantError('command-not-allowed', 'Executable is not on the command allowlist.')); }
            if (!allowlist.has(executable)) {
                return Promise.reject(new DomainInvariantError('command-not-allowed', 'Executable is not on the command allowlist.'));
            }
            try { validateCommandArguments(args); }
            catch (error) { return Promise.reject(error); }
            if (cwd !== undefined && (typeof cwd !== 'string' || cwd.trim() === '')) {
                return Promise.reject(new DomainInvariantError('invalid-command-working-directory', 'Working directory must be a non-empty path.'));
            }
            if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean')) {
                return Promise.reject(new DomainInvariantError('invalid-command-signal', 'Cancellation signal is invalid.'));
            }
            return runProcess(executable, args, cwd, signal, timeoutMs, maxOutputBytes, onActivity,
                allowedEnvironmentVariables,
                safeCommandLabel(executable));
        },
    });
}

function runProcess(command, args, cwd, signal, timeoutMs, maxOutputBytes, onActivity, allowedEnvironmentVariables, commandLabel) {
    return new Promise((resolveResult, reject) => {
        if (signal?.aborted) {
            const result = { exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, aborted: true, outputTruncated: false };
            reportActivity(onActivity, { event: 'finished', command: commandLabel, durationMs: 0, exitCode: null,
                timedOut: false, aborted: true, outputTruncated: false, stdoutBytes: 0, stderrBytes: 0 });
            resolveResult(result);
            return;
        }
        let child;
        try {
            child = spawn(command, args, { cwd, env: childEnvironment(allowedEnvironmentVariables),
                shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        }
        catch (error) {
            reportActivity(onActivity, { event: 'finished', command: commandLabel, durationMs: 0, error: true,
                timedOut: false, aborted: false, outputTruncated: false, stdoutBytes: 0, stderrBytes: 0 });
            reject(error);
            return;
        }
        const chunks = { stdout: [], stderr: [] };
        const startedAt = Date.now();
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
        reportActivity(onActivity, { event: 'started', command: commandLabel });

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
                reportActivity(onActivity, { event: 'finished', command: commandLabel, durationMs: Math.max(0, Date.now() - startedAt), error: true,
                    timedOut, aborted, outputTruncated,
                    stdoutBytes: chunks.stdout.reduce((total, chunk) => total + chunk.length, 0),
                    stderrBytes: chunks.stderr.reduce((total, chunk) => total + chunk.length, 0) });
                reject(error);
            }
        });
        child.once('close', (exitCode, processSignal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            const result = {
                exitCode,
                signal: processSignal,
                stdout: redactSecrets(Buffer.concat(chunks.stdout).toString('utf8'), HARD_MAX_OUTPUT_BYTES),
                stderr: redactSecrets(Buffer.concat(chunks.stderr).toString('utf8'), HARD_MAX_OUTPUT_BYTES),
                timedOut,
                aborted,
                outputTruncated,
            };
            reportActivity(onActivity, {
                event: 'finished', command: commandLabel, durationMs: Math.max(0, Date.now() - startedAt), exitCode,
                timedOut, aborted, outputTruncated,
                stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'), stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
                outputPreview: redactSecrets([result.stdout, result.stderr].filter(Boolean).join('\n'), 1000),
            });
            resolveResult(result);
        });
    });
}

function childEnvironment(allowedEnvironmentVariables) {
    const safeEnvironment = Object.create(null);
    const allowed = new Set([...DEFAULT_ENVIRONMENT_KEYS, ...allowedEnvironmentVariables].map((name) => name.toLowerCase()));
    for (const [name, value] of Object.entries(process.env)) {
        const normalizedName = name.toLowerCase();
        if (!allowed.has(normalizedName) || FORBIDDEN_ENVIRONMENT_NAME.test(name)
            || typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 16 * 1024) continue;
        safeEnvironment[name] = value;
    }
    return safeEnvironment;
}

function safeCommandLabel(command) {
    return basename(command.replace(/\\/g, '/')).replace(/[^a-zA-Z0-9._-]/g, '?').slice(0, 80);
}

function reportActivity(observer, event) {
    try {
        observer(Object.freeze({ ...event }));
    }
    catch {
        // Activity reporting must not alter command execution.
    }
}
