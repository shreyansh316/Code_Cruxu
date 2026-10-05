import { EventType, TaskStatus } from '../constants';
import { assertPlanApproved, assertTaskAssignment, createDomainEvent, createEntityId, DomainInvariantError, MAX_TASK_RETRIES } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const MAX_DESCRIPTION_LENGTH = 10_000;

/** Decompose an approved plan into persisted projects, assigned tasks, and dependency edges. */
export function createTaskCreationUseCase({
    objectiveRepository, projectRepository, taskRepository, dependencyRepository,
    hierarchyProvider, auditRepository, eventPublisher, unitOfWork, clock, idFactory,
} = {}) {
    if (typeof objectiveRepository?.getById !== 'function' || typeof projectRepository?.getById !== 'function'
        || typeof projectRepository?.create !== 'function' || typeof taskRepository?.create !== 'function'
        || typeof dependencyRepository?.create !== 'function' || typeof hierarchyProvider?.getSnapshot !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof eventPublisher?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Task creation requires repositories, hierarchy, audit, event, transaction, clock, and ID ports.');
    }

    return createUseCase({
        name: 'task-creation',
        dependencies: { objectiveRepository, projectRepository, taskRepository, dependencyRepository,
            hierarchyProvider, auditRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            const plan = assertPlanApproved(input?.plan);
            const objective = dependencies.objectiveRepository.getById(plan.objectiveId);
            if (!objective) throw new ApplicationError('objective-not-found', 'The approved plan objective no longer exists.');
            const assignments = validateAssignments(plan, input.assignments);
            const hierarchy = dependencies.hierarchyProvider.getSnapshot();
            if (typeof objective.organizationId !== 'string' || objective.organizationId.length === 0) {
                throw new ApplicationError('objective-organization-missing',
                    'The objective must belong to an organization before task creation.');
            }
            if (hierarchy?.organization?.id !== objective.organizationId) {
                throw new ApplicationError('task-organization-scope-mismatch',
                    'The active organization hierarchy does not match the approved plan objective.');
            }
            for (const [taskId, assignment] of assignments) {
                const plannedTask = plan.tasks.find((task) => task.id === taskId);
                assertTaskAssignment({ ...assignment, requiredCapabilities: plannedTask.requiredCapabilities ?? [] }, hierarchy);
            }

            const maxRetries = input.maxRetries ?? 2;
            if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_TASK_RETRIES) {
                throw new DomainInvariantError('invalid-task-retry-policy', `Task retries must be between 0 and ${MAX_TASK_RETRIES}.`);
            }
            for (const task of plan.tasks) {
                if (task.description != null && (typeof task.description !== 'string' || task.description.length > MAX_DESCRIPTION_LENGTH)) {
                    throw new DomainInvariantError('invalid-task-description', `Task descriptions cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`);
                }
                if (task.priority != null && (!Number.isSafeInteger(task.priority) || task.priority < 0)) {
                    throw new DomainInvariantError('invalid-task-priority', 'Task priority must be a nonnegative integer.');
                }
            }

            return dependencies.unitOfWork.run(() => {
                const projects = plan.projects.map((project) => {
                    const existing = dependencies.projectRepository.getById(project.id);
                    if (existing) {
                        if (existing.objectiveId !== plan.objectiveId) {
                            throw new DomainInvariantError('project-objective-mismatch',
                                `Project ${project.id} belongs to a different objective.`);
                        }
                        return existing;
                    }
                    return dependencies.projectRepository.create({
                        id: createEntityId(project.id), name: project.name.trim(),
                        description: project.description ?? null, objectiveId: plan.objectiveId,
                        priority: project.priority ?? 0,
                    });
                });

                const tasks = plan.tasks.map((plannedTask) => {
                    const assignment = assignments.get(plannedTask.id);
                    const task = dependencies.taskRepository.create({
                        id: createEntityId(plannedTask.id), taskCode: plannedTask.taskCode.trim(),
                        title: plannedTask.title.trim(), description: plannedTask.description?.trim() ?? null,
                        status: TaskStatus.CREATED, priority: plannedTask.priority ?? 0,
                        projectId: plannedTask.projectId, creatorId: assignment.creatorId,
                        assigneeId: assignment.assigneeId,
                        acceptanceCriteria: plannedTask.acceptanceCriteria,
                        requiredCapabilities: plannedTask.requiredCapabilities ?? [],
                        retryCount: 0, maxRetries,
                    });
                    const timestamp = (value) => (value instanceof Date ? value : new Date(value)).toISOString();
                    const occurredAt = timestamp(dependencies.clock.now());
                    dependencies.auditRepository.append({
                        id: createEntityId(dependencies.idFactory()), action: 'TASK_CREATED', entity: 'task',
                        entityId: task.id, actorId: assignment.creatorId, taskId: task.id,
                        details: { projectId: task.projectId, assigneeId: task.assigneeId,
                            acceptanceCriteriaCount: plannedTask.acceptanceCriteria.length,
                            requiredCapabilities: plannedTask.requiredCapabilities ?? [] },
                    });
                    dependencies.eventPublisher.append(createDomainEvent({
                        eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_CREATED,
                        aggregateId: task.id, occurredAt, payload: { taskId: task.id, projectId: task.projectId },
                    }));
                    dependencies.eventPublisher.append(createDomainEvent({
                        eventId: createEntityId(dependencies.idFactory()), type: EventType.TASK_ASSIGNED,
                        aggregateId: task.id, occurredAt, payload: { taskId: task.id, assigneeId: task.assigneeId },
                    }));
                    return task;
                });

                const dependenciesCreated = plan.dependencies.map((edge) => dependencies.dependencyRepository.create({
                    id: createEntityId(dependencies.idFactory()),
                    dependentTaskId: edge.dependentTaskId,
                    dependencyTaskId: edge.dependencyTaskId,
                }));
                return { objectiveId: plan.objectiveId, projects, tasks, dependencies: dependenciesCreated };
            });
        },
    });
}

function validateAssignments(plan, assignments) {
    if (!Array.isArray(assignments) || assignments.length !== plan.tasks.length) {
        throw new DomainInvariantError('invalid-task-assignment', 'Every planned task requires exactly one hierarchy-validated assignment.');
    }
    const byTaskId = new Map();
    for (const assignment of assignments) {
        if (!assignment || typeof assignment.taskId !== 'string' || typeof assignment.creatorId !== 'string'
            || typeof assignment.assigneeId !== 'string' || byTaskId.has(assignment.taskId)) {
            throw new DomainInvariantError('invalid-task-assignment', 'Task assignments require unique task, creator, and assignee identifiers.');
        }
        byTaskId.set(assignment.taskId, { creatorId: assignment.creatorId, assigneeId: assignment.assigneeId });
    }
    if (plan.tasks.some((task) => !byTaskId.has(task.id)) || [...byTaskId.keys()].some((id) => !plan.tasks.some((task) => task.id === id))) {
        throw new DomainInvariantError('invalid-task-assignment', 'Assignments must match the plan task set exactly.');
    }
    return byTaskId;
}
