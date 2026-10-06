/** Phase 315 — SQLite rejects malformed timestamps that could bypass expiry comparisons. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 315 — database-level expiration timestamp validation', () => {
    let connection; let database; let memories;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-315', name: 'Org' });
        memories = new MemoryRepository(database);
        memories.create({ id: 'valid-memory-315', scope: 'CEO', organizationId: 'org-315', title: 'Fact', content: 'data' });
    });
    afterEach(() => connection.close());

    it('rejects noncanonical, impossible-date, and timezone-offset timestamps on direct inserts', () => {
        const insert = database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id, expires_at)
          VALUES (?, 'CEO', 'Fact', 'data', 'org-315', ?)`);
        for (const [id, timestamp] of [
            ['short-315', '2026-10-05T00:00:00Z'],
            ['impossible-315', '2026-02-30T00:00:00.000Z'],
            ['offset-315', '2026-10-05T00:00:00.000+01:00'],
        ]) expect(() => insert.run(id, timestamp)).toThrow(/canonical UTC timestamp/);
    });

    it('rejects malformed direct updates and permits clearing an expiry', () => {
        expect(() => database.prepare('UPDATE memories SET expires_at = ? WHERE id = ?')
            .run('not-a-date', 'valid-memory-315')).toThrow(/canonical UTC timestamp/);
        expect(database.prepare('SELECT expires_at FROM memories WHERE id = ?').get('valid-memory-315').expires_at).toBeNull();
        database.prepare('UPDATE memories SET expires_at = NULL WHERE id = ?').run('valid-memory-315');
        expect(memories.getById('valid-memory-315').id).toBe('valid-memory-315');
    });
});
