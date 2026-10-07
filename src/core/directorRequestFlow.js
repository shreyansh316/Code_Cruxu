import { createGeminiAIProviderAdapter, createAIUsageRecorder, createSecretStorageAdapter } from '../infrastructure';
import { createBoundedAIProvider, DEFAULT_AI_REQUEST_BUDGET } from '../application';
import { AIUsageRepository } from '../storage';

/** Director request flow guards and provider wiring, extracted from
 * HeadroomContext (phase 457) so the rules are pure and unit-testable. The
 * context applies VS Code messaging; these functions decide. */

const BLOCK_MESSAGES = Object.freeze({
    PAUSED: 'director.request.paused',
    CANCELLED: 'director.request.cancelled',
    ALREADY_RUNNING: 'director.request.alreadyRunning',
});

/** Why a director request cannot begin: a message key, or null when it may.
 * `alreadyRunning` defaults to false so callers that never track a running
 * request keep their original behavior. */
export function directorRequestBlock(status, { alreadyRunning = false } = {}) {
    if (status === 'PAUSED') return BLOCK_MESSAGES.PAUSED;
    if (status === 'CANCELLED') return BLOCK_MESSAGES.CANCELLED;
    if (alreadyRunning) return BLOCK_MESSAGES.ALREADY_RUNNING;
    return null;
}

/** Whether the configured provider cannot serve director requests. */
export function directorProviderMissing(configuration) {
    return configuration?.aiProvider !== 'gemini';
}

/** Build the bounded Gemini provider wired to the persisted usage recorder. */
export function createDirectorProvider({ secrets, database, providerName, purpose }) {
    const gemini = createGeminiAIProviderAdapter({ credentialStore: createSecretStorageAdapter(secrets) });
    return createBoundedAIProvider({ provider: gemini,
        inputTokenCounter: (request, options) => gemini.countInputTokens(request, options),
        usageRecorder: createAIUsageRecorder({ usageRepository: new AIUsageRepository(database),
            provider: providerName ?? null, purpose }),
        defaultBudget: DEFAULT_AI_REQUEST_BUDGET });
}
