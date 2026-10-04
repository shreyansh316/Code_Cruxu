import { AgentRole, TaskStatus } from '../constants';
import { assertOrganizationHierarchyInvariant, assertPlanApproved, assertTaskDependencyGraph, createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Delegate CEO-approved office plans only through each persisted Office Head route. */
export function createDirectorOfficeOrchestration({ agentRepository, hierarchyProvider, officeHeadRouting,
    auditRepository, unitOfWork, idFactory } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof officeHeadRouting?.run !== 'function') {
        throw new TypeError('Director orchestration requires identity, hierarchy, and Office Head routing ports.');
    }
    return createUseCase({ name: 'director-office-orchestration', dependencies: { agentRepository, hierarchyProvider,
        officeHeadRouting, auditRepository, unitOfWork, idFactory },
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
            const taskOffice = new Map();
            const allTasks = [];
            const allDependencies = [];
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
                    taskOffice.set(task.id, { officeId: package_.officeId, headManagerId: package_.headManagerId });
                    allTasks.push({ id: task.id, status: TaskStatus.CREATED });
                }
                allDependencies.push(...package_.plan.dependencies);
            }
            const crossOfficeDependencies = validateCrossOfficeDependencies(input.crossOfficeDependencies ?? [],
                taskOffice, allTasks, allDependencies, director.id);
            if (crossOfficeDependencies.length && (typeof dependencies.auditRepository?.append !== 'function'
                || typeof dependencies.unitOfWork?.run !== 'function' || typeof dependencies.idFactory !== 'function')) {
                throw new TypeError('Cross-office dependencies require durable audit, transaction, and ID dependencies.');
            }
            const results = [];
            for (const package_ of input.officePlans) {
                const officeDependencies = crossOfficeDependencies.filter((edge) =>
                    edge.dependentOfficeId === package_.officeId || edge.prerequisiteOfficeId === package_.officeId);
                const routed = await dependencies.officeHeadRouting.run({ plan: package_.plan,
                    officeId: package_.officeId, headManagerId: package_.headManagerId, routes: package_.routes,
                    crossOfficeDependencies: officeDependencies });
                if (!routed.ok) throw new ApplicationError(routed.error.code, routed.error.message);
                results.push(Object.freeze({ officeId: package_.officeId, headManagerId: package_.headManagerId,
                    status: 'ROUTED', package: routed.value,
                    crossOfficeDependencies: Object.freeze(officeDependencies) }));
            }
            if (crossOfficeDependencies.length) {
                dependencies.unitOfWork.run(() => {
                    for (const edge of crossOfficeDependencies) {
                        dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                            action: 'CROSS_OFFICE_DEPENDENCY_ROUTED', entity: 'task_dependency',
                            entityId: edge.dependentTaskId, taskId: edge.dependentTaskId, actorId: director.id,
                            details: { dependentTaskId: edge.dependentTaskId, prerequisiteTaskId: edge.dependencyTaskId,
                                dependentOfficeId: edge.dependentOfficeId, prerequisiteOfficeId: edge.prerequisiteOfficeId,
                                dependentHeadManagerId: edge.dependentHeadManagerId,
                                prerequisiteHeadManagerId: edge.prerequisiteHeadManagerId, routedBy: director.id } });
                    }
                });
            }
            return Object.freeze({ directorId: director.id, status: 'DELEGATED', offices: Object.freeze(results),
                crossOfficeDependencies: Object.freeze(crossOfficeDependencies) });
        },
    });
}

function validateCrossOfficeDependencies(edges, taskOffice, allTasks, inPlanDependencies, directorId) {
    if (!Array.isArray(edges) || edges.length > 200) {
        throw new DomainInvariantError('invalid-director-orchestration', 'Cross-office dependencies must be a bounded array.');
    }
    const seen = new Set();
    const routed = edges.map((edge) => {
        if (!edge || Object.keys(edge).sort().join(',') !== 'dependencyTaskId,dependentTaskId'
            || typeof edge.dependentTaskId !== 'string' || typeof edge.dependencyTaskId !== 'string') {
            throw new DomainInvariantError('invalid-director-orchestration', 'Cross-office dependencies require dependent and prerequisite task identifiers only.');
        }
        const key = JSON.stringify([edge.dependentTaskId, edge.dependencyTaskId]);
        const dependent = taskOffice.get(edge.dependentTaskId);
        const prerequisite = taskOffice.get(edge.dependencyTaskId);
        if (seen.has(key) || !dependent || !prerequisite || dependent.officeId === prerequisite.officeId) {
            throw new DomainInvariantError('invalid-director-orchestration', 'Cross-office dependencies must uniquely connect tasks in different delegated offices.');
        }
        seen.add(key);
        return Object.freeze({ dependentTaskId: edge.dependentTaskId, dependencyTaskId: edge.dependencyTaskId,
            dependentOfficeId: dependent.officeId, prerequisiteOfficeId: prerequisite.officeId,
            dependentHeadManagerId: dependent.headManagerId, prerequisiteHeadManagerId: prerequisite.headManagerId,
            directorId, routedThrough: 'DIRECTOR' });
    });
    try { assertTaskDependencyGraph(allTasks, [...inPlanDependencies, ...routed]); }
    catch (error) {
        throw new DomainInvariantError('invalid-director-orchestration', error.message);
    }
    return routed;
}
