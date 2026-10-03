/** Stable error contract for invalid domain values and relationships. */
export type DomainInvariantCode =
  | 'invalid-identifier'
  | 'invalid-slug'
  | 'invalid-entity'
  | 'invalid-hierarchy';

export class DomainInvariantError extends Error {
  constructor(
    readonly code: DomainInvariantCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainInvariantError';
  }
}
