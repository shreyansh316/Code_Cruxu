/** Phase 207 — complete terminal activity for launch failures and pre-launch cancellation. */
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandRunner } from '../src/infrastructure';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 207 — terminal lifecycle edge cases', () => {
    it('records a stable error event when an allowlisted executable cannot launch', async () => {
        const root = await mkdtemp(join(tmpdir(), 'headroom-runner-'));
        roots.push(root);
        const onActivity = vi.fn();
        const missingExecutable = join(root, 'missing.exe');
        const runner = createCommandRunner({ allowedCommands: [missingExecutable], onActivity });
        await expect(runner.execute({ command: missingExecutable })).rejects.toBeDefined();
        expect(onActivity.mock.calls.map(([event]) => event.event)).toEqual(['started', 'finished']);
        expect(onActivity.mock.calls[1][0]).toMatchObject({ event: 'finished', error: true, durationMs: expect.any(Number) });

        const feed = new ExecutionActivityFeed();
        feed.record('command', onActivity.mock.calls[1][0]);
        expect(feed.listRecent()[0]).toMatchObject({ action: 'Terminal command finished', status: 'ERROR' });
    });

    it('records pre-launch cancellation without reporting a started command', async () => {
        const onActivity = vi.fn();
        const controller = new AbortController();
        controller.abort();
        const runner = createCommandRunner({ allowedCommands: [process.execPath], onActivity });
        await expect(runner.execute({ command: process.execPath, args: ['--version'], signal: controller.signal }))
            .resolves.toMatchObject({ aborted: true, exitCode: null });
        expect(onActivity.mock.calls.map(([event]) => event.event)).toEqual(['finished']);
        expect(onActivity.mock.calls[0][0]).toMatchObject({ aborted: true, durationMs: 0 });
    });
});
