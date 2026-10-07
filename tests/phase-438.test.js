/** Phase 438 — make workspace refresh recovery clear to assistive technology. */
import { describe, expect, it } from 'vitest';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 438 — live workspace load recovery', () => {
    it('announces recovery and synchronizes the last announced execution state', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('let workspaceLoadFailed = false;');
        expect(html).toContain('workspaceLoadFailed = true;');
        expect(html).toContain('if (workspaceLoadFailed) {');
        expect(html).toContain("executionAnnouncement.textContent = 'Workspace data loaded. Execution ' + label + '.';");
        expect(html).toContain('lastAnnouncedExecutionStatus = executionStatus;');
        expect(html).toContain('workspaceLoadFailed = false;');
    });
});
