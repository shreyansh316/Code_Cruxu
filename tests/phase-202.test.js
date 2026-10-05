/** Phase 202 — bounded terminal activity metadata. */
import { describe, expect, it, vi } from 'vitest';
import { createCommandRunner } from '../src/infrastructure';

describe('Phase 202 — command activity observation', () => {
    it('reports lifecycle, duration, exit state, and bounded byte counts without args or unredacted output', async () => {
        const onActivity = vi.fn();
        const runner = createCommandRunner({ allowedCommands: [process.execPath], maxOutputBytes: 64, onActivity });
        const secretOutput = 'token=do-not-log';
        const result = await runner.execute({ command: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(secretOutput)})`] });

        expect(result.stdout).toBe('token=[redacted]');
        expect(result.stdout).not.toContain('do-not-log');
        expect(onActivity.mock.calls.map(([event]) => event.event)).toEqual(['started', 'finished']);
        expect(onActivity.mock.calls[1][0]).toMatchObject({
            durationMs: expect.any(Number), exitCode: 0, timedOut: false, aborted: false,
            outputTruncated: false, stdoutBytes: Buffer.byteLength(secretOutput), stderrBytes: 0,
        });
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain(secretOutput);
        expect(onActivity.mock.calls[1][0].outputPreview).toBe('token=[redacted]');
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('process.execPath');
    });

    it('isolates observer failures from process results and validates the observer option', async () => {
        const runner = createCommandRunner({ allowedCommands: [process.execPath], onActivity: () => { throw new Error('observer'); } });
        await expect(runner.execute({ command: process.execPath, args: ['-e', "process.stdout.write('ok')"] }))
            .resolves.toMatchObject({ exitCode: 0, stdout: 'ok' });
        expect(() => createCommandRunner({ allowedCommands: [process.execPath], onActivity: false })).toThrow(/bounded/);
    });
});
