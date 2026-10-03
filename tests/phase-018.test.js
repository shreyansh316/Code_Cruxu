/** Phase 018 — bounded task retry policy. */
import { describe, expect, it } from 'vitest';
import { DomainInvariantError, evaluateTaskRetry, MAX_TASK_RETRIES } from '../src/domain';

describe('Phase 018 — bounded task retries', () => {
    it('allows retries only while the current count is below the configured maximum', () => {
        expect(evaluateTaskRetry(0, 2)).toEqual({
            outcome: 'RETRY_ALLOWED', canRetry: true, retryCount: 0, maxRetries: 2,
            retriesRemaining: 2, nextRetryCount: 1,
        });
        expect(evaluateTaskRetry(1, 2).nextRetryCount).toBe(2);
    });

    it('handles zero retries and exhaustion without exceeding the bound', () => {
        expect(evaluateTaskRetry(0, 0)).toEqual({
            outcome: 'RETRIES_EXHAUSTED', canRetry: false, retryCount: 0, maxRetries: 0,
            retriesRemaining: 0, nextRetryCount: null,
        });
        expect(evaluateTaskRetry(2, 2).canRetry).toBe(false);
        expect(evaluateTaskRetry(MAX_TASK_RETRIES, MAX_TASK_RETRIES).nextRetryCount).toBeNull();
    });

    it('rejects negative, non-integer, inconsistent, and over-limit bounds', () => {
        for (const values of [[-1, 2], [0, -1], [1.5, 2], [3, 2], [0, 6]]) {
            expect(() => evaluateTaskRetry(...values)).toThrowError(DomainInvariantError);
        }
    });
});
