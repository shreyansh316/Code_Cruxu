/** Phase 012 — hierarchy-aware task assignment validation. */
import { describe, expect, it } from 'vitest';
import { AgentRole } from '../src/constants';
import { assertTaskAssignment, createEntityId, DomainInvariantError } from '../src/domain';

const organization = { id: createEntityId('org-assignment'), name: 'Assignment Org' };
const offices = [
    { id: createEntityId('office-one'), organizationId: organization.id, name: 'Office One', slug: 'office-one', status: 'ACTIVE' },
    { id: createEntityId('office-two'), organizationId: organization.id, name: 'Office Two', slug: 'office-two', status: 'ACTIVE' },
];
const departments = [
    { id: createEntityId('department-one'), officeId: offices[0].id, name: 'Department One', slug: 'department-one', status: 'ACTIVE' },
    { id: createEntityId('department-two'), officeId: offices[1].id, name: 'Department Two', slug: 'department-two', status: 'ACTIVE' },
];
const agents = [
    { id: createEntityId('ceo'), name: 'CEO', role: AgentRole.CEO, status: 'IDLE' },
    { id: createEntityId('director'), name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' },
    { id: createEntityId('head-one'), name: 'Head One', role: AgentRole.HEAD_MANAGER, status: 'IDLE', managedOfficeId: offices[0].id },
    { id: createEntityId('head-two'), name: 'Head Two', role: AgentRole.HEAD_MANAGER, status: 'IDLE', managedOfficeId: offices[1].id },
    { id: createEntityId('manager-one'), name: 'Manager One', role: AgentRole.DEPT_MANAGER, status: 'IDLE', managedDepartmentId: departments[0].id },
    { id: createEntityId('manager-two'), name: 'Manager Two', role: AgentRole.DEPT_MANAGER, status: 'IDLE', managedDepartmentId: departments[1].id },
    { id: createEntityId('employee-one'), name: 'Employee One', role: AgentRole.EMPLOYEE, status: 'IDLE', departmentId: departments[0].id },
    { id: createEntityId('employee-two'), name: 'Employee Two', role: AgentRole.EMPLOYEE, status: 'IDLE', departmentId: departments[1].id },
];
const hierarchy = { organization, offices, departments, agents };

function assignment(creator, assignee) {
    return { creatorId: creator.id, assigneeId: assignee.id };
}

describe('Phase 012 — hierarchy-aware task assignments', () => {
    it('accepts assignments along each adjacent hierarchy edge', () => {
        expect(() => assertTaskAssignment(assignment(agents[0], agents[1]), hierarchy)).not.toThrow();
        expect(() => assertTaskAssignment(assignment(agents[1], agents[2]), hierarchy)).not.toThrow();
        expect(() => assertTaskAssignment(assignment(agents[2], agents[4]), hierarchy)).not.toThrow();
        expect(() => assertTaskAssignment(assignment(agents[4], agents[6]), hierarchy)).not.toThrow();
    });

    it('rejects non-adjacent roles and assignees outside the creator scope', () => {
        expect(() => assertTaskAssignment(assignment(agents[0], agents[6]), hierarchy))
            .toThrowError(expect.objectContaining({ code: 'invalid-hierarchy' }));
        expect(() => assertTaskAssignment(assignment(agents[2], agents[5]), hierarchy))
            .toThrowError(expect.objectContaining({ code: 'invalid-assignment' }));
        expect(() => assertTaskAssignment(assignment(agents[4], agents[7]), hierarchy))
            .toThrowError(expect.objectContaining({ code: 'invalid-assignment' }));
    });

    it('rejects missing task assignees and invalid organization snapshots', () => {
        expect(() => assertTaskAssignment({ creatorId: agents[4].id, assigneeId: 'missing-agent' }, hierarchy))
            .toThrowError(DomainInvariantError);
        expect(() => assertTaskAssignment({ creatorId: agents[4].id, assigneeId: '' }, hierarchy))
            .toThrowError(expect.objectContaining({ code: 'invalid-assignment' }));
        expect(() => assertTaskAssignment(assignment(agents[2], agents[4]), {
            ...hierarchy,
            departments: [],
        })).toThrowError(DomainInvariantError);
    });
});
