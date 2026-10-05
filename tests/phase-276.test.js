/** Phase 276 — children receive a minimal environment without provider secrets or injection options. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandRunner } from '../src/infrastructure';

const names = ['HEADROOM_REVIEW_SAFE_VALUE', 'HEADROOM_TEST_PROVIDER_API_KEY', 'NODE_OPTIONS'];
const originalValues = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
    for (const name of names) {
        if (originalValues[name] === undefined) delete process.env[name];
        else process.env[name] = originalValues[name];
    }
});

describe('Phase 276 — child process environment isolation', () => {
    it('passes only explicit non-sensitive variables and omits ambient credentials', async () => {
        process.env.HEADROOM_REVIEW_SAFE_VALUE = 'safe-value';
        process.env.HEADROOM_TEST_PROVIDER_API_KEY = 'provider-secret-276';
        const onActivity = vi.fn();
        const runner = createCommandRunner({ allowedCommands: [process.execPath],
            allowedEnvironmentVariables: ['HEADROOM_REVIEW_SAFE_VALUE'], onActivity });
        const result = await runner.execute({ command: process.execPath,
            args: ['-e', 'process.stdout.write(JSON.stringify({safe:process.env.HEADROOM_REVIEW_SAFE_VALUE,secret:process.env.HEADROOM_TEST_PROVIDER_API_KEY??null}))'] });

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ safe: 'safe-value', secret: null });
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain('provider-secret-276');
    });

    it('refuses allowlisting secret-bearing and runtime-injection environment names', () => {
        for (const name of ['GOOGLE_API_KEY', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'LD_PRELOAD', 'HTTP_PROXY']) {
            expect(() => createCommandRunner({ allowedCommands: [process.execPath], allowedEnvironmentVariables: [name] }))
                .toThrow(/Runner requires commands/);
        }
    });

    it('redacts common credential values from command results as well as activity previews', async () => {
        const secret = 'ghp_123456789012345678901234567890123456';
        const runner = createCommandRunner({ allowedCommands: [process.execPath] });
        const result = await runner.execute({ command: process.execPath,
            args: ['-e', `process.stdout.write('api_key=${secret}'); process.stderr.write('Bearer ${secret}')`] });
        expect(result.stdout).toBe('api_key=[redacted]');
        expect(result.stderr).toBe('Bearer [redacted]');
        expect(JSON.stringify(result)).not.toContain(secret);
    });
});
