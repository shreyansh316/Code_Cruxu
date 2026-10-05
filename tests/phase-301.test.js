/** Phase 301 — sanitize all user-visible command-center text projections. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 301 — command center text redaction', () => {
    it('redacts secrets from objective/task titles and employee identity labels', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [{ id: 'objective-301', title: 'Ship token=objective-secret', status: 'ACTIVE' }],
            tasks: [{ id: 'task-301', objectiveId: 'objective-301', title: 'Use api_key=task-secret', status: 'IN_PROGRESS' }],
            agents: [{ id: 'agent-301', name: 'Engineer password=agent-secret' }],
            executionActivity: [{ source: 'command', action: 'Command', target: 'npm test', status: 'SUCCEEDED',
                taskId: 'task-301', agentId: 'agent-301', occurredAt: '2026-10-05T00:00:00.000Z' }],
        });

        const serialized = JSON.stringify(snapshot);
        expect(serialized).not.toMatch(/objective-secret|task-secret|agent-secret/);
        expect(snapshot.objectives[0].title).toBe('Ship token=[redacted]');
        expect(snapshot.activeTasks[0].title).toBe('Use api_key=[redacted]');
        expect(snapshot.executionActivity[0].agentName).toBe('Engineer password=[redacted]');
    });
});
