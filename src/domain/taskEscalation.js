import { AgentRole } from '../constants';
import { DomainInvariantError } from './errors';

const ESCALATION_TARGET = {
    [AgentRole.EMPLOYEE]: AgentRole.DEPT_MANAGER,
    [AgentRole.DEPT_MANAGER]: AgentRole.HEAD_MANAGER,
    [AgentRole.HEAD_MANAGER]: AgentRole.DIRECTOR,
    [AgentRole.DIRECTOR]: AgentRole.CEO,
};
const ESCALATION_TRIGGERS = new Set(['BLOCKED', 'RETRIES_EXHAUSTED']);

/** Route blocked or exhausted work exactly one level up the organization. */
export function getTaskEscalationRoute(sourceRole, trigger) {
    if (!Object.values(AgentRole).includes(sourceRole) || !ESCALATION_TRIGGERS.has(trigger)) {
        throw new DomainInvariantError('invalid-task-escalation', 'Escalation requires a valid role and trigger.');
    }
    const targetRole = ESCALATION_TARGET[sourceRole];
    if (!targetRole) {
        throw new DomainInvariantError('task-escalation-unavailable', `${sourceRole} has no higher escalation route.`);
    }
    return { sourceRole, targetRole, trigger };
}
