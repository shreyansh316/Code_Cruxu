import { AgentRole, EventType, TaskStatus } from '../constants';
import { createDomainEvent, createEntityId, DomainInvariantError, getTaskEscalationRoute, isAgentAvailable } from '../domain';
import { createUseCase } from './useCase';

const DEBUGGABLE_TASK_STATES = new Set([TaskStatus.IN_PROGRESS]);

/** Compose persisted, authorized debugging sessions with bounded steps and audit events. */
export function createControlledDebuggingWorkflow({ sessionRepository, taskRepository, agentRepository, auditRepository,
    eventPublisher, projectRepository, objectiveRepository, questionRepository, unitOfWork, authorize,
    clock = { now: () => new Date().toISOString() }, idFactory } = {}) {
    if (typeof sessionRepository?.create !== 'function' || typeof sessionRepository?.getById !== 'function'
        || typeof sessionRepository?.hasActiveForTask !== 'function'
        || typeof sessionRepository?.recordStep !== 'function' || typeof sessionRepository?.stop !== 'function'
        || typeof taskRepository?.getById !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function'
        || typeof authorize !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Controlled debugging requires persisted session/task/agent, audit, transaction, authorization, clock, and ID ports.');
    }
    if ((questionRepository || objectiveRepository || projectRepository)
        && (typeof questionRepository?.create !== 'function' || typeof questionRepository?.listByObjective !== 'function'
            || typeof questionRepository?.nextSortOrder !== 'function' || typeof objectiveRepository?.getById !== 'function'
            || typeof projectRepository?.getById !== 'function')) {
        throw new TypeError('Debugging escalation questions require question, objective, and project repositories together.');
    }
    const dependencies = Object.freeze({ sessionRepository, taskRepository, agentRepository, auditRepository, eventPublisher,
        projectRepository, objectiveRepository, questionRepository, unitOfWork, authorize, clock, idFactory });
    return Object.freeze({
        start: createUseCase({ name: 'debugging-session-start', dependencies, execute: ({ input, dependencies: d }) => {
            const { task, actor } = authorizeTaskActor(d, input?.taskId, input?.actorId, input?.actorRole);
            if (input?.confirm !== true) throw new DomainInvariantError('debugging-start-not-confirmed', 'Starting a debugging session requires explicit confirmation.');
            if (!DEBUGGABLE_TASK_STATES.has(task.status)) throw new DomainInvariantError('debugging-task-not-active', 'Only in-progress tasks can enter debugging.');
            assertAuthorized(d.authorize, { action: 'DEBUG', actor, task });
            const now = d.clock.now();
            return d.unitOfWork.run(() => {
                if (d.sessionRepository.hasActiveForTask(task.id)) {
                    throw new DomainInvariantError('debugging-session-already-active', 'This task already has an active debugging session.');
                }
                const session = d.sessionRepository.create({ id: createEntityId(d.idFactory()), taskId: task.id,
                    createdByAgentId: actor.id, maxAttempts: input.maxAttempts, fileBudget: input.fileBudget,
                    commandBudget: input.commandBudget, tokenBudget: input.tokenBudget, timeBudgetMs: input.timeBudgetMs, startedAt: now });
                d.auditRepository.append({ id: createEntityId(d.idFactory()), action: 'DEBUGGING_SESSION_STARTED',
                    entity: 'debugging-session', entityId: session.id, actorId: actor.id, taskId: task.id,
                    details: { stage: session.stage, deadlineAt: session.deadlineAt, maxAttempts: session.maxAttempts,
                        fileBudget: session.fileBudget, commandBudget: session.commandBudget,
                        tokenBudget: session.tokenBudget, timeBudgetMs: session.timeBudgetMs } });
                return session;
            });
        } }),
        recordStep: createUseCase({ name: 'debugging-step-record', dependencies, execute: ({ input, dependencies: d }) => {
            const sessionId = createEntityId(input?.sessionId, 'Debugging session id');
            const session = d.sessionRepository.getById(sessionId);
            if (!session) throw new DomainInvariantError('debugging-session-not-found', 'The debugging session does not exist.');
            const { task, actor } = authorizeTaskActor(d, session.taskId, input?.actorId, input?.actorRole);
            if (task.id !== session.taskId || !DEBUGGABLE_TASK_STATES.has(task.status)) {
                throw new DomainInvariantError('debugging-task-not-active', 'The task is no longer eligible for debugging.');
            }
            assertAuthorized(d.authorize, { action: 'DEBUG_STEP', actor, task, session });
            return d.unitOfWork.run(() => {
                const result = d.sessionRepository.recordStep({ ...input, id: createEntityId(d.idFactory()),
                    sessionId, now: d.clock.now() });
                d.auditRepository.append({ id: createEntityId(d.idFactory()), action: 'DEBUGGING_STEP_RECORDED',
                    entity: 'debugging-session', entityId: session.id, actorId: actor.id, taskId: task.id,
                    details: { stage: input.stage, outcome: input.outcome, sessionStatus: result.session.status,
                        attemptCount: result.session.attemptCount, failedTestCount: result.session.failedTestCount,
                        filesTouched: result.session.filesTouched, commandsRun: result.session.commandsRun,
                        tokensUsed: result.session.tokensUsed, stopReason: result.session.stopReason,
                        toolAction: result.step?.toolAction ?? null, commandSummary: result.step?.commandSummary ?? null,
                        files: result.step?.files ?? [] } });
                if (result.session.status === 'ESCALATED') {
                    d.taskRepository.update(task.id, { status: TaskStatus.BLOCKED, blockerReason: `debugging-${result.session.stopReason}` });
                    appendEscalation(d, actor, task, session, result.session);
                } else if (result.session.status === 'RESOLVED') {
                    d.taskRepository.update(task.id, { status: TaskStatus.IN_PROGRESS, blockerReason: null });
                }
                return result;
            });
        } }),
        stop: createUseCase({ name: 'debugging-session-stop', dependencies, execute: ({ input, dependencies: d }) => {
            if (input?.status !== undefined) {
                throw new DomainInvariantError('debugging-stop-status-forbidden', 'Debugging stop status is selected by the workflow and cannot be supplied by callers.');
            }
            const sessionId = createEntityId(input?.sessionId, 'Debugging session id');
            const session = d.sessionRepository.getById(sessionId);
            if (!session) throw new DomainInvariantError('debugging-session-not-found', 'The debugging session does not exist.');
            const { task, actor } = authorizeTaskActor(d, session.taskId, input?.actorId, input?.actorRole);
            assertAuthorized(d.authorize, { action: 'DEBUG_STOP', actor, task, session });
            return d.unitOfWork.run(() => {
                const stopped = d.sessionRepository.stop(sessionId, input.reason, input.summary, d.clock.now());
                d.auditRepository.append({ id: createEntityId(d.idFactory()), action: 'DEBUGGING_SESSION_STOPPED',
                    entity: 'debugging-session', entityId: session.id, actorId: actor.id, taskId: task.id,
                    details: { status: stopped.session.status, stopReason: stopped.session.stopReason } });
                return stopped.session;
            });
        } }),
    });
}

function appendEscalation(dependencies, actor, task, session, state) {
    const route = actor.role === AgentRole.CEO ? { targetRole: AgentRole.CEO }
        : getTaskEscalationRoute(actor.role, state.stopReason === 'repeated-test-failure' ? 'RETRIES_EXHAUSTED' : 'BLOCKED');
    dependencies.eventPublisher.append(createDomainEvent({ eventId: createEntityId(dependencies.idFactory()),
        type: EventType.TASK_ESCALATED, aggregateId: task.id, occurredAt: dependencies.clock.now(),
        payload: { taskId: task.id, debuggingSessionId: session.id, trigger: state.stopReason,
            escalationTargetRole: route.targetRole, explanation: state.finalSummary ?? `Debugging stopped: ${state.stopReason}.` } }));
    const project = task.projectId && dependencies.projectRepository?.getById(task.projectId);
    const objective = project?.objectiveId && dependencies.objectiveRepository?.getById(project.objectiveId);
    if (objective && dependencies.questionRepository) {
        const now = dependencies.clock.now();
        const question = dependencies.questionRepository.create({ id: createEntityId(dependencies.idFactory()),
            objectiveId: objective.id, question: `Debugging session ${session.id} escalated (${state.stopReason}). Review the persisted debugging steps and direct the next action.`,
            status: 'PENDING', category: 'DEBUGGING_ESCALATION',
            sortOrder: dependencies.questionRepository.nextSortOrder(objective.id) });
        dependencies.eventPublisher.append(createDomainEvent({ eventId: createEntityId(dependencies.idFactory()),
            type: EventType.QUESTION_ASKED, aggregateId: objective.id,
            occurredAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
            payload: { questionId: question.id, objectiveId: objective.id } }));
    }
}

function authorizeTaskActor(dependencies, taskIdValue, actorIdValue, role) {
    const taskId = createEntityId(taskIdValue, 'Debugging task id');
    const actorId = createEntityId(actorIdValue, 'Debugging actor id');
    if (!Object.values(AgentRole).includes(role)) throw new DomainInvariantError('invalid-debugging-actor', 'Debugging actor role is invalid.');
    const task = dependencies.taskRepository.getById(taskId);
    const actor = dependencies.agentRepository.getById(actorId);
    if (!task || !actor || actor.role !== role || !isAgentAvailable(actor)) {
        throw new DomainInvariantError('invalid-debugging-identity', 'Debugging requires a current persisted actor and task.');
    }
    return { task, actor };
}

function assertAuthorized(authorize, request) {
    let allowed = false;
    try { allowed = authorize(Object.freeze({ ...request, actor: Object.freeze({ id: request.actor.id, role: request.actor.role }),
        task: Object.freeze({ id: request.task.id, status: request.task.status, projectId: request.task.projectId ?? null }) })) === true; }
    catch { allowed = false; }
    if (!allowed) throw new DomainInvariantError('debugging-forbidden', 'The actor is not authorized for this debugging action.');
}
