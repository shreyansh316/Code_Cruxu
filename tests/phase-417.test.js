/** Phase 417 — persist provider and cost-estimate confidence without fabricating historical values. */
import { afterEach, describe, expect, it } from 'vitest';
import { createAIUsageRecorder } from '../src/infrastructure';
import { AIUsageRepository, SCHEMA_MIGRATIONS, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 417 — AI provider and cost provenance', () => {
    let connection;
    afterEach(() => connection?.close());

    it('marks costs unknown when the usage recorder has no pricing estimator', () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        const usageRepository = new AIUsageRepository(database);
        const recorder = createAIUsageRecorder({ usageRepository, provider: 'gemini', purpose: 'test', idFactory: () => 'usage-417' });
        recorder.recordUsage({ requestId: 'request-417', model: 'gemini-model', usage: { inputTokens: 10, outputTokens: 4 },
            durationMs: 200, success: true });
        expect(usageRepository.getById('usage-417')).toMatchObject({ provider: 'gemini',
            estimatedCost: 0, costKnown: false });
        expect(usageRepository.summarizeByTask('unattributed-task')).toMatchObject({
            attemptCount: 0, costKnownAttempts: 0, costComplete: true, estimatedCost: 0,
        });
    });

    it('preserves old provider data as unknown and infers cost confidence only from positive legacy estimates', () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, 29));
        database.prepare(`INSERT INTO ai_usages (id, model, input_tokens, output_tokens, estimated_cost, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)`).run('legacy-priced-417', 'old-model', 2, 1, 0.05, 40);
        database.prepare(`INSERT INTO ai_usages (id, model, input_tokens, output_tokens, estimated_cost, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)`).run('legacy-unpriced-417', 'old-model', 2, 1, 0, 40);
        expect(applyMigrations(database)).toBe(30);
        const usage = new AIUsageRepository(database);
        expect(usage.getById('legacy-priced-417')).toMatchObject({ provider: null, estimatedCost: 0.05, costKnown: true });
        expect(usage.getById('legacy-unpriced-417')).toMatchObject({ provider: null, estimatedCost: 0, costKnown: false });
    });

    it('reports partial pricing coverage without counting unknown costs as known zero estimates', () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        const usage = new AIUsageRepository(database);
        new TaskRepository(database).create({ id: 'task-417', taskCode: 'PH417-001', title: 'Price usage' });
        usage.record({ id: 'priced-417', requestId: 'priced-request-417', taskId: 'task-417', provider: 'gemini', model: 'model',
            inputTokens: 10, outputTokens: 2, estimatedCost: 0.01, costKnown: true, durationMs: 10 });
        usage.record({ id: 'unknown-417', requestId: 'unknown-request-417', taskId: 'task-417', provider: 'gemini', model: 'model',
            inputTokens: 10, outputTokens: 2, estimatedCost: 0, costKnown: false, durationMs: 10 });
        expect(usage.summarizeByTask('task-417')).toMatchObject({ attemptCount: 2, costKnownAttempts: 1,
            costComplete: false, estimatedCost: 0.01,
            models: [{ provider: 'gemini', model: 'model', costKnownAttempts: 1, costComplete: false }] });
    });
});
