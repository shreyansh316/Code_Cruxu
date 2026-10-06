import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError, isAgentAvailable } from '../domain';
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
        if (!task || !actor || !Object.values(AgentRole).includes(actor.role) || !isAgentAvailable(actor)) {
            throw new DomainInvariantError('task-usage-forbidden', 'Task usage is available only to an active persisted organization member.');
        }
        let allowed = false;
        try { allowed = d.authorize(Object.freeze({ action: 'READ_TASK_USAGE',
            actor: Object.freeze({ id: actor.id, role: actor.role }),
            task: Object.freeze({ id: task.id, status: task.status, projectId: task.projectId ?? null,
                assigneeId: task.assigneeId ?? null }) })) === true; }
        catch { allowed = false; }
        if (!allowed) throw new DomainInvariantError('task-usage-forbidden', 'The actor is not authorized to read this task usage summary.');
        return d.usageRepository.summarizeByTask(task.id);
    } });
}
