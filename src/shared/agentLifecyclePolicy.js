const TRANSITIONS = Object.freeze({
    ACTIVE: new Set(['SUSPENDED', 'RETIRED']),
    SUSPENDED: new Set(['ACTIVE', 'RETIRED']),
    RETIRED: new Set(),
});

/** Persistence-neutral lifecycle transition validation shared by domain and storage adapters. */
export function evaluateAgentLifecycleTransition(current, next) {
    if (!Object.hasOwn(TRANSITIONS, current) || !Object.hasOwn(TRANSITIONS, next)) {
        throw new TypeError('Agent lifecycle states must be ACTIVE, SUSPENDED, or RETIRED.');
    }
    if (current === next) return Object.freeze({ lifecycleStatus: current, changed: false });
    if (!TRANSITIONS[current].has(next)) throw new TypeError(`An agent cannot transition from ${current} to ${next}.`);
    return Object.freeze({ lifecycleStatus: next, changed: true });
}
