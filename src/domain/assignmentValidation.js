import { AgentRole } from '../constants';
import { DomainInvariantError } from './errors';
import { assertCanReportTo, assertOrganizationHierarchyInvariant } from './invariants';
import { isAgentAvailable } from './agentLifecycle';

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
    if (!isAgentAvailable(creator) || !isAgentAvailable(assignee)) {
        invalidAssignment('Task creators and assignees must be available and in the ACTIVE lifecycle state.');
    }

    assertCanReportTo(creator.role, assignee.role);
    assertMatchingScope(creator, assignee, hierarchy);
    // Manager assignment is coordination ownership; capability requirements
    // are enforced when work is decomposed onto an executing employee.
    if (assignee.role === AgentRole.EMPLOYEE) assertRequiredCapabilities(task.requiredCapabilities, assignee);
}

function assertRequiredCapabilities(requiredCapabilities, assignee) {
    if (requiredCapabilities === undefined) return;
    const available = new Set((Array.isArray(assignee.capabilities) ? assignee.capabilities : [])
        .map((capability) => capability.trim().toLocaleLowerCase('en-US')));
    const missing = requiredCapabilities.filter((capability) => !available.has(capability.trim().toLocaleLowerCase('en-US')));
    if (missing.length) {
        invalidAssignment(`Assignee ${assignee.id} lacks required capabilities: ${missing.join(', ')}.`);
    }
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
