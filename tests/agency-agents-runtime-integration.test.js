import { describe, expect, it, vi } from 'vitest';
import { buildSkillInstructionBlock } from '../src/application/workforceSkills';
import { createStructuredEmployeeTaskAdapter } from '../src/application/structuredEmployeeTaskAdapter';

describe('Agency Agents workforce skill runtime integration', () => {
    it('loads only the shared skills explicitly named in task capabilities', () => {
        const block = buildSkillInstructionBlock([
            'skill:evidence-collection', 'employee-specific-capability', 'SKILL:SECRET-REDACTION-DISCIPLINE',
        ]);
        expect(block).toContain('[skill:evidence-collection]');
        expect(block).toContain('[skill:secret-redaction-discipline]');
        expect(block).not.toContain('employee-specific-capability');
        expect(buildSkillInstructionBlock(['Unity'])).toBe(null);
    });

    it('injects selected skill instructions into the trusted runtime prompt without changing grants', async () => {
        let generatedRequest;
        const provider = { generate: vi.fn(async (request) => {
            generatedRequest = request;
            return { finishReason: 'STOP', usage: { inputTokens: 1, outputTokens: 1 }, output: {
                kind: 'RESULT', result: { summary: 'Verification evidence captured.', acceptanceCriteria: [
                    { criterionId: 'criterion-skill-runtime', met: true, evidence: 'The explicit task capability selected the shared skill.' },
                ] },
            } };
        }) };
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'model-test', idFactory: () => 'request-skill-runtime' });
        await adapter.execute({ requestId: 'request-skill-runtime',
            agent: { id: 'employee-skill-runtime', role: 'EMPLOYEE', capabilities: ['skill:evidence-collection'] },
            task: { id: 'task-skill-runtime', title: 'Verify the implementation', description: null,
                acceptanceCriteria: [{ id: 'criterion-skill-runtime', description: 'Report real verification evidence.', required: true, met: false }],
                requiredCapabilities: ['skill:evidence-collection'], tokenBudget: 100, timeBudgetMs: 5000, retryCount: 0, maxRetries: 0 },
            requestedAt: '2026-10-07T00:00:00.000Z',
        }, { signal: new AbortController().signal });

        expect(generatedRequest.systemPrompt).toContain('[skill:evidence-collection]');
        expect(generatedRequest.systemPrompt).toContain('Never fabricate, estimate, or assume results');
        expect(generatedRequest.systemPrompt).toContain('Claimed evidence must be reproducible by the verifier');
        expect(generatedRequest.systemPrompt).toContain('does not grant tools or permissions');
        expect(generatedRequest.input.availableTools).toEqual([]);
    });

    it('leaves the base prompt unchanged when a task requests no registered shared skills', async () => {
        let generatedRequest;
        const provider = { generate: vi.fn(async (request) => {
            generatedRequest = request;
            return { finishReason: 'STOP', usage: { inputTokens: 1, outputTokens: 1 }, output: {
                kind: 'RESULT', result: { summary: 'Task completed.', acceptanceCriteria: [
                    { criterionId: 'criterion-unmatched-skill', met: true, evidence: 'No shared skills were selected.' },
                ] },
            } };
        }) };
        const adapter = createStructuredEmployeeTaskAdapter({ provider, model: 'model-test', idFactory: () => 'request-unmatched-skill' });
        await adapter.execute({ requestId: 'request-unmatched-skill',
            agent: { id: 'employee-unmatched-skill', role: 'EMPLOYEE', capabilities: ['Unity'] },
            task: { id: 'task-unmatched-skill', title: 'Inspect files', description: null,
                acceptanceCriteria: [{ id: 'criterion-unmatched-skill', description: 'Complete the task.', required: true, met: false }],
                requiredCapabilities: ['Unity'], tokenBudget: 100, timeBudgetMs: 5000, retryCount: 0, maxRetries: 0 },
            requestedAt: '2026-10-07T00:00:00.000Z',
        }, { signal: new AbortController().signal });

        expect(generatedRequest.systemPrompt).not.toContain('Selected HEADROOM skill guidance');
    });
});
