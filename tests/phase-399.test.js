/** Phase 399 — budget exhaustion is recorded and routed through debugging escalation. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebuggingToolAdapter } from '../src/application';

function setup({ stage = 'TEST', sessionChanges = {}, deadlineAt = '2026-10-06T12:00:01.000Z', execute } = {}) {
    const session = { id: 'debug-399', taskId: 'task-399', stage, status: 'ACTIVE', filesTouched: 0, fileBudget: 1,
        commandsRun: 0, commandBudget: 1, deadlineAt, ...sessionChanges };
    const actor = { id: 'employee-399', role: 'EMPLOYEE', status: 'ACTIVE', lifecycleStatus: 'ACTIVE' };
    const task = { id: 'task-399', status: 'IN_PROGRESS', assigneeId: actor.id };
    const process = { execute: execute ?? vi.fn(async () => ({ exitCode: 0, timedOut: false, aborted: false })) };
    const recordStep = vi.fn(async (input) => ({ ok: true, value: { session: { ...session, status: 'ESCALATED',
        stopReason: 'resource-budget-exceeded' }, step: input } }));
    const taskToolsProvider = { forTask: vi.fn(async () => ({ filesystem: {}, process })) };
    const adapter = createDebuggingToolAdapter({ sessionRepository: { getById: () => session, listSteps: () => [] },
        taskRepository: { getById: () => task }, agentRepository: { getById: () => actor }, taskToolsProvider,
        debuggingWorkflow: { recordStep: { run: recordStep }, stop: { run: vi.fn() } },
        clock: { now: () => '2026-10-06T12:00:00.000Z' } });
    return { adapter, process, recordStep, taskToolsProvider };
}

describe('Phase 399 — bounded debugging escalation', () => {
    afterEach(() => vi.useRealTimers());

    it('escalates an exhausted command budget before resolving tools or executing a command', async () => {
        const { adapter, process, recordStep, taskToolsProvider } = setup({ sessionChanges: { commandsRun: 1 } });
        const result = await adapter.run({ sessionId: 'debug-399', actorId: 'employee-399', command: 'npm', args: ['test'] });
        expect(result.ok).toBe(true);
        expect(result.value.session.status).toBe('ESCALATED');
        expect(recordStep).toHaveBeenCalledWith(expect.objectContaining({ stage: 'TEST', outcome: 'BLOCKED' }));
        expect(taskToolsProvider.forTask).not.toHaveBeenCalled();
        expect(process.execute).not.toHaveBeenCalled();
    });

    it('records a command deadline timeout as a blocked escalation with command attribution', async () => {
        vi.useFakeTimers();
        const execute = vi.fn(({ signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('process cancelled')), { once: true });
        }));
        const { adapter, recordStep } = setup({ execute });
        const run = adapter.run({ sessionId: 'debug-399', actorId: 'employee-399', command: 'npm', args: ['test'] });
        await vi.advanceTimersByTimeAsync(1000);
        const result = await run;
        expect(result.ok).toBe(true);
        expect(result.value.session.status).toBe('ESCALATED');
        expect(recordStep).toHaveBeenCalledWith(expect.objectContaining({ stage: 'TEST', outcome: 'BLOCKED',
            commandsRun: 1, toolAction: 'EXECUTE_COMMAND', commandSummary: 'npm test' }));
    });
});
