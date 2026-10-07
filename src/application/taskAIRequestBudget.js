import { snapshotAIRequestBudget } from './aiRequestPolicy';
import { DomainInvariantError } from '../domain/errors';
import { DEFAULT_AI_REQUEST_BUDGET } from './aiRequestPolicy';

/** Pass an authorized agent request to an AI provider under its task budgets. */
export function createTaskBudgetedAIProvider({ provider, baseBudget = DEFAULT_AI_REQUEST_BUDGET } = {}) {
    if (typeof provider?.generate !== 'function') throw new TypeError('A bounded AI provider is required.');
    const safeBaseBudget = snapshotAIRequestBudget(baseBudget);
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

/** Clamp provider work to the remaining task token, retry, and time budgets. */
export function createTaskAIRequestBudget(task, baseBudget = DEFAULT_AI_REQUEST_BUDGET) {
    baseBudget = snapshotAIRequestBudget(baseBudget);
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
