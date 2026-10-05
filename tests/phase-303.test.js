/** Phase 303 — bound and sanitize durable event payloads and delivery errors. */
import { afterEach, describe, expect, it } from 'vitest';
import { EventType } from '../src/constants';
import { createDomainEvent } from '../src/domain';
import { SqliteConnection, applyMigrations } from '../src/storage';
import { SqliteEventBus } from '../src/infrastructure';

describe('Phase 303 — event persistence sanitation', () => {
    let connection;
    afterEach(() => connection?.close());

    it('redacts nested payload credentials before storing and dispatching events', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const bus = new SqliteEventBus(database);
        const event = createDomainEvent({ eventId: 'event-303', type: EventType.TASK_CREATED,
            aggregateId: 'task-303', occurredAt: '2026-10-05T00:00:00.000Z',
            payload: { token: 'event-secret-value', endpoint: 'https://user:pass-secret@api.example' } });
        expect(bus.append(event).payload.token).toBe('[redacted]');

        let received;
        bus.subscribe({ id: 'reader-303', types: [EventType.TASK_CREATED] }, (value) => { received = value; });
        await bus.dispatchPending();
        expect(JSON.stringify(received)).not.toMatch(/event-secret-value|pass-secret/);
    });

    it('rejects event payloads beyond the fixed byte budget', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const bus = new SqliteEventBus(database);
        expect(() => bus.append(createDomainEvent({ eventId: 'event-large', type: EventType.TASK_CREATED,
            aggregateId: 'task-large', occurredAt: '2026-10-05T00:00:00.000Z', payload: { detail: 'x'.repeat(65 * 1024) } })))
            .toThrow(/payload cannot exceed 65536 bytes/);
    });

    it('redacts credential values from recorded subscriber failure messages', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const bus = new SqliteEventBus(database);
        bus.append(createDomainEvent({ eventId: 'event-fail', type: EventType.TASK_CREATED,
            aggregateId: 'task-fail', occurredAt: '2026-10-05T00:00:00.000Z', payload: {} }));
        bus.subscribe({ id: 'failure-reader', types: [EventType.TASK_CREATED] }, () => {
            throw new Error('provider failed: api_key=handler-secret');
        });
        const result = await bus.dispatchPending();
        expect(result.deliveries[0].error).toBe('provider failed: api_key=[redacted]');
        expect(JSON.stringify(result)).not.toContain('handler-secret');
    });
});
