/** Phase 283 — bound provider HTTP response bodies before JSON parsing. */
import { describe, expect, it, vi } from 'vitest';
import { createGeminiAIProviderAdapter } from '../src/infrastructure';

const request = Object.freeze({ requestId: 'phase-283-request', model: 'gemini-test',
    systemPrompt: 'Return JSON.', input: { task: 'inspect' }, outputSchema: { type: 'object' } });

describe('Phase 283 — provider response byte bounds', () => {
    it('cancels an oversized streaming response before JSON parsing', async () => {
        const cancel = vi.fn(async () => undefined);
        const read = vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array(1024 * 1024 + 1) });
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200,
            body: { getReader: () => ({ read, cancel }) }, json: vi.fn(async () => { throw new Error('fallback must not run'); }) }));
        const adapter = createGeminiAIProviderAdapter({ credentialStore: { getCredential: async () => 'test-key' }, fetchImpl });
        const result = await adapter.generate(request);
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-invalid-response' });
        expect(cancel).toHaveBeenCalledOnce();
        expect(read).toHaveBeenCalledOnce();
    });

    it('rejects an oversized count-token JSON response', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200,
            json: async () => ({ totalTokens: 12, extra: 'x'.repeat(300 * 1024) }) }));
        const adapter = createGeminiAIProviderAdapter({ credentialStore: { getCredential: async () => 'test-key' }, fetchImpl });
        await expect(adapter.countInputTokens(request)).rejects.toMatchObject({ code: 'provider-invalid-response' });
    });
});
