/** Phase 016 — deterministic task progress aggregation. */
import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../src/constants';
import { calculateTaskProgress, DomainInvariantError } from '../src/domain';

const task = (status) => ({ status });

describe('Phase 016 — task progress', () => {
    it('returns zero progress for empty and all-cancelled sets', () => {
        expect(calculateTaskProgress([])).toEqual({
            total: 0, completed: 0, failed: 0, cancelled: 0, active: 0,
            notStarted: 0, eligible: 0, completionPercentage: 0,
        });
        expect(calculateTaskProgress([task(TaskStatus.CANCELLED)])).toMatchObject({
            total: 1, cancelled: 1, eligible: 0, completionPercentage: 0,
        });
    });

    it('excludes cancelled tasks while failed tasks remain unfinished', () => {
        const progress = calculateTaskProgress([
            task(TaskStatus.COMPLETED), task(TaskStatus.COMPLETED),
            task(TaskStatus.FAILED), task(TaskStatus.CANCELLED),
            task(TaskStatus.IN_PROGRESS), task(TaskStatus.CREATED),
        ]);
        expect(progress).toEqual({
            total: 6, completed: 2, failed: 1, cancelled: 1, active: 1,
            notStarted: 1, eligible: 5, completionPercentage: 40,
        });
    });

    it('calculates exact boundaries and recognizes each task lifecycle state', () => {
        expect(calculateTaskProgress([task(TaskStatus.COMPLETED)]).completionPercentage).toBe(100);
        expect(calculateTaskProgress([task(TaskStatus.FAILED)]).completionPercentage).toBe(0);
        const progress = calculateTaskProgress(Object.values(TaskStatus).map(task));
        expect(progress).toMatchObject({ total: 9, completed: 1, failed: 1, cancelled: 1, active: 4, notStarted: 2 });
    });

    it('rejects malformed task collections and unsupported statuses', () => {
        expect(() => calculateTaskProgress(null)).toThrowError(DomainInvariantError);
        expect(() => calculateTaskProgress([{}])).toThrowError(expect.objectContaining({
            code: 'invalid-task-progress-status',
        }));
    });
});
