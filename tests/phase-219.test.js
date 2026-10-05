/** Phase 219 — show a safe terminal executable label in activity records. */
import { describe, expect, it, vi } from 'vitest';
import { basename } from 'path';
import { createCommandRunner } from '../src/infrastructure';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 219 — safe terminal command labels', () => {
    it('shows the executable basename without arguments or its absolute path', async () => {
        const feed = new ExecutionActivityFeed();
        const onActivity = vi.fn(feed.observer('command'));
        const runner = createCommandRunner({ allowedCommands: [process.execPath], onActivity });
        await runner.execute({ command: process.execPath, args: ['--version'] });

        const records = feed.listRecent({ limit: 2 });
        expect(records.map(({ target }) => target)).toEqual([basename(process.execPath), basename(process.execPath)]);
        expect(JSON.stringify(records)).not.toContain(process.execPath);
        expect(JSON.stringify(records)).not.toContain('--version');
    });

    it('redacts credential patterns from executable labels', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'finished', command: 'ghp_123456789012345678901234567890123456.exe', exitCode: 0 });
        expect(feed.listRecent()[0].target).toContain('[redacted-github-token]');
        expect(feed.listRecent()[0].target).not.toContain('ghp_123456789012345678901234567890123456');
    });
});
