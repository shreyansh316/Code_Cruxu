import { AgentRole } from '../constants';
import { assertOrganizationHierarchyInvariant, assertPlanApproved } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Route an approved office plan into adjacent department-manager contracts. */
export function createOfficeHeadRouting({ agentRepository, hierarchyProvider } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function') {
        throw new TypeError('Office Head routing requires agent and hierarchy repository ports.');
    }
    return createUseCase({ name: 'office-head-routing', dependencies: { agentRepository, hierarchyProvider },
        execute: ({ input, dependencies }) => {
            const plan = assertPlanApproved(input?.plan);
            const managerId = requiredId(input.headManagerId, 'An Office Head Manager identifier is required.');
            const manager = dependencies.agentRepository.getById(managerId);
            if (!manager || manager.role !== AgentRole.HEAD_MANAGER) {
                throw new ApplicationError('office-head-manager-forbidden', 'Only an Office Head Manager may route office work.');
            }
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            assertOrganizationHierarchyInvariant(hierarchy);
            const persistedManager = hierarchy.agents.find(({ id }) => id === manager.id);
            if (!persistedManager || persistedManager.role !== AgentRole.HEAD_MANAGER
                || persistedManager.managedOfficeId !== manager.managedOfficeId
                || ['OFFLINE', 'ERROR'].includes(persistedManager.status)) {
                throw new ApplicationError('office-head-manager-forbidden', 'The Office Head Manager is not present in the current hierarchy.');
            }
            const office = hierarchy.offices.find(({ id }) => id === manager.managedOfficeId && id === input.officeId);
            if (!office || office.status !== 'ACTIVE') {
                throw new ApplicationError('office-access-denied', 'The Office Head Manager may route only work for their active office.');
            }
            if (!Array.isArray(input.routes) || input.routes.length !== plan.tasks.length) {
                throw new ApplicationError('invalid-office-routes', 'Every approved plan task requires exactly one department route.');
            }
            const routeByTask = new Map();
            for (const route of input.routes) {
                if (!route || Object.keys(route).sort().join(',') !== 'departmentId,taskId') {
                    throw new ApplicationError('invalid-office-routes', 'Department routes accept only task and department identifiers.');
                }
                const taskId = requiredId(route?.taskId, 'Task routes require a task identifier.');
                const departmentId = requiredId(route?.departmentId, 'Task routes require a department identifier.');
                if (routeByTask.has(taskId) || !plan.tasks.some(({ id }) => id === taskId)) {
                    throw new ApplicationError('invalid-office-routes', 'Task routes must uniquely match the approved plan.');
                }
                const department = hierarchy.departments.find(({ id }) => id === departmentId);
                if (!department || department.officeId !== office.id || department.status !== 'ACTIVE') {
                    throw new ApplicationError('department-access-denied', 'Work may be routed only to active departments in the managed office.');
                }
                const departmentManager = hierarchy.agents.find(({ role, managedDepartmentId, status }) =>
                    role === AgentRole.DEPT_MANAGER && managedDepartmentId === department.id
                    && !['OFFLINE', 'ERROR'].includes(status));
                const persistedDepartmentManager = dependencies.agentRepository.getById(departmentManager?.id);
                if (!departmentManager || !persistedDepartmentManager || persistedDepartmentManager.role !== AgentRole.DEPT_MANAGER
                    || persistedDepartmentManager.managedDepartmentId !== department.id) {
                    throw new ApplicationError('department-manager-unavailable', 'The target department has no available Department Manager.');
                }
                routeByTask.set(taskId, { department, manager: persistedDepartmentManager });
            }
            const grouped = new Map();
            for (const task of plan.tasks) {
                const destination = routeByTask.get(task.id);
                if (!destination) throw new ApplicationError('invalid-office-routes', 'Every plan task requires one department route.');
                if (!grouped.has(destination.department.id)) grouped.set(destination.department.id, {
                    departmentId: destination.department.id, departmentManagerId: destination.manager.id, tasks: [], dependencies: [],
                });
                grouped.get(destination.department.id).tasks.push(copyTask(task));
            }
            const officeHeadDependencies = [];
            for (const edge of plan.dependencies) {
                const from = routeByTask.get(edge.dependentTaskId);
                const to = routeByTask.get(edge.dependencyTaskId);
                if (from.department.id === to.department.id) grouped.get(from.department.id).dependencies.push({ ...edge });
                else officeHeadDependencies.push(Object.freeze({ dependentTaskId: edge.dependentTaskId,
                    dependencyTaskId: edge.dependencyTaskId, routedThrough: manager.id }));
            }
            return Object.freeze({ planId: plan.id, officeId: office.id,
                departments: Object.freeze([...grouped.values()].map((entry) => Object.freeze({
                    ...entry, tasks: Object.freeze(entry.tasks), dependencies: Object.freeze(entry.dependencies),
                }))), officeHeadDependencies: Object.freeze(officeHeadDependencies) });
        } });
}

function copyTask(task) {
    return Object.freeze({ ...task, acceptanceCriteria: Object.freeze(task.acceptanceCriteria.map((criterion) => Object.freeze({ ...criterion }))) });
}

function requiredId(value, message) {
    if (typeof value !== 'string' || !value.trim()) throw new ApplicationError('invalid-office-routes', message);
    return value.trim();
}
