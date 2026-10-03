import { TaskStatus } from '../constants';
import { DomainInvariantError } from './errors';
import { assertTaskInvariant } from './invariants';

/**
 * Task progression follows creation, assignment, execution, and review.
 * Active work may be blocked and resumed; terminal states cannot be changed.
 */
export const TASK_TRANSITIONS = {
    [TaskStatus.CREATED]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
    [TaskStatus.ASSIGNED]: [TaskStatus.STARTED, TaskStatus.CANCELLED],
    [TaskStatus.STARTED]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.FAILED, TaskStatus.CANCELLED],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.REVIEW, TaskStatus.FAILED, TaskStatus.CANCELLED],
    [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.FAILED, TaskStatus.CANCELLED],
    [TaskStatus.REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.FAILED],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.FAILED]: [],
    [TaskStatus.CANCELLED]: [],
};

/** Return whether a task status change is explicitly allowed. */
export function canTransitionTask(from, to) {
    if (!isTaskStatus(from) || !isTaskStatus(to))
        return false;
    return TASK_TRANSITIONS[from].includes(to);
}

/** Reject an undocumented transition with a stable domain error. */
export function assertTaskTransition(from, to) {
    if (!canTransitionTask(from, to)) {
        throw new DomainInvariantError('invalid-task-transition', `Task cannot transition from ${String(from)} to ${String(to)}.`);
    }
}

/** Return a new task with the requested status, leaving the input intact. */
export function transitionTask(task, to) {
    assertTaskInvariant(task);
    assertTaskTransition(task.status, to);
    return { ...task, status: to };
}

function isTaskStatus(value) {
    return typeof value === 'string' && Object.values(TaskStatus).includes(value);
}
