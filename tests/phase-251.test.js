/** Phase 251 — build review reports that separate verified findings from speculation. */
import { describe, expect, it } from 'vitest';
import { ENGINEERING_REVIEW_AREAS, createEngineeringReview } from '../src/domain';

describe('Phase 251 — engineering review contract', () => {
    it('retains cited actionable findings separately from explicitly unverified hypotheses', () => {
        const review = createEngineeringReview({ area: 'SECURITY', selected: 'selected workspace file',
            evidence: [{ id: 'source-1', type: 'source', label: 'src/storage.js', excerpt: 'writeFile(target, content);' },
                { id: 'test-1', type: 'test', label: 'workspace-boundary test', excerpt: 'assertContained(root, target)' }],
            findings: [{ id: 'finding-1', title: 'Path check follows symlink', severity: 'HIGH',
                whyItMatters: 'A write can escape the workspace.', recommendedFix: 'Resolve and verify the canonical target.',
                evidenceIds: ['source-1'], evidenceQuotes: [{ evidenceId: 'source-1', text: 'writeFile(target, content);' }],
                alternatives: [{ text: 'Reject all symbolic links.', evidenceIds: ['test-1'],
                    evidenceQuotes: [{ evidenceId: 'test-1', text: 'assertContained(root, target)' }] }] }],
            speculations: [{ hypothesis: 'A concurrent rename may race the check.', neededEvidence: 'Add a deterministic race test.' }],
        });
        expect(ENGINEERING_REVIEW_AREAS).toContain('TOKEN_EFFICIENCY');
        expect(review.findings[0]).toMatchObject({ severity: 'HIGH', evidenceIds: ['source-1'] });
        expect(review.speculations[0].neededEvidence).toContain('race test');
        expect(review.evidence.map(({ id }) => id)).toEqual(['source-1', 'test-1']);
        expect(Object.isFrozen(review.findings[0])).toBe(true);
    });

    it('requires exact evidence for findings and alternatives and enforces bounded severity', () => {
        expect(() => createEngineeringReview({ selected: 'file', evidence: [{ id: 's', type: 'source', label: 'file' }], findings: [
            { id: 'f', title: 'Potential problem', severity: 'CRITICAL', whyItMatters: 'Risk', recommendedFix: 'Fix', evidenceIds: ['missing'] },
        ] })).toThrow(/evidence/);
        expect(() => createEngineeringReview({ selected: 'file', evidence: [{ id: 's', type: 'source', label: 'file' }], findings: [
            { id: 'f', title: 'Problem', severity: 'UNKNOWN', whyItMatters: 'Risk', recommendedFix: 'Fix', evidenceIds: ['s'] },
        ] })).toThrow(/severity/);
    });
});
