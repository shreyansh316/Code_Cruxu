/** Phase 346 — freeze and validate employee provider budget configuration. */
import { describe, expect, it, vi } from 'vitest';
import { createTaskAIRequestBudget, createTaskBudgetedAIProvider } from '../src/application';

const baseBudget = () => ({ maxInputTokens: 100, maxOutputTokens: 50, timeoutMs: 5_000,
    maxRetries: 2, retryDelayMs: 0, maxTotalTokens: 120 });

describe('Phase 346 — immutable bounded task provider configuration', () => {
    it('snapshots the configured budget so later caller mutation cannot widen execution limits', async () => {
        const config = baseBudget();
        const generate = vi.fn(async (_request, options) => options);
        const provider = createTaskBudgetedAIProvider({ provider: { generate }, baseBudget: config });
        config.maxOutputTokens = 8_192;
        config.maxTotalTokens = 1_000_000;

        await provider.generate({ task: { id: 'task-346', retryCount: 0, maxRetries: 2,
            tokenBudget: null, timeBudgetMs: null } });

        expect(generate).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ budget: {
            maxInputTokens: 100, maxOutputTokens: 50, timeoutMs: 5_000,
            maxRetries: 2, retryDelayMs: 0, maxTotalTokens: 120,
        } }));
    });

    it.each([
        ['missing input bound', { maxOutputTokens: 50, timeoutMs: 5_000, maxRetries: 1, retryDelayMs: 0 }],
        ['unbounded retry count', { ...baseBudget(), maxRetries: 100 }],
        ['invalid aggregate token bound', { ...baseBudget(), maxTotalTokens: 0 }],
        ['unknown budget field', { ...baseBudget(), allowUnlimited: true }],
    ])('rejects invalid base budget configuration (%s)', (_label, config) => {
        expect(() => createTaskBudgetedAIProvider({ provider: { generate: vi.fn() }, baseBudget: config }))
            .toThrow(/base budgets/);
    });

    it('applies the same strict limits when the public budget calculator is called directly', () => {
        expect(() => createTaskAIRequestBudget({ id: 'task-346', retryCount: 0, maxRetries: 2,
            tokenBudget: null, timeBudgetMs: null }, { ...baseBudget(), maxRetries: 4 }))
            .toThrow(/base budgets/);
    });
});
