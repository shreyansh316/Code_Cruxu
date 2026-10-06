/** Phase 347 — execute bounded structured employee actions through task-scoped tools. */
import { describe, expect, it, vi } from 'vitest';
import { createStructuredEmployeeTaskAdapter } from '../src/application';

const request = Object.freeze({ requestId: 'request-347', requestedAt: '2026-10-06T00:00:00.000Z',
    agent: Object.freeze({ id: 'employee-347', role: 'EMPLOYEE', capabilities: Object.freeze(['coding']) }),
    task: Object.freeze({ id: 'task-347', title: 'Read and report', description: null,
        acceptanceCriteria: Object.freeze([{ id: 'criterion-347', description: 'Read file', required: true, met: false }]),
        requiredCapabilities: Object.freeze(['coding']), tokenBudget: 100, timeBudgetMs: 5_000,
        retryCount: 0, maxRetries: 2 }),
});
const toolAction = (tool, args, usage = 10) => ({ finishReason: 'STOP', output: { kind: 'TOOL', tool, arguments: args },
    usage: { inputTokens: usage, outputTokens: 0 } });
const finalAction = (usage = 10) => ({ finishReason: 'STOP', output: { kind: 'RESULT', result: {
    summary: 'The file was read.', acceptanceCriteria: [{ criterionId: 'criterion-347', met: true, evidence: 'Observed content.' }],
} }, usage: { inputTokens: usage, outputTokens: 1 } });
const ids = () => { let index = 0; return () => `request-347-step-${++index}`; };

describe('Phase 347 — structured employee task adapter', () => {
    it('executes a task-scoped tool then bases the final result on redacted tool evidence', async () => {
        const provider = { generate: vi.fn().mockResolvedValueOnce(toolAction('readFile', { path: 'src/example.js' }))
            .mockResolvedValueOnce(finalAction()) };
        const tools = { filesystem: { readFile: vi.fn(async () => 'api_key=AIzaSyA1234567890123456789012345678901234') },
            process: { execute: vi.fn() } };
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'gemini-flash', idFactory: ids() });

        const result = await adapter.execute(request, { signal: new AbortController().signal, tools });

        expect(result.summary).toBe('The file was read.');
        expect(tools.filesystem.readFile).toHaveBeenCalledWith('src/example.js');
        expect(provider.generate.mock.calls[1][0].input.interactions[0].output)
            .toContain('[redacted]');
        expect(provider.generate.mock.calls[0][0].task.tokenBudget).toBe(100);
        expect(provider.generate.mock.calls[1][0].task.tokenBudget).toBe(90);
    });

    it('denies tool names absent from the task-scoped interface without invoking another adapter', async () => {
        const provider = { generate: vi.fn(async () => toolAction('execute', { command: 'npm', args: ['test'] })) };
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'model', idFactory: ids() });

        await expect(adapter.execute(request, { signal: new AbortController().signal,
            tools: { filesystem: { readFile: vi.fn() } } }))
            .rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        expect(provider.generate).toHaveBeenCalledOnce();
    });

    it('enforces the cumulative task token budget across multiple provider calls', async () => {
        const provider = { generate: vi.fn().mockResolvedValueOnce(toolAction('readFile', { path: 'a.js' }, 8))
            .mockResolvedValueOnce(finalAction(3)) };
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'model', idFactory: ids() });

        await expect(adapter.execute({ ...request, task: { ...request.task, tokenBudget: 10 } }, {
            signal: new AbortController().signal, tools: { filesystem: { readFile: async () => 'ok' } },
        })).rejects.toMatchObject({ code: 'task-token-budget-exceeded' });
        expect(provider.generate.mock.calls[1][0].task.tokenBudget).toBe(2);
    });

    it('stops after the configured maximum number of tool/model steps', async () => {
        const provider = { generate: vi.fn(async () => toolAction('readFile', { path: 'a.js' })) };
        const readFile = vi.fn(async () => 'ok');
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'model', idFactory: ids(),
            limits: { maxSteps: 2 } });

        await expect(adapter.execute(request, { signal: new AbortController().signal,
            tools: { filesystem: { readFile } } })).rejects.toMatchObject({ code: 'employee-step-limit-exceeded' });
        expect(provider.generate).toHaveBeenCalledTimes(2);
        expect(readFile).toHaveBeenCalledTimes(2);
    });
});
