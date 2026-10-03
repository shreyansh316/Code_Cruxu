import { TaskStatus } from '../constants';
import { DomainInvariantError } from './errors';

/** Validate dependency references and reject graphs containing cycles. */
export function assertTaskDependencyGraph(tasks, dependencies) {
    buildDependencyGraph(tasks, dependencies);
}

/**
 * Report whether every direct prerequisite is completed. Blocker IDs are
 * sorted so callers receive stable output independent of edge input order.
 */
export function getTaskReadiness(taskId, tasks, dependencies) {
    const graph = buildDependencyGraph(tasks, dependencies);
    const task = graph.tasksById.get(taskId);
    if (!task) {
        invalidDependency(`Task ${String(taskId)} is not in the task set.`);
    }
    const blockedBy = graph.dependenciesByTask.get(taskId)
        .filter((dependencyId) => graph.tasksById.get(dependencyId).status !== TaskStatus.COMPLETED)
        .sort();
    return { ready: blockedBy.length === 0, blockedBy };
}

function buildDependencyGraph(tasks, dependencies) {
    if (!Array.isArray(tasks) || !Array.isArray(dependencies)) {
        invalidDependency('Tasks and dependencies must be arrays.');
    }

    const tasksById = new Map();
    for (const task of tasks) {
        const id = requireId(task?.id, 'Task id');
        if (tasksById.has(id)) {
            invalidDependency(`Task id ${id} occurs more than once.`);
        }
        if (!Object.values(TaskStatus).includes(task.status)) {
            invalidDependency(`Task ${id} has an unsupported status.`);
        }
        tasksById.set(id, task);
    }

    const dependenciesByTask = new Map([...tasksById.keys()].map((id) => [id, []]));
    const edgeKeys = new Set();
    const dependentCounts = new Map([...tasksById.keys()].map((id) => [id, 0]));
    const dependentsByDependency = new Map([...tasksById.keys()].map((id) => [id, []]));

    for (const edge of dependencies) {
        const dependentId = requireId(edge?.dependentTaskId, 'Dependent task id');
        const dependencyId = requireId(edge?.dependencyTaskId, 'Dependency task id');
        if (!tasksById.has(dependentId) || !tasksById.has(dependencyId)) {
            invalidDependency('Every dependency must reference tasks in the supplied task set.');
        }
        if (dependentId === dependencyId) {
            invalidDependency(`Task ${dependentId} cannot depend on itself.`);
        }
        const edgeKey = JSON.stringify([dependentId, dependencyId]);
        if (edgeKeys.has(edgeKey)) {
            invalidDependency(`Dependency ${dependentId} -> ${dependencyId} is duplicated.`);
        }
        edgeKeys.add(edgeKey);
        dependenciesByTask.get(dependentId).push(dependencyId);
        dependentCounts.set(dependentId, dependentCounts.get(dependentId) + 1);
        dependentsByDependency.get(dependencyId).push(dependentId);
    }

    // Kahn's algorithm detects cycles without recursion, including on deep graphs.
    const ready = [...dependentCounts]
        .filter(([, count]) => count === 0)
        .map(([id]) => id)
        .sort();
    let visitedCount = 0;
    for (let next = 0; next < ready.length; next += 1) {
        const completedId = ready[next];
        visitedCount += 1;
        for (const dependentId of dependentsByDependency.get(completedId)) {
            const remaining = dependentCounts.get(dependentId) - 1;
            dependentCounts.set(dependentId, remaining);
            if (remaining === 0) {
                ready.push(dependentId);
            }
        }
    }
    if (visitedCount !== tasksById.size) {
        invalidDependency('Task dependencies must not contain cycles.');
    }
    return { tasksById, dependenciesByTask };
}

function requireId(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        invalidDependency(`${label} must be a non-empty string.`);
    }
    return value;
}

function invalidDependency(message) {
    throw new DomainInvariantError('invalid-task-dependency', message);
}
