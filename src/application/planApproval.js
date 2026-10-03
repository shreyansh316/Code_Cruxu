import { AgentRole } from '../constants';
import { assertExecutionPlan, recordPlanDecision } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Approve/reject only after resolving the approver's persisted organization role. */
export function createPlanApprovalUseCase({ agentRepository, clock } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof clock?.now !== 'function') {
        throw new TypeError('Plan approval requires an agent repository and clock port.');
    }
    return createUseCase({
        name: 'plan-approval', dependencies: { agentRepository, clock },
        execute: ({ input, dependencies }) => {
            assertExecutionPlan(input?.plan);
            const agent = dependencies.agentRepository.getById(input.approverId);
            if (!agent || agent.role !== AgentRole.CEO) {
                throw new ApplicationError('plan-approval-forbidden', 'Only the CEO agent may decide an execution plan.');
            }
            const now = dependencies.clock.now();
            const decidedAt = (now instanceof Date ? now : new Date(now)).toISOString();
            return recordPlanDecision(input.plan, {
                decision: input.decision, approverId: agent.id, approverRole: agent.role, decidedAt,
            });
        },
    });
}
