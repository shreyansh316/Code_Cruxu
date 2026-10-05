/** Phase 226 — define the bounded, evidence-backed code explanation contract. */
import { describe, expect, it } from 'vitest';
import { CODE_EXPLANATION_ACTIONS, CODE_EXPLANATION_SECTIONS, CODE_EXPLANATION_SOURCES, createCodeExplanation } from '../src/domain';

describe('Phase 226 — code explanation contract', () => {
    it('projects cited claims and only the evidence they reference', () => {
        const explanation = createCodeExplanation({
            action: 'WHY_THIS', selected: 'Reuse TaskRepository', confidence: 'HIGH',
            sections: {
                CHANGE: [{ text: 'The existing repository is reused.', evidenceIds: ['architecture'] }],
                WHY: [{ text: 'The required persistence operation already exists.', evidenceIds: ['repo-test', 'architecture'] }],
                TESTS: [{ text: 'Repository behavior is covered by tests.', evidenceIds: ['repo-test'] }],
            },
            evidence: [
                { id: 'architecture', type: 'source', label: 'TaskRepository API' },
                { id: 'repo-test', type: 'test', label: 'task repository tests' },
                { id: 'unused', type: 'note', label: 'Not cited and therefore omitted' },
            ],
        });
        expect(explanation.action).toBe('WHY_THIS');
        expect(explanation.sections.WHY[0].evidenceIds).toEqual(['repo-test', 'architecture']);
        expect(explanation.sections.WHY[0].source).toBe('UNKNOWN');
        expect(explanation.evidence.map(({ id }) => id)).toEqual(['architecture', 'repo-test']);
        expect(explanation.sections.ALTERNATIVES).toEqual([]);
        expect(explanation.confidence).toBe('HIGH');
        expect(Object.isFrozen(explanation.sections.WHY[0])).toBe(true);
    });

    it('does not invent claims or rationale when evidence is absent', () => {
        const explanation = createCodeExplanation({ action: 'EXPLAIN_CHANGE', selected: 'Current patch' });
        expect(explanation.sections.CHANGE).toEqual([]);
        expect(explanation.sections.WHY).toEqual([]);
        expect(explanation.evidence).toEqual([]);
        expect(explanation.confidence).toBe('UNASSESSED');
    });

    it('rejects unsupported actions, uncited claims, and dangling evidence references', () => {
        expect(CODE_EXPLANATION_ACTIONS).toContain('REVIEW_SECURITY');
        expect(CODE_EXPLANATION_SECTIONS).toContain('REJECTED_OPTIONS');
        expect(CODE_EXPLANATION_SOURCES).toContain('ORIGINAL_DECISION');
        expect(() => createCodeExplanation({ action: 'WHY_THIS?', selected: 'Change' })).toThrow(/supported explanation action/);
        expect(() => createCodeExplanation({ action: 'WHY_THIS', selected: 'Change', sections: {
            WHY: [{ text: 'It is faster.', evidenceIds: [] }],
        } })).toThrow(/must cite evidence/);
        expect(() => createCodeExplanation({ action: 'WHY_THIS', selected: 'Change', evidence: [{ id: 'x', type: 'test', label: 'test' }], sections: {
            WHY: [{ text: 'Unsupported provenance.', source: 'INVENTED', evidenceIds: ['x'] }],
        } })).toThrow(/must cite evidence/);
        expect(() => createCodeExplanation({ action: 'WHY_THIS', selected: 'Change', evidence: [{ id: 'x', type: 'test', label: 'test' }], sections: {
            WHY: [{ text: 'Covered.', evidenceIds: ['missing'] }],
        } })).toThrow(/missing evidence/);
    });
});
