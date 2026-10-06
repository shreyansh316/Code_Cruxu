/** Phase 310 — persisted agent/objective tenant ownership cannot be rewritten. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRepository, ObjectiveRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 310 — organization owner immutability', () => {
    let connection; let database; let agents; let objectives;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-310-a', name: 'A' }); organizations.create({ id: 'org-310-b', name: 'B' });
        agents = new AgentRepository(database); objectives = new ObjectiveRepository(database);
        agents.create({ id: 'ceo-310', organizationId: 'org-310-a', name: 'CEO', role: 'CEO', status: 'IDLE' });
        objectives.create({ id: 'objective-310', organizationId: 'org-310-a', title: 'Scope', description: 'Tenant-owned' });
        objectives.create({ id: 'legacy-objective-310', title: 'Legacy', description: 'Initially unassigned' });
    });
    afterEach(() => connection.close());

    it('blocks direct SQL reassignment of an agent and objective', () => {
        expect(() => database.prepare('UPDATE agents SET organization_id = ? WHERE id = ?').run('org-310-b', 'ceo-310'))
            .toThrow(/agent organization ownership is immutable/);
        expect(() => database.prepare('UPDATE objectives SET organization_id = ? WHERE id = ?').run('org-310-b', 'objective-310'))
            .toThrow(/objective organization ownership is immutable/);
        expect(agents.getById('ceo-310').organizationId).toBe('org-310-a');
        expect(objectives.getById('objective-310').organizationId).toBe('org-310-a');
    });

    it('allows a legacy unassigned objective one initial tenant assignment and then locks it', () => {
        expect(objectives.update('legacy-objective-310', { organizationId: 'org-310-b' }).organizationId).toBe('org-310-b');
        expect(() => database.prepare('UPDATE objectives SET organization_id = ? WHERE id = ?').run('org-310-a', 'legacy-objective-310'))
            .toThrow(/objective organization ownership is immutable/);
    });
});
