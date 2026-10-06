import { DomainInvariantError } from '../domain/errors';
import { DEFAULT_AI_REQUEST_BUDGET } from './aiRequestPolicy';

/** Pass an authorized agent request to an AI provider under its task budgets. */
export function createTaskBudgetedAIProvider({ provider, baseBudget = DEFAULT_AI_REQUEST_BUDGET } = {}) {
    if (typeof provider?.generate !== 'function') throw new TypeError('A bounded AI provider is required.');
    const safeBaseBudget = snapshotBaseBudget(baseBudget);
    return Object.freeze({
        generate(request, { signal, purpose } = {}) {
            if (!request || typeof request !== 'object' || !request.task || !request.task.id) {
                throw new DomainInvariantError('invalid-task-budget', 'Task-budgeted generation requires an authorized task request.');
            }
            const budget = createTaskAIRequestBudget(request.task, safeBaseBudget);
            return provider.generate(request, { signal, purpose, budget });
        },
    });
}

function snapshotBaseBudget(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some((key) => !['maxInputTokens', 'maxOutputTokens', 'timeoutMs',
            'maxRetries', 'retryDelayMs', 'maxTotalTokens'].includes(key))
        || !Number.isSafeInteger(value.maxInputTokens) || value.maxInputTokens < 1 || value.maxInputTokens > 1_000_000
        || !Number.isSafeInteger(value.maxOutputTokens) || value.maxOutputTokens < 1 || value.maxOutputTokens > 8_192
        || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 120_000
        || !Number.isSafeInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 3
        || !Number.isSafeInteger(value.retryDelayMs) || value.retryDelayMs < 0 || value.retryDelayMs > 5_000
        || (value.maxTotalTokens !== undefined && (!Number.isSafeInteger(value.maxTotalTokens)
            || value.maxTotalTokens < 1 || value.maxTotalTokens > 1_000_000))) {
        throw new TypeError('Task AI base budgets must use bounded token, timeout, retry, and retry-delay limits.');
    }
    return Object.freeze({ maxInputTokens: value.maxInputTokens, maxOutputTokens: value.maxOutputTokens,
        timeoutMs: value.timeoutMs, maxRetries: value.maxRetries, retryDelayMs: value.retryDelayMs,
        ...(value.maxTotalTokens === undefined ? {} : { maxTotalTokens: value.maxTotalTokens }) });
}

/** Clamp provider work to the remaining task token, retry, and time budgets. */
export function createTaskAIRequestBudget(task, baseBudget = DEFAULT_AI_REQUEST_BUDGET) {
    baseBudget = snapshotBaseBudget(baseBudget);
    if (!task || typeof task !== 'object' || !Number.isSafeInteger(task.retryCount) || task.retryCount < 0
        || !Number.isSafeInteger(task.maxRetries) || task.maxRetries < task.retryCount
        || (task.tokenBudget !== null && task.tokenBudget !== undefined
            && (!Number.isSafeInteger(task.tokenBudget) || task.tokenBudget < 0))
        || (task.timeBudgetMs !== null && task.timeBudgetMs !== undefined
            && (!Number.isSafeInteger(task.timeBudgetMs) || task.timeBudgetMs < 0))) {
        throw new DomainInvariantError('invalid-task-budget', 'Task budgets must use valid bounded limits.');
    }
    if (task.timeBudgetMs === 0) {
        throw new DomainInvariantError('task-time-budget-exceeded', 'The task time budget is exhausted.');
    }
    if (task.tokenBudget === 0) {
        throw new DomainInvariantError('task-token-budget-exceeded', 'The task token budget is exhausted.');
    }
    const taskTokenBudget = task.tokenBudget ?? baseBudget.maxTotalTokens;
    const maxTotalTokens = taskTokenBudget === undefined ? undefined
        : Math.min(taskTokenBudget, baseBudget.maxTotalTokens ?? taskTokenBudget);
    return Object.freeze({ ...baseBudget,
        timeoutMs: task.timeBudgetMs == null ? baseBudget.timeoutMs : Math.min(task.timeBudgetMs, baseBudget.timeoutMs),
        maxRetries: Math.min(baseBudget.maxRetries, task.maxRetries - task.retryCount),
        ...(maxTotalTokens === undefined ? {} : { maxTotalTokens }),
    });
}
