import { createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Add immutable decision lineage only when the actor participates in both records. */
export function createLinkEngineeringDecisionsUseCase({ decisionRepository, taskRepository, agentRepository,
    auditRepository, unitOfWork, idFactory } = {}) {
    if (typeof decisionRepository?.createLink !== 'function'
        || typeof decisionRepository?.getOrganizationIdForDecision !== 'function'
        || typeof decisionRepository?.getDecisionTaskId !== 'function'
        || typeof taskRepository?.getById !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof unitOfWork?.run !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Decision lineage requires decision, task, agent, audit, transaction, and ID ports.');
    }
    return createUseCase({ name: 'engineering-decision-lineage', dependencies: {
        decisionRepository, taskRepository, agentRepository, auditRepository, unitOfWork, idFactory,
    }, execute: ({ input, dependencies }) => {
        const sourceDecisionId = createEntityId(input?.sourceDecisionId);
        const targetDecisionId = createEntityId(input?.targetDecisionId);
        const authorId = createEntityId(input?.authorId);
        if (sourceDecisionId === targetDecisionId || !['SUPERSEDES', 'RELATED_TO'].includes(input?.relationship)) {
            throw new DomainInvariantError('invalid-decision-link', 'Select two different decisions and a supported relationship.');
        }
        const sourceTaskId = dependencies.decisionRepository.getDecisionTaskId(sourceDecisionId);
        const targetTaskId = dependencies.decisionRepository.getDecisionTaskId(targetDecisionId);
        if (!sourceTaskId || !targetTaskId) throw new ApplicationError('decision-not-found', 'Both linked decisions must exist.');
        const actor = dependencies.agentRepository.getById(authorId);
        const sourceTask = dependencies.taskRepository.getById(sourceTaskId);
        const targetTask = dependencies.taskRepository.getById(targetTaskId);
        if (!actor || !sourceTask || !targetTask) throw new ApplicationError('decision-link-scope-unavailable', 'Decision ownership could not be verified.');
        const participates = (task) => task.creatorId === authorId || task.assigneeId === authorId;
        if (!participates(sourceTask) || !participates(targetTask)) {
            throw new DomainInvariantError('decision-link-forbidden', 'The author must participate in both decision tasks.');
        }
        const organizationId = dependencies.decisionRepository.getOrganizationIdForDecision(sourceDecisionId);
        if (!organizationId || organizationId !== dependencies.decisionRepository.getOrganizationIdForDecision(targetDecisionId)) {
            throw new DomainInvariantError('decision-link-cross-organization', 'Decision links cannot cross organizations.');
        }
        return dependencies.unitOfWork.run(() => {
            const link = dependencies.decisionRepository.createLink({ id: createEntityId(dependencies.idFactory()),
                sourceDecisionId, targetDecisionId, relationship: input.relationship, authorId });
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                action: 'ENGINEERING_DECISIONS_LINKED', entity: 'engineering-decision-link', entityId: link.id,
                actorId: authorId, taskId: sourceTaskId,
                details: { sourceDecisionId, targetDecisionId, targetTaskId, relationship: input.relationship } });
            return link;
        });
    } });
}
