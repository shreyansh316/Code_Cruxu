import { createEntityId, DomainInvariantError } from '../domain';
import { createPlanApprovalUseCase } from './planApproval';
import { ApplicationError, createUseCase } from './useCase';

/** Persist the CEO's validated plan decision in the append-only audit trail. */
export function createPersistedPlanDecision({ agentRepository, objectiveRepository, auditRepository, unitOfWork, clock, idFactory } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof auditRepository?.hasEntityAction !== 'function' || typeof unitOfWork?.run !== 'function'
        || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Persisted plan decisions require identity, audit, transaction, clock, and ID ports.');
    }
    const approval = createPlanApprovalUseCase({ agentRepository, objectiveRepository, clock });
    return createUseCase({ name: 'persisted-plan-decision', dependencies: { agentRepository, auditRepository, unitOfWork, clock, idFactory, approval },
        execute: async ({ input, dependencies }) => {
            const planId = createEntityId(input?.plan?.id);
            const decided = await dependencies.approval.run({ approverId: input.approverId, plan: input.plan, decision: input.decision });
            if (!decided.ok) throw new ApplicationError(decided.error.code, decided.error.message);
            return dependencies.unitOfWork.run(() => {
                if (dependencies.auditRepository.hasEntityAction('execution-plan', planId, 'PLAN_DECISION_RECORDED')) {
                    throw new DomainInvariantError('plan-already-decided', 'A plan decision has already been persisted.');
                }
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()), action: 'PLAN_DECISION_RECORDED',
                    entity: 'execution-plan', entityId: planId, actorId: decided.value.approval.approverId,
                    details: { decision: decided.value.approval.decision, approverRole: decided.value.approval.approverRole,
                        decidedAt: decided.value.approval.decidedAt, objectiveId: decided.value.objectiveId } });
                return decided.value;
            });
        },
    });
}
