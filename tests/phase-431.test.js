/** Phase 431 — guard native keyboard and theme-aware accessibility in the Command Center. */
import { describe, expect, it } from 'vitest';
import { renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 431 — Command Center keyboard and visual accessibility contract', () => {
    it('keeps controls in native keyboard order and makes every button non-submitting', () => {
        const html = renderCommandCenterHtml();
        const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
        expect(buttons.length).toBeGreaterThan(10);
        expect(buttons.every((tag) => /\btype="button"/.test(tag))).toBe(true);
        expect(html).not.toMatch(/\btabindex="[1-9]\d*"/);
        expect(html).toContain('href="#main-content">Skip to command center content</a>');
    });

    it('keeps focus, status, progress, and collapsible controls visible to assistive technology', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('button:focus-visible { outline: 2px solid var(--vscode-focusBorder)');
        expect(html).toContain('id="execution-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"');
        expect(html).not.toContain('id="summary" class="summary" role="status" aria-live="polite"');
        expect(html).toContain('aria-valuetext');
        expect(html).toContain('aria-controls="objectives" aria-expanded="true"');
        expect(html).toContain('aria-controls="execution-activity" aria-expanded="true"');
    });

    it('uses VS Code theme colors and wraps the command bar at narrow widths', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('var(--vscode-button-foreground)');
        expect(html).toContain('var(--vscode-button-background)');
        expect(html).toContain('@media (max-width: 600px)');
        expect(html).toContain('.command-actions { justify-content: flex-start; }');
    });
});
