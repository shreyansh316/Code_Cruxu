import { AgentLifecycleStatus } from '../constants';
import { DomainInvariantError } from './errors';
import { evaluateAgentLifecycleTransition } from '../shared/agentLifecyclePolicy';

/** Apply a valid personnel lifecycle transition without changing availability status. */
export function transitionAgentLifecycle(current, next) {
    if (!Object.values(AgentLifecycleStatus).includes(current) || !Object.values(AgentLifecycleStatus).includes(next)) {
        throw new DomainInvariantError('invalid-agent-lifecycle', 'Agent lifecycle states must be ACTIVE, SUSPENDED, or RETIRED.');
    }
    try { return evaluateAgentLifecycleTransition(current, next); }
    catch (error) {
        throw new DomainInvariantError('invalid-agent-lifecycle-transition', error.message);
    }
}

/** Availability combines operational status with lifecycle eligibility. */
export function isAgentAvailable(agent) {
    return Boolean(agent && (agent.lifecycleStatus === undefined || agent.lifecycleStatus === AgentLifecycleStatus.ACTIVE)
        && !['OFFLINE', 'ERROR'].includes(agent.status));
}
