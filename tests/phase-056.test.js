import { describe, expect, it } from 'vitest';
import { createEmployeeResultVerificationUseCase } from '../src/application';
import { TaskStatus } from '../src/constants';

const criteria = [{ id: 'criterion-056', description: 'Required behavior passes', required: true, met: false }];
const result = { summary: 'Implemented', acceptanceCriteria: [{ criterionId: 'criterion-056', met: true, evidence: 'Claimed passed' }] };
const task = { id: 'task-056', assigneeId: 'employee-056', status: TaskStatus.IN_PROGRESS, acceptanceCriteria: criteria };
const signal = new AbortController().signal;

describe('Phase 056 — employee result verification', () => {
    it('permits review only when actual captured checks all pass', async () => {
        const workflow = createEmployeeResultVerificationUseCase({ taskRepository: { getById: () => task },
            verificationPipeline: { run: async () => ({ passed: true, results: [{ id: 'unit', status: 'PASSED', exitCode: 0 }] }) } });
        const outcome = await workflow.run({ taskId: task.id, agentId: task.assigneeId, result, signal });
        expect(outcome.value).toMatchObject({ status: 'VERIFIED', eligibleForReview: true, checks: [{ id: 'unit', status: 'PASSED' }] });
    });
    it('blocks completion on real failed checks and never treats employee claims as verification', async () => {
        const workflow = createEmployeeResultVerificationUseCase({ taskRepository: { getById: () => task },
            verificationPipeline: { run: async () => ({ passed: false, results: [{ id: 'unit', status: 'FAILED', exitCode: 1 }] }) } });
        const outcome = await workflow.run({ taskId: task.id, agentId: task.assigneeId, result, signal });
        expect(outcome.value).toMatchObject({ status: 'BLOCKED', eligibleForReview: false, checks: [{ status: 'FAILED' }] });
    });
    it('rejects unauthorized agents and tasks outside execution', async () => {
        const workflow = createEmployeeResultVerificationUseCase({ taskRepository: { getById: () => task },
            verificationPipeline: { run: async () => ({ passed: true, results: [{ id: 'unit', status: 'PASSED' }] }) } });
        const unauthorized = await workflow.run({ taskId: task.id, agentId: 'other', result, signal });
        expect(unauthorized.error.code).toBe('unauthorized-task-result');
    });
});
