import { requireAssignedInProgressTask } from './authorizedTaskAccess';
import { TaskStatus } from '../constants';
import { DomainInvariantError, validateTaskResult } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Gate an employee's claimed completion on actual captured verification check results. */
export function createEmployeeResultVerificationUseCase({ taskRepository, verificationPipeline } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof verificationPipeline?.run !== 'function') {
        throw new TypeError('Employee result verification requires task and verification pipeline ports.');
    }
    return createUseCase({ name: 'employee-result-verification', dependencies: { taskRepository, verificationPipeline },
        execute: async ({ input, dependencies }) => {
            if (typeof input?.taskId !== 'string' || typeof input?.agentId !== 'string'
                || !input.signal || typeof input.signal.aborted !== 'boolean') {
                throw new DomainInvariantError('invalid-employee-verification', 'Verification requires task, employee, and cancellation identifiers.');
            }
            const task = requireAssignedInProgressTask({ taskRepository: dependencies.taskRepository,
                taskId: input.taskId, agentId: input.agentId,
                assigneeMessage: 'Only the assigned employee may request result verification.',
                statusMessage: 'Only an in-progress task can be verified.' });
            const result = validateTaskResult(input.result, task.acceptanceCriteria).result;
            const verification = await dependencies.verificationPipeline.run({ signal: input.signal });
            if (!verification || !Array.isArray(verification.results)) {
                throw new DomainInvariantError('invalid-verification-result', 'Verification pipeline returned malformed check evidence.');
            }
            const checks = verification.results.map((check) => {
                if (!check || typeof check.id !== 'string' || !['PASSED', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(check.status)) {
                    throw new DomainInvariantError('invalid-verification-result', 'Verification pipeline returned malformed check evidence.');
                }
                return Object.freeze({ id: check.id, status: check.status, exitCode: check.exitCode ?? null,
                    outputTruncated: check.outputTruncated === true });
            });
            const passed = verification.passed === true && checks.length > 0 && checks.every(({ status }) => status === 'PASSED');
            return Object.freeze({ taskId: task.id, agentId: input.agentId, status: passed ? 'VERIFIED' : 'BLOCKED',
                eligibleForReview: passed, result, checks: Object.freeze(checks) });
        },
    });
}
