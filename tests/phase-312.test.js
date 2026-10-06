/** Phase 312 — bounded retention physically removes explicit memory expirations. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteConnection, applyMigrations } from '../src/storage';
import { runDataRetention } from '../src/storage/DataRetention';

describe('Phase 312 — expiration-aware retention', () => {
    let connection; let database;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-312', 'Org')").run();
        database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id, created_at, expires_at)
          VALUES ('expired-a-312', 'CEO', 'Expired A', 'private', 'org-312', '2026-10-03T23:00:00.000Z', '2026-10-03T23:59:00.000Z'),
                 ('expired-b-312', 'CEO', 'Expired B', 'private', 'org-312', '2026-10-03T23:01:00.000Z', '2026-10-03T23:59:00.000Z'),
                 ('live-312', 'CEO', 'Live', 'keep', 'org-312', '2026-10-03T23:02:00.000Z', '2026-10-05T00:00:00.000Z')`).run();
    });
    afterEach(() => connection.close());

    it('cleans expired rows in bounded batches even when age-based memory retention is disabled', () => {
        let id = 0;
        const retain = () => runDataRetention({ database, policy: { memory: null, usage: null, audit: null },
            now: new Date('2026-10-04T00:00:00.000Z'), batchSize: 1, idFactory: () => `retention-312-${++id}` });
        expect(retain().deleted.memory).toBe(1);
        expect(retain().deleted.memory).toBe(1);
        expect(retain().deleted.memory).toBe(0);
        expect(database.prepare('SELECT id FROM memories ORDER BY id').all()).toEqual([{ id: 'live-312' }]);
    });
});
