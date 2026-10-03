import { EventType, TaskStatus } from '../constants';
import { assertTaskAssignment, assertTaskTransition, createDomainEvent, createEntityId,
    DomainInvariantError, evaluateTaskRetry, getTaskEscalationRoute, validateTaskAcceptanceCriteria } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const MAX_REVIEW_FEEDBACK_LENGTH = 4_000;

/** Apply an authorized review decision and route bounded rework or exhausted work. */
export function createTaskReviewUseCase({
    taskRepository, agentRepository, hierarchyProvider, auditRepository, eventPublisher,
    unitOfWork, clock, idFactory,
} = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Task review requires task, agent, hierarchy, audit, event, transaction, clock, and ID ports.');
    }
    return createUseCase({
        name: 'task-review',
        dependencies: { taskRepository, agentRepository, hierarchyProvider, auditRepository,
            eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.taskId !== 'string' || typeof input.reviewerId !== 'string'
                || !['APPROVED', 'REWORK'].includes(input.decision)) {
                throw new DomainInvariantError('invalid-task-review', 'Review requires a task, reviewer, and APPROVED or REWORK decision.');
            }
            const task = dependencies.taskRepository.getById(input.taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The task does not exist.');
            if (task.status !== TaskStatus.REVIEW) {
                throw new DomainInvariantError('invalid-task-transition', 'Only a task in review can receive a review decision.');
            }
            const reviewer = dependencies.agentRepository.getById(input.reviewerId);
            if (!reviewer) throw new ApplicationError('reviewer-not-found', 'The reviewer does not exist.');
            if (task.creatorId !== reviewer.id) {
                throw new DomainInvariantError('unauthorized-task-review', 'Only the task creator in the reporting hierarchy may review this task.');
            }
            assertTaskAssignment({ creatorId: reviewer.id, assigneeId: task.assigneeId },
                dependencies.hierarchyProvider.getSnapshot());
            const feedback = input.feedback == null ? '' : input.feedback;
            if (typeof feedback !== 'string' || feedback.length > MAX_REVIEW_FEEDBACK_LENGTH
                || (input.decision === 'REWORK' && feedback.trim() === '')) {
                throw new DomainInvariantError('invalid-task-review', 'Rework requires bounded, actionable review feedback.');
            }
            if (input.decision === 'APPROVED') {
                if (!task.result || typeof task.result !== 'object' || Array.isArray(task.result)) {
                    throw new DomainInvariantError('invalid-task-result', 'A task cannot pass review without a structured result.');
                }
                const acceptance = validateTaskAcceptanceCriteria(task.acceptanceCriteria);
                if (!acceptance.valid) {
                    throw new DomainInvariantError('task-acceptance-incomplete', 'Required acceptance criteria must pass before review approval.');
                }
                assertTaskTransition(task.status, TaskStatus.COMPLETED);
            }
            else {
                // Validate retry bounds before entering the transaction.
                const retry = evaluateTaskRetry(task.retryCount, task.maxRetries);
                assertTaskTransition(task.status, retry.canRetry ? TaskStatus.IN_PROGRESS : TaskStatus.FAILED);
            }

            return dependencies.unitOfWork.run(() => {
                const time = dependencies.clock.now();
                const occurredAt = (time instanceof Date ? time : new Date(time)).toISOString();
                let status;
                let retryCount = task.retryCount;
                let escalation = null;
                const changes = {};
                if (input.decision === 'APPROVED') {
                    status = TaskStatus.COMPLETED;
                    changes.completedAt = occurredAt;
                }
                else {
                    const retry = evaluateTaskRetry(task.retryCount, task.maxRetries);
                    status = retry.canRetry ? TaskStatus.IN_PROGRESS : TaskStatus.FAILED;
                    if (retry.canRetry) {
                        retryCount = retry.nextRetryCount;
                        changes.result = { ...task.result, reviewFeedback: feedback.trim() };
                        changes.acceptanceCriteria = task.acceptanceCriteria.map((criterion) => ({ ...criterion, met: false }));
                    }
                    else {
                        const route = getTaskEscalationRoute(reviewer.role, 'RETRIES_EXHAUSTED');
                        escalation = route.targetRole;
                    }
                }
                changes.status = status;
                changes.retryCount = retryCount;
                const updated = dependencies.taskRepository.update(task.id, changes);
                dependencies.auditRepository.append({
                    id: createEntityId(dependencies.idFactory()), action: `TASK_REVIEW_${input.decision}`,
                    entity: 'task', entityId: task.id, actorId: reviewer.id, taskId: task.id,
                    details: { decision: input.decision, feedbackLength: feedback.trim().length, retryCount, escalation },
                });
                const type = input.decision === 'APPROVED' ? EventType.TASK_REVIEW_PASSED
                    : escalation ? EventType.TASK_ESCALATED : EventType.TASK_REVIEW_FAILED;
                dependencies.eventPublisher.append(createDomainEvent({
                    eventId: createEntityId(dependencies.idFactory()), type,
                    aggregateId: task.id, occurredAt,
                    payload: { taskId: task.id, decision: input.decision, status,
                        retryCount, ...(escalation ? { escalationTargetRole: escalation } : {}) },
                }));
                return updated;
            });
        },
    });
}
