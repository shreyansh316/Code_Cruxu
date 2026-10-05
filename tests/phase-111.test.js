import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 111 — persisted task progress summary', () => {
    it('uses domain progress counts across active and terminal task states', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [
            { title: 'Ship', status: 'COMPLETED' },
            { title: 'Build', status: 'IN_PROGRESS' },
            { title: 'Test', status: 'FAILED' },
            { title: 'Old task', status: 'CANCELLED' },
        ] });

        expect(snapshot.taskProgress).toMatchObject({ total: 4, completed: 1, failed: 1, cancelled: 1, active: 1 });
        expect(snapshot.taskProgress.completionPercentage).toBeGreaterThan(0);
        expect(snapshot.taskProgress.completionPercentage).toBeLessThanOrEqual(100);
    });

    it('renders an accessible progress meter and handles the empty-work state', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [] });
        const html = renderCommandCenterHtml();
        expect(snapshot.taskProgress.total).toBe(0);
        expect(html).toContain('aria-label="Completed task percentage"');
        expect(html).toContain('progress.completed + \' of \' + progress.total');
        expect(html).toContain('No task progress yet.');
    });
});
