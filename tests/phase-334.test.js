/** Phase 334 — owner-specific active-memory indexes cover scoped retrieval. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 334 — scoped memory query indexes', () => {
    let connection; let database; let memories;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-334', name: 'Org' });
        memories = new MemoryRepository(database);
        memories.create({ id: 'memory-334', scope: 'CEO', organizationId: 'org-334', title: 'Fact', content: 'Data' });
    });
    afterEach(() => connection.close());

    it('creates partial indexes for each supported memory owner column', () => {
        const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_memories_active_%'").all()
            .map(({ name }) => name).sort();
        expect(indexes).toEqual([
            'idx_memories_active_department', 'idx_memories_active_employee', 'idx_memories_active_objective',
            'idx_memories_active_office', 'idx_memories_active_organization', 'idx_memories_active_project', 'idx_memories_active_task',
        ]);
    });

    it('supports active owner filtering and stable ordering through the matching index', () => {
        const plan = database.prepare(`EXPLAIN QUERY PLAN SELECT id FROM memories INDEXED BY idx_memories_active_organization
          WHERE scope = ? AND organization_id = ? AND invalidated_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at, id LIMIT ?`)
            .all('CEO', 'org-334', new Date().toISOString(), 100);
        expect(plan.some(({ detail }) => detail.includes('idx_memories_active_organization'))).toBe(true);
        expect(memories.listByOwner('CEO', 'org-334').map(({ id }) => id)).toEqual(['memory-334']);
    });
});
