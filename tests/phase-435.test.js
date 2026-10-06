/** Phase 435 — make performer attribution explicit in Command Center activity. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 435 — explicit activity performer labels', () => {
    it('renders an Actor label so the live feed never presents activity anonymously', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain("' · Actor: ' + record.agentName");
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            executionActivity: [{ action: 'Command started' }, { action: 'File write', agentId: 'missing' }] });
        expect(snapshot.executionActivity.map(({ agentName }) => agentName))
            .toEqual(['Actor not recorded', 'Employee identity unavailable']);
    });
});
