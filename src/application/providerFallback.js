import { createAIProviderRequest, validateAIProviderResponse } from './aiProvider';

const FALLBACK_ERRORS = new Set(['provider-network-error', 'provider-unavailable', 'provider-rate-limited', 'provider-timeout']);

/** Create an explicit one-level fallback route with bounded remaining output budget and an audit sink. */
export function createProviderFallbackPolicy({ primary, fallback, primaryId, fallbackId, fallbackRecorder,
    fallbackErrors = FALLBACK_ERRORS } = {}) {
    if (typeof primary?.generate !== 'function') throw new TypeError('A primary AI provider is required.');
    if (fallback !== undefined && (typeof fallback?.generate !== 'function'
        || typeof fallbackRecorder?.recordFallback !== 'function'
        || !validProviderId(primaryId) || !validProviderId(fallbackId) || primaryId === fallbackId)) {
        throw new TypeError('A configured fallback requires distinct provider ids and an audit recorder.');
    }
    if (!(fallbackErrors instanceof Set) || [...fallbackErrors].some((code) => typeof code !== 'string' || !FALLBACK_ERRORS.has(code))) {
        throw new TypeError('Fallback error policy contains unsupported codes.');
    }
    const safeFallbackErrors = new Set(fallbackErrors);
    return Object.freeze({
        async generate(value, { signal, budget } = {}) {
            const request = createAIProviderRequest(value);
            const first = await invoke(primary, request, { signal, budget });
            if (!fallback || first.finishReason !== 'ERROR' || !safeFallbackErrors.has(first.errorCode) || signal?.aborted
                || !Number.isSafeInteger(budget?.maxOutputTokens) || budget.maxOutputTokens <= first.usage.outputTokens) {
                return first;
            }
            const remainingOutputTokens = budget.maxOutputTokens - first.usage.outputTokens;
            const second = await invoke(fallback, request, { signal, budget: { ...budget, maxOutputTokens: remainingOutputTokens } });
            const usage = addUsage(first.usage, second.usage);
            try {
                await fallbackRecorder.recordFallback({ requestId: request.requestId, primaryProviderId: primaryId,
                    fallbackProviderId: fallbackId, reason: first.errorCode, outcome: second.finishReason });
            } catch {
                return errorResponse(request, 'provider-fallback-audit-failed', usage);
            }
            return Object.freeze({ ...second, usage });
        },
    });
}

async function invoke(provider, request, options) {
    try {
        return validateAIProviderResponse(request, await provider.generate(request, options));
    } catch (error) {
        return errorResponse(request, error?.code === 'invalid-ai-output' || error?.code === 'invalid-ai-provider-contract'
            ? 'provider-response-invalid' : 'provider-request-failed', { inputTokens: 0, outputTokens: 0 });
    }
}

function addUsage(left, right) {
    const inputTokens = left.inputTokens + right.inputTokens;
    const outputTokens = left.outputTokens + right.outputTokens;
    if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) {
        throw new Error('Provider fallback usage exceeded safe accounting limits.');
    }
    return Object.freeze({ inputTokens, outputTokens });
}

function errorResponse(request, errorCode, usage) {
    return Object.freeze({ requestId: request.requestId, model: request.model, finishReason: 'ERROR', errorCode,
        usage: Object.freeze(usage) });
}

function validProviderId(value) { return typeof value === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(value); }
