import { TaskStatus } from '../constants';
import { DomainInvariantError } from './errors';

const ACTIVE_STATUSES = new Set([
    TaskStatus.STARTED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.REVIEW,
]);
const NOT_STARTED_STATUSES = new Set([TaskStatus.CREATED, TaskStatus.ASSIGNED]);

/** Aggregate task progress deterministically from each task's persisted state.
 * Cancelled tasks are excluded from the completion denominator; failed tasks
 * remain unfinished work. An empty denominator has a 0% completion rate.
 */
export function calculateTaskProgress(tasks) {
    if (!Array.isArray(tasks)) {
        throw new DomainInvariantError('invalid-task-progress-input', 'Tasks must be an array.');
    }

    const counts = {
        total: tasks.length,
        completed: 0,
        failed: 0,
        cancelled: 0,
        active: 0,
        notStarted: 0,
    };

    for (const task of tasks) {
        if (!task || !Object.values(TaskStatus).includes(task.status)) {
            throw new DomainInvariantError('invalid-task-progress-status', 'Every task must have a supported status.');
        }
        if (task.status === TaskStatus.COMPLETED) {
            counts.completed += 1;
        }
        else if (task.status === TaskStatus.FAILED) {
            counts.failed += 1;
        }
        else if (task.status === TaskStatus.CANCELLED) {
            counts.cancelled += 1;
        }
        else if (ACTIVE_STATUSES.has(task.status)) {
            counts.active += 1;
        }
        else if (NOT_STARTED_STATUSES.has(task.status)) {
            counts.notStarted += 1;
        }
    }

    const eligible = counts.total - counts.cancelled;
    return {
        ...counts,
        eligible,
        completionPercentage: eligible === 0 ? 0 : (counts.completed / eligible) * 100,
    };
}
