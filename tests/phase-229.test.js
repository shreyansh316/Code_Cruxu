/** Phase 229 — strictly validate explain-code response JSON against source evidence. */
import { describe, expect, it } from 'vitest';
import { parseCodeExplanationResponse } from '../src/application';

const evidence = [{ id: 'file-a', type: 'source', label: 'src/task.js' }];
const emptySections = Object.fromEntries(['CHANGE', 'WHY', 'REQUIREMENT', 'CONTEXT', 'ALTERNATIVES',
    'REJECTED_OPTIONS', 'TRADE_OFFS', 'RISKS', 'TESTS'].map((key) => [key, []]));

describe('Phase 229 — evidence-bound explanation response parsing', () => {
    it('keeps the requested action and selection and accepts only cited model claims', () => {
        const result = parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'Reuse task service', evidence,
            response: JSON.stringify({ ...emptySections, confidence: 'UNASSESSED', WHY: [
                { text: 'The operation already exists.', source: 'RECONSTRUCTED_DECISION', evidenceIds: ['file-a'] },
            ] }) });
        expect(result.action).toBe('WHY_THIS');
        expect(result.selected).toBe('Reuse task service');
        expect(result.sections.WHY[0].text).toBe('The operation already exists.');
        expect(result.sections.WHY[0].source).toBe('RECONSTRUCTED_DECISION');
    });

    it('rejects invalid JSON, unsupported fields, ungrounded claims, and oversized responses', () => {
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', response: 'not json', evidence }))
            .toThrow(/valid JSON/);
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', evidence,
            response: JSON.stringify({ rationale: 'It is good.' }) })).toThrow(/missing or unsupported fields/);
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', evidence,
            response: JSON.stringify({ ...emptySections, action: 'FIX', confidence: 'UNASSESSED' }) })).toThrow(/missing or unsupported fields/);
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', evidence,
            response: JSON.stringify({ ...emptySections, confidence: 'HIGH' }) })).toThrow(/calibration evidence/);
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', evidence,
            response: JSON.stringify({ ...emptySections,
                WHY: [{ text: 'Unsupported fact', evidenceIds: ['nope'] }], confidence: 'UNASSESSED' }) })).toThrow(/missing evidence/);
        expect(() => parseCodeExplanationResponse({ action: 'WHY_THIS', selected: 'change', response: 'x'.repeat(33_000) }))
            .toThrow(/evidence envelope is invalid/);
    });
});
