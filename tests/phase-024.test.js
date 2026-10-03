/** Phase 024 — bounded structured verification pipeline. */
import { describe, expect, it, vi } from 'vitest';
import { createVerificationPipeline } from '../src/infrastructure';
import { DomainInvariantError } from '../src/domain';

const checks = [
    { id: 'lint', command: '/tools/lint', args: ['--strict'] },
    { id: 'tests', command: '/tools/test', args: [] },
];
const result = (overrides = {}) => ({
    exitCode: 0, signal: null, stdout: 'ok', stderr: '', timedOut: false, aborted: false, outputTruncated: false,
    ...overrides,
});

describe('Phase 024 — verification pipeline', () => {
    it('runs configured checks in order and reports a truthful successful result', async () => {
        const execute = vi.fn().mockResolvedValue(result());
        const report = await createVerificationPipeline({ commandRunner: { execute }, checks }).run();
        expect(execute.mock.calls.map(([request]) => request.id)).toEqual(['lint', 'tests']);
        expect(report).toEqual({ passed: true, results: [
            { id: 'lint', status: 'PASSED', exitCode: 0, signal: null, stdout: 'ok', stderr: '', outputTruncated: false },
            { id: 'tests', status: 'PASSED', exitCode: 0, signal: null, stdout: 'ok', stderr: '', outputTruncated: false },
        ] });
    });

    it('preserves failing exit details, timeout, and runner errors', async () => {
        const execute = vi.fn()
            .mockResolvedValueOnce(result({ exitCode: 4, stderr: 'failure' }))
            .mockResolvedValueOnce(result({ exitCode: null, timedOut: true, signal: 'SIGTERM' }));
        const report = await createVerificationPipeline({ commandRunner: { execute }, checks }).run();
        expect(report.passed).toBe(false);
        expect(report.results.map(({ status }) => status)).toEqual(['FAILED', 'TIMED_OUT']);
        expect(report.results[0]).toMatchObject({ exitCode: 4, stderr: 'failure' });

        const errorReport = await createVerificationPipeline({
            commandRunner: { execute: vi.fn().mockRejectedValue(new Error('spawn failed')) }, checks: [checks[0]],
        }).run();
        expect(errorReport.results[0]).toMatchObject({ status: 'ERROR', stderr: 'spawn failed', exitCode: null });
    });

    it('stops after cancellation and rejects malformed or oversized configurations', async () => {
        const execute = vi.fn().mockResolvedValue(result({ exitCode: null, aborted: true }));
        const report = await createVerificationPipeline({ commandRunner: { execute }, checks }).run();
        expect(report).toMatchObject({ passed: false, results: [{ status: 'CANCELLED' }] });
        expect(execute).toHaveBeenCalledTimes(1);
        expect(() => createVerificationPipeline({ commandRunner: {}, checks })).toThrowError(DomainInvariantError);
        expect(() => createVerificationPipeline({ commandRunner: { execute }, checks: Array(21).fill(checks[0]) }))
            .toThrowError(DomainInvariantError);
        expect(() => createVerificationPipeline({ commandRunner: { execute }, checks: [{ ...checks[0], id: '' }] }))
            .toThrowError(DomainInvariantError);
    });
});
