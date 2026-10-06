/** Phase 434 — aggregate workforce load once per command-center snapshot. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 434 — command-center workload aggregation', () => {
    it('uses the same terminal-state policy for office heads, department managers, and employees', () => {
        const agents = [
            { id: 'head-434', name: 'Head', role: 'HEAD_MANAGER', managedOfficeId: 'office-434', status: 'BUSY' },
            { id: 'manager-434', name: 'Manager', role: 'DEPT_MANAGER', managedDepartmentId: 'dept-434', status: 'BUSY' },
            { id: 'employee-434', name: 'Engineer', role: 'EMPLOYEE', departmentId: 'dept-434', status: 'BUSY' },
        ];
        const tasks = [
            { id: 'head-work', assigneeId: 'head-434', status: 'IN_PROGRESS' },
            { id: 'manager-work', assigneeId: 'manager-434', status: 'REVIEW' },
            { id: 'employee-work-1', assigneeId: 'employee-434', status: 'BLOCKED' },
            { id: 'employee-work-2', assigneeId: 'employee-434', status: 'IN_PROGRESS' },
            { id: 'employee-done', assigneeId: 'employee-434', status: 'COMPLETED' },
            { id: 'employee-cancelled', assigneeId: 'employee-434', status: 'CANCELLED' },
        ];
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks, agents,
            organizations: [{ id: 'org-434', name: 'Studio' }],
            offices: [{ id: 'office-434', organizationId: 'org-434', name: 'Office', status: 'ACTIVE' }],
            departments: [{ id: 'dept-434', officeId: 'office-434', name: 'Engineering' }] });
        expect(snapshot.workforce[0]).toMatchObject({ headManagerActiveTaskCount: 1,
            departments: [{ managerActiveTaskCount: 1, employees: [{ activeTaskCount: 2 }] }] });
    });

    it('aggregates large work queues without exposing task identifiers in workforce snapshots', () => {
        const tasks = Array.from({ length: 5000 }, (_, index) => ({ id: `task-${index}`,
            assigneeId: index % 2 ? 'employee-434' : 'another-employee',
            status: index % 10 === 0 ? 'COMPLETED' : 'IN_PROGRESS' }));
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks,
            agents: [{ id: 'employee-434', name: 'Engineer', departmentId: 'dept-434', status: 'BUSY' }],
            offices: [{ id: 'office-434', name: 'Office', status: 'ACTIVE' }],
            departments: [{ id: 'dept-434', officeId: 'office-434', name: 'Engineering' }] });
        expect(snapshot.workforce[0].departments[0].employees[0].activeTaskCount).toBe(2500);
        expect(JSON.stringify(snapshot.workforce)).not.toContain('task-1');
    });
});
