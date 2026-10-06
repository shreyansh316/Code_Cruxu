import { createAuthorizedAgentRuntime } from './authorizedAgentRuntime';
import { createStructuredEmployeeTaskAdapter } from './structuredEmployeeTaskAdapter';
import { createTaskBudgetedAIProvider } from './taskAIRequestBudget';

/** Compose bounded model generation, the structured action loop, and persisted runtime authorization. */
export function createStructuredEmployeeRuntime({ agentRepository, taskRepository, hierarchyProvider,
    taskToolsProvider, memoryContextProvider, provider, baseBudget, model, idFactory, clock, limits } = {}) {
    if (typeof provider?.generate !== 'function') {
        throw new TypeError('Employee runtime composition requires a bounded provider.');
    }
    const budgetedProvider = createTaskBudgetedAIProvider({ provider, ...(baseBudget ? { baseBudget } : {}) });
    const adapter = createStructuredEmployeeTaskAdapter({ provider: budgetedProvider,
        model, idFactory, ...(limits ? { limits } : {}) });
    return createAuthorizedAgentRuntime({ agentRepository, taskRepository, hierarchyProvider,
        taskToolsProvider, memoryContextProvider, adapter, idFactory, clock });
}
