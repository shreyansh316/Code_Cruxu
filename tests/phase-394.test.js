/** Phase 394 — aggregate usage efficiently behind an authorized task-summary port. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskUsageSummary } from '../src/application';
import { AgentRepository, AIUsageRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 394 — bounded task usage summaries', () => {
    let connection; let database; let agents; let tasks; let usage;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        agents = new AgentRepository(database); tasks = new TaskRepository(database); usage = new AIUsageRepository(database);
        agents.create({ id: 'employee-394', name: 'Employee', role: 'EMPLOYEE' });
        tasks.create({ id: 'task-394', taskCode: 'PH394-001', title: 'Optimize summaries', assigneeId: 'employee-394' });
        usage.record({ id: 'usage-394-1', requestId: 'request-394-a', attempt: 1, agentId: 'employee-394', taskId: 'task-394',
            provider: 'gemini', model: 'model-a', inputTokens: 20, outputTokens: 5, estimatedCost: 0.01, durationMs: 100, success: true });
        usage.record({ id: 'usage-394-2', requestId: 'request-394-a', attempt: 2, agentId: 'employee-394', taskId: 'task-394',
            provider: 'gemini', model: 'model-a', inputTokens: 30, outputTokens: 10, estimatedCost: 0.02, durationMs: 200, success: false });
        usage.record({ id: 'usage-394-3', requestId: 'request-394-b', attempt: 1, agentId: 'employee-394', taskId: 'task-394',
            provider: 'openai', model: 'model-b', inputTokens: 40, outputTokens: 15, estimatedCost: 0.03, durationMs: 300, success: true });
    });
    afterEach(() => connection.close());

    it('aggregates all request attempts, retries, tokens, cost, duration, and per-model totals', async () => {
        const summary = createTaskUsageSummary({ usageRepository: usage, taskRepository: tasks, agentRepository: agents,
            authorize: ({ action, actor, task }) => action === 'READ_TASK_USAGE' && actor.id === task.assigneeId });
        const result = await summary.run({ taskId: 'task-394', actorId: 'employee-394' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ attemptCount: 3, requestCount: 2, retryCount: 1,
            successCount: 2, failureCount: 1, inputTokens: 90, outputTokens: 30, totalTokens: 120,
            estimatedCost: 0.06, durationMs: 600, models: [
                { provider: 'gemini', model: 'model-a', attempts: 2, inputTokens: 50, outputTokens: 15, estimatedCost: 0.03 },
                { provider: 'openai', model: 'model-b', attempts: 1, inputTokens: 40, outputTokens: 15, estimatedCost: 0.03 },
            ] });
    });

    it('denies callers outside the configured task usage policy', async () => {
        const summary = createTaskUsageSummary({ usageRepository: usage, taskRepository: tasks, agentRepository: agents,
            authorize: () => false });
        const result = await summary.run({ taskId: 'task-394', actorId: 'employee-394' });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('task-usage-forbidden');
    });

    it('returns zero totals for tasks without recorded usage', () => {
        tasks.create({ id: 'task-394-empty', taskCode: 'PH394-002', title: 'No AI usage' });
        expect(usage.summarizeByTask('task-394-empty')).toMatchObject({ attemptCount: 0,
            requestCount: 0, retryCount: 0, totalTokens: 0, estimatedCost: 0, durationMs: 0, models: [] });
    });
});
