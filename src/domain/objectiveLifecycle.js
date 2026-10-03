import { ObjectiveStatus } from '../constants';
import { DomainInvariantError } from './errors';
import { assertObjectiveInvariant } from './invariants';
/**
 * Explicit objective lifecycle policy. COMPLETED and FAILED are terminal;
 * QUESTIONING may return to analysis after answers or proceed to planning.
 *
 * NEW -> ANALYZING, FAILED
 * ANALYZING -> QUESTIONING, PLANNING, FAILED
 * QUESTIONING -> ANALYZING, PLANNING, FAILED
 * PLANNING -> ACTIVE, FAILED
 * ACTIVE -> PAUSED, COMPLETED, FAILED
 * PAUSED -> ACTIVE, FAILED
 */
export const OBJECTIVE_TRANSITIONS = {
    [ObjectiveStatus.NEW]: [ObjectiveStatus.ANALYZING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.ANALYZING]: [ObjectiveStatus.QUESTIONING, ObjectiveStatus.PLANNING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.QUESTIONING]: [ObjectiveStatus.ANALYZING, ObjectiveStatus.PLANNING, ObjectiveStatus.FAILED],
    [ObjectiveStatus.PLANNING]: [ObjectiveStatus.ACTIVE, ObjectiveStatus.FAILED],
    [ObjectiveStatus.ACTIVE]: [ObjectiveStatus.PAUSED, ObjectiveStatus.COMPLETED, ObjectiveStatus.FAILED],
    [ObjectiveStatus.PAUSED]: [ObjectiveStatus.ACTIVE, ObjectiveStatus.FAILED],
    [ObjectiveStatus.COMPLETED]: [],
    [ObjectiveStatus.FAILED]: [],
};
/** Return whether a status change is explicitly allowed by the lifecycle. */
export function canTransitionObjective(from, to) {
    if (!isObjectiveStatus(from) || !isObjectiveStatus(to))
        return false;
    return OBJECTIVE_TRANSITIONS[from].includes(to);
}
/** Reject an undocumented transition with a stable domain error. */
export function assertObjectiveTransition(from, to) {
    if (!canTransitionObjective(from, to)) {
        throw new DomainInvariantError('invalid-objective-transition', `Objective cannot transition from ${String(from)} to ${String(to)}.`);
    }
}
/** Return a new objective with the requested status, leaving the input intact. */
export function transitionObjective(objective, to) {
    assertObjectiveInvariant(objective);
    assertObjectiveTransition(objective.status, to);
    return { ...objective, status: to };
}
function isObjectiveStatus(value) {
    return typeof value === 'string' && Object.values(ObjectiveStatus).includes(value);
}
