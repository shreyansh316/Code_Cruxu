import { EventType, TaskStatus } from '../constants';
import { assertTaskTransition, createDomainEvent, createEntityId, DomainInvariantError } from '../domain';
import { stopTaskDebuggingSession } from './stopTaskDebuggingSession';

/** Persist execution start transitions synchronously for TaskScheduler.onStart. */
export function createTaskExecutionLifecycle({ taskRepository, auditRepository, eventPublisher,
    unitOfWork, clock, idFactory, debuggingSessionRepository } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Task execution lifecycle requires task, audit, event, transaction, clock, and id ports.');
    }
    return Object.freeze({
        onStart(candidate) {
            const taskId = createEntityId(candidate?.id, 'Task id');
            const started = unitOfWork.run(() => {
                const task = taskRepository.getById(taskId);
                if (!task) throw new DomainInvariantError('task-not-found', 'The scheduled task no longer exists.');
                if (task.status === TaskStatus.IN_PROGRESS) return false;
                if (task.status !== TaskStatus.ASSIGNED) {
                    throw new DomainInvariantError('invalid-task-transition', 'Only an assigned task can begin execution.');
                }
                const occurredAt = timestamp(clock.now());
                transition(task, TaskStatus.STARTED, EventType.TASK_STARTED, occurredAt);
                transition(task, TaskStatus.IN_PROGRESS, EventType.TASK_PROGRESS, occurredAt);
                return true;
            });
            if (started && typeof started.then === 'function') {
                throw new TypeError('Task execution lifecycle transactions must be synchronous.');
            }
            return started;
        },
        cancel(taskId) {
            const id = createEntityId(taskId, 'Task id');
            return unitOfWork.run(() => {
                const task = taskRepository.getById(id);
                if (!task || task.status === TaskStatus.CANCELLED) return false;
                if (![TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS].includes(task.status)) {
                    throw new DomainInvariantError('invalid-task-transition', 'Only assigned or in-progress work can be cancelled from the execution flow.');
                }
                assertTaskTransition(task.status, TaskStatus.CANCELLED);
                taskRepository.update(id, { status: TaskStatus.CANCELLED });
                const occurredAt = timestamp(clock.now());
                stopTaskDebuggingSession({ sessionRepository: debuggingSessionRepository, auditRepository,
                    taskId: id, actorId: task.assigneeId, reason: 'task-cancelled',
                    summary: 'The task was cancelled while debugging was active.', occurredAt, idFactory });
                auditRepository.append({ id: createEntityId(idFactory()), action: 'TASK_CANCELLED',
                    entity: 'task', entityId: id, actorId: task.assigneeId, taskId: id,
                    details: { reason: 'execution-cancelled' } });
                eventPublisher.append(createDomainEvent({ eventId: createEntityId(idFactory()),
                    type: EventType.TASK_CANCELLED, aggregateId: id, occurredAt,
                    payload: { taskId: id, status: TaskStatus.CANCELLED, reason: 'execution-cancelled' } }));
                return true;
            });
        },
    });

    function transition(task, nextStatus, eventType, occurredAt) {
        assertTaskTransition(task.status, nextStatus);
        taskRepository.update(task.id, { status: nextStatus });
        auditRepository.append({ id: createEntityId(idFactory()), action: 'TASK_STATE_CHANGED', entity: 'task',
            entityId: task.id, actorId: task.assigneeId, taskId: task.id,
            details: { from: task.status, to: nextStatus } });
        eventPublisher.append(createDomainEvent({ eventId: createEntityId(idFactory()), type: eventType,
            aggregateId: task.id, occurredAt, payload: { taskId: task.id, from: task.status, status: nextStatus } }));
        task.status = nextStatus;
    }
}

function timestamp(value) {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}
