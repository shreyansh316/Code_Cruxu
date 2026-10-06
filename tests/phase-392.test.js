/** Phase 392 — user cancellation stops a command without recording a false test failure. */
import { describe, expect, it, vi } from 'vitest';
import { createDebuggingToolAdapter } from '../src/application';

describe('Phase 392 — cancellable debugging command', () => {
    it('stops and audits cancellation without consuming a failed-test attempt', async () => {
        const session = { id: 'session-392', taskId: 'task-392', stage: 'TEST', status: 'ACTIVE',
            filesTouched: 0, fileBudget: 3, commandsRun: 0, commandBudget: 3,
            deadlineAt: '2026-10-06T12:05:00.000Z' };
        const actor = { id: 'employee-392', role: 'EMPLOYEE', status: 'ACTIVE', lifecycleStatus: 'ACTIVE' };
        const execute = vi.fn(({ signal }) => new Promise((resolve) => {
            signal.addEventListener('abort', () => resolve({ exitCode: null, timedOut: false, aborted: true }), { once: true });
        }));
        const recordStep = vi.fn();
        const stop = vi.fn(async (input) => ({ ok: true, value: { ...session, status: 'STOPPED', stopReason: input.reason } }));
        const adapter = createDebuggingToolAdapter({ sessionRepository: { getById: () => session, listSteps: () => [] },
            taskRepository: { getById: () => ({ id: 'task-392', status: 'IN_PROGRESS', assigneeId: actor.id }) },
            agentRepository: { getById: () => actor },
            taskToolsProvider: { forTask: async () => ({ filesystem: {}, process: { execute } }) },
            debuggingWorkflow: { recordStep: { run: recordStep }, stop: { run: stop } },
            clock: { now: () => '2026-10-06T12:00:00.000Z' } });
        const controller = new AbortController();
        const pending = adapter.run({ sessionId: session.id, actorId: actor.id, command: 'node', args: ['test.js'], signal: controller.signal });
        await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
        controller.abort();
        const result = await pending;
        expect(result).toMatchObject({ ok: true, value: { session: { status: 'STOPPED' }, action: { outcome: 'CANCELLED' } } });
        expect(stop).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id, actorId: actor.id, reason: 'user-cancelled' }));
        expect(recordStep).not.toHaveBeenCalled();
    });
});
