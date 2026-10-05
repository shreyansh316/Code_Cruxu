/** Phase 220 — show bounded, redacted terminal output in execution activity. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 220 — safe terminal output preview', () => {
    it('makes a short sanitized output preview visible in the Command Center snapshot', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'finished', command: 'node', exitCode: 1,
            outputPreview: `failed: api_key=private-value; ${'x'.repeat(400)}` });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0].detail.startsWith('failed: api_key=[redacted]')).toBe(true);
        expect(snapshot.executionActivity[0].detail.length).toBeLessThanOrEqual(180);
        expect(JSON.stringify(snapshot)).not.toContain('private-value');
    });
});
