import { AgentRole, TaskStatus } from '../constants';
import { assertTaskToolPermissionsWithinPosition, createEntityId, DomainInvariantError, findPositionBySpecialization, isAgentAvailable } from '../domain';
import { normalizeTaskToolPermissions } from '../shared/taskToolPermissions';
import { ApplicationError, createUseCase } from './useCase';

/** Persist explicitly approved task-scoped tool grants before the task is queued. */
export function createTaskToolPermissionManagement({ taskRepository, projectRepository, objectiveRepository,
    agentRepository, hierarchyProvider, queueRepository, auditRepository, unitOfWork, clock, idFactory } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof taskRepository?.update !== 'function'
        || typeof projectRepository?.getById !== 'function' || typeof objectiveRepository?.getById !== 'function'
        || typeof agentRepository?.getById !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof queueRepository?.getByTaskId !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Task tool permission management requires task hierarchy, queue, audit, transaction, clock, and ID ports.');
    }
    return createUseCase({ name: 'task-tool-permission-management', dependencies: {
        taskRepository, projectRepository, objectiveRepository, agentRepository, hierarchyProvider, queueRepository,
        auditRepository, unitOfWork, clock, idFactory,
    }, execute: ({ input, dependencies }) => {
        const taskId = requiredId(input?.taskId, 'Task id');
        const actorId = requiredId(input?.actorId, 'CEO id');
        const permissions = normalizeTaskToolPermissions(input?.permissions);
        const task = dependencies.taskRepository.getById(taskId);
        if (!task) throw new ApplicationError('task-not-found', 'The task does not exist.');
        const hierarchy = dependencies.hierarchyProvider.getSnapshot();
        const actor = dependencies.agentRepository.getById(actorId);
        if (!actor || actor.role !== AgentRole.CEO || !isAgentAvailable(actor)
            || actor.organizationId !== hierarchy?.organization?.id
            || !hierarchy?.agents?.some((member) => member.id === actor.id && member.role === AgentRole.CEO)) {
            throw new DomainInvariantError('task-tool-permission-forbidden', 'Only the active CEO in the current organization may grant task tools.');
        }
        const project = task.projectId ? dependencies.projectRepository.getById(task.projectId) : undefined;
        const objective = project?.objectiveId ? dependencies.objectiveRepository.getById(project.objectiveId) : undefined;
        if (!objective || objective.organizationId !== actor.organizationId) {
            throw new DomainInvariantError('task-tool-permission-scope-mismatch', 'Task tool grants must stay within the CEO organization.');
        }
        if (permissions) {
            const assignee = task.assigneeId ? dependencies.agentRepository.getById(task.assigneeId) : null;
            const position = findPositionBySpecialization(assignee?.specialization);
            if (position) assertTaskToolPermissionsWithinPosition(position, permissions);
        }
        assertPermissionsMutable(task, dependencies.queueRepository);
        return dependencies.unitOfWork.run(() => {
            const current = dependencies.taskRepository.getById(taskId);
            if (!current) throw new ApplicationError('task-not-found', 'The task does not exist.');
            assertPermissionsMutable(current, dependencies.queueRepository);
            const updated = dependencies.taskRepository.update(taskId, { toolPermissions: permissions });
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                action: 'TASK_TOOL_PERMISSIONS_CONFIGURED', entity: 'task', entityId: taskId,
                actorId, taskId, details: { readFileCount: permissions?.readFiles.length ?? 0,
                    writeFileCount: permissions?.writeFiles.length ?? 0, commandCount: permissions?.commands.length ?? 0 } });
            return updated;
        });
    } });
}

function assertPermissionsMutable(task, queueRepository) {
    if (![TaskStatus.CREATED, TaskStatus.ASSIGNED].includes(task.status) || queueRepository.getByTaskId(task.id)) {
        throw new DomainInvariantError('task-tool-permission-frozen', 'Task tool grants can only change before the task is queued.');
    }
}

function requiredId(value, label) {
    try { return createEntityId(value); }
    catch { throw new DomainInvariantError('invalid-task-tool-permission-request', `${label} must be a valid entity identifier.`); }
}
