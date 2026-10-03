import { AgentRole } from '../constants';
import { DomainInvariantError } from './errors';
import { assertExecutionPlan } from './executionPlan';

export const PlanDecision = Object.freeze({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' });

/** Attach a one-time CEO decision to a validated plan. */
export function recordPlanDecision(plan, { decision, approverId, approverRole, decidedAt } = {}) {
    assertExecutionPlan(plan);
    if (plan.approval) {
        throw new DomainInvariantError('plan-already-decided', 'A plan decision cannot be replaced.');
    }
    if (!Object.values(PlanDecision).includes(decision) || approverRole !== AgentRole.CEO
        || typeof approverId !== 'string' || approverId.trim() === ''
        || typeof decidedAt !== 'string' || !Number.isFinite(Date.parse(decidedAt))
        || new Date(decidedAt).toISOString() !== decidedAt) {
        throw new DomainInvariantError('invalid-plan-decision', 'A CEO decision requires an identifier and canonical decision timestamp.');
    }
    const approval = Object.freeze({ decision, approverId: approverId.trim(), approverRole, decidedAt });
    return Object.freeze({ ...plan, approval });
}

/** Guard every transition that would enqueue or start execution. */
export function assertPlanApproved(plan) {
    assertExecutionPlan(plan);
    if (plan.approval?.decision !== PlanDecision.APPROVED
        || plan.approval.approverRole !== AgentRole.CEO
        || typeof plan.approval.approverId !== 'string'
        || typeof plan.approval.decidedAt !== 'string'
        || !Number.isFinite(Date.parse(plan.approval.decidedAt))
        || new Date(plan.approval.decidedAt).toISOString() !== plan.approval.decidedAt) {
        throw new DomainInvariantError('plan-not-approved', 'CEO approval is required before execution can begin.');
    }
    return plan;
}
