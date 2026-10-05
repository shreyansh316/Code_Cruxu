/** Phase 215 — redact secrets from task blocker summaries. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 215 — blocker message redaction', () => {
    it('redacts credentials while preserving useful blocker context', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks: [{ id: 'blocked-215', title: 'Run checks', status: 'BLOCKED',
                blockerReason: 'Provider rejected request: api_key=sk-secret-215; retry after configuration.' }],
        });

        expect(snapshot.taskErrors).toHaveLength(1);
        expect(snapshot.taskErrors[0].message).toContain('Provider rejected request');
        expect(snapshot.taskErrors[0].message).toContain('retry after configuration.');
        expect(snapshot.taskErrors[0].message).not.toContain('sk-secret-215');
    });

    it('redacts bearer tokens in blocker messages', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks: [{ id: 'blocked-bearer-215', title: 'Deploy', status: 'BLOCKED',
                blockerReason: 'Request failed with Bearer abc.def.ghi; access denied.' }],
        });
        expect(snapshot.taskErrors[0].message).not.toContain('abc.def.ghi');
        expect(snapshot.taskErrors[0].message).toContain('access denied.');
    });
});
