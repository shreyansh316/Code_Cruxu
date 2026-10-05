import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 116 — command center workforce identity snapshot', () => {
    it('projects real offices, departments, managers, and employees into a bounded deterministic snapshot', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [], tasks: [],
            organizations: [{ id: 'org-116', name: 'Studio' }],
            offices: [{ id: 'office-116', organizationId: 'org-116', name: 'App Development', status: 'ACTIVE' }],
            departments: [{ id: 'dept-116', officeId: 'office-116', name: 'Mobile' }],
            agents: [
                { id: 'head', name: 'Morgan', role: 'HEAD_MANAGER', managedOfficeId: 'office-116', status: 'IDLE' },
                { id: 'employee-2', name: 'Zoe', role: 'EMPLOYEE', departmentId: 'dept-116', specialization: 'Testing', status: 'IDLE' },
                { id: 'manager', name: 'Alex', role: 'DEPT_MANAGER', managedDepartmentId: 'dept-116', status: 'BUSY' },
                { id: 'employee-1', name: 'Ari', role: 'EMPLOYEE', departmentId: 'dept-116', specialization: 'Android', status: 'BUSY' },
            ],
        });

        expect(snapshot.workforce).toEqual([{
            organization: 'Studio', name: 'App Development', status: 'ACTIVE', headManager: 'Morgan',
            headManagerStatus: 'IDLE', headManagerLifecycleStatus: 'ACTIVE', headManagerActiveTaskCount: 0, departments: [{
                name: 'Mobile', manager: 'Alex', managerStatus: 'BUSY', managerLifecycleStatus: 'ACTIVE', managerActiveTaskCount: 0, employees: [
                    { name: 'Ari', specialization: 'Android', capabilities: [], status: 'BUSY', lifecycleStatus: 'ACTIVE', activeTaskCount: 0 },
                    { name: 'Zoe', specialization: 'Testing', capabilities: [], status: 'IDLE', lifecycleStatus: 'ACTIVE', activeTaskCount: 0 },
                ],
            }],
        }]);
        expect(JSON.stringify(snapshot.workforce)).not.toContain('employee-1');
        expect(Object.isFrozen(snapshot.workforce)).toBe(true);
        expect(Object.isFrozen(snapshot.workforce[0].departments[0].employees)).toBe(true);
    });

    it('uses explicit empty values and excludes agents not linked to configured departments', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            offices: [{ id: 'office-116', name: 'Empty', status: 'ACTIVE' }],
            agents: [{ id: 'orphan', name: 'Orphan', departmentId: 'missing', status: 'IDLE' }] });

        expect(snapshot.workforce[0].departments).toEqual([]);
        expect(snapshot.workforce[0].organization).toBe('Organization unavailable');
    });
});
