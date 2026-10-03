import { TaskStatus } from '../constants';
import { createAgentRequest, createAgentResponse } from '../agents';
import { assertTaskAssignment, createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Execute an agent adapter only after persisted identity, task ownership, and hierarchy checks. */
export function createAuthorizedAgentRuntime({
    agentRepository, taskRepository, hierarchyProvider, adapter, clock, idFactory,
} = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof hierarchyProvider?.getSnapshot !== 'function' || typeof adapter?.execute !== 'function'
        || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Authorized agent runtime requires identity, task, hierarchy, adapter, clock, and ID ports.');
    }
    return createUseCase({
        name: 'authorized-agent-runtime',
        dependencies: { agentRepository, taskRepository, hierarchyProvider, adapter, clock, idFactory },
        execute: async ({ input, dependencies }) => {
            if (!input || typeof input.agentId !== 'string' || typeof input.taskId !== 'string'
                || !input.signal || typeof input.signal.aborted !== 'boolean'
                || typeof input.signal.addEventListener !== 'function') {
                throw new DomainInvariantError('invalid-agent-request', 'Agent execution requires task and identity identifiers plus an AbortSignal.');
            }
            const agent = dependencies.agentRepository.getById(input.agentId);
            if (!agent) throw new ApplicationError('agent-not-found', 'The requested agent does not exist.');
            if (['OFFLINE', 'ERROR'].includes(agent.status)) {
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
            assertTaskAssignment({ creatorId: task.creatorId, assigneeId: agent.id },
                dependencies.hierarchyProvider.getSnapshot());
            const requestedAt = timestamp(dependencies.clock.now());
            const request = createAgentRequest({ requestId: createEntityId(dependencies.idFactory()),
                agent, task, requestedAt });
            if (input.signal.aborted) {
                return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
            }
            try {
                const result = await dependencies.adapter.execute(request, { signal: input.signal });
                if (input.signal.aborted) {
                    return createAgentResponse({ request, outcome: 'CANCELLED', completedAt: timestamp(dependencies.clock.now()) });
                }
                return createAgentResponse({ request, outcome: 'SUCCEEDED', result,
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

function timestamp(value) {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}
