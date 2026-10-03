import { AgentRole } from '../constants';
import { assertOrganizationHierarchyInvariant, assertPlanApproved, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Delegate CEO-approved office plans only through each persisted Office Head route. */
export function createDirectorOfficeOrchestration({ agentRepository, hierarchyProvider, officeHeadRouting } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof officeHeadRouting?.run !== 'function') {
        throw new TypeError('Director orchestration requires identity, hierarchy, and Office Head routing ports.');
    }
    return createUseCase({ name: 'director-office-orchestration', dependencies: { agentRepository, hierarchyProvider, officeHeadRouting },
        execute: async ({ input, dependencies }) => {
            if (typeof input?.directorId !== 'string' || !Array.isArray(input.officePlans)
                || input.officePlans.length < 1 || input.officePlans.length > 20) {
                throw new DomainInvariantError('invalid-director-orchestration', 'Orchestration requires a Director and one to twenty office plans.');
            }
            const director = dependencies.agentRepository.getById(input.directorId);
            if (!director || director.role !== AgentRole.DIRECTOR || ['OFFLINE', 'ERROR'].includes(director.status)) {
                throw new ApplicationError('director-forbidden', 'Only an available Director may delegate office work.');
            }
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            assertOrganizationHierarchyInvariant(hierarchy);
            const persistedDirector = hierarchy.agents.find(({ id }) => id === director.id);
            if (!persistedDirector || persistedDirector.role !== AgentRole.DIRECTOR || ['OFFLINE', 'ERROR'].includes(persistedDirector.status)) {
                throw new ApplicationError('director-forbidden', 'The Director is not present in the current organization hierarchy.');
            }
            const seenOffices = new Set();
            const seenTasks = new Set();
            for (const package_ of input.officePlans) {
                assertPlanApproved(package_?.plan);
                if (typeof package_.officeId !== 'string' || typeof package_.headManagerId !== 'string'
                    || seenOffices.has(package_.officeId)) {
                    throw new DomainInvariantError('invalid-director-orchestration', 'Office plans must uniquely identify each office and its Office Head.');
                }
                seenOffices.add(package_.officeId);
                for (const task of package_.plan.tasks) {
                    if (seenTasks.has(task.id)) throw new DomainInvariantError('invalid-director-orchestration', 'A task may be delegated to only one office.');
                    seenTasks.add(task.id);
                }
            }
            const results = [];
            for (const package_ of input.officePlans) {
                const routed = await dependencies.officeHeadRouting.run({ plan: package_.plan,
                    officeId: package_.officeId, headManagerId: package_.headManagerId, routes: package_.routes });
                if (!routed.ok) throw new ApplicationError(routed.error.code, routed.error.message);
                results.push(Object.freeze({ officeId: package_.officeId, headManagerId: package_.headManagerId,
                    status: 'ROUTED', package: routed.value }));
            }
            return Object.freeze({ directorId: director.id, status: 'DELEGATED', offices: Object.freeze(results) });
        },
    });
}
