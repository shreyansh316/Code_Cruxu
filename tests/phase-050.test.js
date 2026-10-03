/** Phase 050 — Office Head routing contracts enforce office and hierarchy scope. */
import { describe, expect, it } from 'vitest';
import { createOfficeHeadRouting } from '../src/application';
import { PlanDecision } from '../src/domain';

const snapshot = () => ({
    organization: { id: 'org-050', name: 'Headroom' },
    offices: [{ id: 'office-050', organizationId: 'org-050', name: 'Office', slug: 'office-050', status: 'ACTIVE' },
        { id: 'office-other-050', organizationId: 'org-050', name: 'Other', slug: 'office-other-050', status: 'ACTIVE' }],
    departments: [
        { id: 'department-a-050', officeId: 'office-050', name: 'A', slug: 'department-a-050', status: 'ACTIVE' },
        { id: 'department-b-050', officeId: 'office-050', name: 'B', slug: 'department-b-050', status: 'ACTIVE' },
        { id: 'department-other-050', officeId: 'office-other-050', name: 'Other', slug: 'department-other-050', status: 'ACTIVE' },
    ],
    agents: [
        { id: 'head-050', name: 'Head', role: 'HEAD_MANAGER', status: 'IDLE', managedOfficeId: 'office-050' },
        { id: 'manager-a-050', name: 'Manager A', role: 'DEPT_MANAGER', status: 'IDLE', managedDepartmentId: 'department-a-050' },
        { id: 'manager-b-050', name: 'Manager B', role: 'DEPT_MANAGER', status: 'IDLE', managedDepartmentId: 'department-b-050' },
    ],
});

const plan = () => ({ id: 'approved-plan-050', objectiveId: 'objective-050',
    projects: [{ id: 'project-050', name: 'Project' }],
    milestones: [{ id: 'milestone-050', projectId: 'project-050', title: 'Build' }],
    tasks: [
        { id: 'task-a-050', taskCode: 'A-050', title: 'Task A', projectId: 'project-050', milestoneId: 'milestone-050',
            acceptanceCriteria: [{ id: 'criterion-a-050', description: 'Done', required: true, met: false }] },
        { id: 'task-b-050', taskCode: 'B-050', title: 'Task B', projectId: 'project-050', milestoneId: 'milestone-050',
            acceptanceCriteria: [{ id: 'criterion-b-050', description: 'Done', required: true, met: false }] },
    ], dependencies: [{ dependentTaskId: 'task-b-050', dependencyTaskId: 'task-a-050' }],
    approval: { decision: PlanDecision.APPROVED, approverId: 'ceo-050', approverRole: 'CEO', decidedAt: '2026-10-04T00:00:00.000Z' },
});

function makeRouter(org = snapshot()) {
    const repository = new Map(org.agents.map((agent) => [agent.id, agent]));
    return createOfficeHeadRouting({ agentRepository: { getById: (id) => repository.get(id) },
        hierarchyProvider: { getSnapshot: () => org } });
}
const routes = [
    { taskId: 'task-a-050', departmentId: 'department-a-050' },
    { taskId: 'task-b-050', departmentId: 'department-b-050' },
];

describe('Phase 050 — Office Head routing', () => {
    it('routes approved task contracts only to managers in the selected office', async () => {
        const result = await makeRouter().run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-050', routes });
        expect(result.ok).toBe(true);
        expect(result.value.departments.map(({ departmentManagerId, tasks }) => [departmentManagerId, tasks[0].id]))
            .toEqual([['manager-a-050', 'task-a-050'], ['manager-b-050', 'task-b-050']]);
        expect(result.value.officeHeadDependencies).toEqual([{ dependentTaskId: 'task-b-050',
            dependencyTaskId: 'task-a-050', routedThrough: 'head-050' }]);
        expect(result.value.departments[0].tasks[0]).not.toHaveProperty('assigneeId');
    });

    it('rejects non-head roles, wrong offices, cross-office departments, and absent managers', async () => {
        const router = makeRouter();
        expect((await router.run({ plan: plan(), headManagerId: 'manager-a-050', officeId: 'office-050', routes })).error.code)
            .toBe('office-head-manager-forbidden');
        expect((await router.run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-other-050', routes })).error.code)
            .toBe('office-access-denied');
        const wrongDepartment = [{ taskId: 'task-a-050', departmentId: 'department-other-050' }, routes[1]];
        expect((await router.run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-050', routes: wrongDepartment })).error.code)
            .toBe('department-access-denied');
        const withoutManager = snapshot(); withoutManager.agents = withoutManager.agents.filter(({ id }) => id !== 'manager-b-050');
        expect((await makeRouter(withoutManager).run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-050', routes })).error.code)
            .toBe('department-manager-unavailable');
    });

    it('requires CEO-approved plans and an exact unique route for every task', async () => {
        const router = makeRouter();
        const unapproved = plan(); delete unapproved.approval;
        expect((await router.run({ plan: unapproved, headManagerId: 'head-050', officeId: 'office-050', routes })).error.code)
            .toBe('plan-not-approved');
        expect((await router.run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-050', routes: routes.slice(0, 1) })).error.code)
            .toBe('invalid-office-routes');
        const duplicate = [routes[0], { ...routes[1], taskId: routes[0].taskId }];
        expect((await router.run({ plan: plan(), headManagerId: 'head-050', officeId: 'office-050', routes: duplicate })).error.code)
            .toBe('invalid-office-routes');
    });
});
