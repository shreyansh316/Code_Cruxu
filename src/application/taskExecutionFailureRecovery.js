import { EventType, TaskStatus } from '../constants';
import { assertTaskTransition, createDomainEvent, createEntityId, evaluateTaskRetry } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { stopTaskDebuggingSession } from './stopTaskDebuggingSession';

/** Persist a bounded execution retry or terminal task failure with matching queue, audit, and event state. */
export function createTaskExecutionFailureRecovery({ taskRepository, queueRepository, auditRepository,
    eventPublisher, unitOfWork, clock, idFactory, debuggingSessionRepository } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof queueRepository?.getByTaskId !== 'function' || typeof queueRepository?.transition !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Execution failure recovery requires task, queue, audit, event, transaction, clock, and ID ports.');
    }
    return createUseCase({
        name: 'task-execution-failure-recovery',
        dependencies: { taskRepository, queueRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory,
            debuggingSessionRepository },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.taskId !== 'string' || typeof input.errorCode !== 'string'
                || !/^[a-z][a-z0-9.-]{0,63}$/.test(input.errorCode)) {
                throw new ApplicationError('invalid-task-execution-failure', 'Task execution recovery requires a stable error code.');
            }
            const task = dependencies.taskRepository.getById(input.taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The failed execution task does not exist.');
            if (task.status !== TaskStatus.IN_PROGRESS) {
                throw new ApplicationError('invalid-task-transition', 'Only an in-progress task can enter execution recovery.');
            }
            const retry = evaluateTaskRetry(task.retryCount, task.maxRetries);
            const queue = dependencies.queueRepository.getByTaskId(task.id);
            if (!queue || queue.state !== 'QUEUED') {
                throw new ApplicationError('execution-queue-state-mismatch', 'A failed claim must return to the queued state before recovery.');
            }
            return dependencies.unitOfWork.run(() => {
                const happenedAt = timestamp(dependencies.clock.now());
                const retryCount = retry.canRetry ? retry.nextRetryCount : task.retryCount;
                if (retry.canRetry) {
                    dependencies.taskRepository.update(task.id, { retryCount, executionRetryReason: input.errorCode });
                    dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                        action: 'TASK_EXECUTION_RETRY_SCHEDULED', entity: 'task', entityId: task.id,
                        actorId: task.assigneeId, taskId: task.id,
                        details: { errorCode: input.errorCode, retryCount, maxRetries: task.maxRetries } });
                    dependencies.eventPublisher.append(createDomainEvent({
                        eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_RETRY_SCHEDULED,
                        aggregateId: task.id, occurredAt: happenedAt,
                        payload: { taskId: task.id, retryCount, maxRetries: task.maxRetries, errorCode: input.errorCode },
                    }));
                    return { outcome: 'RETRY_SCHEDULED', taskId: task.id, retryCount, maxRetries: task.maxRetries };
                }

                assertTaskTransition(task.status, TaskStatus.FAILED);
                dependencies.taskRepository.update(task.id, { status: TaskStatus.FAILED, completedAt: happenedAt,
                    executionRetryReason: input.errorCode, blockerReason: `Execution failed after ${task.retryCount} retries (${input.errorCode}).` });
                if (!dependencies.queueRepository.transition(task.id, 'QUEUED', 'FAILED')) {
                    throw new ApplicationError('execution-queue-state-mismatch', 'The exhausted task could not be closed in the execution queue.');
                }
                stopTaskDebuggingSession({ sessionRepository: dependencies.debuggingSessionRepository,
                    auditRepository: dependencies.auditRepository, taskId: task.id, actorId: task.assigneeId,
                    reason: 'task-failed', summary: 'The task exhausted its execution retries while debugging was active.',
                    occurredAt: happenedAt, idFactory: dependencies.idFactory });
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                    action: 'TASK_EXECUTION_FAILED', entity: 'task', entityId: task.id,
                    actorId: task.assigneeId, taskId: task.id,
                    details: { errorCode: input.errorCode, retryCount: task.retryCount, maxRetries: task.maxRetries } });
                dependencies.eventPublisher.append(createDomainEvent({
                    eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_FAILED,
                    aggregateId: task.id, occurredAt: happenedAt,
                    payload: { taskId: task.id, errorCode: input.errorCode, retryCount: task.retryCount },
                }));
                return { outcome: 'FAILED', taskId: task.id, retryCount: task.retryCount, maxRetries: task.maxRetries };
            });
        },
    });
}

function timestamp(value) {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}
