import { TaskStatus } from '../constants';
import { DomainInvariantError } from './errors';
import { assertTaskDependencyGraph } from './taskDependencies';

/** Validate a complete draft plan before any task can be activated. */
export function assertExecutionPlan(plan) {
    if (!plan || typeof plan !== 'object' || !isText(plan.id) || !isText(plan.objectiveId)
        || !Array.isArray(plan.projects) || plan.projects.length === 0
        || !Array.isArray(plan.milestones) || plan.milestones.length === 0
        || !Array.isArray(plan.tasks) || plan.tasks.length === 0
        || !Array.isArray(plan.dependencies)) {
        invalidPlan('A plan requires identifiers, projects, milestones, tasks, and dependency edges.');
    }

    const projects = indexUnique(plan.projects, 'project', (project) => isText(project?.name));
    const milestones = indexUnique(plan.milestones, 'milestone', (milestone) =>
        isText(milestone?.projectId) && isText(milestone?.title));
    const tasks = indexUnique(plan.tasks, 'task', (task) =>
        isText(task?.projectId) && isText(task?.milestoneId)
        && isText(task?.taskCode) && isText(task?.title));

    const taskCodes = new Set();
    for (const task of plan.tasks) {
        if (taskCodes.has(task.taskCode)) invalidPlan(`Task code ${task.taskCode} is duplicated.`);
        taskCodes.add(task.taskCode);
        const project = projects.get(task.projectId);
        const milestone = milestones.get(task.milestoneId);
        if (!project || !milestone || milestone.projectId !== task.projectId) {
            invalidPlan(`Task ${task.id} must reference a milestone in its declared project.`);
        }
        validateRequiredCapabilities(task);
        validateAcceptanceDefinitions(task);
    }
    for (const milestone of plan.milestones) {
        if (!projects.has(milestone.projectId)) invalidPlan(`Milestone ${milestone.id} references an unknown project.`);
        if (!plan.tasks.some((task) => task.milestoneId === milestone.id)) {
            invalidPlan(`Milestone ${milestone.id} must contain at least one task.`);
        }
    }

    try {
        assertTaskDependencyGraph(plan.tasks.map(({ id }) => ({ id, status: TaskStatus.CREATED })), plan.dependencies);
    }
    catch (error) {
        invalidPlan(error instanceof Error ? error.message : 'Task dependency graph is invalid.');
    }
    return plan;
}

function validateRequiredCapabilities(task) {
    if (task.requiredCapabilities === undefined) return;
    if (!Array.isArray(task.requiredCapabilities) || task.requiredCapabilities.length > 32
        || task.requiredCapabilities.some((capability) => typeof capability !== 'string'
            || !capability.trim() || capability.trim().length > 100)
        || new Set(task.requiredCapabilities.map((capability) => capability.trim().toLocaleLowerCase('en-US'))).size
            !== task.requiredCapabilities.length) {
        invalidPlan(`Task ${task.id} has malformed or duplicate required capabilities.`);
    }
}

function indexUnique(items, label, validate) {
    const records = new Map();
    for (const item of items) {
        if (!item || !isText(item.id) || !validate(item) || records.has(item.id)) {
            invalidPlan(`Every ${label} requires a unique identifier and its required fields.`);
        }
        records.set(item.id, item);
    }
    return records;
}

function validateAcceptanceDefinitions(task) {
    if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
        invalidPlan(`Task ${task.id} requires acceptance criteria.`);
    }
    const ids = new Set();
    let hasRequired = false;
    for (const criterion of task.acceptanceCriteria) {
        if (!criterion || !isText(criterion.id) || !isText(criterion.description)
            || typeof criterion.required !== 'boolean' || typeof criterion.met !== 'boolean'
            || ids.has(criterion.id)) {
            invalidPlan(`Task ${task.id} has malformed or duplicate acceptance criteria.`);
        }
        ids.add(criterion.id);
        hasRequired ||= criterion.required;
    }
    if (!hasRequired) invalidPlan(`Task ${task.id} requires at least one required acceptance criterion.`);
}

function isText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function invalidPlan(message) {
    throw new DomainInvariantError('invalid-execution-plan', message);
}
