/** Phase 017 — task acceptance criteria validation. */
import { describe, expect, it } from 'vitest';
import { DomainInvariantError, validateTaskAcceptanceCriteria } from '../src/domain';

describe('Phase 017 — task acceptance criteria', () => {
    it('allows completion when all required criteria are met', () => {
        expect(validateTaskAcceptanceCriteria([
            { id: 'a', description: 'Build succeeds', required: true, met: true },
            { id: 'b', description: 'Optional polish', required: false, met: false },
        ])).toEqual({ valid: true, unmetRequired: [] });
    });

    it('rejects completion when required criteria are unmet and lists them deterministically', () => {
        expect(validateTaskAcceptanceCriteria([
            { id: 'z', description: 'Security review', required: true, met: false },
            { id: 'a', description: 'Tests pass', required: true, met: false },
            { id: 'optional', description: 'Optional', required: false, met: false },
        ])).toEqual({ valid: false, unmetRequired: ['a', 'z'] });
    });

    it('accepts an empty criteria list and rejects malformed or duplicate criteria', () => {
        expect(validateTaskAcceptanceCriteria([])).toEqual({ valid: true, unmetRequired: [] });
        expect(() => validateTaskAcceptanceCriteria({})).toThrowError(DomainInvariantError);
        expect(() => validateTaskAcceptanceCriteria([
            { id: 'same', description: 'A', required: true, met: true },
            { id: 'same', description: 'B', required: true, met: true },
        ])).toThrowError(expect.objectContaining({ code: 'invalid-task-acceptance-criteria' }));
    });
});
