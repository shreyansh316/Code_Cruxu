import { DomainInvariantError } from '../domain/errors';
import { validateCommandArguments } from './commandPolicy';

const MAX_VERIFICATION_CHECKS = 20;

/** Run a bounded ordered list of verification commands through a command port. */
export function createVerificationPipeline({ commandRunner, checks }) {
    if (typeof commandRunner?.execute !== 'function' || !Array.isArray(checks)
        || checks.length > MAX_VERIFICATION_CHECKS) {
        throw new DomainInvariantError('invalid-verification-pipeline',
            `A command runner and at most ${MAX_VERIFICATION_CHECKS} checks are required.`);
    }
    const ids = new Set();
    const normalizedChecks = checks.map((check) => {
        if (!check || typeof check.id !== 'string' || check.id.trim() === '' || ids.has(check.id)
            || typeof check.command !== 'string' || check.command.trim() === ''
            || !Array.isArray(check.args ?? []) || (check.args ?? []).some((arg) => typeof arg !== 'string')
            || (check.cwd !== undefined && (typeof check.cwd !== 'string' || check.cwd.trim() === ''))) {
            throw new DomainInvariantError('invalid-verification-check',
                'Each check requires a unique id, executable, string arguments, and optional working directory.');
        }
        validateCommandArguments(check.args ?? []);
        ids.add(check.id);
        return Object.freeze({ id: check.id, command: check.command, args: [...(check.args ?? [])], cwd: check.cwd });
    });

    return Object.freeze({
        run: async ({ signal } = {}) => {
            const results = [];
            for (const check of normalizedChecks) {
                try {
                    const result = await commandRunner.execute({ ...check, signal });
                    const status = result.timedOut ? 'TIMED_OUT'
                        : result.aborted ? 'CANCELLED'
                            : result.exitCode === 0 ? 'PASSED' : 'FAILED';
                    results.push({ id: check.id, status, exitCode: result.exitCode, signal: result.signal,
                        stdout: result.stdout, stderr: result.stderr, outputTruncated: result.outputTruncated });
                    if (result.aborted) break;
                }
                catch (error) {
                    results.push({ id: check.id, status: 'ERROR', exitCode: null, signal: null,
                        stdout: '', stderr: error instanceof Error ? error.message : String(error), outputTruncated: false });
                }
            }
            return { passed: results.length === normalizedChecks.length && results.every((result) => result.status === 'PASSED'), results };
        },
    });
}
