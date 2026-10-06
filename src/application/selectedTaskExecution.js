import { DomainInvariantError } from '../domain/errors';
import { createAuthorizedTaskExecutor } from './authorizedTaskExecutor';
import { createTaskScheduler } from './taskScheduler';

/** Run exactly one selected persisted task through queue, lifecycle, authorization, result submission, and recovery. */
export function createSelectedTaskExecution({ taskId, queueWorkflow, queueRepository, agentRuntime, taskLifecycle,
    resultSubmissionUseCase, executionFailureRecovery, taskRepository, executionControl, parallelLimit = 1 } = {}) {
    if (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 128
        || typeof queueWorkflow?.run !== 'function' || typeof queueRepository?.transition !== 'function'
        || typeof agentRuntime?.run !== 'function' || typeof taskLifecycle?.onStart !== 'function'
        || typeof taskLifecycle?.cancel !== 'function' || typeof resultSubmissionUseCase?.run !== 'function'
        || typeof executionFailureRecovery?.run !== 'function' || typeof taskRepository?.getById !== 'function') {
        throw new TypeError('Selected task execution requires queue, authorized runtime, lifecycle, result, and recovery ports.');
    }
    const executor = createAuthorizedTaskExecutor({ agentRuntime });
    const reportingExecutor = Object.freeze({
        async execute(request) {
            const result = await executor.execute(request);
            const submitted = await resultSubmissionUseCase.run({ taskId: request.task.id,
                agentId: request.task.assigneeId, result });
            if (!submitted?.ok) {
                const error = new DomainInvariantError(submitted?.error?.code ?? 'task-result-submission-failed',
                    'The task result was not accepted by the result workflow.');
                throw error;
            }
            return submitted.value.result;
        },
    });
    const scheduler = createTaskScheduler({ queueWorkflow: { run: () => queueWorkflow.run({ taskId }) },
        queueRepository, executor: reportingExecutor, onStart: taskLifecycle.onStart,
        executionControl, parallelLimit });

    return Object.freeze({
        cancel: () => scheduler.cancel(),
        pause: () => scheduler.pause(),
        resume: () => scheduler.resume(),
        async run() {
            const scheduled = await scheduler.run();
            if (!scheduled?.ok) return scheduled;
            const attempts = [];
            for (const attempt of scheduled.value.started) {
                if (attempt.status === 'CANCELLED') {
                    const cancelled = taskLifecycle.cancel(taskId);
                    attempts.push({ taskId, status: 'CANCELLED', persisted: cancelled === true });
                    continue;
                }
                if (attempt.status === 'FAILED' && attempt.phase !== 'START') {
                    const recovered = await executionFailureRecovery.run({ taskId, errorCode: attempt.errorCode });
                    attempts.push({ ...attempt, recovery: recovered.ok ? recovered.value : { outcome: 'RECOVERY_FAILED' } });
                    continue;
                }
                attempts.push(attempt);
            }
            const task = taskRepository.getById(taskId);
            return { ok: true, value: { attempts, taskStatus: task?.status,
                schedulerStatus: scheduled.value.status } };
        },
    });
}
