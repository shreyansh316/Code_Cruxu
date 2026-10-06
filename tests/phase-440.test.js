/** Phase 440 — keep Command Center evidence readable at narrow widths. */
import { describe, expect, it } from 'vitest';
import { renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 440 — resilient Command Center evidence layout', () => {
    it('wraps long task, file, and Director text instead of forcing horizontal overflow', () => {
        const html = renderCommandCenterHtml();

        expect(html).toContain('.record { display: flex; flex-wrap: wrap;');
        expect(html).toContain('min-width: 0; padding: .55rem .7rem;');
        expect(html).toContain('overflow-wrap: anywhere;');
        expect(html).toContain('.status { flex: 0 1 auto;');
        expect(html).toContain('@media (max-width: 600px)');
        expect(html).toContain('.status { text-align: left; }');
    });
});
