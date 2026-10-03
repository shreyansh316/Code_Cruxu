/** Phase 044 — provider-neutral AI request and response contracts. */
import { describe, expect, it } from 'vitest';
import { createAIProviderPort, createAIProviderRequest, validateAIProviderResponse } from '../src/application';

const makeRequest = (overrides = {}) => createAIProviderRequest({
    requestId: 'request-044', model: 'reasoning-model-v1',
    systemPrompt: 'Return a structured decision.',
    input: { objective: 'Implement a queue', constraints: ['deterministic'] },
    outputSchema: { type: 'object', required: ['decision'] },
    ...overrides,
});

const makeResponse = (request, overrides = {}) => ({
    requestId: request.requestId,
    model: request.model,
    finishReason: 'STOP',
    usage: { inputTokens: 20, outputTokens: 9 },
    output: { decision: 'proceed' },
    ...overrides,
});

describe('Phase 044 — AI provider port', () => {
    it('creates bounded immutable provider-neutral requests', () => {
        const request = makeRequest();
        expect(request).toMatchObject({ requestId: 'request-044', model: 'reasoning-model-v1',
            input: { objective: 'Implement a queue' } });
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.input)).toBe(true);
        expect(request).not.toHaveProperty('apiKey');
        expect(request).not.toHaveProperty('provider');
        expect(() => makeRequest({ model: '  ' })).toThrow(/model name/);
        expect(() => makeRequest({ input: 'unstructured' })).toThrow(/plain object/);
        expect(() => makeRequest({ input: { data: 'x'.repeat(65_000) } })).toThrow(/64000 bytes/);
    });

    it('accepts a correlated structured response with bounded usage metadata', () => {
        const request = makeRequest();
        const response = validateAIProviderResponse(request, makeResponse(request));
        expect(response).toMatchObject({ requestId: request.requestId, model: request.model,
            finishReason: 'STOP', usage: { inputTokens: 20, outputTokens: 9 }, output: { decision: 'proceed' } });
        expect(Object.isFrozen(response.output)).toBe(true);
    });

    it('rejects mismatched, malformed, or provider-specific response data', () => {
        const request = makeRequest();
        expect(() => validateAIProviderResponse(request, makeResponse(request, { requestId: 'other-request' })))
            .toThrow(/correlate/);
        expect(() => validateAIProviderResponse(request, makeResponse(request, { usage: { inputTokens: -1, outputTokens: 0 } })))
            .toThrow(/nonnegative token counts/);
        expect(() => validateAIProviderResponse(request, makeResponse(request, { vendorRawResponse: { secret: 'x' } })))
            .toThrow(/usage must|provider-specific|usage/);
    });

    it('preserves explicit provider errors without exposing raw messages', () => {
        const request = makeRequest();
        const response = validateAIProviderResponse(request, makeResponse(request, {
            finishReason: 'ERROR', output: undefined, errorCode: 'provider.unavailable',
        }));
        expect(response).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider.unavailable' });
        expect(() => validateAIProviderResponse(request, makeResponse(request, {
            finishReason: 'ERROR', errorCode: 'bad code with details', output: undefined,
        }))).toThrow(/stable error code/);
    });

    it('passes cancellation to a deterministic adapter and short-circuits pre-cancelled calls', async () => {
        const request = { requestId: 'request-044', model: 'reasoning-model-v1',
            systemPrompt: 'Think.', input: {}, outputSchema: { type: 'object' } };
        let calls = 0;
        let seenSignal;
        const port = createAIProviderPort({ generate: async (_request, { signal }) => {
            calls += 1;
            seenSignal = signal;
            return makeResponse(_request);
        } });
        const controller = new AbortController();
        const response = await port.generate(request, { signal: controller.signal });
        expect(response.finishReason).toBe('STOP');
        expect(seenSignal).toBe(controller.signal);
        const alreadyAborted = new AbortController();
        alreadyAborted.abort();
        const cancelled = await port.generate(request, { signal: alreadyAborted.signal });
        expect(cancelled.finishReason).toBe('CANCELLED');
        expect(calls).toBe(1);
    });

    it('rejects adapters that do not implement the provider port', () => {
        expect(() => createAIProviderPort({ complete: () => undefined })).toThrow(/implement generate/);
    });
});
