import { describe, expect, it } from 'vitest';
import { createCEOExecutionControl, createCEOExecutionReport } from '../src/application';
import { AgentRole } from '../src/constants';
import { ExecutionControl } from '../src/domain';

const agents = [{ id: 'ceo-060', role: AgentRole.CEO }, { id: 'other-060', role: AgentRole.DIRECTOR }];
const fixtures = {
    agentRepository: { getById: (id) => agents.find((agent) => agent.id === id) },
    objectiveRepository: { getById: (id) => id === 'objective-060' ? { id, title: 'Ship safely', status: 'ACTIVE' } : undefined },
    projectRepository: { listByObjective: () => [{ id: 'project-060' }] },
    taskRepository: { listByProject: () => [{ id: 'task-060', status: 'BLOCKED', blockerReason: 'Waiting on review' }] },
    auditRepository: { listByTask: () => [{ action: 'TASK_BLOCKED' }] },
    usageRepository: { listByTask: () => [{ estimatedCost: 0.25, inputTokens: 40, outputTokens: 15, success: false }] },
};

describe('Phase 060 — CEO reporting and control', () => {
    it('reports persisted task, blocker, audit, and AI cost data', async () => {
        const report = await createCEOExecutionReport(fixtures).run({ ceoId: 'ceo-060', objectiveId: 'objective-060' });
        expect(report.value).toMatchObject({ taskCount: 1, taskStatusCounts: { BLOCKED: 1 },
            blockers: [{ taskId: 'task-060' }], cost: { estimatedCost: 0.25, inputTokens: 40, outputTokens: 15, failedRequests: 1 },
            audit: [{ taskId: 'task-060', latestAction: 'TASK_BLOCKED' }] });
    });
    it('rejects non-CEO reporting and non-CEO execution control', async () => {
        const report = await createCEOExecutionReport(fixtures).run({ ceoId: 'other-060', objectiveId: 'objective-060' });
        const control = createCEOExecutionControl({ agentRepository: fixtures.agentRepository,
            executionControl: { status: 'RUNNING', pause: () => ({ changed: true }), resume: () => ({ changed: true }) } });
        const denied = await control.run({ ceoId: 'other-060', action: 'PAUSE' });
        expect(report.error.code).toBe('ceo-report-forbidden');
        expect(denied.error.code).toBe('ceo-control-forbidden');
    });
    it('routes authorized pause and resume requests to the deterministic control', async () => {
        const executionControl = new ExecutionControl();
        const useCase = createCEOExecutionControl({ agentRepository: fixtures.agentRepository, executionControl });
        expect((await useCase.run({ ceoId: 'ceo-060', action: 'PAUSE' })).value).toMatchObject({ action: 'PAUSE', changed: true, status: 'PAUSED' });
        expect((await useCase.run({ ceoId: 'ceo-060', action: 'RESUME' })).value).toMatchObject({ action: 'RESUME', changed: true, status: 'RUNNING' });
    });
});
