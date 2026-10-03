import { DomainInvariantError } from './errors';

/** Validate structured task acceptance criteria before completion. */
export function validateTaskAcceptanceCriteria(criteria) {
    if (!Array.isArray(criteria)) {
        throw new DomainInvariantError('invalid-task-acceptance-criteria', 'Acceptance criteria must be an array.');
    }
    const ids = new Set();
    const unmetRequired = [];
    for (const criterion of criteria) {
        if (!criterion || typeof criterion.id !== 'string' || criterion.id.trim() === ''
            || ids.has(criterion.id) || typeof criterion.description !== 'string'
            || criterion.description.trim() === '' || typeof criterion.required !== 'boolean'
            || typeof criterion.met !== 'boolean') {
            throw new DomainInvariantError('invalid-task-acceptance-criteria',
                'Each criterion requires a unique id, description, required flag, and met flag.');
        }
        ids.add(criterion.id);
        if (criterion.required && !criterion.met) unmetRequired.push(criterion.id);
    }
    unmetRequired.sort();
    return { valid: unmetRequired.length === 0, unmetRequired };
}
