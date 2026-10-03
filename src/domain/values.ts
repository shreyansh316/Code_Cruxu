import { DomainInvariantError } from './errors';
import type { EntityId, Slug } from '../shared/identifiers';

export type { EntityId, Slug } from '../shared/identifiers';

export function createEntityId(value: unknown): EntityId {
  if (typeof value !== 'string') {
    throw new DomainInvariantError('invalid-identifier', 'Entity identifiers must be strings.');
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainInvariantError('invalid-identifier', 'Entity identifiers must not be empty.');
  }
  return normalized as EntityId;
}

export function createSlug(value: unknown): Slug {
  if (typeof value !== 'string') {
    throw new DomainInvariantError('invalid-slug', 'Slugs must be strings.');
  }
  const normalized = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new DomainInvariantError(
      'invalid-slug',
      'Slugs must use lowercase letters and digits separated by single hyphens.',
    );
  }
  return normalized as Slug;
}
