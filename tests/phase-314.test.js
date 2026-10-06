/** Phase 314 — SQLite enforces memory scope/owner shape for direct writes. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 314 — database-level memory owner shape', () => {
    let connection; let database; let memories;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-314', name: 'Org' });
        memories = new MemoryRepository(database);
    });
    afterEach(() => connection.close());

    it('rejects invalid owner shape even when bypassing repository validation', () => {
        expect(() => database.prepare(`INSERT INTO memories (id, scope, title, content)
          VALUES ('ownerless-ceo-314', 'CEO', 'Bad', 'data')`).run()).toThrow(/memory scope owner mismatch/);
        expect(() => database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id, project_id)
          VALUES ('bad-decision-314', 'DECISION', 'Bad', 'data', 'org-314', 'missing-project')`).run()).toThrow(/memory scope owner mismatch/);
        expect(() => database.prepare(`INSERT INTO memories (id, scope, title, content)
          VALUES ('ownerless-knowledge-314', 'KNOWLEDGE', 'Bad', 'data')`).run()).toThrow(/memory scope owner mismatch/);
    });

    it('continues to accept repository-validated scope owners', () => {
        const created = memories.create({ id: 'valid-memory-314', scope: 'CEO', organizationId: 'org-314', title: 'Fact', content: 'evidence' });
        expect(created.organizationId).toBe('org-314');
        expect(memories.getById(created.id).id).toBe(created.id);
    });
});
