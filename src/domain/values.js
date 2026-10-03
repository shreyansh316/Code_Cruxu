import { DomainInvariantError } from './errors';
import { assertEntityId } from '../shared/identifiers';
export function createEntityId(value) {
    try {
        return assertEntityId(value);
    }
    catch {
        throw new DomainInvariantError('invalid-identifier', 'Entity identifiers must not be empty.');
    }
}
export function createSlug(value) {
    if (typeof value !== 'string') {
        throw new DomainInvariantError('invalid-slug', 'Slugs must be strings.');
    }
    const normalized = value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
        throw new DomainInvariantError('invalid-slug', 'Slugs must use lowercase letters and digits separated by single hyphens.');
    }
    return normalized;
}
