import { EventType } from '../constants';
import { createDomainEvent } from '../domain/events';
import { DomainInvariantError } from '../domain/errors';

const MAX_DISPATCH_EVENTS = 500;
const MAX_RECORDED_ERROR_LENGTH = 2000;

/** Durable SQLite event log with explicitly registered, ordered subscribers. */
export class SqliteEventBus {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function' || typeof database.transaction !== 'function') {
            throw new DomainInvariantError('invalid-event-database', 'A SQLite database handle is required.');
        }
        this.database = database;
        this.subscribers = new Map();
    }

    append(event) {
        const validEvent = createDomainEvent(event);
        let payload;
        try {
            payload = JSON.stringify(validEvent.payload);
        }
        catch {
            throw new DomainInvariantError('invalid-domain-event', 'Event payload must be JSON serializable.');
        }
        this.database.prepare(`
          INSERT INTO events (id, type, payload, processed, event_version, aggregate_id, occurred_at)
          VALUES (?, ?, ?, 0, ?, ?, ?)
        `).run(validEvent.eventId, validEvent.type, payload, validEvent.version,
            validEvent.aggregateId, validEvent.occurredAt);
        return validEvent;
    }

    subscribe({ id, types }, handler) {
        if (typeof id !== 'string' || id.trim() === '' || this.subscribers.has(id)
            || !Array.isArray(types) || types.length === 0
            || types.some((type) => !Object.values(EventType).includes(type))
            || typeof handler !== 'function') {
            throw new DomainInvariantError('invalid-event-subscription',
                'Subscriptions require a unique id, supported event types, and a handler.');
        }
        const subscription = Object.freeze({ id, types: new Set(types), handler });
        this.subscribers.set(id, subscription);
        return { dispose: () => this.subscribers.delete(id) };
    }

    async dispatchPending({ limit = 100 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DISPATCH_EVENTS) {
            throw new DomainInvariantError('invalid-event-dispatch-limit', `Dispatch limit must be between 1 and ${MAX_DISPATCH_EVENTS}.`);
        }
        const events = this.database.prepare('SELECT rowid AS sequence, * FROM events WHERE processed = 0 ORDER BY rowid LIMIT ?').all(limit);
        const deliveries = [];
        for (const row of events) {
            const event = readEvent(row);
            const matching = [...this.subscribers.values()].filter((subscription) => subscription.types.has(event.type));
            for (const subscription of matching) {
                const delivery = this._beginDelivery(event.eventId, subscription.id);
                if (delivery.status === 'SUCCEEDED') continue;
                try {
                    await subscription.handler(event);
                    this._finishDelivery(event.eventId, subscription.id, 'SUCCEEDED', null);
                    deliveries.push({ eventId: event.eventId, subscriberId: subscription.id, status: 'SUCCEEDED', attempts: delivery.attempts + 1, error: null });
                }
                catch (error) {
                    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_RECORDED_ERROR_LENGTH);
                    this._finishDelivery(event.eventId, subscription.id, 'FAILED', message);
                    deliveries.push({ eventId: event.eventId, subscriberId: subscription.id, status: 'FAILED', attempts: delivery.attempts + 1, error: message });
                }
            }
            if (matching.length > 0 && this._allDeliveriesSucceeded(event.eventId, matching)) {
                this.database.prepare('UPDATE events SET processed = 1 WHERE id = ?').run(event.eventId);
            }
        }
        const pendingEvents = this.database.prepare('SELECT COUNT(*) AS count FROM events WHERE processed = 0').get().count;
        return { delivered: deliveries.filter((delivery) => delivery.status === 'SUCCEEDED').length,
            failed: deliveries.filter((delivery) => delivery.status === 'FAILED').length,
            pendingEvents, deliveries };
    }

    _beginDelivery(eventId, subscriberId) {
        this.database.prepare(`
          INSERT OR IGNORE INTO event_deliveries (event_id, subscriber_id, status)
          VALUES (?, ?, 'PENDING')
        `).run(eventId, subscriberId);
        const existing = this.database.prepare(`
          SELECT status, attempts FROM event_deliveries WHERE event_id = ? AND subscriber_id = ?
        `).get(eventId, subscriberId);
        if (existing.status !== 'SUCCEEDED') {
            this.database.prepare(`
              UPDATE event_deliveries SET status = 'PROCESSING', attempts = attempts + 1, error = NULL,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE event_id = ? AND subscriber_id = ?
            `).run(eventId, subscriberId);
        }
        return existing;
    }

    _finishDelivery(eventId, subscriberId, status, error) {
        this.database.prepare(`
          UPDATE event_deliveries SET status = ?, error = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE event_id = ? AND subscriber_id = ?
        `).run(status, error, eventId, subscriberId);
    }

    _allDeliveriesSucceeded(eventId, subscriptions) {
        const read = this.database.prepare(`
          SELECT status FROM event_deliveries WHERE event_id = ? AND subscriber_id = ?
        `);
        return subscriptions.every(({ id }) => read.get(eventId, id)?.status === 'SUCCEEDED');
    }
}

function readEvent(row) {
    let payload;
    try {
        payload = JSON.parse(row.payload ?? '{}');
        return createDomainEvent({ eventId: row.id, type: row.type, aggregateId: row.aggregate_id,
            occurredAt: row.occurred_at || row.created_at, payload });
    }
    catch (cause) {
        throw new DomainInvariantError('invalid-stored-event', `Stored event ${row.id} does not match its contract.`, { cause });
    }
}
