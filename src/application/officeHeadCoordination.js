import { AgentRole } from '../constants';
import { assertOrganizationHierarchyInvariant, createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Coordinate a cross-department dependency solely through its owning Office Head. */
export function createOfficeHeadCoordinationUseCase({ hierarchyProvider, messageRouter } = {}) {
    if (typeof hierarchyProvider?.getSnapshot !== 'function' || typeof messageRouter?.run !== 'function') {
        throw new TypeError('Office Head coordination requires hierarchy and adjacent message routing ports.');
    }
    return createUseCase({ name: 'office-head-coordination', dependencies: { hierarchyProvider, messageRouter },
        execute: async ({ input, dependencies }) => {
            if (!input || typeof input.officeHeadId !== 'string' || typeof input.dependentTaskId !== 'string'
                || typeof input.prerequisiteTaskId !== 'string' || input.dependentTaskId === input.prerequisiteTaskId
                || typeof input.resolutionRequest !== 'string' || !input.resolutionRequest.trim()
                || input.resolutionRequest.length > 4000) {
                throw new DomainInvariantError('invalid-cross-department-coordination', 'Coordination requires distinct tasks and a bounded resolution request.');
            }
            const dependentTaskId = createEntityId(input.dependentTaskId);
            const prerequisiteTaskId = createEntityId(input.prerequisiteTaskId);
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            assertOrganizationHierarchyInvariant(hierarchy);
            const head = hierarchy.agents.find(({ id, role }) => id === input.officeHeadId && role === AgentRole.HEAD_MANAGER);
            if (!head || ['OFFLINE', 'ERROR'].includes(head.status)) throw new ApplicationError('office-head-not-found', 'The Office Head is unavailable.');
            const dependent = hierarchy.departments.find(({ id }) => id === input.dependentDepartmentId);
            const prerequisite = hierarchy.departments.find(({ id }) => id === input.prerequisiteDepartmentId);
            if (!dependent || !prerequisite) throw new ApplicationError('department-not-found', 'A dependency department does not exist.');
            if (dependent.id === prerequisite.id || dependent.officeId !== head.managedOfficeId
                || prerequisite.officeId !== head.managedOfficeId) {
                throw new DomainInvariantError('cross-department-route-forbidden', 'Both dependency departments must be distinct and belong to this Office Head.');
            }
            const managers = [dependent, prerequisite].map((department) => hierarchy.agents.find(({ role, managedDepartmentId, status }) =>
                role === AgentRole.DEPT_MANAGER && managedDepartmentId === department.id && !['OFFLINE', 'ERROR'].includes(status)));
            if (managers.some((manager) => !manager)) throw new ApplicationError('department-manager-not-found', 'A dependency department has no available manager.');
            const [dependentRoute, prerequisiteRoute] = await Promise.all(managers.map((manager, index) => dependencies.messageRouter.run({
                senderId: head.id, recipientId: manager.id,
                message: index === 0
                    ? `Coordinate dependency ${dependentTaskId} on prerequisite ${prerequisiteTaskId}. Request: ${input.resolutionRequest.trim()}`
                    : `Coordinate prerequisite ${prerequisiteTaskId} for dependent task ${dependentTaskId}. Request: ${input.resolutionRequest.trim()}`,
            })));
            if (!dependentRoute.ok || !prerequisiteRoute.ok) {
                throw new DomainInvariantError('cross-department-route-forbidden', 'Office Head coordination could not use an authorized department route.');
            }
            return Object.freeze({ officeHeadId: head.id, officeId: head.managedOfficeId,
                dependency: Object.freeze({ dependentTaskId, prerequisiteTaskId }),
                routes: Object.freeze([dependentRoute.value, prerequisiteRoute.value]) });
        },
    });
}
