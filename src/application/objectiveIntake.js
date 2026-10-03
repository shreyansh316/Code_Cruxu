import { ObjectiveStatus } from '../constants';
import { assertObjectiveInvariant, createEntityId } from '../domain';
import { DomainInvariantError } from '../domain/errors';
import { createUseCase } from './useCase';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;

/** Construct the CEO objective intake use case from storage and ID ports. */
export function createObjectiveIntakeUseCase({ objectiveRepository, idFactory } = {}) {
    if (typeof objectiveRepository?.create !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Objective intake requires an objective repository and identifier factory.');
    }
    return createUseCase({
        name: 'objective-intake',
        dependencies: { objectiveRepository, idFactory },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.title !== 'string' || typeof input.description !== 'string') {
                throw new DomainInvariantError('invalid-objective-request', 'Objective title and description are required.');
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
            const objective = {
                id: createEntityId(dependencies.idFactory()),
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
