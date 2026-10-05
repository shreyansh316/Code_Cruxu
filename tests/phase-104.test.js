import { afterEach, describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { AuditLogRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 104 — persisted recent activity', () => {
    let connection;
    let repository;

    afterEach(() => connection?.close());

    function setup() {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        repository = new AuditLogRepository(database);
    }

    it('reads recent append-only audit records in reverse chronological insertion order with a bound', () => {
        setup();
        repository.append({ id: 'audit-104-old', action: 'OBJECTIVE_CREATED', entity: 'objective', entityId: 'objective-104', details: { secret: 'private' } });
        repository.append({ id: 'audit-104-new', action: 'TASK_REVIEWED', entity: 'task', entityId: 'task-104' });

        expect(repository.listRecent({ limit: 1 }).map(({ action }) => action)).toEqual(['TASK_REVIEWED']);
        expect(() => repository.listRecent({ limit: 1001 })).toThrow(/between 1 and 1000/);
    });

    it('exposes only action, entity, and timestamp in the bounded command-center feed', () => {
        setup();
        repository.append({ id: 'audit-104-event', action: 'OBJECTIVE_CREATED', entity: 'objective', entityId: 'objective-104',
            actorId: 'actor-104', details: { secret: 'must not reach the panel' } });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            activity: repository.listRecent({ limit: 20 }), executionStatus: 'RUNNING' });

        expect(snapshot.activity).toHaveLength(1);
        expect(snapshot.activity[0]).toMatchObject({ action: 'OBJECTIVE_CREATED', entity: 'objective' });
        expect(snapshot.activity[0].createdAt).not.toBe('Time unavailable');
        expect(JSON.stringify(snapshot)).not.toContain('audit-104-event');
        expect(JSON.stringify(snapshot)).not.toContain('actor-104');
        expect(JSON.stringify(snapshot)).not.toContain('must not reach the panel');
    });
});
