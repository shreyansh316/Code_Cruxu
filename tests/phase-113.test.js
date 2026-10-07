import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 113 — completed task visibility', () => {
    it('shows bounded completion labels separately from active work and excludes task result payloads', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [
            { id: 'done-secret', title: 'Publish docs', status: 'COMPLETED', result: { private: 'not displayed' } },
            { id: 'running-secret', title: 'Run checks', status: 'IN_PROGRESS' },
        ] });

        expect(snapshot.completedTasks).toEqual([{ title: 'Publish docs', status: 'COMPLETED' }]);
        expect(snapshot.activeTasks).toEqual([{ title: 'Run checks', status: 'IN_PROGRESS' }]);
        expect(JSON.stringify(snapshot)).not.toContain('done-secret');
        expect(JSON.stringify(snapshot)).not.toContain('not displayed');
        expect(renderCommandCenterHtml()).toContain('No completed tasks yet.');
    });
});
