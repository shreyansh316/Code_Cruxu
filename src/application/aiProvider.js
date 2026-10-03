import { createEntityId, DomainInvariantError } from '../domain';

const MAX_MODEL_LENGTH = 200;
const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
const MAX_INPUT_BYTES = 64_000;
const MAX_SCHEMA_BYTES = 32_000;
const MAX_OUTPUT_BYTES = 128_000;
const FINISH_REASONS = new Set(['STOP', 'LENGTH', 'CONTENT_FILTER', 'ERROR', 'CANCELLED']);
const ERROR_CODE = /^[a-z][a-z0-9.-]{0,63}$/;

/**
 * @typedef {{requestId:string, model:string, systemPrompt:string, input:object, outputSchema:object}}
 *   AIProviderRequest
 * @typedef {{inputTokens:number, outputTokens:number}}
 *   AIProviderUsage
 * @typedef {{requestId:string, model:string, finishReason:string, usage:AIProviderUsage,
 *   output?:object, errorCode?:string}}
 *   AIProviderResponse
 * @typedef {{generate(request:AIProviderRequest, options?:{signal?:AbortSignal}):Promise<AIProviderResponse>}}
 *   AIProviderPort
 */

/** Create a bounded, vendor-neutral reasoning request. */
export function createAIProviderRequest({ requestId, model, systemPrompt, input, outputSchema } = {}) {
    try { requestId = createEntityId(requestId); }
    catch { invalid('AI requests require a valid correlation identifier.'); }
    if (typeof model !== 'string' || model.trim() === '' || model.trim().length > MAX_MODEL_LENGTH
        || typeof systemPrompt !== 'string' || systemPrompt.trim() === ''
        || systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
        invalid('AI requests require a bounded model name and system prompt.');
    }
    const safeInput = clonePlainObject(input, 'AI input', MAX_INPUT_BYTES);
    const safeSchema = clonePlainObject(outputSchema, 'AI output schema', MAX_SCHEMA_BYTES);
    return Object.freeze({ requestId, model: model.trim(), systemPrompt: systemPrompt.trim(),
        input: deepFreeze(safeInput), outputSchema: deepFreeze(safeSchema) });
}

/** Validate, correlate, and freeze a provider response without accepting provider-specific fields. */
export function validateAIProviderResponse(request, value) {
    if (!request || typeof request !== 'object' || !isPlainObject(value)
        || value.requestId !== request.requestId || value.model !== request.model
        || !FINISH_REASONS.has(value.finishReason)) {
        invalid('AI provider responses must correlate with the request and use a supported finish reason.');
    }
    const allowedKeys = new Set(['requestId', 'model', 'finishReason', 'usage', 'output', 'errorCode']);
    if (Object.keys(value).some((key) => !allowedKeys.has(key)) || !isPlainObject(value.usage)
        || Object.keys(value.usage).some((key) => !['inputTokens', 'outputTokens'].includes(key))
        || !Number.isSafeInteger(value.usage.inputTokens) || value.usage.inputTokens < 0
        || !Number.isSafeInteger(value.usage.outputTokens) || value.usage.outputTokens < 0) {
        invalid('AI provider usage must contain finite nonnegative token counts only.');
    }
    const response = { requestId: request.requestId, model: request.model,
        finishReason: value.finishReason,
        usage: Object.freeze({ inputTokens: value.usage.inputTokens, outputTokens: value.usage.outputTokens }) };
    if (value.finishReason === 'STOP') {
        response.output = deepFreeze(clonePlainObject(value.output, 'AI output', MAX_OUTPUT_BYTES));
        if (value.errorCode !== undefined) invalid('Successful AI responses cannot include an error code.');
    }
    else if (value.finishReason === 'ERROR') {
        if (typeof value.errorCode !== 'string' || !ERROR_CODE.test(value.errorCode) || value.output !== undefined) {
            invalid('AI error responses require a stable error code and no output.');
        }
        response.errorCode = value.errorCode;
    }
    else if (value.output !== undefined || value.errorCode !== undefined) {
        invalid('Non-success AI responses cannot contain output or error detail.');
    }
    return Object.freeze(response);
}

/** Adapt a provider-neutral adapter to the application AI provider port. */
export function createAIProviderPort(adapter) {
    if (typeof adapter?.generate !== 'function') {
        throw new TypeError('AI provider adapters must implement generate(request, { signal }).');
    }
    return Object.freeze({
        async generate(value, { signal } = {}) {
            const request = createAIProviderRequest(value);
            if (signal !== undefined && !isAbortSignal(signal)) {
                invalid('AI provider cancellation must use an AbortSignal.');
            }
            if (signal?.aborted) return cancelledResponse(request);
            const response = await adapter.generate(request, signal ? { signal } : {});
            if (signal?.aborted) return cancelledResponse(request);
            return validateAIProviderResponse(request, response);
        },
    });
}

function cancelledResponse(request) {
    return Object.freeze({ requestId: request.requestId, model: request.model,
        finishReason: 'CANCELLED', usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }) });
}

function clonePlainObject(value, label, maxBytes) {
    if (!isPlainObject(value)) invalid(`${label} must be a plain object.`);
    let serialized;
    try { serialized = JSON.stringify(value); }
    catch { invalid(`${label} must contain JSON-compatible data.`); }
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > maxBytes) {
        invalid(`${label} cannot exceed ${maxBytes} bytes.`);
    }
    try { return JSON.parse(serialized); }
    catch { invalid(`${label} must contain valid JSON-compatible data.`); }
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isAbortSignal(value) {
    return typeof AbortSignal !== 'undefined' && value instanceof AbortSignal;
}

function invalid(message) {
    throw new DomainInvariantError('invalid-ai-provider-contract', message);
}
