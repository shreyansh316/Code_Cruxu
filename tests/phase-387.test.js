/** Phase 387 — run debugging inspections, tests and patches through task-scoped grants. */
import { describe, expect, it, vi } from 'vitest';
import { createDebuggingToolAdapter } from '../src/application';

function setup(stage, overrides = {}) {
    const session = { id: 'debug-387', taskId: 'task-387', stage, status: 'ACTIVE', filesTouched: 0,
        fileBudget: 3, commandsRun: 0, commandBudget: 2, deadlineAt: '2026-10-06T12:05:00.000Z' };
    const actor = { id: 'employee-387', role: 'EMPLOYEE', status: 'ACTIVE', lifecycleStatus: 'ACTIVE' };
    const task = { id: 'task-387', status: 'IN_PROGRESS', assigneeId: actor.id };
    const tools = { filesystem: { readFile: vi.fn(async () => 'file bytes'), writeFile: vi.fn(async () => undefined) },
        process: { execute: vi.fn(async () => ({ exitCode: 0, timedOut: false, aborted: false })) } };
    const recordStep = vi.fn(async (input) => ({ ok: true, value: { session: { ...session, stage: 'next' }, step: input } }));
    const stop = vi.fn(async () => ({ ok: true, value: { ...session, status: 'STOPPED', stopReason: 'user-cancelled' } }));
    const adapter = createDebuggingToolAdapter({ sessionRepository: { getById: () => session, listSteps: () => [] },
        taskRepository: { getById: () => task }, agentRepository: { getById: () => actor },
        taskToolsProvider: { forTask: vi.fn(async () => tools) }, debuggingWorkflow: { recordStep: { run: recordStep }, stop: { run: stop } },
        clock: { now: () => '2026-10-06T12:00:00.000Z' }, ...overrides });
    return { adapter, tools, recordStep, stop, session, actor, task };
}

describe('Phase 387 — permission-checked debugging actions', () => {
    it('routes inspection through the task read grant and records bounded action metadata', async () => {
        const { adapter, tools, recordStep } = setup('INSPECT');
        const result = await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', file: 'src/main.js' });
        expect(result.ok).toBe(true);
        expect(tools.filesystem.readFile).toHaveBeenCalledWith('src/main.js');
        expect(result.value.action.output).toBe('file bytes');
        expect(recordStep).toHaveBeenCalledWith(expect.objectContaining({ stage: 'INSPECT', files: ['src/main.js'],
            commandsRun: 0, outcome: 'PASS' }));
    });

    it('executes only through task command grants and records test failures for bounded retries', async () => {
        const commandTools = { filesystem: {}, process: { execute: vi.fn(async () => ({ exitCode: 2, timedOut: false, aborted: false,
            stdout: 'token=hidden', stderr: '' })) } };
        const { adapter, recordStep } = setup('TEST', { taskToolsProvider: { forTask: async () => commandTools } });
        const result = await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', command: 'node', args: ['test.js'] });
        expect(result.ok).toBe(true);
        expect(recordStep).toHaveBeenCalledWith(expect.objectContaining({ stage: 'TEST', commandsRun: 1, outcome: 'FAIL',
            toolAction: 'EXECUTE_COMMAND', commandSummary: 'node test.js' }));
        expect(commandTools.process.execute).toHaveBeenCalledOnce();
        expect(result.value.action.output).toBe('token=[redacted]');
    });

    it('requires per-change patch confirmation and refuses traversal before touching tools', async () => {
        const { adapter, tools } = setup('PATCH');
        expect((await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', file: 'src/main.js', contents: 'new' })).error.code)
            .toBe('debugging-patch-not-confirmed');
        expect((await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', file: '../outside.js', contents: 'new', confirmPatch: true })).error.code)
            .toBe('invalid-debugging-file');
        expect((await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', file: 'src/main.js', contents: 'new', confirmPatch: true })).ok)
            .toBe(true);
        expect(tools.filesystem.writeFile).toHaveBeenCalledWith('src/main.js', 'new');
    });

    it('blocks non-assignees before resolving task tools', async () => {
        const provider = { forTask: vi.fn() };
        const { adapter } = setup('INSPECT', { taskToolsProvider: provider,
            taskRepository: { getById: () => ({ id: 'task-387', status: 'IN_PROGRESS', assigneeId: 'someone-else' }) } });
        expect((await adapter.run({ sessionId: 'debug-387', actorId: 'employee-387', file: 'src/main.js' })).error.code)
            .toBe('debugging-tool-forbidden');
        expect(provider.forTask).not.toHaveBeenCalled();
    });

});
