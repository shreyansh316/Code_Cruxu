import { assertTaskReadAuthorized } from './authorizedTaskAccess';
import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError, isAgentAvailable } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';
import { createUseCase } from './useCase';

const SESSION_LIMIT = 20;
const AUDIT_LIMIT = 100;
const AUDIT_EVIDENCE_FIELDS = new Set(['from', 'to', 'status', 'sessionStatus', 'stopReason', 'reason', 'reasonCode',
    'errorCode', 'retryCount', 'maxRetries', 'attemptCount', 'failedTestCount', 'deadlineAt', 'maxAttempts',
    'fileBudget', 'commandBudget', 'tokenBudget', 'timeBudgetMs', 'filesTouched', 'commandsRun', 'tokensUsed',
    'toolAction', 'commandSummary', 'files', 'stage', 'outcome', 'trigger', 'escalationTargetRole',
    'assigneeId', 'criterionCount', 'queueId', 'priority', 'activitySource', 'activityAction',
    'target', 'durationMs', 'bytes', 'detail', 'detailTruncated']);

/** Build a bounded, secret-redacted task execution report from persisted usage, debugging, and audit evidence. */
export function createTaskExecutionReport({ taskRepository, agentRepository, usageRepository,
    debuggingSessionRepository, auditRepository, projectRepository, objectiveRepository, authorize,
    clock = { now: () => new Date() } } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof usageRepository?.summarizeByTask !== 'function'
        || typeof debuggingSessionRepository?.listByTask !== 'function'
        || typeof debuggingSessionRepository?.listSteps !== 'function' || typeof clock?.now !== 'function'
        || typeof auditRepository?.listByTask !== 'function' || typeof authorize !== 'function') {
        throw new TypeError('Task execution reports require persisted task, identity, usage, debug, audit, and authorization ports.');
    }
    const dependencies = Object.freeze({ taskRepository, agentRepository, usageRepository,
        debuggingSessionRepository, auditRepository, projectRepository, objectiveRepository, authorize, clock });
    return createUseCase({ name: 'task-execution-report', dependencies, execute: ({ input, dependencies: d }) => {
        let taskId; let actorId;
        try {
            taskId = createEntityId(input?.taskId, 'Report task id');
            actorId = createEntityId(input?.actorId, 'Report actor id');
        } catch (error) {
            throw new DomainInvariantError('invalid-task-report-request', error.message);
        }
        const task = d.taskRepository.getById(taskId);
        const agentCache = new Map();
        const getAgent = (id) => {
            if (!id) return undefined;
            if (!agentCache.has(id)) agentCache.set(id, d.agentRepository.getById(id));
            return agentCache.get(id);
        };
        const actor = getAgent(actorId);
        assertTaskReadAuthorized({ task, actor, authorize: d.authorize, action: 'READ_TASK_EXECUTION_REPORT',
            memberErrorCode: 'task-report-forbidden',
            memberMessage: 'Execution reports require a current persisted organization member.',
            deniedMessage: 'The actor is not authorized to read this task report.' });

        const assignee = getAgent(task.assigneeId);
        const creator = getAgent(task.creatorId);
        const project = task.projectId && typeof d.projectRepository?.getById === 'function'
            ? d.projectRepository.getById(task.projectId) : undefined;
        const objective = project?.objectiveId && typeof d.objectiveRepository?.getById === 'function'
            ? d.objectiveRepository.getById(project.objectiveId) : undefined;
        const manager = creator && objective?.organizationId === creator.organizationId
            && [AgentRole.HEAD_MANAGER, AgentRole.DEPT_MANAGER].includes(creator.role) ? creator : undefined;
        const sessions = d.debuggingSessionRepository.listByTask(task.id, { limit: SESSION_LIMIT });
        const debugging = sessions.map((session) => {
            const author = getAgent(session.createdByAgentId);
            return Object.freeze({ id: session.id, status: session.status, stage: session.stage,
                stopReason: session.stopReason, finalSummary: session.finalSummary ? redactSecrets(session.finalSummary, 2000) : null,
                createdBy: author ? Object.freeze({ id: author.id, name: redactSecrets(author.name, 120), role: author.role }) : null,
                startedAt: session.startedAt, deadlineAt: session.deadlineAt,
                steps: Object.freeze(d.debuggingSessionRepository.listSteps(session.id, { limit: 30 }).map((step) =>
                    Object.freeze({ sequence: step.sequence, stage: step.stage, outcome: step.outcome,
                        summary: redactSecrets(step.summary, 2000), toolAction: step.toolAction,
                        commandSummary: step.commandSummary ? redactSecrets(step.commandSummary, 500) : null,
                        files: step.files, commandsRun: step.commandsRun, tokensUsed: step.tokensUsed,
                        durationMs: step.durationMs, createdAt: step.createdAt }))) });
        });
        const audits = d.auditRepository.listByTask(task.id, { limit: AUDIT_LIMIT, order: 'DESC' }).reverse().map((entry) => {
            const auditActor = getAgent(entry.actorId);
            const evidence = Object.fromEntries(Object.entries(entry.details ?? {}).filter(([key, value]) => AUDIT_EVIDENCE_FIELDS.has(key)
                && isSafeEvidence(value)).map(([key, value]) => [key, redactEvidence(value)]));
            return Object.freeze({ action: entry.action, entity: entry.entity, actorId: entry.actorId,
                actor: auditActor ? Object.freeze({ id: auditActor.id, name: redactSecrets(auditActor.name, 120), role: auditActor.role }) : null,
                occurredAt: entry.createdAt, evidence: Object.freeze(evidence) });
        });
        return Object.freeze({ task: Object.freeze({ id: task.id, code: task.taskCode ?? null,
            title: redactSecrets(String(task.title ?? ''), 240), status: task.status,
            result: task.result == null ? null : redactSecrets(boundedResult(task.result), 4000),
            blockerReason: task.blockerReason ? redactSecrets(task.blockerReason, 1000) : null,
            startedAt: task.startedAt ?? null,
            completedAt: task.completedAt ?? null,
            executionDurationMs: taskExecutionDurationMs(task, d.clock),
            createdBy: creator ? Object.freeze({ id: creator.id, name: redactSecrets(creator.name, 120), role: creator.role }) : null,
            manager: manager ? Object.freeze({ id: manager.id, name: redactSecrets(manager.name, 120), role: manager.role }) : null,
            project: project ? Object.freeze({ id: project.id, name: redactSecrets(project.name, 160) }) : null,
            objective: objective ? Object.freeze({ id: objective.id, title: redactSecrets(objective.title, 200) }) : null,
            assignee: assignee ? Object.freeze({ id: assignee.id, name: redactSecrets(assignee.name, 120), role: assignee.role }) : null }),
        usage: d.usageRepository.summarizeByTask(task.id),
        debugging: Object.freeze(debugging),
        audit: Object.freeze(audits) });
    } });
}

function isSafeEvidence(value) {
    if (typeof value === 'string') return value.length <= 2000;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || value === null) return true;
    return Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === 'string' && item.length <= 240);
}

function redactEvidence(value) {
    if (typeof value === 'string') return redactSecrets(value, 2000);
    if (Array.isArray(value)) return Object.freeze(value.map((item) => redactSecrets(item, 240)));
    return value;
}

function boundedResult(value) {
    let text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value); }
    catch { text = '[result unavailable]'; }
    return typeof text === 'string' ? text.slice(0, 4000) : '[result unavailable]';
}

function taskExecutionDurationMs(task, clock) {
    if (task.startedAt == null || task.startedAt === '') return null;
    const start = timestampMs(task.startedAt);
    let end;
    try {
        const now = task.completedAt ? task.completedAt : clock.now();
        end = timestampMs(now);
    } catch { return null; }
    const duration = end - start;
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && duration >= 0 ? duration : null;
}

function timestampMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Date.parse(value);
    return Number.NaN;
}
