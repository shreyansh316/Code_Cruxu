import { AgentRole } from '../constants';
import { assertExecutionPlan, isAgentAvailable, recordPlanDecision } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Approve/reject only after resolving the approver's persisted organization role. */
export function createPlanApprovalUseCase({ agentRepository, objectiveRepository, clock } = {}) {
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
            if (!isAgentAvailable(agent)) {
                throw new ApplicationError('plan-approval-forbidden', 'The approving CEO must be available and active.');
            }
            if (objectiveRepository) {
                const objective = objectiveRepository.getById(input.plan.objectiveId);
                if (!objective || !objective.organizationId || objective.organizationId !== agent.organizationId) {
                    throw new ApplicationError('plan-approval-scope-denied', 'The CEO and plan objective must belong to the same persisted organization.');
                }
            }
            const now = dependencies.clock.now();
            const decidedAt = (now instanceof Date ? now : new Date(now)).toISOString();
            return recordPlanDecision(input.plan, {
                decision: input.decision, approverId: agent.id, approverRole: agent.role, decidedAt,
            });
        },
    });
}
