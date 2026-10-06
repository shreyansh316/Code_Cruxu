/** Phase 307 — memory expiration is enforced by retrieval and bounded cleanup. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleBoundedAgentContext } from '../src/application/contextAssembly';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';
const NOW = '2026-10-05T00:00:00.000Z';
describe('Phase 307 — memory expiration lifecycle', () => {
    let connection; let memories;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-307', name: 'Organization' });
        memories = new MemoryRepository(database);
    });
    afterEach(() => connection.close());
    const memory = (id, expiresAt = null) => ({ id, scope: 'CEO', organizationId: 'org-307', title: id, content: `Content ${id}`, importance: 1,
        verified: 1, sourceKind: 'TEST_RESULT', sourceReference: `test:${id}`, verifiedByAgentId: 'agent-reviewer',
        verifiedAt: '2026-10-05T00:00:00.000Z', expiresAt });
    it('filters expired entries at owner and AI context reads', () => {
        memories.create(memory('expired-307', '2026-10-04T23:59:59.999Z'));
        memories.create(memory('live-307', '2026-10-05T00:00:00.001Z'));
        memories.create(memory('permanent-307'));
        expect(memories.listByOwner('CEO', 'org-307', { now: NOW }).map(({ id }) => id)).toEqual(['live-307', 'permanent-307']);
        const context = assembleBoundedAgentContext({ memoryRepository: memories, authorize: () => true }, {
            actor: { id: 'ceo-307', role: 'CEO' }, scope: 'CEO', ownerId: 'org-307', now: NOW,
        });
        expect(context.items.map(({ id }) => id)).toEqual(['live-307', 'permanent-307']);
        expect(memories.getByOwner('CEO', 'org-307', 'expired-307', { now: NOW })).toBeUndefined();
    });
    it('deletes expired entries in bounded, repeatable batches', () => {
        for (let i = 0; i < 4; i += 1) memories.create(memory(`expired-${i}`, '2026-10-04T00:00:00.000Z'));
        expect(memories.deleteExpired({ now: NOW, limit: 2 })).toBe(2);
        expect(memories.deleteExpired({ now: NOW, limit: 2 })).toBe(2);
        expect(memories.deleteExpired({ now: NOW, limit: 2 })).toBe(0);
        expect(memories.list()).toEqual([]);
        expect(() => memories.deleteExpired({ now: NOW, limit: 1001 })).toThrow(/batch size/);
    });
    it('rejects malformed expiration timestamps before insertion', () => {
        expect(() => memories.create(memory('invalid-307', 'tomorrow'))).toThrow(/canonical UTC timestamp/);
        expect(memories.list()).toEqual([]);
    });
});
