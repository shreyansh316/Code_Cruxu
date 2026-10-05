/** Phase 292 — sanitize identifiers retained in execution activity. */
import { describe, expect, it } from 'vitest';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 292 — activity identity sanitation', () => {
    it('redacts credential-like task and agent identifiers while retaining useful identifiers', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'started', command: 'npm test' }, {
            taskId: 'task-292', agentId: 'agent-api_key=private-value',
        });

        expect(feed.listRecent()[0]).toMatchObject({
            taskId: 'task-292', agentId: 'agent-api_key=[redacted]',
        });
        expect(JSON.stringify(feed.listRecent())).not.toContain('private-value');
    });

    it('still caps identifiers after sanitation', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('verification', { event: 'started', check: 'unit' }, { taskId: 'x'.repeat(500) });
        expect(feed.listRecent()[0].taskId).toHaveLength(160);
    });
});
