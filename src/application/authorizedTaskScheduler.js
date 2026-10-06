import { createTaskScheduler } from './taskScheduler';
import { createAuthorizedTaskExecutor } from './authorizedTaskExecutor';

/** Compose queue scheduling with persisted lifecycle and authorization boundaries. */
export function createAuthorizedTaskScheduler({ queueWorkflow, queueRepository, agentRuntime,
    taskLifecycle, executionControl, parallelLimit } = {}) {
    if (typeof taskLifecycle?.onStart !== 'function') {
        throw new TypeError('An authorized task scheduler requires a persisted task lifecycle start hook.');
    }
    return createTaskScheduler({ queueWorkflow, queueRepository,
        executor: createAuthorizedTaskExecutor({ agentRuntime }),
        executionControl, parallelLimit, onStart: taskLifecycle.onStart });
}
