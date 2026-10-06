import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError, validateTaskAcceptanceCriteria, validateTaskResult } from '../domain';

const MAX_TASK_TEXT_LENGTH = 10_000;
const MAX_CRITERIA_COUNT = 100;
const MAX_REQUEST_BYTES = 64_000;

/** @typedef {{ id: string, role: string, capabilities: Array<string> }} AgentIdentity */
/** @typedef {{ id: string, title: string, description: (string|null), acceptanceCriteria: Array<object>, requiredCapabilities: Array<string>, tokenBudget: (number|null), timeBudgetMs: (number|null), retryCount: number, maxRetries: number, executionRetryReason?: (string|null) }} AgentTaskContext */
/** @typedef {{ requestId: string, agent: AgentIdentity, task: AgentTaskContext, requestedAt: string }} AgentRequest */
/** @typedef {{ requestId: string, agentId: string, agentRole: string, taskId: string, outcome: 'SUCCEEDED'|'FAILED'|'CANCELLED', completedAt: string, result?: object, errorCode?: string }} AgentResponse */

/** Construct the minimal immutable task packet from repository-owned identity and task data. */
export function createAgentRequest({ requestId, agent, task, requestedAt, memoryContext } = {}) {
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
    const agentCapabilities = normalizeCapabilities(agent.capabilities ?? [], 'Agent capabilities');
    const requiredCapabilities = normalizeCapabilities(task.requiredCapabilities ?? [], 'Task required capabilities');
    if (task.executionRetryReason !== undefined && task.executionRetryReason !== null
        && (typeof task.executionRetryReason !== 'string'
        || !/^[a-z][a-z0-9.-]{0,63}$/.test(task.executionRetryReason))) {
        invalid('Execution retry context must use a stable failure code.');
    }
    if (requiredCapabilities.some((required) => !agentCapabilities.some((available) =>
        available.toLocaleLowerCase('en-US') === required.toLocaleLowerCase('en-US')))) {
        invalid('The executing agent does not hold every required task capability.');
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
        requiredCapabilities,
        tokenBudget: task.tokenBudget ?? null, timeBudgetMs: task.timeBudgetMs ?? null,
        retryCount: task.retryCount, maxRetries: task.maxRetries,
        ...(task.executionRetryReason ? { executionRetryReason: task.executionRetryReason } : {}),
    });
    if (new TextEncoder().encode(JSON.stringify(frozenTask)).byteLength > MAX_REQUEST_BYTES) {
        invalid(`Agent task context cannot exceed ${MAX_REQUEST_BYTES} bytes.`);
    }
    const request = { requestId, agent: Object.freeze({ id: agentId, role: agent.role, capabilities: agentCapabilities }),
        task: frozenTask, requestedAt };
    if (memoryContext !== undefined) request.memoryContext = validateMemoryContext(memoryContext);
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_REQUEST_BYTES) {
        invalid(`Agent request cannot exceed ${MAX_REQUEST_BYTES} bytes.`);
    }
    return Object.freeze(request);
}

function normalizeCapabilities(value, label) {
    if (!Array.isArray(value) || value.length > 32
        || value.some((capability) => typeof capability !== 'string' || !capability.trim() || capability.trim().length > 100)) {
        invalid(`${label} must contain at most 32 bounded labels.`);
    }
    const normalized = value.map((capability) => capability.trim());
    if (new Set(normalized.map((capability) => capability.toLocaleLowerCase('en-US'))).size !== normalized.length) {
        invalid(`${label} cannot contain duplicates.`);
    }
    return Object.freeze(normalized);
}

function validateMemoryContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some((key) => !['employee', 'task'].includes(key))
        || !Array.isArray(value.employee) || !Array.isArray(value.task)
        || value.employee.length > 6 || value.task.length > 6) invalid('Agent memory context is malformed or exceeds its bounds.');
    const groups = {};
    for (const group of ['employee', 'task']) {
        groups[group] = Object.freeze(value[group].map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)
                || Object.keys(item).some((key) => !['id', 'title', 'category', 'content', 'verified', 'sourceKind',
                    'sourceReference', 'verifiedByAgentId', 'verifiedAt', 'verificationNote'].includes(key))) {
                invalid('Agent memory records must use the bounded context schema.');
            }
            const id = requireId(item.id, 'Memory id');
            if (typeof item.title !== 'string' || item.title.length > 500
                || (item.category !== null && typeof item.category !== 'string')
                || (typeof item.category === 'string' && item.category.length > 100)
                || typeof item.content !== 'string' || item.content.length > 3000
                || typeof item.verified !== 'boolean') invalid('Agent memory fields are invalid or exceed their bounds.');
            const result = { id, title: item.title, category: item.category, content: item.content, verified: item.verified };
            if (item.sourceKind !== undefined) {
                if (!['LEGACY', 'USER_NOTE', 'OBSERVATION', 'TASK_RESULT', 'REVIEW_FINDING', 'DECISION_RECORD', 'TEST_RESULT', 'AI_GENERATED'].includes(item.sourceKind)) {
                    invalid('Agent memory source kind is unsupported.');
                }
                result.sourceKind = item.sourceKind;
            }
            for (const [key, maxLength] of [['sourceReference', 300], ['verifiedByAgentId', 200], ['verifiedAt', 24], ['verificationNote', 500]]) {
                if (item[key] !== undefined && item[key] !== null
                    && (typeof item[key] !== 'string' || item[key].length > maxLength)) invalid(`Agent memory ${key} is invalid or exceeds its bound.`);
                if (item[key] !== undefined) result[key] = item[key];
            }
            return Object.freeze(result);
        }));
    }
    return Object.freeze(groups);
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
