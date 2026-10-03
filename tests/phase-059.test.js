import { describe, expect, it } from 'vitest';
import { createDirectorOfficeOrchestration } from '../src/application';
import { AgentRole } from '../src/constants';
import { PlanDecision } from '../src/domain';

const plan = (id = 'plan-059', taskId = 'task-059') => ({ id, objectiveId: 'objective-059',
    projects: [{ id: 'project-059', name: 'Project' }], milestones: [{ id: 'milestone-059', projectId: 'project-059', title: 'Milestone' }],
    tasks: [{ id: taskId, taskCode: 'TASK-059', title: 'Work', projectId: 'project-059', milestoneId: 'milestone-059',
        acceptanceCriteria: [{ id: 'criterion-059', description: 'Complete', required: true, met: false }] }], dependencies: [],
    approval: { decision: PlanDecision.APPROVED, approverId: 'ceo-059', approverRole: AgentRole.CEO, decidedAt: '2026-10-04T00:00:00.000Z' } });
const hierarchy = { organization: { id: 'org-059', name: 'Org' }, offices: [], departments: [],
    agents: [{ id: 'director-059', name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' }] };

describe('Phase 059 — Director to Office Head orchestration', () => {
    it('delegates approved plans through Office Head routes and aggregates office status', async () => {
        const calls = [];
        const workflow = createDirectorOfficeOrchestration({
            agentRepository: { getById: (id) => hierarchy.agents.find((agent) => agent.id === id) },
            hierarchyProvider: { getSnapshot: () => hierarchy },
            officeHeadRouting: { run: async (input) => { calls.push(input); return { ok: true, value: { planId: input.plan.id, departments: [] } }; } },
        });
        const result = await workflow.run({ directorId: 'director-059', officePlans: [
            { officeId: 'office-059', headManagerId: 'head-059', plan: plan(), routes: [{ taskId: 'task-059', departmentId: 'dept-059' }] },
        ] });
        expect(result.value).toMatchObject({ directorId: 'director-059', status: 'DELEGATED', offices: [{ status: 'ROUTED' }] });
        expect(calls).toHaveLength(1);
        expect(calls[0].headManagerId).toBe('head-059');
        expect(calls[0]).not.toHaveProperty('departmentManagerId');
    });
    it('rejects unapproved plans and duplicate task delegation before any office route', async () => {
        let calls = 0;
        const workflow = createDirectorOfficeOrchestration({
            agentRepository: { getById: (id) => hierarchy.agents.find((agent) => agent.id === id) },
            hierarchyProvider: { getSnapshot: () => hierarchy }, officeHeadRouting: { run: async () => { calls += 1; return { ok: true }; } },
        });
        const unapproved = plan(); delete unapproved.approval;
        const rejected = await workflow.run({ directorId: 'director-059', officePlans: [{ officeId: 'office-059', headManagerId: 'head', plan: unapproved, routes: [] }] });
        const duplicate = await workflow.run({ directorId: 'director-059', officePlans: [
            { officeId: 'office-a', headManagerId: 'head-a', plan: plan('plan-a', 'task-shared'), routes: [] },
            { officeId: 'office-b', headManagerId: 'head-b', plan: plan('plan-b', 'task-shared'), routes: [] },
        ] });
        expect(rejected.error.code).toBe('plan-not-approved');
        expect(duplicate.error.code).toBe('invalid-director-orchestration');
        expect(calls).toBe(0);
    });
});
