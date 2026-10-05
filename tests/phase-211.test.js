/** Phase 211 — show the assigned employee for execution activity. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 211 — activity actor visibility', () => {
    it('resolves the persisted employee name without exposing the employee identifier', () => {
        const feed = new ExecutionActivityFeed();
        feed.observer('workspace', { taskId: 'task-id-private', agentId: 'agent-id-private' })({
            operation: 'write', path: 'src/result.js', bytes: 20, succeeded: true,
        });
        const snapshot = createCommandCenterSnapshot({ objectives: [],
            tasks: [{ id: 'task-id-private', title: 'Implement feature', status: 'IN_PROGRESS' }],
            agents: [{ id: 'agent-id-private', name: 'Platform Engineer' }], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0]).toMatchObject({ taskTitle: 'Implement feature', agentName: 'Platform Engineer' });
        expect(JSON.stringify(snapshot.executionActivity)).not.toContain('task-id-private');
        expect(JSON.stringify(snapshot.executionActivity)).not.toContain('agent-id-private');
    });

    it('omits missing employee names rather than displaying internal identifiers', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'started' }, { agentId: 'missing-agent' });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0].agentName).toBe('');
        expect(JSON.stringify(snapshot.executionActivity)).not.toContain('missing-agent');
    });
});
