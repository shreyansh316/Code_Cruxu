import { EventType } from '../constants';
import { DomainInvariantError } from './errors';
import { createEntityId } from './values';

export const DOMAIN_EVENT_VERSION = 1;

/** Create a validated, versioned event envelope with a plain object payload. */
export function createDomainEvent({ eventId, type, aggregateId, occurredAt, payload }) {
    if (!Object.values(EventType).includes(type)) {
        throw new DomainInvariantError('invalid-domain-event', 'Event type is not supported.');
    }
    const validId = (value, label) => {
        try {
            return createEntityId(value);
        }
        catch {
            throw new DomainInvariantError('invalid-domain-event', `${label} must be a valid entity identifier.`);
        }
    };
    if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt))
        || new Date(occurredAt).toISOString() !== occurredAt) {
        throw new DomainInvariantError('invalid-domain-event', 'Event timestamp must be a canonical ISO-8601 UTC timestamp.');
    }
    if (!isPlainObject(payload)) {
        throw new DomainInvariantError('invalid-domain-event', 'Event payload must be a plain object.');
    }
    return Object.freeze({
        eventId: validId(eventId, 'Event id'),
        version: DOMAIN_EVENT_VERSION,
        type,
        aggregateId: validId(aggregateId, 'Aggregate id'),
        occurredAt,
        payload: Object.freeze({ ...payload }),
    });
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
