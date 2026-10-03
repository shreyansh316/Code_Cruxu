import { AgentRole } from '../constants';
import { assertOrganizationHierarchyInvariant, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const ALLOWED = new Map([
    [AgentRole.CEO, new Set([AgentRole.DIRECTOR])],
    [AgentRole.DIRECTOR, new Set([AgentRole.CEO, AgentRole.HEAD_MANAGER])],
    [AgentRole.HEAD_MANAGER, new Set([AgentRole.DIRECTOR, AgentRole.DEPT_MANAGER])],
    [AgentRole.DEPT_MANAGER, new Set([AgentRole.HEAD_MANAGER, AgentRole.EMPLOYEE])],
    [AgentRole.EMPLOYEE, new Set([AgentRole.DEPT_MANAGER])],
]);

/** Route a bounded structured message only across an authorized adjacent hierarchy edge. */
export function createHierarchyMessageRouter({ hierarchyProvider } = {}) {
    if (typeof hierarchyProvider?.getSnapshot !== 'function') throw new TypeError('Hierarchy message router requires an organization snapshot port.');
    return createUseCase({ name: 'hierarchy-message-router', dependencies: { hierarchyProvider },
        execute: ({ input, dependencies }) => {
            if (typeof input?.senderId !== 'string' || typeof input?.recipientId !== 'string'
                || input.senderId === input.recipientId || typeof input.message !== 'string'
                || !input.message.trim() || input.message.length > 10_000) {
                throw new DomainInvariantError('invalid-hierarchy-message', 'Messages require distinct identities and bounded non-empty content.');
            }
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            assertOrganizationHierarchyInvariant(hierarchy);
            const sender = hierarchy.agents.find(({ id }) => id === input.senderId);
            const recipient = hierarchy.agents.find(({ id }) => id === input.recipientId);
            if (!sender || !recipient) throw new ApplicationError('agent-not-found', 'A message participant does not exist.');
            if (['OFFLINE', 'ERROR'].includes(sender.status) || ['OFFLINE', 'ERROR'].includes(recipient.status)) {
                throw new DomainInvariantError('agent-unavailable', 'Both message participants must be available.');
            }
            if (!ALLOWED.get(sender.role)?.has(recipient.role) || !sameHierarchyEdge(sender, recipient, hierarchy)) {
                throw new DomainInvariantError('hierarchy-route-forbidden', 'Messages may only use an adjacent authorized hierarchy route.');
            }
            return Object.freeze({ senderId: sender.id, senderRole: sender.role, recipientId: recipient.id,
                recipientRole: recipient.role, message: input.message.trim() });
        },
    });
}

function sameHierarchyEdge(sender, recipient, hierarchy) {
    const officeForDepartment = (departmentId) => hierarchy.departments.find(({ id }) => id === departmentId)?.officeId;
    if (sender.role === AgentRole.HEAD_MANAGER && recipient.role === AgentRole.DEPT_MANAGER) {
        return officeForDepartment(recipient.managedDepartmentId) === sender.managedOfficeId;
    }
    if (sender.role === AgentRole.DEPT_MANAGER && recipient.role === AgentRole.HEAD_MANAGER) {
        return officeForDepartment(sender.managedDepartmentId) === recipient.managedOfficeId;
    }
    if (sender.role === AgentRole.DEPT_MANAGER && recipient.role === AgentRole.EMPLOYEE) {
        return sender.managedDepartmentId === recipient.departmentId;
    }
    if (sender.role === AgentRole.EMPLOYEE && recipient.role === AgentRole.DEPT_MANAGER) {
        return sender.departmentId === recipient.managedDepartmentId;
    }
    return true;
}
