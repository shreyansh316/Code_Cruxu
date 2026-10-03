import { describe, expect, it } from 'vitest';
import { createAIProviderPort, createAIProviderRequest, validateStructuredAIOutput } from '../src/application';

describe('Phase 073 — structured AI output validation', () => {
    it('validates required properties, nested types, array/string limits, and returns immutable output', () => {
        const schema = { type: 'object', additionalProperties: false, required: ['tasks'], properties: {
            tasks: { type: 'array', minItems: 1, maxItems: 2, items: { additionalProperties: false, required: ['title'], properties: {
                title: { type: 'string', minLength: 1, maxLength: 20 },
                index: { type: 'integer', minimum: 0, maximum: 4 },
            } } },
        } };
        const output = validateStructuredAIOutput({ tasks: [{ title: 'Build', index: 1 }] }, schema);
        expect(output).toEqual({ tasks: [{ title: 'Build', index: 1 }] });
        expect(Object.isFrozen(output.tasks[0])).toBe(true);
        for (const malformed of [{}, { tasks: [] }, { tasks: [{ title: '', index: 1 }] },
            { tasks: [{ title: 'valid', index: 5 }] }, { tasks: [{ title: 'valid', index: 1, injected: true }] }]) {
            expect(() => validateStructuredAIOutput(malformed, schema)).toThrow(/did not match/);
        }
    });

    it('rejects oversized, malformed, or unsupported schema output without repairing or retrying', async () => {
        const request = createAIProviderRequest({ requestId: 'request-073', model: 'model', systemPrompt: 'Return JSON.',
            input: {}, outputSchema: { type: 'object', required: ['answer'] } });
        let calls = 0;
        const port = createAIProviderPort({ generate: async (value) => {
            calls += 1;
            return { requestId: value.requestId, model: value.model, finishReason: 'STOP',
                usage: { inputTokens: 1, outputTokens: 1 }, output: { wrong: true } };
        } });
        await expect(port.generate(request)).rejects.toMatchObject({ code: 'invalid-ai-output' });
        expect(calls).toBe(1);
        expect(() => validateStructuredAIOutput({ answer: 'x'.repeat(300) }, { type: 'object' }, { maxBytes: 256 })).toThrow(/did not match/);
        expect(() => validateStructuredAIOutput({}, { type: 'unknown' })).toThrow(/did not match/);
    });

    it('preserves existing provider response contracts for valid outputs', async () => {
        const request = createAIProviderRequest({ requestId: 'request-valid', model: 'model', systemPrompt: 'Return JSON.',
            input: {}, outputSchema: { type: 'object', required: ['result'] } });
        const port = createAIProviderPort({ generate: async (value) => ({ requestId: value.requestId,
            model: value.model, finishReason: 'STOP', usage: { inputTokens: 1, outputTokens: 1 }, output: { result: 'ok' } }) });
        expect(await port.generate(request)).toMatchObject({ finishReason: 'STOP', output: { result: 'ok' } });
    });
});
