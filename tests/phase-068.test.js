import { describe, expect, it } from 'vitest';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { applyMigrations } from '../src/storage/migrations';
import { runDataRetention } from '../src/storage/DataRetention';

function createDatabase() {
    const connection = new SqliteConnection();
    const database = connection.open(':memory:');
    applyMigrations(database);
    return { connection, database };
}

describe('Phase 068 — data retention', () => {
    it('deletes expired scoped memories, usage, and audit rows in a bounded batch and records counts', () => {
        const { connection, database } = createDatabase();
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-1', 'Org')").run();
        database.prepare("INSERT INTO offices (id, organization_id, name, slug) VALUES ('office-1', 'org-1', 'Office', 'office')").run();
        database.prepare("INSERT INTO departments (id, office_id, name, slug) VALUES ('department-1', 'office-1', 'Department', 'department')").run();
        database.prepare("INSERT INTO agents (id, name, role, department_id) VALUES ('agent-1', 'Employee', 'EMPLOYEE', 'department-1')").run();
        database.prepare("INSERT INTO tasks (id, task_code, title) VALUES ('task-debug', 'RET-DBG', 'Old debugging session')").run();
        database.prepare(`INSERT INTO debugging_sessions (id, task_id, created_by_agent_id, max_attempts, file_budget,
          command_budget, token_budget, time_budget_ms, started_at, deadline_at, created_at, updated_at)
          VALUES ('debug-old', 'task-debug', 'agent-1', 3, 10, 10, 1000, 60000,
            '2020-01-01T00:00:00.000Z', '2020-01-01T00:01:00.000Z', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`).run();
        database.prepare(`INSERT INTO memories (id, scope, category, title, content, organization_id, created_at)
          VALUES ('old-memory', 'CEO', 'note', 'old', 'private', 'org-1', '2020-01-01T00:00:00.000Z'),
                 ('new-memory', 'CEO', 'note', 'new', 'keep', 'org-1', '2026-10-03T00:00:00.000Z')`).run();
        database.prepare(`INSERT INTO ai_usages (id, model, input_tokens, output_tokens, created_at)
          VALUES ('old-usage', 'model', 1, 1, '2020-01-01T00:00:00.000Z'),
                 ('new-usage', 'model', 1, 1, '2026-10-03T00:00:00.000Z')`).run();
        database.prepare(`INSERT INTO audit_logs (id, action, entity, entity_id, details, created_at)
          VALUES ('old-audit', 'OLD', 'task', 'task-1', '{}', '2020-01-01T00:00:00.000Z'),
                 ('new-audit', 'NEW', 'task', 'task-2', '{}', '2026-10-03T00:00:00.000Z')`).run();
        const result = runDataRetention({ database, policy: { memory: 30, usage: 30, audit: 30, debugging: 30 },
            now: new Date('2026-10-04T00:00:00.000Z'), batchSize: 1, idFactory: () => 'retention-1' });
        expect(result.deleted).toEqual({ memory: 1, usage: 1, audit: 1, debugging: 1 });
        expect(database.prepare('SELECT id FROM memories').all()).toEqual([{ id: 'new-memory' }]);
        expect(database.prepare('SELECT id FROM ai_usages').all()).toEqual([{ id: 'new-usage' }]);
        expect(database.prepare('SELECT id FROM audit_logs').all()).toEqual([{ id: 'new-audit' }]);
        expect(database.prepare('SELECT memory_deleted, usage_deleted, audit_deleted, debugging_deleted FROM retention_runs').get())
            .toEqual({ memory_deleted: 1, usage_deleted: 1, audit_deleted: 1, debugging_deleted: 1 });
        expect(() => database.prepare("DELETE FROM audit_logs WHERE id = 'new-audit'").run()).toThrow(/append-only/);
        connection.close();
    });

    it('does not delete disabled categories and rejects unsafe limits or policies before mutation', () => {
        const { connection, database } = createDatabase();
        database.prepare("INSERT INTO ai_usages (id, model, input_tokens, output_tokens, created_at) VALUES ('old', 'm', 1, 1, '2020-01-01T00:00:00.000Z')").run();
        expect(() => runDataRetention({ database, policy: { usage: 0 }, idFactory: () => 'bad' })).toThrow(/Retention days/);
        expect(() => runDataRetention({ database, policy: { usage: 1 }, batchSize: 1001, idFactory: () => 'bad' })).toThrow(/batch size/);
        const result = runDataRetention({ database, policy: { memory: null, usage: null, audit: null },
            now: new Date('2026-10-04T00:00:00.000Z'), idFactory: () => 'retention-disabled' });
        expect(result.deleted).toEqual({ memory: 0, usage: 0, audit: 0, debugging: 0 });
        expect(database.prepare('SELECT count(*) AS count FROM ai_usages').get().count).toBe(1);
        connection.close();
    });

    it('rolls back all deletions if the durable retention record cannot be written', () => {
        const { connection, database } = createDatabase();
        database.prepare("INSERT INTO ai_usages (id, model, input_tokens, output_tokens, created_at) VALUES ('old', 'm', 1, 1, '2020-01-01T00:00:00.000Z')").run();
        database.prepare("INSERT INTO retention_runs (id, cutoff_at, memory_deleted, usage_deleted, audit_deleted) VALUES ('duplicate', 'x', 0, 0, 0)").run();
        expect(() => runDataRetention({ database, policy: { usage: 1 }, now: new Date('2026-10-04T00:00:00.000Z'),
            idFactory: () => 'duplicate' })).toThrow();
        expect(database.prepare('SELECT count(*) AS count FROM ai_usages').get().count).toBe(1);
        expect(database.prepare('SELECT active FROM retention_state').get().active).toBe(0);
        connection.close();
    });
});
