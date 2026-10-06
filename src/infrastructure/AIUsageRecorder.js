import { randomUUID } from 'node:crypto';

/** Adapt bounded-provider accounting events to the existing AIUsageRepository. */
export function createAIUsageRecorder({ usageRepository, agentId = null, taskId = null,
    provider = null, purpose, estimateCost, idFactory = randomUUID } = {}) {
    if (typeof usageRepository?.record !== 'function') {
        throw new TypeError('AI usage recording requires the AIUsageRepository.');
    }
    if ((estimateCost !== undefined && typeof estimateCost !== 'function') || typeof idFactory !== 'function') {
        throw new TypeError('AI usage cost and identifier providers must be functions.');
    }
    return Object.freeze({
        recordUsage({ requestId, attempt = 1, model, usage, durationMs, success, purpose: requestPurpose } = {}) {
            const costKnown = typeof estimateCost === 'function';
            const estimatedCost = costKnown ? estimateCost(model, usage) : 0;
            return usageRepository.record({
                id: idFactory(), requestId, attempt, agentId, taskId, provider, model,
                inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens,
                estimatedCost, costKnown, durationMs, purpose: requestPurpose ?? purpose,
                success,
            });
        },
    });
}
