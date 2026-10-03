/** Phase 034 — typed execution plan validation. */
import { describe, expect, it } from 'vitest';
import { assertExecutionPlan, DomainInvariantError } from '../src/domain';

const plan = () => ({
    id: 'plan-1', objectiveId: 'objective-1',
    projects: [{ id: 'project-1', name: 'Project One' }],
    milestones: [
        { id: 'milestone-1', projectId: 'project-1', title: 'Foundation' },
        { id: 'milestone-2', projectId: 'project-1', title: 'Delivery' },
    ],
    tasks: [
        { id: 'task-1', taskCode: 'PLAN-001', title: 'Build', projectId: 'project-1', milestoneId: 'milestone-1',
            acceptanceCriteria: [{ id: 'criterion-1', description: 'Build succeeds', required: true, met: false }] },
        { id: 'task-2', taskCode: 'PLAN-002', title: 'Verify', projectId: 'project-1', milestoneId: 'milestone-2',
            acceptanceCriteria: [{ id: 'criterion-2', description: 'Checks pass', required: true, met: false }] },
    ],
    dependencies: [{ dependentTaskId: 'task-2', dependencyTaskId: 'task-1' }],
});

describe('Phase 034 — execution plan validation', () => {
    it('accepts plans with valid project, milestone, dependency, and acceptance links', () => {
        const value = plan();
        expect(assertExecutionPlan(value)).toBe(value);
    });

    it('rejects plans missing milestones, tasks, or required acceptance checks', () => {
        for (const alter of [
            (value) => { value.milestones = []; },
            (value) => { value.tasks = []; },
            (value) => { value.tasks[0].acceptanceCriteria[0].required = false; },
            (value) => { value.tasks[1].acceptanceCriteria = []; },
            (value) => { value.tasks[0].milestoneId = 'unknown'; },
        ]) {
            const value = plan();
            alter(value);
            expect(() => assertExecutionPlan(value)).toThrowError(expect.objectContaining({ code: 'invalid-execution-plan' }));
        }
    });

    it('rejects duplicate identifiers/codes and cyclic or unknown task dependencies', () => {
        const duplicate = plan();
        duplicate.tasks[1].taskCode = duplicate.tasks[0].taskCode;
        expect(() => assertExecutionPlan(duplicate)).toThrowError(DomainInvariantError);
        const cycle = plan();
        cycle.dependencies.push({ dependentTaskId: 'task-1', dependencyTaskId: 'task-2' });
        expect(() => assertExecutionPlan(cycle)).toThrowError(/cycles/);
        const unknown = plan();
        unknown.dependencies[0].dependencyTaskId = 'missing';
        expect(() => assertExecutionPlan(unknown)).toThrowError(DomainInvariantError);
    });
});
