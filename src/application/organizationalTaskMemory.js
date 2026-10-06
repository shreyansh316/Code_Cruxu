import { AgentRole, MemoryScope, TaskStatus } from '../constants';
import { assertTaskAssignment, DomainInvariantError, isAgentAvailable } from '../domain';
import { assembleBoundedAgentContext } from './contextAssembly';

const SCOPES = Object.freeze([
    { key: 'employee', scope: MemoryScope.EMPLOYEE, owner: 'agentId' },
    { key: 'task', scope: MemoryScope.TASK, owner: 'taskId' },
    { key: 'project', scope: MemoryScope.PROJECT, owner: 'projectId' },
    { key: 'department', scope: MemoryScope.DEPARTMENT, owner: 'departmentId' },
    { key: 'office', scope: MemoryScope.OFFICE, owner: 'officeId' },
]);
const MEMORY_LIMIT = 12_000;
const PER_SCOPE_LIMIT = 2_500;

/** Retrieve bounded task-relevant memories from the assignee's validated organizational path. */
export function createOrganizationalTaskMemoryProvider({ memoryRepository, agentRepository, taskRepository,
    projectRepository, objectiveRepository, hierarchyProvider, now = () => new Date().toISOString() } = {}) {
    if (typeof memoryRepository?.listByOwner !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof taskRepository?.getById !== 'function' || typeof projectRepository?.getById !== 'function'
        || typeof objectiveRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof now !== 'function') {
        throw new TypeError('Organizational task memory requires persisted identity, hierarchy, memory, and clock ports.');
    }
    return Object.freeze({
        forTask({ actor, task } = {}) {
            if (!actor || !Object.values(AgentRole).includes(actor.role) || !task || task.assigneeId !== actor.id
                || task.status !== TaskStatus.IN_PROGRESS) forbidden();
            const persistedActor = agentRepository.getById(actor.id);
            const persistedTask = taskRepository.getById(task.id);
            if (!persistedActor || !isAgentAvailable(persistedActor) || !persistedTask
                || persistedTask.status !== TaskStatus.IN_PROGRESS || persistedTask.assigneeId !== persistedActor.id) forbidden();
            const hierarchy = hierarchyProvider.getSnapshot();
            assertTaskAssignment({ creatorId: persistedTask.creatorId, assigneeId: persistedActor.id,
                requiredCapabilities: persistedTask.requiredCapabilities }, hierarchy);
            const department = hierarchy.departments.find((value) => value.id === persistedActor.departmentId);
            const office = department && hierarchy.offices.find((value) => value.id === department.officeId);
            const project = persistedTask.projectId ? projectRepository.getById(persistedTask.projectId) : undefined;
            const objective = project?.objectiveId ? objectiveRepository.getById(project.objectiveId) : undefined;
            const organizationId = hierarchy.organization?.id;
            const owners = {
                agentId: persistedActor.id,
                taskId: persistedTask.id,
                ...(project && objective?.organizationId === organizationId ? { projectId: project.id } : {}),
                ...(department && office?.organizationId === organizationId ? { departmentId: department.id } : {}),
                ...(department && office?.organizationId === organizationId ? { officeId: office.id } : {}),
            };
            const allowed = new Set(Object.entries(owners).map(([owner, ownerId]) => `${owner}:${ownerId}`));
            const query = `${persistedTask.title ?? ''} ${persistedTask.description ?? ''}`.slice(0, 500);
            const instant = now();
            const selected = {};
            for (const { key, scope, owner } of SCOPES) {
                const ownerId = owners[owner];
                if (!ownerId) continue;
                selected[key] = assembleBoundedAgentContext({ memoryRepository,
                    authorize: (request) => request.actor.id === persistedActor.id
                        && allowed.has(`${owner}:${request.ownerId}`) }, {
                    actor: { id: persistedActor.id, role: persistedActor.role }, scope, ownerId,
                    query, limit: 4, maxBytes: PER_SCOPE_LIMIT, now: instant,
                }).items;
            }
            return trimContext(selected, MEMORY_LIMIT);
        },
    });
}

function trimContext(context, maxBytes) {
    const result = {};
    let used = 0;
    for (const { key } of SCOPES) {
        const items = [];
        for (const item of context[key] ?? []) {
            const bytes = new TextEncoder().encode(JSON.stringify(item)).byteLength;
            if (used + bytes > maxBytes) break;
            items.push(item);
            used += bytes;
        }
        result[key] = Object.freeze(items);
    }
    return Object.freeze(result);
}

function forbidden() {
    throw new DomainInvariantError('agent-task-memory-forbidden', 'Organizational memory is available only to the current persisted task assignee.');
}
