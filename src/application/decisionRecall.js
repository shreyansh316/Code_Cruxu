import { createEntityId, DomainInvariantError } from '../domain';
import { createUseCase } from './useCase';

/** Search decision records inside one organization after an injected read authorization check. */
export function createDecisionRecallUseCase({ decisionRepository, authorize } = {}) {
    if (typeof decisionRepository?.searchByOrganization !== 'function' || typeof authorize !== 'function') {
        throw new TypeError('Decision recall requires an organization-scoped repository and authorization port.');
    }
    return createUseCase({ name: 'engineering-decision-recall', dependencies: { decisionRepository, authorize },
        execute: ({ input, dependencies }) => {
            const actorId = createEntityId(input?.actorId);
            const organizationId = createEntityId(input?.organizationId);
            if (typeof input?.query !== 'string' || input.query.trim().length < 2 || input.query.length > 200
                || !Number.isInteger(input.limit ?? 10) || (input.limit ?? 10) < 1 || (input.limit ?? 10) > 50) {
                throw new DomainInvariantError('invalid-decision-recall-query', 'Decision recall query or limit is invalid.');
            }
            let allowed = false;
            try { allowed = dependencies.authorize(Object.freeze({ actorId, organizationId })) === true; }
            catch { allowed = false; }
            if (!allowed) throw new DomainInvariantError('decision-recall-forbidden', 'The actor cannot search decisions in this organization.');
            return Object.freeze(dependencies.decisionRepository.searchByOrganization(organizationId, input.query,
                { limit: input.limit ?? 10 }));
        } });
}
