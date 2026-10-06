import { assertEntityId } from '../../shared/identifiers';

const QUEUE_STATES = new Set(['QUEUED', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED']);
const QUEUE_TRANSITIONS = {
    QUEUED: new Set(['CLAIMED', 'FAILED', 'CANCELLED']),
    CLAIMED: new Set(['QUEUED', 'COMPLETED', 'FAILED', 'CANCELLED']),
    COMPLETED: new Set(),
    CANCELLED: new Set(),
};
const MAX_QUEUE_LIMIT = 1000;

/** Durable task queue with validated, compare-and-set state transitions. */
export class ExecutionQueueRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function') {
            throw new TypeError('ExecutionQueueRepository requires a SQLite database handle.');
        }
        this.database = database;
    }

    enqueue({ id, taskId }) {
        id = assertEntityId(id, 'Queue entry id');
        taskId = assertEntityId(taskId, 'Queued task id');
        this.database.prepare('INSERT INTO execution_queue (id, task_id) VALUES (?, ?)').run(id, taskId);
        return this.getByTaskId(taskId);
    }

    getByTaskId(taskId) {
        taskId = assertEntityId(taskId, 'Queued task id');
        return this.database.prepare(`SELECT id, task_id AS taskId, state, queued_at AS queuedAt,
          updated_at AS updatedAt FROM execution_queue WHERE task_id = ?`).get(taskId);
    }

    listByState(state = 'QUEUED', { limit = 100 } = {}) {
        if (!QUEUE_STATES.has(state)) throw new TypeError('Unsupported execution queue state.');
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUEUE_LIMIT) {
            throw new TypeError(`Execution queue limit must be between 1 and ${MAX_QUEUE_LIMIT}.`);
        }
        return this.database.prepare(`SELECT q.id, q.task_id AS taskId, q.state,
          q.queued_at AS queuedAt, q.updated_at AS updatedAt
          FROM execution_queue q JOIN tasks t ON t.id = q.task_id
          WHERE q.state = ? ORDER BY t.priority DESC, q.queued_at, q.task_id LIMIT ?`).all(state, limit);
    }

    transition(taskId, expectedState, nextState) {
        taskId = assertEntityId(taskId, 'Queued task id');
        if (!QUEUE_STATES.has(expectedState) || !QUEUE_TRANSITIONS[expectedState].has(nextState)) {
            throw new TypeError('Unsupported execution queue state transition.');
        }
        const changed = this.database.prepare(`UPDATE execution_queue SET state = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE task_id = ? AND state = ?`)
            .run(nextState, taskId, expectedState).changes;
        return changed === 1 ? this.getByTaskId(taskId) : null;
    }

    /** Reopen a completed queue entry only while review has returned its task to work. */
    requeueAfterReview(taskId) {
        taskId = assertEntityId(taskId, 'Queued task id');
        const changed = this.database.prepare(`UPDATE execution_queue SET state = 'QUEUED',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE task_id = ? AND state = 'COMPLETED'
            AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND status = 'IN_PROGRESS')`)
            .run(taskId, taskId).changes;
        return changed === 1 ? this.getByTaskId(taskId) : null;
    }
}
