import { describe, expect, it } from 'vitest';
import { createOfficeHeadCoordinationUseCase } from '../src/application';
import { AgentRole } from '../src/constants';

const hierarchy = { organization: { id: 'org-058', name: 'Org' },
    offices: [{ id: 'office-058', organizationId: 'org-058', name: 'Office', slug: 'office', status: 'ACTIVE' }],
    departments: ['dependent', 'prerequisite'].map((slug) => ({ id: `${slug}-058`, officeId: 'office-058', name: slug, slug, status: 'ACTIVE' })),
    agents: [
        { id: 'head-058', name: 'Head', role: AgentRole.HEAD_MANAGER, managedOfficeId: 'office-058', status: 'IDLE' },
        ...['dependent', 'prerequisite'].map((slug) => ({ id: `${slug}-manager-058`, name: `${slug} manager`,
            role: AgentRole.DEPT_MANAGER, managedDepartmentId: `${slug}-058`, status: 'IDLE' })),
    ] };

describe('Phase 058 — Office Head cross-department coordination', () => {
    it('sends both dependency sides through the owning Office Head', async () => {
        const messages = [];
        const workflow = createOfficeHeadCoordinationUseCase({ hierarchyProvider: { getSnapshot: () => hierarchy },
            messageRouter: { run: async (message) => { messages.push(message); return { ok: true, value: message }; } } });
        const result = await workflow.run({ officeHeadId: 'head-058', dependentTaskId: 'task-dependent', prerequisiteTaskId: 'task-prerequisite',
            dependentDepartmentId: 'dependent-058', prerequisiteDepartmentId: 'prerequisite-058', resolutionRequest: 'Confirm delivery order.' });
        expect(result.ok).toBe(true);
        expect(messages.map(({ senderId, recipientId }) => [senderId, recipientId])).toEqual([
            ['head-058', 'dependent-manager-058'], ['head-058', 'prerequisite-manager-058'],
        ]);
    });
    it('rejects cross-office, same-department, or malformed dependency requests', async () => {
        const workflow = createOfficeHeadCoordinationUseCase({ hierarchyProvider: { getSnapshot: () => hierarchy },
            messageRouter: { run: async () => ({ ok: true }) } });
        const base = { officeHeadId: 'head-058', dependentTaskId: 'task-dependent', prerequisiteTaskId: 'task-prerequisite',
            dependentDepartmentId: 'dependent-058', prerequisiteDepartmentId: 'prerequisite-058', resolutionRequest: 'Coordinate.' };
        const outside = await workflow.run({ ...base, officeHeadId: 'another-head', prerequisiteDepartmentId: 'outside' });
        const duplicate = await workflow.run({ ...base, prerequisiteDepartmentId: 'dependent-058' });
        expect(outside.ok).toBe(false);
        expect(duplicate.error.code).toBe('cross-department-route-forbidden');
    });
});
