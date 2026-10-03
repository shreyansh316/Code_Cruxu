import { AgentRole, TaskStatus } from '../constants';
import { assertOrganizationHierarchyInvariant, assertTaskDependencyGraph, createEntityId } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { getPromptContract } from './promptRegistry';

const MAX_SOURCE_TASKS = 20;
const MAX_SUBTASKS = 80;
const MAX_TEXT = 2_000;
const PROMPT = getPromptContract('department.task-decomposition.v1');

/** Decompose a Department Manager's routed packet into validated own-workforce proposals. */
export function createDepartmentTaskDecomposition({ agentRepository, hierarchyProvider, provider, idFactory } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof provider?.generate !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Department decomposition requires agent, hierarchy, provider, and ID ports.');
    }
    return createUseCase({ name: 'department-task-decomposition', dependencies: { agentRepository, hierarchyProvider, provider, idFactory },
        execute: async ({ input, dependencies }) => {
            const managerId = requiredId(input?.departmentManagerId, 'A Department Manager identifier is required.');
            const manager = dependencies.agentRepository.getById(managerId);
            if (!manager || manager.role !== AgentRole.DEPT_MANAGER || ['OFFLINE', 'ERROR'].includes(manager.status)) {
                throw new ApplicationError('department-manager-forbidden', 'Only an available Department Manager may decompose department work.');
            }
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            assertOrganizationHierarchyInvariant(hierarchy);
            const snapshotManager = hierarchy.agents.find(({ id }) => id === manager.id);
            if (!snapshotManager || snapshotManager.role !== AgentRole.DEPT_MANAGER
                || snapshotManager.managedDepartmentId !== manager.managedDepartmentId) {
                throw new ApplicationError('department-manager-forbidden', 'The manager identity is not present in the current hierarchy.');
            }
            const packet = input.departmentPacket;
            if (!packet || packet.departmentId !== manager.managedDepartmentId
                || packet.departmentManagerId !== manager.id
                || !Array.isArray(packet.tasks) || packet.tasks.length < 1 || packet.tasks.length > MAX_SOURCE_TASKS) {
                throw new ApplicationError('department-scope-denied', 'A Department Manager may accept only a bounded work packet for their own department.');
            }
            const managedDepartment = hierarchy.departments.find(({ id }) => id === manager.managedDepartmentId);
            const officeHead = hierarchy.agents.find(({ id, role, managedOfficeId, status }) => id === packet.routedBy
                && role === AgentRole.HEAD_MANAGER && managedOfficeId === managedDepartment?.officeId
                && !['OFFLINE', 'ERROR'].includes(status));
            const persistedOfficeHead = officeHead && dependencies.agentRepository.getById(officeHead.id);
            if (!managedDepartment || packet.officeId !== managedDepartment.officeId || !persistedOfficeHead
                || persistedOfficeHead.role !== AgentRole.HEAD_MANAGER
                || persistedOfficeHead.managedOfficeId !== managedDepartment.officeId) {
                throw new ApplicationError('office-head-route-required', 'Department work must arrive through the Office Head Manager responsible for the department office.');
            }
            const employees = hierarchy.agents.filter((agent) => agent.role === AgentRole.EMPLOYEE
                && agent.departmentId === manager.managedDepartmentId && !['OFFLINE', 'ERROR'].includes(agent.status))
                .sort((a, b) => a.id.localeCompare(b.id));
            if (!employees.length) throw new ApplicationError('department-workforce-unavailable', 'The department has no available employees.');
            const sourceTasks = packet.tasks.map((task) => normalizeSourceTask(task));
            if (packet.dependencies !== undefined && !Array.isArray(packet.dependencies)) {
                throw new ApplicationError('invalid-department-task-packet', 'Department dependencies must be provided as an array.');
            }
            const sourceDependencies = (packet.dependencies ?? []).map(({ dependentTaskId, dependencyTaskId } = {}) => ({
                dependentTaskId, dependencyTaskId,
            }));
            assertTaskDependencyGraph(sourceTasks.map(({ id }) => ({ id, status: TaskStatus.CREATED })), sourceDependencies);
            const response = await dependencies.provider.generate({
                requestId: createEntityId(dependencies.idFactory()), model: input.model,
                systemPrompt: PROMPT.systemPrompt,
                input: { departmentId: manager.managedDepartmentId,
                    sourceTasks, dependencies: sourceDependencies,
                    availableEmployees: employees.map(({ id, name }) => ({ id, name })) },
                outputSchema: PROMPT.outputSchema,
            }, { signal: input.signal, budget: input.budget });
            if (response.finishReason !== 'STOP') {
                const code = response.finishReason === 'ERROR' ? response.errorCode : `department-decomposition-${response.finishReason.toLowerCase()}`;
                throw new ApplicationError(code, 'Department task decomposition did not produce a complete proposal.',
                    { retryable: response.finishReason === 'ERROR' });
            }
            return validateDecomposition(response.output, sourceTasks, sourceDependencies, employees,
                manager.managedDepartmentId, dependencies.idFactory);
        } });
}

function normalizeSourceTask(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim()
        || typeof value.title !== 'string' || !value.title.trim() || value.title.length > MAX_TEXT
        || (value.description != null && (typeof value.description !== 'string' || value.description.length > MAX_TEXT))
        || !Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length < 1 || value.acceptanceCriteria.length > 20) {
        throw new ApplicationError('invalid-department-task-packet', 'The routed packet contains a malformed task.');
    }
    return Object.freeze({ id: value.id, title: value.title.trim(), description: value.description?.trim() ?? null,
        acceptanceCriteria: Object.freeze(value.acceptanceCriteria.map((criterion) => {
            if (typeof criterion !== 'string' || !criterion.trim() || criterion.length > MAX_TEXT) {
                throw new ApplicationError('invalid-department-task-packet', 'Task acceptance criteria must be bounded text.');
            }
            return criterion.trim();
        })) });
}

function validateDecomposition(output, sourceTasks, sourceDependencies, employees, departmentId, idFactory) {
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || Object.keys(output).sort().join(',') !== 'dependencies,subtasks'
        || !Array.isArray(output.subtasks) || !output.subtasks.length || output.subtasks.length > MAX_SUBTASKS
        || !Array.isArray(output.dependencies) || output.dependencies.length > 200) invalid();
    const subtasks = output.subtasks.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).sort().join(',') !== 'acceptanceCriteria,description,employeeIndex,parentTaskIndex,title'
            || !validIndex(item.parentTaskIndex, sourceTasks.length) || !validIndex(item.employeeIndex, employees.length)
            || typeof item.description !== 'string' || item.description.length > MAX_TEXT
            || !Array.isArray(item.acceptanceCriteria) || !item.acceptanceCriteria.length || item.acceptanceCriteria.length > 20) invalid();
        const title = boundedText(item.title);
        const acceptanceCriteria = item.acceptanceCriteria.map(boundedText);
        return Object.freeze({ id: createEntityId(idFactory()), parentTaskId: sourceTasks[item.parentTaskIndex].id,
            title, description: item.description.trim() || null, departmentId,
            assigneeId: employees[item.employeeIndex].id,
            acceptanceCriteria: Object.freeze(acceptanceCriteria.map((description, criterionIndex) => Object.freeze({
                id: createEntityId(idFactory()), description, required: true,
            }))) });
    });
    const dependencies = output.dependencies.map((edge) => {
        if (!edge || typeof edge !== 'object' || Object.keys(edge).sort().join(',') !== 'dependencySubtaskIndex,dependentSubtaskIndex'
            || !validIndex(edge.dependentSubtaskIndex, subtasks.length) || !validIndex(edge.dependencySubtaskIndex, subtasks.length)) invalid();
        return { dependentTaskId: subtasks[edge.dependentSubtaskIndex].id,
            dependencyTaskId: subtasks[edge.dependencySubtaskIndex].id };
    });
    const parentDependencyKeys = new Set(sourceDependencies.map(({ dependentTaskId, dependencyTaskId }) =>
        JSON.stringify([dependentTaskId, dependencyTaskId])));
    for (const edge of dependencies) {
        const dependentParent = subtasks.find(({ id }) => id === edge.dependentTaskId).parentTaskId;
        const dependencyParent = subtasks.find(({ id }) => id === edge.dependencyTaskId).parentTaskId;
        if (dependentParent !== dependencyParent
            && !parentDependencyKeys.has(JSON.stringify([dependentParent, dependencyParent]))) invalid();
    }
    for (const source of sourceTasks) {
        const dependentChildren = subtasks.filter(({ parentTaskId }) => parentTaskId === source.id);
        if (!dependentChildren.length) invalid();
        for (const parentEdge of sourceDependencies.filter(({ dependentTaskId }) => dependentTaskId === source.id)) {
            const prerequisiteChildren = subtasks.filter(({ parentTaskId }) => parentTaskId === parentEdge.dependencyTaskId);
            if (dependentChildren.some((child) => !dependencies.some((edge) => edge.dependentTaskId === child.id
                && prerequisiteChildren.some((prerequisite) => prerequisite.id === edge.dependencyTaskId)))) invalid();
        }
    }
    try { assertTaskDependencyGraph(subtasks.map(({ id }) => ({ id, status: TaskStatus.CREATED })), dependencies); }
    catch { invalid(); }
    return Object.freeze({ departmentId, subtasks: Object.freeze(subtasks), dependencies: Object.freeze(dependencies.map(Object.freeze)) });
}

function validIndex(value, length) { return Number.isSafeInteger(value) && value >= 0 && value < length; }
function boundedText(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TEXT) invalid();
    return value.trim();
}
function requiredId(value, message) {
    if (typeof value !== 'string' || !value.trim()) throw new ApplicationError('invalid-department-request', message);
    return value.trim();
}
function invalid() { throw new ApplicationError('invalid-department-decomposition', 'The Department Manager returned an invalid subtask proposal.'); }
