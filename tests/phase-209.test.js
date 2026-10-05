/** Phase 209 — adapter observer composition into the live activity feed. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCommandRunner, createVerificationPipeline, createWorkspaceFileAdapter } from '../src/infrastructure';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 209 — execution feed composition', () => {
    it('routes file, process, and verification observers into one bounded feed', async () => {
        const root = await mkdtemp(join(tmpdir(), 'headroom-feed-'));
        roots.push(root);
        const feed = new ExecutionActivityFeed();
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root, onActivity: feed.observer('workspace') });
        await files.createFile('result.txt', 'private file contents');

        const runner = createCommandRunner({ allowedCommands: [process.execPath], timeoutMs: 1000,
            onActivity: feed.observer('command') });
        await runner.execute({ command: process.execPath, args: ['-e', "process.stdout.write('private terminal output')"] });

        const pipeline = createVerificationPipeline({ commandRunner: { execute: async () => ({ exitCode: 0, signal: null,
            stdout: 'private verification output', stderr: '', timedOut: false, aborted: false, outputTruncated: false }) },
        checks: [{ id: 'test-suite', command: 'ignored-by-port', args: [] }], onActivity: feed.observer('verification') });
        await pipeline.run();

        const records = feed.listRecent({ limit: 10 });
        expect(records.some((record) => record.action === 'File created')).toBe(true);
        expect(records.some((record) => record.action === 'Terminal command finished' && record.status === 'SUCCEEDED')).toBe(true);
        expect(records.some((record) => record.action === 'Verification finished' && record.status === 'PASSED')).toBe(true);
        expect(records.find((record) => record.action === 'Terminal command finished').detail).toBe('private terminal output');
        expect(records.find((record) => record.action === 'Verification finished').detail).toBe('private verification output');
        expect(JSON.stringify(records)).not.toContain('private file contents');
    });

    it('rejects observers for unrecognized sources', () => {
        expect(() => new ExecutionActivityFeed().observer('database')).toThrow(/Unsupported/);
    });
});
