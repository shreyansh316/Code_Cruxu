/** Phase 223 — malformed event clocks do not interrupt workspace operations. */
import { describe, expect, it, vi } from 'vitest';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 223 — activity feed fault isolation', () => {
    it('ignores invalid timestamps and clock failures without retaining bad records', () => {
        const clock = vi.fn().mockReturnValueOnce(new Date('invalid')).mockImplementationOnce(() => { throw new Error('clock'); });
        const feed = new ExecutionActivityFeed({ clock });
        expect(feed.record('workspace', { operation: 'read', path: 'a.js', succeeded: true })).toBe(false);
        expect(feed.record('command', { event: 'started' })).toBe(false);
        expect(feed.listRecent()).toEqual([]);
    });
});
