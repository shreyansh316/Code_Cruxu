/** Phase 254 — call the engineering review provider with strict output validation and usage tracking. */
import { describe, expect, it, vi } from 'vitest';
import { createEngineeringReviewUseCase } from '../src/application';

describe('Phase 254 — engineering review use case', () => {
    it('uses an explicit request budget and returns only validated findings and provider usage', async () => {
        const provider = { generate: vi.fn().mockResolvedValue({ finishReason: 'STOP', usage: { inputTokens: 60, outputTokens: 25 }, output: {
            findings: [{ id: 'f1', title: 'Missing path guard', severity: 'HIGH', confidence: 'UNASSESSED', whyItMatters: 'Traversal escapes root.',
                recommendedFix: 'Check the canonical path.', alternatives: [], evidenceIds: ['source-1'],
                evidenceQuotes: [{ evidenceId: 'source-1', text: 'resolve(root, path)' }] }],
            speculations: [], confidence: 'UNASSESSED',
        } }) };
        const useCase = createEngineeringReviewUseCase({ provider, idFactory: () => 'review-254' });
        const result = await useCase.run({ area: 'SECURITY', selected: 'Workspace file adapter', model: 'test-model',
            context: { code: 'resolve(root, path)' }, evidence: [{ id: 'source-1', type: 'source', label: 'src/files.js', excerpt: 'resolve(root, path)' }],
            budget: { maxOutputTokens: 700 } });
        expect(result.ok).toBe(true);
        expect(result.value.review.findings[0].id).toBe('f1');
        expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'review-254',
            outputSchema: expect.objectContaining({ additionalProperties: false }) }),
        expect.objectContaining({ purpose: 'engineering-review', budget: { maxOutputTokens: 700 } }));
        expect(result.value.usage).toEqual({ inputTokens: 60, outputTokens: 25 });
    });

    it('fails closed on uncited findings and normalizes provider failures', async () => {
        const invalid = createEngineeringReviewUseCase({ provider: { generate: async () => ({ finishReason: 'STOP', output: {
            findings: [{ id: 'f1', title: 'Issue', severity: 'HIGH', confidence: 'UNASSESSED', whyItMatters: 'Risk', recommendedFix: 'Fix', alternatives: [],
                evidenceIds: ['unknown'], evidenceQuotes: [{ evidenceId: 'unknown', text: 'bad' }] }],
            speculations: [], confidence: 'UNASSESSED',
        } }) }, idFactory: () => 'review-254' });
        expect((await invalid.run({ area: 'FULL', selected: 'file', evidence: [] })).ok).toBe(false);
        const failed = createEngineeringReviewUseCase({ provider: { generate: async () => ({ finishReason: 'ERROR', errorCode: 'provider-timeout' }) },
            idFactory: () => 'review-254' });
        await expect(failed.run({ selected: 'file' })).resolves.toMatchObject({ ok: false, error: { code: 'provider-timeout' } });
    });
});
