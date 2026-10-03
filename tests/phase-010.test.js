/** Phase 010 — objective lifecycle transition rules. */
import { describe, expect, it } from 'vitest';
import { ObjectiveStatus } from '../src/constants';
import { assertObjectiveTransition, canTransitionObjective, createEntityId, DomainInvariantError, transitionObjective, } from '../src/domain';
const EXPECTED_TRANSITIONS = {
    [ObjectiveStatus.NEW]: [ObjectiveStatus.ANALYZING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.ANALYZING]: [ObjectiveStatus.QUESTIONING, ObjectiveStatus.PLANNING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.QUESTIONING]: [ObjectiveStatus.ANALYZING, ObjectiveStatus.PLANNING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.PLANNING]: [ObjectiveStatus.ACTIVE, ObjectiveStatus.FAILED],
    [ObjectiveStatus.ACTIVE]: [ObjectiveStatus.PAUSED, ObjectiveStatus.COMPLETED, ObjectiveStatus.FAILED],
    [ObjectiveStatus.PAUSED]: [ObjectiveStatus.ACTIVE, ObjectiveStatus.FAILED],
    [ObjectiveStatus.COMPLETED]: [],
    [ObjectiveStatus.FAILED]: [],
};
const objective = {
    id: createEntityId('objective-lifecycle'),
    title: 'Complete lifecycle rules',
    description: 'Exercise every objective status transition.',
    status: ObjectiveStatus.NEW,
    priority: 1,
};
describe('Phase 010 — objective lifecycle', () => {
    it('matches the documented transition table for every status pair', () => {
        const statuses = Object.values(ObjectiveStatus);
        for (const from of statuses) {
            for (const to of statuses) {
                const expected = EXPECTED_TRANSITIONS[from].includes(to);
                expect(canTransitionObjective(from, to), `${from} -> ${to}`).toBe(expected);
                if (expected) {
                    expect(() => assertObjectiveTransition(from, to), `${from} -> ${to}`).not.toThrow();
                }
                else {
                    expect(() => assertObjectiveTransition(from, to), `${from} -> ${to}`).toThrowError(expect.objectContaining({ code: 'invalid-objective-transition' }));
                }
            }
        }
    });
    it('transitions immutably while preserving all other objective data', () => {
        const analyzing = transitionObjective(objective, ObjectiveStatus.ANALYZING);
        expect(analyzing).toEqual({ ...objective, status: ObjectiveStatus.ANALYZING });
        expect(analyzing).not.toBe(objective);
        expect(objective.status).toBe(ObjectiveStatus.NEW);
    });
    it('rejects terminal rewrites, self-transitions, and invalid runtime statuses', () => {
        expect(() => transitionObjective({ ...objective, status: ObjectiveStatus.COMPLETED }, ObjectiveStatus.ACTIVE))
            .toThrowError(DomainInvariantError);
        expect(() => transitionObjective(objective, ObjectiveStatus.NEW)).toThrowError(DomainInvariantError);
        expect(canTransitionObjective('UNKNOWN', ObjectiveStatus.ACTIVE)).toBe(false);
        expect(() => assertObjectiveTransition('UNKNOWN', ObjectiveStatus.ACTIVE))
            .toThrowError(DomainInvariantError);
    });
});
