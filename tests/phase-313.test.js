/** Phase 313 — expired memories are hidden by every repository read surface. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 313 — repository-wide memory expiration', () => {
    let connection; let memories;
    const now = '2026-10-05T00:00:00.000Z';
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-313', name: 'Organization' });
        memories = new MemoryRepository(database);
        memories.create({ id: 'expired-313', scope: 'CEO', organizationId: 'org-313', title: 'Expired', content: 'private', expiresAt: '2026-10-04T23:59:59.999Z' });
        memories.create({ id: 'boundary-313', scope: 'CEO', organizationId: 'org-313', title: 'Boundary', content: 'private', expiresAt: now });
        memories.create({ id: 'live-313', scope: 'CEO', organizationId: 'org-313', title: 'Live', content: 'available', expiresAt: '2026-10-05T00:00:00.001Z' });
    });
    afterEach(() => connection.close());

    it('filters expired and boundary-time rows from list, scope list, and id lookup', () => {
        expect(memories.list({ now }).map(({ id }) => id)).toEqual(['live-313']);
        expect(memories.listByScope('CEO', { now }).map(({ id }) => id)).toEqual(['live-313']);
        expect(memories.getById('expired-313', { now })).toBeUndefined();
        expect(memories.getById('boundary-313', { now })).toBeUndefined();
        expect(memories.getById('live-313', { now }).content).toBe('available');
    });

    it('defaults all general reads to the current UTC instant', () => {
        expect(memories.list()).not.toContainEqual(expect.objectContaining({ id: 'expired-313' }));
        expect(memories.listByScope('CEO')).not.toContainEqual(expect.objectContaining({ id: 'expired-313' }));
        expect(memories.getById('expired-313')).toBeUndefined();
    });
});
