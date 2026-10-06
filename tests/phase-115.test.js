import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot, renderCommandCenterHtml } from '../src/core/CommandCenterPanel';

describe('Phase 115 — truthful execution status', () => {
    it('preserves paused and cancelled states rather than labeling them as running', () => {
        expect(createCommandCenterSnapshot({ objectives: [], tasks: [], executionStatus: 'PAUSED' }).executionStatus).toBe('PAUSED');
        expect(createCommandCenterSnapshot({ objectives: [], tasks: [], executionStatus: 'CANCELLED' }).executionStatus).toBe('CANCELLED');
        expect(createCommandCenterSnapshot({ objectives: [], tasks: [], executionStatus: 'UNKNOWN' }).executionStatus).toBe('RUNNING');
        const html = renderCommandCenterHtml();
        expect(html).toContain("['PAUSED', 'CANCELLED'].includes(snapshot.executionStatus) ? snapshot.executionStatus : 'RUNNING'");
        expect(html).toContain("executionStatus === 'CANCELLED' ? 'cancelled' : 'running'");
    });
});
