/** Phase 326 — bridge scheduled work to the repository-authorized employee runtime. */
import { describe, expect, it, vi } from 'vitest';
import { createAuthorizedTaskExecutor } from '../src/application/authorizedTaskExecutor';

const task = { id: 'task-326', assigneeId: 'employee-326' };
const result = Object.freeze({ summary: 'Reviewed the assigned task.', acceptanceCriteria: Object.freeze([]) });
const response = (overrides = {}) => ({ taskId: task.id, agentId: task.assigneeId, outcome: 'SUCCEEDED', result, ...overrides });

describe('Phase 326 — authorized scheduler/runtime composition', () => {
    it('derives runtime identity only from the scheduled persisted task and returns its validated result', async () => {
        const runtime = { run: vi.fn(async () => ({ ok: true, value: response() })) };
        const executor = createAuthorizedTaskExecutor({ agentRuntime: runtime });
        const signal = new AbortController().signal;
        await expect(executor.execute({ task, signal })).resolves.toBe(result);
        expect(runtime.run).toHaveBeenCalledOnce();
        expect(runtime.run).toHaveBeenCalledWith({ taskId: task.id, agentId: task.assigneeId, signal });
    });

    it('rejects a forged or mismatched runtime identity response', async () => {
        const executor = createAuthorizedTaskExecutor({ agentRuntime: { run: async () => ({ ok: true,
            value: response({ agentId: 'other-employee-326' }) }) } });
        await expect(executor.execute({ task, signal: new AbortController().signal }))
            .rejects.toMatchObject({ code: 'invalid-agent-response' });
    });

    it('does not convert employee failure or unsolicited cancellation into success', async () => {
        const failed = createAuthorizedTaskExecutor({ agentRuntime: { run: async () => ({ ok: true,
            value: response({ outcome: 'FAILED', errorCode: 'provider-timeout', result: undefined }) }) } });
        await expect(failed.execute({ task, signal: new AbortController().signal }))
            .rejects.toMatchObject({ code: 'provider-timeout' });
        const cancelled = createAuthorizedTaskExecutor({ agentRuntime: { run: async () => ({ ok: true,
            value: response({ outcome: 'CANCELLED', result: undefined }) }) } });
        await expect(cancelled.execute({ task, signal: new AbortController().signal }))
            .rejects.toMatchObject({ code: 'agent-execution-cancelled' });
    });

    it('requires native cancellation and a result matching the scheduled task', async () => {
        const executor = createAuthorizedTaskExecutor({ agentRuntime: { run: async () => ({ ok: true, value: response() }) } });
        await expect(executor.execute({ task, signal: { aborted: false, addEventListener() {} } }))
            .rejects.toMatchObject({ code: 'invalid-agent-request' });
    });
});
