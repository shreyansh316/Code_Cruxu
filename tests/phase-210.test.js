/** Phase 210 — associate live execution activity with task titles. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 210 — task-linked execution activity', () => {
    it('maps internal task identifiers to persisted titles without exposing identifiers', () => {
        const feed = new ExecutionActivityFeed();
        feed.observer('verification', { taskId: 'secret-task-id' })({ event: 'finished', check: 'unit-tests', status: 'PASSED', durationMs: 500 });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [
            { id: 'secret-task-id', title: 'Verify release checks', status: 'IN_PROGRESS' },
        ], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0]).toMatchObject({ taskTitle: 'Verify release checks', target: 'unit-tests' });
        expect(JSON.stringify(snapshot.executionActivity)).not.toContain('secret-task-id');
    });

    it('leaves activity unlinked when its task is absent from the snapshot', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'finished', exitCode: 0 }, { taskId: 'orphan' });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0].taskTitle).toBe('');
        expect(JSON.stringify(snapshot)).not.toContain('orphan');
    });
});
