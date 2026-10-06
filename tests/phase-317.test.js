/** Phase 317 — add employee-owned memory without widening other memory scopes. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleBoundedAgentContext } from '../src/application/contextAssembly';
import { AgentRepository, MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';
import { SCHEMA_MIGRATIONS } from '../src/storage/migrations';

const NOW = '2026-10-06T00:00:00.000Z';

describe('Phase 317 — employee memory ownership and migration', () => {
    let connection; let database; let organizations; let agents; let memories;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-317', name: 'Org' });
        agents = new AgentRepository(database);
        agents.create({ id: 'employee-317-a', organizationId: 'org-317', name: 'Employee A', role: 'EMPLOYEE' });
        agents.create({ id: 'employee-317-b', organizationId: 'org-317', name: 'Employee B', role: 'EMPLOYEE' });
        memories = new MemoryRepository(database);
    });
    afterEach(() => connection.close());

    it('retrieves employee-scoped facts only for the owning employee', () => {
        memories.create({ id: 'memory-317-a', scope: 'EMPLOYEE', agentId: 'employee-317-a', title: 'Test convention', content: 'Run focused tests first.' });
        memories.create({ id: 'memory-317-b', scope: 'EMPLOYEE', agentId: 'employee-317-b', title: 'Private note', content: 'Only B may read this.' });
        expect(memories.listByOwner('EMPLOYEE', 'employee-317-a').map(({ id }) => id)).toEqual(['memory-317-a']);
        const context = assembleBoundedAgentContext({ memoryRepository: memories,
            authorize: ({ actor, scope, ownerId }) => actor.id === ownerId && scope === 'EMPLOYEE' }, {
            actor: { id: 'employee-317-a', role: 'EMPLOYEE' }, scope: 'EMPLOYEE', ownerId: 'employee-317-a', now: NOW,
        });
        expect(context.items.map(({ id }) => id)).toEqual(['memory-317-a']);
        expect(() => assembleBoundedAgentContext({ memoryRepository: memories, authorize: () => false }, {
            actor: { id: 'employee-317-a', role: 'EMPLOYEE' }, scope: 'EMPLOYEE', ownerId: 'employee-317-b', now: NOW,
        })).toThrow(/not authorized/);
    });

    it('enforces the employee owner at SQLite and cascades memories when the agent is deleted', () => {
        expect(() => database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id)
          VALUES ('invalid-owner-317', 'EMPLOYEE', 'Invalid', 'data', 'org-317')`).run()).toThrow(/owner mismatch/);
        memories.create({ id: 'memory-delete-317', scope: 'EMPLOYEE', agentId: 'employee-317-a', title: 'Note', content: 'private' });
        agents.delete('employee-317-a');
        expect(memories.getById('memory-delete-317')).toBeUndefined();
    });

    it('preserves existing memories when migrating a version 18 database', () => {
        const older = new SqliteConnection();
        try {
            const oldDatabase = older.open(':memory:');
            applyMigrations(oldDatabase, SCHEMA_MIGRATIONS.slice(0, 18));
            oldDatabase.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-317-old', 'Old');
            oldDatabase.prepare(`INSERT INTO memories (id, scope, title, content, organization_id)
              VALUES (?, 'CEO', ?, ?, ?)`)
                .run('memory-317-old', 'Kept', 'Existing row', 'org-317-old');
            expect(applyMigrations(oldDatabase)).toBe(30);
            expect(new MemoryRepository(oldDatabase).getById('memory-317-old').content).toBe('Existing row');
            expect(oldDatabase.pragma('foreign_key_check')).toEqual([]);
        } finally { older.close(); }
    });
});
