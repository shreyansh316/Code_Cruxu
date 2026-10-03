import { createUseCase } from './useCase';

const MAX_PARALLEL_LIMIT = 10;

/** Run queued work up to a strict concurrency bound and honor pause/cancel controls. */
export function createTaskScheduler({ queueWorkflow, queueRepository, executor, executionControl, parallelLimit } = {}) {
    if (typeof queueWorkflow?.run !== 'function' || typeof queueRepository?.transition !== 'function'
        || typeof executor?.execute !== 'function' || typeof executionControl?.status !== 'string'
        || typeof executionControl?.pause !== 'function' || typeof executionControl?.resume !== 'function'
        || typeof executionControl?.cancel !== 'function' || !Number.isInteger(parallelLimit)
        || parallelLimit < 1 || parallelLimit > MAX_PARALLEL_LIMIT) {
        throw new TypeError(`Task scheduler requires queue ports, execution control, and parallelLimit from 1 to ${MAX_PARALLEL_LIMIT}.`);
    }
    const active = new Map();
    const workflow = createUseCase({
        name: 'task-scheduler',
        dependencies: { queueWorkflow, queueRepository, executor, executionControl, parallelLimit, active },
        execute: async ({ dependencies }) => {
            if (dependencies.executionControl.status !== 'RUNNING') {
                return { started: [], activeCount: active.size, status: dependencies.executionControl.status };
            }
            const snapshot = await dependencies.queueWorkflow.run();
            if (!snapshot?.ok) throw new Error('Ready task selection failed.');
            const capacity = Math.max(0, dependencies.parallelLimit - active.size);
            const jobs = [];
            for (const candidate of snapshot.value.ready.slice(0, capacity)) {
                if (dependencies.executionControl.status !== 'RUNNING') break;
                const taskId = candidate.task.id;
                if (active.has(taskId)) continue;
                const claimed = dependencies.queueRepository.transition(taskId, 'QUEUED', 'CLAIMED');
                if (!claimed) continue;
                const controller = new AbortController();
                active.set(taskId, controller);
                jobs.push(runClaimed(candidate, controller, dependencies));
            }
            const settled = await Promise.all(jobs);
            return { started: settled, activeCount: active.size, status: dependencies.executionControl.status };
        },
    });

    async function runClaimed(candidate, controller, dependencies) {
        const taskId = candidate.task.id;
        try {
            const outcome = await waitForExecutionOrCancellation(
                () => dependencies.executor.execute({ task: candidate.task, signal: controller.signal }), controller.signal);
            if (outcome.kind === 'cancelled') {
                dependencies.queueRepository.transition(taskId, 'CLAIMED', 'CANCELLED');
                return { taskId, status: 'CANCELLED' };
            }
            if (outcome.kind === 'error') throw outcome.error;
            const cancelled = controller.signal.aborted || dependencies.executionControl.status === 'CANCELLED';
            dependencies.queueRepository.transition(taskId, 'CLAIMED', cancelled ? 'CANCELLED' : 'COMPLETED');
            return { taskId, status: cancelled ? 'CANCELLED' : 'SUCCEEDED', value: cancelled ? undefined : outcome.value };
        }
        catch (error) {
            const cancelled = controller.signal.aborted || dependencies.executionControl.status === 'CANCELLED';
            dependencies.queueRepository.transition(taskId, 'CLAIMED', cancelled ? 'CANCELLED' : 'QUEUED');
            return { taskId, status: cancelled ? 'CANCELLED' : 'FAILED' };
        }
        finally {
            active.delete(taskId);
        }
    }

    return Object.freeze({
        run: (input) => workflow.run(input),
        pause: () => executionControl.pause(),
        resume: () => executionControl.resume(),
        cancel: () => {
            const outcome = executionControl.cancel();
            for (const controller of active.values()) controller.abort();
            return outcome;
        },
        get activeCount() { return active.size; },
        get status() { return executionControl.status; },
    });
}

function waitForExecutionOrCancellation(execute, signal) {
    if (signal.aborted) return Promise.resolve({ kind: 'cancelled' });
    const execution = Promise.resolve().then(async () => {
        if (signal.aborted) return { kind: 'cancelled' };
        try { return { kind: 'success', value: await execute() }; }
        catch (error) { return { kind: 'error', error }; }
    });
    let onAbort;
    const cancellation = new Promise((resolve) => {
        onAbort = () => resolve({ kind: 'cancelled' });
        signal.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.race([execution, cancellation]).finally(() => signal.removeEventListener('abort', onAbort));
}
