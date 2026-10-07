/** Phase 437 — avoid repetitive screen-reader announcements during live refresh. */
import { describe, expect, it } from 'vitest';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 437 — concise live execution announcements', () => {
    it('keeps changing count summaries outside the live region and announces state changes only', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('<p id="summary" class="summary">Loading current workspace data…</p>');
        expect(html).toContain('id="execution-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"');
        expect(html).toContain('if (executionStatus !== lastAnnouncedExecutionStatus)');
        expect(html).toContain("executionAnnouncement.textContent = 'Execution ' + label + '.';");
        expect(html).toContain("executionAnnouncement.textContent = summary.textContent;");
        expect(html).toContain("summary.textContent = 'Execution ' + executionStatus.toLowerCase() + ' · '");
    });
});
