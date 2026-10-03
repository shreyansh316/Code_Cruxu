import { describe, expect, it, vi } from 'vitest';
import { createAIProviderRequest, createProviderFallbackPolicy } from '../src/application';

const request = createAIProviderRequest({ requestId: 'request-074', model: 'model', systemPrompt: 'Think.', input: {},
    outputSchema: { type: 'object', required: ['result'] } });
const result = (requestValue, finishReason, overrides = {}) => ({ requestId: requestValue.requestId, model: requestValue.model,
    finishReason, usage: { inputTokens: 5, outputTokens: 0 },
    ...(finishReason === 'STOP' ? { output: { result: 'ok' } } : { errorCode: 'provider-unavailable' }), ...overrides });

describe('Phase 074 — provider failure and fallback policy', () => {
    it('keeps primary success on the primary route', async () => {
        const primary = { generate: vi.fn(async (value) => result(value, 'STOP')) };
        const fallback = { generate: vi.fn() };
        const policy = createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup',
            fallbackRecorder: { recordFallback: vi.fn() } });
        expect((await policy.generate(request, { budget: { maxOutputTokens: 40 } })).finishReason).toBe('STOP');
        expect(fallback.generate).not.toHaveBeenCalled();
    });

    it('uses only a configured fallback for eligible failures, spends remaining output budget, and audits the route', async () => {
        const primary = { generate: vi.fn(async (value) => result(value, 'ERROR', { errorCode: 'provider-rate-limited' })) };
        const fallback = { generate: vi.fn(async (value) => result(value, 'STOP', { usage: { inputTokens: 5, outputTokens: 8 } })) };
        const recordFallback = vi.fn();
        const policy = createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup',
            fallbackRecorder: { recordFallback } });
        const response = await policy.generate(request, { budget: { maxOutputTokens: 40 }, signal: new AbortController().signal });
        expect(response).toMatchObject({ finishReason: 'STOP', usage: { inputTokens: 10, outputTokens: 8 } });
        expect(fallback.generate.mock.calls[0][1].budget.maxOutputTokens).toBe(40);
        expect(recordFallback).toHaveBeenCalledWith({ requestId: request.requestId, primaryProviderId: 'primary',
            fallbackProviderId: 'backup', reason: 'provider-rate-limited', outcome: 'STOP' });
    });

    it('does not fallback for permanent errors, cancellation, absent budget, or unauditable configuration', async () => {
        const primary = { generate: vi.fn(async (value) => result(value, 'ERROR', { errorCode: 'provider-authentication-failed' })) };
        const fallback = { generate: vi.fn() };
        const policy = createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup',
            fallbackRecorder: { recordFallback: vi.fn() } });
        expect((await policy.generate(request, { budget: { maxOutputTokens: 40 } })).errorCode).toBe('provider-authentication-failed');
        const cancelled = new AbortController(); cancelled.abort();
        await policy.generate(request, { budget: { maxOutputTokens: 40 }, signal: cancelled.signal });
        await policy.generate(request);
        expect(fallback.generate).not.toHaveBeenCalled();
        expect(() => createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup' }))
            .toThrow(/audit recorder/);
    });

    it('returns explicit audit failure and preserves consumed usage instead of silent success', async () => {
        const primary = { generate: async (value) => result(value, 'ERROR') };
        const fallback = { generate: async (value) => result(value, 'STOP', { usage: { inputTokens: 5, outputTokens: 8 } }) };
        const policy = createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup',
            fallbackRecorder: { recordFallback: async () => { throw new Error('private detail'); } } });
        expect(await policy.generate(request, { budget: { maxOutputTokens: 40 } })).toMatchObject({ finishReason: 'ERROR',
            errorCode: 'provider-fallback-audit-failed', usage: { inputTokens: 10, outputTokens: 8 } });
    });
});
