import { describe, expect, it } from 'vitest';
import { createDirectorOfficeOrchestration, createOfficeHeadRouting } from '../src/application';
import { AgentRole } from '../src/constants';
import { PlanDecision } from '../src/domain';

const taskPlan = (suffix, taskId) => ({ id: `plan-096-${suffix}`, objectiveId: `objective-096-${suffix}`,
    projects: [{ id: `project-096-${suffix}`, name: suffix }],
    milestones: [{ id: `milestone-096-${suffix}`, projectId: `project-096-${suffix}`, title: 'Delivery' }],
    tasks: [{ id: taskId, taskCode: `TASK-096-${suffix}`, title: `${suffix} task`, projectId: `project-096-${suffix}`,
        milestoneId: `milestone-096-${suffix}`, acceptanceCriteria: [{ id: `criterion-096-${suffix}`, description: 'Done', required: true, met: false }] }],
    dependencies: [], approval: { decision: PlanDecision.APPROVED, approverId: 'ceo-096', approverRole: AgentRole.CEO,
        decidedAt: '2026-10-04T00:00:00.000Z' } });

function setup() {
    const director = { id: 'director-096', name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' };
    const hierarchy = { organization: { id: 'org-096', name: 'Organization' }, offices: [], departments: [], agents: [director] };
    const audit = [];
    const routeCalls = [];
    const useCase = createDirectorOfficeOrchestration({
        agentRepository: { getById: (id) => id === director.id ? director : undefined },
        hierarchyProvider: { getSnapshot: () => hierarchy },
        officeHeadRouting: { run: async (input) => { routeCalls.push(input); return { ok: true, value: { officeId: input.officeId } }; } },
        auditRepository: { append: (record) => { audit.push(record); return record; } },
        unitOfWork: { run: (work) => work() }, idFactory: (() => { let n = 0; return () => `phase096-audit-${++n}`; })(),
    });
    return { useCase, audit, routeCalls };
}

describe('Phase 096 — cross-office dependency coordination', () => {
    it('routes dependencies through both Office Heads and durably audits the Director decision', async () => {
        const { useCase, audit, routeCalls } = setup();
        const result = await useCase.run({ directorId: 'director-096', officePlans: [
            { officeId: 'office-096-a', headManagerId: 'head-096-a', plan: taskPlan('a', 'task-096-a'), routes: [] },
            { officeId: 'office-096-b', headManagerId: 'head-096-b', plan: taskPlan('b', 'task-096-b'), routes: [] },
        ], crossOfficeDependencies: [{ dependentTaskId: 'task-096-b', dependencyTaskId: 'task-096-a' }] });
        expect(result.ok).toBe(true);
        expect(result.value.crossOfficeDependencies[0]).toMatchObject({ dependentOfficeId: 'office-096-b',
            prerequisiteOfficeId: 'office-096-a', dependentHeadManagerId: 'head-096-b',
            prerequisiteHeadManagerId: 'head-096-a', routedThrough: 'DIRECTOR' });
        expect(result.value.offices.every(({ crossOfficeDependencies }) => crossOfficeDependencies.length === 1)).toBe(true);
        expect(routeCalls).toHaveLength(2);
        expect(routeCalls.every(({ crossOfficeDependencies }) => crossOfficeDependencies[0].directorId === 'director-096')).toBe(true);
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ action: 'CROSS_OFFICE_DEPENDENCY_ROUTED', actorId: 'director-096',
            details: { dependentTaskId: 'task-096-b', prerequisiteTaskId: 'task-096-a', routedBy: 'director-096' } });
    });

    it('lets each Office Head accept only its own side of a Director-authorized cross-office edge', async () => {
        const offices = [
            { id: 'office-096-a', organizationId: 'org-096', name: 'A', slug: 'a', status: 'ACTIVE' },
            { id: 'office-096-b', organizationId: 'org-096', name: 'B', slug: 'b', status: 'ACTIVE' },
        ];
        const departments = [
            { id: 'department-096-a', officeId: offices[0].id, name: 'A', slug: 'a', status: 'ACTIVE' },
            { id: 'department-096-b', officeId: offices[1].id, name: 'B', slug: 'b', status: 'ACTIVE' },
        ];
        const agents = [
            { id: 'director-096', name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' },
            { id: 'head-096-a', name: 'Head A', role: AgentRole.HEAD_MANAGER, managedOfficeId: offices[0].id, status: 'IDLE' },
            { id: 'head-096-b', name: 'Head B', role: AgentRole.HEAD_MANAGER, managedOfficeId: offices[1].id, status: 'IDLE' },
            { id: 'manager-096-a', name: 'Manager A', role: AgentRole.DEPT_MANAGER, managedDepartmentId: departments[0].id, status: 'IDLE' },
            { id: 'manager-096-b', name: 'Manager B', role: AgentRole.DEPT_MANAGER, managedDepartmentId: departments[1].id, status: 'IDLE' },
        ];
        const hierarchy = { organization: { id: 'org-096', name: 'Organization' }, offices, departments, agents };
        const route = createOfficeHeadRouting({ agentRepository: { getById: (id) => agents.find((agent) => agent.id === id) },
            hierarchyProvider: { getSnapshot: () => hierarchy } });
        const edge = { dependentTaskId: 'task-096-b', dependencyTaskId: 'task-096-a',
            dependentOfficeId: offices[1].id, prerequisiteOfficeId: offices[0].id,
            dependentHeadManagerId: 'head-096-b', prerequisiteHeadManagerId: 'head-096-a',
            directorId: 'director-096', routedThrough: 'DIRECTOR' };
        const packageFor = (index, officeEdge) => route.run({ plan: taskPlan(index ? 'b' : 'a', index ? 'task-096-b' : 'task-096-a'),
            officeId: offices[index].id, headManagerId: agents[index + 1].id,
            routes: [{ taskId: index ? 'task-096-b' : 'task-096-a', departmentId: departments[index].id }],
            crossOfficeDependencies: [officeEdge] });
        expect((await packageFor(0, edge)).value.crossOfficeDependencies).toMatchObject([{ routedBy: 'head-096-a' }]);
        expect((await packageFor(1, edge)).value.crossOfficeDependencies).toMatchObject([{ routedBy: 'head-096-b' }]);
        const forged = await packageFor(0, { ...edge, prerequisiteHeadManagerId: 'head-forged' });
        expect(forged.error.code).toBe('invalid-office-routes');
    });

    it('rejects missing, same-office, duplicate, and cyclic cross-office edges before routing', async () => {
        const { useCase, audit, routeCalls } = setup();
        const offices = [
            { officeId: 'office-096-a', headManagerId: 'head-096-a', plan: taskPlan('a', 'task-096-a'), routes: [] },
            { officeId: 'office-096-b', headManagerId: 'head-096-b', plan: taskPlan('b', 'task-096-b'), routes: [] },
        ];
        const badEdges = [
            [{ dependentTaskId: 'missing', dependencyTaskId: 'task-096-a' }],
            [{ dependentTaskId: 'task-096-a', dependencyTaskId: 'task-096-a' }],
            [{ dependentTaskId: 'task-096-a', dependencyTaskId: 'task-096-b' },
                { dependentTaskId: 'task-096-b', dependencyTaskId: 'task-096-a' }],
            [{ dependentTaskId: 'task-096-b', dependencyTaskId: 'task-096-a' },
                { dependentTaskId: 'task-096-b', dependencyTaskId: 'task-096-a' }],
        ];
        for (const crossOfficeDependencies of badEdges) {
            const result = await useCase.run({ directorId: 'director-096', officePlans: offices, crossOfficeDependencies });
            expect(result.error.code).toBe('invalid-director-orchestration');
        }
        expect(routeCalls).toHaveLength(0);
        expect(audit).toHaveLength(0);
    });
});
