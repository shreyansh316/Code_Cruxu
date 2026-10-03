/** Phase 051 — Department Manager decomposition and workforce boundaries. */
import { describe, expect, it, vi } from 'vitest';
import { createDepartmentTaskDecomposition } from '../src/application';

const org = () => ({ organization: { id: 'org-051', name: 'Headroom' },
    offices: [{ id: 'office-051', organizationId: 'org-051', name: 'Office', slug: 'office-051', status: 'ACTIVE' }],
    departments: [{ id: 'department-051', officeId: 'office-051', name: 'Department', slug: 'department-051', status: 'ACTIVE' },
        { id: 'other-department-051', officeId: 'office-051', name: 'Other', slug: 'other-department-051', status: 'ACTIVE' }],
    agents: [
        { id: 'head-051', name: 'Head', role: 'HEAD_MANAGER', status: 'IDLE', managedOfficeId: 'office-051' },
        { id: 'manager-051', name: 'Manager', role: 'DEPT_MANAGER', status: 'IDLE', managedDepartmentId: 'department-051' },
        { id: 'employee-a-051', name: 'Employee A', role: 'EMPLOYEE', status: 'IDLE', departmentId: 'department-051' },
        { id: 'employee-b-051', name: 'Employee B', role: 'EMPLOYEE', status: 'IDLE', departmentId: 'department-051' },
        { id: 'employee-other-051', name: 'Other Employee', role: 'EMPLOYEE', status: 'IDLE', departmentId: 'other-department-051' },
    ] });
const packet = () => ({ officeId: 'office-051', routedBy: 'head-051',
    departmentId: 'department-051', departmentManagerId: 'manager-051', tasks: [
    { id: 'office-task-a-051', title: 'Implement API', description: 'Build service API.', acceptanceCriteria: ['API works'] },
    { id: 'office-task-b-051', title: 'Add tests', description: null, acceptanceCriteria: ['Tests pass'] },
], dependencies: [{ dependentTaskId: 'office-task-b-051', dependencyTaskId: 'office-task-a-051' }] });
const validOutput = () => ({ subtasks: [
    { parentTaskIndex: 0, title: 'Define API', description: 'Specify endpoints.', acceptanceCriteria: ['Contract reviewed'], employeeIndex: 0 },
    { parentTaskIndex: 0, title: 'Implement handler', description: '', acceptanceCriteria: ['Handler returns expected response'], employeeIndex: 1 },
    { parentTaskIndex: 1, title: 'Test endpoint', description: 'Add unit tests.', acceptanceCriteria: ['Tests pass'], employeeIndex: 0 },
], dependencies: [
    { dependentSubtaskIndex: 1, dependencySubtaskIndex: 0 },
    { dependentSubtaskIndex: 2, dependencySubtaskIndex: 1 },
] });

function makeDecomposition(output = validOutput(), organization = org()) {
    const agents = new Map(organization.agents.map((agent) => [agent.id, agent]));
    const provider = { generate: vi.fn(async (request) => ({ requestId: request.requestId, model: request.model,
        finishReason: 'STOP', usage: { inputTokens: 30, outputTokens: 35 }, output })) };
    let id = 0;
    const useCase = createDepartmentTaskDecomposition({ agentRepository: { getById: (id) => agents.get(id) },
        hierarchyProvider: { getSnapshot: () => organization }, provider, idFactory: () => `decomposition-051-${++id}` });
    return { useCase, provider };
}

describe('Phase 051 — Department Manager decomposition', () => {
    it('decomposes routed work and assigns subtasks only to active employees in its own department', async () => {
        const { useCase, provider } = makeDecomposition();
        const result = await useCase.run({ departmentManagerId: 'manager-051', departmentPacket: packet(), model: 'reasoning-model' });
        expect(result.ok).toBe(true);
        expect(result.value.subtasks.map(({ parentTaskId, assigneeId, departmentId }) => [parentTaskId, assigneeId, departmentId]))
            .toEqual([
                ['office-task-a-051', 'employee-a-051', 'department-051'],
                ['office-task-a-051', 'employee-b-051', 'department-051'],
                ['office-task-b-051', 'employee-a-051', 'department-051'],
            ]);
        expect(result.value.dependencies).toHaveLength(2);
        expect(provider.generate.mock.calls[0][0].input.availableEmployees.map(({ id }) => id))
            .toEqual(['employee-a-051', 'employee-b-051']);
        expect(provider.generate.mock.calls[0][0].systemPrompt).toMatch(/Do not contact employees or other managers/);
    });

    it('rejects non-department managers, wrong department packets, and missing local workforce', async () => {
        const useCase = makeDecomposition().useCase;
        expect((await useCase.run({ departmentManagerId: 'head-051', departmentPacket: packet(), model: 'model' })).error.code)
            .toBe('department-manager-forbidden');
        expect((await useCase.run({ departmentManagerId: 'manager-051', departmentPacket: { ...packet(), departmentId: 'other-department-051' }, model: 'model' })).error.code)
            .toBe('department-scope-denied');
        expect((await useCase.run({ departmentManagerId: 'manager-051', departmentPacket: { ...packet(), routedBy: 'manager-051' }, model: 'model' })).error.code)
            .toBe('office-head-route-required');
        const noEmployees = org(); noEmployees.agents = noEmployees.agents.filter(({ role }) => role !== 'EMPLOYEE');
        expect((await makeDecomposition(validOutput(), noEmployees).useCase.run({ departmentManagerId: 'manager-051',
            departmentPacket: packet(), model: 'model' })).error.code).toBe('department-workforce-unavailable');
    });

    it('rejects malformed assignments, cycles, missing decomposition, and unsatisfied source dependencies', async () => {
        for (const output of [
            { ...validOutput(), subtasks: validOutput().subtasks.map((task, i) => i ? task : { ...task, employeeIndex: 9 }) },
            { ...validOutput(), dependencies: [{ dependentSubtaskIndex: 0, dependencySubtaskIndex: 1 }, { dependentSubtaskIndex: 1, dependencySubtaskIndex: 0 }] },
            { ...validOutput(), subtasks: validOutput().subtasks.slice(0, 2), dependencies: [{ dependentSubtaskIndex: 1, dependencySubtaskIndex: 0 }] },
            { ...validOutput(), subtasks: validOutput().subtasks.map((task, i) => i === 2 ? { ...task, parentTaskIndex: 0 } : task) },
        ]) {
            const result = await makeDecomposition(output).useCase.run({ departmentManagerId: 'manager-051', departmentPacket: packet(), model: 'model' });
            expect(result.error.code).toBe('invalid-department-decomposition');
        }
    });
});
