/** Phase 253 — parse only evidence-grounded engineering review findings. */
import { describe, expect, it } from 'vitest';
import { parseEngineeringReviewResponse } from '../src/application';

const evidence = [{ id: 'source-1', type: 'source', label: 'src/file.js', excerpt: 'resolve(root, relativePath)' }];

describe('Phase 253 — engineering review response validation', () => {
    it('accepts a cited finding and keeps speculative concerns in their own collection', () => {
        const review = parseEngineeringReviewResponse({ area: 'SECURITY', selected: 'file', evidence,
            response: JSON.stringify({ findings: [{ id: 'f1', title: 'Missing containment check', severity: 'HIGH',
                confidence: 'UNASSESSED',
                whyItMatters: 'Relative traversal can escape the root.', recommendedFix: 'Verify the canonical path.',
                alternatives: [], evidenceIds: ['source-1'],
                evidenceQuotes: [{ evidenceId: 'source-1', text: 'resolve(root, relativePath)' }] }],
            speculations: [{ hypothesis: 'A race may remain.', neededEvidence: 'Add a race test.', evidenceIds: [] }], confidence: 'UNASSESSED' }) });
        expect(review.findings).toHaveLength(1);
        expect(review.speculations).toHaveLength(1);
        expect(review.evidence[0].id).toBe('source-1');
    });

    it('rejects uncited findings, unsupported fields, and malformed responses', () => {
        const finding = { id: 'f1', title: 'Issue', severity: 'HIGH', whyItMatters: 'Risk', recommendedFix: 'Fix', alternatives: [],
            evidenceIds: ['missing'], evidenceQuotes: [{ evidenceId: 'missing', text: 'bad source' }] };
        expect(() => parseEngineeringReviewResponse({ selected: 'file', evidence,
            response: JSON.stringify({ findings: [finding], speculations: [], confidence: 'UNASSESSED' }) })).toThrow(/valid evidence/);
        expect(() => parseEngineeringReviewResponse({ selected: 'file', response: '{bad json' })).toThrow(/valid JSON/);
        expect(() => parseEngineeringReviewResponse({ selected: 'file', response: JSON.stringify({ findings: [], speculations: [], secret: 'x' }) }))
            .toThrow(/unsupported fields/);
        expect(() => parseEngineeringReviewResponse({ selected: 'file', response: JSON.stringify({ findings: [], speculations: [], confidence: 'HIGH' }) }))
            .toThrow(/missing or unsupported fields/);
    });
});
