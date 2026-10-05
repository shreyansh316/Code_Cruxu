/** Phase 302 — bound and redact provider metadata in durable usage records. */
import { afterEach, describe, expect, it } from 'vitest';
import { AIUsageRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 302 — AI usage metadata sanitation', () => {
    let connection;
    afterEach(() => connection?.close());

    it('redacts credential values in purpose and model strings and caps their sizes', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const usage = new AIUsageRepository(database);
        const record = usage.record({ id: 'usage-302', requestId: 'request-302', attempt: 1,
            model: 'vendor/model', purpose: 'generation token=usage-secret',
            inputTokens: 10, outputTokens: 5, estimatedCost: 0.01, durationMs: 100, success: true });

        expect(record.purpose).toBe('generation token=[redacted]');
        expect(JSON.stringify(record)).not.toContain('usage-secret');
        expect(() => usage.record({ id: 'usage-long', model: 'm'.repeat(201), inputTokens: 0, outputTokens: 0,
            estimatedCost: 0, durationMs: 0, success: true })).toThrow(/AI usage requires/);
    });
});
