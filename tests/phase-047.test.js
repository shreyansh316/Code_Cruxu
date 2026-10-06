/** Phase 047 — bounded AI budgets, retry limits, and persistent usage. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIProviderPort, createAIProviderRequest, createBoundedAIProvider } from '../src/application';
import { createAIUsageRecorder, createGeminiAIProviderAdapter } from '../src/infrastructure';
import { AgentRepository, AIUsageRepository, ObjectiveRepository, ProjectRepository,
    SCHEMA_MIGRATIONS, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

const request = createAIProviderRequest({ requestId: 'request-047', model: 'gemini-test-model',
    systemPrompt: 'Return structured JSON.', input: { instruction: 'Summarize.' },
    outputSchema: { type: 'object', required: ['summary'] } });
const budget = Object.freeze({ maxInputTokens: 100, maxOutputTokens: 40, timeoutMs: 500,
    maxRetries: 1, retryDelayMs: 0 });
const response = (finishReason = 'STOP', overrides = {}) => ({ requestId: request.requestId,
    model: request.model, finishReason, usage: { inputTokens: 8, outputTokens: 3 },
    ...(finishReason === 'STOP' ? { output: { summary: 'done' } } : { errorCode: 'provider-unavailable' }), ...overrides });
const recorderStub = () => ({ recordUsage: vi.fn(async () => undefined) });

let connections = [];
afterEach(() => {
    for (const connection of connections.splice(0)) connection.close();
});

describe('Phase 047 — bounded AI request policy', () => {
    it('rejects exact input token counts above budget without generating', async () => {
        const provider = { generate: vi.fn(async () => response()) };
        const usageRecorder = recorderStub();
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 101, usageRecorder });
        const result = await bounded.generate(request, { budget, purpose: 'planning' });
        expect(result.errorCode).toBe('input-token-budget-exceeded');
        expect(provider.generate).not.toHaveBeenCalled();
        expect(usageRecorder.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 101, outputTokens: 0 }, success: false, purpose: 'planning',
        }));
    });

    it('passes the bounded output-token policy and records successful usage', async () => {
        const provider = { generate: vi.fn(async () => response()) };
        const usageRecorder = recorderStub();
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 12, usageRecorder });
        const result = await bounded.generate(request, { budget });
        expect(provider.generate).toHaveBeenCalledWith(request, expect.objectContaining({
            budget: { maxInputTokens: 100, maxOutputTokens: 40, timeoutMs: 500 },
        }));
        expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 3 });
        expect(usageRecorder.recordUsage).toHaveBeenCalledOnce();
        expect(usageRecorder.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ usage: response().usage, success: true }));
    });

    it('retries only transient failures within the requested retry count and aggregates actual usage', async () => {
        const provider = { generate: vi.fn()
            .mockResolvedValueOnce(response('ERROR', { errorCode: 'provider-unavailable', usage: { inputTokens: 8, outputTokens: 0 } }))
            .mockResolvedValueOnce(response('STOP', { usage: { inputTokens: 8, outputTokens: 3 } })) };
        const usageRecorder = recorderStub();
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 12, usageRecorder });
        const result = await bounded.generate(request, { budget });
        expect(provider.generate).toHaveBeenCalledTimes(2);
        expect(usageRecorder.recordUsage).toHaveBeenCalledTimes(2);
        expect(usageRecorder.recordUsage.mock.calls.map(([entry]) => [entry.requestId, entry.attempt]))
            .toEqual([['request-047', 1], ['request-047', 2]]);
        expect(result.finishReason).toBe('STOP');
        expect(result.usage).toEqual({ inputTokens: 16, outputTokens: 3 });

        const permanent = { generate: vi.fn(async () => response('ERROR', { errorCode: 'provider-authentication-failed' })) };
        const noAuthRetry = createBoundedAIProvider({ provider: permanent, inputTokenCounter: async () => 12,
            usageRecorder: recorderStub() });
        await noAuthRetry.generate(request, { budget });
        expect(permanent.generate).toHaveBeenCalledOnce();
    });

    it('maps token-counter failures to a stable code and surfaces recorder failures', async () => {
        const provider = { generate: vi.fn(async () => response()) };
        const failedCount = createBoundedAIProvider({ provider,
            inputTokenCounter: async () => { throw new Error('raw provider detail'); }, usageRecorder: recorderStub() });
        expect((await failedCount.generate(request, { budget })).errorCode).toBe('provider-token-count-failed');
        expect(provider.generate).not.toHaveBeenCalled();

        const failedRecord = createBoundedAIProvider({ provider, inputTokenCounter: async () => 12,
            usageRecorder: { recordUsage: async () => { throw new Error('database detail'); } } });
        await expect(failedRecord.generate(request, { budget })).rejects.toMatchObject({ code: 'ai-usage-recording-failed' });
    });

    it('stops at the overall timeout and propagates caller cancellation', async () => {
        const hangingProvider = { generate: vi.fn((_request, { signal }) => new Promise((resolve) => {
            if (signal.aborted) resolve(response('CANCELLED', { usage: { inputTokens: 0, outputTokens: 0 } }));
            else signal.addEventListener('abort', () => resolve(response('CANCELLED', { usage: { inputTokens: 0, outputTokens: 0 } })), { once: true });
        })) };
        const usageRecorder = recorderStub();
        const bounded = createBoundedAIProvider({ provider: hangingProvider,
            inputTokenCounter: async () => 12, usageRecorder });
        const timed = await bounded.generate(request, { budget: { ...budget, timeoutMs: 5 } });
        expect(timed).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-timeout' });

        const controller = new AbortController();
        const pending = bounded.generate(request, { budget, signal: controller.signal });
        await vi.waitFor(() => expect(hangingProvider.generate).toHaveBeenCalledTimes(2));
        controller.abort();
        expect((await pending).finishReason).toBe('CANCELLED');
    });

    it('counts input with Gemini and sends maxOutputTokens to its production adapter', async () => {
        const fetchImpl = vi.fn(async (url) => url.endsWith(':countTokens')
            ? { ok: true, status: 200, json: async () => ({ totalTokens: 12 }) }
            : { ok: true, status: 200, json: async () => ({
                candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"summary":"done"}' }] } }],
                usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
            }) });
        const adapter = createGeminiAIProviderAdapter({ fetchImpl,
            credentialStore: { getCredential: async () => 'test credential' } });
        const bounded = createBoundedAIProvider({ provider: createAIProviderPort(adapter),
            inputTokenCounter: adapter.countInputTokens, usageRecorder: recorderStub() });
        expect((await bounded.generate(request, { budget })).finishReason).toBe('STOP');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const [, generationOptions] = fetchImpl.mock.calls[1];
        expect(JSON.parse(generationOptions.body).generationConfig.maxOutputTokens).toBe(40);
    });

    it('persists provider attempt usage through the existing SQLite repository', async () => {
        const connection = new SqliteConnection();
        connections.push(connection);
        const database = connection.open(':memory:');
        applyMigrations(database);
        new AgentRepository(database).create({ id: 'usage-agent-047', name: 'Agent', role: 'CEO' });
        const objective = new ObjectiveRepository(database).create({ id: 'usage-objective-047',
            title: 'Usage objective', description: 'Usage attribution' });
        const project = new ProjectRepository(database).create({ id: 'usage-project-047', name: 'Usage project', objectiveId: objective.id });
        new TaskRepository(database).create({ id: 'usage-task-047', taskCode: 'USAGE-047', title: 'Usage task', projectId: project.id });
        const usageRepository = new AIUsageRepository(database);
        let usageId = 0;
        const usageRecorder = createAIUsageRecorder({ usageRepository, agentId: 'usage-agent-047', taskId: 'usage-task-047',
            provider: 'gemini', purpose: 'bounded-test', estimateCost: () => 0, idFactory: () => `usage-policy-047-${++usageId}` });
        const provider = { generate: vi.fn(async () => response()) };
        const bounded = createBoundedAIProvider({ provider, inputTokenCounter: async () => 12, usageRecorder });
        await bounded.generate(request, { budget });
        expect(usageRepository.getById('usage-policy-047-1')).toMatchObject({
            requestId: request.requestId, attempt: 1, agentId: 'usage-agent-047', taskId: 'usage-task-047',
            provider: 'gemini', model: request.model, inputTokens: 8, outputTokens: 3, purpose: 'bounded-test', success: true,
        });
        expect(usageRepository.listByTask('usage-task-047')).toHaveLength(1);
    });

    it('adds request correlation without losing existing usage rows during migration', () => {
        const connection = new SqliteConnection();
        connections.push(connection);
        const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, 5));
        database.prepare(`INSERT INTO ai_usages
            (id, model, input_tokens, output_tokens, estimated_cost, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .run('usage-before-correlation', 'legacy-model', 4, 2, 0, 1);
        applyMigrations(database);
        expect(new AIUsageRepository(database).getById('usage-before-correlation')).toMatchObject({
            requestId: null, attempt: 1, model: 'legacy-model', provider: null, inputTokens: 4, outputTokens: 2,
        });
    });

    it('rejects policy bounds outside the fixed safety envelope', async () => {
        const dependencies = { provider: { generate: async () => response() }, inputTokenCounter: async () => 1,
            usageRecorder: recorderStub() };
        expect(() => createBoundedAIProvider({ ...dependencies, defaultBudget: { ...budget, maxRetries: 4 } }))
            .toThrow(/bounded input\/output tokens/);
        await expect(createBoundedAIProvider(dependencies).generate(request, { budget: { ...budget, maxOutputTokens: 9_000 } }))
            .rejects.toThrow(/bounded input\/output tokens/);
    });
});
