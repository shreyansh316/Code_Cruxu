const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;

/** Create a Gemini REST adapter for the provider-neutral AI port. */
export function createGeminiAIProviderAdapter({ credentialStore, fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof credentialStore?.getCredential !== 'function') {
        throw new TypeError('Gemini requires a provider credential store.');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('Gemini requires a fetch implementation.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
        throw new TypeError(`Gemini timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds.`);
    }
    return Object.freeze({
        async countInputTokens(request, { signal } = {}) {
            if (signal?.aborted) throw codedError('provider-cancelled');
            const credential = await getCredential(credentialStore);
            if (signal?.aborted) throw codedError('provider-cancelled');
            const controller = new AbortController();
            let timedOut = false;
            const onAbort = () => controller.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            try {
                const result = await fetchImpl(`${GEMINI_ENDPOINT}${encodeURIComponent(request.model)}:countTokens`, {
                    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': credential },
                    body: JSON.stringify({ generateContentRequest: generationRequest(request) }),
                    signal: controller.signal,
                });
                if (!result?.ok) throw codedError(mapHttpError(result?.status));
                let payload;
                try { payload = await readBoundedJson(result, 256 * 1024); }
                catch { throw codedError('provider-invalid-response'); }
                if (!Number.isSafeInteger(payload?.totalTokens) || payload.totalTokens < 0) {
                    throw codedError('provider-invalid-response');
                }
                return payload.totalTokens;
            }
            catch (error) {
                if (signal?.aborted) throw codedError('provider-cancelled');
                if (timedOut) throw codedError('provider-timeout');
                if (error?.code) throw error;
                throw codedError('provider-network-error');
            }
            finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
        },
        async generate(request, { signal, budget } = {}) {
            if (signal?.aborted) return response(request, 'CANCELLED');
            let credential;
            try { credential = await credentialStore.getCredential('gemini'); }
            catch { return response(request, 'ERROR', { errorCode: 'provider-credential-unavailable' }); }
            if (typeof credential !== 'string' || credential.trim() === '') {
                return response(request, 'ERROR', { errorCode: 'provider-credential-missing' });
            }
            if (signal?.aborted) return response(request, 'CANCELLED');

            const controller = new AbortController();
            let timedOut = false;
            const onAbort = () => controller.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
            try {
                if (budget?.maxOutputTokens !== undefined
                    && (!Number.isSafeInteger(budget.maxOutputTokens) || budget.maxOutputTokens < 1 || budget.maxOutputTokens > 8192)) {
                    throw new TypeError('Gemini output token budget must be between 1 and 8192.');
                }
                const result = await fetchImpl(`${GEMINI_ENDPOINT}${encodeURIComponent(request.model)}:generateContent`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': credential.trim() },
                    body: JSON.stringify(generationRequest(request, budget?.maxOutputTokens)),
                    signal: controller.signal,
                });
                if (!result?.ok) return response(request, 'ERROR', { errorCode: mapHttpError(result?.status) });
                let payload;
                try { payload = await readBoundedJson(result, MAX_PROVIDER_RESPONSE_BYTES); }
                catch { return response(request, 'ERROR', { errorCode: 'provider-invalid-response' }); }
                return mapGeminiResponse(request, payload);
            }
            catch {
                if (signal?.aborted) return response(request, 'CANCELLED');
                return response(request, 'ERROR', {
                    errorCode: timedOut ? 'provider-timeout' : 'provider-network-error',
                });
            }
            finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            }
        },
    });
}

async function readBoundedJson(responseValue, maxBytes) {
    try {
        const reader = responseValue?.body?.getReader?.();
        if (!reader) {
            const payload = await responseValue.json();
            const serialized = JSON.stringify(payload);
            if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > maxBytes) {
                throw new Error('Provider response size exceeded.');
            }
            return payload;
        }
        const chunks = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!(value instanceof Uint8Array)) throw new Error('Provider response stream was invalid.');
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                throw new Error('Provider response size exceeded.');
            }
            chunks.push(Buffer.from(value));
        }
        return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
    }
    catch {
        throw codedError('provider-invalid-response');
    }
}

function generationRequest(request, maxOutputTokens) {
    const generationConfig = { responseMimeType: 'application/json', responseSchema: request.outputSchema };
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
    return {
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.input) }] }],
        generationConfig,
    };
}

async function getCredential(credentialStore) {
    let credential;
    try { credential = await credentialStore.getCredential('gemini'); }
    catch { throw codedError('provider-credential-unavailable'); }
    if (typeof credential !== 'string' || credential.trim() === '') {
        throw codedError('provider-credential-missing');
    }
    return credential.trim();
}

function codedError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function mapGeminiResponse(request, payload) {
    const candidate = payload?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const usage = payload?.usageMetadata;
    const tokenUsage = {
        inputTokens: tokenCount(usage?.promptTokenCount),
        outputTokens: tokenCount(usage?.candidatesTokenCount),
    };
    if (finishReason === 'SAFETY' || finishReason === 'BLOCKLIST' || finishReason === 'PROHIBITED_CONTENT') {
        return response(request, 'CONTENT_FILTER', { usage: tokenUsage });
    }
    if (finishReason === 'MAX_TOKENS') return response(request, 'LENGTH', { usage: tokenUsage });
    if (finishReason !== 'STOP') return response(request, 'ERROR', { errorCode: 'provider-finish-unknown', usage: tokenUsage });

    const text = candidate?.content?.parts?.filter((part) => typeof part?.text === 'string')
        .map((part) => part.text).join('');
    if (typeof text !== 'string' || text === '') {
        return response(request, 'ERROR', { errorCode: 'provider-invalid-response', usage: tokenUsage });
    }
    let output;
    try { output = JSON.parse(text); }
    catch { return response(request, 'ERROR', { errorCode: 'provider-invalid-response', usage: tokenUsage }); }
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
        return response(request, 'ERROR', { errorCode: 'provider-invalid-response', usage: tokenUsage });
    }
    return response(request, 'STOP', { output, usage: tokenUsage });
}

function mapHttpError(status) {
    if (status === 401 || status === 403) return 'provider-authentication-failed';
    if (status === 429) return 'provider-rate-limited';
    if (status >= 500 && status <= 599) return 'provider-unavailable';
    return 'provider-request-failed';
}

function tokenCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function response(request, finishReason, { output, errorCode, usage = { inputTokens: 0, outputTokens: 0 } } = {}) {
    const result = { requestId: request.requestId, model: request.model, finishReason, usage };
    if (output !== undefined) result.output = output;
    if (errorCode !== undefined) result.errorCode = errorCode;
    return result;
}
