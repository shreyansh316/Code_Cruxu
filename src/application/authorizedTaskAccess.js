import { AgentRole, TaskStatus } from '../constants';
import { ApplicationError } from './useCase';
import { DomainInvariantError } from '../domain/errors';
import { isAgentAvailable } from '../domain/agentLifecycle';

/** Load the task an agent is claiming, enforcing the shared lifecycle rule once:
 * the task must exist, belong to the requesting agent, and be in progress. Error
 * codes are stable across call sites; the two messages are caller-specific. */
export function requireAssignedInProgressTask({ taskRepository, taskId, agentId, assigneeMessage, statusMessage } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskId !== 'string' || !taskId
        || typeof agentId !== 'string' || !agentId
        || typeof assigneeMessage !== 'string' || !assigneeMessage
        || typeof statusMessage !== 'string' || !statusMessage) {
        throw new DomainInvariantError('invalid-task-access', 'Task access requires a repository, task id, agent id, and both messages.');
    }
    const task = taskRepository.getById(taskId);
    if (!task) throw new ApplicationError('task-not-found', 'The task does not exist.');
    if (task.assigneeId !== agentId) {
        throw new DomainInvariantError('unauthorized-task-result', assigneeMessage);
    }
    if (task.status !== TaskStatus.IN_PROGRESS) {
        throw new DomainInvariantError('invalid-task-transition', statusMessage);
    }
    return task;
}

/** Validate that the actor is a current, available organization member and that the
 * authorization decision grants the action on the task descriptor; throws a typed
 * domain error with the caller's codes and messages otherwise. The swallow-and-deny
 * behavior for authorizer failures is deliberate: a failed check never grants. */
export function assertTaskReadAuthorized({ task, actor, authorize, action,
    memberErrorCode, memberMessage, deniedMessage } = {}) {
    if (typeof authorize !== 'function' || typeof action !== 'string' || !action) {
        throw new DomainInvariantError('invalid-task-access', 'Task authorization requires an authorizer and an action.');
    }
    if (!task || !actor || !Object.values(AgentRole).includes(actor.role) || !isAgentAvailable(actor)) {
        throw new DomainInvariantError(memberErrorCode, memberMessage);
    }
    let allowed = false;
    try {
        allowed = authorize(Object.freeze({ action,
            actor: Object.freeze({ id: actor.id, role: actor.role }),
            task: Object.freeze({ id: task.id, status: task.status, projectId: task.projectId ?? null,
                assigneeId: task.assigneeId ?? null }) })) === true;
    } catch { allowed = false; }
    if (!allowed) throw new DomainInvariantError(memberErrorCode, deniedMessage);
}
