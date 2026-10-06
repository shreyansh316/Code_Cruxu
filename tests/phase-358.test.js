/** Phase 358 — connect persisted decision memory to evidence-backed explanations. */
import { describe, expect, it } from 'vitest';
import { createDecisionEvidenceExplanation } from '../src/application';

describe('Phase 358 — decision explanation projection', () => {
    it('labels only persisted decision claims as original and cites their record IDs', () => {
        const explanation = createDecisionEvidenceExplanation([{ id: 'decision-358', taskTitle: 'Cache design',
            options: ['SQLite', 'Memory'], selectedOption: 'SQLite', rejectedOptions: ['Memory'],
            reason: 'Restart persistence is required.', tradeOffs: ['Schema maintenance.'] }]);
        expect(explanation.sections.WHY).toMatchObject([{ text: 'Recorded decision reason: Restart persistence is required.',
            source: 'ORIGINAL_DECISION', evidenceIds: ['decision-record:decision-358'] }]);
        expect(explanation.sections.REJECTED_OPTIONS[0].source).toBe('ORIGINAL_DECISION');
        expect(explanation.evidence).toEqual([{ id: 'decision-record:decision-358', type: 'decision-record',
            label: 'Cache design: selected SQLite' }]);
        expect(explanation.confidence).toBe('UNASSESSED');
    });

    it('does not invent claims when no decision exists and rejects malformed records', () => {
        expect(createDecisionEvidenceExplanation([]).sections.WHY).toEqual([]);
        expect(() => createDecisionEvidenceExplanation([{ id: 'invented', taskTitle: 'Cache', options: [],
            selectedOption: 'SQLite', rejectedOptions: [], reason: 'Reason', tradeOffs: [] }])).toThrow(/complete persisted decision records/);
    });
});
