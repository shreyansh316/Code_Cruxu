/** Phase 329 — keep stable failure codes in scheduler results without leaking error text. */
import { describe, expect, it } from 'vitest';
import { createTaskScheduler } from '../src/application';
import { ExecutionControl } from '../src/domain';

async function runWithError(error) {
    const task = { id: 'task-329' };
    let state = 'QUEUED';
    const scheduler = createTaskScheduler({ queueWorkflow: { run: async () => ({ ok: true,
        value: { ready: [{ task }] } }) },
    queueRepository: { transition(_taskId, expected, next) {
        if (state !== expected) return undefined;
        state = next;
        return { taskId: task.id, state };
    } }, executor: { execute: async () => { throw error; } },
    executionControl: new ExecutionControl(), parallelLimit: 1 });
    return scheduler.run();
}

describe('Phase 329 — bounded execution failure reporting', () => {
    it('keeps a validated stable error code and excludes the private error message', async () => {
        const result = await runWithError(Object.assign(new Error('api_key=private-value'), { code: 'provider-timeout' }));
        expect(result.value.started[0]).toEqual({ taskId: 'task-329', status: 'FAILED', errorCode: 'provider-timeout' });
        expect(JSON.stringify(result)).not.toContain('private-value');
    });

    it('replaces malformed error codes with a stable generic code', async () => {
        const result = await runWithError(Object.assign(new Error('private failure'), { code: 'secret value' }));
        expect(result.value.started[0]).toEqual({ taskId: 'task-329', status: 'FAILED', errorCode: 'task-execution-failed' });
        expect(JSON.stringify(result)).not.toContain('private failure');
    });

    it('contains hostile error accessors without leaving the queue claim unsettled', async () => {
        const hostile = new Proxy({}, { get() { throw new Error('hostile getter'); } });
        const result = await runWithError(hostile);
        expect(result.value.started[0]).toEqual({ taskId: 'task-329', status: 'FAILED', errorCode: 'task-execution-failed' });
    });
});
