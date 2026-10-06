import { DomainInvariantError } from '../domain/errors';
import { createEntityId } from '../domain/values';

/** Adapt scheduler task records to the persisted-identity agent runtime contract. */
export function createAuthorizedTaskExecutor({ agentRuntime } = {}) {
    if (typeof agentRuntime?.run !== 'function') {
        throw new TypeError('An authorized agent runtime is required.');
    }
    return Object.freeze({
        async execute({ task, signal } = {}) {
            if (!task || typeof task !== 'object' || !isAbortSignal(signal)) {
                throw new DomainInvariantError('invalid-agent-request', 'Scheduled agent execution requires a task and native cancellation signal.');
            }
            const taskId = createEntityId(task.id);
            const agentId = createEntityId(task.assigneeId);
            const outcome = await agentRuntime.run({ taskId, agentId, signal });
            if (!outcome?.ok || !outcome.value || typeof outcome.value !== 'object') {
                const error = new DomainInvariantError(outcome?.error?.code ?? 'agent-execution-failed',
                    'The authorized employee runtime rejected or failed this task.');
                throw error;
            }
            const response = outcome.value;
            if (response.taskId !== taskId || response.agentId !== agentId
                || !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(response.outcome)) {
                throw new DomainInvariantError('invalid-agent-response', 'Employee response identity does not match the scheduled task.');
            }
            if (response.outcome === 'CANCELLED') {
                if (signal.aborted) return undefined;
                throw new DomainInvariantError('agent-execution-cancelled', 'The employee cancelled without a task cancellation request.');
            }
            if (response.outcome === 'FAILED') {
                throw new DomainInvariantError(response.errorCode ?? 'agent-execution-failed',
                    'The authorized employee could not complete this task.');
            }
            if (!response.result || typeof response.result !== 'object') {
                throw new DomainInvariantError('invalid-agent-response', 'Successful employee responses require a validated task result.');
            }
            return response.result;
        },
    });
}

function isAbortSignal(value) {
    return typeof AbortSignal !== 'undefined' && value instanceof AbortSignal;
}
