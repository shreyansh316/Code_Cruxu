import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError, validateTaskAcceptanceCriteria, validateTaskResult } from '../domain';

const MAX_TASK_TEXT_LENGTH = 10_000;
const MAX_CRITERIA_COUNT = 100;
const MAX_REQUEST_BYTES = 64_000;

/** @typedef {{ id: string, role: string }} AgentIdentity */
/** @typedef {{ id: string, title: string, description: (string|null), acceptanceCriteria: Array<object>, tokenBudget: (number|null), timeBudgetMs: (number|null), retryCount: number, maxRetries: number }} AgentTaskContext */
/** @typedef {{ requestId: string, agent: AgentIdentity, task: AgentTaskContext, requestedAt: string }} AgentRequest */
/** @typedef {{ requestId: string, agentId: string, agentRole: string, taskId: string, outcome: 'SUCCEEDED'|'FAILED'|'CANCELLED', completedAt: string, result?: object, errorCode?: string }} AgentResponse */

/** Construct the minimal immutable task packet from repository-owned identity and task data. */
export function createAgentRequest({ requestId, agent, task, requestedAt } = {}) {
    requestId = requireId(requestId, 'Agent request id');
    const agentId = requireId(agent?.id, 'Agent id');
    if (!Object.values(AgentRole).includes(agent?.role)) {
        invalid('Agent requests require a repository-resolved role identity.');
    }
    const taskId = requireId(task?.id, 'Task id');
    if (typeof task.title !== 'string' || task.title.trim() === '' || task.title.length > MAX_TASK_TEXT_LENGTH
        || (task.description != null && (typeof task.description !== 'string' || task.description.length > MAX_TASK_TEXT_LENGTH))
        || !Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length < 1
        || task.acceptanceCriteria.length > MAX_CRITERIA_COUNT
        || !Number.isInteger(task.retryCount) || task.retryCount < 0
        || !Number.isInteger(task.maxRetries) || task.maxRetries < task.retryCount
        || (task.tokenBudget != null && (!Number.isSafeInteger(task.tokenBudget) || task.tokenBudget < 0))
        || (task.timeBudgetMs != null && (!Number.isSafeInteger(task.timeBudgetMs) || task.timeBudgetMs < 0))) {
        invalid('Agent task context is malformed or exceeds its bounds.');
    }
    for (const criterion of task.acceptanceCriteria) {
        if (!criterion || typeof criterion.id !== 'string' || typeof criterion.description !== 'string'
            || criterion.description.length > 2_000
            || typeof criterion.required !== 'boolean' || typeof criterion.met !== 'boolean') {
            invalid('Agent task acceptance criteria are malformed.');
        }
    }
    if (!isCanonicalTimestamp(requestedAt)) invalid('Agent request timestamp must be canonical UTC.');
    validateTaskAcceptanceCriteria(task.acceptanceCriteria);
    const frozenTask = Object.freeze({
        id: taskId, title: task.title, description: task.description ?? null,
        acceptanceCriteria: Object.freeze(task.acceptanceCriteria.map((criterion) => Object.freeze({ ...criterion }))),
        tokenBudget: task.tokenBudget ?? null, timeBudgetMs: task.timeBudgetMs ?? null,
        retryCount: task.retryCount, maxRetries: task.maxRetries,
    });
    if (new TextEncoder().encode(JSON.stringify(frozenTask)).byteLength > MAX_REQUEST_BYTES) {
        invalid(`Agent task context cannot exceed ${MAX_REQUEST_BYTES} bytes.`);
    }
    return Object.freeze({ requestId, agent: Object.freeze({ id: agentId, role: agent.role }),
        task: frozenTask, requestedAt });
}

/** Validate an adapter outcome and bind it to the originating request identity. */
export function createAgentResponse({ request, outcome, completedAt, result, errorCode } = {}) {
    if (!request || typeof request !== 'object' || !request.agent || !request.task) {
        invalid('Agent response requires its originating request.');
    }
    if (!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(outcome) || !isCanonicalTimestamp(completedAt)) {
        invalid('Agent response requires a supported outcome and canonical completion timestamp.');
    }
    const response = {
        requestId: requireId(request.requestId, 'Agent request id'),
        agentId: requireId(request.agent.id, 'Agent id'),
        agentRole: request.agent.role,
        taskId: requireId(request.task.id, 'Task id'),
        outcome, completedAt,
    };
    if (outcome === 'SUCCEEDED') {
        if (errorCode !== undefined) invalid('Successful agent responses cannot include an error code.');
        response.result = validateTaskResult(result, request.task.acceptanceCriteria).result;
    }
    else {
        if (result !== undefined) invalid('Unsuccessful agent responses cannot include a task result.');
        if (outcome === 'FAILED') {
            if (typeof errorCode !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(errorCode)) {
                invalid('Failed agent responses require a stable error code.');
            }
            response.errorCode = errorCode;
        }
    }
    return Object.freeze(response);
}

function requireId(value, label) {
    try {
        return createEntityId(value);
    }
    catch {
        invalid(`${label} must be a valid entity identifier.`);
    }
}

function isCanonicalTimestamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
        && new Date(value).toISOString() === value;
}

function invalid(message) {
    throw new DomainInvariantError('invalid-agent-contract', message);
}
