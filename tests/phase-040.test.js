/** Phase 040 — bounded parallel task scheduling and execution controls. */
import { describe, expect, it } from 'vitest';
import { createTaskScheduler } from '../src/application';
import { ExecutionControl } from '../src/domain';

function makeCandidates(count) {
    return Array.from({ length: count }, (_, index) => ({ queue: { id: `queue-${index + 1}` },
        task: { id: `task-${index + 1}` } }));
}

function makeHarness({ count = 5, parallelLimit = 2, execute, control = new ExecutionControl() } = {}) {
    const candidates = makeCandidates(count);
    const states = new Map(candidates.map(({ task }) => [task.id, 'QUEUED']));
    const queueRepository = { transition(taskId, expected, next) {
        if (states.get(taskId) !== expected) return null;
        states.set(taskId, next);
        return { taskId, state: next };
    } };
    const executor = { execute: execute ?? (async ({ task }) => task.id) };
    const scheduler = createTaskScheduler({
        queueWorkflow: { run: async () => ({ ok: true, value: { ready: candidates.filter(({ task }) => states.get(task.id) === 'QUEUED') } }) },
        queueRepository, executor, executionControl: control, parallelLimit,
    });
    return { scheduler, states, candidates };
}

describe('Phase 040 — bounded task scheduler', () => {
    it('never starts more work than the configured parallel limit', async () => {
        let active = 0;
        let maximumActive = 0;
        let resolveTwoStarted;
        const twoStarted = new Promise((resolve) => { resolveTwoStarted = resolve; });
        const releases = [];
        let startedCount = 0;
        const { scheduler, states } = makeHarness({ parallelLimit: 2, execute: ({ task }) => {
            active += 1;
            startedCount += 1;
            maximumActive = Math.max(maximumActive, active);
            if (startedCount === 2) resolveTwoStarted();
            return new Promise((resolve) => releases.push(() => { active -= 1; resolve(task.id); }));
        } });
        const running = scheduler.run();
        await twoStarted;
        expect(scheduler.activeCount).toBe(2);
        expect(maximumActive).toBe(2);
        releases.splice(0).forEach((release) => release());
        const outcome = await running;
        expect(outcome.value.started).toHaveLength(2);
        expect([...states.values()].filter((state) => state === 'QUEUED')).toHaveLength(3);
    });

    it('does not launch work while paused and resumes scheduling when resumed', async () => {
        const { scheduler, states } = makeHarness({ count: 1 });
        scheduler.pause();
        expect((await scheduler.run()).value).toMatchObject({ started: [], status: 'PAUSED' });
        expect(states.get('task-1')).toBe('QUEUED');
        scheduler.resume();
        const resumed = await scheduler.run();
        expect(resumed.value.started).toMatchObject([{ taskId: 'task-1', status: 'SUCCEEDED' }]);
        expect(states.get('task-1')).toBe('COMPLETED');
    });

    it('aborts active work and marks it cancelled when cancellation is requested', async () => {
        let resolveStarted;
        const started = new Promise((resolve) => { resolveStarted = resolve; });
        const { scheduler, states } = makeHarness({ count: 1, execute: ({ signal }) => {
            resolveStarted();
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        } });
        const running = scheduler.run();
        await started;
        expect(scheduler.cancel().status).toBe('CANCELLED');
        const outcome = await running;
        expect(outcome.value.started).toMatchObject([{ taskId: 'task-1', status: 'CANCELLED' }]);
        expect(states.get('task-1')).toBe('CANCELLED');
        expect(scheduler.resume().status).toBe('CANCELLED');
    });

    it('requeues failed executions for a later explicit scheduling attempt', async () => {
        const { scheduler, states } = makeHarness({ count: 1, execute: async () => { throw new Error('execution failed'); } });
        const outcome = await scheduler.run();
        expect(outcome.value.started).toMatchObject([{ taskId: 'task-1', status: 'FAILED' }]);
        expect(states.get('task-1')).toBe('QUEUED');
    });

    it('rejects limits outside the configured bound', () => {
        expect(() => createTaskScheduler({ queueWorkflow: { run: () => undefined },
            queueRepository: { transition: () => undefined }, executor: { execute: () => undefined },
            executionControl: new ExecutionControl(), parallelLimit: 11 })).toThrow(/parallelLimit/);
    });
});
