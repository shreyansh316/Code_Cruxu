import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 118 — persisted employee workload visibility', () => {
    it('counts assigned non-terminal tasks for each employee and omits terminal work', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            agents: [
                { id: 'employee-a', name: 'Ari', departmentId: 'dept', status: 'BUSY' },
                { id: 'employee-b', name: 'Bea', departmentId: 'dept', status: 'IDLE' },
            ],
            offices: [{ id: 'office', organizationId: 'org', name: 'Office', status: 'ACTIVE' }],
            organizations: [{ id: 'org', name: 'Studio' }],
            departments: [{ id: 'dept', officeId: 'office', name: 'Engineering' }],
            tasks: [
                { id: 'work-1', assigneeId: 'employee-a', status: 'IN_PROGRESS', title: 'Implementation' },
                { id: 'work-2', assigneeId: 'employee-a', status: 'BLOCKED', title: 'Blocked work' },
                { id: 'work-3', assigneeId: 'employee-a', status: 'COMPLETED', title: 'Done' },
                { id: 'work-4', assigneeId: 'employee-b', status: 'CANCELLED', title: 'Cancelled' },
                { id: 'work-5', assigneeId: 'some-other-agent', status: 'IN_PROGRESS', title: 'Other work' },
            ],
        });

        expect(snapshot.workforce[0].departments[0].employees.map(({ name, activeTaskCount }) => ({ name, activeTaskCount })))
            .toEqual([{ name: 'Ari', activeTaskCount: 2 }, { name: 'Bea', activeTaskCount: 0 }]);
        expect(JSON.stringify(snapshot.workforce)).not.toContain('work-1');
        expect(JSON.stringify(snapshot.workforce)).not.toContain('some-other-agent');
    });

    it('counts assigned review work and returns zero for employees without assigned tasks', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            agents: [{ id: 'employee', name: 'Ari', departmentId: 'dept', status: 'IDLE' }],
            offices: [{ id: 'office', name: 'Office', status: 'ACTIVE' }],
            departments: [{ id: 'dept', officeId: 'office', name: 'Engineering' }],
            tasks: [{ id: 'review-task', assigneeId: 'employee', status: 'REVIEW', title: 'Review' }],
        });
        expect(snapshot.workforce[0].departments[0].employees[0].activeTaskCount).toBe(1);
    });
});
