const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

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
        async generate(request, { signal } = {}) {
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
                const result = await fetchImpl(`${GEMINI_ENDPOINT}${encodeURIComponent(request.model)}:generateContent`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': credential.trim() },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: request.systemPrompt }] },
                        contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.input) }] }],
                        generationConfig: { responseMimeType: 'application/json', responseSchema: request.outputSchema },
                    }),
                    signal: controller.signal,
                });
                if (!result?.ok) return response(request, 'ERROR', { errorCode: mapHttpError(result?.status) });
                let payload;
                try { payload = await result.json(); }
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
