/** Phase 046 — Gemini REST provider adapter; all fetch behavior is isolated. */
import { describe, expect, it, vi } from 'vitest';
import { createAIProviderPort, createAIProviderRequest } from '../src/application';
import { createGeminiAIProviderAdapter } from '../src/infrastructure';

const makeRequest = (overrides = {}) => createAIProviderRequest({
    requestId: 'request-046', model: 'gemini-test-model', systemPrompt: 'Return JSON.',
    input: { task: 'summarize' }, outputSchema: { type: 'object', required: ['summary'] }, ...overrides,
});
const makeFetch = (payload, status = 200) => vi.fn(async (_url, _options) => ({
    ok: status >= 200 && status < 300, status, json: async () => payload,
}));
const usage = { promptTokenCount: 14, candidatesTokenCount: 6 };
const successPayload = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"summary":"done"}' }] } }], usageMetadata: usage };

function makeAdapter(fetchImpl, { credential = 'test credential', timeoutMs } = {}) {
    return createGeminiAIProviderAdapter({
        credentialStore: { getCredential: vi.fn(async () => credential) }, fetchImpl,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
}

describe('Phase 046 — Gemini provider adapter', () => {
    it('sends a structured request with SecretStorage credential in a header and maps usage', async () => {
        const fetchImpl = makeFetch(successPayload);
        const port = createAIProviderPort(makeAdapter(fetchImpl));
        const result = await port.generate(makeRequest());
        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
        expect(options.headers).toEqual({ 'content-type': 'application/json', 'x-goog-api-key': 'test credential' });
        expect(url).not.toContain('test credential');
        expect(JSON.parse(options.body)).toMatchObject({
            systemInstruction: { parts: [{ text: 'Return JSON.' }] },
            contents: [{ role: 'user', parts: [{ text: '{"task":"summarize"}' }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'object' } },
        });
        expect(result).toMatchObject({ finishReason: 'STOP', output: { summary: 'done' },
            usage: { inputTokens: 14, outputTokens: 6 } });
    });

    it('does not call the network when the Gemini credential is missing or unavailable', async () => {
        const fetchImpl = makeFetch(successPayload);
        const missing = createAIProviderPort(makeAdapter(fetchImpl, { credential: null }));
        expect((await missing.generate(makeRequest())).errorCode).toBe('provider-credential-missing');
        const failingStore = createGeminiAIProviderAdapter({
            credentialStore: { getCredential: async () => { throw new Error('private storage detail'); } }, fetchImpl,
        });
        expect((await createAIProviderPort(failingStore).generate(makeRequest())).errorCode)
            .toBe('provider-credential-unavailable');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('maps HTTP failures to explicit stable provider errors', async () => {
        for (const [status, errorCode] of [[401, 'provider-authentication-failed'],
            [429, 'provider-rate-limited'], [503, 'provider-unavailable']]) {
            const fetchImpl = vi.fn(async () => ({ ok: false, status, json: async () => ({ error: 'must not leak' }) }));
            const result = await createAIProviderPort(makeAdapter(fetchImpl)).generate(makeRequest());
            expect(result).toMatchObject({ finishReason: 'ERROR', errorCode });
            expect(JSON.stringify(result)).not.toContain('must not leak');
        }
    });

    it('maps Gemini finish reasons without returning generated output', async () => {
        for (const [geminiReason, expected] of [['MAX_TOKENS', 'LENGTH'], ['SAFETY', 'CONTENT_FILTER']]) {
            const fetchImpl = makeFetch({ candidates: [{ finishReason: geminiReason }], usageMetadata: usage });
            const result = await createAIProviderPort(makeAdapter(fetchImpl)).generate(makeRequest());
            expect(result).toMatchObject({ finishReason: expected, usage: { inputTokens: 14, outputTokens: 6 } });
            expect(result).not.toHaveProperty('output');
        }
    });

    it('maps malformed provider payloads and network failures without raw details', async () => {
        const malformed = createAIProviderPort(makeAdapter(makeFetch({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] })));
        expect((await malformed.generate(makeRequest())).errorCode).toBe('provider-invalid-response');
        const failedFetch = vi.fn(async () => { throw new Error('private transport details'); });
        const failed = await createAIProviderPort(makeAdapter(failedFetch)).generate(makeRequest());
        expect(failed.errorCode).toBe('provider-network-error');
        expect(JSON.stringify(failed)).not.toContain('private transport details');
    });

    it('bounds requests by timeout and propagates caller cancellation to fetch', async () => {
        const timeoutFetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));
        const timed = await createAIProviderPort(makeAdapter(timeoutFetch, { timeoutMs: 5 })).generate(makeRequest());
        expect(timed).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-timeout' });
        const controller = new AbortController();
        const cancelFetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));
        const pending = createAIProviderPort(makeAdapter(cancelFetch)).generate(makeRequest(), { signal: controller.signal });
        await vi.waitFor(() => expect(cancelFetch).toHaveBeenCalledOnce());
        controller.abort();
        expect((await pending).finishReason).toBe('CANCELLED');
        expect(cancelFetch.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it('rejects unsafe adapter configuration', () => {
        expect(() => createGeminiAIProviderAdapter({ credentialStore: {} })).toThrow(/credential store/);
        expect(() => createGeminiAIProviderAdapter({ credentialStore: { getCredential() {} }, timeoutMs: 120_001 }))
            .toThrow(/timeout/);
        expect(() => createGeminiAIProviderAdapter({ credentialStore: { getCredential() {} }, fetchImpl: 3 }))
            .toThrow(/fetch implementation/);
    });
});
