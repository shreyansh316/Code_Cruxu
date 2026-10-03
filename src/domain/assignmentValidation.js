import { AgentRole } from '../constants';
import { DomainInvariantError } from './errors';
import { assertCanReportTo, assertOrganizationHierarchyInvariant } from './invariants';

/**
 * Validate that a task creator assigns work to a direct report in the same
 * managed office or department, using the supplied organization snapshot.
 */
export function assertTaskAssignment(task, hierarchy) {
    assertOrganizationHierarchyInvariant(hierarchy);
    requireIdentifier(task?.creatorId, 'Task creator id');
    requireIdentifier(task?.assigneeId, 'Task assignee id');

    const creator = hierarchy.agents.find((agent) => agent.id === task.creatorId);
    const assignee = hierarchy.agents.find((agent) => agent.id === task.assigneeId);
    if (!creator) {
        invalidAssignment(`Task creator ${task.creatorId} is not in the organization hierarchy.`);
    }
    if (!assignee) {
        invalidAssignment(`Task assignee ${task.assigneeId} is not in the organization hierarchy.`);
    }

    assertCanReportTo(creator.role, assignee.role);
    assertMatchingScope(creator, assignee, hierarchy);
}

function assertMatchingScope(creator, assignee, hierarchy) {
    if (creator.role === AgentRole.HEAD_MANAGER) {
        const department = hierarchy.departments.find((entry) => entry.id === assignee.managedDepartmentId);
        if (!department || department.officeId !== creator.managedOfficeId) {
            invalidAssignment('A head manager can assign work only to a department manager in the same office.');
        }
    }
    if (creator.role === AgentRole.DEPT_MANAGER
        && assignee.departmentId !== creator.managedDepartmentId) {
        invalidAssignment('A department manager can assign work only to an employee in the managed department.');
    }
}

function requireIdentifier(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        invalidAssignment(`${label} must be a non-empty string.`);
    }
}

function invalidAssignment(message) {
    throw new DomainInvariantError('invalid-assignment', message);
}
