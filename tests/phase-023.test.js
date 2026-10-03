/** Phase 023 — bounded allowlisted command runner. */
import { afterEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCommandRunner } from '../src/infrastructure';
import { DomainInvariantError } from '../src/domain';

const runner = (overrides = {}) => createCommandRunner({
    allowedCommands: [process.execPath], timeoutMs: 1000, maxOutputBytes: 128, ...overrides,
});
const nodeScript = (script) => runner().execute({ command: process.execPath, args: ['-e', script] });

describe('Phase 023 — bounded command runner', () => {
    it('runs allowlisted executable arguments without a shell and preserves exit details', async () => {
        const result = await nodeScript("process.stdout.write('ok'); process.stderr.write('warning'); process.exitCode=7");
        expect(result).toMatchObject({ exitCode: 7, stdout: 'ok', stderr: 'warning', timedOut: false, aborted: false });
    });

    it('rejects unlisted executables and malformed arguments', async () => {
        await expect(runner().execute({ command: join(tmpdir(), 'not-allowed.exe') }))
            .rejects.toBeInstanceOf(DomainInvariantError);
        await expect(runner().execute({ command: process.execPath, args: ['-e', 3] }))
            .rejects.toBeInstanceOf(DomainInvariantError);
    });

    it('bounds output, times out long processes, and supports cancellation', async () => {
        const limited = createCommandRunner({ allowedCommands: [process.execPath], maxOutputBytes: 8, timeoutMs: 1000 });
        const large = await limited.execute({ command: process.execPath, args: ['-e', "process.stdout.write('0123456789')"] });
        expect(large.outputTruncated).toBe(true);
        expect(Buffer.byteLength(large.stdout + large.stderr)).toBeLessThanOrEqual(8);

        const timed = await createCommandRunner({ allowedCommands: [process.execPath], timeoutMs: 50 })
            .execute({ command: process.execPath, args: ['-e', 'setTimeout(()=>{}, 5000)'] });
        expect(timed.timedOut).toBe(true);

        const controller = new AbortController();
        const pending = runner().execute({ command: process.execPath, args: ['-e', 'setTimeout(()=>{}, 5000)'], signal: controller.signal });
        controller.abort();
        expect((await pending).aborted).toBe(true);
    });

    it('rejects unbounded runner options', () => {
        expect(() => createCommandRunner({ allowedCommands: [], timeoutMs: 1 })).toThrowError(DomainInvariantError);
        expect(() => createCommandRunner({ allowedCommands: [process.execPath], maxOutputBytes: 1024 * 1024 + 1 }))
            .toThrowError(DomainInvariantError);
    });
});
