/** Phase 285 — enforce total timeout while token counting is in progress. */
import { describe, expect, it, vi } from 'vitest';
import { createAIProviderRequest, createBoundedAIProvider } from '../src/application';

const request = createAIProviderRequest({ requestId: 'phase-285-request', model: 'safe-model',
    systemPrompt: 'Return JSON.', input: { task: 'summarize' }, outputSchema: { type: 'object' } });

describe('Phase 285 — token counter timeout', () => {
    it('returns a bounded timeout when the counter ignores its abort signal', async () => {
        const provider = { generate: vi.fn() };
        const usageRecorder = { recordUsage: vi.fn(async () => undefined) };
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: () => new Promise(() => undefined), usageRecorder });
        const result = await bounded.generate(request, { budget: { maxRetries: 0, timeoutMs: 10 } });
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-timeout' });
        expect(provider.generate).not.toHaveBeenCalled();
        expect(usageRecorder.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false,
            usage: { inputTokens: 0, outputTokens: 0 } }));
    });
});
