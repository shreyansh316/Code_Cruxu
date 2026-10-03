/** Phase 029 — attributable AI usage accounting. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRepository, AIUsageRepository, ObjectiveRepository, ProjectRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 029 — AI usage repository', () => {
    let connection;
    let database;
    let usage;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        usage = new AIUsageRepository(database);
    });
    afterEach(() => connection.close());

    it('records model, token counts, duration, cost, purpose, success, and attribution', () => {
        const agent = new AgentRepository(database).create({ id: 'usage-agent', name: 'Agent', role: 'CEO' });
        const objective = new ObjectiveRepository(database).create({ id: 'usage-objective', title: 'Usage', description: 'Usage context' });
        const project = new ProjectRepository(database).create({ id: 'usage-project', name: 'Usage project', objectiveId: objective.id });
        const task = new TaskRepository(database).create({ id: 'usage-task', taskCode: 'USAGE-001', title: 'Usage task', projectId: project.id });
        const record = usage.record({
            id: 'usage-1', agentId: agent.id, taskId: task.id, model: 'provider/model',
            inputTokens: 12, outputTokens: 5, estimatedCost: 0.001, durationMs: 250,
            purpose: 'planning', success: true,
        });
        expect(record).toMatchObject({ agentId: agent.id, taskId: task.id, model: 'provider/model',
            inputTokens: 12, outputTokens: 5, estimatedCost: 0.001, durationMs: 250,
            purpose: 'planning', success: true });
        expect(record.createdAt).toEqual(expect.any(String));
        expect(usage.listByTask(task.id)).toEqual([record]);
        expect(usage.listByAgent(agent.id)).toEqual([record]);
    });

    it('allows unattributed system usage while enforcing numeric and boolean boundaries', () => {
        expect(usage.record({ id: 'usage-system', model: 'mock', inputTokens: 0, outputTokens: 0,
            estimatedCost: 0, durationMs: 0 }).success).toBe(true);
        let caseNumber = 0;
        for (const overrides of [
            { inputTokens: -1 }, { outputTokens: -1 }, { durationMs: -1 },
            { inputTokens: 1.5 }, { estimatedCost: -0.01 }, { estimatedCost: Infinity },
            { success: 'true' }, { model: '' },
        ]) {
            expect(() => usage.record({ id: `invalid-${caseNumber++}`, model: 'test', inputTokens: 0,
                outputTokens: 0, estimatedCost: 0, durationMs: 0, ...overrides })).toThrow();
        }
    });

    it('enforces SQLite numeric checks and foreign-key attribution against direct writes', () => {
        expect(() => database.prepare(`INSERT INTO ai_usages
          (id, model, input_tokens, output_tokens, estimated_cost, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?)`)
            .run('raw-invalid', 'model', -1, 0, 0, 0)).toThrow();
        expect(() => usage.record({ id: 'orphan-usage', agentId: 'missing-agent', model: 'model',
            inputTokens: 0, outputTokens: 0, estimatedCost: 0, durationMs: 0 })).toThrow();
        expect(() => usage.listByTask('task', { limit: 1001 })).toThrow(/limit/);
    });
});
