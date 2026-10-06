import { EventType, TaskStatus } from '../constants';
import { assertTaskAssignment, createDomainEvent, createEntityId, getTaskReadiness } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Persist and select deterministically dependency-ready, hierarchy-authorized tasks. */
export function createExecutionQueueUseCase({
    taskRepository, dependencyRepository, queueRepository, hierarchyProvider,
    auditRepository, eventPublisher, unitOfWork, clock, idFactory,
} = {}) {
    if (typeof taskRepository?.list !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof dependencyRepository?.list !== 'function' || typeof queueRepository?.enqueue !== 'function'
        || typeof queueRepository?.getByTaskId !== 'function' || typeof queueRepository?.listByState !== 'function'
        || typeof queueRepository?.requeueAfterReview !== 'function'
        || typeof hierarchyProvider?.getSnapshot !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof eventPublisher?.append !== 'function' || typeof unitOfWork?.run !== 'function'
        || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Execution queue requires task, dependency, queue, hierarchy, audit, event, transaction, clock, and ID ports.');
    }
    return createUseCase({
        name: 'execution-queue',
        dependencies: { taskRepository, dependencyRepository, queueRepository, hierarchyProvider,
            auditRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            const taskId = input?.taskId;
            if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)
                || Object.keys(input).some((key) => key !== 'taskId')
                || (taskId !== undefined && (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 128)))) {
                throw new ApplicationError('invalid-execution-queue-request', 'Execution selection must contain one valid task identifier.');
            }
            const tasks = dependencies.taskRepository.list();
            const dependenciesList = dependencies.dependencyRepository.list();
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            const eligible = tasks.filter((task) => (!taskId || task.id === taskId) && isExecutionCandidate(task));
            for (const task of eligible) {
                assertTaskAssignment({ creatorId: task.creatorId, assigneeId: task.assigneeId }, hierarchy);
            }
            const ready = eligible.filter((task) => getTaskReadiness(task.id, tasks, dependenciesList).ready);
            const queued = dependencies.unitOfWork.run(() => {
                const created = [];
                for (const task of ready) {
                    const existing = dependencies.queueRepository.getByTaskId(task.id);
                    let entry;
                    if (existing) {
                        if (existing.state !== 'COMPLETED' || task.status !== TaskStatus.IN_PROGRESS
                            || typeof task.result?.reviewFeedback !== 'string' || !task.result.reviewFeedback.trim()) continue;
                        entry = dependencies.queueRepository.requeueAfterReview(task.id);
                        if (!entry) continue;
                    }
                    else {
                        entry = dependencies.queueRepository.enqueue({
                            id: createEntityId(dependencies.idFactory()), taskId: task.id,
                        });
                    }
                    const time = dependencies.clock.now();
                    const occurredAt = (time instanceof Date ? time : new Date(time)).toISOString();
                    dependencies.auditRepository.append({
                        id: createEntityId(dependencies.idFactory()), action: 'TASK_QUEUED',
                        entity: 'task', entityId: task.id, actorId: task.creatorId, taskId: task.id,
                        details: { queueId: entry.id, priority: task.priority },
                    });
                    dependencies.eventPublisher.append(createDomainEvent({
                        eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_QUEUED,
                        aggregateId: task.id, occurredAt,
                        payload: { taskId: task.id, queueId: entry.id, priority: task.priority },
                    }));
                    created.push(entry);
                }
                return created;
            });
            const selected = dependencies.queueRepository.listByState('QUEUED', { limit: 1000 })
                .flatMap((entry) => {
                    const task = dependencies.taskRepository.getById(entry.taskId);
                    if (!task || (taskId && task.id !== taskId) || !isExecutionCandidate(task)) return [];
                    assertTaskAssignment({ creatorId: task.creatorId, assigneeId: task.assigneeId }, hierarchy);
                    return getTaskReadiness(task.id, tasks, dependenciesList).ready ? [{ queue: entry, task }] : [];
                });
            return { queued, ready: selected };
        },
    });
}

function isExecutionCandidate(task) {
    return task.status === TaskStatus.ASSIGNED
        || (task.status === TaskStatus.IN_PROGRESS && typeof task.result?.reviewFeedback === 'string'
            && task.result.reviewFeedback.trim().length > 0)
        || (task.status === TaskStatus.IN_PROGRESS && typeof task.executionRetryReason === 'string'
            && task.retryCount <= task.maxRetries);
}
