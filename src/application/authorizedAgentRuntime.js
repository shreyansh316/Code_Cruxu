import { TaskStatus } from '../constants';
import { createAgentRequest, createAgentResponse } from '../agents';
import { assertTaskAssignment, createEntityId, DomainInvariantError, isAgentAvailable } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Execute an agent adapter only after persisted identity, task ownership, and hierarchy checks. */
export function createAuthorizedAgentRuntime({
    agentRepository, taskRepository, hierarchyProvider, adapter, clock, idFactory, memoryContextProvider, taskToolsProvider,
} = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof hierarchyProvider?.getSnapshot !== 'function' || typeof adapter?.execute !== 'function'
        || typeof clock?.now !== 'function' || typeof idFactory !== 'function'
        || (taskToolsProvider !== undefined && typeof taskToolsProvider?.forTask !== 'function')) {
        throw new TypeError('Authorized agent runtime requires identity, task, hierarchy, adapter, clock, and ID ports.');
    }
    return createUseCase({
        name: 'authorized-agent-runtime',
        dependencies: { agentRepository, taskRepository, hierarchyProvider, adapter, clock, idFactory,
            memoryContextProvider, taskToolsProvider },
        execute: async ({ input, dependencies }) => {
            if (!input || typeof input.agentId !== 'string' || typeof input.taskId !== 'string'
                || !isAbortSignal(input.signal)) {
                throw new DomainInvariantError('invalid-agent-request', 'Agent execution requires task and identity identifiers plus an AbortSignal.');
            }
            const agent = dependencies.agentRepository.getById(input.agentId);
            if (!agent) throw new ApplicationError('agent-not-found', 'The requested agent does not exist.');
            if (!isAgentAvailable(agent)) {
                throw new DomainInvariantError('agent-unavailable', 'The requested agent is not available for execution.');
            }
            const task = dependencies.taskRepository.getById(input.taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The requested task does not exist.');
            if (task.status !== TaskStatus.IN_PROGRESS) {
                throw new DomainInvariantError('invalid-task-transition', 'Agents may execute only tasks in progress.');
            }
            if (task.assigneeId !== agent.id) {
                throw new DomainInvariantError('unauthorized-agent-task', 'An agent may execute only its own assigned task.');
            }
            assertTaskAssignment({ creatorId: task.creatorId, assigneeId: agent.id,
                requiredCapabilities: task.requiredCapabilities },
                dependencies.hierarchyProvider.getSnapshot());
            const requestedAt = timestamp(dependencies.clock.now());
            const remainingTimeBudgetMs = remainingTaskTimeBudget(task, requestedAt);
            const executionTask = remainingTimeBudgetMs === task.timeBudgetMs ? task
                : { ...task, timeBudgetMs: remainingTimeBudgetMs };
            const memoryContext = dependencies.memoryContextProvider?.forTask({ actor: agent, task });
            const request = createAgentRequest({ requestId: createEntityId(dependencies.idFactory()),
                agent, task: executionTask, requestedAt, memoryContext });
            if (input.signal.aborted) {
                return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
            }
            let tools;
            try {
                const scoped = await resolveTaskTools(dependencies.taskToolsProvider, agent, task, input.signal);
                if (scoped.kind === 'cancelled') {
                    return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
                }
                if (scoped.kind === 'error') throw scoped.error;
                tools = scoped.value;
                if (tools !== undefined && !isTaskToolScope(tools)) throw new TypeError('Task tool scope is malformed.');
            }
            catch {
                return createAgentResponse({ request, outcome: 'FAILED', errorCode: 'task-tool-scope-failed',
                    completedAt: timestamp(dependencies.clock.now()) });
            }
            if (input.signal.aborted) {
                return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
            }
            if (dependencies.taskToolsProvider && !isPersistedAuthorizationCurrent(dependencies, agent.id, task.id)) {
                return createAgentResponse({ request, outcome: 'FAILED', errorCode: 'task-authorization-changed',
                    completedAt: timestamp(dependencies.clock.now()) });
            }
            try {
                const execution = await executeWithTaskDeadline(dependencies.adapter, request, input.signal,
                    remainingTimeBudgetMs, tools);
                if (execution.kind === 'cancelled') {
                    return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
                }
                if (execution.kind === 'timeout') {
                    return createAgentResponse({ request, outcome: 'FAILED', errorCode: 'task-time-budget-exceeded',
                        completedAt: timestamp(dependencies.clock.now()) });
                }
                if (execution.kind === 'error') throw execution.error;
                return createAgentResponse({ request, outcome: 'SUCCEEDED', result: execution.value,
                    completedAt: timestamp(dependencies.clock.now()) });
            }
            catch (error) {
                if (input.signal.aborted) {
                    return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
                }
                const errorCode = error?.code && /^[a-z][a-z0-9.-]{0,63}$/.test(error.code)
                    ? error.code : 'agent-execution-failed';
                return createAgentResponse({ request, outcome: 'FAILED', errorCode,
                    completedAt: timestamp(dependencies.clock.now()) });
            }
        },
    });
}

async function resolveTaskTools(provider, actor, task, signal) {
    if (!provider) return { kind: 'success', value: undefined };
    if (signal.aborted) return { kind: 'cancelled' };
    let onAbort;
    const operation = Promise.resolve().then(() => provider.forTask({ actor, task }))
        .then((value) => ({ kind: 'success', value }), (error) => ({ kind: 'error', error }));
    const cancellation = new Promise((resolve) => {
        onAbort = () => resolve({ kind: 'cancelled' });
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([operation, cancellation]); }
    finally { signal.removeEventListener('abort', onAbort); }
}

function isPersistedAuthorizationCurrent(dependencies, agentId, taskId) {
    try {
        const agent = dependencies.agentRepository.getById(agentId);
        const task = dependencies.taskRepository.getById(taskId);
        if (!agent || !isAgentAvailable(agent) || !task || task.status !== TaskStatus.IN_PROGRESS
            || task.assigneeId !== agent.id) return false;
        assertTaskAssignment({ creatorId: task.creatorId, assigneeId: agent.id,
            requiredCapabilities: task.requiredCapabilities }, dependencies.hierarchyProvider.getSnapshot());
        return true;
    }
    catch { return false; }
}

function remainingTaskTimeBudget(task, now) {
    if (task.timeBudgetMs == null) return task.timeBudgetMs;
    if (task.timeBudgetMs === 0 || task.startedAt == null) return task.timeBudgetMs;
    const startedAt = Date.parse(task.startedAt);
    const currentTime = Date.parse(now);
    if (!Number.isFinite(startedAt) || !Number.isFinite(currentTime)) return 0;
    const elapsedMs = Math.max(0, currentTime - startedAt);
    return Math.max(0, task.timeBudgetMs - elapsedMs);
}

/** Enforce the persisted task deadline even when an adapter ignores AbortSignal. */
async function executeWithTaskDeadline(adapter, request, parentSignal, timeBudgetMs, tools) {
    if (timeBudgetMs === 0) return { kind: 'timeout' };
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal.aborted) return { kind: 'cancelled' };
    parentSignal.addEventListener('abort', abortFromParent, { once: true });
    let timer;
    let onAbort;
    try {
        const operation = Promise.resolve().then(() => adapter.execute(request, {
            signal: controller.signal, ...(tools ? { tools: freezeTaskToolScope(tools, controller.signal) } : {}),
        }))
            .then((value) => ({ kind: 'success', value }), (error) => ({ kind: 'error', error }));
        const cancellation = new Promise((resolve) => {
            onAbort = () => resolve({ kind: 'cancelled' });
            if (parentSignal.aborted) onAbort();
            else parentSignal.addEventListener('abort', onAbort, { once: true });
        });
        const alternatives = [operation, cancellation];
        if (Number.isSafeInteger(timeBudgetMs)) {
            alternatives.push(new Promise((resolve) => {
                timer = setTimeout(() => {
                    controller.abort();
                    resolve({ kind: 'timeout' });
                }, timeBudgetMs);
            }));
        }
        const outcome = await Promise.race(alternatives);
        if (parentSignal.aborted) return { kind: 'cancelled' };
        return outcome;
    }
    finally {
        if (timer !== undefined) clearTimeout(timer);
        parentSignal.removeEventListener('abort', abortFromParent);
        if (onAbort) parentSignal.removeEventListener('abort', onAbort);
    }
}

function isTaskToolScope(value) {
    return value !== null && typeof value === 'object'
        && typeof value.filesystem?.readFile === 'function'
        && typeof value.filesystem?.writeFile === 'function'
        && typeof value.process?.execute === 'function';
}

function freezeTaskToolScope(value, signal) {
    const bindSignal = (operation) => (...args) => {
        if (signal.aborted) return Promise.reject(new DomainInvariantError('task-execution-cancelled',
            'The task was cancelled before the filesystem operation began.'));
        const optionsIndex = args.length - 1;
        if (optionsIndex >= 0 && args[optionsIndex] && typeof args[optionsIndex] === 'object'
            && !Array.isArray(args[optionsIndex])) {
            args[optionsIndex] = { ...args[optionsIndex], signal };
        }
        else args.push({ signal });
        return operation(...args);
    };
    const filesystem = {
        readFile: bindSignal(value.filesystem.readFile),
        writeFile: bindSignal(value.filesystem.writeFile),
    };
    for (const operation of ['createFile', 'deleteFile', 'renameFile']) {
        if (typeof value.filesystem[operation] === 'function') filesystem[operation] = bindSignal(value.filesystem[operation]);
    }
    return Object.freeze({ filesystem: Object.freeze(filesystem),
        process: Object.freeze({ execute: (request = {}) => value.process.execute({ ...request, signal }) }) });
}

function timestamp(value) {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}

function isAbortSignal(value) {
    return typeof AbortSignal !== 'undefined' && value instanceof AbortSignal;
}
