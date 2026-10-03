/** Phase 011 — task lifecycle transition rules. */
import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../src/constants';
import { assertTaskTransition, canTransitionTask, createEntityId, DomainInvariantError, TASK_TRANSITIONS, transitionTask, } from '../src/domain';

const task = {
    id: createEntityId('task-lifecycle'),
    taskCode: 'TASK-LIFECYCLE',
    title: 'Exercise task lifecycle',
    status: TaskStatus.CREATED,
    priority: 1,
    retryCount: 0,
    maxRetries: 2,
};

describe('Phase 011 — task lifecycle', () => {
    it('defines a transition list for every task status', () => {
        expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual(Object.values(TaskStatus).sort());
        for (const transitions of Object.values(TASK_TRANSITIONS)) {
            expect(new Set(transitions).size).toBe(transitions.length);
        }
        expect(TASK_TRANSITIONS[TaskStatus.COMPLETED]).toEqual([]);
        expect(TASK_TRANSITIONS[TaskStatus.FAILED]).toEqual([]);
        expect(TASK_TRANSITIONS[TaskStatus.CANCELLED]).toEqual([]);
    });

    it('matches the transition table exhaustively for every status pair', () => {
        const statuses = Object.values(TaskStatus);
        for (const from of statuses) {
            for (const to of statuses) {
                const expected = TASK_TRANSITIONS[from].includes(to);
                expect(canTransitionTask(from, to), `${from} -> ${to}`).toBe(expected);
                if (expected) {
                    expect(() => assertTaskTransition(from, to), `${from} -> ${to}`).not.toThrow();
                }
                else {
                    expect(() => assertTaskTransition(from, to), `${from} -> ${to}`)
                        .toThrowError(expect.objectContaining({ code: 'invalid-task-transition' }));
                }
            }
        }
    });

    it('transitions immutably while preserving the rest of the task', () => {
        const assigned = transitionTask(task, TaskStatus.ASSIGNED);
        expect(assigned).toEqual({ ...task, status: TaskStatus.ASSIGNED });
        expect(assigned).not.toBe(task);
        expect(task.status).toBe(TaskStatus.CREATED);
    });

    it('rejects terminal rewrites and tasks that fail domain validation', () => {
        for (const status of [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]) {
            expect(() => transitionTask({ ...task, status }, TaskStatus.IN_PROGRESS))
                .toThrowError(expect.objectContaining({ code: 'invalid-task-transition' }));
        }
        expect(canTransitionTask('UNKNOWN', TaskStatus.ASSIGNED)).toBe(false);
        expect(() => assertTaskTransition('UNKNOWN', TaskStatus.ASSIGNED))
            .toThrowError(DomainInvariantError);
        expect(() => transitionTask({ ...task, retryCount: 3 }, TaskStatus.ASSIGNED))
            .toThrowError(DomainInvariantError);
    });
});
