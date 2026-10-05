/** Phase 230 — run the explain-code prompt through the injected AI provider. */
import { describe, expect, it, vi } from 'vitest';
import { createCodeExplanationUseCase } from '../src/application';

describe('Phase 230 — code explanation use case', () => {
    it('uses a request ID, strict output schema, purpose budget and validated citations', async () => {
        const provider = { generate: vi.fn().mockResolvedValue({ finishReason: 'STOP', usage: { inputTokens: 120, outputTokens: 30 }, output: {
            CHANGE: [], WHY: [{ text: 'This change follows the stated requirement.', source: 'RECONSTRUCTED_DECISION', evidenceIds: ['req-1'] }],
            REQUIREMENT: [], CONTEXT: [], ALTERNATIVES: [], REJECTED_OPTIONS: [], TRADE_OFFS: [], RISKS: [], TESTS: [],
            confidence: 'UNASSESSED',
        } }) };
        const run = createCodeExplanationUseCase({ provider, idFactory: () => 'request-230' });
        const result = await run.run({ action: 'WHY_THIS', selected: 'Change A', model: 'test-model',
            context: { requirement: 'Implement A' }, evidence: [{ id: 'req-1', type: 'requirement', label: 'Requirement A' }],
            budget: { maxOutputTokens: 500 } });

        expect(result.ok).toBe(true);
        expect(result.value.explanation.sections.WHY[0].evidenceIds).toEqual(['req-1']);
        expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-230',
            model: 'test-model', outputSchema: expect.objectContaining({ additionalProperties: false }) }),
        expect.objectContaining({ purpose: 'code-explanation', budget: { maxOutputTokens: 500 } }));
        expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    });

    it('does not return unsupported provider claims and normalizes provider errors', async () => {
        const run = createCodeExplanationUseCase({ provider: { generate: vi.fn().mockResolvedValue({
            finishReason: 'STOP', output: { WHY: [{ text: 'Uncited claim', source: 'UNKNOWN', evidenceIds: ['unknown'] }] },
        }) }, idFactory: () => 'request-230' });
        const invalid = await run.run({ action: 'WHY_THIS', selected: 'Change', evidence: [] });
        expect(invalid.ok).toBe(false);

        const providerFailure = createCodeExplanationUseCase({ provider: { generate: async () => ({ finishReason: 'ERROR', errorCode: 'provider-timeout' }) },
            idFactory: () => 'request-230' });
        await expect(providerFailure.run({ action: 'WHY_THIS', selected: 'Change' })).resolves.toMatchObject({
            ok: false, error: { code: 'provider-timeout', retryable: true },
        });
    });
});
