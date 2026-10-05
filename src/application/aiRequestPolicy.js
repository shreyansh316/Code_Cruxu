import { createAIProviderRequest, validateAIProviderResponse } from './aiProvider';

export const DEFAULT_AI_REQUEST_BUDGET = Object.freeze({
    maxInputTokens: 16_000,
    maxOutputTokens: 2_048,
    timeoutMs: 30_000,
    maxRetries: 1,
    retryDelayMs: 150,
});

const TRANSIENT_ERRORS = new Set([
    'provider-network-error', 'provider-unavailable', 'provider-rate-limited', 'provider-timeout',
]);
const ABORTED_GENERATION = Symbol('aborted-generation');

/** Bound model work and persist the actual usage for every generation attempt. */
export function createBoundedAIProvider({ provider, inputTokenCounter, usageRecorder,
    defaultBudget = DEFAULT_AI_REQUEST_BUDGET } = {}) {
    if (typeof provider?.generate !== 'function') throw new TypeError('A provider port is required.');
    if (typeof inputTokenCounter !== 'function') throw new TypeError('An exact input token counter is required.');
    if (typeof usageRecorder?.recordUsage !== 'function') throw new TypeError('An AI usage recorder is required.');
    const safeDefaultBudget = validateBudget(defaultBudget);

    return Object.freeze({
        async generate(value, { signal, budget, purpose } = {}) {
            const request = createAIProviderRequest(value);
            if (signal !== undefined && !isAbortSignal(signal)) throw new TypeError('AI cancellation must use an AbortSignal.');
            const limits = validateBudget({ ...safeDefaultBudget, ...budget });
            const startedAt = Date.now();
            const controller = new AbortController();
            const onAbort = () => controller.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, limits.timeoutMs);
            const record = async (usage, success, attempt = 1) => {
                try {
                    await usageRecorder.recordUsage({ requestId: request.requestId, attempt, model: request.model,
                        usage, durationMs: Math.max(0, Date.now() - startedAt), success, purpose });
                }
                catch {
                    const error = new Error('AI usage could not be recorded.');
                    error.code = 'ai-usage-recording-failed';
                    throw error;
                }
            };

            try {
                if (signal?.aborted) return cancelled(request);
                let inputTokens;
                try {
                    inputTokens = await raceWithAbort(() => inputTokenCounter(request, { signal: controller.signal }), controller.signal);
                }
                catch (error) {
                    if (signal?.aborted) return cancelled(request);
                    const result = errorResponse(request, timedOut ? 'provider-timeout'
                        : error?.code === 'provider-credential-missing' ? 'provider-credential-missing'
                            : 'provider-token-count-failed');
                    await record(zeroUsage(), false);
                    return result;
                }
                if (inputTokens === ABORTED_GENERATION) {
                    if (signal?.aborted) return cancelled(request);
                    await record(zeroUsage(), false);
                    return errorResponse(request, timedOut ? 'provider-timeout' : 'provider-token-count-failed');
                }
                if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) {
                    await record(zeroUsage(), false);
                    return errorResponse(request, 'provider-token-count-invalid');
                }
                if (inputTokens > limits.maxInputTokens) {
                    await record({ inputTokens, outputTokens: 0 }, false);
                    return errorResponse(request, 'input-token-budget-exceeded');
                }
                if (signal?.aborted) return cancelled(request);
                if (timedOut) {
                    await record(zeroUsage(), false);
                    return errorResponse(request, 'provider-timeout');
                }

                let totalUsage = zeroUsage();
                let finalResponse;
                for (let attempt = 0; attempt <= limits.maxRetries; attempt += 1) {
                    let response;
                    try {
                        const providerResponse = await raceWithAbort(() => provider.generate(request, {
                            signal: controller.signal,
                            budget: { maxInputTokens: limits.maxInputTokens,
                                maxOutputTokens: limits.maxOutputTokens, timeoutMs: limits.timeoutMs },
                        }), controller.signal);
                        response = validateAIProviderResponse(request, providerResponse);
                        if (response.usage.inputTokens > limits.maxInputTokens
                            || response.usage.outputTokens > limits.maxOutputTokens) {
                            throw new Error('Provider exceeded the declared token budget.');
                        }
                    }
                    catch {
                        response = errorResponse(request, 'provider-request-failed');
                    }
                    if (timedOut) response = errorResponse(request, 'provider-timeout');
                    else if (signal?.aborted) response = cancelled(request);

                    totalUsage = {
                        inputTokens: totalUsage.inputTokens + response.usage.inputTokens,
                        outputTokens: totalUsage.outputTokens + response.usage.outputTokens,
                    };
                    await record(response.usage, response.finishReason === 'STOP', attempt + 1);
                    finalResponse = response;
                    if (signal?.aborted && response.finishReason === 'CANCELLED') {
                        return Object.freeze({ ...response, usage: Object.freeze(totalUsage) });
                    }
                    if (response.finishReason !== 'ERROR' || !TRANSIENT_ERRORS.has(response.errorCode)
                        || attempt >= limits.maxRetries) break;
                    if (limits.retryDelayMs > 0 && !await delay(limits.retryDelayMs, controller.signal)) {
                        finalResponse = timedOut ? errorResponse(request, 'provider-timeout') : cancelled(request);
                        break;
                    }
                }
                return Object.freeze({ ...finalResponse, usage: Object.freeze(totalUsage) });
            }
            finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            }
        },
    });
}

function validateBudget(value) {
    if (!value || typeof value !== 'object'
        || !Number.isSafeInteger(value.maxInputTokens) || value.maxInputTokens < 1 || value.maxInputTokens > 1_000_000
        || !Number.isSafeInteger(value.maxOutputTokens) || value.maxOutputTokens < 1 || value.maxOutputTokens > 8_192
        || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 120_000
        || !Number.isSafeInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 3
        || !Number.isSafeInteger(value.retryDelayMs) || value.retryDelayMs < 0 || value.retryDelayMs > 5_000) {
        throw new TypeError('AI request budgets must use bounded input/output tokens, timeout, retry count, and retry delay.');
    }
    return Object.freeze({ maxInputTokens: value.maxInputTokens, maxOutputTokens: value.maxOutputTokens,
        timeoutMs: value.timeoutMs, maxRetries: value.maxRetries, retryDelayMs: value.retryDelayMs });
}

function errorResponse(request, errorCode) {
    return Object.freeze({ requestId: request.requestId, model: request.model, finishReason: 'ERROR',
        usage: zeroUsage(), errorCode });
}

function cancelled(request) {
    return Object.freeze({ requestId: request.requestId, model: request.model,
        finishReason: 'CANCELLED', usage: zeroUsage() });
}

function zeroUsage() { return { inputTokens: 0, outputTokens: 0 }; }

function isAbortSignal(value) {
    return typeof AbortSignal !== 'undefined' && value instanceof AbortSignal;
}

function delay(milliseconds, signal) {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve(true);
        }, milliseconds);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            resolve(false);
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

async function raceWithAbort(operation, signal) {
    let onAbort;
    const aborted = new Promise((resolve) => {
        onAbort = () => resolve(ABORTED_GENERATION);
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
        return await Promise.race([operation(), aborted]);
    }
    finally {
        signal.removeEventListener('abort', onAbort);
    }
}
