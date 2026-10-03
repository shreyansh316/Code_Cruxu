import { EventType, TaskStatus } from '../constants';
import { assertTaskTransition, createDomainEvent, createEntityId } from '../domain';
import { createUseCase } from './useCase';

const INTERRUPTION_REASON = 'Execution was interrupted by a host restart; resume requires an explicit follow-up.';

/** Reconcile durable claims left active by a previous host process. */
export function createExecutionRecoveryUseCase({
    taskRepository, queueRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory,
} = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof queueRepository?.listByState !== 'function' || typeof queueRepository?.transition !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Execution recovery requires task, queue, audit, event, transaction, clock, and ID ports.');
    }
    return createUseCase({
        name: 'execution-recovery',
        dependencies: { taskRepository, queueRepository, auditRepository, eventPublisher,
            unitOfWork, clock, idFactory },
        execute: ({ dependencies }) => dependencies.unitOfWork.run(() => {
            const claimed = dependencies.queueRepository.listByState('CLAIMED', { limit: 1000 });
            const recovered = [];
            for (const entry of claimed) {
                const task = dependencies.taskRepository.getById(entry.taskId);
                if (!task) continue;
                const time = dependencies.clock.now();
                const occurredAt = (time instanceof Date ? time : new Date(time)).toISOString();
                let nextQueueState;
                let outcome;
                if (task.status === TaskStatus.ASSIGNED) {
                    nextQueueState = 'QUEUED';
                    outcome = 'REQUEUED';
                }
                else if ([TaskStatus.STARTED, TaskStatus.IN_PROGRESS].includes(task.status)) {
                    assertTaskTransition(task.status, TaskStatus.BLOCKED);
                    dependencies.taskRepository.update(task.id, {
                        status: TaskStatus.BLOCKED, blockerReason: INTERRUPTION_REASON,
                    });
                    nextQueueState = 'CANCELLED';
                    outcome = 'BLOCKED';
                }
                else if (task.status === TaskStatus.COMPLETED) {
                    nextQueueState = 'COMPLETED';
                    outcome = 'ALREADY_COMPLETED';
                }
                else {
                    nextQueueState = 'CANCELLED';
                    outcome = task.status === TaskStatus.REVIEW ? 'REVIEW_PENDING' : 'NOT_RUNNABLE';
                }
                const changed = dependencies.queueRepository.transition(entry.taskId, 'CLAIMED', nextQueueState);
                if (!changed) continue;
                dependencies.auditRepository.append({
                    id: createEntityId(dependencies.idFactory()), action: 'EXECUTION_RECOVERED',
                    entity: 'task', entityId: task.id, taskId: task.id,
                    details: { outcome, previousTaskStatus: task.status, queueState: nextQueueState },
                });
                if (outcome === 'REQUEUED' || outcome === 'BLOCKED') {
                    dependencies.eventPublisher.append(createDomainEvent({
                        eventId: createEntityId(dependencies.idFactory()),
                        type: outcome === 'REQUEUED' ? EventType.TASK_QUEUED : EventType.TASK_BLOCKED,
                        aggregateId: task.id, occurredAt,
                        payload: outcome === 'REQUEUED'
                            ? { taskId: task.id, queueId: changed.id, recovery: true }
                            : { taskId: task.id, reason: 'host-restart-recovery' },
                    }));
                }
                recovered.push({ taskId: task.id, outcome, queueState: nextQueueState });
            }
            return recovered;
        }),
    });
}
