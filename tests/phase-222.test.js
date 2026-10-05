/** Phase 222 — capture redacted verification output in bounded activity. */
import { describe, expect, it } from 'vitest';
import { createVerificationPipeline } from '../src/infrastructure';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 222 — verification output activity', () => {
    it('retains a bounded redacted verification preview without affecting result evidence', async () => {
        const feed = new ExecutionActivityFeed();
        const pipeline = createVerificationPipeline({ commandRunner: { execute: async () => ({
            exitCode: 1, signal: null, stdout: 'failed api_key=verify-secret', stderr: '', outputTruncated: true,
        }) }, checks: [{ id: 'unit-tests', command: 'node', args: [] }], onActivity: feed.observer('verification') });

        const result = await pipeline.run();
        const activity = feed.listRecent()[0];
        expect(result.results[0].stdout).toContain('verify-secret');
        expect(activity).toMatchObject({ target: 'unit-tests', status: 'FAILED', detail: 'failed api_key=[redacted]', detailTruncated: true });
        expect(JSON.stringify(activity)).not.toContain('verify-secret');
    });
});
