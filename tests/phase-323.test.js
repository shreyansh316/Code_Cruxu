/** Phase 323 — reject forged cancellation objects before child-process startup. */
import { describe, expect, it, vi } from 'vitest';
import { createCommandRunner } from '../src/infrastructure/CommandRunner';

describe('Phase 323 — command cancellation signal trust boundary', () => {
    it('rejects a duck-typed signal before spawning or reporting command activity', async () => {
        const onActivity = vi.fn();
        const runner = createCommandRunner({ allowedCommands: [process.execPath], onActivity });
        await expect(runner.execute({ command: process.execPath, args: ['--version'],
            signal: { aborted: false, addEventListener() {} } }))
            .rejects.toMatchObject({ code: 'invalid-command-signal' });
        expect(onActivity).not.toHaveBeenCalled();
    });

    it('accepts a native signal and executes the explicitly allowed command', async () => {
        const runner = createCommandRunner({ allowedCommands: [process.execPath] });
        const result = await runner.execute({ command: process.execPath, args: ['--version'],
            signal: new AbortController().signal });
        expect(result.exitCode).toBe(0);
        expect(result.aborted).toBe(false);
    });
});
