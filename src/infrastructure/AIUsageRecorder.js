import { randomUUID } from 'node:crypto';

/** Adapt bounded-provider accounting events to the existing AIUsageRepository. */
export function createAIUsageRecorder({ usageRepository, agentId = null, taskId = null,
    purpose, estimateCost = () => 0, idFactory = randomUUID } = {}) {
    if (typeof usageRepository?.record !== 'function') {
        throw new TypeError('AI usage recording requires the AIUsageRepository.');
    }
    if (typeof estimateCost !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('AI usage cost and identifier providers must be functions.');
    }
    return Object.freeze({
        recordUsage({ requestId, attempt = 1, model, usage, durationMs, success, purpose: requestPurpose } = {}) {
            const estimatedCost = estimateCost(model, usage);
            return usageRepository.record({
                id: idFactory(), requestId, attempt, agentId, taskId, model,
                inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens,
                estimatedCost, durationMs, purpose: requestPurpose ?? purpose,
                success,
            });
        },
    });
}
