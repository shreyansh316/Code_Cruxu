/** Phase 208 — persisted task execution duration. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 208 — task duration visibility', () => {
    it('calculates active and completed duration from valid task timestamps', () => {
        const startedAt = Date.parse('2026-10-05T10:00:00.000Z');
        const snapshot = createCommandCenterSnapshot({ objectives: [], capturedAt: startedAt + 65_000, tasks: [
            { title: 'Running task', status: 'IN_PROGRESS', createdAt: new Date(startedAt).toISOString() },
            { title: 'Finished task', status: 'COMPLETED', createdAt: new Date(startedAt).toISOString(),
                updatedAt: new Date(startedAt + 120_000).toISOString() },
            { title: 'Unknown timing', status: 'IN_PROGRESS', createdAt: 'invalid' },
        ] });
        expect(snapshot.activeTasks).toEqual([
            { title: 'Running task', status: 'IN_PROGRESS', durationMs: 65_000 },
            { title: 'Unknown timing', status: 'IN_PROGRESS' },
        ]);
        expect(snapshot.completedTasks).toEqual([{ title: 'Finished task', status: 'COMPLETED', durationMs: 120_000 }]);
        expect(renderCommandCenterHtml()).toContain('elapsed');
    });

    it('omits durations when timestamps are reversed or exceed safe date limits', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], capturedAt: 10, tasks: [
            { title: 'Future task', status: 'IN_PROGRESS', createdAt: new Date(20).toISOString() },
            { title: 'Bad completion time', status: 'COMPLETED', createdAt: new Date(0).toISOString(), updatedAt: 'not-a-date' },
        ] });
        expect(snapshot.activeTasks[0]).not.toHaveProperty('durationMs');
        expect(snapshot.completedTasks[0]).not.toHaveProperty('durationMs');
    });
});
