import { assertTaskReadAuthorized } from './authorizedTaskAccess';
import { createEntityId, DomainInvariantError } from '../domain';
import { createUseCase } from './useCase';

/** Read compact task token, retry, duration, cost, and model totals under an application authorization policy. */
export function createTaskUsageSummary({ usageRepository, taskRepository, agentRepository, authorize } = {}) {
    if (typeof usageRepository?.summarizeByTask !== 'function'
        || typeof taskRepository?.getById !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof authorize !== 'function') {
        throw new TypeError('Task usage summaries require usage, task, identity, and authorization ports.');
    }
    const dependencies = Object.freeze({ usageRepository, taskRepository, agentRepository, authorize });
    return createUseCase({ name: 'task-usage-summary', dependencies, execute: ({ input, dependencies: d }) => {
        let taskId; let actorId;
        try {
            taskId = createEntityId(input?.taskId, 'Usage task id');
            actorId = createEntityId(input?.actorId, 'Usage actor id');
        } catch (error) {
            throw new DomainInvariantError('invalid-task-usage-request', error.message);
        }
        const task = d.taskRepository.getById(taskId);
        const actor = d.agentRepository.getById(actorId);
        assertTaskReadAuthorized({ task, actor, authorize: d.authorize, action: 'READ_TASK_USAGE',
            memberErrorCode: 'task-usage-forbidden',
            memberMessage: 'Task usage is available only to an active persisted organization member.',
            deniedMessage: 'The actor is not authorized to read this task usage summary.' });
        return d.usageRepository.summarizeByTask(task.id);
    } });
}
