import { describe, expect, it } from 'vitest';
import { ExecutionControl } from '../src/domain';
import { createTaskScheduler } from '../src/application/taskScheduler';

describe('Phase 082 — cancellation propagation', () => {
    it('persists cancellation and releases scheduler capacity promptly when an executor is slow to stop', async () => {
        const task = { id: 'task-082' };
        const states = new Map([[task.id, 'QUEUED']]);
        const transitions = [];
        const queueRepository = { transition(taskId, expected, next) {
            if (states.get(taskId) !== expected) return null;
            states.set(taskId, next);
            transitions.push([taskId, expected, next]);
            return { taskId, state: next };
        } };
        let releaseTool;
        let receivedSignal;
        const scheduler = createTaskScheduler({
            queueWorkflow: { run: async () => ({ ok: true, value: { ready: [{ task }] } }) },
            queueRepository,
            executor: { execute: ({ signal }) => {
                receivedSignal = signal;
                return new Promise((resolve) => { releaseTool = resolve; });
            } },
            executionControl: new ExecutionControl(), parallelLimit: 1,
        });

        const run = scheduler.run();
        await viWaitFor(() => expect(receivedSignal).toBeDefined());
        expect(scheduler.cancel().status).toBe('CANCELLED');
        const result = await run;
        expect(receivedSignal.aborted).toBe(true);
        expect(result.value.started).toMatchObject([{ taskId: task.id, status: 'CANCELLED' }]);
        expect(states.get(task.id)).toBe('CANCELLED');
        expect(transitions).toEqual([[task.id, 'QUEUED', 'CLAIMED'], [task.id, 'CLAIMED', 'CANCELLED']]);
        expect(scheduler.activeCount).toBe(0);

        releaseTool('late result');
        await Promise.resolve();
        expect(transitions).toHaveLength(2);
    });

    it('settles already-aborted tasks without invoking the executor', async () => {
        const control = new ExecutionControl();
        control.cancel();
        const execute = vi.fn(async () => undefined);
        const scheduler = createTaskScheduler({ queueWorkflow: { run: async () => ({ ok: true, value: { ready: [] } }) },
            queueRepository: { transition: () => null }, executor: { execute }, executionControl: control, parallelLimit: 1 });
        expect((await scheduler.run()).value).toMatchObject({ status: 'CANCELLED', started: [] });
        expect(execute).not.toHaveBeenCalled();
    });
});

async function viWaitFor(assertion) {
    for (let index = 0; index < 20; index += 1) {
        try { assertion(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 0)); }
    }
    assertion();
}
