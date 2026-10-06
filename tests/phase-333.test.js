/** Phase 333 — bounded retention purges invalidated memory tombstones. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteConnection, applyMigrations } from '../src/storage';
import { runDataRetention } from '../src/storage/DataRetention';

describe('Phase 333 — invalidated-memory retention', () => {
    let connection; let database;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-333', 'Org')").run();
        database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id, invalidated_at)
          VALUES ('tombstone-333-a', 'CEO', 'Invalidated A', 'private', 'org-333', '2026-10-05T00:00:00.000Z'),
                 ('tombstone-333-b', 'CEO', 'Invalidated B', 'private', 'org-333', '2026-10-05T00:00:00.000Z'),
                 ('active-333', 'CEO', 'Active', 'keep', 'org-333', NULL)`).run();
    });
    afterEach(() => connection.close());

    it('purges tombstones in configured batch bounds even with memory age retention disabled', () => {
        let runId = 0;
        const retain = () => runDataRetention({ database, policy: { memory: null, usage: null, audit: null },
            now: new Date('2026-10-06T00:00:00.000Z'), batchSize: 1, idFactory: () => `retention-333-${++runId}` });
        expect(retain().deleted.memory).toBe(1);
        expect(retain().deleted.memory).toBe(1);
        expect(retain().deleted.memory).toBe(0);
        expect(database.prepare('SELECT id FROM memories').all()).toEqual([{ id: 'active-333' }]);
    });
});
