/** Phase 025 — persistent ordered event recording and dispatch. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventType } from '../src/constants';
import { createDomainEvent, createEntityId } from '../src/domain';
import { SqliteEventBus } from '../src/infrastructure';
import { applyMigrations, SCHEMA_MIGRATIONS, SqliteConnection } from '../src/storage';

describe('Phase 025 — SQLite event bus', () => {
    const extraConnections = [];
    let connection;
    let database;
    let bus;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        bus = new SqliteEventBus(database);
    });
    afterEach(() => {
        connection.close();
        for (const extra of extraConnections.splice(0)) extra.close();
    });

    const event = (id, payload = { taskId: 'task-1' }) => createDomainEvent({
        eventId: createEntityId(id), type: EventType.TASK_CREATED, aggregateId: createEntityId('task-1'),
        occurredAt: '2026-10-03T12:00:00.000Z', payload,
    });

    it('records versioned events durably and dispatches in insertion order', async () => {
        bus.append(event('event-a'));
        bus.append(event('event-b'));
        const received = [];
        bus.subscribe({ id: 'task-handler', types: [EventType.TASK_CREATED] }, async (value) => received.push(value.eventId));
        const report = await bus.dispatchPending();
        expect(received).toEqual(['event-a', 'event-b']);
        expect(report).toMatchObject({ delivered: 2, failed: 0, pendingEvents: 0 });
        expect(database.prepare('SELECT event_version, aggregate_id, processed FROM events ORDER BY rowid').all())
            .toEqual([
                { event_version: 1, aggregate_id: 'task-1', processed: 1 },
                { event_version: 1, aggregate_id: 'task-1', processed: 1 },
            ]);
    });

    it('records handler failures and retries only unsuccessful deliveries', async () => {
        bus.append(event('event-retry'));
        let fail = true;
        const flaky = vi.fn(async () => {
            if (fail) throw new Error('temporary handler failure');
        });
        const reliable = vi.fn();
        bus.subscribe({ id: 'flaky', types: [EventType.TASK_CREATED] }, flaky);
        bus.subscribe({ id: 'reliable', types: [EventType.TASK_CREATED] }, reliable);
        const first = await bus.dispatchPending();
        expect(first).toMatchObject({ failed: 1, pendingEvents: 1 });
        expect(first.deliveries[0]).toMatchObject({ status: 'FAILED', attempts: 1, error: 'temporary handler failure' });
        expect(database.prepare('SELECT processed FROM events WHERE id = ?').get('event-retry')).toEqual({ processed: 0 });
        fail = false;
        const second = await bus.dispatchPending();
        expect(second).toMatchObject({ failed: 0, pendingEvents: 0 });
        expect(flaky).toHaveBeenCalledTimes(2);
        expect(reliable).toHaveBeenCalledTimes(1);
        expect(database.prepare('SELECT status, attempts FROM event_deliveries WHERE event_id = ? ORDER BY subscriber_id')
            .all('event-retry')).toEqual([
            { status: 'SUCCEEDED', attempts: 2 },
            { status: 'SUCCEEDED', attempts: 1 },
        ]);
    });

    it('keeps events pending without a matching explicit subscription', async () => {
        bus.append(event('event-pending'));
        bus.subscribe({ id: 'different-type', types: [EventType.OBJECTIVE_CREATED] }, () => undefined);
        expect(await bus.dispatchPending()).toMatchObject({ delivered: 0, pendingEvents: 1 });
    });

    it('preserves and dispatches pre-migration events with backfilled metadata', async () => {
        const legacyConnection = new SqliteConnection();
        extraConnections.push(legacyConnection);
        const legacyDatabase = legacyConnection.open(':memory:');
        applyMigrations(legacyDatabase, [SCHEMA_MIGRATIONS[0]]);
        legacyDatabase.prepare('INSERT INTO events (id, type, payload, created_at) VALUES (?, ?, ?, ?)')
            .run('legacy-event', EventType.TASK_CREATED, JSON.stringify({ taskId: 'task-legacy' }), '2026-01-02T03:04:05.000Z');
        applyMigrations(legacyDatabase);
        const legacyBus = new SqliteEventBus(legacyDatabase);
        const handler = vi.fn();
        legacyBus.subscribe({ id: 'legacy-reader', types: [EventType.TASK_CREATED] }, handler);
        expect(await legacyBus.dispatchPending()).toMatchObject({ delivered: 1, pendingEvents: 0 });
        expect(handler.mock.calls[0][0]).toMatchObject({
            eventId: 'legacy-event', aggregateId: 'legacy-event', occurredAt: '2026-01-02T03:04:05.000Z',
        });
    });

    it('rejects duplicate subscriptions and invalid dispatch limits', async () => {
        const subscription = { id: 'one', types: [EventType.TASK_CREATED] };
        bus.subscribe(subscription, () => undefined);
        expect(() => bus.subscribe(subscription, () => undefined)).toThrow();
        await expect(bus.dispatchPending({ limit: 501 })).rejects.toThrow();
    });
});
