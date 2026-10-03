import { describe, expect, it } from 'vitest';
import { createHierarchyMessageRouter } from '../src/application';
import { AgentRole } from '../src/constants';

const roles = Object.values(AgentRole);
function snapshot() {
    const agents = [
        { id: 'ceo', name: 'CEO', role: AgentRole.CEO, status: 'IDLE' },
        { id: 'director', name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' },
        { id: 'head-a', name: 'Head A', role: AgentRole.HEAD_MANAGER, managedOfficeId: 'office-a', status: 'IDLE' },
        { id: 'head-b', name: 'Head B', role: AgentRole.HEAD_MANAGER, managedOfficeId: 'office-b', status: 'IDLE' },
        { id: 'manager-a', name: 'Manager A', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'dept-a', status: 'IDLE' },
        { id: 'manager-b', name: 'Manager B', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'dept-b', status: 'IDLE' },
        { id: 'employee-a', name: 'Employee A', role: AgentRole.EMPLOYEE, departmentId: 'dept-a', status: 'IDLE' },
    ];
    return { organization: { id: 'org', name: 'Org' },
        offices: [{ id: 'office-a', organizationId: 'org', name: 'A', slug: 'a', status: 'ACTIVE' },
            { id: 'office-b', organizationId: 'org', name: 'B', slug: 'b', status: 'ACTIVE' }],
        departments: [{ id: 'dept-a', officeId: 'office-a', name: 'A', slug: 'a', status: 'ACTIVE' },
            { id: 'dept-b', officeId: 'office-b', name: 'B', slug: 'b', status: 'ACTIVE' }], agents };
}

describe('Phase 057 — hierarchy message router', () => {
    it('permits adjacent hierarchy edges and rejects every peer or non-adjacent role edge', async () => {
        const hierarchy = snapshot();
        const router = createHierarchyMessageRouter({ hierarchyProvider: { getSnapshot: () => hierarchy } });
        const allowed = new Set(['ceo>director', 'director>ceo', 'director>head-a', 'head-a>director',
            'director>head-b', 'head-b>director',
            'head-a>manager-a', 'manager-a>head-a', 'manager-a>employee-a', 'employee-a>manager-a']);
        allowed.add('head-b>manager-b');
        allowed.add('manager-b>head-b');
        for (const sender of hierarchy.agents) for (const recipient of hierarchy.agents) {
            const key = `${sender.id}>${recipient.id}`;
            if (sender.id === recipient.id) {
                expect((await router.run({ senderId: sender.id, recipientId: recipient.id, message: 'status' })).error.code)
                    .toBe('invalid-hierarchy-message');
            }
            else if (allowed.has(key)) {
                expect((await router.run({ senderId: sender.id, recipientId: recipient.id, message: 'status' })).ok).toBe(true);
            }
            else {
                const outcome = await router.run({ senderId: sender.id, recipientId: recipient.id, message: 'status' });
                expect(outcome.error?.code, key).toBe('hierarchy-route-forbidden');
            }
        }
        expect((await router.run({ senderId: 'head-a', recipientId: 'manager-b', message: 'cross office' })).error.code)
            .toBe('hierarchy-route-forbidden');
        expect(roles).toHaveLength(5);
    });
    it('rejects absent identities and oversized or empty messages', async () => {
        const router = createHierarchyMessageRouter({ hierarchyProvider: { getSnapshot: snapshot } });
        expect((await router.run({ senderId: 'missing', recipientId: 'director', message: 'x' })).error.code).toBe('agent-not-found');
        expect((await router.run({ senderId: 'ceo', recipientId: 'director', message: ' ' })).error.code).toBe('invalid-hierarchy-message');
        expect((await router.run({ senderId: 'ceo', recipientId: 'director', message: 'x'.repeat(10001) })).error.code).toBe('invalid-hierarchy-message');
    });
});
