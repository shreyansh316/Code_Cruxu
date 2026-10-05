/** Phase 291 — redact and cap command output at the verification result boundary. */
import { describe, expect, it, vi } from 'vitest';
import { createVerificationPipeline } from '../src/infrastructure';

describe('Phase 291 — verification output sanitization', () => {
    it('redacts connection and Basic credentials even when the injected runner returns raw text', async () => {
        const secretUrl = 'postgres://db-user:private-pass@db.example/app';
        const basic = 'Basic dXNlcjpwYXNzd29yZA==';
        const onActivity = vi.fn();
        const pipeline = createVerificationPipeline({ commandRunner: { execute: vi.fn(async () => ({
            exitCode: 1, signal: null, timedOut: false, aborted: false, outputTruncated: false,
            stdout: `loaded ${secretUrl}`, stderr: `request failed: ${basic}`,
        })) }, checks: [{ id: 'audit', command: 'node', args: [] }], onActivity });
        const result = await pipeline.run();
        expect(result.results[0].stdout).not.toContain('private-pass');
        expect(result.results[0].stderr).not.toContain('dXNlcjpwYXNzd29yZA==');
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('private-pass');
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('dXNlcjpwYXNzd29yZA==');
    });

    it('caps runner output copied into verification evidence', async () => {
        const pipeline = createVerificationPipeline({ commandRunner: { execute: async () => ({ exitCode: 0,
            timedOut: false, aborted: false, outputTruncated: false, stdout: 'x'.repeat(2 * 1024 * 1024), stderr: '' }) },
        checks: [{ id: 'bounded', command: 'node', args: [] }] });
        const result = await pipeline.run();
        expect(result.results[0].stdout.length).toBeLessThanOrEqual(1024 * 1024);
    });
});
