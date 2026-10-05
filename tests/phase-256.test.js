/** Phase 256 — require review quotes to match exact supplied source excerpts. */
import { describe, expect, it } from 'vitest';
import { createEngineeringReview } from '../src/domain';

describe('Phase 256 — exact review evidence quotations', () => {
    const evidence = [
        { id: 'src-a', type: 'source', label: 'src/a.js', excerpt: 'writeFile(target, content)' },
        { id: 'src-b', type: 'source', label: 'src/b.js', excerpt: 'readFile(target)' },
    ];

    it('accepts only findings quoting every evidence item they cite', () => {
        const base = { id: 'f1', title: 'Write lacks a containment guard', severity: 'HIGH', confidence: 'UNASSESSED', whyItMatters: 'The target may escape the workspace.',
            recommendedFix: 'Resolve the target and verify it is inside the root.', evidenceIds: ['src-a'],
            evidenceQuotes: [{ evidenceId: 'src-a', text: 'writeFile(target, content)' }] };
        expect(createEngineeringReview({ selected: 'File operation', evidence, findings: [base] }).findings).toHaveLength(1);
        expect(() => createEngineeringReview({ selected: 'File operation', evidence, findings: [{ ...base,
            evidenceQuotes: [{ evidenceId: 'src-a', text: 'invented line' }] }] })).toThrow(/valid evidence/);
        expect(() => createEngineeringReview({ selected: 'File operation', evidence, findings: [{ ...base,
            evidenceIds: ['src-a', 'src-b'] }] })).toThrow(/valid evidence/);
        expect(() => createEngineeringReview({ selected: 'File operation', evidence, findings: [{ ...base,
            confidence: 'HIGH' }] })).toThrow(/confidence/);
    });

    it('requires alternatives to cite exact supplied text too', () => {
        const finding = { id: 'f1', title: 'Potential path escape', severity: 'MEDIUM', confidence: 'UNASSESSED', whyItMatters: 'A path can escape.',
            recommendedFix: 'Use a canonical containment check.', evidenceIds: ['src-a'],
            evidenceQuotes: [{ evidenceId: 'src-a', text: 'writeFile(target, content)' }],
            alternatives: [{ text: 'Use a safe file API.', evidenceIds: ['src-b'],
                evidenceQuotes: [{ evidenceId: 'src-b', text: 'fake call' }] }] };
        expect(() => createEngineeringReview({ selected: 'File operation', evidence, findings: [finding] })).toThrow(/alternative/);
    });
});
