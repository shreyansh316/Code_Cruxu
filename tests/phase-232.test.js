/** Phase 232 — distinguish decision evidence from reconstructed explanations. */
import { describe, expect, it } from 'vitest';
import { parseCodeExplanationResponse } from '../src/application';

const names = ['CHANGE', 'WHY', 'REQUIREMENT', 'CONTEXT', 'ALTERNATIVES', 'REJECTED_OPTIONS',
    'TRADE_OFFS', 'RISKS', 'TESTS'];
const empty = Object.fromEntries(names.map((name) => [name, []]));

describe('Phase 232 — explanation provenance labels', () => {
    it('retains original decision provenance only when the response cites decision evidence', () => {
        const parsed = parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'Use SQLite',
            evidence: [{ id: 'adr-1', type: 'decision-record', label: 'ADR 1: SQLite persistence' }],
            response: JSON.stringify({ ...empty, confidence: 'UNASSESSED', WHY: [{
                text: 'The decision record selected SQLite for durable local storage.',
                source: 'ORIGINAL_DECISION', evidenceIds: ['adr-1'],
            }] }) });
        expect(parsed.sections.WHY[0].source).toBe('ORIGINAL_DECISION');
    });

    it('defaults missing provenance to UNKNOWN and rejects unrecognized labels', () => {
        const missing = parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'Change',
            evidence: [{ id: 'code-1', type: 'source', label: 'Selected code' }],
            response: JSON.stringify({ ...empty, confidence: 'UNASSESSED', WHY: [{
                text: 'The current code uses this implementation.', evidenceIds: ['code-1'],
            }] }) });
        expect(missing.sections.WHY[0].source).toBe('UNKNOWN');
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'Change',
            evidence: [{ id: 'code-1', type: 'source', label: 'Selected code' }],
            response: JSON.stringify({ ...empty, confidence: 'UNASSESSED', WHY: [{
                text: 'The current code uses this implementation.', source: 'FACT', evidenceIds: ['code-1'],
            }] }) })).toThrow();
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'Change',
            evidence: [{ id: 'code-1', type: 'source', label: 'Selected code' }],
            response: JSON.stringify({ ...empty, confidence: 'UNASSESSED', WHY: [{
                text: 'The decision record selected this implementation.', source: 'ORIGINAL_DECISION', evidenceIds: ['code-1'],
            }] }) })).toThrow(/explicit decision record/);
    });
});
