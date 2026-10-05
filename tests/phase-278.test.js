/** Phase 278 — validate provider responses at the bounded request boundary. */
import { describe, expect, it, vi } from 'vitest';
import { createAIProviderRequest, createBoundedAIProvider } from '../src/application';

const request = createAIProviderRequest({ requestId: 'phase-278-request', model: 'safe-model',
    systemPrompt: 'Return JSON.', input: { task: 'summarize' },
    outputSchema: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' } }, additionalProperties: false } });
const usageRecorder = { recordUsage: vi.fn(async () => undefined) };

describe('Phase 278 — provider response boundary validation', () => {
    it('maps mismatched correlation IDs to a stable provider failure and records no claimed usage', async () => {
        const provider = { generate: vi.fn(async () => ({ requestId: 'forged-request', model: request.model,
            finishReason: 'STOP', usage: { inputTokens: 500, outputTokens: 500 }, output: { summary: 'forged' } })) };
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 5, usageRecorder });
        const result = await bounded.generate(request, { budget: { maxRetries: 0 } });
        expect(result).toMatchObject({ requestId: request.requestId, finishReason: 'ERROR', errorCode: 'provider-request-failed',
            usage: { inputTokens: 0, outputTokens: 0 } });
        expect(usageRecorder.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false,
            usage: { inputTokens: 0, outputTokens: 0 } }));
    });

    it('rejects schema-invalid output and unrecognized provider fields before exposing a result', async () => {
        for (const response of [
            { requestId: request.requestId, model: request.model, finishReason: 'STOP', usage: { inputTokens: 2, outputTokens: 1 }, output: { summary: 7 } },
            { requestId: request.requestId, model: request.model, finishReason: 'ERROR', usage: { inputTokens: 2, outputTokens: 0 }, errorCode: 'provider-unavailable', apiKey: 'should-not-leak' },
        ]) {
            const provider = { generate: vi.fn(async () => response) };
            const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 5,
                usageRecorder: { recordUsage: vi.fn(async () => undefined) } });
            const result = await bounded.generate(request, { budget: { maxRetries: 0 } });
            expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-request-failed' });
            expect(JSON.stringify(result)).not.toContain('should-not-leak');
        }
    });

    it('enforces the timeout even when a provider ignores AbortSignal', async () => {
        const provider = { generate: vi.fn(() => new Promise(() => undefined)) };
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 5,
            usageRecorder: { recordUsage: vi.fn(async () => undefined) } });
        const result = await bounded.generate(request, { budget: { maxRetries: 0, timeoutMs: 10 } });
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-timeout' });
        expect(provider.generate).toHaveBeenCalledOnce();
    });

    it('rejects a provider response that reports usage above the requested output budget', async () => {
        const provider = { generate: vi.fn(async () => ({ requestId: request.requestId, model: request.model,
            finishReason: 'STOP', usage: { inputTokens: 2, outputTokens: 4 }, output: { summary: 'too many tokens' } })) };
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 5,
            usageRecorder: { recordUsage: vi.fn(async () => undefined) } });
        const result = await bounded.generate(request, { budget: { maxRetries: 0, maxOutputTokens: 3 } });
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-request-failed' });
        expect(result.output).toBeUndefined();
    });

});
