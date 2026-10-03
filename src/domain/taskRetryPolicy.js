import { DomainInvariantError } from './errors';

export const MAX_TASK_RETRIES = 5;

/** Decide whether another retry is permitted within the configured task bound. */
export function evaluateTaskRetry(retryCount, maxRetries) {
    if (!Number.isInteger(retryCount) || retryCount < 0
        || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_TASK_RETRIES
        || retryCount > maxRetries) {
        throw new DomainInvariantError('invalid-task-retry-policy',
            `Retry count must be between 0 and maxRetries; maxRetries must be between 0 and ${MAX_TASK_RETRIES}.`);
    }
    const canRetry = retryCount < maxRetries;
    return {
        outcome: canRetry ? 'RETRY_ALLOWED' : 'RETRIES_EXHAUSTED',
        canRetry,
        retryCount,
        maxRetries,
        retriesRemaining: maxRetries - retryCount,
        nextRetryCount: canRetry ? retryCount + 1 : null,
    };
}
