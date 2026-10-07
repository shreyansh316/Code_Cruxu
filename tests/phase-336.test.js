/** Phase 336 — command center accessibility landmarks and toggle state. */
import { describe, expect, it } from 'vitest';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 336 — command center accessibility', () => {
    it('provides keyboard bypass, labeled navigation, and a main content landmark', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('href="#main-content">Skip to command center content</a>');
        expect(html).toContain('<nav class="command-actions" aria-label="Command center actions">');
        expect(html).toContain('<main id="main-content" tabindex="-1">');
        expect(html).toContain('button:focus-visible');
        expect(html).toContain('@media (max-width: 600px)');
    });

    it('announces which section a toggle controls and exposes task progress text', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('aria-label="Hide Objectives section"');
        expect(html).toContain("button.setAttribute('aria-label', (collapsed ? 'Show ' : 'Hide ') + sectionLabels[section] + ' section')");
        expect(html).toContain("taskProgress.setAttribute('aria-valuetext'");
        expect(html).toContain('aria-live="polite"');
    });
});
