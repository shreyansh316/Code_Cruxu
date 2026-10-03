import { EventType, TaskStatus } from '../constants';
import { createDomainEvent, createEntityId, DomainInvariantError, validateTaskResult } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Persist an assigned employee's complete result and route the task into review. */
export function createTaskResultSubmissionUseCase({
    taskRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory,
} = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Task result submission requires task, audit, event, transaction, clock, and ID ports.');
    }
    return createUseCase({
        name: 'task-result-submission',
        dependencies: { taskRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.taskId !== 'string' || typeof input.agentId !== 'string') {
                throw new DomainInvariantError('invalid-task-result', 'A task id and submitting agent id are required.');
            }
            const task = dependencies.taskRepository.getById(input.taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The task does not exist.');
            if (task.assigneeId !== input.agentId) {
                throw new DomainInvariantError('unauthorized-task-result', 'Only the assigned agent may submit this task result.');
            }
            if (task.status !== TaskStatus.IN_PROGRESS) {
                throw new DomainInvariantError('invalid-task-transition', 'Task results can be submitted only while the task is in progress.');
            }
            const validated = validateTaskResult(input.result, task.acceptanceCriteria);
            return dependencies.unitOfWork.run(() => {
                const timestamp = dependencies.clock.now();
                const occurredAt = (timestamp instanceof Date ? timestamp : new Date(timestamp)).toISOString();
                const updated = dependencies.taskRepository.update(task.id, {
                    result: validated.result,
                    acceptanceCriteria: validated.acceptanceCriteria,
                    status: TaskStatus.REVIEW,
                });
                dependencies.auditRepository.append({
                    id: createEntityId(dependencies.idFactory()), action: 'TASK_RESULT_SUBMITTED',
                    entity: 'task', entityId: task.id, actorId: input.agentId, taskId: task.id,
                    details: { criterionCount: validated.acceptanceCriteria.length },
                });
                dependencies.eventPublisher.append(createDomainEvent({
                    eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_REVIEW_REQUIRED,
                    aggregateId: task.id, occurredAt,
                    payload: { taskId: task.id, status: TaskStatus.REVIEW },
                }));
                return updated;
            });
        },
    });
}
