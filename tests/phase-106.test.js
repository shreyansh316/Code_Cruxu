import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 106 — task failure and blocker visibility', () => {
    it('shows bounded persisted failure and blocker summaries without task identifiers or results', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks: [
                { id: 'failed-secret', title: 'Generate report', status: 'FAILED', result: { private: 'do not show' } },
                { id: 'blocked-secret', title: 'Run checks', status: 'BLOCKED', blockerReason: 'Verification returned exit code 2.' },
                { id: 'completed-secret', title: 'Finished work', status: 'COMPLETED' },
            ],
        });

        expect(snapshot.taskErrors).toEqual([
            { title: 'Generate report', status: 'FAILED', message: 'Task failed. Review its recorded result.' },
            { title: 'Run checks', status: 'BLOCKED', message: 'Verification returned exit code 2.' },
        ]);
        expect(JSON.stringify(snapshot)).not.toContain('failed-secret');
        expect(JSON.stringify(snapshot)).not.toContain('private');
        expect(snapshot.activeTasks.map(({ title }) => title)).toEqual(['Run checks']);
    });

    it('renders errors through text nodes and an explicit empty state', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('Task errors and blockers');
        expect(html).toContain('No failed or blocked tasks.');
        expect(html).toContain('message.textContent = record.message');
        expect(html).not.toContain('innerHTML');
    });
});
