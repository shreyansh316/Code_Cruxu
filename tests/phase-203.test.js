/** Phase 203 — verification activity reporting. */
import { describe, expect, it, vi } from 'vitest';
import { createVerificationPipeline } from '../src/infrastructure';

describe('Phase 203 — verification activity', () => {
    it('reports test/build check lifecycle and a redacted preview without exposing command details', async () => {
        const onActivity = vi.fn();
        const secret = 'private output';
        const pipeline = createVerificationPipeline({
            commandRunner: { execute: vi.fn().mockResolvedValue({ exitCode: 0, signal: null, stdout: secret,
                stderr: '', timedOut: false, aborted: false, outputTruncated: false }) },
            checks: [{ id: 'unit-tests', command: '/private/path/node', args: ['--secret-flag'] }], onActivity,
        });

        const report = await pipeline.run();
        expect(report.passed).toBe(true);
        expect(onActivity.mock.calls.map(([event]) => event.event)).toEqual(['started', 'finished']);
        expect(onActivity.mock.calls[0][0]).toEqual({ event: 'started', check: 'unit-tests' });
        expect(onActivity.mock.calls[1][0]).toMatchObject({ event: 'finished', check: 'unit-tests', status: 'PASSED', durationMs: expect.any(Number) });
        expect(onActivity.mock.calls[1][0].outputPreview).toBe(secret);
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('/private/path');
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('--secret-flag');
    });

    it('reports errors and isolates observer failures', async () => {
        const onActivity = vi.fn(() => { throw new Error('observer failure'); });
        const pipeline = createVerificationPipeline({ commandRunner: { execute: vi.fn().mockRejectedValue(new Error('spawn failed')) },
            checks: [{ id: 'build', command: '/tools/build', args: [] }], onActivity });
        await expect(pipeline.run()).resolves.toMatchObject({ passed: false, results: [{ status: 'ERROR' }] });
        expect(onActivity).toHaveBeenCalledTimes(2);
        expect(() => createVerificationPipeline({ commandRunner: { execute() {} }, checks: [], onActivity: true })).toThrow();
    });
});
