/** Phase 331 — owner-scoped memory invalidation is durable and irreversible. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';
import { SCHEMA_MIGRATIONS } from '../src/storage/migrations';

const INVALIDATED_AT = '2026-10-06T00:00:00.000Z';

describe('Phase 331 — memory invalidation', () => {
    let connection; let database; let memories;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-331', name: 'Org' });
        memories = new MemoryRepository(database);
        memories.create({ id: 'memory-331-a', scope: 'CEO', organizationId: 'org-331', title: 'Fact A', content: 'A' });
        memories.create({ id: 'memory-331-b', scope: 'CEO', organizationId: 'org-331', title: 'Fact B', content: 'B' });
    });
    afterEach(() => connection.close());

    it('invalidates only the matching owner record and hides it from every active read', () => {
        expect(memories.invalidateByOwner('CEO', 'org-331', 'memory-331-a', { invalidatedAt: INVALIDATED_AT })).toBe(true);
        expect(memories.invalidateByOwner('CEO', 'org-other', 'memory-331-b', { invalidatedAt: INVALIDATED_AT })).toBe(false);
        expect(memories.invalidateByOwner('CEO', 'org-331', 'memory-331-a', { invalidatedAt: INVALIDATED_AT })).toBe(false);
        expect(memories.list().map(({ id }) => id)).toEqual(['memory-331-b']);
        expect(memories.listByScope('CEO').map(({ id }) => id)).toEqual(['memory-331-b']);
        expect(memories.getById('memory-331-a')).toBeUndefined();
        expect(memories.listByOwner('CEO', 'org-331').map(({ id }) => id)).toEqual(['memory-331-b']);
        expect(memories.getByOwner('CEO', 'org-331', 'memory-331-a')).toBeUndefined();
    });

    it('enforces canonical, forward-only invalidation timestamps in SQLite', () => {
        expect(() => database.prepare('UPDATE memories SET invalidated_at = ? WHERE id = ?').run('bad', 'memory-331-a'))
            .toThrow(/canonical UTC timestamp/);
        database.prepare('UPDATE memories SET invalidated_at = ? WHERE id = ?').run(INVALIDATED_AT, 'memory-331-a');
        expect(() => database.prepare('UPDATE memories SET invalidated_at = NULL WHERE id = ?').run('memory-331-a'))
            .toThrow(/irreversible/);
        expect(() => database.prepare('UPDATE memories SET invalidated_at = ? WHERE id = ?')
            .run('2026-10-07T00:00:00.000Z', 'memory-331-a')).toThrow(/irreversible/);
    });

    it('migrates v20 databases without changing existing memory records', () => {
        const older = new SqliteConnection();
        try {
            const oldDb = older.open(':memory:'); applyMigrations(oldDb, SCHEMA_MIGRATIONS.slice(0, 20));
            oldDb.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-331-old', 'Old');
            oldDb.prepare(`INSERT INTO memories (id, scope, title, content, organization_id)
              VALUES ('memory-331-old', 'CEO', 'Preserved', 'Content', 'org-331-old')`).run();
            expect(applyMigrations(oldDb)).toBe(30);
            expect(new MemoryRepository(oldDb).getById('memory-331-old').content).toBe('Content');
            expect(oldDb.pragma('foreign_key_check')).toEqual([]);
        } finally { older.close(); }
    });
});
