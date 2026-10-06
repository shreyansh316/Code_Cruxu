/** Phase 330 — clamp AI generation to task token, retry, and deadline budgets. */
import { describe, expect, it, vi } from 'vitest';
import { createAIProviderRequest, createBoundedAIProvider, createTaskAIRequestBudget,
    createProviderFallbackPolicy, createTaskBudgetedAIProvider, DEFAULT_AI_REQUEST_BUDGET } from '../src/application';

const request = createAIProviderRequest({ requestId: 'request-330', model: 'test-model',
    systemPrompt: 'Return a result.', input: { instruction: 'Do the work.' },
    outputSchema: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' } } } });
const task = Object.freeze({ id: 'task-330', retryCount: 2, maxRetries: 4, tokenBudget: 30, timeBudgetMs: 500 });
const usageRecorder = { recordUsage: vi.fn(async () => undefined) };
const makeResponse = (finishReason, usage, errorCode) => ({ requestId: request.requestId, model: request.model,
    finishReason, usage, ...(finishReason === 'STOP' ? { output: { summary: 'done' } } : { errorCode }) });

describe('Phase 330 — per-task AI budgets', () => {
    it('maps remaining retry allowance and clamps token/time ceilings', () => {
        expect(createTaskAIRequestBudget(task, { ...DEFAULT_AI_REQUEST_BUDGET, maxOutputTokens: 100, timeoutMs: 1000 }))
            .toEqual(expect.objectContaining({ maxRetries: 1, maxTotalTokens: 30, timeoutMs: 500, maxOutputTokens: 100 }));
    });

    it('rejects exhausted task token and time budgets before provider work', () => {
        expect(() => createTaskAIRequestBudget({ ...task, tokenBudget: 0 })).toThrow(/token budget is exhausted/);
        expect(() => createTaskAIRequestBudget({ ...task, timeBudgetMs: 0 })).toThrow(/time budget is exhausted/);
    });

    it('passes the task-specific aggregate token and remaining retry budget to the bounded provider', async () => {
        const baseBudget = { maxInputTokens: 100, maxOutputTokens: 80, timeoutMs: 1000, maxRetries: 3, retryDelayMs: 0 };
        const adapter = { generate: vi.fn()
            .mockResolvedValueOnce(makeResponse('ERROR', { inputTokens: 10, outputTokens: 0 }, 'provider-unavailable'))
            .mockResolvedValueOnce(makeResponse('STOP', { inputTokens: 10, outputTokens: 4 })) };
        const bounded = createBoundedAIProvider({ provider: adapter, inputTokenCounter: async () => 10,
            usageRecorder, defaultBudget: baseBudget });
        const taskProvider = createTaskBudgetedAIProvider({ provider: bounded, baseBudget });
        const result = await taskProvider.generate({ ...request, task }, { purpose: 'employee-task' });
        expect(result.finishReason).toBe('STOP');
        expect(adapter.generate).toHaveBeenCalledTimes(2);
        expect(adapter.generate.mock.calls[0][1].budget.maxOutputTokens).toBe(20);
        expect(adapter.generate.mock.calls[1][1].budget.maxOutputTokens).toBe(10);
        expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 4 });
        expect(usageRecorder.recordUsage).toHaveBeenCalledTimes(2);
    });

    it('does not exceed aggregate task tokens across retry attempts', async () => {
        const baseBudget = { maxInputTokens: 100, maxOutputTokens: 80, timeoutMs: 1000, maxRetries: 3, retryDelayMs: 0 };
        const adapter = { generate: vi.fn(async () => makeResponse('ERROR',
            { inputTokens: 10, outputTokens: 0 }, 'provider-unavailable')) };
        const bounded = createBoundedAIProvider({ provider: adapter, inputTokenCounter: async () => 10,
            usageRecorder: { recordUsage: vi.fn(async () => undefined) }, defaultBudget: baseBudget });
        const taskProvider = createTaskBudgetedAIProvider({ provider: bounded, baseBudget });
        const result = await taskProvider.generate({ ...request, task: { ...task, tokenBudget: 19 } });
        expect(result.finishReason).toBe('ERROR');
        expect(result.errorCode).toBe('task-token-budget-exceeded');
        expect(adapter.generate).toHaveBeenCalledOnce();
    });

    it('reserves estimated input tokens after provider errors with zero reported usage', async () => {
        const baseBudget = { maxInputTokens: 100, maxOutputTokens: 80, timeoutMs: 1000, maxRetries: 3, retryDelayMs: 0 };
        const adapter = { generate: vi.fn(async () => makeResponse('ERROR',
            { inputTokens: 0, outputTokens: 0 }, 'provider-network-error')) };
        const bounded = createBoundedAIProvider({ provider: adapter, inputTokenCounter: async () => 10,
            usageRecorder: { recordUsage: vi.fn(async () => undefined) }, defaultBudget: baseBudget });
        const taskProvider = createTaskBudgetedAIProvider({ provider: bounded, baseBudget });
        const result = await taskProvider.generate({ ...request, task: { ...task, tokenBudget: 19 } });
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'task-token-budget-exceeded' });
        expect(adapter.generate).toHaveBeenCalledOnce();
    });

    it('clamps fallback output to remaining aggregate tokens and rejects over-reporting', async () => {
        const primary = { generate: vi.fn(async () => makeResponse('ERROR',
            { inputTokens: 10, outputTokens: 0 }, 'provider-unavailable')) };
        const fallback = { generate: vi.fn(async () => makeResponse('STOP',
            { inputTokens: 10, outputTokens: 7 })) };
        const recordFallback = vi.fn(async () => undefined);
        const policy = createProviderFallbackPolicy({ primary, fallback, primaryId: 'primary', fallbackId: 'backup',
            fallbackRecorder: { recordFallback } });
        const result = await policy.generate(request, { budget: { maxOutputTokens: 80, maxTotalTokens: 25 } });
        expect(fallback.generate.mock.calls[0][1].budget.maxOutputTokens).toBe(5);
        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'task-token-budget-exceeded',
            usage: { inputTokens: 20, outputTokens: 7 } });
        expect(result.output).toBeUndefined();
        expect(recordFallback).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'ERROR' }));
    });
});
