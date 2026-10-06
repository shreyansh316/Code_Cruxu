import { AgentRole, ObjectiveStatus } from '../constants';
import { assertObjectiveInvariant, createEntityId } from '../domain';
import { isAgentAvailable } from '../domain/agentLifecycle';
import { DomainInvariantError } from '../domain/errors';
import { ApplicationError, createUseCase } from './useCase';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;

/** Construct the CEO objective intake use case from storage and ID ports. */
export function createObjectiveIntakeUseCase({ objectiveRepository, organizationRepository, agentRepository, idFactory } = {}) {
    if (typeof objectiveRepository?.create !== 'function' || typeof organizationRepository?.getById !== 'function'
        || typeof agentRepository?.getById !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Objective intake requires objective, organization, and persisted identity repositories plus an identifier factory.');
    }
    return createUseCase({
        name: 'objective-intake',
        dependencies: { objectiveRepository, organizationRepository, agentRepository, idFactory },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.title !== 'string' || typeof input.description !== 'string'
                || typeof input.organizationId !== 'string' || !input.organizationId.trim()) {
                throw new DomainInvariantError('invalid-objective-request', 'Objective title, description, and organization are required.');
            }
            const title = input.title.trim();
            const description = input.description.trim();
            if (!title || title.length > MAX_TITLE_LENGTH) {
                throw new DomainInvariantError('invalid-objective-title', `Objective title must contain 1 to ${MAX_TITLE_LENGTH} characters.`);
            }
            if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
                throw new DomainInvariantError('invalid-objective-description',
                    `Objective description must contain 1 to ${MAX_DESCRIPTION_LENGTH} characters.`);
            }
            const organization = dependencies.organizationRepository.getById(createEntityId(input.organizationId));
            if (!organization) throw new DomainInvariantError('objective-organization-not-found', 'The selected objective organization does not exist.');
            const ceo = dependencies.agentRepository.getById(createEntityId(input.ceoId));
            if (!ceo || ceo.role !== AgentRole.CEO || !isAgentAvailable(ceo)) {
                throw new ApplicationError('objective-intake-forbidden', 'Only an active persisted CEO may submit an objective.');
            }
            if (ceo.organizationId !== organization.id) {
                throw new ApplicationError('objective-intake-scope-denied', 'A CEO may submit objectives only for its own organization.');
            }
            const objective = {
                id: createEntityId(dependencies.idFactory()),
                organizationId: organization.id,
                title,
                description,
                status: ObjectiveStatus.NEW,
                priority: 0,
            };
            assertObjectiveInvariant(objective);
            return dependencies.objectiveRepository.create(objective);
        },
    });
}
