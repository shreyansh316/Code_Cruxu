/** Phase 020 — versioned domain event contracts. */
import { describe, expect, it } from 'vitest';
import { EventType } from '../src/constants';
import { createDomainEvent, DOMAIN_EVENT_VERSION, DomainInvariantError } from '../src/domain';

const input = (overrides = {}) => ({
    eventId: 'event-1', type: EventType.TASK_CREATED, aggregateId: 'task-1',
    occurredAt: '2026-10-03T12:00:00.000Z', payload: { taskId: 'task-1' }, ...overrides,
});

describe('Phase 020 — domain event contracts', () => {
    it('creates an immutable, versioned event envelope', () => {
        const event = createDomainEvent(input());
        expect(event).toEqual({ ...input(), version: DOMAIN_EVENT_VERSION });
        expect(Object.isFrozen(event)).toBe(true);
        expect(Object.isFrozen(event.payload)).toBe(true);
    });

    it('accepts all currently defined event types', () => {
        for (const type of Object.values(EventType)) {
            expect(createDomainEvent(input({ type })).type).toBe(type);
        }
    });

    it('rejects unknown types, malformed identifiers, timestamps, and non-object payloads', () => {
        for (const overrides of [
            { type: 'UNKNOWN' }, { eventId: '' }, { aggregateId: '   ' },
            { occurredAt: 'not-a-date' }, { occurredAt: '2026-10-03' },
            { payload: [] }, { payload: null }, { payload: new Date() },
        ]) {
            expect(() => createDomainEvent(input(overrides))).toThrowError(DomainInvariantError);
        }
    });
});
