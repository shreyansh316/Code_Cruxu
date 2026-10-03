import { describe, expect, it } from 'vitest';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage/migrations';
import { diagnoseDatabaseIntegrity } from '../src/storage/DatabaseIntegrity';

describe('Phase 069 — database integrity diagnostics', () => {
    it('reports healthy integrity and migration state without mutation', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const before = database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count;
        expect(diagnoseDatabaseIntegrity(database)).toMatchObject({ status: 'HEALTHY', repaired: false,
            integrity: 'ok', foreignKeyViolations: 0, schemaVersion: SCHEMA_MIGRATIONS.at(-1).version, issues: [] });
        expect(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count).toBe(before);
        connection.close();
    });

    it('returns bounded actionable foreign-key diagnostics without claiming repair', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.pragma('foreign_keys = OFF');
        database.prepare(`INSERT INTO ai_usages (id, agent_id, model, input_tokens, output_tokens)
          VALUES ('broken-usage', 'missing-agent', 'model', 1, 1)`).run();
        database.pragma('foreign_keys = ON');
        expect(diagnoseDatabaseIntegrity(database)).toMatchObject({ status: 'DEGRADED', repaired: false,
            integrity: 'ok', foreignKeyViolations: 1,
            issues: [expect.objectContaining({ code: 'foreign-key-violations', details: [expect.objectContaining({ table: 'ai_usages', parent: 'agents' })] })] });
        expect(database.prepare("SELECT agent_id FROM ai_usages WHERE id = 'broken-usage'").get().agent_id).toBe('missing-agent');
        connection.close();
    });

    it('returns unavailable rather than a false healthy result when checks fail', () => {
        expect(diagnoseDatabaseIntegrity({ prepare() { throw new Error('sensitive database path'); }, pragma() { throw new Error('sensitive database path'); } }))
            .toMatchObject({ status: 'UNAVAILABLE', repaired: false, issues: [expect.objectContaining({ code: 'database-diagnostics-failed' })] });
    });
});
