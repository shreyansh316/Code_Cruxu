/** Phase 227 — explain reviewed changes using only captured evidence. */
import { describe, expect, it } from 'vitest';
import { createReviewEvidenceExplanation } from '../src/application';

describe('Phase 227 — review evidence explanation projection', () => {
    it('derives change, acceptance, test, and risk facts while leaving rationale and confidence unasserted', () => {
        const explanation = createReviewEvidenceExplanation({
            schemaVersion: 1, taskId: 'task-227',
            provenance: { head: 'a'.repeat(40) },
            changes: { added: [{ path: 'new.js' }], modified: [{ path: 'old.js' }], deleted: [], renamed: [] },
            acceptance: { summary: 'Persist the result.', criteria: [{ criterionId: 'criterion-1', met: true, evidence: 'Value was persisted.' }] },
            checks: [{ id: 'unit-tests', status: 'FAILED', exitCode: 1, stdout: 'private log', stderr: '' }],
        }, { action: 'EXPLAIN_CHANGE', selected: 'Implement output persistence' });

        expect(explanation.sections.CHANGE).toHaveLength(2);
        expect(explanation.sections.WHY).toEqual([]);
        expect(explanation.sections.REQUIREMENT).toHaveLength(2);
        expect(explanation.sections.TESTS[0].text).toContain('FAILED');
        expect(explanation.sections.RISKS[0].text).toContain('did not pass');
        expect(explanation.confidence).toBe('UNASSESSED');
        expect(JSON.stringify(explanation)).not.toContain('private log');
    });

    it('rejects malformed or unvalidated review bundle shapes', () => {
        expect(() => createReviewEvidenceExplanation({ schemaVersion: 2 })).toThrow(/validated review evidence bundle/);
    });
});
