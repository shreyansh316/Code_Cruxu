/** Phase 014 — task dependency validation and readiness. */
import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../src/constants';
import { assertTaskDependencyGraph, DomainInvariantError, getTaskReadiness } from '../src/domain';

function task(id, status = TaskStatus.CREATED) {
    return { id, status };
}

function edge(dependentTaskId, dependencyTaskId) {
    return { dependentTaskId, dependencyTaskId };
}

describe('Phase 014 — task dependencies', () => {
    it('accepts a valid acyclic graph, including an empty graph', () => {
        const tasks = [task('foundation'), task('feature'), task('verification')];
        expect(() => assertTaskDependencyGraph(tasks, [
            edge('feature', 'foundation'),
            edge('verification', 'feature'),
        ])).not.toThrow();
        expect(() => assertTaskDependencyGraph([], [])).not.toThrow();
    });

    it('rejects self-links, duplicate edges, unknown references, and duplicate tasks', () => {
        const tasks = [task('one'), task('two')];
        for (const dependencies of [
            [edge('one', 'one')],
            [edge('two', 'one'), edge('two', 'one')],
            [edge('missing', 'one')],
            [edge('one', 'missing')],
        ]) {
            expect(() => assertTaskDependencyGraph(tasks, dependencies))
                .toThrowError(expect.objectContaining({ code: 'invalid-task-dependency' }));
        }
        expect(() => assertTaskDependencyGraph([task('one'), task('one')], []))
            .toThrowError(DomainInvariantError);
    });

    it('rejects direct and longer dependency cycles', () => {
        const tasks = [task('one'), task('two'), task('three')];
        expect(() => assertTaskDependencyGraph(tasks, [edge('one', 'two'), edge('two', 'one')]))
            .toThrowError(/must not contain cycles/);
        expect(() => assertTaskDependencyGraph(tasks, [
            edge('one', 'two'), edge('two', 'three'), edge('three', 'one'),
        ])).toThrowError(expect.objectContaining({ code: 'invalid-task-dependency' }));
    });

    it('calculates dependency readiness and returns stable blockers', () => {
        const tasks = [
            task('ready', TaskStatus.ASSIGNED),
            task('waiting', TaskStatus.CREATED),
            task('blocked-a', TaskStatus.IN_PROGRESS),
            task('blocked-z', TaskStatus.FAILED),
        ];
        const dependencies = [edge('waiting', 'blocked-z'), edge('waiting', 'blocked-a')];
        expect(getTaskReadiness('ready', tasks, dependencies)).toEqual({ ready: true, blockedBy: [] });
        expect(getTaskReadiness('waiting', tasks, dependencies)).toEqual({
            ready: false,
            blockedBy: ['blocked-a', 'blocked-z'],
        });
        expect(getTaskReadiness('waiting', tasks.map((entry) => entry.id === 'blocked-a'
            ? task(entry.id, TaskStatus.COMPLETED)
            : entry), dependencies)).toEqual({ ready: false, blockedBy: ['blocked-z'] });
    });

    it('unblocks a task only after every direct prerequisite is completed', () => {
        const tasks = [task('one', TaskStatus.COMPLETED), task('two', TaskStatus.COMPLETED), task('three')];
        expect(getTaskReadiness('three', tasks, [edge('three', 'one'), edge('three', 'two')]))
            .toEqual({ ready: true, blockedBy: [] });
        expect(() => getTaskReadiness('unknown', tasks, [])).toThrowError(DomainInvariantError);
        expect(() => assertTaskDependencyGraph([task('one', 'INVALID')], []))
            .toThrowError(DomainInvariantError);
    });
});
