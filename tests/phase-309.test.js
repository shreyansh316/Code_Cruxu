/** Phase 309 — persisted memory ownership cannot be transferred across tenants. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 309 — immutable memory ownership', () => {
    let connection;
    let database;
    let memories;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-309-a', name: 'A' });
        organizations.create({ id: 'org-309-b', name: 'B' });
        memories = new MemoryRepository(database);
        memories.create({ id: 'memory-309', scope: 'CEO', organizationId: 'org-309-a', title: 'Fact', content: 'Owned by A', importance: 2 });
    });
    afterEach(() => connection.close());

    it('rejects owner and scope changes through repository updates while allowing content edits', () => {
        expect(() => memories.update('memory-309', { organizationId: 'org-309-b' })).toThrow(/ownership cannot be changed/);
        expect(() => memories.update('memory-309', { scope: 'DIRECTOR' })).toThrow(/ownership cannot be changed/);
        expect(memories.update('memory-309', { content: 'Updated evidence' }).content).toBe('Updated evidence');
    });

    it('enforces owner immutability for direct SQLite writes', () => {
        expect(() => database.prepare('UPDATE memories SET organization_id = ? WHERE id = ?').run('org-309-b', 'memory-309'))
            .toThrow(/ownership is immutable/);
        expect(memories.getByOwner('CEO', 'org-309-a', 'memory-309').content).toBe('Owned by A');
    });
});
