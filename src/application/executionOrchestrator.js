import { EventType, ObjectiveStatus, TaskStatus } from '../constants';
import { assertObjectiveTransition, assertTaskTransition, createDomainEvent, createEntityId,
    assertPlanApproved, DomainInvariantError, MAX_TASK_RETRIES } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Coordinate an approved objective through durable execution, review, and deterministic reporting. */
export function createExecutionOrchestrator({
    taskCreationUseCase, scheduler, resultSubmissionUseCase, reviewUseCase, executionFailureRecovery,
    objectiveRepository, taskRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory,
} = {}) {
    if (typeof taskCreationUseCase?.run !== 'function' || typeof scheduler?.run !== 'function'
        || typeof resultSubmissionUseCase?.run !== 'function'
        || typeof reviewUseCase?.run !== 'function' || typeof executionFailureRecovery?.run !== 'function'
        || typeof objectiveRepository?.getById !== 'function'
        || typeof objectiveRepository?.update !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof taskRepository?.update !== 'function' || typeof taskRepository?.list !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Execution orchestration requires application workflows and persistence/event ports.');
    }
    return createUseCase({
        name: 'execution-orchestrator',
        dependencies: { taskCreationUseCase, scheduler, resultSubmissionUseCase, reviewUseCase, executionFailureRecovery,
            objectiveRepository, taskRepository, auditRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: async ({ input, dependencies }) => {
            const plan = input?.plan;
            assertPlanApproved(plan);
            const objective = plan && dependencies.objectiveRepository.getById(plan.objectiveId);
            if (!objective) throw new ApplicationError('objective-not-found', 'The approved plan objective does not exist.');
            if (objective.status !== ObjectiveStatus.PLANNING) {
                throw new DomainInvariantError('invalid-objective-transition', 'Execution orchestration requires an objective in planning.');
            }
            assertObjectiveTransition(objective.status, ObjectiveStatus.ACTIVE);
            const decisions = buildReviewDecisionQueues(input.reviewDecisions ?? []);
            if ([...decisions.keys()].some((taskId) => !plan.tasks.some((task) => task.id === taskId))) {
                throw new DomainInvariantError('invalid-task-review', 'Review decisions must reference tasks in the approved plan.');
            }
            const created = await dependencies.taskCreationUseCase.run({
                plan, assignments: input.assignments, maxRetries: input.maxRetries,
            });
            if (!created.ok) throw new ApplicationError('orchestration-step-failed', 'Approved plan task creation failed.');
            const ids = created.value.tasks.map(({ id }) => id);
            dependencies.unitOfWork.run(() => {
                const activated = dependencies.objectiveRepository.update(objective.id, { status: ObjectiveStatus.ACTIVE });
                const occurredAt = now(dependencies.clock);
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                    action: 'OBJECTIVE_ACTIVATED', entity: 'objective', entityId: objective.id,
                    details: { taskCount: ids.length } });
                appendEvent(dependencies, EventType.OBJECTIVE_ACTIVATED, objective.id, occurredAt,
                    { objectiveId: objective.id, status: activated.status });
                for (const taskId of ids) {
                    const task = dependencies.taskRepository.getById(taskId);
                    assertTaskTransition(task.status, TaskStatus.ASSIGNED);
                    dependencies.taskRepository.update(taskId, { status: TaskStatus.ASSIGNED });
                    dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                        action: 'TASK_ASSIGNED', entity: 'task', entityId: taskId,
                        actorId: task.creatorId, taskId,
                        details: { assigneeId: task.assigneeId } });
                }
            });

            const executionFailures = [];
            let rounds = 0;
            const maxRounds = Math.max(1, ids.length * (MAX_TASK_RETRIES + 1) + 1);
            while (rounds < maxRounds) {
                rounds += 1;
                const scheduled = await dependencies.scheduler.run();
                if (!scheduled.ok) throw new ApplicationError('orchestration-step-failed', 'Task scheduling failed.');
                const started = scheduled.value.started;
                if (!started.length) break;
                for (const attempt of started) {
                    if (attempt.status === 'CANCELLED') {
                        markTaskCancelled(dependencies, attempt.taskId);
                        executionFailures.push({ taskId: attempt.taskId, code: 'task-execution-cancelled' });
                        continue;
                    }
                    if (attempt.status !== 'SUCCEEDED') {
                        const code = typeof attempt.errorCode === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(attempt.errorCode)
                            ? attempt.errorCode : 'task-execution-failed';
                        if (attempt.phase === 'START') {
                            recordTaskStartFailure(dependencies, attempt.taskId, code);
                            executionFailures.push({ taskId: attempt.taskId, code });
                            continue;
                        }
                        const recovered = await dependencies.executionFailureRecovery.run({ taskId: attempt.taskId, errorCode: code });
                        if (!recovered.ok) throw new ApplicationError('execution-recovery-failed', 'Task execution recovery could not persist a safe retry outcome.');
                        if (recovered.value.outcome === 'FAILED') executionFailures.push({ taskId: attempt.taskId, code });
                        continue;
                    }
                    const task = dependencies.taskRepository.getById(attempt.taskId);
                    if (task.status === TaskStatus.ASSIGNED) {
                        recordTaskProgress(dependencies, task);
                    }
                    const submitted = await dependencies.resultSubmissionUseCase.run({
                        taskId: task.id, agentId: task.assigneeId, result: attempt.value,
                    });
                    if (!submitted.ok) {
                        markTaskBlocked(dependencies, task.id, task.creatorId, submitted.error.code);
                        executionFailures.push({ taskId: task.id, code: submitted.error.code });
                        continue;
                    }
                    const decision = decisions.get(task.id)?.shift();
                    if (!decision) continue;
                    const reviewed = await dependencies.reviewUseCase.run({
                        taskId: task.id, reviewerId: decision.reviewerId ?? task.creatorId,
                        decision: decision.decision, feedback: decision.feedback,
                    });
                    if (!reviewed.ok) executionFailures.push({ taskId: task.id, code: reviewed.error.code });
                }
                if (executionFailures.length) break;
            }
            if (rounds >= maxRounds && ids.some((taskId) => {
                const status = dependencies.taskRepository.getById(taskId)?.status;
                return ![TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(status);
            })) executionFailures.push({ code: 'orchestration-round-limit' });
            const report = finalizeObjective(dependencies, objective.id, ids, rounds, executionFailures);
            return report;
        },
    });
}

function recordTaskProgress(dependencies, task) {
    dependencies.unitOfWork.run(() => {
        const occurredAt = now(dependencies.clock);
        assertTaskTransition(TaskStatus.ASSIGNED, TaskStatus.STARTED);
        dependencies.taskRepository.update(task.id, { status: TaskStatus.STARTED });
        recordTaskState(dependencies, task, TaskStatus.ASSIGNED, TaskStatus.STARTED, EventType.TASK_STARTED, occurredAt);
        assertTaskTransition(TaskStatus.STARTED, TaskStatus.IN_PROGRESS);
        dependencies.taskRepository.update(task.id, { status: TaskStatus.IN_PROGRESS });
        recordTaskState(dependencies, task, TaskStatus.STARTED, TaskStatus.IN_PROGRESS, EventType.TASK_PROGRESS, occurredAt);
    });
}

function recordTaskState(dependencies, task, from, to, eventType, occurredAt) {
    dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
        action: 'TASK_STATE_CHANGED', entity: 'task', entityId: task.id,
        actorId: task.assigneeId, taskId: task.id, details: { from, to } });
    appendEvent(dependencies, eventType, task.id, occurredAt, { taskId: task.id, from, status: to });
}

function markTaskBlocked(dependencies, taskId, actorId, reasonCode) {
    dependencies.unitOfWork.run(() => {
        const task = dependencies.taskRepository.getById(taskId);
        if (task.status === TaskStatus.IN_PROGRESS) {
            assertTaskTransition(task.status, TaskStatus.BLOCKED);
            dependencies.taskRepository.update(taskId, { status: TaskStatus.BLOCKED,
                blockerReason: `Result submission failed (${reasonCode}).` });
            const occurredAt = now(dependencies.clock);
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                action: 'TASK_BLOCKED', entity: 'task', entityId: taskId, actorId, taskId,
                details: { reasonCode } });
            appendEvent(dependencies, EventType.TASK_BLOCKED, taskId, occurredAt,
                { taskId, reason: 'result-submission-failed' });
        }
    });
}

function recordTaskStartFailure(dependencies, taskId, reasonCode) {
    dependencies.unitOfWork.run(() => {
        const task = dependencies.taskRepository.getById(taskId);
        if (!task || task.status !== TaskStatus.ASSIGNED) {
            throw new ApplicationError('task-start-state-mismatch', 'A task that failed before start must remain assigned.');
        }
        const occurredAt = now(dependencies.clock);
        dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
            action: 'TASK_EXECUTION_START_FAILED', entity: 'task', entityId: taskId,
            actorId: task.assigneeId, taskId, details: { errorCode: reasonCode, retryCount: task.retryCount } });
        appendEvent(dependencies, EventType.TASK_START_FAILED, taskId, occurredAt,
            { taskId, errorCode: reasonCode, status: TaskStatus.ASSIGNED });
    });
}

function markTaskCancelled(dependencies, taskId) {
    dependencies.unitOfWork.run(() => {
        const task = dependencies.taskRepository.getById(taskId);
        if (!task || task.status === TaskStatus.CANCELLED) return;
        if (task.status !== TaskStatus.IN_PROGRESS) {
            throw new ApplicationError('invalid-task-transition', 'Only an in-progress task can be cancelled after execution starts.');
        }
        assertTaskTransition(task.status, TaskStatus.CANCELLED);
        dependencies.taskRepository.update(taskId, { status: TaskStatus.CANCELLED });
        const occurredAt = now(dependencies.clock);
        dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
            action: 'TASK_CANCELLED', entity: 'task', entityId: taskId,
            actorId: task.assigneeId, taskId, details: { reason: 'execution-cancelled' } });
        appendEvent(dependencies, EventType.TASK_CANCELLED, taskId, occurredAt,
            { taskId, status: TaskStatus.CANCELLED, reason: 'execution-cancelled' });
    });
}

function finalizeObjective(dependencies, objectiveId, taskIds, rounds, executionFailures) {
    return dependencies.unitOfWork.run(() => {
        const tasks = taskIds.map((taskId) => dependencies.taskRepository.getById(taskId));
        const allCompleted = tasks.every((task) => task.status === TaskStatus.COMPLETED);
        const allTerminal = tasks.every((task) => [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status));
        const nextStatus = allCompleted ? ObjectiveStatus.COMPLETED
            : allTerminal ? ObjectiveStatus.FAILED : ObjectiveStatus.ACTIVE;
        const objective = dependencies.objectiveRepository.getById(objectiveId);
        if (objective.status !== nextStatus) {
            assertObjectiveTransition(objective.status, nextStatus);
            dependencies.objectiveRepository.update(objectiveId, { status: nextStatus });
            if (nextStatus !== ObjectiveStatus.ACTIVE) {
                const occurredAt = now(dependencies.clock);
                const type = nextStatus === ObjectiveStatus.COMPLETED ? EventType.OBJECTIVE_COMPLETED : EventType.OBJECTIVE_FAILED;
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                    action: `OBJECTIVE_${nextStatus}`, entity: 'objective', entityId: objectiveId,
                    details: { taskCount: tasks.length } });
                appendEvent(dependencies, type, objectiveId, occurredAt, { objectiveId, status: nextStatus });
            }
        }
        const counts = {
            completed: tasks.filter(({ status }) => status === TaskStatus.COMPLETED).length,
            failed: tasks.filter(({ status }) => status === TaskStatus.FAILED || status === TaskStatus.BLOCKED).length,
            reviewPending: tasks.filter(({ status }) => status === TaskStatus.REVIEW).length,
            reworkPending: tasks.filter(({ status }) => status === TaskStatus.IN_PROGRESS).length,
        };
        dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
            action: 'EXECUTION_REPORTED', entity: 'objective', entityId: objectiveId,
            details: { status: nextStatus, rounds, counts, failureCount: executionFailures.length } });
        return {
            objectiveId, status: nextStatus, rounds,
            tasks: tasks.map(({ id, status, retryCount }) => ({ id, status, retryCount })),
            executionFailures,
            counts,
        };
    });
}

function buildReviewDecisionQueues(decisions) {
    if (!Array.isArray(decisions) || decisions.length > 1000) {
        throw new DomainInvariantError('invalid-task-review', 'Review decisions must be a bounded array.');
    }
    const byTask = new Map();
    for (const decision of decisions) {
        if (!decision || typeof decision.taskId !== 'string' || !['APPROVED', 'REWORK'].includes(decision.decision)) {
            throw new DomainInvariantError('invalid-task-review', 'Each review decision requires a task id and supported outcome.');
        }
        if (!byTask.has(decision.taskId)) byTask.set(decision.taskId, []);
        byTask.get(decision.taskId).push(decision);
    }
    return byTask;
}

function appendEvent(dependencies, type, aggregateId, occurredAt, payload) {
    dependencies.eventPublisher.append(createDomainEvent({
        eventId: createEntityId(dependencies.idFactory()), type, aggregateId, occurredAt, payload,
    }));
}

function now(clock) {
    const value = clock.now();
    return (value instanceof Date ? value : new Date(value)).toISOString();
}
